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

// Normaliza qualquer string de tipo/medida da notificação para o enum do schema
function mapTipoMedidaEnum(notif) {
  const txt = String(notif?.tipoMedida || notif?.tipo || '').toLowerCase();

  // ajuste conforme sua regra: aqui presume-se que
  // advertência/repreensão/elogio etc. → 'A.I.A'
  // e medidas de comparecimento/execução em contraturno → 'A.E.C.D.E'
  if (/(contraturno|comparecimento|execu[cç][aã]o|atividade|cumprimento|medida)/i.test(txt)) {
    return 'A.E.C.D.E';
  }
  // fallback comum (advertência escrita, repreensão, etc.)
  return 'A.I.A';
}

function hhmm(s, fallback) {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return fallback;
  return s;
}

/* =========================
   STATUS (primeiras rotas)
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
    if (!doc) return res.status(404).json({ ok: false, mensagem: 'Comunicação não encontrada.' });

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

    // Já existe?
    let doc = await ComunicacaoPais.findOne({ notificacao: notifId });
    if (doc) return res.json({ ok: true, data: doc });

    // Busca a notificação para popular campos obrigatórios
    const notif = await Notificacao.findById(notifId)
      .populate('aluno', 'nome turma')
      .lean();
    if (!notif) {
      return res.status(404).json({ ok: false, mensagem: 'Notificação não encontrada.' });
    }

    // Datas (usa a da notificação quando houver)
    const dt = notif.data ? new Date(notif.data) : new Date();

    // Mapeia para o enum do schema
    const tipoMedidaEnum = mapTipoMedidaEnum(notif);

    // Monte o documento com TODOS os required do schema
    const base = {
      instituicao: notif.instituicao || 'CMDPII/CZS',
      aluno: notif.aluno?._id || notif.aluno,            // ObjectId
      notificacao: notifId,                               // ObjectId, unique
      nomeAluno: notif.aluno?.nome || '',
      turma: notif.aluno?.turma || '',
      dataNotificacao: dt,
      tipoMedida: tipoMedidaEnum,                         // 'A.I.A' | 'A.E.C.D.E'
      observacao: '',
      dataInicio: dt,
      dataFim: dt,
      horaApresentacao: hhmm(req.body?.horaApresentacao, '14:00'),
      horaSaida: hhmm(req.body?.horaSaida, '18:00'),
      // criadoPor/atualizadoPor opcionais
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
      const notifId = normalizeId(req.params.notificacao);
      const doc = await ComunicacaoPais.findOne({ notificacao: notifId });
      if (doc) return res.json({ ok: true, data: doc });
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
      atualizadoPor: req.user?._id, // se o middleware popular req.user
    };

    const doc = await ComunicacaoPais.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ ok: false, mensagem: 'Registro não encontrado.' });

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
    if (!doc) return res.status(404).json({ ok: false, mensagem: 'Comunicação não encontrada.' });

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
