const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');
const calcularNotaTSMD = require('../../utils/calculoNota');
const { logAction, attachActor } = require('../../utils/audit');
const crypto = require('crypto');
const QRCode = require('qrcode');

const {
  PDFDocument: PDFLibDocument,
  StandardFonts,
  rgb
} = require('pdf-lib');

const DocumentoVerificavel = require('../../models/DocumentoVerificavel');
const {
  obterIdentidadeInstitucional
} = require('../../utils/documentos/identidadeInstitucional');

const {
  desenharCabecalhoPdf,
  desenharRodapePdf
} = require('../../utils/documentos/cabecalhoPdf');

function getInstituicao(req) {
  return (
    req.usuario?.instituicao ||
    req.usuario?.tenantId ||
    req.tenantId ||
    req.instituicaoId ||
    null
  );
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit][ficha-pdf] falha ao gravar log:', e?.message || e);
  }
}

function buildForcedReq(req) {
  return {
    ...req,
    actor: req.actor || {
      id: req.usuario?.id || req.usuario?._id || null,
      nome: req.usuario?.nome || null,
      tipo: req.usuario?.tipo || null,
      email: req.usuario?.email || null,
      instituicao: req.usuario?.instituicao || req.usuario?.tenantId || getInstituicao(req) || null
    }
  };
}

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function gerarHashFichaAluno({ aluno, instituicao, totalNotificacoes, notaAtual }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      tipo: 'ficha_comportamental_aluno',
      alunoId: String(aluno._id),
      alunoNome: aluno.nome || '',
      turma: aluno.turma || '',
      instituicao: String(instituicao),
      totalNotificacoes,
      notaAtual,
      geradoEm: new Date().toISOString()
    }))
    .digest('hex');
}

async function registrarDocumentoFichaAluno({
  req,
  aluno,
  instituicao,
  caminho,
  hash,
  notaAtual,
  totalNotificacoes
}) {
  const urlValidacao =
    `${getBaseUrl(req)}/verificar-documento.html?hash=${hash}`;

  await DocumentoVerificavel.findOneAndUpdate(
    { hash },
    {
      $set: {
        tipo: 'ficha_comportamental_aluno',
        titulo: 'Ficha Comportamental Individual do Aluno',
        hash,
        aluno: aluno._id,
        alunoNome: aluno.nome || '',
        alunoTurma: aluno.turma || '',
        caminhoLocal: caminho,
        urlValidacao,
        instituicao,
        tenantId: instituicao,
        geradoPor: req.actor?.nome || req.usuario?.nome || 'Sistema',
        metadados: {
  notaAtual,
  totalNotificacoes,
  assinadoPor: req.actor?.nome || req.usuario?.nome || 'Sistema',
  cargo: req.usuario?.cargo || req.usuario?.funcao || req.usuario?.tipo || 'Usuário institucional',
  assinadoEm: new Date()
}
      }
    },
    {
      upsert: true,
      new: true
    }
  );

  return urlValidacao;
}

async function inserirQrAutenticidadeFichaNoPdf({
  pdfPath,
  hash,
  urlValidacao,
  assinadoPor = 'Sistema',
  cargo = 'Usuário institucional',
  identidadeInstitucional = {}
}) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return;

  const qrPath = pdfPath.replace(/\.pdf$/i, '_qrcode.png');

  await QRCode.toFile(qrPath, urlValidacao, {
    width: 300,
    margin: 2
  });

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFLibDocument.load(pdfBytes);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const qrBytes = fs.readFileSync(qrPath);
  const qrImage = await pdfDoc.embedPng(qrBytes);

  const pages = pdfDoc.getPages();
  const totalPaginas = pages.length;

  pages.forEach((page, index) => {
  const pageWidth = page.getWidth();

  page.drawText(
    `Página ${index + 1} de ${totalPaginas}`,
    {
      x: pageWidth / 2 - 45,
      y: 16,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35)
    }
  );

  page.drawText(
    'Axoriin • Documento institucional verificável',
    {
      x: 40,
      y: 16,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45)
    }
  );

  const rodapeInstitucional = String(
    identidadeInstitucional?.rodapePadrao || ''
  ).trim();

  if (
    identidadeInstitucional?.mostrarRodape !== false &&
    rodapeInstitucional
  ) {
    page.drawLine({
      start: { x: 40, y: 42 },
      end: { x: pageWidth - 40, y: 42 },
      thickness: 0.5,
      color: rgb(0.72, 0.72, 0.72)
    });

    page.drawText(
      rodapeInstitucional.length > 135
        ? rodapeInstitucional.slice(0, 132) + '...'
        : rodapeInstitucional,
      {
        x: 40,
        y: 31,
        size: 6,
        font,
        color: rgb(0.35, 0.35, 0.35)
      }
    );
  }
});

  const ultimaPagina = pages[pages.length - 1];

  ultimaPagina.drawRectangle({
    x: 40,
    y: 48,
    width: ultimaPagina.getWidth() - 80,
    height: 72,
    color: rgb(0.94, 0.97, 1)
  });

ultimaPagina.drawRectangle({
  x: 40,
  y: 126,
  width: ultimaPagina.getWidth() - 80,
  height: 42,
  color: rgb(0.06, 0.12, 0.22)
});

ultimaPagina.drawText(
  'DOCUMENTO OFICIAL INSTITUCIONAL',
  {
    x: 55,
    y: 142,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1)
  }
);

  ultimaPagina.drawText('DOCUMENTO VERIFICÁVEL DIGITALMENTE', {
    x: 52,
    y: 102,
    size: 9,
    font: fontBold,
    color: rgb(0.05, 0.12, 0.20)
  });

  ultimaPagina.drawText(
  `Hash SHA-256 documental: ${hash}`,
  {
    x: 52,
    y: 84,
    size: 6,
    font,
    color: rgb(0.20, 0.25, 0.32)
  }
);

ultimaPagina.drawText(
  `Emitido em: ${new Date().toLocaleString('pt-BR')}`,
  {
    x: 52,
    y: 72,
    size: 7,
    font,
    color: rgb(0.20, 0.25, 0.32)
  }
);
ultimaPagina.drawText(
  `Assinado eletronicamente por: ${assinadoPor}`,
  {
    x: 52,
    y: 58,
    size: 7,
    font: fontBold,
    color: rgb(0.05, 0.12, 0.20)
  }
);

ultimaPagina.drawText(
  `Cargo/Função: ${cargo}`,
  {
    x: 52,
    y: 48,
    size: 7,
    font,
    color: rgb(0.20, 0.25, 0.32)
  }
);

  const qrSizeFinal = 58;
  const qrXFinal = ultimaPagina.getWidth() - 112;
  const qrYFinal = 56;

  ultimaPagina.drawImage(qrImage, {
    x: qrXFinal,
    y: qrYFinal,
    width: qrSizeFinal,
    height: qrSizeFinal
  });

  ultimaPagina.drawText(
    'Validar documento',
    {
      x: qrXFinal - 2,
      y: qrYFinal - 12,
      size: 7,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  ultimaPagina.drawText('Este documento possui autenticidade digital verificável via QR Code institucional e hash criptográfica SHA-256.', {
    x: 52,
    y: 68,
    size: 7,
    font,
    color: rgb(0.20, 0.25, 0.32)
  });

  const finalBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, finalBytes);
}

router.get('/ficha/verificar-documento/:hash', async (req, res) => {
  try {
    const { hash } = req.params;

    if (!hash || String(hash).length < 20) {
      return res.status(400).json({
        ok: false,
        autenticidade: false,
        message: 'Hash inválido.'
      });
    }

    const documento = await DocumentoVerificavel.findOne({
      hash,
      tipo: 'ficha_comportamental_aluno'
    }).lean();

    if (!documento) {
      return res.status(404).json({
        ok: false,
        autenticidade: false,
        message: 'Documento não encontrado.'
      });
    }

    return res.json({
      ok: true,
      autenticidade: true,
      documento: {
        titulo: documento.titulo,
        tipo: documento.tipo,
        hash: documento.hash,
        geradoEm: documento.createdAt,
        geradoPor: documento.geradoPor,
        metadados: documento.metadados || {}
      },
      aluno: {
        nome: documento.alunoNome || '',
        turma: documento.alunoTurma || ''
      }
    });

  } catch (err) {
    console.error('[FICHA_PDF][VERIFICAR_DOCUMENTO]', err);

    return res.status(500).json({
      ok: false,
      autenticidade: false,
      message: 'Erro ao verificar documento.'
    });
  }
});

// Gera PDF da ficha do aluno com base em ID ou código de acesso
router.get('/ficha/:codigoOuId', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = getInstituicao(req);
    if (!instituicao) {
      return res.status(401).json({ erro: 'Instituição não identificada.' });
    }

    const valor = String(req.params.codigoOuId || '').trim().toUpperCase();
    if (!valor) {
      return res.status(400).json({ erro: 'Código ou ID inválido.' });
    }

    let aluno = null;

    // Se parece ObjectId válido, tenta buscar por _id + instituição
    if (/^[0-9a-fA-F]{24}$/.test(valor) && mongoose.isValidObjectId(valor)) {
      aluno = await Aluno.findOne({
        _id: valor,
        instituicao
      });
    }

    // Se não achou por ID, tenta pelo código de acesso + instituição
    if (!aluno) {
      aluno = await Aluno.findOne({
        codigoAcesso: valor,
        instituicao
      });
    }

    if (!aluno) {
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    const notificacoes = await Notificacao.find({
  aluno: aluno._id,
  instituicao,
  ativo: { $ne: false },
  arquivada: { $ne: true }
})
  .sort({ data: 1, createdAt: 1, _id: 1 })
  .lean();

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: String(instituicao)
    }).sort({ criadoEm: -1, createdAt: -1 });

    const eventosCalculo = (notificacoes || []).map((n) => ({
  data: n.data || null,
  createdAt: n.createdAt || null,
  valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
  quantidadeDias: n.quantidadeDias ?? 1,
  tipoMedida: n.tipoMedida || n.tipo || '',
  natureza: n.natureza || ''
}));

const notaAtual = calcularNotaTSMD(
  aluno.dataEntrada ? new Date(aluno.dataEntrada) : null,
  new Date(),
  eventosCalculo
);

    await safeAudit({
      req: buildForcedReq(req),
      event: 'FICHA_ALUNO_PDF_BAIXADO',
      targetType: 'Aluno',
      targetId: aluno._id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || '',
        totalNotificacoes: notificacoes.length,
        totalObservacoes: observacoes.length
      }
    });

    const doc = new PDFDocument({
  margins: {
    top: 45,
    left: 45,
    right: 45,
    bottom: 110
  },
  size: 'A4',
  bufferPages: true
});

const nomeArquivo = `ficha_aluno_${aluno._id}.pdf`;

const pastaUploads = path.join(__dirname, '../../public/uploads');
fs.mkdirSync(pastaUploads, { recursive: true });

const caminho = path.join(pastaUploads, nomeArquivo);

const stream = fs.createWriteStream(caminho);

doc.pipe(stream);

/* =========================================================
   CABEÇALHO INSTITUCIONAL MULTITENANT
========================================================= */

const identidadeInstitucional = await obterIdentidadeInstitucional(req);
console.log('[DOCX][IDENTIDADE]', {
  orgaoSuperior: identidadeInstitucional?.orgaoSuperior,
  nomeInstituicao: identidadeInstitucional?.nomeInstituicao,
  subtitulo: identidadeInstitucional?.subtitulo,
  rodapePadrao: identidadeInstitucional?.rodapePadrao,
  mostrarRodape: identidadeInstitucional?.mostrarRodape
});

const inicioConteudoY = desenharCabecalhoPdf(
  doc,
  identidadeInstitucional,
  {
    margemEsq: 45,
    margemDir: 45,
    topo: 32,
    imgTam: 58
  }
);

doc.y = inicioConteudoY;

doc
  .fontSize(15)
  .fillColor('#d82327')
  .font('Helvetica-Bold')
  .text('Ficha Comportamental Individual do Aluno', 45, doc.y, {
    align: 'center'
  });

doc.moveDown(1.2);

/* =========================================================
   DADOS DO ALUNO
========================================================= */

doc
  .fontSize(15)
  .fillColor('#d82327')
  .font('Helvetica-Bold')
  .text('1. IDENTIFICAÇÃO DO ALUNO');

doc.moveDown(0.8);

const notaFormatada = Number(notaAtual || 0).toFixed(2);

doc
  .fontSize(11)
  .fillColor('black')
  .font('Helvetica');

doc.text(`Nome Completo: ${aluno.nome || '—'}`);
doc.text(`Turma: ${aluno.turma || '—'}`);
doc.text(`Código de Acesso: ${aluno.codigoAcesso || '—'}`);
doc.text(`Data de Entrada: ${
  aluno.dataEntrada
    ? new Date(aluno.dataEntrada).toLocaleDateString('pt-BR')
    : '—'
}`);

doc.text(`Data de Nascimento: ${
  aluno.nascimento
    ? new Date(aluno.nascimento).toLocaleDateString('pt-BR')
    : '—'
}`);

doc.text(`Responsável (Pai): ${aluno.nomePai || '—'}`);
doc.text(`Responsável (Mãe): ${aluno.nomeMae || '—'}`);
doc.text(`Telefone: ${aluno.telefone || '—'}`);
doc.text(`Endereço: ${aluno.endereco || '—'}`);

doc.moveDown(1.2);

/* =========================================================
   COMPORTAMENTO
========================================================= */

doc
  .fontSize(15)
  .fillColor('#d82327')
  .font('Helvetica-Bold')
  .text('2. SITUAÇÃO COMPORTAMENTAL');

doc.moveDown(0.8);

let classificacao = 'Regular';

if (notaAtual >= 9.01) classificacao = 'Excepcional';
else if (notaAtual >= 8.01) classificacao = 'Ótimo';
else if (notaAtual >= 7.0) classificacao = 'Bom';
else if (notaAtual < 5.0) classificacao = 'Incompatível';

doc
  .fontSize(12)
  .fillColor('black')
  .font('Helvetica-Bold')
  .text(`Nota Atual de Comportamento: ${notaFormatada}`);

doc
  .fontSize(11)
  .font('Helvetica')
  .text(`Classificação: ${classificacao}`);

doc.moveDown(1.2);

/* =========================================================
   OBSERVAÇÕES
========================================================= */

doc
  .fontSize(15)
  .fillColor('#d82327')
  .font('Helvetica-Bold')
  .text('3. OBSERVAÇÕES REGISTRADAS');

doc.moveDown(0.8);

if (!observacoes.length) {
  doc.fontSize(11).fillColor('black').font('Helvetica')
    .text('Nenhuma observação registrada.');
} else {
  observacoes.forEach((obs, index) => {
    const dataObs = obs.criadoEm || obs.createdAt;

    doc.moveDown(0.5);

    doc.fontSize(10).fillColor('#0b1f3a').font('Helvetica-Bold')
  .text(
    `${index + 1}. ${dataObs ? new Date(dataObs).toLocaleDateString('pt-BR') : '—'} - ${obs.autor || 'Não informado'}`,
    45,
    doc.y,
    {
      width: 500
    }
  );

doc.fontSize(10).fillColor('black').font('Helvetica')
  .text(
    obs.texto || '—',
    45,
    doc.y,
    {
      width: 500,
      align: 'justify'
    }
  );

    doc.moveDown(0.6);
    doc.moveTo(45, doc.y)
      .lineTo(550, doc.y)
      .strokeColor('#ddd')
      .lineWidth(0.5)
      .stroke();
  });
}
/* =========================================================
   NOTIFICAÇÕES
========================================================= */

doc.moveDown(0.8);

doc
  .fontSize(15)
  .fillColor('#d82327')
  .font('Helvetica-Bold')
  .text('4. NOTIFICAÇÕES DISCIPLINARES');

doc.moveDown(0.8);

if (!notificacoes.length) {
  doc.fontSize(11).fillColor('black').font('Helvetica')
    .text('Nenhuma notificação disciplinar registrada.');
} else {
  notificacoes.forEach((n, index) => {
    const dataNotif = n.data || n.createdAt;

    doc.moveDown(0.6);

    doc.fontSize(10).fillColor('#7a0000').font('Helvetica-Bold')
  .text(
    `${index + 1}. ${dataNotif ? new Date(dataNotif).toLocaleDateString('pt-BR') : '—'} - ${n.tipoMedida || '—'}`,
    45,
    doc.y,
    {
      width: 500
    }
  );

doc.fontSize(10).fillColor('black').font('Helvetica')
  .text(
    `Motivo: ${n.motivo || '—'}`,
    45,
    doc.y,
    {
      width: 500,
      align: 'justify'
    }
  );

    const valorAplicado = typeof n.valorNumerico === 'number'
  ? n.valorNumerico.toFixed(2)
  : '—';

const notaAntes = typeof n.notaAnterior === 'number'
  ? n.notaAnterior.toFixed(2)
  : '—';

const notaDepois = typeof n.notaAtual === 'number'
  ? n.notaAtual.toFixed(2)
  : '—';

doc.text(`Tipo: ${n.tipo || '—'} | Valor aplicado: ${valorAplicado} | Dias: ${n.quantidadeDias ?? '—'}`);
doc.text(`Nota antes: ${notaAntes} | Nota após: ${notaDepois}`);
doc.text(`Classificação: ${n.classificacaoAnterior || '—'} | ${n.classificacaoAtual || '—'}`);
doc.text(`Artigo: ${n.artigo || '—'} | Inciso: ${n.inciso || '—'}`);
doc.text(`Classificação no regulamento: ${n.classificacaoRegulamento || '—'}`);

    doc.moveDown(0.6);
    doc.moveTo(45, doc.y)
      .lineTo(550, doc.y)
      .strokeColor('#ddd')
      .lineWidth(0.5)
      .stroke();
  });
}


doc.end();

stream.on('finish', async () => {
  try {
    const hashFicha = gerarHashFichaAluno({
      aluno,
      instituicao,
      totalNotificacoes: notificacoes.length,
      notaAtual
    });

    const urlValidacao = await registrarDocumentoFichaAluno({
      req,
      aluno,
      instituicao,
      caminho,
      hash: hashFicha,
      notaAtual,
      totalNotificacoes: notificacoes.length
    });

    await inserirQrAutenticidadeFichaNoPdf({
  pdfPath: caminho,
  hash: hashFicha,
  urlValidacao,
  assinadoPor: req.actor?.nome || req.usuario?.nome || 'Sistema',
  cargo: req.usuario?.cargo || req.usuario?.funcao || req.usuario?.tipo || 'Usuário institucional',
  identidadeInstitucional
});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${nomeArquivo}"`
    );

    return res.sendFile(caminho);

  } catch (err) {
    console.error('[FICHA_PDF][ASSINATURA_QR]', err);

    return res.status(500).json({
      erro: 'Erro ao inserir QR Code de autenticidade na ficha.'
    });
  }
});

  } catch (err) {
    console.error('[FICHA_PDF]', err);

    return res.status(500).json({
      erro: 'Erro ao gerar PDF da ficha do aluno.'
    });
  }
});

module.exports = router;