// backend/routes/api/comunicacaoPais.js
const express = require('express');
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const ComunicacaoPais = require('../../models/ComunicacaoPais');
const Notificacao = require('../../models/Notificacao');
const gerarPdfComunicacao = require('../../utils/pdfComunicacao');

const router = express.Router();

/* =========================
   HELPERS
========================= */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

// Remove prefixos como "nota_" ou "nota-" e valida ObjectId
function normalizeId(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^nota[_-]/i, '');
  return mongoose.isValidObjectId(s) ? s : null;
}

// Garante HH:mm válido
function hhmm(s, fallback) {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return fallback;
  return s;
}

// Normaliza qualquer string de tipo/medida da notificação para o enum do schema
function mapTipoMedidaEnum(notif) {
  const txt = String(notif?.tipoMedida || notif?.tipo || '')
    .trim()
    .toLowerCase();

  // Reconhece explicitamente A.E.C.D.E / AECDE
  if (
    /a\.?\s*e\.?\s*c\.?\s*d\.?\s*e\.?/i.test(txt) ||
    /\baecde\b/i.test(txt)
  ) {
    return 'A.E.C.D.E';
  }

  // Reconhece explicitamente A.I.A / AIA
  if (
    /a\.?\s*i\.?\s*a\.?/i.test(txt) ||
    /\baia\b/i.test(txt)
  ) {
    return 'A.I.A';
  }

  // Regras por descrição textual
  if (/(contraturno|comparecimento|execu[cç][aã]o|atividade|cumprimento|medida)/i.test(txt)) {
    return 'A.E.C.D.E';
  }

  // Fallback
  return 'A.I.A';
}

/* =========================
   STATUS
========================= */
router.get('/status', autenticar, (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus
      ? m.getStatus()
      : {
          nodeEnv: process.env.NODE_ENV || '(unset)',
          MAIL_ENABLED: false,
          TG_ENABLED: false,
          hasTransporter: false,
          hasTelegramBot: false,
          transportMode: 'NONE',
        };

    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('❌ GET /api/comunicacao/status:', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao buscar status.' });
  }
});

router.get('/status-public', (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus
      ? m.getStatus()
      : {
          nodeEnv: process.env.NODE_ENV || '(unset)',
          MAIL_ENABLED: false,
          TG_ENABLED: false,
          hasTransporter: false,
          hasTelegramBot: false,
          transportMode: 'NONE',
        };

    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('❌ GET /api/comunicacao/status-public:', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao buscar status público.' });
  }
});

/* ======================================================
   LER por NOTIFICAÇÃO (GET /:notificacao)
====================================================== */
router.get('/:notificacao', autenticar, async (req, res, next) => {
  try {
    if (req.params.notificacao && /\/pdf$/i.test(req.url)) return next();

    const notifId = normalizeId(req.params.notificacao);
    if (!notifId) {
      return res.status(400).json({ ok: false, mensagem: 'Parâmetro de notificação inválido.' });
    }

    const doc = await ComunicacaoPais.findOne({ notificacao: notifId }).lean();
    if (!doc) {
      return res.status(404).json({ ok: false, mensagem: 'Comunicação não encontrada.' });
    }

    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ GET /api/comunicacao/:notificacao', e);
    return res.status(500).json({ ok: false, mensagem: 'Falha ao buscar comunicação.' });
  }
});

/* ======================================================
   CRIAR ou RETORNAR (POST /:notificacao) — idempotente
====================================================== */
router.post('/:notificacao', autenticar, async (req, res) => {
  try {
    const notifId = normalizeId(req.params.notificacao);
    if (!notifId) {
      return res.status(400).json({ ok: false, mensagem: 'Parâmetro de notificação inválido.' });
    }

    // Busca a notificação para popular campos obrigatórios
    const notif = await Notificacao.findById(notifId)
      .populate('aluno', 'nome turma')
      .lean();

    if (!notif) {
      return res.status(404).json({ ok: false, mensagem: 'Notificação não encontrada.' });
    }

    const tipoMedidaEnum = mapTipoMedidaEnum(notif);
    const dt = notif.data ? new Date(notif.data) : new Date();

    // Já existe? sincroniza e retorna
    let doc = await ComunicacaoPais.findOne({ notificacao: notifId });
    if (doc) {
      let alterou = false;

      if (doc.tipoMedida !== tipoMedidaEnum) {
        doc.tipoMedida = tipoMedidaEnum;
        alterou = true;
      }

      if (!doc.nomeAluno && notif.aluno?.nome) {
        doc.nomeAluno = notif.aluno.nome;
        alterou = true;
      }

      if (!doc.turma && notif.aluno?.turma) {
        doc.turma = notif.aluno.turma;
        alterou = true;
      }

      if (!doc.dataNotificacao) {
        doc.dataNotificacao = dt;
        alterou = true;
      }

      if (!doc.instituicao && notif.instituicao) {
        doc.instituicao = notif.instituicao;
        alterou = true;
      }

      if (alterou) {
        await doc.save();
      }

      return res.json({ ok: true, data: doc });
    }

    // Monte o documento com todos os campos necessários
    const base = {
      instituicao: notif.instituicao || 'CMDPII/CZS',
      aluno: notif.aluno?._id || notif.aluno,
      notificacao: notifId,
      nomeAluno: notif.aluno?.nome || '',
      turma: notif.aluno?.turma || '',
      dataNotificacao: dt,
      tipoMedida: tipoMedidaEnum,
      observacao: '',
      dataInicio: dt,
      dataFim: dt,
      horaApresentacao: hhmm(req.body?.horaApresentacao, '14:00'),
      horaSaida: hhmm(req.body?.horaSaida, '18:00'),
      criadoPor: req.user?._id || req.usuario?._id,
      atualizadoPor: req.user?._id || req.usuario?._id,
    };

    doc = await ComunicacaoPais.create(base);
    return res.json({ ok: true, data: doc });
  } catch (e) {
    if (e?.name === 'ValidationError') {
      const campos = Object.keys(e.errors || {});
      console.error('⚠️ ValidationError /api/comunicacao POST:', campos);
      return res.status(422).json({
        ok: false,
        mensagem: 'Dados obrigatórios ausentes para criar a comunicação.',
        campos,
      });
    }

    // erro de unique (duplicado) — tratar como idempotente
    if (e?.code === 11000 && e?.keyPattern?.notificacao) {
      try {
        const notifId = normalizeId(req.params.notificacao);
        const doc = await ComunicacaoPais.findOne({ notificacao: notifId });
        if (doc) return res.json({ ok: true, data: doc });
      } catch (_) {}
    }

    console.error('💥 POST /api/comunicacao/:notificacao', e);
    return res.status(500).json({ ok: false, mensagem: 'Falha ao criar comunicação.' });
  }
});

/* ======================================================
   ATUALIZAR (PUT /:id)
====================================================== */
router.put('/:id', autenticar, async (req, res) => {
  try {
    const id = normalizeId(req.params.id) || req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, mensagem: 'ID inválido.' });
    }

    const update = {
      observacao: req.body.observacao ?? '',
      dataInicio: req.body.dataInicio ?? null,
      dataFim: req.body.dataFim ?? null,
      horaApresentacao: hhmm(req.body.horaApresentacao, '14:00'),
      horaSaida: hhmm(req.body.horaSaida, '18:00'),
      atualizadoPor: req.user?._id || req.usuario?._id,
    };

    const doc = await ComunicacaoPais.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ ok: false, mensagem: 'Registro não encontrado.' });
    }

    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ PUT /api/comunicacao/:id', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar.' });
  }
});

/* ======================================================
   PDF (GET /:id/pdf)
====================================================== */
router.get('/:id/pdf', autenticar, async (req, res) => {
  try {
    const id = normalizeId(req.params.id) || req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, mensagem: 'ID inválido.' });
    }

    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ ok: false, mensagem: 'Comunicação não encontrada.' });
    }

    const pdfBuffer = await gerarPdfComunicacao(doc);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comunicacao-${id}.pdf`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('💥 GET /api/comunicacao/:id/pdf', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao gerar PDF.' });
  }
});

module.exports = router;