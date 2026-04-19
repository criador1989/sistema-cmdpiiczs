const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

/** ==== tenant ==== */
function getTenantId(req, actor = null) {
  return (
    actor?.instituicao ||
    req?.tenantId ||
    req?.instituicaoId ||
    req?.tenant?._id ||
    req?.tenant?.id ||
    req?.usuario?.tenantId ||
    req?.user?.tenantId ||
    req?.usuario?.instituicao ||
    req?.user?.instituicao ||
    req?.professor?.instituicao ||
    null
  );
}

/** ==== ip real ==== */
function getClientIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();

  return (
    req?.ip ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    null
  );
}

/** ==== forwarded chain ==== */
function getForwardedFor(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (Array.isArray(xff)) return xff.join(', ');
  if (typeof xff === 'string') return xff;
  return null;
}

/** ==== user agent simplificado ==== */
function parseUserAgent(userAgent = '') {
  const ua = String(userAgent || '').trim();
  const low = ua.toLowerCase();

  let navegador = null;
  let sistema = null;
  let dispositivo = null;

  if (low.includes('edg/')) navegador = 'Edge';
  else if (low.includes('opr/') || low.includes('opera')) navegador = 'Opera';
  else if (low.includes('chrome/') && !low.includes('edg/')) navegador = 'Chrome';
  else if (low.includes('firefox/')) navegador = 'Firefox';
  else if (low.includes('safari/') && !low.includes('chrome/')) navegador = 'Safari';

  if (low.includes('windows')) sistema = 'Windows';
  else if (low.includes('android')) sistema = 'Android';
  else if (low.includes('iphone') || low.includes('ipad') || low.includes('ios')) sistema = 'iOS';
  else if (low.includes('mac os') || low.includes('macintosh')) sistema = 'macOS';
  else if (low.includes('linux')) sistema = 'Linux';

  if (low.includes('mobile') || low.includes('android') || low.includes('iphone')) dispositivo = 'Mobile';
  else if (low.includes('ipad') || low.includes('tablet')) dispositivo = 'Tablet';
  else dispositivo = 'Desktop';

  return {
    navegador,
    sistema,
    dispositivo
  };
}

/** ==== request ids ==== */
function ensureRequestId(req) {
  if (!req) return null;
  if (!req.requestId) {
    req.requestId =
      req?.headers?.['x-request-id'] ||
      (typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  }
  return req.requestId;
}

function ensureCorrelationId(req) {
  if (!req) return null;
  if (!req.correlationId) {
    req.correlationId =
      req?.headers?.['x-correlation-id'] ||
      req?.headers?.['x-request-id'] ||
      (typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  }
  return req.correlationId;
}

function ensureSessionId(req, actor = null) {
  if (!req) return null;

  if (!req.sessionIdAudit) {
    const cookieSid =
      req?.cookies?.['connect.sid'] ||
      req?.cookies?.sessionId ||
      null;

    req.sessionIdAudit =
      cookieSid ||
      req?.headers?.['x-session-id'] ||
      req?.sessionID ||
      (actor?.id ? `actor:${actor.id}` : null);
  }

  return req.sessionIdAudit || null;
}

/** ==== resolve o "ator" ==== */
async function resolveActor(req) {
  if (req?.usuario?.id || req?.usuario?._id) {
    return {
      id: String(req.usuario.id || req.usuario._id),
      nome: req.usuario.nome || null,
      tipo: req.usuario.tipo || null,
      email: req.usuario.email || null,
      instituicao: req.usuario.instituicao || null,
    };
  }

  if (req?.professor?.id || req?.professor?._id) {
    return {
      id: String(req.professor.id || req.professor._id),
      nome: req.professor.nome || null,
      tipo: req.professor.tipo || 'professor',
      email: req.professor.email || null,
      instituicao: req.professor.instituicao || null,
    };
  }

  try {
    const token = extrairToken(req);
    if (token && process.env.JWT_SECRET) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const id = payload?.id || payload?._id;

      if (id) {
        let nome = payload?.nome || null;
        let tipo = payload?.tipo || null;
        let email = payload?.email || null;
        let instituicao = payload?.instituicao || null;

        // fallback opcional no banco se payload vier incompleto
        if ((!nome || !tipo || !email || !instituicao) && Usuario) {
          try {
            const usuario = await Usuario.findById(id)
              .select('nome tipo email instituicao')
              .lean();

            if (usuario) {
              nome = nome || usuario.nome || null;
              tipo = tipo || usuario.tipo || null;
              email = email || usuario.email || null;
              instituicao = instituicao || usuario.instituicao || null;
            }
          } catch {}
        }

        return {
          id: String(id),
          nome,
          tipo,
          email,
          instituicao,
        };
      }
    }
  } catch {}

  return null;
}

async function attachActor(req, _res, next) {
  try {
    const actor = await resolveActor(req);
    if (actor) {
      req.actor = actor;
      ensureRequestId(req);
      ensureCorrelationId(req);
      ensureSessionId(req, actor);
    }
  } catch {}
  next();
}

/** =========================================
 * aceita tanto formato novo quanto antigo
========================================= */
function normalizarCampos(input = {}) {
  return {
    acao: input.acao || input.event || null,
    entidade: input.entidade || input.targetType || null,
    entidadeId: input.entidadeId || input.targetId || null,
    entidadeNome: input.entidadeNome || null,
    extra: input.extra || input.meta || {},
    aluno: input.aluno || null,
    alunoNome: input.alunoNome || null,
    modulo: input.modulo || input.module || null,
    categoria: input.categoria || input.category || null,
    severidade: input.severidade || input.level || null,
    status: input.status || null,
    motivo: input.motivo || input.reason || null,
    antes: input.antes ?? input.before ?? null,
    depois: input.depois ?? input.after ?? null,
    erro: input.erro || input.error || null,
    tempoExecucaoMs: input.tempoExecucaoMs ?? input.durationMs ?? null,
    correlationId: input.correlationId || null,
    requestId: input.requestId || null,
    sessionId: input.sessionId || null,
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    origem: input.origem || input.source || null
  };
}

function sanitizeObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value;
}

function sanitizeError(err) {
  if (!err) return null;
  if (typeof err === 'string') return { mensagem: err };
  return {
    mensagem: err.message || String(err),
    nome: err.name || null,
    stack: err.stack || null,
    codigo: err.code || null,
    statusCode: err.statusCode || err.status || null
  };
}

function buildRequestContext(req, fallbackStatus = null) {
  return {
    method: req?.method || null,
    path: req?.path || null,
    originalUrl: req?.originalUrl || null,
    baseUrl: req?.baseUrl || null,
    routePath: req?.route?.path || null,
    statusCode: req?.res?.statusCode || fallbackStatus || null,
    origin: req?.headers?.origin || null,
    referer: req?.headers?.referer || req?.headers?.referrer || null,
    host: req?.headers?.host || null,
    protocolo: req?.protocol || null,
    ip: getClientIp(req),
    forwardedFor: getForwardedFor(req)
  };
}

function buildAtorSnapshot(actor) {
  if (!actor) return {};
  return {
    id: actor.id ? String(actor.id) : null,
    nome: actor.nome || null,
    tipo: actor.tipo || null,
    email: actor.email || null,
    instituicao: actor.instituicao ? String(actor.instituicao) : null
  };
}

/** ==== grava log ==== */
async function logAction(params = {}) {
  const { req } = params;

  const {
    acao,
    entidade,
    entidadeId,
    entidadeNome,
    extra,
    aluno,
    alunoNome,
    modulo,
    categoria,
    severidade,
    status,
    motivo,
    antes,
    depois,
    erro,
    tempoExecucaoMs,
    correlationId,
    requestId,
    sessionId,
    ip,
    userAgent,
    origem
  } = normalizarCampos(params);

  const actor = req?.actor || (await resolveActor(req));
  const instituicao = getTenantId(req, actor);

  if (!instituicao || !actor?.id) {
  console.warn('[audit] ignorado: sem ator', {
    instituicao,
    actor,
    usuario: req?.usuario,
    user: req?.user,
    professor: req?.professor,
    actorReq: req?.actor
  });
  return;
}

if (!acao || !entidade || !entidadeId) {
  console.warn('[audit] ignorado: campos incompletos', {
    acao,
    entidade,
    entidadeId,
    params
  });
  return;
}

  const requestIdFinal = requestId || ensureRequestId(req);
  const correlationIdFinal = correlationId || ensureCorrelationId(req);
  const sessionIdFinal = sessionId || ensureSessionId(req, actor);

  const uaFinal = userAgent || req?.headers?.['user-agent'] || null;
  const ipFinal = ip || getClientIp(req);
  const origemFinal = origem || req?.headers?.origin || null;
  const parsedUA = parseUserAgent(uaFinal);

  const payload = {
    instituicao: String(instituicao),
    usuario: actor.id,
    usuarioNome: actor.nome || null,
    usuarioTipo: actor.tipo || null,
    usuarioEmail: actor.email || null,

    acao,
    entidade,
    entidadeId: String(entidadeId),
    entidadeNome: entidadeNome || null,

    aluno: aluno || null,
    alunoNome: alunoNome || null,

    modulo: modulo || null,
    categoria: categoria || null,
    severidade: severidade || null,
    status: status || 'sucesso',
    motivo: motivo || null,

    sessionId: sessionIdFinal || null,
    correlationId: correlationIdFinal || null,
    requestId: requestIdFinal || null,
    tempoExecucaoMs: Number.isFinite(tempoExecucaoMs) && tempoExecucaoMs >= 0
      ? tempoExecucaoMs
      : null,

    ip: ipFinal || null,
    userAgent: uaFinal || null,
    dispositivo: parsedUA.dispositivo || null,
    navegador: parsedUA.navegador || null,
    sistema: parsedUA.sistema || null,
    origem: origemFinal || null,

    requestContext: buildRequestContext(req),
    ator: buildAtorSnapshot(actor),

    antes: antes ?? null,
    depois: depois ?? null,

    detalhes: sanitizeObject(extra, {}),
    erro: sanitizeError(erro)
  };

  try {
    await Log.create(payload);

    console.log('[audit] gravado:', {
      acao,
      entidade,
      entidadeId,
      status: payload.status
    });
  } catch (err) {
    console.error('[audit] erro ao gravar log:', err?.message || err);
  }
}

/** ==== helper para erro ==== */
async function logError(params = {}) {
  return logAction({
    ...params,
    status: params.status || 'erro',
    severidade: params.severidade || 'critica',
    erro: params.erro || params.error || 'Erro não especificado'
  });
}

module.exports = {
  logAction,
  logError,
  attachActor,
  resolveActor,
  extrairToken
};