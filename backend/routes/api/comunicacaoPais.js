// backend/routes/api/comunicacaoPais.js
const express = require('express');
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const ComunicacaoPais = require('../../models/ComunicacaoPais');
const gerarPdfComunicacao = require('../../utils/pdfComunicacao'); // mantenha/implemente

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
   - compatível com IDs tipo "nota_5f..." vindos do front
   - observa /:id/pdf: se terminar com "pdf" delega ao next()
   ====================================================== */
router.get('/:notificacao', autenticar, async (req, res, next) => {
  try {
    // Se a rota for /:id/pdf, deixe seguir
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

    let doc = await ComunicacaoPais.findOne({ notificacao: notifId });
    if (doc) return res.json({ ok: true, data: doc });

    doc = await ComunicacaoPais.create({
      notificacao: notifId,
      dataNotificacao: new Date(),
      dataInicio: new Date(),
      dataFim: new Date(),
      observacao: '',
    });

    return res.json({ ok: true, data: doc });
  } catch (e) {
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
      horaApresentacao: req.body.horaApresentacao ?? '',
      horaSaida: req.body.horaSaida ?? '',
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

    const pdfBuffer = await gerarPdfComunicacao(doc); // implemente se faltar
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comunicacao-${id}.pdf`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('💥 GET /api/comunicacao/:id/pdf', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao gerar PDF.' });
  }
});

module.exports = router;
