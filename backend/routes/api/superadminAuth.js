'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SuperAdmin = require('../../models/SuperAdmin');
const requireSuperAdmin = require('../../middleware/requireSuperAdmin');

const router = express.Router();

const COOKIE_NAME = process.env.SUPERADMIN_COOKIE_NAME || 'superadmin_token';
const JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.SUPERADMIN_JWT_EXPIRES || '12h';

function signSuperAdminToken(superAdmin) {
  return jwt.sign(
    {
      id: String(superAdmin._id),
      email: superAdmin.email,
      tipo: 'superadmin'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 12
  });
}

router.post('/login', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({
        ok: false,
        erro: 'SUPERADMIN_JWT_SECRET/JWT_SECRET não configurado.'
      });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');

    if (!email || !senha) {
      return res.status(400).json({
        ok: false,
        erro: 'Informe e-mail e senha.'
      });
    }

    const superAdmin = await SuperAdmin.findOne({ email });

    if (!superAdmin || !superAdmin.ativo) {
      return res.status(401).json({
        ok: false,
        erro: 'Credenciais inválidas.'
      });
    }

    const senhaOk = await bcrypt.compare(senha, superAdmin.senhaHash);
    if (!senhaOk) {
      return res.status(401).json({
        ok: false,
        erro: 'Credenciais inválidas.'
      });
    }

    const token = signSuperAdminToken(superAdmin);
    setAuthCookie(res, token);

    await SuperAdmin.updateOne(
      { _id: superAdmin._id },
      { $set: { ultimoLoginEm: new Date() } }
    );

    return res.json({
      ok: true,
      mensagem: 'Login realizado com sucesso.',
      superAdmin: {
        id: String(superAdmin._id),
        nome: superAdmin.nome,
        email: superAdmin.email,
        tipo: 'superadmin'
      }
    });
  } catch (err) {
    console.error('[superadmin/login] erro:', err);
    return res.status(500).json({
      ok: false,
      erro: 'Erro ao autenticar SuperAdmin.',
      detalhe: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
  }
});

router.get('/me', requireSuperAdmin, async (req, res) => {
  return res.json({
    ok: true,
    superAdmin: req.superAdmin
  });
});

router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  });

  return res.json({
    ok: true,
    mensagem: 'Logout realizado com sucesso.'
  });
});

module.exports = router;