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
  margin: 45,
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
   LOGO
========================================================= */

const logoPath = path.join(
  __dirname,
  '../../public/uploads/logo-cmdp.png'
);

if (fs.existsSync(logoPath)) {
  doc.image(logoPath, 50, 35, {
    width: 82
  });
}

/* =========================================================
   CABEÇALHO
========================================================= */

doc
  .fontSize(20)
  .fillColor('#0b1f3a')
  .font('Helvetica-Bold')
  .text('COLÉGIO MILITAR DOM PEDRO II', 145, 42);

doc
  .fontSize(11)
  .fillColor('#444')
  .font('Helvetica')
  .text('Ficha Comportamental Individual do Aluno', 145, 68);

doc
  .moveTo(45, 115)
  .lineTo(550, 115)
  .strokeColor('#d82327')
  .lineWidth(2)
  .stroke();

doc.moveDown(4);

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
      .text(`${index + 1}. ${dataObs ? new Date(dataObs).toLocaleDateString('pt-BR') : '—'} - ${obs.autor || 'Não informado'}`);

    doc.fontSize(10).fillColor('black').font('Helvetica')
      .text(obs.texto || '—', {
        width: 500,
        align: 'justify'
      });

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
      .text(`${index + 1}. ${dataNotif ? new Date(dataNotif).toLocaleDateString('pt-BR') : '—'} - ${n.tipoMedida || '—'}`);

    doc.fontSize(10).fillColor('black').font('Helvetica')
      .text(`Motivo: ${n.motivo || '—'}`, {
        width: 500,
        align: 'justify'
      });

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
doc.text(`Nota antes: ${notaAntes} → Nota após: ${notaDepois}`);
doc.text(`Classificação: ${n.classificacaoAnterior || '—'} → ${n.classificacaoAtual || '—'}`);
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

/* =========================================================
   RODAPÉ
========================================================= */

const paginas = doc.bufferedPageRange();

for (let i = 0; i < paginas.count; i++) {

  doc.switchToPage(i);

  doc
    .fontSize(8)
    .fillColor('#666')
    .text(
      `Documento gerado automaticamente pelo Sistema Axoriin em ${new Date().toLocaleString('pt-BR')}`,
      45,
      770,
      {
        align: 'center',
        width: 500
      }
    );

  doc
    .fontSize(8)
    .text(
      `Página ${i + 1} de ${paginas.count}`,
      45,
      785,
      {
        align: 'center',
        width: 500
      }
    );
}

doc.end();

    stream.on('finish', () => {
      res.download(caminho, nomeArquivo, (err) => {
        try {
          if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
        } catch {}

        if (err && !res.headersSent) {
          return res.status(500).send('Erro ao enviar PDF');
        }
      });
    });

    stream.on('error', (err) => {
      console.error('Erro ao gerar stream do PDF:', err);
      if (!res.headersSent) {
        return res.status(500).send('Erro ao gerar ficha do aluno');
      }
    });
  } catch (erro) {
    console.error('Erro ao gerar ficha do aluno:', erro);
    res.status(500).send('Erro ao gerar ficha do aluno');
  }
});

module.exports = router;