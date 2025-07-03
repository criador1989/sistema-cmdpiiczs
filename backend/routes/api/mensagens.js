const express = require('express');
const router = express.Router();
const Mensagem = require('../../models/Mensagem');
const Usuario = require('../../models/Usuario');
const autenticar = require('../../middleware/autenticacao');
const mongoose = require('mongoose');

// Enviar nova mensagem
router.post('/', autenticar, async (req, res) => {
  try {
    const { destinatario, conteudo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(destinatario)) {
      return res.status(400).json({ erro: 'ID de destinatário inválido' });
    }

    const novaMensagem = new Mensagem({
      remetente: req.usuario.id,
      destinatario,
      conteudo,
      lida: false
    });

    await novaMensagem.save();
    res.status(201).json(novaMensagem);
  } catch (erro) {
    console.error('Erro ao enviar mensagem:', erro);
    res.status(500).json({ erro: 'Erro ao enviar mensagem' });
  }
});

// ROTA FIXA /conversa/novas – deve vir ANTES da rota dinâmica
router.get('/conversa/novas', autenticar, (req, res) => {
  res.json({ mensagem: 'Nenhuma conversa selecionada.' });
});

// Buscar mensagens entre dois usuários
router.get('/conversa/:idUsuario', autenticar, async (req, res) => {
  try {
    const outroUsuarioId = req.params.idUsuario;

    if (!mongoose.Types.ObjectId.isValid(outroUsuarioId)) {
      return res.status(400).json({ erro: 'ID de usuário inválido' });
    }

    const mensagens = await Mensagem.find({
      $or: [
        { remetente: req.usuario.id, destinatario: outroUsuarioId },
        { remetente: outroUsuarioId, destinatario: req.usuario.id }
      ]
    }).sort({ data: 1 });

    res.json(mensagens);
  } catch (erro) {
    console.error('Erro ao buscar conversa:', erro);
    res.status(500).json({ erro: 'Erro ao buscar conversa' });
  }
});

// Buscar todas conversas do usuário logado
router.get('/', autenticar, async (req, res) => {
  try {
    const mensagens = await Mensagem.find({
      $or: [
        { remetente: req.usuario.id },
        { destinatario: req.usuario.id }
      ]
    })
    .populate('remetente', 'nome')
    .populate('destinatario', 'nome')
    .sort({ data: -1 });

    res.json(mensagens);
  } catch (erro) {
    console.error('Erro ao buscar mensagens:', erro);
    res.status(500).json({ erro: 'Erro ao buscar mensagens' });
  }
});

module.exports = router;
