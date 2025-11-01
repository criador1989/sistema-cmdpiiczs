// backend/routes/api/comunicacaoPais.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');
const mongoose = require('mongoose');
const ComunicacaoPais = require('../../models/ComunicacaoPais');

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
    console.error('❌ Erro GET /api/comunicacao/status:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

// (Opcional) Status público para diagnóstico rápido
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
    console.error('❌ Erro GET /api/comunicacao/status-public:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

/* ======================================================
   ROTA PARA CRIAÇÃO DE COMUNICAÇÃO DE PAIS (NOVO)
   ====================================================== */

router.post('/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      console.warn('⚠️ ID da notificação inválido:', notificacao);
      return res.status(400).json({ ok: false, mensagem: 'ID da notificação inválido.' });
    }

    // procura comunicação já existente
    let doc = await ComunicacaoPais.findOne({ notificacao });
    if (doc) {
      console.log('ℹ️ Comunicação existente encontrada para notificação:', notificacao);
      return res.json(doc);
    }

    // cria nova
    const novo = new ComunicacaoPais({
      notificacao,
      dataNotificacao: new Date(),
      dataInicio: new Date(),
      dataFim: new Date(),
      observacao: '',
    });

    doc = await novo.save();
    console.log('✅ Nova comunicação criada para notificação:', notificacao);

    return res.json(doc);
  } catch (e) {
    console.error('💥 Erro POST /api/comunicacao/:notificacao', e);
    res.status(500).json({ ok: false, mensagem: 'Falha ao criar comunicação.' });
  }
});

/* ======================================================
   ROTAS DINÂMICAS (deixe SEMPRE por último no arquivo)
   ====================================================== */

// Consulta por notificacao
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
    console.error('❌ Erro GET comunicacao por-notificacao:', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

// Consulta genérica por ID
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
    console.error('❌ Erro GET comunicacao :id', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

module.exports = router;
// backend/routes/api/comunicacaoPais.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');
const mongoose = require('mongoose');
const ComunicacaoPais = require('../../models/ComunicacaoPais');
const gerarPdfComunicacao = require('../../utils/pdfComunicacao'); // helper PDF (crie se não existir)

// ===== Helper =====
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/* ======================================================
   STATUS DE MENSAGERIA
   ====================================================== */

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
   CRIA OU RETORNA COMUNICAÇÃO EXISTENTE
   ====================================================== */

router.post('/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      console.warn('⚠️ ID inválido recebido:', notificacao);
      return res.status(400).json({ ok: false, mensagem: 'ID da notificação inválido.' });
    }

    // Verifica se já existe
    let doc = await ComunicacaoPais.findOne({ notificacao });
    if (doc) {
      console.log('ℹ️ Comunicação já existente para notificação:', notificacao);
      return res.json(doc);
    }

    // Cria nova
    const novo = new ComunicacaoPais({
      notificacao,
      dataNotificacao: new Date(),
      dataInicio: new Date(),
      dataFim: new Date(),
      observacao: '',
    });

    doc = await novo.save();
    console.log('✅ Nova comunicação criada:', notificacao);
    return res.json(doc);
  } catch (e) {
    console.error('💥 Erro POST /api/comunicacao/:notificacao', e);
    res.status(500).json({ ok: false, mensagem: 'Falha ao criar comunicação.' });
  }
});

/* ======================================================
   ATUALIZA UMA COMUNICAÇÃO EXISTENTE
   ====================================================== */

router.put('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
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

    console.log(`✏️ Comunicação ${id} atualizada com sucesso.`);
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ Erro PUT /api/comunicacao/:id', e);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar comunicação.' });
  }
});

/* ======================================================
   BUSCA POR NOTIFICAÇÃO ESPECÍFICA
   ====================================================== */

router.get('/por-notificacao/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro inválido.' });
    }

    const doc = await ComunicacaoPais.findOne({ notificacao }).lean();
    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });

    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('❌ Erro GET /por-notificacao/:notificacao', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

/* ======================================================
   BUSCA GERAL POR ID
   ====================================================== */

router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, erro: 'ID inválido.' });
    }

    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });

    return res.json(doc);
  } catch (e) {
    console.error('❌ Erro GET /:id', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar comunicação.' });
  }
});

/* ======================================================
   GERAÇÃO DE PDF (download direto)
   ====================================================== */

router.get('/:id/pdf', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID inválido.' });
    }

    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) return res.status(404).json({ mensagem: 'Comunicação não encontrada.' });

    const pdfBuffer = await gerarPdfComunicacao(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=comunicacao-${id}.pdf`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('💥 Erro ao gerar PDF de comunicação:', e);
    res.status(500).json({ mensagem: 'Erro ao gerar PDF.' });
  }
});

module.exports = router;
