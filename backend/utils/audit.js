// backend/utils/audit.js
'use strict';

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Log = require('../models/Log');
const Usuario = require('../models/Usuario');

/** ==== util: token extraction ==== */
function extrairToken(req) {
  const cookieToken =
    req?.cookies?.tokenProfessor ||
    req?.cookies?.token ||
    null;

  const auth = req?.headers?.authorization || req?.headers?.Authorization || '';
  const bearerToken = String(auth).startsWith('Bearer ') ? String(auth).slice(7).trim() : null;

  const headerToken = req?.headers?.['x-access-token'] || null;
  const queryToken = req?.query?.token || null;

  return cookieToken || bearerToken || headerToken || queryToken || null;
}

/** ==== util: ip real em proxy (Render/Nginx/etc.) ==== */
function getClientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

function normalizeStr(v) {
  return v === null || v === undefined ? null : String(v).trim();
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
      email: req.usuario.email || null,
      source: 'req.usuario',
    };
  }

  // 2) Rotas com autenticação de professor (legado)
  if (req?.professor?.id || req?.professor?._id) {
    return {
      id: String(req.professor.id || req.professor._id),
      nome: req.professor.nome || null,
      tipo: req.professor.tipo || 'professor',
      instituicao: req.professor.instituicao || null,
      email: req.professor.email || null,
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
          email: payload?.email || payload?.mail || payload?.userEmail || null,
          source: 'jwt',
        };
      }
    }
  } catch {
    // silencioso
  }

  // 5) Fallback de teste: header x-actor-id
  try {
    const actorId = req?.headers?.['x-actor-id'];
    if (actorId) {
      const u = await Usuario.findById(actorId).select('nome tipo instituicao email').lean();
      if (u) {
        return {
          id: String(actorId),
          nome: u.nome || null,
          tipo: u.tipo || null,
          instituicao: u.instituicao || null,
          email: u.email || null,
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
async function attachActor(req, res, next) {
  try {
    const actor = await resolveActor(req);
    if (actor) {
      req.actor = actor;
      res.locals.actor = actor;
    }
  } catch {
    // não bloqueia
  }
  next();
}

/** rate limit simples para avisos repetidos (por chave) */
const _warnMap = new Map(); // key -> lastTs
function warnOncePerInterval(key, msg, intervalMs = 15000) {
  const now = Date.now();
  const last = _warnMap.get(key) || 0;
  if (now - last > intervalMs) {
    _warnMap.set(key, now);
    console.warn(msg);
  }
}

function toObjectIdMaybe(id) {
  const s = String(id || '').trim();
  if (mongoose.isValidObjectId(s)) return new mongoose.Types.ObjectId(s);
  return null;
}

/**
 * Grava um log de auditoria.
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {string} params.acao
 * @param {string} params.entidade
 * @param {string|number} params.entidadeId
 * @param {string|null} [params.entidadeNome]
 * @param {Object} [params.extra]
 */
async function logAction({ req, acao, entidade, entidadeId, entidadeNome = null, extra = {} }) {
  const actor = req?.actor || (await resolveActor(req));

  const instituicao = normalizeStr(actor?.instituicao);
  const usuarioIdRaw = normalizeStr(actor?.id);
  const usuarioNome =
    actor?.nome || req?.usuario?.nome || req?.professor?.nome || null;
  const usuarioTipo =
    actor?.tipo || req?.usuario?.tipo || req?.professor?.tipo || null;
  const usuarioEmail =
    actor?.email || req?.usuario?.email || req?.professor?.email || null;

  if (!instituicao || !usuarioIdRaw) {
    warnOncePerInterval(
      'audit-missing-session',
      '[audit] ignorado: sessão sem instituicao/usuario'
    );
    return;
  }

  const usuarioObjId = toObjectIdMaybe(usuarioIdRaw);
  if (!usuarioObjId) {
    warnOncePerInterval(
      'audit-bad-userid',
      `[audit] ignorado: usuarioId inválido para ObjectId: ${usuarioIdRaw}`
    );
    return;
  }

  try {
    const doc = await Log.create({
      instituicao: String(instituicao),
      usuario: usuarioObjId,
      usuarioNome: usuarioNome || null,
      usuarioTipo: usuarioTipo || null,
      usuarioEmail: usuarioEmail ? String(usuarioEmail).toLowerCase() : null,

      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      entidadeNome: entidadeNome || null,

      detalhes: extra || {},

      ip: getClientIp(req),
      userAgent: normalizeStr(req?.headers?.['user-agent']),
    });

    // ✅ depuração curta (se quiser silenciar, pode comentar)
    console.log('[audit] gravado:', {
      _id: String(doc._id),
      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      usuario: `${usuarioNome || usuarioIdRaw} (${usuarioTipo || '—'})`,
      instituicao: String(instituicao),
    });
  } catch (err) {
    console.error('[audit] erro ao gravar log:', err?.message || err);
  }
}

module.exports = { logAction, attachActor, resolveActor };
