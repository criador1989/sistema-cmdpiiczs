const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Usuario = require('../models/Usuario');
const autenticar = require('../middleware/autenticacao');

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await Usuario.findOne({ email }).select('+senha');
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Usuário não encontrado.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Senha incorreta.' });
    }

    const token = jwt.sign(
      {
        id: usuario._id,
        tipo: usuario.tipo,
        instituicao: usuario.instituicao
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000 // 2 horas
    });

    res.json({
      mensagem: 'Login realizado com sucesso',
      tipo: usuario.tipo,
      nome: usuario.nome
    });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao fazer login.', erro: error.message });
  }
});

// POST /auth/cadastrar - Apenas admin pode criar
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, instituicao, tipo } = req.body;

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
      tipo, // tipo vindo do formulário: "professor", "monitor", ou "admin"
      instituicao
    });

    await novoUsuario.save();

    res.status(201).json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

// GET /auth/usuario-logado - Retorna dados do usuário autenticado
router.get('/usuario-logado', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-senha');
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao buscar usuário logado.' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

module.exports = router;
