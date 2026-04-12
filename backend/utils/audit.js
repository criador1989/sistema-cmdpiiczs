const jwt = require('jsonwebtoken');
const Log = require('../models/Log');
const Usuario = require('../models/Usuario');

/** ==== util: token extraction ==== */
function extrairToken(req) {
  const cookieToken =
    req?.cookies?.tokenProfessor ||
    req?.cookies?.token ||
    null;

  const auth = req?.headers?.authorization || '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  const headerToken = req?.headers?.['x-access-token'] || null;
  const queryToken = req?.query?.token || null;

  return cookieToken || bearerToken || headerToken || queryToken || null;
}

/** ==== resolve o "ator" ==== */
async function resolveActor(req) {
  if (req?.usuario?.id || req?.usuario?._id) {
    return {
      id: String(req.usuario.id || req.usuario._id),
      nome: req.usuario.nome || null,
      tipo: req.usuario.tipo || null,
      instituicao: req.usuario.instituicao || null,
    };
  }

  if (req?.professor?.id || req?.professor?._id) {
    return {
      id: String(req.professor.id || req.professor._id),
      nome: req.professor.nome || null,
      tipo: req.professor.tipo || 'professor',
      instituicao: req.professor.instituicao || null,
    };
  }

  try {
    const token = extrairToken(req);
    if (token && process.env.JWT_SECRET) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const id = payload?.id || payload?._id;
      if (id) {
        return {
          id: String(id),
          nome: payload?.nome || null,
          tipo: payload?.tipo || null,
          instituicao: payload?.instituicao || null,
        };
      }
    }
  } catch {}

  return null;
}

async function attachActor(req, _res, next) {
  try {
    const actor = await resolveActor(req);
    if (actor) req.actor = actor;
  } catch {}
  next();
}

/** =========================================
 * 🔥 CORREÇÃO PRINCIPAL AQUI
 * aceita tanto formato novo quanto antigo
========================================= */
function normalizarCampos(input = {}) {
  return {
    acao: input.acao || input.event || null,
    entidade: input.entidade || input.targetType || null,
    entidadeId: input.entidadeId || input.targetId || null,
    entidadeNome: input.entidadeNome || null,
    extra: input.extra || input.meta || {}
  };
}

/** ==== grava log ==== */
async function logAction(params) {
  const { req } = params;

  const {
    acao,
    entidade,
    entidadeId,
    entidadeNome,
    extra
  } = normalizarCampos(params);

  const actor = req?.actor || (await resolveActor(req));

  if (!actor?.instituicao || !actor?.id) {
    console.warn('[audit] ignorado: sem ator');
    return;
  }

  // 🔒 proteção contra campos faltando
  if (!acao || !entidade || !entidadeId) {
    console.warn('[audit] ignorado: campos incompletos', {
      acao,
      entidade,
      entidadeId
    });
    return;
  }

  try {
    await Log.create({
      instituicao: actor.instituicao,
      usuario: actor.id,
      usuarioNome: actor.nome || null,
      usuarioTipo: actor.tipo || null,
      acao,
      entidade,
      entidadeId: String(entidadeId),
      entidadeNome: entidadeNome || null,
      detalhes: extra || {}
    });

    console.log('[audit] gravado:', {
      acao,
      entidade,
      entidadeId
    });

  } catch (err) {
    console.error('[audit] erro ao gravar log:', err?.message || err);
  }
}

module.exports = { logAction, attachActor };