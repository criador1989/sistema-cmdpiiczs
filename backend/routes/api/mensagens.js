// backend/routes/api/mensagens.js
const express = require('express');
const router = express.Router();
const Mensagem = require('../../models/Mensagem');
const Usuario = require('../../models/Usuario');
const autenticar = require('../../middleware/autenticacao');

// POST /api/mensagens - enviar nova mensagem
router.post('/', autenticar, async (req, res) => {
  try {
    const { destinatario, conteudo } = req.body;
    if (!destinatario || !conteudo) {
      return res.status(400).json({ erro: 'Destinatário e conteúdo são obrigatórios.' });
    }

    const nova = new Mensagem({
      remetente: req.usuario._id,
      destinatario,
      conteudo,
      data: new Date()
    });
    await nova.save();
    res.status(201).json(nova);
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    res.status(500).json({ erro: 'Erro interno ao enviar mensagem.' });
  }
});

// GET /api/mensagens - mensagens recebidas
router.get('/', autenticar, async (req, res) => {
  try {
    const mensagens = await Mensagem.find({ destinatario: req.usuario._id })
      .populate('remetente', 'nome tipo')
      .sort({ data: -1 });
    res.json(mensagens);
  } catch (erro) {
    console.error('Erro ao buscar mensagens:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar mensagens.' });
  }
});

// GET /api/mensagens/:id - mensagens com um usuário específico
router.get('/:id', autenticar, async (req, res) => {
  try {
    const outroId = req.params.id;
    const mensagens = await Mensagem.find({
      $or: [
        { remetente: req.usuario._id, destinatario: outroId },
        { remetente: outroId, destinatario: req.usuario._id }
      ]
    }).sort({ data: 1 });
    res.json(mensagens);
  } catch (erro) {
    console.error('Erro ao buscar conversa:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar conversa.' });
  }
});

// GET /api/usuarios - lista de todos os usuários (para fins de conversa)
router.get('/usuarios', autenticar, async (req, res) => {
  try {
    const usuarios = await Usuario.find({ _id: { $ne: req.usuario._id } }).select('nome tipo');
    res.json(usuarios);
  } catch (erro) {
    console.error('Erro ao listar usuários:', erro);
    res.status(500).json({ erro: 'Erro interno ao listar usuários.' });
  }
});

module.exports = router;
