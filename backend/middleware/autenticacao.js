'use strict';

const jwt = require('jsonwebtoken');

let Usuario = null;
try {
  Usuario = require('../models/Usuario');
} catch {
  Usuario = null;
}

function extrairToken(req) {
  const queryToken = req.query?.token;
  const cookieToken = req.cookies?.token;

  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const bearerToken = String(auth).startsWith('Bearer ')
    ? String(auth).slice(7).trim()
    : null;

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

    const id = payload.id || payload._id || payload.sub || payload.userId;
    if (!id) {
      return res.status(401).json({ mensagem: 'Sessão inválida: id ausente no token.' });
    }

    const tipo = String(payload.tipo || '').trim().toLowerCase();
    const instituicao = String(payload.instituicao || '').trim();
    const nome = payload.nome || null;

    if (!instituicao) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente no token.' });
    }

    let email = payload.email || payload.mail || payload.userEmail || null;
    let turmas = Array.isArray(payload.turmas) ? payload.turmas : [];
    let tenantId = payload.tenantId || null;
    let escopoObservatorio = payload.escopoObservatorio || null;

    if (Usuario?.findById) {
      const usuarioDb = await Usuario.findById(id)
        .select('email tipo instituicao tenantId nome turmas alunoId portal escopoObservatorio')
        .lean()
        .catch(() => null);

      if (usuarioDb) {
        if (usuarioDb.email) email = usuarioDb.email;
        if (usuarioDb.tipo) {
          // banco prevalece se existir
          payload.tipo = usuarioDb.tipo;
        }
        if (usuarioDb.nome) {
          payload.nome = usuarioDb.nome;
        }
        if (usuarioDb.instituicao) {
          payload.instituicao = usuarioDb.instituicao;
        }
        if (usuarioDb.tenantId) {
          tenantId = usuarioDb.tenantId;
        }
        if (usuarioDb.escopoObservatorio) {
          escopoObservatorio = usuarioDb.escopoObservatorio;
        }
        if (Array.isArray(usuarioDb.turmas)) {
          turmas = usuarioDb.turmas;
        }
      }
    }

    req.usuario = {
      id,
      _id: id,
      nome: payload.nome || nome,
      tipo: String(payload.tipo || tipo || '').trim().toLowerCase(),
      instituicao: String(payload.instituicao || instituicao || '').trim(),
      tenantId: tenantId ? String(tenantId) : String(payload.instituicao || instituicao || '').trim(),
      email: email ? String(email).toLowerCase() : null,
      turmas: Array.isArray(turmas) ? turmas : [],
      alunoId: payload.alunoId ? String(payload.alunoId) : null,
      portal: payload.portal || (String(payload.tipo || tipo || '').toLowerCase() === 'aluno' ? 'aluno' : null),
      escopoObservatorio: escopoObservatorio || null,
    };

    if (!req.usuario.instituicao) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente.' });
    }

    res.locals.usuario = req.usuario;
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

function apenasProfessor(req, res, next) {
  if (req.usuario?.tipo === 'professor') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a professores.' });
}

function apenasLeitura(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'professor' || tipo === 'monitor' || tipo === 'admin' || tipo === 'master' || tipo === 'superadmin' || tipo === 'secretaria') {
    return next();
  }
  return res.status(403).json({ mensagem: 'Acesso negado.' });
}

function apenasMonitorOuAdmin(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'monitor' || tipo === 'admin' || tipo === 'master' || tipo === 'superadmin') {
    return next();
  }
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a monitores ou administradores.' });
}

function apenasAdmin(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'admin' || tipo === 'master' || tipo === 'superadmin') {
    return next();
  }
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a administradores.' });
}

module.exports = {
  autenticar,
  apenasProfessor,
  apenasLeitura,
  apenasMonitorOuAdmin,
  apenasAdmin
};
