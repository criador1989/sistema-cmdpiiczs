// backend/utils/audit.js
const jwt = require('jsonwebtoken');
const Log = require('../models/Log');
const Usuario = require('../models/Usuario');

/**
 * Tenta montar um "ator" (usuário logado) a partir de:
 *  - req.usuario (setado pelo middleware autenticar)
 *  - cookie token (JWT)
 *  - opcional: header x-actor-id (fallback para testes)
 */
async function resolveActor(req) {
  // 1) Já veio do middleware autenticar?
  if (req && req.usuario && req.usuario.id) {
    return {
      id: String(req.usuario.id),
      nome: req.usuario.nome || null,
      tipo: req.usuario.tipo || null,
      instituicao: req.usuario.instituicao || null,
      source: 'req.usuario'
    };
  }

  // 2) Já existe req.actor de algum lugar anterior?
  if (req && req.actor && req.actor.id) {
    return { ...req.actor, source: 'req.actor' };
  }

  // 3) Tenta decodificar o JWT do cookie (se houver)
  try {
    const token = req?.cookies?.token;
    if (token && process.env.JWT_SECRET) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload?.id) {
        return {
          id: String(payload.id),
          nome: payload.nome || null,
          tipo: payload.tipo || null,
          instituicao: payload.instituicao || null,
          source: 'cookie.jwt'
        };
      }
    }
  } catch (e) {
    // silencioso; seguimos para o próximo fallback
  }

  // 4) Fallback opcional: header x-actor-id (útil em testes)
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
          source: 'header.x-actor-id'
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Middleware leve: anexa `req.actor` quando possível.
 * NÃO dá erro se não encontrar — apenas deixa req.actor nulo.
 * Use SEMPRE depois do `autenticar` nas rotas que logam.
 */
async function attachActor(req, _res, next) {
  try {
    const actor = await resolveActor(req);
    if (actor) req.actor = actor;
  } catch {}
  next();
}

/**
 * Grava um log de auditoria.
 * Campos:
 *  - req: request atual
 *  - acao: string (ex.: 'NOTIFICACAO_CRIADA')
 *  - entidade: 'Notificacao' | 'Aluno' | ...
 *  - entidadeId: id da entidade
 *  - entidadeNome: rótulo amigável (ex.: nome do aluno)
 *  - extra: objeto livre
 */
async function logAction({ req, acao, entidade, entidadeId, entidadeNome = null, extra = {} }) {
  // resolve ator de maneira robusta
  const actor = req?.actor || await resolveActor(req);

  const instituicao = actor?.instituicao;
  const usuarioId   = actor?.id;
  const usuarioNome = actor?.nome || req?.usuario?.nome || null;
  const usuarioTipo = actor?.tipo || req?.usuario?.tipo || null;

  if (!instituicao || !usuarioId) {
    console.warn('[audit] ignorado: sessão sem instituicao/usuario');
    return;
  }

  try {
    const doc = await Log.create({
      instituicao,
      usuario: usuarioId,
      usuarioNome,
      usuarioTipo,
      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      entidadeNome: entidadeNome || null,
      detalhes: extra || {}
    });

    // Log de depuração útil para você
    console.log('[audit] gravado:', {
      _id: doc._id.toString(),
      acao,
      entidade,
      entidadeId: String(entidadeId || ''),
      usuario: `${usuarioNome || usuarioId} (${usuarioTipo || '—'})`,
      instituicao
    });
  } catch (err) {
    console.error('[audit] erro ao gravar log:', err?.message || err);
  }
}

module.exports = { logAction, attachActor };
