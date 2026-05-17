'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const ProcessoDisciplinar = require('../../models/ProcessoDisciplinar');
const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const Counter = require('../../models/Counter');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { logAction, attachActor } = require('../../utils/audit');
const crypto = require('crypto');
const mailer = require('../../utils/mailer');
const bcrypt = require('bcryptjs');
const Usuario = require('../../models/Usuario');

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const {
  PDFDocument,
  StandardFonts,
  rgb
} = require('pdf-lib');
const QRCode = require('qrcode');
const {
  registrarProcessoNoLivro,
  atualizarLivroPorProcesso,
  registrarDocumentoNoLivro,
  registrarArquivamentoNoLivro,
  registrarEncaminhamentoNoLivro,
  registrarCancelamentoNoLivro,
} = require('../../utils/livroOcorrencias');
/* =========================================================
   HELPERS
========================================================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);

  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);

  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function isObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

async function safeLogAction(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit] erro ao gravar log:', e?.message || e);
  }
}

async function getNextNumeroProcesso(instituicao) {
  const ano = new Date().getFullYear();
  const chave = `processo_disciplinar:${instituicao}:${ano}`;

  const counter = await Counter.findOneAndUpdate(
    { chave },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        chave,
        instituicao,
        tenantId: instituicao
      }
    },
    {
      new: true,
      upsert: true
    }
  );

  const seq = String(counter.seq || 1).padStart(4, '0');
  return `PD-${seq}/${ano}`;
}

function ordenarDocumentosDossie(documentos = []) {
  return [...documentos].sort((a, b) => {
    const ordemA =
      Number.isFinite(Number(a?.ordem))
        ? Number(a.ordem)
        : 999;

    const ordemB =
      Number.isFinite(Number(b?.ordem))
        ? Number(b.ordem)
        : 999;

    if (ordemA !== ordemB) {
      return ordemA - ordemB;
    }

    return (
      new Date(a?.geradoEm || 0) -
      new Date(b?.geradoEm || 0)
    );
  });
}

function getLibreOfficePath() {
  if (process.platform !== 'win32') {
    return 'soffice';
  }

  const paths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return 'soffice';
}

function converterDocxParaPdf(docxPath) {
  return new Promise((resolve, reject) => {
    try {
      const outputDir = path.dirname(docxPath);
      const soffice = getLibreOfficePath();

      const processo = spawn(
        soffice,
        [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          outputDir,
          docxPath
        ]
      );

      let stderr = '';

      processo.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      processo.on('close', (code) => {
        if (code !== 0) {
          return reject(
            new Error(stderr || 'Erro na conversão PDF')
          );
        }

        const pdfPath =
          docxPath.replace(/\.docx$/i, '.pdf');

        if (!fs.existsSync(pdfPath)) {
          return reject(
            new Error('PDF não foi gerado.')
          );
        }

        resolve(pdfPath);
      });

    } catch (err) {
      reject(err);
    }
  });
}

async function unirPdfs(pdfPaths, outputFinal) {
  const pdfFinal = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const bytes = fs.readFileSync(pdfPath);
    const pdf = await PDFDocument.load(bytes);

    const paginas = await pdfFinal.copyPages(
      pdf,
      pdf.getPageIndices()
    );

    paginas.forEach((p) => {
      pdfFinal.addPage(p);
    });
  }

  const finalBytes = await pdfFinal.save();
  fs.writeFileSync(outputFinal, finalBytes);

  return outputFinal;
}

async function inserirAssinaturasNoPdf(pdfPath, processo) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return;

  const assinaturas =
    Array.isArray(processo.assinaturas)
      ? processo.assinaturas
      : [];

  if (!assinaturas.length) return;

  const pdfBytes =
    fs.readFileSync(pdfPath);

  const pdfDoc =
    await PDFDocument.load(pdfBytes);

  const font =
    await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontBold =
    await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page =
    pdfDoc.addPage([595, 842]);

  const { height } =
    page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - 120,
    width: 595,
    height: 120,
    color: rgb(0.06, 0.12, 0.22)
  });

  page.drawText(
    'ASSINATURAS ELETRONICAS INSTITUCIONAIS',
    {
      x: 50,
      y: height - 62,
      size: 18,
      font: fontBold,
      color: rgb(1, 1, 1)
    }
  );

  page.drawText(
    `Procedimento: ${processo.numeroProcesso || '-'}`,
    {
      x: 50,
      y: height - 88,
      size: 11,
      font,
      color: rgb(0.85, 0.90, 1)
    }
  );

  let y = height - 160;

  assinaturas.forEach((a, index) => {
    if (y < 90) return;

    page.drawRectangle({
      x: 45,
      y: y - 78,
      width: 505,
      height: 88,
      color: rgb(0.94, 0.97, 1)
    });

    page.drawText(
      `${index + 1}. DOCUMENTO ASSINADO ELETRONICAMENTE`,
      {
        x: 60,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0.05, 0.12, 0.20)
      }
    );

    page.drawText(
      `Documento: ${a.documentoTipo || 'Processo/Dossie'}`,
      {
        x: 60,
        y: y - 16,
        size: 8,
        font,
        color: rgb(0.05, 0.12, 0.20)
      }
    );

    page.drawText(
      `Assinado por: ${a.assinadoPorNome || '-'}`,
      {
        x: 60,
        y: y - 30,
        size: 8,
        font,
        color: rgb(0.05, 0.12, 0.20)
      }
    );

    page.drawText(
      `Cargo/Função: ${a.cargo || '-'}`,
      {
        x: 60,
        y: y - 44,
        size: 8,
        font,
        color: rgb(0.05, 0.12, 0.20)
      }
    );

    page.drawText(
      `Data: ${
        a.assinadoEm
          ? new Date(a.assinadoEm).toLocaleString('pt-BR')
          : '-'
      }`,
      {
        x: 60,
        y: y - 58,
        size: 8,
        font,
        color: rgb(0.05, 0.12, 0.20)
      }
    );

    page.drawText(
      `Hash: ${a.hashAssinatura || '-'}`,
      {
        x: 60,
        y: y - 72,
        size: 6,
        font,
        color: rgb(0.20, 0.25, 0.32)
      }
    );

    y -= 104;
  });

  const finalBytes =
    await pdfDoc.save();

  fs.writeFileSync(pdfPath, finalBytes);
}

async function inserirAssinaturaDocumentoNoPdf(
  pdfPath,
  assinatura,
  documento
) {
  if (!pdfPath || !fs.existsSync(pdfPath)) return;

  if (!assinatura) return;

  const pdfBytes =
    fs.readFileSync(pdfPath);

  const pdfDoc =
    await PDFDocument.load(pdfBytes);

  const font =
    await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontBold =
    await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages =
    pdfDoc.getPages();

  if (!pages.length) return;

  const page =
    pages[pages.length - 1];

  const pageWidth =
    page.getWidth();

  page.drawRectangle({
    x: 40,
    y: 48,
    width: pageWidth - 80,
    height: 72,
    color: rgb(0.94, 0.97, 1)
  });

  page.drawText(
    'DOCUMENTO ASSINADO ELETRONICAMENTE',
    {
      x: 52,
      y: 102,
      size: 9,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  page.drawText(
    `Documento: ${documento?.titulo || documento?.tipo || '-'}`,
    {
      x: 52,
      y: 88,
      size: 7,
      font,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  page.drawText(
    `Assinado por: ${assinatura.assinadoPorNome || '-'}`,
    {
      x: 52,
      y: 76,
      size: 7,
      font,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  page.drawText(
    `Cargo/Função: ${assinatura.cargo || '-'}`,
    {
      x: 52,
      y: 64,
      size: 7,
      font,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  page.drawText(
    assinatura.assinadoEm
      ? `Data: ${new Date(assinatura.assinadoEm).toLocaleString('pt-BR')}`
      : 'Data: -',
    {
      x: 300,
      y: 76,
      size: 7,
      font,
      color: rgb(0.05, 0.12, 0.20)
    }
  );

  page.drawText(
    `Hash assinatura: ${assinatura.hashAssinatura || '-'}`,
    {
      x: 300,
      y: 64,
      size: 5.5,
      font,
      color: rgb(0.20, 0.25, 0.32)
    }
  );

  const finalBytes =
    await pdfDoc.save();

  fs.writeFileSync(pdfPath, finalBytes);
}

async function inserirQrNoPdf(pdfPath, qrPath) {

  if (!pdfPath || !qrPath) return;

  if (!fs.existsSync(pdfPath)) return;

  if (!fs.existsSync(qrPath)) return;

  const pdfBytes =
    fs.readFileSync(pdfPath);

  const pdfDoc =
    await PDFDocument.load(pdfBytes);

  const pages =
    pdfDoc.getPages();

  if (!pages.length) return;

  const totalPaginas =
    pages.length;

  const qrBytes =
    fs.readFileSync(qrPath);

  const qrImage =
    await pdfDoc.embedPng(qrBytes);

  pages.forEach((page, index) => {

    const pageWidth =
      page.getWidth();

    const pageHeight =
      page.getHeight();

    // QR apenas na primeira página
    if (index === 0) {

      const qrSize = 82;

      page.drawImage(qrImage, {
        x: pageWidth - 115,
        y: 42,
        width: qrSize,
        height: qrSize
      });

      page.drawText(
        'Validar documento',
        {
          x: pageWidth - 116,
          y: 28,
          size: 9,
          color: rgb(0, 0, 0)
        }
      );
    }

    // paginação
    page.drawText(
      `Página ${index + 1} de ${totalPaginas}`,
      {
        x: pageWidth / 2 - 45,
        y: 22,
        size: 9,
        color: rgb(0.35, 0.35, 0.35)
      }
    );

    // rodapé institucional
    page.drawText(
      'Axoriin • Sistema Institucional',
      {
        x: 40,
        y: 22,
        size: 8,
        color: rgb(0.45, 0.45, 0.45)
      }
    );
  });

  const finalBytes =
    await pdfDoc.save();

  fs.writeFileSync(
    pdfPath,
    finalBytes
  );
}

async function criarPaginaIndiceDossie({
  outputPath,
  processo,
  documentos = []
}) {
  const pdfDoc = await PDFDocument.create();

  const page = pdfDoc.addPage([595, 842]);

  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - 145,
    width,
    height: 145,
    color: rgb(0.06, 0.12, 0.22)
  });

  page.drawText('COLÉGIO MILITAR DOM PEDRO II', {
    x: 50,
    y: height - 45,
    size: 11,
    color: rgb(0.9, 0.93, 0.98)
  });

  page.drawText('DOSSIÊ DISCIPLINAR', {
    x: 50,
    y: height - 82,
    size: 26,
    color: rgb(1, 1, 1)
  });

  page.drawText(`Procedimento nº ${processo.numeroProcesso || '-'}`, {
    x: 50,
    y: height - 110,
    size: 14,
    color: rgb(0.85, 0.9, 1)
  });

  page.drawText('ÍNDICE DOCUMENTAL', {
    x: 50,
    y: height - 190,
    size: 18,
    color: rgb(0.05, 0.08, 0.12)
  });

  let y = height - 235;

  documentos.forEach((doc, index) => {
    const titulo =
      doc.titulo || doc.tipo || 'Documento';

    page.drawText(`${index + 1}. ${titulo}`, {
      x: 70,
      y,
      size: 13,
      color: rgb(0.08, 0.1, 0.15)
    });

    y -= 28;
  });

  y -= 34;

  page.drawText('Documento institucional validável digitalmente.', {
    x: 50,
    y,
    size: 12,
    color: rgb(0.15, 0.18, 0.25)
  });

  y -= 20;

  page.drawText('Emitido pela plataforma Axoriin.', {
    x: 50,
    y,
    size: 12,
    color: rgb(0.15, 0.18, 0.25)
  });

  page.drawText('A validação deste documento pode ser realizada pelo QR Code constante nesta página.', {
    x: 50,
    y: 80,
    size: 9,
    color: rgb(0.35, 0.38, 0.45)
  });

  const bytes = await pdfDoc.save();

  fs.writeFileSync(outputPath, bytes);

  return outputPath;
}

/* =========================================================
   ESTATÍSTICAS
========================================================= */

router.get(
  '/estatisticas',
  autenticar,
  requireTenant,
  async (req, res) => {

    try {

      const tenantId =
        getTenantId(req);

      const match =
        buildTenantMatch(tenantId);

      const processos =
        await ProcessoDisciplinar.find({
          ...match,
          ativo: { $ne: false }
        }).lean();

      const stats = {

        total: processos.length,

        ativos: 0,

        arquivados: 0,

        cancelados: 0,

        atosInfracionais: 0,

        responsaveisNotificados: 0,

        comparecimentos: 0,

        gravidade: {
          leve: 0,
          moderada: 0,
          grave: 0,
          gravissima: 0
        },

        porTurma: {}
      };

      processos.forEach(p => {

        const status =
          String(p.status || '')
            .toLowerCase();

        if (status.includes('arquiv')) {
          stats.arquivados++;
        } else if (
          status.includes('cancel')
        ) {
          stats.cancelados++;
        } else {
          stats.ativos++;
        }

        if (p.classificacao === 'ato_infracional') {
          stats.atosInfracionais++;
        }

        if (p.responsavel?.notificadoEm) {
          stats.responsaveisNotificados++;
        }

        if (p.responsavel?.compareceuEm) {
          stats.comparecimentos++;
        }

        const gravidade =
          String(p.gravidade || '')
            .toLowerCase();

        if (
          stats.gravidade[gravidade] !== undefined
        ) {
          stats.gravidade[gravidade]++;
        }

        const turma =
          p.aluno?.turma ||
          'Sem turma';

        stats.porTurma[turma] =
          (stats.porTurma[turma] || 0) + 1;
      });

      stats.taxaComparecimento =
        stats.responsaveisNotificados
          ? Number(
              (
                (
                  stats.comparecimentos /
                  stats.responsaveisNotificados
                ) * 100
              ).toFixed(1)
            )
          : 0;

      return res.json(stats);

    } catch (err) {

      console.error(
        '[PROCESSOS][ESTATISTICAS]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao carregar estatísticas.'
      });
    }
  }
);
/* =========================================================
   LISTAR
========================================================= */

router.get('/',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);

      const processos = await ProcessoDisciplinar.find({
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      })
        .sort({ createdAt: -1 })
        .populate('aluno', 'nome turma')
        .populate('notificacao', 'numeroSequencial tipoMedida')
        .lean();

      return res.json(processos);
    } catch (err) {
      console.error('[PROCESSOS][LISTAR]', err);

      return res.status(500).json({
        message: 'Erro ao listar processos disciplinares.'
      });
    }
  }
);

/* =========================================================
   DETALHAR
========================================================= */

router.get('/:id',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId)
      })
        .populate('aluno', 'nome turma')
        .populate('notificacao')
        .populate('timeline.usuario', 'nome')
        .lean();

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      return res.json(processo);
    } catch (err) {
      console.error('[PROCESSOS][DETALHAR]', err);

      return res.status(500).json({
        message: 'Erro ao detalhar processo disciplinar.'
      });
    }
  }
);

/* =========================================================
   ABRIR PROCESSO
========================================================= */

router.post('/',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);

      const {
        notificacaoId,
        aluno,
        natureza,
        classificacaoOcorrencia,
        gravidade,
        dataFato,
        horaFato,
        localFato,
        descricaoFato,
        providenciasImediatas,
        possuiViolencia,
        possuiLesao,
        possuiDanoPatrimonial,
        possuiSubstanciaIlicita,
        possuiArmaOuObjetoPerigoso,
        exigeEncaminhamentoExterno,
        orgaoEncaminhamento
      } = req.body || {};

      if (!aluno || !mongoose.isValidObjectId(aluno)) {
        return res.status(400).json({
          message: 'Aluno inválido.'
        });
      }

      const alunoDoc = await Aluno.findOne({
        _id: aluno,
        ...buildTenantMatch(tenantId)
      })
        .select('nome turma')
        .lean();

      if (!alunoDoc) {
        return res.status(404).json({
          message: 'Aluno não encontrado.'
        });
      }

      let notificacao = null;

      if (notificacaoId) {
        notificacao = await Notificacao.findOne({
          _id: notificacaoId,
          ...buildTenantMatch(tenantId)
        });

        if (!notificacao) {
          return res.status(404).json({
            message: 'Notificação vinculada não encontrada.'
          });
        }

        if (notificacao.processoInstaurado && notificacao.processoDisciplinar) {
          return res.status(409).json({
            message: 'Esta notificação já possui procedimento disciplinar instaurado.',
            processoDisciplinar: notificacao.processoDisciplinar
          });
        }
      }

      const numeroProcesso = await getNextNumeroProcesso(tenantId);

      const processo = new ProcessoDisciplinar(
        tenantData(req, {
          aluno,
          notificacao: notificacao?._id || null,
          numeroProcesso,
          natureza: natureza || 'indisciplina',
          classificacaoOcorrencia: classificacaoOcorrencia || 'indisciplina_leve',
          gravidade: gravidade || 'leve',
          dataFato: dataFato || new Date(),
          horaFato,
          localFato,
          descricaoFato,
          providenciasImediatas,
          possuiViolencia: !!possuiViolencia,
          possuiLesao: !!possuiLesao,
          possuiDanoPatrimonial: !!possuiDanoPatrimonial,
          possuiSubstanciaIlicita: !!possuiSubstanciaIlicita,
          possuiArmaOuObjetoPerigoso: !!possuiArmaOuObjetoPerigoso,
          exigeEncaminhamentoExterno: !!exigeEncaminhamentoExterno,
          orgaoEncaminhamento: orgaoEncaminhamento || null,
          abertoPor: req.usuario?.id || null
        })
      );

      processo.adicionarTimeline({
        tipo: 'processo_aberto',
        titulo: 'Procedimento instaurado',
        descricao: 'Procedimento disciplinar instaurado no sistema.',
        usuario: req.usuario?.id || null
      });

      await processo.save();
      try {

  await registrarProcessoNoLivro(
    processo,
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][CRIAR]',
    errLivro
  );
}

      if (notificacao) {
        notificacao.processoDisciplinar = processo._id;
        notificacao.processoInstaurado = true;
        await notificacao.save();
      }

      await safeLogAction({
        req,
        event: 'PROCESSO_DISCIPLINAR_CRIADO',
        targetType: 'ProcessoDisciplinar',
        targetId: processo._id,
        entidadeNome: alunoDoc?.nome || null,
        alunoNome: alunoDoc?.nome || null,
        meta: {
          aluno: alunoDoc?.nome,
          turma: alunoDoc?.turma,
          numeroProcesso,
          classificacaoOcorrencia,
          gravidade
        }
      });

      const processoCompleto = await ProcessoDisciplinar.findById(processo._id)
        .populate('aluno', 'nome turma')
        .populate('notificacao')
        .lean();

      return res.status(201).json(processoCompleto);
    } catch (err) {
      console.error('[PROCESSOS][CRIAR]', err);

      return res.status(500).json({
        message: 'Erro ao abrir processo disciplinar.'
      });
    }
  }
);

/* =========================================================
   REGISTRAR OBSERVAÇÃO
========================================================= */

router.post('/:id/observacao',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const { titulo, descricao } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      processo.adicionarTimeline({
        tipo: 'observacao',
        titulo: titulo || 'Observação registrada',
        descricao: descricao || '',
        usuario: req.usuario?.id || null
      });

      if (processo.status === 'aberto') {
        processo.status = 'em_acompanhamento';
      }

      await processo.save();

      return res.json({
        message: 'Observação adicionada com sucesso.'
      });
    } catch (err) {
      console.error('[PROCESSOS][OBSERVACAO]', err);

      return res.status(500).json({
        message: 'Erro ao registrar observação.'
      });
    }
  }
);

/* =========================================================
   ARQUIVAR
========================================================= */

router.post('/:id/arquivar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const {
        motivoArquivamento,
        parecerFinal,
        resultadoAcompanhamento
      } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      processo.status = 'arquivado';
      processo.motivoArquivamento = motivoArquivamento || '';
      processo.parecerFinal = parecerFinal || '';
      processo.resultadoAcompanhamento = resultadoAcompanhamento || 'reintegrado';
      processo.arquivadoEm = new Date();
      processo.arquivadoPor = req.usuario?.id || null;

      processo.adicionarTimeline({
        tipo: 'processo_arquivado',
        titulo: 'Processo arquivado',
        descricao: motivoArquivamento || 'Processo arquivado no sistema.',
        usuario: req.usuario?.id || null
      });

      await processo.save();
      try {

  await registrarArquivamentoNoLivro(
    processo,
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][ARQUIVAR]',
    errLivro
  );
}

      await safeLogAction({
        req,
        event: 'PROCESSO_DISCIPLINAR_ARQUIVADO',
        targetType: 'ProcessoDisciplinar',
        targetId: processo._id,
        meta: {
          numeroProcesso: processo.numeroProcesso,
          resultadoAcompanhamento: processo.resultadoAcompanhamento
        }
      });

      return res.json({
        message: 'Processo arquivado com sucesso.'
      });
    } catch (err) {
      console.error('[PROCESSOS][ARQUIVAR]', err);

      return res.status(500).json({
        message: 'Erro ao arquivar processo.'
      });
    }
  }
);

/* =========================================================
   CANCELAR / REMOVER TESTE
   - remoção lógica do procedimento
   - desvincula a notificação
========================================================= */

router.post('/:id/cancelar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const { motivo } = req.body || {};

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      const notificacaoId = processo.notificacao || null;

      processo.status = 'cancelado';
      processo.ativo = false;

      processo.adicionarTimeline({
        tipo: 'observacao',
        titulo: 'Procedimento cancelado',
        descricao: motivo || 'Procedimento removido/cancelado pela administração.',
        usuario: req.usuario?.id || null,
        metadados: {
          acao: 'cancelamento_logico'
        }
      });

      await processo.save();
      try {

  await registrarCancelamentoNoLivro(
    processo,
    req,
    motivo
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][CANCELAR]',
    errLivro
  );
}

      if (notificacaoId) {
        await Notificacao.findOneAndUpdate(
          {
            _id: notificacaoId,
            ...buildTenantMatch(tenantId)
          },
          {
            $set: {
              processoInstaurado: false,
              processoDisciplinar: null
            }
          }
        );
      }

      await safeLogAction({
        req,
        event: 'PROCESSO_DISCIPLINAR_CANCELADO',
        targetType: 'ProcessoDisciplinar',
        targetId: processo._id,
        meta: {
          numeroProcesso: processo.numeroProcesso,
          motivo: motivo || null,
          notificacaoDesvinculada: notificacaoId ? String(notificacaoId) : null
        }
      });

      return res.json({
        ok: true,
        message: 'Procedimento cancelado com sucesso.'
      });
    } catch (err) {
      console.error('[PROCESSOS][CANCELAR]', err);

      return res.status(500).json({
        message: 'Erro ao cancelar procedimento disciplinar.'
      });
    }
  }
);
/* =========================================================
   RESPONSÁVEL NOTIFICADO
========================================================= */

/* =========================================================
   RESPONSÁVEL NOTIFICADO + EMAIL + TOKEN
========================================================= */

router.post('/:id/notificar-responsavel',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const {
        nome,
        parentesco,
        telefone,
        email,
        resposta
      } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      })
        .populate('aluno', 'nome turma');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      const token = crypto.randomBytes(32).toString('hex');

      const expira = new Date();
      expira.setDate(expira.getDate() + 15);

      processo.tokenResponsavel = token;
      processo.tokenResponsavelExpiraEm = expira;

      processo.responsavel = {
        ...(processo.responsavel || {}),
        nome: nome || processo.responsavel?.nome || '',
        parentesco: parentesco || processo.responsavel?.parentesco || '',
        telefone: telefone || processo.responsavel?.telefone || '',
        email: email || processo.responsavel?.email || '',
        resposta: resposta || '',
        notificado: true,
        notificadoEm: new Date()
      };

      processo.status = 'aguardando_responsavel';

      const linkPublico =
        `${req.protocol}://${req.get('host')}/procedimento-responsavel.html?token=${token}`;

      processo.adicionarTimeline({
        tipo: 'responsavel_notificado',
        titulo: 'Responsável notificado',
        descricao:
          `Responsável ${nome || ''} foi notificado acerca do procedimento disciplinar.`,
        usuario: req.usuario?.id || null,
        metadados: {
          email,
          telefone,
          linkPublico
        }
      });

      await processo.save();

      let emailResultado = {
        ok: false,
        motivo: 'sem_email'
      };

      if (email) {
        try {
          const html = `
            <div style="font-family:Arial,sans-serif;padding:20px;color:#111">
              <h2 style="color:#8B0000">
                Procedimento disciplinar escolar
              </h2>

              <p>
                Prezado(a) responsável,
              </p>

              <p>
                Informamos que foi instaurado um procedimento disciplinar referente ao(a) estudante:
              </p>

              <div style="padding:14px;border:1px solid #ddd;border-radius:10px;background:#fafafa">
                <p><strong>Aluno:</strong> ${processo.aluno?.nome || '-'}</p>
                <p><strong>Turma:</strong> ${processo.aluno?.turma || '-'}</p>
                <p><strong>Processo:</strong> ${processo.numeroProcesso}</p>
              </div>

              <p style="margin-top:20px">
                Clique no botão abaixo para visualizar e confirmar ciência:
              </p>

              <p>
                <a
                  href="${linkPublico}"
                  style="
                    display:inline-block;
                    padding:12px 20px;
                    background:#8B0000;
                    color:#fff;
                    text-decoration:none;
                    border-radius:8px;
                    font-weight:bold;
                  "
                >
                  Visualizar procedimento
                </a>
              </p>

              <p style="margin-top:25px;font-size:13px;color:#666">
                Este link é individual e possui validade temporária.
              </p>
            </div>
          `;

          await mailer.sendMail({
  to: email,
  subject: `Procedimento disciplinar - ${processo.numeroProcesso}`,
  html
});

          emailResultado = {
            ok: true
          };

        } catch (e) {
          console.error('[EMAIL][PROCESSO_DISCIPLINAR]', e);

          emailResultado = {
            ok: false,
            motivo: e.message || 'erro_envio'
          };
        }
      }

      await safeLogAction({
        req,
        event: 'RESPONSAVEL_NOTIFICADO',
        targetType: 'ProcessoDisciplinar',
        targetId: processo._id,
        meta: {
          numeroProcesso: processo.numeroProcesso,
          responsavel: nome || null,
          email,
          emailResultado
        }
      });

      return res.json({
        ok: true,
        emailResultado,
        linkPublico,
        message: 'Responsável notificado com sucesso.'
      });

    } catch (err) {
      console.error('[PROCESSOS][NOTIFICAR_RESPONSAVEL]', err);

      return res.status(500).json({
        message: 'Erro ao registrar notificação do responsável.'
      });
    }
  }
);

/* =========================================================
   RESPONSÁVEL COMPARECEU
========================================================= */

router.post('/:id/responsavel-compareceu',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const {
        resposta
      } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      processo.responsavel = {
        ...(processo.responsavel || {}),
        compareceu: true,
        compareceuEm: new Date(),
        resposta: resposta || processo.responsavel?.resposta || ''
      };

      processo.status = 'em_acompanhamento';

      processo.adicionarTimeline({
        tipo: 'responsavel_compareceu',
        titulo: 'Responsável compareceu',
        descricao:
          resposta || 'Comparecimento registrado no sistema.',
        usuario: req.usuario?.id || null
      });

      await processo.save();

      return res.json({
        ok: true,
        message: 'Comparecimento registrado com sucesso.'
      });

    } catch (err) {
      console.error('[PROCESSOS][RESPONSAVEL_COMPARECEU]', err);

      return res.status(500).json({
        message: 'Erro ao registrar comparecimento.'
      });
    }
  }
);

/* =========================================================
   CONFIRMAR CIÊNCIA
========================================================= */

router.post('/:id/confirmar-ciencia',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo disciplinar não encontrado.'
        });
      }

      processo.responsavel = {
        ...(processo.responsavel || {}),
        confirmouCiencia: true,
        confirmouCienciaEm: new Date()
      };

      if (
        processo.status === 'aberto' ||
        processo.status === 'aguardando_responsavel'
      ) {
        processo.status = 'em_acompanhamento';
      }

      processo.adicionarTimeline({
        tipo: 'ciencia_confirmada',
        titulo: 'Ciência confirmada',
        descricao:
          'Responsável confirmou ciência do procedimento disciplinar.',
        usuario: req.usuario?.id || null
      });

      await processo.save();

      return res.json({
        ok: true,
        message: 'Ciência confirmada com sucesso.'
      });

    } catch (err) {
      console.error('[PROCESSOS][CIENCIA]', err);

      return res.status(500).json({
        message: 'Erro ao confirmar ciência.'
      });
    }
  }
);
/* =========================================================
   CONSULTA PÚBLICA DO RESPONSÁVEL
========================================================= */

router.get('/publico/:token',
  async (req, res) => {
    try {
      const { token } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        tokenResponsavel: token,
        ativo: { $ne: false }
      })
        .populate('aluno', 'nome turma')
        .lean();

      if (!processo) {
        return res.status(404).json({
          message: 'Link inválido ou não encontrado.'
        });
      }

      if (
        processo.tokenResponsavelExpiraEm &&
        new Date(processo.tokenResponsavelExpiraEm) < new Date()
      ) {
        return res.status(410).json({
          message: 'Este link expirou.'
        });
      }

      if (!processo.responsavel?.visualizou) {
        await ProcessoDisciplinar.updateOne(
          { _id: processo._id },
          {
            $set: {
              'responsavel.visualizou': true,
              'responsavel.visualizouEm': new Date()
            },
            $push: {
              timeline: {
                tipo: 'responsavel_visualizou',
                titulo: 'Responsável visualizou o procedimento',
                descricao: 'O responsável acessou o portal remoto.',
                criadoEm: new Date(),
                metadados: {
                  ip: req.ip
                }
              }
            }
          }
        );

        processo.responsavel.visualizou = true;
        processo.responsavel.visualizouEm = new Date();
      }

      return res.json({
        ok: true,
        processo: {
          _id: processo._id,
          numeroProcesso: processo.numeroProcesso,
          natureza: processo.natureza,
          status: processo.status,
          dataFato: processo.dataFato,
          localFato: processo.localFato,
          descricaoFato: processo.descricaoFato,
          providenciasImediatas: processo.providenciasImediatas,
          prazoAcompanhamentoAte: processo.prazoAcompanhamentoAte,
          aluno: processo.aluno,
          responsavel: processo.responsavel
        }
      });

    } catch (err) {
      console.error('[PROCESSO][PUBLICO][GET]', err);

      return res.status(500).json({
        message: 'Erro ao consultar procedimento.'
      });
    }
  }
);

/* =========================================================
   CONFIRMAR CIÊNCIA PÚBLICA
========================================================= */

router.post('/publico/:token/confirmar-ciencia',
  async (req, res) => {
    try {
      const { token } = req.params;

      const {
        resposta
      } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        tokenResponsavel: token,
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Link inválido.'
        });
      }

      if (
        processo.tokenResponsavelExpiraEm &&
        new Date(processo.tokenResponsavelExpiraEm) < new Date()
      ) {
        return res.status(410).json({
          message: 'Este link expirou.'
        });
      }

      processo.responsavel = {
        ...(processo.responsavel || {}),
        confirmouCiencia: true,
        confirmouCienciaEm: new Date(),
        resposta: resposta || processo.responsavel?.resposta || '',
        ipCiencia: req.ip,
        userAgentCiencia: req.headers['user-agent'] || ''
      };

      processo.tokenResponsavelUsadoEm = new Date();

      if (
        processo.status === 'aberto' ||
        processo.status === 'aguardando_responsavel'
      ) {
        processo.status = 'em_acompanhamento';
      }

      processo.adicionarTimeline({
        tipo: 'ciencia_confirmada',
        titulo: 'Ciência confirmada remotamente',
        descricao:
          resposta ||
          'Responsável confirmou ciência remotamente pelo portal.',
        usuario: null,
        metadados: {
          ip: req.ip
        }
      });

      await processo.save();

      return res.json({
        ok: true,
        message: 'Ciência confirmada com sucesso.'
      });

    } catch (err) {
      console.error('[PROCESSO][PUBLICO][CIENCIA]', err);

      return res.status(500).json({
        message: 'Erro ao confirmar ciência.'
      });
    }
  }
);
/* =========================================================
   GERAR PORTARIA DE INSTAURAÇÃO
========================================================= */

router.post('/:id/gerar-portaria-instauracao',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      })
        .populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};

      const tipoDocumento = 'portaria_instauracao';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath =
        path.join(
          process.cwd(),
          'pdf',
          'templates',
          'portaria_instauracao.docx'
        );

      const outputPath =
        path.join(
          process.cwd(),
          'pdf',
          'output',
          nomeArquivo
        );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message: 'Template não encontrado: portaria_instauracao.docx'
        });
      }

      const dataFatoFormatada =
        processo.dataFato
          ? new Date(processo.dataFato).toLocaleDateString('pt-BR')
          : '';

      const prazoFormatado =
        processo.prazoAcompanhamentoAte
          ? new Date(processo.prazoAcompanhamentoAte).toLocaleDateString('pt-BR')
          : '';

      const payload = {
        templatePath,
        outputPath,

        instituicaoNome: 'COLÉGIO MILITAR DOM PEDRO II',
        cabecalho: 'COLÉGIO MILITAR DOM PEDRO II',
        cidade: 'Cruzeiro do Sul',
        estado: 'AC',

        numeroProcesso: processo.numeroProcesso || '',
        alunoNome: aluno.nome || '',
        turma: aluno.turma || '',

        dataFato: dataFatoFormatada,
        horaFato: processo.horaFato || '',
        localFato: processo.localFato || '',
        descricaoFato: processo.descricaoFato || '',
        providencias: processo.providenciasImediatas || '',

        naturezaProcedimento:
          processo.natureza === 'ato_infracional'
            ? 'Possível ato infracional'
            : 'Indisciplina escolar',

        classificacaoOcorrencia: processo.classificacaoOcorrencia || '',
        gravidade: processo.gravidade || '',
        prazoAcompanhamento: prazoFormatado,

        usuarioGerador:
          req.usuario?.nome || 'Sistema',

        diretorNome:
          req.usuario?.nome || 'Direção Escolar',

        secretarioNome:
          req.usuario?.nome || 'Secretário(a) designado(a)'
      };

      const scriptPath =
        path.join(
          process.cwd(),
          'pdf',
          'generate_document.py'
        );

      const python = spawn(
        process.platform === 'win32' ? 'python' : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(JSON.stringify(payload));
      python.stdin.end();

      python.on('close', async (code) => {
        if (code !== 0) {
          console.error('[PORTARIA][PYTHON]', stderr);

          return res.status(500).json({
            message: 'Erro ao gerar portaria.',
            erro: stderr
          });
        }

        const caminhoGerado = stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(`${processo._id}-${Date.now()}-${tipoDocumento}`)
          .digest('hex');

        processo.documentos = processo.documentos || [];

        processo.documentos.push({
          tipo: 'portaria_instauracao',
          titulo: 'Portaria de Instauração',
          caminhoLocal: outputPath,
          hash: hashDocumento,
          ordem: 2,
          obrigatorio: true,
          categoria: 'abertura',
          geradoEm: new Date(),
          geradoPor: req.actor?.nome || req.usuario?.nome || 'Sistema'
        });

        processo.adicionarTimeline({
          tipo: 'documento_gerado',
          titulo: 'Portaria de instauração gerada',
          descricao: 'Portaria de instauração do procedimento administrativo disciplinar gerada automaticamente.',
          usuario: req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][PORTARIA]',
    errLivro
  );
}
        return res.json({
          ok: true,
          documento: {
            tipo: tipoDocumento,
            caminho: caminhoGerado || outputPath,
            nomeArquivo
          }
        });
      });

    } catch (err) {
      console.error('[PROCESSO][GERAR_PORTARIA]', err);

      return res.status(500).json({
        message: 'Erro ao gerar portaria de instauração.'
      });
    }
  }
);
/* =========================================================
   GERAR TERMO DE REMESSA AO CONSELHO TUTELAR
========================================================= */

router.post('/:id/gerar-remessa-conselho-tutelar',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};
      const tipoDocumento = 'remessa_conselho_tutelar';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath = path.join(
        process.cwd(),
        'pdf',
        'templates',
        'remessa_conselho_tutelar.docx'
      );

      const outputPath = path.join(
        process.cwd(),
        'pdf',
        'output',
        nomeArquivo
      );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message: 'Template não encontrado: remessa_conselho_tutelar.docx'
        });
      }

      const payload = {
        templatePath,
        outputPath,

        instituicaoNome: 'COLÉGIO MILITAR DOM PEDRO II',
        cabecalho: 'COLÉGIO MILITAR DOM PEDRO II',
        cidade: 'Cruzeiro do Sul',
        estado: 'AC',

        numeroProcesso: processo.numeroProcesso || '',
        alunoNome: aluno.nome || '',
        turma: aluno.turma || '',

        descricaoFato: processo.descricaoFato || '',
        providencias: processo.providenciasImediatas || '',
        motivoArquivamento: processo.motivoArquivamento || '',
        parecerFinal: processo.parecerFinal || '',

        dataAtual: new Date().toLocaleDateString('pt-BR'),
        usuarioGerador: req.usuario?.nome || 'Sistema',
        diretorNome: req.usuario?.nome || 'Direção Escolar'
      };

      const scriptPath = path.join(
        process.cwd(),
        'pdf',
        'generate_document.py'
      );

      const python = spawn(
        process.platform === 'win32' ? 'python' : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(JSON.stringify(payload));
      python.stdin.end();

      python.on('close', async (code) => {
        if (code !== 0) {
          console.error('[REMESSA_CT][PYTHON]', stderr);

          return res.status(500).json({
            message: 'Erro ao gerar termo de remessa.',
            erro: stderr
          });
        }

        const caminhoGerado = stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(`${processo._id}-${Date.now()}-${tipoDocumento}`)
          .digest('hex');

        processo.documentos = processo.documentos || [];

        processo.documentos.push({
          tipo: 'remessa_conselho_tutelar',
          titulo: 'Termo de Remessa ao Conselho Tutelar',
          caminhoLocal: outputPath,
          hash: hashDocumento,
          ordem: 90,
          obrigatorio: false,
          categoria: 'encaminhamento',
          geradoEm: new Date(),
          geradoPor: req.actor?.nome || req.usuario?.nome || 'Sistema'
        });

        processo.adicionarTimeline({
          tipo: 'documento_gerado',
          titulo: 'Termo de remessa ao Conselho Tutelar gerado',
          descricao: 'Documento de remessa do procedimento ao Conselho Tutelar gerado automaticamente.',
          usuario: req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

  await registrarEncaminhamentoNoLivro(
    processo,
    'conselho_tutelar',
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][REMESSA_CT]',
    errLivro
  );
}
        return res.json({
          ok: true,
          documento: {
            tipo: tipoDocumento,
            caminho: caminhoGerado || outputPath,
            nomeArquivo
          }
        });
      });

    } catch (err) {
      console.error('[PROCESSO][REMESSA_CT]', err);

      return res.status(500).json({
        message: 'Erro ao gerar termo de remessa ao Conselho Tutelar.'
      });
    }
  }
);
/* =========================================================
   GERAR OFÍCIO AO MINISTÉRIO PÚBLICO
========================================================= */

router.post('/:id/gerar-oficio-ministerio-publico',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};

      const tipoDocumento =
        'oficio_ministerio_publico';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath = path.join(
        process.cwd(),
        'pdf',
        'templates',
        'oficio_ministerio_publico.docx'
      );

      const outputPath = path.join(
        process.cwd(),
        'pdf',
        'output',
        nomeArquivo
      );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message:
            'Template não encontrado: oficio_ministerio_publico.docx'
        });
      }

      const payload = {

        templatePath,
        outputPath,

        instituicaoNome:
          'COLÉGIO MILITAR DOM PEDRO II',

        cabecalho:
          'COLÉGIO MILITAR DOM PEDRO II',

        cidade:
          'Cruzeiro do Sul',

        estado:
          'AC',

        numeroProcesso:
          processo.numeroProcesso || '',

        alunoNome:
          aluno.nome || '',

        turma:
          aluno.turma || '',

        dataFato:
          processo.dataFato
            ? new Date(processo.dataFato)
                .toLocaleDateString('pt-BR')
            : '',

        horaFato:
          processo.horaFato || '',

        localFato:
          processo.localFato || '',

        descricaoFato:
          processo.descricaoFato || '',

        providencias:
          processo.providenciasImediatas || '',

        parecerFinal:
          processo.parecerFinal || '',

        dataAtual:
          new Date()
            .toLocaleDateString('pt-BR'),

        diretorNome:
          req.usuario?.nome ||
          'Direção Escolar',

        usuarioGerador:
          req.usuario?.nome ||
          'Sistema'
      };

      const scriptPath = path.join(
        process.cwd(),
        'pdf',
        'generate_document.py'
      );

      const python = spawn(
        process.platform === 'win32'
          ? 'python'
          : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(
        JSON.stringify(payload)
      );

      python.stdin.end();

      python.on('close', async (code) => {

        if (code !== 0) {

          console.error(
            '[OFICIO_MP][PYTHON]',
            stderr
          );

          return res.status(500).json({
            message:
              'Erro ao gerar ofício ao MP.',
            erro: stderr
          });
        }

        const caminhoGerado =
          stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(
            `${processo._id}-${Date.now()}-${tipoDocumento}`
          )
          .digest('hex');

        processo.documentos =
          processo.documentos || [];

        processo.documentos.push({

          tipo:
            'oficio_ministerio_publico',

          titulo:
            'Ofício ao Ministério Público',

          caminhoLocal:
            outputPath,

          hash:
            hashDocumento,

          ordem: 95,

          obrigatorio: false,

          categoria:
            'encaminhamento',

          geradoEm:
            new Date(),

          geradoPor:
            req.actor?.nome ||
            req.usuario?.nome ||
            'Sistema'
        });

        processo.adicionarTimeline({

          tipo:
            'documento_gerado',

          titulo:
            'Ofício ao Ministério Público gerado',

          descricao:
            'Documento formal de encaminhamento ao Ministério Público gerado automaticamente.',

          usuario:
            req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

  await registrarEncaminhamentoNoLivro(
    processo,
    'ministerio_publico',
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][MP]',
    errLivro
  );
}
        return res.json({

          ok: true,

          documento: {

            tipo:
              tipoDocumento,

            caminho:
              caminhoGerado || outputPath,

            nomeArquivo
          }
        });
      });

    } catch (err) {

      console.error(
        '[PROCESSO][OFICIO_MP]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao gerar ofício ao Ministério Público.'
      });
    }
  }
);
/* =========================================================
   GERAR OFÍCIO À DELEGACIA
========================================================= */

router.post('/:id/gerar-oficio-delegacia',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};

      const tipoDocumento =
        'oficio_delegacia';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath = path.join(
        process.cwd(),
        'pdf',
        'templates',
        'oficio_delegacia.docx'
      );

      const outputPath = path.join(
        process.cwd(),
        'pdf',
        'output',
        nomeArquivo
      );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message:
            'Template não encontrado: oficio_delegacia.docx'
        });
      }

      const payload = {

        templatePath,
        outputPath,

        instituicaoNome:
          'COLÉGIO MILITAR DOM PEDRO II',

        cabecalho:
          'COLÉGIO MILITAR DOM PEDRO II',

        cidade:
          'Cruzeiro do Sul',

        estado:
          'AC',

        numeroProcesso:
          processo.numeroProcesso || '',

        alunoNome:
          aluno.nome || '',

        turma:
          aluno.turma || '',

        dataFato:
          processo.dataFato
            ? new Date(processo.dataFato)
                .toLocaleDateString('pt-BR')
            : '',

        horaFato:
          processo.horaFato || '',

        localFato:
          processo.localFato || '',

        descricaoFato:
          processo.descricaoFato || '',

        providencias:
          processo.providenciasImediatas || '',

        parecerFinal:
          processo.parecerFinal || '',

        dataAtual:
          new Date()
            .toLocaleDateString('pt-BR'),

        diretorNome:
          req.usuario?.nome ||
          'Direção Escolar',

        usuarioGerador:
          req.usuario?.nome ||
          'Sistema'
      };

      const scriptPath = path.join(
        process.cwd(),
        'pdf',
        'generate_document.py'
      );

      const python = spawn(
        process.platform === 'win32'
          ? 'python'
          : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(
        JSON.stringify(payload)
      );

      python.stdin.end();

      python.on('close', async (code) => {

        if (code !== 0) {

          console.error(
            '[OFICIO_DELEGACIA][PYTHON]',
            stderr
          );

          return res.status(500).json({
            message:
              'Erro ao gerar ofício à Delegacia.',
            erro: stderr
          });
        }

        const caminhoGerado =
          stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(
            `${processo._id}-${Date.now()}-${tipoDocumento}`
          )
          .digest('hex');

        processo.documentos =
          processo.documentos || [];

        processo.documentos.push({

          tipo:
            'oficio_delegacia',

          titulo:
            'Ofício à Delegacia',

          caminhoLocal:
            outputPath,

          hash:
            hashDocumento,

          ordem: 96,

          obrigatorio: false,

          categoria:
            'encaminhamento',

          geradoEm:
            new Date(),

          geradoPor:
            req.actor?.nome ||
            req.usuario?.nome ||
            'Sistema'
        });

        processo.adicionarTimeline({

          tipo:
            'documento_gerado',

          titulo:
            'Ofício à Delegacia gerado',

          descricao:
            'Documento formal de encaminhamento à Delegacia gerado automaticamente.',

          usuario:
            req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

  await registrarEncaminhamentoNoLivro(
    processo,
    'delegacia',
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][DELEGACIA]',
    errLivro
  );
}
        return res.json({

          ok: true,

          documento: {

            tipo:
              tipoDocumento,

            caminho:
              caminhoGerado || outputPath,

            nomeArquivo
          }
        });
      });

    } catch (err) {

      console.error(
        '[PROCESSO][OFICIO_DELEGACIA]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao gerar ofício à Delegacia.'
      });
    }
  }
);
/* =========================================================
   GERAR OFÍCIO AO JUDICIÁRIO
========================================================= */

router.post('/:id/gerar-oficio-judiciario',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};

      const tipoDocumento =
        'oficio_judiciario';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath = path.join(
        process.cwd(),
        'pdf',
        'templates',
        'oficio_judiciario.docx'
      );

      const outputPath = path.join(
        process.cwd(),
        'pdf',
        'output',
        nomeArquivo
      );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message:
            'Template não encontrado: oficio_judiciario.docx'
        });
      }

      const payload = {

        templatePath,
        outputPath,

        instituicaoNome:
          'COLÉGIO MILITAR DOM PEDRO II',

        cabecalho:
          'COLÉGIO MILITAR DOM PEDRO II',

        cidade:
          'Cruzeiro do Sul',

        estado:
          'AC',

        numeroProcesso:
          processo.numeroProcesso || '',

        alunoNome:
          aluno.nome || '',

        turma:
          aluno.turma || '',

        dataFato:
          processo.dataFato
            ? new Date(processo.dataFato)
                .toLocaleDateString('pt-BR')
            : '',

        horaFato:
          processo.horaFato || '',

        localFato:
          processo.localFato || '',

        descricaoFato:
          processo.descricaoFato || '',

        providencias:
          processo.providenciasImediatas || '',

        parecerFinal:
          processo.parecerFinal || '',

        dataAtual:
          new Date()
            .toLocaleDateString('pt-BR'),

        diretorNome:
          req.usuario?.nome ||
          'Direção Escolar',

        usuarioGerador:
          req.usuario?.nome ||
          'Sistema'
      };

      const scriptPath = path.join(
        process.cwd(),
        'pdf',
        'generate_document.py'
      );

      const python = spawn(
        process.platform === 'win32'
          ? 'python'
          : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(
        JSON.stringify(payload)
      );

      python.stdin.end();

      python.on('close', async (code) => {

        if (code !== 0) {

          console.error(
            '[OFICIO_JUDICIARIO][PYTHON]',
            stderr
          );

          return res.status(500).json({
            message:
              'Erro ao gerar ofício ao Judiciário.',
            erro: stderr
          });
        }

        const caminhoGerado =
          stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(
            `${processo._id}-${Date.now()}-${tipoDocumento}`
          )
          .digest('hex');

        processo.documentos =
          processo.documentos || [];

        processo.documentos.push({

          tipo:
            'oficio_judiciario',

          titulo:
            'Ofício ao Judiciário',

          caminhoLocal:
            outputPath,

          hash:
            hashDocumento,

          ordem: 97,

          obrigatorio: false,

          categoria:
            'encaminhamento',

          geradoEm:
            new Date(),

          geradoPor:
            req.actor?.nome ||
            req.usuario?.nome ||
            'Sistema'
        });

        processo.adicionarTimeline({

          tipo:
            'documento_gerado',

          titulo:
            'Ofício ao Judiciário gerado',

          descricao:
            'Documento formal de encaminhamento ao Judiciário gerado automaticamente.',

          usuario:
            req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

  await registrarEncaminhamentoNoLivro(
    processo,
    'judiciario',
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][JUDICIARIO]',
    errLivro
  );
}
        return res.json({

          ok: true,

          documento: {

            tipo:
              tipoDocumento,

            caminho:
              caminhoGerado || outputPath,

            nomeArquivo
          }
        });
      });

    } catch (err) {

      console.error(
        '[PROCESSO][OFICIO_JUDICIARIO]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao gerar ofício ao Judiciário.'
      });
    }
  }
);
/* =========================================================
   GERAR RELATÓRIO FINAL / DESPACHO CONCLUSIVO
========================================================= */

router.post('/:id/gerar-relatorio-final',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).populate('aluno');

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const aluno = processo.aluno || {};

      const tipoDocumento =
        'relatorio_final';

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath = path.join(
        process.cwd(),
        'pdf',
        'templates',
        'relatorio_final.docx'
      );

      const outputPath = path.join(
        process.cwd(),
        'pdf',
        'output',
        nomeArquivo
      );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message:
            'Template não encontrado: relatorio_final.docx'
        });
      }

      const documentosGerados =
        (processo.documentos || [])
          .map(doc =>
            `• ${doc.titulo || doc.tipo}`
          )
          .join('\n');

      const payload = {

        templatePath,
        outputPath,

        instituicaoNome:
          'COLÉGIO MILITAR DOM PEDRO II',

        cabecalho:
          'COLÉGIO MILITAR DOM PEDRO II',

        cidade:
          'Cruzeiro do Sul',

        estado:
          'AC',

        numeroProcesso:
          processo.numeroProcesso || '',

        alunoNome:
          aluno.nome || '',

        turma:
          aluno.turma || '',

        dataFato:
          processo.dataFato
            ? new Date(processo.dataFato)
                .toLocaleDateString('pt-BR')
            : '',

        horaFato:
          processo.horaFato || '',

        localFato:
          processo.localFato || '',

        descricaoFato:
          processo.descricaoFato || '',

        providencias:
          processo.providenciasImediatas || '',

        parecerFinal:
          processo.parecerFinal || '',

        documentosGerados,

        dataAtual:
          new Date()
            .toLocaleDateString('pt-BR'),

        diretorNome:
          req.usuario?.nome ||
          'Direção Escolar',

        usuarioGerador:
          req.usuario?.nome ||
          'Sistema'
      };

      const scriptPath = path.join(
        process.cwd(),
        'pdf',
        'generate_document.py'
      );

      const python = spawn(
        process.platform === 'win32'
          ? 'python'
          : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', data => {
        stdout += data.toString();
      });

      python.stderr.on('data', data => {
        stderr += data.toString();
      });

      python.stdin.write(
        JSON.stringify(payload)
      );

      python.stdin.end();

      python.on('close', async (code) => {

        if (code !== 0) {

          console.error(
            '[RELATORIO_FINAL][PYTHON]',
            stderr
          );

          return res.status(500).json({
            message:
              'Erro ao gerar relatório final.',
            erro: stderr
          });
        }

        const caminhoGerado =
          stdout.trim();

        const hashDocumento = crypto
          .createHash('sha256')
          .update(
            `${processo._id}-${Date.now()}-${tipoDocumento}`
          )
          .digest('hex');

        processo.documentos =
          processo.documentos || [];

        processo.documentos.push({

          tipo:
            'relatorio_final',

          titulo:
            'Relatório Final / Despacho Conclusivo',

          caminhoLocal:
            outputPath,

          hash:
            hashDocumento,

          ordem: 98,

          obrigatorio: false,

          categoria:
            'encerramento',

          geradoEm:
            new Date(),

          geradoPor:
            req.actor?.nome ||
            req.usuario?.nome ||
            'Sistema'
        });

        processo.adicionarTimeline({

          tipo:
            'documento_gerado',

          titulo:
            'Relatório final gerado',

          descricao:
            'Relatório final/despacho conclusivo gerado automaticamente.',

          usuario:
            req.usuario?.id || null
        });

        await processo.save();
try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][RELATORIO_FINAL]',
    errLivro
  );
}
        return res.json({

          ok: true,

          documento: {

            tipo:
              tipoDocumento,

            caminho:
              caminhoGerado || outputPath,

            nomeArquivo
          }
        });
      });

    } catch (err) {

      console.error(
        '[PROCESSO][RELATORIO_FINAL]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao gerar relatório final.'
      });
    }
  }
);
/* =========================================================
   GERAR DOCUMENTO
========================================================= */

router.post('/:id/gerar-documento',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      const {
        tipoDocumento = 'termo_ciencia'
      } = req.body || {};

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      })
        .populate('aluno');
        

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const responsavel = processo.responsavel || {};
      const aluno = processo.aluno || {};
      const instituicao = {
  nome: 'COLÉGIO MILITAR DOM PEDRO II',
  cidade: 'Cruzeiro do Sul',
  estado: 'AC',
  logoUrl: ''
};

      const nomeArquivo =
        `${tipoDocumento}_${processo.numeroProcesso}_${Date.now()}.docx`
          .replace(/[^\w.-]/g, '_');

      const templatePath =
        path.join(
          process.cwd(),
          'pdf',
          'templates',
          `${tipoDocumento}.docx`
        );

      const outputPath =
        path.join(
          process.cwd(),
          'pdf',
          'output',
          nomeArquivo
        );

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          message: `Template não encontrado: ${tipoDocumento}.docx`
        });
      }

      const payload = {

        templatePath,
        outputPath,

        instituicaoNome:
          instituicao.nome || 'Instituição',

        cabecalho:
          instituicao.nome ||
          'COLÉGIO MILITAR',

        cidade:
          instituicao.cidade || 'Cruzeiro do Sul',

        estado:
          instituicao.estado || 'AC',

        numeroProcesso:
          processo.numeroProcesso || '',

        alunoNome:
          aluno.nome || '',

        turma:
          aluno.turma || '',

        responsavelNome:
          responsavel.nome || '',

        responsavelParentesco:
          responsavel.parentesco || '',

        descricaoFato:
          processo.descricaoFato || '',

        providencias:
          processo.providenciasImediatas || '',

        dataFato:
          processo.dataFato
            ? new Date(processo.dataFato).toLocaleString('pt-BR')
            : '',

        localFato:
          processo.localFato || 'local não informado',

          naturezaProcedimento:
  processo.natureza === 'ato_infracional'
    ? 'Possível ato infracional'
    : 'Indisciplina escolar',

classificacaoOcorrencia:
  processo.classificacaoOcorrencia || '',

gravidade:
  processo.gravidade || '',

statusProcesso:
  processo.status || '',

        dataCiencia:
          responsavel.confirmouCienciaEm
            ? new Date(responsavel.confirmouCienciaEm).toLocaleString('pt-BR')
            : '',

        ipCiencia:
          responsavel.ipCiencia || '',

        respostaResponsavel:
          responsavel.resposta || '',
        
        resultadoAcompanhamento:
            processo.resultadoAcompanhamento || '',

        parecerFinal:
            processo.parecerFinal || '',

        usuarioGerador:
          req.usuario?.nome || 'Sistema',

        logoUrl:
          instituicao.logoUrl || '',
               
      };

      const scriptPath =
        path.join(
          process.cwd(),
          'pdf',
          'generate_document.py'
        );

      const python = spawn(
        process.platform === 'win32' ? 'python' : 'python3',
        [scriptPath]
      );

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.stdin.write(
        JSON.stringify(payload)
      );

      python.stdin.end();

      python.on('close', async (code) => {

        if (code !== 0) {

          console.error('[DOC][PYTHON]', stderr);

          return res.status(500).json({
            message: 'Erro ao gerar documento.',
            erro: stderr
          });
        }

        const caminhoGerado = stdout.trim();

const tituloDocumento =
  tipoDocumento
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

const hashDocumento = crypto
  .createHash('sha256')
  .update(`${processo._id}-${Date.now()}-${tipoDocumento}`)
  .digest('hex');

processo.documentos = processo.documentos || [];

processo.documentos.push({
  tipo: tipoDocumento,
  titulo: tituloDocumento,
  caminhoLocal: outputPath,
  hash: hashDocumento,
  geradoPor: req.actor?.nome || req.usuario?.nome || 'Sistema',
  geradoEm: new Date(),

  ordem:
    tipoDocumento === 'capa' ? 1 :
    tipoDocumento === 'termo_ciencia' ? 2 :
    tipoDocumento === 'termo_comparecimento' ? 3 :
    tipoDocumento === 'termo_compromisso' ? 4 :
    tipoDocumento === 'arquivamento' ? 99 :
    50,

  obrigatorio: [
    'capa',
    'termo_ciencia'
  ].includes(tipoDocumento),

  categoria:
    tipoDocumento === 'capa'
      ? 'abertura'
      : tipoDocumento === 'arquivamento'
        ? 'encerramento'
        : tipoDocumento.includes('compromisso')
          ? 'responsavel'
          : tipoDocumento.includes('comparecimento')
            ? 'responsavel'
            : 'acompanhamento'
});

        await processo.save();
 
        try {

  const documentoGerado =
    processo.documentos[
      processo.documentos.length - 1
    ];

  await registrarDocumentoNoLivro(
    processo,
    documentoGerado,
    req
  );

} catch (errLivro) {

  console.error(
    '[LIVRO_OCORRENCIAS][DOCUMENTO]',
    errLivro
  );
}

        return res.json({
          ok: true,
          documento: {
            tipo: tipoDocumento,
            caminho: caminhoGerado,
            nomeArquivo
          }
        });

      });

    } catch (err) {

      console.error('[PROCESSO][GERAR_DOCUMENTO]', err);

      return res.status(500).json({
        message: 'Erro ao gerar documento.'
      });
    }
  }
);

/* =========================================================
   BAIXAR DOCUMENTO GERADO
========================================================= */

router.get('/:id/baixar-documento',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const caminho = String(req.query.caminho || '').trim();
      const nome = String(req.query.nome || 'documento.docx').trim();

      if (!isObjectId(id)) {
        return res.status(400).json({ message: 'ID inválido.' });
      }

      if (!caminho) {
        return res.status(400).json({ message: 'Caminho do documento ausente.' });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).lean();

      if (!processo) {
        return res.status(404).json({ message: 'Processo não encontrado.' });
      }

      const outputDir = path.resolve(process.cwd(), 'pdf', 'output');

const nomeArquivoSeguro = path.basename(caminho);
const arquivo = path.resolve(outputDir, nomeArquivoSeguro);

if (!arquivo.startsWith(outputDir + path.sep)) {
  return res.status(403).json({
    message: 'Caminho de documento não permitido.'
  });
}

if (!fs.existsSync(arquivo)) {
  return res.status(404).json({
    message: 'Arquivo não encontrado.'
  });
}

return res.download(arquivo, nome || nomeArquivoSeguro);

    } catch (err) {
      console.error('[PROCESSO][BAIXAR_DOCUMENTO]', err);

      return res.status(500).json({
        message: 'Erro ao baixar documento.'
      });
    }
  }
);

/* =========================================================
   DOSSIÊ COMPLETO
========================================================= */

router.get('/:id/dossie-completo',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId = getTenantId(req);
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).lean();

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const documentosOrdenados =
        ordenarDocumentosDossie(
          processo.documentos || []
        );

      return res.json({
        ok: true,

        processo: {
          id: processo._id,
          numeroProcesso: processo.numeroProcesso,
          status: processo.status
        },

        totalDocumentos:
          documentosOrdenados.length,

        documentos:
          documentosOrdenados.map((doc, index) => ({

            id: doc._id,

            ordem:
              doc.ordem || (index + 1),

            titulo:
              doc.titulo || 'Documento',

            tipo:
              doc.tipo || '',

            categoria:
              doc.categoria || '',

            obrigatorio:
              !!doc.obrigatorio,

            geradoEm:
              doc.geradoEm || null,

            hash:
              doc.hash || '',

            nomeArquivo:
              path.basename(
                doc.caminhoLocal || ''
              ),

            downloadUrl:
              `/api/processos-disciplinares/${processo._id}/baixar-documento?caminho=${encodeURIComponent(doc.caminhoLocal || '')}&nome=${encodeURIComponent(path.basename(doc.caminhoLocal || 'documento.docx'))}`

          }))
      });

    } catch (err) {

      console.error(
        '[PROCESSO][DOSSIE_COMPLETO]',
        err
      );

      return res.status(500).json({
        message: 'Erro ao gerar dossiê.'
      });
    }
  }
);

/* =========================================================
   GERAR DOSSIÊ PDF ÚNICO
========================================================= */

router.post('/:id/gerar-dossie-pdf',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      }).lean();

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const tiposPermitidosDossie = [
        'capa',
        'portaria_instauracao',
        'termo_ciencia',
        'termo_comparecimento',
        'termo_compromisso',
        'remessa_conselho_tutelar',
        'oficio_ministerio_publico',
        'oficio_delegacia',
        'oficio_judiciario',
        'relatorio_final',
        'arquivamento'
      ];

      const documentosMap = new Map();

      const documentosOrdenados =
        ordenarDocumentosDossie(
          processo.documentos || []
        );

      for (const doc of documentosOrdenados) {
        if (!tiposPermitidosDossie.includes(doc.tipo)) {
          continue;
        }

        if (
          !doc.caminhoLocal ||
          !fs.existsSync(doc.caminhoLocal)
        ) {
          continue;
        }

        const existente = documentosMap.get(doc.tipo);

        if (!existente) {
          documentosMap.set(doc.tipo, doc);
          continue;
        }

        const dataAtual = new Date(doc.geradoEm || 0);
        const dataExistente = new Date(existente.geradoEm || 0);

        if (dataAtual > dataExistente) {
          documentosMap.set(doc.tipo, doc);
        }
      }

      const documentos =
        tiposPermitidosDossie
          .map(tipo => documentosMap.get(tipo))
          .filter(Boolean);

      if (!documentos.length) {
        return res.status(400).json({
          message: 'Nenhum documento válido encontrado para compor o dossiê.'
        });
      }

      const indicePdfPath =
        path.join(
          process.cwd(),
          'pdf',
          'output',
          `INDICE_${processo.numeroProcesso}_${Date.now()}.pdf`
            .replace(/[^\w.-]/g, '_')
        );

      await criarPaginaIndiceDossie({
        outputPath: indicePdfPath,
        processo,
        documentos
      });

      const pdfsGerados = [];

      for (const doc of documentos) {
        const caminho = String(doc.caminhoLocal || '');

        if (caminho.toLowerCase().endsWith('.pdf')) {
          pdfsGerados.push(caminho);
          continue;
        }

        if (caminho.toLowerCase().endsWith('.docx')) {
          const pdfPath = await converterDocxParaPdf(caminho);
          pdfsGerados.push(pdfPath);
        }
      }

      const nomeFinal =
        `DOSSIE_${processo.numeroProcesso}_${Date.now()}.pdf`
          .replace(/[^\w.-]/g, '_');

      const outputFinal =
        path.join(
          process.cwd(),
          'pdf',
          'output',
          nomeFinal
        );

      await unirPdfs(
        [
          indicePdfPath,
          ...pdfsGerados
        ],
        outputFinal
      );
        console.log(
        '[DOSSIÊ][ASSINATURAS]',
        processo.assinaturas?.length,
        processo.assinaturas
      );
      await inserirAssinaturasNoPdf(
        outputFinal,
        processo
      );

      const hashDossie = crypto
        .createHash('sha256')
        .update(fs.readFileSync(outputFinal))
        .digest('hex');

      const urlValidacao =
        `${req.protocol}://${req.get('host')}/verificar-documento.html?hash=${hashDossie}`;

      const qrPath =
        outputFinal.replace(/\.pdf$/i, '_qrcode.png');

      await QRCode.toFile(
        qrPath,
        urlValidacao,
        {
          width: 300,
          margin: 2
        }
      );

      await inserirQrNoPdf(
        outputFinal,
        qrPath
      );

      console.log('[DOSSIE_PDF][QR_GERADO]', fs.existsSync(qrPath), qrPath);
      console.log('[DOSSIE_PDF][HASH_VALIDACAO]', hashDossie);

      await ProcessoDisciplinar.updateOne(
        {
          _id: processo._id,
          ...buildTenantMatch(tenantId)
        },
        {
          $push: {
            documentos: {
              tipo: 'dossie_pdf',
              titulo: 'Dossiê Disciplinar Completo',
              caminhoLocal: outputFinal,
              hash: hashDossie,
              ordem: 100,
              obrigatorio: false,
              categoria: 'dossie_final',
              geradoEm: new Date(),
              geradoPor: req.actor?.nome || req.usuario?.nome || 'Sistema'
            }
          }
        }
      );

      return res.json({
        ok: true,
        caminho: outputFinal,
        nomeArquivo: nomeFinal,
        hash: hashDossie,
        urlValidacao
      });

    } catch (err) {
      console.error('[PROCESSO][DOSSIE_PDF]', err);

      return res.status(500).json({
        message: 'Erro ao gerar PDF do dossiê.',
        erro: err.message
      });
    }
  }
);
/* =========================================================
   LIMPAR DOCUMENTOS ANTIGOS
========================================================= */

router.post('/:id/limpar-documentos',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {

    try {

      const tenantId =
        getTenantId(req);

      const { id } =
        req.params;

      const processo =
        await ProcessoDisciplinar.findOne({
          _id: id,
          ...buildTenantMatch(tenantId)
        });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const docs =
        Array.isArray(processo.documentos)
          ? processo.documentos
          : [];

      const agrupados = {};

      for (const doc of docs) {

        const tipo =
          doc.tipo || 'outro';

        if (!agrupados[tipo]) {
          agrupados[tipo] = [];
        }

        agrupados[tipo].push(doc);
      }

      const finais = [];

      Object.values(agrupados).forEach(lista => {

        lista.sort((a, b) =>
          new Date(b.geradoEm || 0) -
          new Date(a.geradoEm || 0)
        );

        finais.push(lista[0]);
      });

      processo.documentos = finais;

      await processo.save();

      return res.json({
        ok: true,
        removidos:
          docs.length - finais.length,
        restantes:
          finais.length
      });

    } catch (err) {

      console.error(
        '[PROCESSO][LIMPAR_DOCS]',
        err
      );

      return res.status(500).json({
        message:
          'Erro ao limpar documentos.'
      });
    }
  }
);
/* =========================================================
   VERIFICAR DOCUMENTO POR HASH
========================================================= */

router.get('/verificar-documento/:hash',
  async (req, res) => {

    try {

      const { hash } = req.params;

      if (!hash || String(hash).length < 20) {
        return res.status(400).json({
          ok: false,
          message: 'Hash inválido.'
        });
      }

      const processo =
        await ProcessoDisciplinar.findOne({
          'documentos.hash': hash
        })
          .populate('aluno', 'nome turma')
          .lean();

      if (!processo) {
        return res.status(404).json({
          ok: false,
          autenticidade: false,
          message: 'Documento não encontrado.'
        });
      }

      const documento =
        (processo.documentos || [])
          .find(d => d.hash === hash);

      if (!documento) {
        return res.status(404).json({
          ok: false,
          autenticidade: false,
          message: 'Documento inválido.'
        });
      }

      return res.json({

        ok: true,

        autenticidade: true,

        documento: {

          titulo:
            documento.titulo || 'Documento',

          tipo:
            documento.tipo || '',

          categoria:
            documento.categoria || '',

          hash:
            documento.hash || '',

          geradoEm:
            documento.geradoEm || null,

          geradoPor:
            documento.geradoPor || 'Sistema'
        },

        processo: {

          numeroProcesso:
            processo.numeroProcesso || '',

          status:
            processo.status || '',

          aluno: {
            nome:
              processo.aluno?.nome || '',

            turma:
              processo.aluno?.turma || ''
          }
        }
      });

    } catch (err) {

      console.error(
        '[PROCESSO][VERIFICAR_DOCUMENTO]',
        err
      );

      return res.status(500).json({
        ok: false,
        message: 'Erro ao verificar documento.'
      });
    }
  }
);
/* =========================================================
   ASSINATURA ELETRÔNICA DO PROCESSO DISCIPLINAR
========================================================= */

router.post(
  '/:id/assinar',
  autenticar,
  async (req, res) => {

    try {

      const { id } = req.params;

      const {
        senha = '',
        tipo = 'outro',
        cargo = '',
        observacao = '',
        documentoTipo = '',
        documentoHash = ''
      } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {

        return res.status(400).json({
          ok: false,
          message: 'ID inválido.'
        });

      }

      if (!senha) {

        return res.status(400).json({
          ok: false,
          message:
            'Informe sua senha para confirmar a assinatura.'
        });

      }

      const usuarioReq =
        req.usuario ||
        req.user ||
        {};

      const usuarioId =
        usuarioReq._id ||
        usuarioReq.id;

      if (!usuarioId) {

        return res.status(401).json({
          ok: false,
          message:
            'Usuário autenticado não identificado.'
        });

      }

      const usuario =
        await Usuario
          .findById(usuarioId)
          .select('+senha')
          .lean();

      if (!usuario) {

        return res.status(404).json({
          ok: false,
          message:
            'Usuário não encontrado.'
        });

      }

      const hashSenha =
        usuario.senha || '';

      if (!hashSenha) {

        return res.status(400).json({
          ok: false,
          message:
            'Usuário sem senha válida.'
        });

      }

      const senhaValida =
        await bcrypt.compare(
          senha,
          hashSenha
        );

      if (!senhaValida) {

        return res.status(401).json({
          ok: false,
          message:
            'Senha inválida.'
        });

      }

      const processo =
        await ProcessoDisciplinar.findById(id);

      if (!processo) {

        return res.status(404).json({
          ok: false,
          message:
            'Processo não encontrado.'
        });

      }

      const hashAssinatura =
        crypto
          .createHash('sha256')
          .update(JSON.stringify({

            processoId:
              String(processo._id),

            numeroProcesso:
              processo.numeroProcesso,

            status:
              processo.status,

            documentoTipo,
            documentoHash,

            assinadoPor:
              String(usuario._id),

            assinadoEm:
              new Date().toISOString()

          }))
          .digest('hex');

      const assinatura = {

        tipo,

        documentoTipo,
        documentoHash,

        assinadoPor:
          usuario._id,

        assinadoPorNome:
          usuario.nome ||
          usuario.name ||
          usuario.email ||
          'Usuário',

        cargo:
          cargo ||
          usuario.cargo ||
          usuario.funcao ||
          usuario.tipo ||
          'Usuário institucional',

        observacao,

        hashAssinatura,

        ip:
          req.ip ||
          req.headers['x-forwarded-for'] ||
          '',

        userAgent:
          req.headers['user-agent'] ||
          '',

        assinadoEm:
          new Date()

      };

      processo.assinaturas =
        processo.assinaturas || [];

      processo.assinaturas.push(
        assinatura
      );

      processo.markModified(
        'assinaturas'
      );

      processo.timeline.push({

        tipo:
          'observacao',

        titulo:
          'Processo assinado eletronicamente',

        descricao:
          `Assinatura eletrônica realizada por ${assinatura.assinadoPorNome}.`,

        usuario:
          usuario._id,

        criadoEm:
          new Date(),

        metadados: {
          assinatura:
            hashAssinatura
        }

      });

      await processo.save();

      return res.json({

        ok: true,

        message:
          'Processo assinado eletronicamente com sucesso.',

        assinatura

      });

    } catch (err) {

      console.error(
        '[PROCESSO_DISCIPLINAR][ASSINAR]',
        err
      );

      return res.status(500).json({
        ok: false,
        message:
          'Erro ao assinar processo.'
      });

    }

  }
);
/* =========================================================
   BAIXAR DOCUMENTO INDIVIDUAL ASSINADO EM PDF
========================================================= */

router.get(
  '/:id/documento-assinado-pdf',
  autenticar,
  requireTenant,
  attachActor,
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const { hash = '' } = req.query || {};

      if (!isObjectId(id)) {
        return res.status(400).json({
          message: 'ID inválido.'
        });
      }

      if (!hash) {
        return res.status(400).json({
          message: 'Hash do documento não informado.'
        });
      }

      const processo = await ProcessoDisciplinar.findOne({
        _id: id,
        ...buildTenantMatch(tenantId),
        ativo: { $ne: false }
      });

      if (!processo) {
        return res.status(404).json({
          message: 'Processo não encontrado.'
        });
      }

      const documento = (processo.documentos || [])
        .find(d => d.hash === hash);

      if (!documento) {
        return res.status(404).json({
          message: 'Documento não encontrado neste processo.'
        });
      }

      const assinatura = (processo.assinaturas || [])
        .slice()
        .reverse()
        .find(a => a.documentoHash === hash);

      if (!assinatura) {
        return res.status(404).json({
          message: 'Este documento ainda não possui assinatura eletrônica.'
        });
      }

      const outputDir = path.resolve(process.cwd(), 'pdf', 'output');

const caminhoSalvo =
  documento.caminhoLocal || documento.url || '';

const nomeArquivoOriginal =
  path.basename(caminhoSalvo);

const caminhoOriginal =
  path.resolve(outputDir, nomeArquivoOriginal);

if (!nomeArquivoOriginal || !fs.existsSync(caminhoOriginal)) {
  return res.status(404).json({
    message: 'Arquivo original do documento não localizado.',
    detalhe: nomeArquivoOriginal
  });
}

let pdfBasePath = caminhoOriginal;

      if (/\.docx$/i.test(caminhoOriginal)) {
        pdfBasePath = await converterDocxParaPdf(caminhoOriginal);
      }

      const nomeAssinado =
        `assinado_${path.basename(pdfBasePath)}`;

      const outputAssinado =
        path.join(
          path.dirname(pdfBasePath),
          nomeAssinado
        );

      fs.copyFileSync(
        pdfBasePath,
        outputAssinado
      );

      await inserirAssinaturaDocumentoNoPdf(
        outputAssinado,
        assinatura,
        documento
      );

      res.setHeader(
        'Content-Type',
        'application/pdf'
      );

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${nomeAssinado}"`
      );

      return res.sendFile(outputAssinado);

    } catch (err) {
      console.error(
        '[PROCESSO][DOCUMENTO_ASSINADO_PDF]',
        err
      );

      return res.status(500).json({
        message: 'Erro ao gerar PDF assinado do documento.'
      });
    }
  }
);

module.exports = router;