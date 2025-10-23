// backend/utils/audit.js
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

/** ==== resolve o "ator" (usuário logado) ==== */
async function resolveActor(req) {
  // 1) Prioriza middlewares oficiais
  if (req?.usuario?.id || req?.usuario?._id) {
    return {
      id: String(req.usuario.id || req.usuario._id),
      nome: req.usuario.nome || null,
      tipo: req.usuario.tipo || null,
      instituicao: req.usuario.instituicao || null,
      source: 'req.usuario',
    };
  }

  // 2) Rotas com autenticação de professor
  if (req?.professor?.id || req?.professor?._id) {
    return {
      id: String(req.professor.id || req.professor._id),
      nome: req.professor.nome || null,
      tipo: req.professor.tipo || 'professor',
      instituicao: req.professor.instituicao || null,
      source: 'req.professor',
    };
  }

  // 3) Já veio de algum middleware anterior?
  if (req?.actor?.id) {
    return { ...req.actor, source: req.actor.source || 'req.actor' };
  }

  // 4) JWT presente? (cookie/header/query)
  try {
    const token = extrairToken(req);
    if (token && process.env.JWT_SECRET) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const id = payload?.id || payload?._id || payload?.sub || payload?.userId;
      if (id) {
        return {
          id: String(id),
          nome: payload?.nome || null,
          tipo: payload?.tipo || null,
          instituicao: payload?.instituicao || null,
          source: 'jwt',
        };
      }
    }
  } catch {
    // silencioso: seguimos para fallback
  }

  // 5) Fallback de teste: header x-actor-id
  try {
    const actorId = req?.headers?.['x-actor-id'];
    if (actorId) {
      const u = await Usuario.findById(actorId).select('nome tipo instituicao').lean();
      if (u) {
        return {
          id: String(actorId),
          nome: u.nome || null,
          tipo: u.tipo || null,
          instituicao: u.instituicao || null,
          source: 'header.x-actor-id',
        };
      }
    }
  } catch {
    // silencioso
  }

  return null;
}

/** ==== middleware: anexa req.actor quando disponível ==== */
async function attachActor(req, _res, next) {
  try {
    const actor = await resolveActor(req);
    if (actor) req.actor = actor;
  } catch {
    // não bloqueia a requisição
  }
  next();
}

/** rate limit simples para avisos repetidos */
let _lastWarn = 0;
function warnOncePerInterval(msg, intervalMs = 15000) {
  const now = Date.now();
  if (now - _lastWarn > intervalMs) {
    _lastWarn = now;
    console.warn(msg);
  }
}

/**
 * Grava um log de auditoria.
 * @param {Object} params
 * @param {import('express').Request} params.req - request atual
 * @param {string} params.acao - ex.: 'Cadastro de Aluno'
 * @param {string} params.entidade - ex.: 'Aluno'
 * @param {string|number} params.entidadeId - id da entidade
 * @param {string|null} [params.entidadeNome] - rótulo amigável
 * @param {Object} [params.extra] - payload adicional
 */
async function logAction({ req, acao, entidade, entidadeId, entidadeNome = null, extra = {} }) {
  // resolve ator (robusto)
  const actor = req?.actor || (await resolveActor(req));

  const instituicao = actor?.instituicao;
  const usuarioId   = actor?.id;
  const usuarioNome = actor?.nome || req?.usuario?.nome || req?.professor?.nome || null;
  const usuarioTipo = actor?.tipo || req?.usuario?.tipo || req?.professor?.tipo || null;

  if (!instituicao || !usuarioId) {
    warnOncePerInterval('[audit] ignorado: sessão sem instituicao/usuario');
    return;
  }

  try {
    const doc = await Log.create({
      instituicao,
      usuario: String(usuarioId),
      usuarioNome: usuarioNome || null,
      usuarioTipo: usuarioTipo || null,
      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      entidadeNome: entidadeNome || null,
      detalhes: extra || {},
    });

    // Log de depuração resumido
    // (comente se quiser menos verbosidade)
    console.log('[audit] gravado:', {
      _id: String(doc._id),
      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      usuario: `${usuarioNome || usuarioId} (${usuarioTipo || '—'})`,
      instituicao: String(instituicao),
    });
  } catch (err) {
    console.error('[audit] erro ao gravar log:', err?.message || err);
  }
}

module.exports = { logAction, attachActor, resolveActor };
