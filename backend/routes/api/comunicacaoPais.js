// backend/routes/api/comunicacaoPais.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');
const mongoose = require('mongoose');
const ComunicacaoPais = require('../../models/ComunicacaoPais'); // ajuste se o nome do model for diferente

// helper: status da mensageria (sem quebrar se não existir)
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/* =========================
   ROTAS FIXAS (primeiro!)
   ========================= */

// Status protegido (usa sessão/jwt)
router.get('/status', autenticar, (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus ? m.getStatus() : {
      nodeEnv: process.env.NODE_ENV || '(unset)',
      MAIL_ENABLED: false,
      TG_ENABLED: false,
      hasTransporter: false,
      hasTelegramBot: false,
      transportMode: 'NONE',
    };
    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('Erro GET /api/comunicacao/status:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

// (Opcional) Status público para diagnóstico rápido
// REMOVA depois de testar em produção, se quiser.
router.get('/status-public', async (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus ? m.getStatus() : {
      nodeEnv: process.env.NODE_ENV || '(unset)',
      MAIL_ENABLED: false,
      TG_ENABLED: false,
      hasTransporter: false,
      hasTelegramBot: false,
      transportMode: 'NONE',
    };
    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('Erro GET /api/comunicacao/status-public:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

/* ======================================================
   ROTAS DINÂMICAS (deixe SEMPRE por último no arquivo)
   ====================================================== */

// Exemplo de consulta por notificacao (evita colisão com /status)
router.get('/por-notificacao/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "notificacao" inválido.' });
    }

    const doc = await ComunicacaoPais
      .findOne({ notificacao: new mongoose.Types.ObjectId(notificacao) })
      .lean();

    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('Erro GET comunicacao por-notificacao:', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

// (Se você realmente precisar manter uma rota genérica, deixe-a por último
// e valide o ObjectId para não colidir com caminhos fixos)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "id" inválido.' });
    }
    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('Erro GET comunicacao :id', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

module.exports = router;
