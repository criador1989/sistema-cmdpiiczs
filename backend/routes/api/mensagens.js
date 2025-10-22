// routes/api/mensagens.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Mensagem = require('../../models/Mensagem');
const Usuario  = require('../../models/Usuario');
const { autenticar } = require('../../middleware/autenticacao');

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

// ======================================================
//  ENVIAR NOVA MENSAGEM (texto e/ou anexo)
//  POST /api/mensagens
// ======================================================
router.post('/', autenticar, upload.single('anexo'), async (req, res) => {
  try {
    const remetenteId = req.usuario?.id || req.usuario?._id;
    const instituicao = req.usuario?.instituicao;

    if (!remetenteId) {
      return res.status(401).json({ erro: 'Usuário não autenticado.' });
    }

    const { destinatario, conteudo = '' } = req.body;
    if (!isValidId(destinatario)) {
      return res.status(400).json({ erro: 'ID de destinatário inválido.' });
    }

    // (opcional) validar se destinatário existe
    const existe = await Usuario.exists({ _id: destinatario });
    if (!existe) return res.status(404).json({ erro: 'Destinatário não encontrado.' });

    const doc = {
      remetente: remetenteId,
      destinatario,
      conteudo: String(conteudo).trim(),
      lida: false,
      data: new Date(),
      instituicao
    };

    if (req.file) {
      doc.anexoUrl  = `/uploads/mensagens/${req.file.filename}`;
      doc.anexoNome = req.file.originalname;
      doc.anexoMime = req.file.mimetype;
    } else if (!doc.conteudo) {
      // nem texto nem anexo
      return res.status(400).json({ erro: 'Informe um texto ou anexe um arquivo.' });
    }

    const nova = await Mensagem.create(doc);
    return res.status(201).json(nova);
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    return res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
  }
});

// ======================================================
//  CONVERSA ENTRE DOIS USUÁRIOS
//  GET /api/mensagens/conversa/:idUsuario
// ======================================================
router.get('/conversa/:idUsuario', autenticar, async (req, res) => {
  try {
    const meuId   = req.usuario?.id || req.usuario?._id;
    const outroId = req.params.idUsuario;

    if (!isValidId(outroId)) {
      return res.status(400).json({ erro: 'ID inválido.' });
    }

    const msgs = await Mensagem.find({
      instituicao: req.usuario.instituicao,
      $or: [
        { remetente: meuId,   destinatario: outroId },
        { remetente: outroId, destinatario: meuId   }
      ]
    })
    .sort({ data: 1 })
    .populate('remetente', 'nome tipo')
    .populate('destinatario', 'nome tipo');

    // Marcar como lidas as que foram enviadas ao logado
    await Mensagem.updateMany(
      {
        instituicao: req.usuario.instituicao,
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

// ======================================================
//  INBOX/OUTBOX DO USUÁRIO LOGADO (histórico)
//  GET /api/mensagens
// ======================================================
router.get('/', autenticar, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id;

    const mensagens = await Mensagem.find({
      instituicao: req.usuario.instituicao,
      $or: [
        { remetente:   meuId },
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

// ======================================================
//  LISTAR USUÁRIOS (mesma instituição, exceto o próprio)
//  GET /api/mensagens/usuarios
// ======================================================
router.get('/usuarios', autenticar, async (req, res) => {
  try {
    const where = {
      instituicao: req.usuario.instituicao,
      _id: { $ne: (req.usuario.id || req.usuario._id) }
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

// ======================================================
//  NOVAS NÃO LIDAS (snapshot para badge/toasts)
//  GET /api/mensagens/novas
// ======================================================
router.get('/novas', autenticar, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id;
    const novas = await Mensagem.find({
      instituicao: req.usuario.instituicao,
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

// ======================================================
//  MARCAR COMO LIDAS (por remetente ou todas)
//  GET /api/mensagens/marcar-lidas?idUsuario=<remetenteId>
//  - se idUsuario for fornecido: marca lidas desse usuário -> para o logado
//  - se não: marca lidas de TODOS os remetentes -> para o logado
// ======================================================
router.get('/marcar-lidas', autenticar, async (req, res) => {
  try {
    const meuId = req.usuario?.id || req.usuario?._id;
    const { idUsuario } = req.query;

    const query = {
      instituicao: req.usuario.instituicao,
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
    return res.json({ ok: true, matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified });
  } catch (erro) {
    console.error('Erro ao marcar lidas:', erro);
    return res.status(500).json({ erro: 'Erro ao marcar como lidas.' });
  }
});

module.exports = router;
