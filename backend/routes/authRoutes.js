// routes/auth.js  (ou backend/routes/auth.js)
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Usuario = require('../models/Usuario');
const { autenticar } = require('../middleware/autenticacao');

/**
 * POST /auth/login
 * Faz login de qualquer usuário ativo (admin/monitor/professor).
 * Retorna cookie + payload básico.
 */
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await Usuario.findOne({ email: email.trim().toLowerCase(), ativo: true }).select('+senha');
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Senha incorreta.' });
    }

    // Assina o JWT com todos os campos essenciais
    const payload = {
      id: String(usuario._id),
      tipo: usuario.tipo,
      nome: usuario.nome,
      instituicao: String(usuario.instituicao),
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });

    // Define cookie seguro (httpOnly, expira em 2h)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000, // 2h
    });

    return res.json({
      mensagem: 'Login realizado com sucesso.',
      token, // opcional: útil para apps mobile
      usuario: {
        id: String(usuario._id),
        nome: usuario.nome,
        tipo: usuario.tipo,
        instituicao: String(usuario.instituicao),
      },
    });
  } catch (error) {
    console.error('Erro /auth/login:', error);
    res.status(500).json({ mensagem: 'Erro interno ao fazer login.', erro: error.message });
  }
});

/**
 * POST /auth/cadastrar
 * Apenas administradores podem criar novos usuários.
 */
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, instituicao, tipo } = req.body;

  try {
    // Evita duplicidade dentro da mesma instituição
    const existente = await Usuario.findOne({ email: email.trim().toLowerCase(), instituicao });
    if (existente) {
      return res.status(400).json({ mensagem: 'E-mail já está em uso nesta instituição.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = new Usuario({
      nome,
      email: email.trim().toLowerCase(),
      senha: senhaHash,
      tipo: tipo || 'monitor',
      instituicao,
    });

    await novoUsuario.save();

    res.status(201).json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    console.error('Erro /auth/cadastrar:', error);
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

/**
 * GET /auth/usuario-logado
 * Retorna dados básicos do usuário autenticado (sem senha).
 */
router.get('/usuario-logado', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id)
      .select('-senha -__v')
      .populate('instituicao', 'nome');
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }
    res.json(usuario);
  } catch (error) {
    console.error('Erro /auth/usuario-logado:', error);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário logado.' });
  }
});

/**
 * POST /auth/logout
 * Limpa o cookie JWT e encerra a sessão.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

module.exports = router;
