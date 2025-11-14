// backend/routes/authRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();
const Usuario = require('../models/Usuario');
const { autenticar } = require('../middleware/autenticacao');

const isProd = process.env.NODE_ENV === 'production';

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,      // DEV (http) => false | PROD (https) => true
    sameSite: 'lax',     // não use 'none' sem secure
    path: '/',
    maxAge: 2 * 60 * 60 * 1000, // 2h
  });
}

/**
 * GET /auth/me - retorna somente o payload validado do token
 */
router.get('/me', autenticar, (req, res) => {
  return res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    tipo: req.usuario.tipo,
    instituicao: req.usuario.instituicao,
  });
});

/**
 * POST /auth/login
 */
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await Usuario.findOne({
      email: String(email || '').trim().toLowerCase(),
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    }).select('+senha');

    if (!usuario) {
      return res
        .status(401)
        .json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const senhaValida = await bcrypt.compare(
      String(senha || ''),
      usuario.senha
    );
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Senha incorreta.' });
    }

    const payload = {
      id: String(usuario._id),
      tipo: usuario.tipo,
      nome: usuario.nome,
      instituicao: String(usuario.instituicao),
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '2h',
    });
    setAuthCookie(res, token);

    const redirecionar =
      usuario.tipo === 'professor'
        ? '/painel-professor.html'
        : '/painel.html';

    return res.json({
      mensagem: 'Login realizado com sucesso.',
      redirecionar,
      token, // útil pra mobile; no web usamos cookie HttpOnly
      usuario: payload,
    });
  } catch (error) {
    console.error('Erro /auth/login:', error);
    res
      .status(500)
      .json({ mensagem: 'Erro interno ao fazer login.', erro: error.message });
  }
});

/**
 * GET /auth/usuario-logado (mantido; consulta banco)
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
    res
      .status(500)
      .json({ mensagem: 'Erro ao buscar usuário logado.' });
  }
});

/**
 * POST /auth/cadastrar (apenas admin)
 * - Não recebe mais "instituicao" no body.
 * - Usa SEMPRE a instituição do usuário logado (multi-tenant seguro).
 */
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario?.tipo !== 'admin') {
    return res
      .status(403)
      .json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, tipo = 'monitor' } = req.body;

  if (!nome || !email || !senha) {
    return res
      .status(400)
      .json({ mensagem: 'Preencha todos os campos obrigatórios.' });
  }

  const instituicaoId = req.usuario?.instituicao;
  if (!instituicaoId) {
    return res
      .status(400)
      .json({ mensagem: 'Instituição do usuário logado não encontrada.' });
  }

  try {
    const emailNormalizado = String(email).trim().toLowerCase();

    // e-mail único dentro da MESMA instituição
    const existente = await Usuario.findOne({
      email: emailNormalizado,
      instituicao: instituicaoId,
    });

    if (existente) {
      return res
        .status(409)
        .json({ mensagem: 'E-mail já está em uso nesta instituição.' });
    }

    const novoUsuario = new Usuario({
      nome,
      email: emailNormalizado,
      senha,          // hash será feito no pre('save') do model
      tipo,
      instituicao: instituicaoId,
    });

    await novoUsuario.save();

    return res
      .status(201)
      .json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    console.error('Erro /auth/cadastrar:', error);
    res
      .status(500)
      .json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

module.exports = router;
