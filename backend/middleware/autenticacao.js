// middleware/autenticacao.js
'use strict';

const jwt = require('jsonwebtoken');

// tenta carregar o model Usuario (sem quebrar se não existir)
let Usuario = null;
try { Usuario = require('../models/Usuario'); } catch { /* ok */ }

function normalizeTenant(v) {
  return String(v || '').trim().toLowerCase();
}

function getTenantFromReq(req) {
  // prioridade: o que middlewares anteriores já setaram
  const direct = req.tenantId || req.tenantSlug;
  if (direct) return normalizeTenant(direct);

  // headers comuns
  const h =
    req.headers?.['x-tenant'] ||
    req.headers?.['x-tenant-slug'] ||
    null;
  if (h) return normalizeTenant(h);

  // cookie e query/body (fallbacks)
  const q = req.query?.t || req.query?.tenant;
  if (q) return normalizeTenant(q);

  const b = req.body?.t || req.body?.tenant;
  if (b) return normalizeTenant(b);

  const c = req.cookies?.tenant;
  if (c) return normalizeTenant(c);

  return '';
}

function extrairToken(req) {
  // 0) Querystring token (fallback para links do tipo ?token=... )
  const queryToken = req.query?.token;

  // 1) Cookie "token"
  const cookieToken = req.cookies?.token;

  // 2) Header Authorization: Bearer <token>
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const bearerToken = String(auth).startsWith('Bearer ') ? String(auth).slice(7).trim() : null;

  // 3) Header x-access-token (fallback comum)
  const headerToken = req.headers?.['x-access-token'];

  return cookieToken || bearerToken || headerToken || queryToken || null;
}

async function autenticar(req, res, next) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const id =
      payload.id ||
      payload._id ||
      payload.sub ||
      payload.userId;

    if (!id) {
      return res.status(401).json({ mensagem: 'Sessão inválida: id ausente no token.' });
    }

    const tipo = payload.tipo || payload.role; // 'admin' | 'monitor' | 'professor'
    const instituicao = payload.instituicao;
    const nome = payload.nome;

    if (!instituicao) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente no token.' });
    }

    // ✅ tenantId do token (novo)
    const tokenTenantId = normalizeTenant(payload.tenantId || payload.tenant || '');

    // ✅ tenant esperado do request (se houver)
    const reqTenant = getTenantFromReq(req);

    // ✅ trava multi-tenant: se os dois existirem, precisam bater
    // (isso impede token de uma escola acessar dados de outra)
    if (tokenTenantId && reqTenant && tokenTenantId !== reqTenant) {
      return res.status(403).json({ mensagem: 'Tenant inválido para esta sessão.' });
    }

    // ✅ email pode vir no token, mas se não vier a gente resolve via banco
    let email =
      payload.email ||
      payload.mail ||
      payload.userEmail ||
      null;

    // fallback no Mongo: busca email pelo id
    if (!email && Usuario?.findById) {
      const u = await Usuario.findById(id).select('email').lean().catch(() => null);
      if (u?.email) email = String(u.email).toLowerCase();
    }

    // mantém compatibilidade: req.usuario como você já usa
    req.usuario = {
      id,
      _id: id,
      nome,
      tipo,
      role: tipo || null,                 // alias útil
      instituicao,
      tenantId: tokenTenantId || reqTenant || null, // ✅ novo
      email: email ? String(email).toLowerCase() : null,
    };

    res.locals.usuario = req.usuario;

    // opcional: manter req.tenantId “setado” para rotas que vão usar isso
    if (!req.tenantId && req.usuario.tenantId) req.tenantId = req.usuario.tenantId;

    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
    }
    if (err?.name === 'JsonWebTokenError') {
      return res.status(401).json({ mensagem: 'Token inválido.' });
    }
    return res.status(401).json({ mensagem: 'Falha na autenticação.' });
  }
}

// Apenas professor
function apenasProfessor(req, res, next) {
  if (req.usuario?.tipo === 'professor') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a professores.' });
}

// Leitura liberada para professor/monitor/admin
function apenasLeitura(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'professor' || tipo === 'monitor' || tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Acesso negado.' });
}

// Monitor ou admin
function apenasMonitorOuAdmin(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'monitor' || tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a monitores ou administradores.' });
}

// Apenas admin
function apenasAdmin(req, res, next) {
  if (req.usuario?.tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a administradores.' });
}

module.exports = {
  autenticar,
  apenasProfessor,
  apenasLeitura,
  apenasMonitorOuAdmin,
  apenasAdmin
};
