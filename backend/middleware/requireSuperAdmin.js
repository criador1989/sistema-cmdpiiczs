'use strict';

const jwt = require('jsonwebtoken');
const SuperAdmin = require('../models/SuperAdmin');

const COOKIE_NAME = process.env.SUPERADMIN_COOKIE_NAME || 'superadmin_token';
const JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('[requireSuperAdmin] SUPERADMIN_JWT_SECRET/JWT_SECRET não configurado.');
}

async function requireSuperAdmin(req, res, next) {
  try {
    const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : null;

    const token = req.cookies?.[COOKIE_NAME] || bearer;

    if (!token) {
      return res.status(401).json({
        ok: false,
        erro: 'Acesso negado. Faça login como SuperAdmin.'
      });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (!payload || payload.tipo !== 'superadmin' || !payload.id) {
      return res.status(401).json({
        ok: false,
        erro: 'Token de SuperAdmin inválido.'
      });
    }

    const superAdmin = await SuperAdmin.findOne({
      _id: payload.id,
      ativo: true
    }).lean();

    if (!superAdmin) {
      return res.status(403).json({
        ok: false,
        erro: 'SuperAdmin não encontrado ou inativo.'
      });
    }

    req.superAdmin = {
      id: String(superAdmin._id),
      nome: superAdmin.nome,
      email: superAdmin.email,
      tipo: 'superadmin'
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      erro: 'Sessão inválida ou expirada.',
      detalhe: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
  }
}

module.exports = requireSuperAdmin;