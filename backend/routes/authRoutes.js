const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Usuario = require('../models/Usuario');
const autenticar = require('../middleware/autenticar');

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Usuário não encontrado.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Senha incorreta.' });
    }

    const token = jwt.sign(
      { id: usuario._id, tipo: usuario.tipo },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      token,
      usuario: {
        nome: usuario.nome,
        tipo: usuario.tipo
      }
    });

  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao fazer login.', erro: error.message });
  }
});

// Cadastro de novo usuário - apenas ADMIN
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, instituicao } = req.body;

  try {
    const existente = await Usuario.findOne({ email });
    if (existente) {
      return res.status(400).json({ mensagem: 'E-mail já está em uso.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = new Usuario({
      nome,
      email,
      senha: senhaHash,
      tipo: 'professor', // padrão
      instituicao
    });

    await novoUsuario.save();

    res.status(201).json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

module.exports = router;
