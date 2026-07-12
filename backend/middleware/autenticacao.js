'use strict';

const jwt = require('jsonwebtoken');

let Usuario = null;
let UsuarioVinculoInstituicao = null;
let montarUsuarioEfetivo = null;

try {
  Usuario = require('../models/Usuario');
  UsuarioVinculoInstituicao = require('../models/UsuarioVinculoInstituicao');
  ({ montarUsuarioEfetivo } = require('../services/usuarioVinculos'));
} catch {
  Usuario = null;
  UsuarioVinculoInstituicao = null;
  montarUsuarioEfetivo = null;
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

function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
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

    const instituicaoToken = String(payload.instituicao || payload.tenantId || '').trim();
    if (!instituicaoToken) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente no token.' });
    }

    let efetivo = {
      _id: id,
      id,
      nome: payload.nome || null,
      email: payload.email || payload.mail || payload.userEmail || null,
      tipo: String(payload.tipo || '').trim().toLowerCase(),
      instituicao: instituicaoToken,
      tenantId: instituicaoToken,
      turmas: Array.isArray(payload.turmas) ? payload.turmas : [],
      alunoId: payload.alunoId || null,
      portal: payload.portal || null,
      escopoObservatorio: payload.escopoObservatorio || null,
      acessosModulos: payload.acessosModulos || null,
      vinculoId: payload.vinculoId || null,
    };

    if (Usuario?.findById) {
      const usuarioDb = await Usuario.findById(id)
        .select('email tipo instituicao tenantId nome turmas alunoId portal escopoObservatorio acessosModulos ativo')
        .lean()
        .catch(() => null);

      if (!usuarioDb || usuarioDb.ativo === false) {
        return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
      }

      const instituicaoPrimaria = usuarioDb.instituicao || usuarioDb.tenantId;
      const precisaVinculo = Boolean(payload.vinculoId) || !sameId(instituicaoPrimaria, instituicaoToken);

      if (precisaVinculo) {
        if (!UsuarioVinculoInstituicao || !montarUsuarioEfetivo) {
          return res.status(401).json({ mensagem: 'Sessão multi-institucional indisponível.' });
        }

        const filtro = {
          usuario: id,
          instituicao: instituicaoToken,
          ativo: true,
        };
        if (payload.vinculoId) filtro._id = payload.vinculoId;

        const vinculo = await UsuarioVinculoInstituicao.findOne(filtro).lean().catch(() => null);
        if (!vinculo) {
          return res.status(401).json({ mensagem: 'Seu vínculo com este ambiente foi removido ou está inativo.' });
        }

        efetivo = montarUsuarioEfetivo(usuarioDb, vinculo, instituicaoToken);
      } else if (montarUsuarioEfetivo) {
        efetivo = montarUsuarioEfetivo(usuarioDb, null, instituicaoToken);
      } else {
        efetivo = { ...usuarioDb, instituicao: instituicaoToken, tenantId: instituicaoToken };
      }
    }

    req.usuario = {
      id: String(efetivo._id || efetivo.id || id),
      _id: String(efetivo._id || efetivo.id || id),
      nome: efetivo.nome || payload.nome || null,
      tipo: String(efetivo.tipo || payload.tipo || '').trim().toLowerCase(),
      instituicao: String(efetivo.instituicao || instituicaoToken),
      tenantId: String(efetivo.tenantId || efetivo.instituicao || instituicaoToken),
      email: efetivo.email ? String(efetivo.email).toLowerCase() : null,
      turmas: Array.isArray(efetivo.turmas) ? efetivo.turmas : [],
      alunoId: efetivo.alunoId ? String(efetivo.alunoId) : null,
      portal: efetivo.portal || (String(efetivo.tipo || '').toLowerCase() === 'aluno' ? 'aluno' : null),
      escopoObservatorio: efetivo.escopoObservatorio || null,
      acessosModulos: efetivo.acessosModulos || null,
      associacaoAcesso: efetivo.acessosModulos?.associacao || null,
      vinculoId: efetivo.vinculoId || payload.vinculoId || null,
      identidadePrimariaInstituicao: efetivo.identidadePrimariaInstituicao || null,
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
    console.error('[autenticacao] falha:', err?.message || err);
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
