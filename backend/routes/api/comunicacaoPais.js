// backend/routes/api/comunicacaoPais.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const ComunicacaoPais = require('../../models/ComunicacaoPais');

// tenta carregar helper de PDF (opcional)
let gerarPdfComunicacao = null;
try {
  gerarPdfComunicacao = require('../../utils/pdfComunicacao');
} catch (_) {
  // opcional: apenas loga; a rota /:id/pdf responderá 501 se faltar
  console.warn('⚠️ utils/pdfComunicacao não encontrado. Rota PDF responderá 501.');
}

// helper: status da mensageria (sem quebrar se não existir)
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/* =========================
   ROTAS FIXAS (deve vir primeiro)
   ========================= */

// Status protegido (usa sessão/jwt)
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
    console.error('❌ Erro GET /api/comunicacao/status:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

// (Opcional) Status público para diagnóstico rápido
router.get('/status-public', async (req, res) => {
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
    console.error('❌ Erro GET /api/comunicacao/status-public:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

/* ======================================================
   CRIAR/RETORNAR COMUNICAÇÃO POR NOTIFICAÇÃO (idempotente)
   ====================================================== */
// POST /api/comunicacao/:notificacao
router.post('/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      console.warn('⚠️ ID da notificação inválido:', notificacao);
      return res.status(400).json({ ok: false, mensagem: 'ID da notificação inválido.' });
    }

    // já existe?
    let doc = await ComunicacaoPais.findOne({ notificacao });
    if (doc) {
      console.log('ℹ️ Comunicação já existia para notificação:', notificacao);
      return res.json(doc);
    }

    // cria nova
    doc = await ComunicacaoPais.create({
      notificacao,
      dataNotificacao: new Date(),
      dataInicio: new Date(),
      dataFim: new Date(),
      observacao: '',
    });

    console.log('✅ Nova comunicação criada para notificação:', notificacao);
    return res.json(doc);
  } catch (e) {
    console.error('💥 Erro POST /api/comunicacao/:notificacao', e);
    return res.status(500).json({ ok: false, mensagem: 'Falha ao criar comunicação.' });
  }
});

/* ======================================================
   BUSCA POR NOTIFICAÇÃO ESPECÍFICA
   ====================================================== */
// GET /api/comunicacao/por-notificacao/:notificacao
router.get('/por-notificacao/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "notificacao" inválido.' });
    }

    const doc = await ComunicacaoPais.findOne({ notificacao }).lean();
    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });

    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ Erro GET comunicacao por-notificacao:', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

/* ======================================================
   PDF (defina ANTES do /:id para não colidir)
   ====================================================== */
// GET /api/comunicacao/:id/pdf
router.get('/:id/pdf', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }
    if (!gerarPdfComunicacao) {
      return res.status(501).json({ mensagem: 'Geração de PDF não configurada no servidor.' });
    }

    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) return res.status(404).json({ mensagem: 'Comunicação não encontrada.' });

    const pdfBuffer = await gerarPdfComunicacao(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comunicacao-${id}.pdf`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('💥 Erro ao gerar PDF de comunicação:', e);
    return res.status(500).json({ mensagem: 'Erro ao gerar PDF.' });
  }
});

/* ======================================================
   GET/PUT por ID da COMUNICAÇÃO **ou** por ID da NOTIFICAÇÃO
   (compatível com o front: GET /api/comunicacao/:notificacao)
   ====================================================== */

// GET /api/comunicacao/:id  (tenta _id e depois notificacao)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "id" inválido.' });
    }

    // 1) tenta por _id
    let doc = await ComunicacaoPais.findById(id).lean();

    // 2) se não achou, tenta por notificacao == id
    if (!doc) {
      doc = await ComunicacaoPais.findOne({ notificacao: id }).lean();
    }

    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });
    return res.json(doc);
  } catch (e) {
    console.error('❌ Erro GET /api/comunicacao/:id', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

// PUT /api/comunicacao/:id
router.put('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, mensagem: 'ID inválido.' });
    }

    const update = {
      observacao: req.body?.observacao ?? '',
      dataInicio: req.body?.dataInicio ?? null,
      dataFim: req.body?.dataFim ?? null,
      horaApresentacao: req.body?.horaApresentacao ?? '',
      horaSaida: req.body?.horaSaida ?? '',
    };

    const doc = await ComunicacaoPais.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ ok: false, mensagem: 'Registro não encontrado.' });

    console.log(`✏️ Comunicação ${id} atualizada com sucesso.`);
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ Erro PUT /api/comunicacao/:id', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar comunicação.' });
  }
});

module.exports = router;
