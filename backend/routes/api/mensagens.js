const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Mensagem = require('../../models/Mensagem');
const Usuario = require('../../models/Usuario');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

// ====== Upload de anexos ======
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'mensagens');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}__${safe}`);
  }
});
const upload = multer({ storage });

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================================
   HELPERS MULTI-TENANT
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

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

/* ======================================================
   ENVIAR NOVA MENSAGEM (texto e/ou anexo)
   POST /api/mensagens
====================================================== */
router.post('/', autenticar, requireTenant, upload.single('anexo'), async (req, res) => {
  try {
    const remetenteId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const tenantId = getTenantId(req);

    if (!remetenteId || !tenantId) {
      return res.status(401).json({ erro: 'Usuário não autenticado.' });
    }

    const { destinatario, conteudo = '' } = req.body;
    if (!isValidId(destinatario)) {
      return res.status(400).json({ erro: 'ID de destinatário inválido.' });
    }

    const existe = await Usuario.exists({
      _id: destinatario,
      ...buildTenantMatch(tenantId)
    });

    if (!existe) {
      return res.status(404).json({ erro: 'Destinatário não encontrado.' });
    }

    const doc = tenantData(req, {
      remetente: remetenteId,
      destinatario,
      conteudo: String(conteudo).trim(),
      lida: false,
      data: new Date()
    });

    if (req.file) {
      doc.anexoUrl = `/uploads/mensagens/${req.file.filename}`;
      doc.anexoNome = req.file.originalname;
      doc.anexoMime = req.file.mimetype;
    } else if (!doc.conteudo) {
      return res.status(400).json({ erro: 'Informe um texto ou anexe um arquivo.' });
    }

    const nova = await Mensagem.create(doc);
    return res.status(201).json(nova);
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    return res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

/* ======================================================
   CONVERSA ENTRE DOIS USUÁRIOS
   GET /api/mensagens/conversa/:idUsuario
====================================================== */
router.get('/conversa/:idUsuario', autenticar, requireTenant, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const outroId = req.params.idUsuario;
    const tenantId = getTenantId(req);

    if (!isValidId(outroId)) {
      return res.status(400).json({ erro: 'ID inválido.' });
    }

    const msgs = await Mensagem.find({
      ...buildTenantMatch(tenantId),
      $or: [
        { remetente: meuId, destinatario: outroId },
        { remetente: outroId, destinatario: meuId }
      ]
    })
      .sort({ data: 1 })
      .populate('remetente', 'nome tipo')
      .populate('destinatario', 'nome tipo');

    await Mensagem.updateMany(
      {
        ...buildTenantMatch(tenantId),
        destinatario: meuId,
        remetente: outroId,
        lida: false
      },
      { $set: { lida: true } }
    );

    return res.json(msgs);
  } catch (erro) {
    console.error('Erro ao buscar conversa:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar conversa.' });
  }
});

/* ======================================================
   INBOX/OUTBOX DO USUÁRIO LOGADO (histórico)
   GET /api/mensagens
====================================================== */
router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const tenantId = getTenantId(req);

    const mensagens = await Mensagem.find({
      ...buildTenantMatch(tenantId),
      $or: [
        { remetente: meuId },
        { destinatario: meuId }
      ]
    })
      .populate('remetente', 'nome tipo')
      .populate('destinatario', 'nome tipo')
      .sort({ data: -1 });

    return res.json(mensagens);
  } catch (erro) {
    console.error('Erro ao buscar mensagens:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar mensagens.' });
  }
});

/* ======================================================
   LISTAR USUÁRIOS (mesma instituição, exceto o próprio)
   GET /api/mensagens/usuarios
====================================================== */
router.get('/usuarios', autenticar, requireTenant, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const tenantId = getTenantId(req);

    const where = {
      ...buildTenantMatch(tenantId),
      _id: { $ne: meuId }
    };

    const usuarios = await Usuario.find(where)
      .select('_id nome tipo email')
      .sort({ nome: 1 });

    return res.json(usuarios);
  } catch (erro) {
    console.error('Erro ao listar usuários:', erro);
    return res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

/* ======================================================
   NOVAS NÃO LIDAS (snapshot para badge/toasts)
   GET /api/mensagens/novas
====================================================== */
router.get('/novas', autenticar, requireTenant, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const tenantId = getTenantId(req);

    const novas = await Mensagem.find({
      ...buildTenantMatch(tenantId),
      destinatario: meuId,
      lida: false
    })
      .populate('remetente', 'nome tipo')
      .sort({ data: 1 });

    return res.json(novas);
  } catch (erro) {
    console.error('Erro ao buscar novas mensagens:', erro);
    return res.status(500).json({ erro: 'Erro ao buscar novas mensagens.' });
  }
});

/* ======================================================
   MARCAR COMO LIDAS (por remetente ou todas)
   GET /api/mensagens/marcar-lidas?idUsuario=<remetenteId>
====================================================== */
router.get('/marcar-lidas', autenticar, requireTenant, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id || req.user?.id || req.user?._id;
    const tenantId = getTenantId(req);
    const { idUsuario } = req.query;

    const query = {
      ...buildTenantMatch(tenantId),
      destinatario: meuId,
      lida: false
    };

    if (idUsuario) {
      if (!isValidId(idUsuario)) {
        return res.status(400).json({ erro: 'ID inválido para idUsuario.' });
      }
      query.remetente = idUsuario;
    }

    const r = await Mensagem.updateMany(query, { $set: { lida: true } });

    return res.json({
      ok: true,
      matched: r.matchedCount ?? r.n,
      modified: r.modifiedCount ?? r.nModified
    });
  } catch (erro) {
    console.error('Erro ao marcar lidas:', erro);
    return res.status(500).json({ erro: 'Erro ao marcar como lidas.' });
  }
});

module.exports = router;