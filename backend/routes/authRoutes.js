'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

const Usuario = require('../models/Usuario');
const {
  resolverUsuarioNoTenant,
  listarAmbientesDoUsuario,
  listarAmbientesPorEmail,
} = require('../services/usuarioVinculos');
let Instituicao = null;
let Aluno = null;

try { Instituicao = require('../models/Instituicao'); } catch {}
try { Aluno = require('../models/Aluno'); } catch {}

const { autenticar } = require('../middleware/autenticacao');
const { obterEstadoOnboardingProfessor } = require('../services/onboardingProfessor');

const isProd = process.env.NODE_ENV === 'production';

const TENANT_ALIASES = {
  cmdpii: 'cmdpii',
  'cmdpii-czs': 'cmdpii',
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'cmdpii').trim().toLowerCase();
const TIPOS_LOGIN_INSTITUCIONAL = ['admin', 'monitor', 'professor', 'secretaria'];

const { validatePasswordStrength, generateTemporaryPassword } = require('../utils/passwordPolicy');
const { normalizarTelefoneBrasil } = require('../utils/telefone');

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

function setTenantCookie(res, tenantCookie) {
  res.cookie('tenant', tenantCookie, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function isObjectIdLike(v) {
  return /^[a-f\d]{24}$/i.test(String(v || '').trim());
}

function normalizeLoginIdentifier(value) {
  return String(value || '').trim();
}

function normalizeCodigoAcesso(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeHumanName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°ª]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim()
    .toUpperCase();
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[right.length];
}

function nameMatchLevel(informed, registered) {
  const a = normalizeHumanName(informed);
  const b = normalizeHumanName(registered);
  if (!a || !b) return null;
  if (a === b) return 'EXATO_NORMALIZADO';

  const distance = levenshteinDistance(a, b);
  const longest = Math.max(a.length, b.length);
  const similarity = longest ? 1 - (distance / longest) : 0;

  // A tolerancia nunca atua sozinha: a rota tambem exige turma e nascimento exatos.
  if (distance <= 1 && longest >= 8) return 'TOLERANCIA_UNICA';
  if (distance <= 2 && longest >= 18 && similarity >= 0.93) return 'TOLERANCIA_CONTROLADA';
  return null;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const PUBLIC_AUTH_RATE = new Map();
function enforcePublicRateLimit(req, res, scope, { max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
  const tenant = String(getTenantFromReqOrDefault(req) || 'default').toLowerCase();
  const key = `${scope}:${tenant}:${ip}`;
  let state = PUBLIC_AUTH_RATE.get(key);

  if (!state || state.resetAt <= now) {
    state = { count: 0, resetAt: now + windowMs };
  }
  state.count += 1;
  PUBLIC_AUTH_RATE.set(key, state);

  // Limpeza oportunista para evitar crescimento indefinido no processo.
  if (PUBLIC_AUTH_RATE.size > 5000) {
    for (const [bucketKey, bucket] of PUBLIC_AUTH_RATE.entries()) {
      if (bucket.resetAt <= now) PUBLIC_AUTH_RATE.delete(bucketKey);
    }
  }

  if (state.count > max) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((state.resetAt - now) / 1000))));
    res.status(429).json({
      code: 'RATE_LIMITED',
      mensagem: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
    });
    return false;
  }
  return true;
}

function pickRequestBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function pickPortalAlunoBaseUrl(req) {
  // O Portal do Aluno e servido pelo proprio backend. Nao usar PUBLIC_SITE_URL/
  // CLIENT_URL aqui, pois essas variaveis podem apontar para o site institucional.
  const explicit = process.env.PORTAL_ALUNO_URL || process.env.PORTAL_ALUNO_BASE_URL;
  if (explicit) return String(explicit).replace(/\/+$/, '');

  // Em desenvolvimento, mantenha links e confirmacoes no servidor que recebeu
  // a solicitacao (ex.: localhost), em vez de saltar para RENDER_EXTERNAL_URL.
  if (!isProd) {
    const requestBase = pickRequestBaseUrl(req);
    if (requestBase) return requestBase;
  }

  return pickBackendBaseUrl(req);
}

function buildPortalAlunoLoginUrl(req, inst, extraParams = {}) {
  const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
  const qs = new URLSearchParams({ t: tenantParam, ...extraParams }).toString();
  return `${pickPortalAlunoBaseUrl(req)}/login-aluno.html?${qs}`;
}

function pickBackendBaseUrl(req) {
  const env =
    process.env.PUBLIC_API_URL ||
    process.env.APP_API_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (env) return String(env).replace(/\/+$/, '');

  if (!isProd) return 'http://localhost:5000';

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function pickFrontendBaseUrl(_req) {
  const site = process.env.PUBLIC_SITE_URL;
  if (site) return String(site).replace(/\/+$/, '');

  const client = process.env.CLIENT_URL;
  if (client) return String(client).replace(/\/+$/, '');

  return '';
}

function pickTenantParam(inst) {
  if (!inst) return '';
  if (inst.slug) return String(inst.slug);
  if (inst._id) return String(inst._id);
  if (inst.sigla) return String(inst.sigla).toLowerCase();
  return '';
}

async function findInstituicaoByTenant(t) {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const tenantRaw = String(t || '').trim();
  if (!tenantRaw) return null;

  const tenant = tenantRaw.toLowerCase();
  const candidates = [...new Set([
    tenant,
    TENANT_ALIASES[tenant],
    tenantRaw.toUpperCase()
  ].filter(Boolean))];

  if (isObjectIdLike(tenantRaw)) {
    const byId =
      (await Instituicao.findOne({ _id: tenantRaw, ativo: true }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null)) ||
      (await Instituicao.findOne({ _id: tenantRaw }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null));
    if (byId) return byId;
  }

  for (const candidate of candidates) {
    const bySlug =
      (await Instituicao.findOne({ slug: String(candidate).toLowerCase(), ativo: true }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null)) ||
      (await Instituicao.findOne({ slug: String(candidate).toLowerCase() }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null));
    if (bySlug) return bySlug;
  }

  for (const candidate of candidates) {
    const bySigla =
      (await Instituicao.findOne({ sigla: String(candidate).toUpperCase(), ativo: true }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null)) ||
      (await Instituicao.findOne({ sigla: String(candidate).toUpperCase() }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null));
    if (bySigla) return bySigla;
  }

  return null;
}

async function getDefaultInstituicao() {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const byDefaultSlug = await findInstituicaoByTenant(DEFAULT_TENANT_SLUG);
  if (byDefaultSlug) return byDefaultSlug;

  const ativa = await Instituicao.findOne({ ativo: true }).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null);
  if (ativa) return ativa;

  const qualquer = await Instituicao.findOne({}).select('_id nome sigla slug ativo categoriaInstituicao modulosAtivos associacaoConfig logoUrl').lean().catch(() => null);
  if (qualquer) return qualquer;

  return null;
}

function getExplicitTenantFromReq(req) {
  return (
    req.query?.t ||
    req.query?.tenant ||
    req.body?.tenantSlug ||
    req.body?.tenant ||
    req.body?.t ||
    req.headers['x-tenant'] ||
    req.headers['x-tenant-slug'] ||
    ''
  );
}

function getTenantFromReq(req) {
  return (
    getExplicitTenantFromReq(req) ||
    req.tenantSlug ||
    req.cookies?.tenant ||
    ''
  );
}

function getTenantFromReqOrDefault(req) {
  const t = String(getTenantFromReq(req) || '').trim();
  return t || DEFAULT_TENANT_SLUG;
}

async function resolveInstituicaoOnlyIfTenantProvided(req) {
  const t = String(getTenantFromReq(req) || '').trim();
  if (!t) return null;
  return await findInstituicaoByTenant(t);
}

async function inferirInstituicoesDoLoginPortal(login) {
  const loginNormalizado = normalizeLoginIdentifier(login);
  const email = isValidEmail(loginNormalizado) ? normalizeEmail(loginNormalizado) : null;
  const codigoAcesso = email ? null : normalizeCodigoAcesso(loginNormalizado);
  const ids = new Set();

  if (email) {
    const usuarios = await Usuario.find({
      email,
      tipo: { $in: ['aluno', 'responsavel'] },
      $or: [{ ativo: true }, { ativo: { $exists: false } }]
    })
      .select('instituicao tenantId')
      .lean();

    for (const usuario of usuarios) {
      const id = String(usuario.instituicao || usuario.tenantId || '').trim();
      if (id) ids.add(id);
    }
  } else if (Aluno && typeof Aluno.find === 'function' && codigoAcesso) {
    const alunos = await Aluno.find({ codigoAcesso })
      .select('instituicao tenantId')
      .lean();

    for (const aluno of alunos) {
      const id = String(aluno.instituicao || aluno.tenantId || '').trim();
      if (id) ids.add(id);
    }
  }

  if (!ids.size || !Instituicao) return [];

  return Instituicao.find({
    _id: { $in: [...ids] },
    ativo: { $ne: false },
    ativa: { $ne: false }
  })
    .select('_id nome sigla slug ativo ativa categoriaInstituicao modulosAtivos associacaoConfig logoUrl')
    .lean();
}

async function resolverInstituicaoLoginPortal(req, login) {
  const tenantExplicito = String(getExplicitTenantFromReq(req) || '').trim();

  if (tenantExplicito) {
    return {
      inst: await findInstituicaoByTenant(tenantExplicito),
      explicito: true,
      ambiguo: false,
      instituicoes: []
    };
  }

  const candidatas = await inferirInstituicoesDoLoginPortal(login);

  if (candidatas.length === 1) {
    return {
      inst: candidatas[0],
      explicito: false,
      ambiguo: false,
      instituicoes: candidatas
    };
  }

  if (candidatas.length > 1) {
    return {
      inst: null,
      explicito: false,
      ambiguo: true,
      instituicoes: candidatas
    };
  }

  const tenantContexto = String(req.tenantSlug || req.cookies?.tenant || '').trim();
  const instContexto = tenantContexto
    ? await findInstituicaoByTenant(tenantContexto)
    : null;

  return {
    inst:
      instContexto ||
      await findInstituicaoByTenant(DEFAULT_TENANT_SLUG) ||
      await getDefaultInstituicao(),
    explicito: false,
    ambiguo: false,
    instituicoes: []
  };
}

function buildJwtPayload(usuario) {
  const payload = {
    id: String(usuario._id || usuario.id),
    tipo: usuario.tipo,
    nome: usuario.nome,
    instituicao: String(usuario.instituicao || usuario.tenantId || ''),
    tenantId: String(usuario.tenantId || usuario.instituicao || ''),
    email: String(usuario.email || '').toLowerCase(),
  };

  if (usuario.vinculoId) payload.vinculoId = String(usuario.vinculoId);
  if (usuario.alunoId) payload.alunoId = String(usuario.alunoId);
  if (usuario.escopoObservatorio) payload.escopoObservatorio = usuario.escopoObservatorio;
  if (usuario.acessosModulos) payload.acessosModulos = usuario.acessosModulos;
  if (usuario.onboardingProfessor) payload.onboardingProfessor = usuario.onboardingProfessor;

  if (usuario.portal) {
    payload.portal = String(usuario.portal);
  } else if (usuario.tipo === 'aluno') {
    payload.portal = 'aluno';
  }

  return payload;
}

function buildAlunoPublicData(aluno) {
  if (!aluno) return null;

  return {
    _id: String(aluno._id),
    nome: aluno.nome || '',
    turma: aluno.turma || '',
    codigoAcesso: aluno.codigoAcesso || '',
    usuarioId: aluno.usuarioId ? String(aluno.usuarioId) : null
  };
}

function buildLoginResponse({ usuario, inst, token, aluno = null, onboarding = null }) {
  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;

  let redirecionar = '/painel.html';

  if (usuario.tipo === 'professor') {
    redirecionar = '/painel-professor.html';
  }

  if (usuario.tipo === 'secretaria') {
    redirecionar = '/observatorio.html';
  }

  if (usuario.tipo === 'aluno') {
    redirecionar = '/painel-aluno.html';
  }

  if (usuario.tipo === 'responsavel' && usuario.alunoId) {
    redirecionar = `/ficha-aluno.html?id=${String(usuario.alunoId)}`;
  }

  const associacaoAtiva =
    inst?.categoriaInstituicao === 'associacao' ||
    inst?.associacaoConfig?.ativo === true ||
    (Array.isArray(inst?.modulosAtivos) && inst.modulosAtivos.includes('associacao'));
  const acessoAssociacao = usuario?.acessosModulos?.associacao;
  if (associacaoAtiva && (acessoAssociacao?.ativo === true || usuario.tipo === 'admin')) {
    redirecionar = '/associacao.html';
  }

  if (usuario.tipo === 'professor' && onboarding && onboarding.concluido === false) {
    redirecionar = onboarding.redirecionar || '/primeiro-acesso-professor.html';
  }

  return {
    mensagem: 'Login realizado com sucesso.',
    redirecionar,
    token,
    usuario: {
      id: String(usuario._id),
      tipo: usuario.tipo,
      nome: usuario.nome,
      instituicao: String(usuario.instituicao || ''),
      email: String(usuario.email || '').toLowerCase(),
      alunoId: usuario.alunoId ? String(usuario.alunoId) : null,
      portal:
  usuario.portal ||
  (usuario.tipo === 'aluno'
    ? 'aluno'
    : usuario.tipo === 'responsavel'
      ? 'responsavel'
      : 'institucional'),
      escopoObservatorio: usuario.escopoObservatorio || null,
      associacaoAcesso: usuario.acessosModulos?.associacao || null
    },
    aluno: buildAlunoPublicData(aluno),
    instituicao: inst ? {
      id: String(inst._id),
      nome: inst.nome,
      sigla: inst.sigla,
      slug: inst.slug,
      logoUrl: inst.logoUrl || null,
      categoriaInstituicao: inst.categoriaInstituicao || 'escola',
      associacaoAtiva
    } : undefined,
    tenant: tenantCookie,
    onboarding,
    portal:
  usuario.portal ||
  (usuario.tipo === 'aluno'
    ? 'aluno'
    : usuario.tipo === 'responsavel'
      ? 'responsavel'
      : 'institucional')
  };
}

async function doLoginForInstituicao(req, res, { email, senha, inst, portal = 'institucional' }) {
  const instituicaoId = inst?._id ? String(inst._id) : null;
  if (!instituicaoId) {
    return res.status(400).json({ mensagem: 'Instituição não encontrada para o login.' });
  }

  const tiposPermitidos = portal === 'aluno'
    ? ['aluno']
    : TIPOS_LOGIN_INSTITUCIONAL;

  const resolvido = await resolverUsuarioNoTenant({
    email,
    instituicaoId,
    comSenha: true,
    tiposPermitidos,
  });

  if (!resolvido?.usuario || !resolvido?.efetivo) {
    if (portal === 'aluno') {
      return res.status(401).json({ mensagem: 'Acesso do aluno não encontrado nesta instituição.' });
    }
    return res.status(401).json({
      mensagem: 'Usuário não encontrado nesta instituição ou sem vínculo ativo. Verifique se você está no link correto.',
    });
  }

  const identidade = resolvido.usuario;
  const usuario = resolvido.efetivo;

  if (identidade.emailVerificado === false) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      mensagem: 'Conta não confirmada. Verifique seu e-mail para liberar o acesso.',
    });
  }

  const senhaValida = await bcrypt.compare(String(senha || ''), identidade.senha);
  if (!senhaValida) {
    return res.status(401).json({ mensagem: 'Senha incorreta.' });
  }

  const token = jwt.sign(buildJwtPayload(usuario), process.env.JWT_SECRET, { expiresIn: '2h' });
  setAuthCookie(res, token);

  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;
  setTenantCookie(res, tenantCookie);

  let aluno = null;
  if (usuario.tipo === 'aluno' && Aluno && usuario.alunoId) {
    aluno = await Aluno.findOne({
      _id: usuario.alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId')
      .lean()
      .catch(() => null);
  }

  const onboarding = usuario.tipo === 'professor'
    ? await obterEstadoOnboardingProfessor(usuario, { instituicaoId, destinoPadrao: '/painel-professor.html' })
    : null;

  return res.json(buildLoginResponse({ usuario, inst, token, aluno, onboarding }));
}

async function doLoginAluno(req, res, { login, senha, inst }) {
  const instituicaoId = inst?._id ? String(inst._id) : null;

  if (!instituicaoId) {
    return res.status(400).json({
      mensagem: 'Instituição não encontrada para o portal do aluno.'
    });
  }

  const loginNormalizado = normalizeLoginIdentifier(login);
  const email = isValidEmail(loginNormalizado) ? normalizeEmail(loginNormalizado) : null;
  const codigoAcesso = email ? null : normalizeCodigoAcesso(loginNormalizado);

  let usuario = null;
  let aluno = null;

  if (email) {
    usuario = await Usuario.findOne({
      email,
      instituicao: instituicaoId,
      tipo: { $in: ['aluno', 'responsavel'] },
      $or: [{ ativo: true }, { ativo: { $exists: false } }]
    }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio acessosModulos');
  } else {
    if (!Aluno || typeof Aluno.findOne !== 'function') {
      return res.status(500).json({
        mensagem: 'Model de aluno não disponível para login por código de acesso.'
      });
    }

    aluno = await Aluno.findOne({
      instituicao: instituicaoId,
      codigoAcesso
    }).select('_id nome turma codigoAcesso usuarioId instituicao tenantId').lean();

    if (!aluno) {
      return res.status(401).json({
        mensagem: 'Código de acesso não encontrado nesta instituição.'
      });
    }

    if (aluno.usuarioId) {
      usuario = await Usuario.findOne({
        _id: aluno.usuarioId,
        instituicao: instituicaoId,
        tipo: 'aluno',
        $or: [{ ativo: true }, { ativo: { $exists: false } }]
      }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio acessosModulos');
    }

    if (!usuario) {
      usuario = await Usuario.findOne({
        alunoId: aluno._id,
        instituicao: instituicaoId,
        tipo: 'aluno',
        $or: [{ ativo: true }, { ativo: { $exists: false } }]
      }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio acessosModulos');
    }

    if (!usuario) {
      return res.status(401).json({
        mensagem: 'Acesso do aluno não vinculado corretamente. Procure a administração da instituição.'
      });
    }
  }

  if (!usuario) {
    return res.status(401).json({
      mensagem: 'Acesso não encontrado nesta instituição.'
    });
  }

  if (!['aluno', 'responsavel'].includes(String(usuario.tipo || '').toLowerCase())) {
    return res.status(403).json({
      mensagem: 'Este usuário não possui acesso ao portal do aluno/responsável.'
    });
  }

  if (usuario.emailVerificado === false) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      mensagem: 'Conta não confirmada. Verifique seu e-mail para liberar o acesso.',
    });
  }

  const senhaValida = await bcrypt.compare(String(senha || ''), usuario.senha);
  if (!senhaValida) {
    return res.status(401).json({ mensagem: 'Senha incorreta.' });
  }

  if (!aluno && Aluno && usuario.alunoId) {
    aluno = await Aluno.findOne({
      _id: usuario.alunoId,
      instituicao: instituicaoId
    }).select('_id nome turma codigoAcesso usuarioId').lean().catch(() => null);
  }

  if (!aluno) {
    return res.status(404).json({
      mensagem: 'Aluno vinculado a este acesso não foi encontrado nesta instituição.'
    });
  }

  const portalFinal = usuario.tipo === 'responsavel' ? 'responsavel' : 'aluno';

  const token = jwt.sign(
    {
      ...buildJwtPayload(usuario),
      portal: portalFinal,
      alunoId: usuario.alunoId ? String(usuario.alunoId) : String(aluno._id)
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  setAuthCookie(res, token);

  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;
  setTenantCookie(res, tenantCookie);

  return res.json(buildLoginResponse({
    usuario: {
      ...usuario.toObject(),
      portal: portalFinal,
      alunoId: usuario.alunoId ? String(usuario.alunoId) : String(aluno._id)
    },
    inst,
    token,
    aluno
  }));
}

/**
 * GET /auth/me
 */
/**
 * GET /auth/me
 */
router.get('/me', autenticar, (req, res) => {
  return res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    tipo: req.usuario.tipo,
    instituicao: req.usuario.instituicao,
    email: req.usuario.email || null,
    alunoId: req.usuario.alunoId || null,
    portal: req.usuario.portal || null,
    escopoObservatorio: req.usuario.escopoObservatorio || null,
    associacao: req.usuario.associacaoAcesso || null,
    vinculoId: req.usuario.vinculoId || null
  });
});

/**
 * GET /auth/portais
 * Apenas para o front saber quais botões/telas mostrar
 */
router.get('/portais', async (_req, res) => {
  return res.json({
    ok: true,
    portais: {
      institucional: {
        ativo: true,
        loginUrl: '/login.html'
      },
      aluno: {
        ativo: true,
        loginUrl: '/login-aluno.html'
      }
    }
  });
});

/**
 * POST /auth/login
 * Login institucional
 */
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const senha = String(req.body?.senha || '');

  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }
  if (!senha) {
    return res.status(400).json({ mensagem: 'Informe sua senha.' });
  }

  try {
    const instFromTenant = await resolveInstituicaoOnlyIfTenantProvided(req);

    if (!instFromTenant?._id) {
      const defaultInst = await findInstituicaoByTenant(DEFAULT_TENANT_SLUG);
      if (defaultInst?._id) {
        const acessoDefault = await resolverUsuarioNoTenant({
          email,
          instituicaoId: String(defaultInst._id),
          comSenha: false,
          tiposPermitidos: TIPOS_LOGIN_INSTITUCIONAL,
        });
        if (acessoDefault) {
          return await doLoginForInstituicao(req, res, {
            email,
            senha,
            inst: defaultInst,
            portal: 'institucional'
          });
        }
      }

      const ambientes = await listarAmbientesPorEmail(email);
      const institucionais = ambientes.filter(item => TIPOS_LOGIN_INSTITUCIONAL.includes(item.tipo));

      if (!institucionais.length) {
        return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
      }

      if (institucionais.length > 1) {
        return res.status(409).json({
          code: 'AMBIGUOUS_TENANT',
          mensagem: 'Seu e-mail possui acesso a mais de um ambiente. Selecione a instituição para entrar.',
          instituicoes: institucionais.map(item => ({
            id: item.instituicaoId,
            nome: item.nome,
            sigla: item.sigla || null,
            slug: item.tenant || null,
            tenant: item.tenant,
            categoria: item.categoria,
          })),
        });
      }

      const unico = institucionais[0];
      const instLoaded = await findInstituicaoByTenant(unico.tenant || unico.instituicaoId);
      return await doLoginForInstituicao(req, res, {
        email,
        senha,
        inst: instLoaded || { _id: unico.instituicaoId, slug: unico.tenant },
        portal: 'institucional'
      });
    }

    return await doLoginForInstituicao(req, res, {
      email,
      senha,
      inst: instFromTenant,
      portal: 'institucional'
    });

  } catch (error) {
    console.error('Erro /auth/login:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao fazer login.', erro: error.message });
  }
});

/**
 * POST /auth/login-aluno
 * Login do aluno por código de acesso OU e-mail + senha
 */
router.post('/login-aluno', async (req, res) => {
  const login =
    normalizeLoginIdentifier(
      req.body?.login ||
      req.body?.email ||
      req.body?.codigoAcesso
    );

  const senha = String(req.body?.senha || '');

  if (!login) {
    return res.status(400).json({ mensagem: 'Informe o código de acesso ou e-mail do aluno.' });
  }

  if (!senha) {
    return res.status(400).json({ mensagem: 'Informe a senha.' });
  }

  try {
    const resolucao = await resolverInstituicaoLoginPortal(req, login);

    if (resolucao.ambiguo) {
      return res.status(409).json({
        code: 'AMBIGUOUS_TENANT',
        mensagem: 'Este acesso foi encontrado em mais de uma instituição. Abra o link específico enviado pela escola.',
        instituicoes: resolucao.instituicoes.map(inst => ({
          id: String(inst._id),
          nome: inst.nome,
          sigla: inst.sigla || null,
          slug: inst.slug || null,
          tenant: inst.slug || String(inst._id)
        }))
      });
    }

    const inst = resolucao.inst;

    if (!inst?._id) {
      return res.status(400).json({ mensagem: 'Instituição não encontrada para o portal do aluno.' });
    }

    return await doLoginAluno(req, res, {
      login,
      senha,
      inst
    });
  } catch (error) {
    console.error('Erro /auth/login-aluno:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao fazer login do aluno.', erro: error.message });
  }
});

/**
 * GET /auth/ambientes
 * Lista os ambientes aos quais a identidade autenticada possui acesso.
 */
router.get('/ambientes', autenticar, async (req, res) => {
  try {
    const ambientes = await listarAmbientesDoUsuario(req.usuario.id);
    return res.json({
      ambienteAtual: String(req.usuario.instituicao || ''),
      vinculoAtual: req.usuario.vinculoId || null,
      ambientes,
    });
  } catch (error) {
    console.error('Erro /auth/ambientes:', error);
    return res.status(500).json({ mensagem: 'Não foi possível listar seus ambientes.' });
  }
});

/**
 * POST /auth/trocar-ambiente
 * Emite uma nova sessão para outro vínculo ativo da mesma identidade.
 */
router.post('/trocar-ambiente', autenticar, async (req, res) => {
  try {
    const tenant = String(req.body?.tenant || req.body?.t || req.body?.instituicaoId || '').trim();
    if (!tenant) return res.status(400).json({ mensagem: 'Informe o ambiente de destino.' });

    const inst = await findInstituicaoByTenant(tenant);
    if (!inst?._id) return res.status(404).json({ mensagem: 'Ambiente não encontrado.' });

    const identidade = await Usuario.findById(req.usuario.id).select('email ativo').lean();
    if (!identidade || identidade.ativo === false) {
      return res.status(403).json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const resolvido = await resolverUsuarioNoTenant({
      email: identidade.email,
      instituicaoId: String(inst._id),
      comSenha: false,
      tiposPermitidos: null,
    });
    if (!resolvido?.efetivo) {
      return res.status(403).json({ mensagem: 'Você não possui vínculo ativo com este ambiente.' });
    }

    const usuario = resolvido.efetivo;
    const tokenNovo = jwt.sign(buildJwtPayload(usuario), process.env.JWT_SECRET, { expiresIn: '2h' });
    setAuthCookie(res, tokenNovo);
    setTenantCookie(res, inst.slug || String(inst._id));

    const onboarding = usuario.tipo === 'professor'
      ? await obterEstadoOnboardingProfessor(usuario, { instituicaoId: String(inst._id), destinoPadrao: '/painel-professor.html' })
      : null;
    const resposta = buildLoginResponse({ usuario, inst, token: tokenNovo, onboarding });
    return res.json({
      mensagem: 'Ambiente alterado com sucesso.',
      redirecionar: resposta.redirecionar,
      tenant: resposta.tenant,
      instituicao: resposta.instituicao,
      usuario: resposta.usuario,
    });
  } catch (error) {
    console.error('Erro /auth/trocar-ambiente:', error);
    return res.status(500).json({ mensagem: 'Não foi possível trocar de ambiente.' });
  }
});

/**
 * GET /auth/usuario-logado
 */
router.get('/usuario-logado', autenticar, async (req, res) => {
  try {
    const ambientes = await listarAmbientesDoUsuario(req.usuario.id);
    return res.json({
      ...req.usuario,
      ambientes,
    });
  } catch (error) {
    console.error('Erro /auth/usuario-logado:', error);
    return res.status(500).json({ mensagem: 'Erro ao buscar usuário logado.' });
  }
});

/**
 * GET /auth/aluno-autocadastro/turmas (PUBLICO)
 * Exibe somente os nomes das turmas da instituicao. Nunca retorna alunos.
 */
router.get('/aluno-autocadastro/turmas', async (req, res) => {
  if (!enforcePublicRateLimit(req, res, 'aluno-turmas', { max: 30, windowMs: 10 * 60 * 1000 })) return;

  try {
    const inst = await findInstituicaoByTenant(getTenantFromReqOrDefault(req));
    const instituicaoId = inst?._id ? String(inst._id) : null;
    if (!instituicaoId || !Aluno) {
      return res.status(400).json({ mensagem: 'Instituicao nao encontrada.' });
    }

    const registros = await Aluno.find({ instituicao: instituicaoId })
      .select('turma')
      .lean();

    const unique = new Map();
    for (const item of registros) {
      const turma = String(item?.turma || '').trim();
      const key = normalizeTurmaKey(turma);
      if (turma && key && !unique.has(key)) unique.set(key, turma);
    }

    const turmas = [...unique.values()].sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
    );

    return res.json({ turmas });
  } catch (error) {
    console.error('Erro /auth/aluno-autocadastro/turmas:', error);
    return res.status(500).json({ mensagem: 'Nao foi possivel carregar as turmas.' });
  }
});

/**
 * POST /auth/aluno-autocadastro (PUBLICO)
 * NUNCA cria documento Aluno. Apenas reivindica acesso a aluno ja existente.
 */
router.post('/aluno-autocadastro', async (req, res) => {
  if (!enforcePublicRateLimit(req, res, 'aluno-autocadastro', { max: 7, windowMs: 20 * 60 * 1000 })) return;

  const nome = String(req.body?.nome || '').trim();
  const turma = String(req.body?.turma || '').trim();
  const nascimento = normalizeDateKey(req.body?.nascimento);
  const codigoAcessoInformado = normalizeCodigoAcesso(req.body?.codigoAcesso);
  const email = normalizeEmail(req.body?.email);
  const whatsappRaw = String(req.body?.whatsapp || '').trim();
  const senha = String(req.body?.senha || '');

  if (nome.length < 5 || !turma || !nascimento) {
    return res.status(400).json({ mensagem: 'Informe nome completo, turma e data de nascimento.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail valido.' });
  }
  const checkSenha = validatePasswordStrength(senha);
  if (!checkSenha.ok) {
    return res.status(400).json({ mensagem: checkSenha.message || 'A senha nao atende a politica de seguranca.' });
  }

  const whatsappInfo = normalizarTelefoneBrasil(whatsappRaw);
  if (!whatsappInfo.valido || !whatsappInfo.e164) {
    return res.status(400).json({
      mensagem: whatsappInfo.motivo || 'Informe um WhatsApp valido com DDD.'
    });
  }

  try {
    const inst = await findInstituicaoByTenant(getTenantFromReqOrDefault(req));
    const instituicaoId = inst?._id ? String(inst._id) : null;
    if (!instituicaoId || !Aluno) {
      return res.status(400).json({
        mensagem: 'Instituicao nao encontrada. Abra o link oficial do Portal do Aluno.'
      });
    }

    // A base e pequena o suficiente para filtrar dentro da instituicao sem expor dados publicos.
    const alunos = await Aluno.find({ instituicao: instituicaoId })
      .select('_id nome turma nascimento usuarioId codigoAcesso instituicao tenantId')
      .lean();

    const turmaKey = normalizeTurmaKey(turma);

    // Primeiro localiza de forma controlada por turma + nome. A data de nascimento
    // e o codigo de acesso sao fatores de confirmacao, nao mecanismos de enumeracao.
    const candidatosNomeTurma = alunos
      .filter((aluno) => normalizeTurmaKey(aluno?.turma) === turmaKey)
      .map((aluno) => ({ aluno, nivel: nameMatchLevel(nome, aluno?.nome) }))
      .filter((item) => item.nivel);

    if (candidatosNomeTurma.length !== 1) {
      return res.status(422).json({
        code: 'IDENTIDADE_NAO_CONFIRMADA',
        mensagem: 'Nao foi possivel confirmar automaticamente seus dados. Confira nome, turma e data de nascimento. Se estiverem corretos, procure a secretaria para validar seu acesso.'
      });
    }

    const { aluno, nivel } = candidatosNomeTurma[0];
    const nascimentoCadastrado = normalizeDateKey(aluno?.nascimento);

    if (nascimentoCadastrado) {
      if (nascimentoCadastrado !== nascimento) {
        return res.status(422).json({
          code: 'IDENTIDADE_NAO_CONFIRMADA',
          mensagem: 'Nao foi possivel confirmar automaticamente seus dados. Confira nome, turma e data de nascimento. Se estiverem corretos, procure a secretaria para validar seu acesso.'
        });
      }
    } else {
      // Compatibilidade segura com cadastros antigos: algumas matriculas foram
      // criadas antes de a data de nascimento ser persistida. Nesses casos,
      // exige o codigo aleatorio e unico ja pertencente ao registro Aluno.
      const codigoCadastrado = normalizeCodigoAcesso(aluno?.codigoAcesso);
      const codigoConfere = Boolean(
        codigoAcessoInformado &&
        codigoCadastrado &&
        codigoAcessoInformado === codigoCadastrado
      );

      if (!codigoConfere) {
        return res.status(422).json({
          code: 'VALIDACAO_ADICIONAL_NECESSARIA',
          mensagem: 'Seu cadastro escolar precisa de uma validacao adicional. Se voce recebeu o Codigo do Aluno, informe-o no campo correspondente. Caso contrario, procure a secretaria para atualizar sua data de nascimento.'
        });
      }
    }

    // Se a escola ja criou o acesso, o autocadastro nunca o substitui.
    if (aluno.usuarioId) {
      return res.status(409).json({
        code: 'ACESSO_EXISTENTE',
        mensagem: 'Este aluno ja possui acesso cadastrado. Use "Esqueci minha senha" ou procure a administracao da escola.'
      });
    }

    const usuarioAlunoExistente = await Usuario.findOne({
      instituicao: instituicaoId,
      tipo: 'aluno',
      alunoId: aluno._id
    });

    if (usuarioAlunoExistente && usuarioAlunoExistente.emailVerificado !== false) {
      if (usuarioAlunoExistente && !aluno.usuarioId) {
        await Aluno.updateOne(
          { _id: aluno._id, instituicao: instituicaoId, usuarioId: null },
          { $set: { usuarioId: usuarioAlunoExistente._id } }
        ).catch(() => null);
      }
      return res.status(409).json({
        code: 'ACESSO_EXISTENTE',
        mensagem: 'Este aluno ja possui acesso cadastrado. Use "Esqueci minha senha" para recuperar a conta.'
      });
    }

    if (usuarioAlunoExistente && normalizeEmail(usuarioAlunoExistente.email) !== email) {
      return res.status(409).json({
        code: 'CADASTRO_PENDENTE',
        mensagem: 'Ja existe uma solicitacao de acesso pendente para este aluno. Procure a administracao da escola se precisar alterar o e-mail.'
      });
    }

    const usuarioEmail = await Usuario.findOne({ instituicao: instituicaoId, email });
    let usuarioEmailOrfaoReaproveitavel = null;

    if (usuarioEmail && (!usuarioAlunoExistente || String(usuarioEmail._id) !== String(usuarioAlunoExistente._id))) {
      // V1.0.4: um Aluno pode ter sido excluido antes de sua conta Usuario.
      // Nao liberamos qualquer conta existente: so reaproveitamos Usuario do tipo
      // aluno quando nenhum Aluno atual aponta para ele e o alunoId antigo tambem
      // nao existe mais nesta instituicao. A identidade do novo aluno ja foi
      // validada acima por nome + turma + nascimento/codigo, e o e-mail ainda
      // precisara ser confirmado novamente antes do login.
      if (usuarioEmail.tipo === 'aluno' && Aluno) {
        const [alunoAntigoAindaExiste, alunoApontandoParaUsuario] = await Promise.all([
          usuarioEmail.alunoId
            ? Aluno.findOne({ _id: usuarioEmail.alunoId, instituicao: instituicaoId }).select('_id').lean().catch(() => null)
            : Promise.resolve(null),
          Aluno.findOne({ instituicao: instituicaoId, usuarioId: usuarioEmail._id }).select('_id').lean().catch(() => null)
        ]);

        if (!alunoAntigoAindaExiste && !alunoApontandoParaUsuario) {
          usuarioEmailOrfaoReaproveitavel = usuarioEmail;
        }
      }

      if (!usuarioEmailOrfaoReaproveitavel) {
        return res.status(409).json({
          code: 'EMAIL_EM_USO',
          mensagem: 'Este e-mail ja esta vinculado a outro acesso nesta instituicao.'
        });
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const usuario = usuarioAlunoExistente || usuarioEmailOrfaoReaproveitavel || new Usuario();
    usuario.nome = aluno.nome;
    usuario.email = email;
    usuario.whatsapp = whatsappInfo.e164;
    usuario.senha = senha;
    usuario.tipo = 'aluno';
    usuario.portal = 'aluno';
    usuario.alunoId = aluno._id;
    usuario.instituicao = instituicaoId;
    usuario.tenantId = instituicaoId;
    usuario.emailVerificado = false;
    usuario.emailVerificadoEm = null;
    usuario.tokenVerificacaoHash = tokenHash;
    usuario.tokenVerificacaoExpiraEm = expiraEm;
    // Ao reaproveitar uma conta orfa, invalida qualquer reset antigo.
    usuario.senhaResetTokenHash = null;
    usuario.senhaResetExpiraEm = null;
    usuario.senhaResetSolicitadoEm = null;
    usuario.senhaResetConsumidoEm = null;
    usuario.ativo = true;
    await usuario.save();

    const backendBase = pickPortalAlunoBaseUrl(req);
    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const confirmationLink = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}&t=${encodeURIComponent(tenantParam)}`;
    const loginLink = buildPortalAlunoLoginUrl(req, inst);
    const nomeInst = inst?.nome || 'Axoriin';

    const mailResult = await sendEmailBestEffort({
      to: email,
      subject: `Confirme seu acesso ao Portal do Aluno - ${nomeInst}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#12243a;max-width:620px;margin:auto">
          <h2 style="color:#0b63c7">Confirme seu acesso ao Portal do Aluno</h2>
          <p>Ola, <b>${htmlEscape(aluno.nome)}</b>.</p>
          <p>Recebemos sua solicitacao de acesso ao Portal do Aluno de <b>${htmlEscape(nomeInst)}</b>.</p>
          <p><b>Turma:</b> ${htmlEscape(aluno.turma)}<br><b>Login:</b> ${htmlEscape(email)}</p>
          <p style="margin:24px 0">
            <a href="${confirmationLink}" style="display:inline-block;background:#0b63c7;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">Confirmar meu e-mail</a>
          </p>
          <p>Depois da confirmacao, voce podera entrar com seu e-mail ou codigo de acesso e a senha que definiu.</p>
          <p>Portal: <a href="${loginLink}">${loginLink}</a></p>
          <p style="font-size:12px;color:#6b7b8d">Este link expira em 24 horas. Sua senha nao e enviada por e-mail e permanece conhecida somente por voce.</p>
          <p style="font-size:12px;color:#6b7b8d">Se voce nao solicitou este acesso, ignore esta mensagem.</p>
        </div>`
    });

    return res.status(201).json({
      ok: true,
      code: mailResult?.ok === false ? 'EMAIL_ENVIO_PENDENTE' : 'CONFIRMACAO_ENVIADA',
      mensagem: mailResult?.ok === false
        ? 'Seus dados foram validados, mas o e-mail de confirmacao nao pode ser enviado agora. Tente novamente em alguns minutos.'
        : 'Dados validados. Enviamos um link de confirmacao para o seu e-mail.',
      email: email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),
      identidade: nivel
    });
  } catch (error) {
    console.error('Erro /auth/aluno-autocadastro:', error);
    if (error?.code === 11000) {
      return res.status(409).json({ mensagem: 'Este e-mail ja esta vinculado a outro acesso.' });
    }
    return res.status(500).json({ mensagem: 'Nao foi possivel concluir a solicitacao de acesso.' });
  }
});

/**
 * POST /auth/aluno-senha/solicitar (PUBLICO)
 * Resposta sempre generica para evitar enumeracao de contas.
 */
router.post('/aluno-senha/solicitar', async (req, res) => {
  if (!enforcePublicRateLimit(req, res, 'aluno-senha-solicitar', { max: 5, windowMs: 20 * 60 * 1000 })) return;

  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail valido.' });
  }

  const generic = {
    ok: true,
    mensagem: 'Se existir uma conta de aluno confirmada com esse e-mail, enviaremos as instrucoes de recuperacao.'
  };

  try {
    const inst = await findInstituicaoByTenant(getTenantFromReqOrDefault(req));
    const instituicaoId = inst?._id ? String(inst._id) : null;
    if (!instituicaoId) return res.json(generic);

    const usuario = await Usuario.findOne({
      instituicao: instituicaoId,
      email,
      tipo: 'aluno',
      portal: 'aluno',
      emailVerificado: { $ne: false },
      $or: [{ ativo: true }, { ativo: { $exists: false } }]
    });

    if (!usuario) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString('hex');
    usuario.senhaResetTokenHash = hashToken(rawToken);
    usuario.senhaResetExpiraEm = new Date(Date.now() + 30 * 60 * 1000);
    usuario.senhaResetSolicitadoEm = new Date();
    usuario.senhaResetConsumidoEm = null;
    await usuario.save();

    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const portalBase = pickPortalAlunoBaseUrl(req);
    const resetLink = `${portalBase}/redefinir-senha-aluno.html?token=${encodeURIComponent(rawToken)}&t=${encodeURIComponent(tenantParam)}`;
    const nomeInst = inst?.nome || 'Axoriin';

    await sendEmailBestEffort({
      to: email,
      subject: `Redefinicao de senha - Portal do Aluno - ${nomeInst}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#12243a;max-width:620px;margin:auto">
          <h2 style="color:#0b63c7">Redefinir senha do Portal do Aluno</h2>
          <p>Ola, <b>${htmlEscape(usuario.nome)}</b>.</p>
          <p>Recebemos uma solicitacao para redefinir sua senha.</p>
          <p style="margin:24px 0"><a href="${resetLink}" style="display:inline-block;background:#0b63c7;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold">Criar nova senha</a></p>
          <p style="font-size:12px;color:#6b7b8d">O link e de uso unico e expira em 30 minutos. Se voce nao fez esta solicitacao, ignore a mensagem.</p>
        </div>`
    });

    return res.json(generic);
  } catch (error) {
    console.error('Erro /auth/aluno-senha/solicitar:', error);
    return res.json(generic);
  }
});

/**
 * POST /auth/aluno-senha/redefinir (PUBLICO)
 */
router.post('/aluno-senha/redefinir', async (req, res) => {
  if (!enforcePublicRateLimit(req, res, 'aluno-senha-redefinir', { max: 8, windowMs: 20 * 60 * 1000 })) return;

  const rawToken = String(req.body?.token || '').trim();
  const senha = String(req.body?.senha || '');
  if (!rawToken) return res.status(400).json({ mensagem: 'Link de redefinicao invalido.' });

  const checkSenha = validatePasswordStrength(senha);
  if (!checkSenha.ok) {
    return res.status(400).json({ mensagem: checkSenha.message || 'A senha nao atende a politica de seguranca.' });
  }

  try {
    const inst = await findInstituicaoByTenant(getTenantFromReqOrDefault(req));
    const instituicaoId = inst?._id ? String(inst._id) : null;
    if (!instituicaoId) return res.status(400).json({ mensagem: 'Instituicao nao encontrada.' });

    const usuario = await Usuario.findOne({
      instituicao: instituicaoId,
      tipo: 'aluno',
      senhaResetTokenHash: hashToken(rawToken),
      senhaResetExpiraEm: { $gt: new Date() },
      $or: [{ ativo: true }, { ativo: { $exists: false } }]
    });

    if (!usuario) {
      return res.status(400).json({
        code: 'RESET_INVALIDO',
        mensagem: 'Este link e invalido, ja foi utilizado ou expirou. Solicite uma nova recuperacao.'
      });
    }

    usuario.senha = senha;
    usuario.senhaResetTokenHash = null;
    usuario.senhaResetExpiraEm = null;
    usuario.senhaResetConsumidoEm = new Date();
    await usuario.save();

    const loginLink = buildPortalAlunoLoginUrl(req, inst, { passwordReset: '1' });
    await sendEmailBestEffort({
      to: usuario.email,
      subject: `Senha alterada - Portal do Aluno`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#12243a;max-width:620px;margin:auto">
          <h2 style="color:#128c55">Sua senha foi alterada</h2>
          <p>Ola, <b>${htmlEscape(usuario.nome)}</b>. A senha do seu Portal do Aluno foi redefinida com sucesso.</p>
          <p><a href="${loginLink}">Entrar no Portal do Aluno</a></p>
          <p style="font-size:12px;color:#6b7b8d">Se voce nao realizou esta alteracao, entre em contato com a escola.</p>
        </div>`
    });

    return res.json({ ok: true, mensagem: 'Senha redefinida com sucesso.', loginUrl: loginLink });
  } catch (error) {
    console.error('Erro /auth/aluno-senha/redefinir:', error);
    return res.status(500).json({ mensagem: 'Nao foi possivel redefinir a senha.' });
  }
});

/**
 * POST /auth/cadastro (PÚBLICO)
 */
router.post('/cadastro', async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  const email = normalizeEmail(req.body?.email);
  const senha = String(req.body?.senha || '');
  const tipo = String(req.body?.tipo || '').trim().toLowerCase();

  if (!nome || nome.length < 3) {
    return res.status(400).json({ mensagem: 'Informe o nome completo.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }
  const check = validatePasswordStrength(senha);
  if (!check.ok) {
    return res.status(400).json({ mensagem: check.message || 'A senha deve atender à política de segurança.' });
  }
  if (!['monitor', 'professor'].includes(tipo)) {
    return res.status(400).json({ mensagem: 'Tipo inválido. Selecione Monitor ou Professor.' });
  }

  try {
    const tenantInformado = getTenantFromReqOrDefault(req);
    const inst = await findInstituicaoByTenant(tenantInformado);
    const instituicaoId = inst?._id ? String(inst._id) : null;

    if (!instituicaoId) {
      return res.status(400).json({
        mensagem: 'Instituição não encontrada para este cadastro. Use o link correto da instituição.'
      });
    }

    const existente = await Usuario.findOne({ email, instituicao: instituicaoId });

    if (existente && existente.emailVerificado !== false) {
      return res.status(409).json({ mensagem: 'Este e-mail já está cadastrado nesta instituição.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const u = existente || new Usuario();
    u.nome = nome;
    u.email = email;
    u.senha = senha;
    u.tipo = tipo;
    u.instituicao = instituicaoId;

    u.emailVerificado = false;
    u.emailVerificadoEm = null;
    u.tokenVerificacaoHash = tokenHash;
    u.tokenVerificacaoExpiraEm = expiraEm;

    if (typeof u.ativo !== 'undefined') u.ativo = true;

    await u.save();

    const backendBase = pickBackendBaseUrl(req);
    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const tenantQs = tenantParam ? `&t=${encodeURIComponent(tenantParam)}` : '';
    const link = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}${tenantQs}`;

    const nomeInst = inst?.nome || 'SmartClass';
    const subject = `Confirme seu e-mail — ${nomeInst}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Confirmação de e-mail</h2>
        <p>Olá, <b>${nome}</b>.</p>
        <p>
          Seu cadastro foi solicitado para a instituição:
          <br><b style="font-size:15px">${nomeInst}</b>
        </p>
        <p>Para concluir seu cadastro como <b>${tipo}</b>, confirme seu e-mail clicando abaixo:</p>
        <p style="margin:16px 0">
          <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;
             background:#0aa; color:#001; text-decoration:none; font-weight:700;">
            Confirmar meu e-mail
          </a>
        </p>
        <p style="color:#666">Este link expira em 24 horas e já direciona para a instituição correta.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p style="color:#999;font-size:12px">Se você não solicitou este cadastro, ignore este e-mail.</p>
      </div>
    `;

    await sendEmailBestEffort({ to: email, subject, html });

    return res.status(201).json({
      mensagem: `Cadastro enviado. Verifique seu e-mail para confirmar o acesso (${nomeInst}).`,
      tenant: tenantParam,
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla || null,
        slug: inst.slug || tenantParam,
      },
    });
  } catch (error) {
    console.error('Erro /auth/cadastro:', error);
    return res.status(500).json({ mensagem: 'Erro ao cadastrar.', erro: error.message });
  }
});

/**
 * GET /auth/confirmar-email?token=...&t=...
 */
router.get('/confirmar-email', async (req, res) => {
  const rawToken = String(req.query?.token || '');
  const t = String(req.query?.t || req.tenantSlug || '').trim();

  if (!rawToken) return res.status(400).send('Token ausente.');

  try {
    const tokenHash = hashToken(rawToken);

    const usuario = await Usuario.findOne({
      tokenVerificacaoHash: tokenHash,
      tokenVerificacaoExpiraEm: { $gt: new Date() },
      emailVerificado: false,
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    });

    if (!usuario) {
      return res.status(400).send('Token inválido ou expirado.');
    }

    // Para autocadastro de aluno, confirme tambem se o vinculo escolar continua livre.
    let alunoConfirmado = null;
    if (usuario.tipo === 'aluno' && usuario.alunoId && Aluno) {
      alunoConfirmado = await Aluno.findOne({
        _id: usuario.alunoId,
        instituicao: usuario.instituicao
      }).select('_id nome turma codigoAcesso usuarioId').lean().catch(() => null);

      if (!alunoConfirmado) {
        return res.status(400).send('O aluno vinculado a este cadastro nao foi encontrado. Procure a escola.');
      }

      if (alunoConfirmado.usuarioId && String(alunoConfirmado.usuarioId) !== String(usuario._id)) {
        usuario.tokenVerificacaoHash = null;
        usuario.tokenVerificacaoExpiraEm = null;
        usuario.ativo = false;
        await usuario.save();
        return res.status(409).send('Este aluno ja possui outro acesso ativo. Use a recuperacao de senha ou procure a escola.');
      }
    }

    usuario.emailVerificado = true;
    usuario.emailVerificadoEm = new Date();
    usuario.tokenVerificacaoHash = null;
    usuario.tokenVerificacaoExpiraEm = null;
    await usuario.save();

    if (alunoConfirmado && !alunoConfirmado.usuarioId) {
      await Aluno.updateOne(
        { _id: alunoConfirmado._id, instituicao: usuario.instituicao, $or: [{ usuarioId: null }, { usuarioId: { $exists: false } }] },
        { $set: { usuarioId: usuario._id } }
      );
      alunoConfirmado.usuarioId = usuario._id;
    }

    let tenantParam = t;
    if (!tenantParam && Instituicao && usuario.instituicao) {
      const inst = await Instituicao.findOne({ _id: usuario.instituicao }).select('_id sigla slug').lean().catch(() => null);
      tenantParam = pickTenantParam(inst);
    }

    if (!tenantParam) {
      tenantParam = DEFAULT_TENANT_SLUG;
    }

    setTenantCookie(res, tenantParam);

    const qs = `?t=${encodeURIComponent(tenantParam)}&verified=1`;

    // Para aluno, o destino deve ser SEMPRE o login proprio do Portal do Aluno.
    // Nao dependemos do campo portal para decidir o destino: tipo=aluno + alunoId
    // ja caracterizam este fluxo e evitam cair no login institucional.
    const isAlunoPortal = usuario.tipo === 'aluno' && Boolean(usuario.alunoId);
    const frontBase = pickFrontendBaseUrl(req);
    const target = isAlunoPortal
      ? `${pickPortalAlunoBaseUrl(req)}/login-aluno.html${qs}`
      : (frontBase ? `${frontBase}/login.html${qs}` : `/login.html${qs}`);

    if (isAlunoPortal) {
      const portalUrl = `${pickPortalAlunoBaseUrl(req)}/login-aluno.html?t=${encodeURIComponent(tenantParam)}`;
      const codigo = alunoConfirmado?.codigoAcesso || '';
      sendEmailBestEffort({
        to: usuario.email,
        subject: 'Acesso ativado - Portal do Aluno',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.55;color:#12243a;max-width:620px;margin:auto">
            <h2 style="color:#128c55">Seu acesso foi ativado</h2>
            <p>Ola, <b>${htmlEscape(usuario.nome)}</b>.</p>
            <p>Seu e-mail foi confirmado e o acesso ao Portal do Aluno esta liberado.</p>
            <p><b>Login por e-mail:</b> ${htmlEscape(usuario.email)}</p>
            ${codigo ? `<p><b>Codigo de acesso:</b> ${htmlEscape(codigo)}</p>` : ''}
            <p><a href="${portalUrl}">Entrar no Portal do Aluno</a></p>
            <p style="font-size:12px;color:#6b7b8d">Use a senha que voce definiu. Por seguranca, ela nao e enviada por e-mail.</p>
          </div>`
      }).catch(() => null);
    }

    return res.redirect(target);
  } catch (error) {
    console.error('Erro /auth/confirmar-email:', error);
    return res.status(500).send('Erro ao confirmar e-mail.');
  }
});

/**
 * POST /auth/reenviar-confirmacao (PÚBLICO)
 */
router.post('/reenviar-confirmacao', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const tenantInformado = getTenantFromReqOrDefault(req);

  if (!isValidEmail(email)) return res.status(400).json({ mensagem: 'E-mail inválido.' });

  try {
    const inst = await findInstituicaoByTenant(tenantInformado);
    const instituicaoId = inst?._id ? String(inst._id) : null;

    if (!instituicaoId) {
      return res.status(400).json({ mensagem: 'Instituição não encontrada.' });
    }

    const usuario = await Usuario.findOne({
      email,
      instituicao: instituicaoId,
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    });

    if (!usuario) {
      return res.json({ mensagem: 'Se existir cadastro pendente, enviaremos um novo link.' });
    }

    if (usuario.emailVerificado !== false) {
      return res.status(400).json({ mensagem: 'Este e-mail já foi confirmado.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

    usuario.tokenVerificacaoHash = tokenHash;
    usuario.tokenVerificacaoExpiraEm = expiraEm;
    await usuario.save();

    const backendBase = pickBackendBaseUrl(req);
    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const tenantQs = tenantParam ? `&t=${encodeURIComponent(tenantParam)}` : '';
    const link = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}${tenantQs}`;

    const nomeInst = inst?.nome || 'SmartClass';
    const subject = `Seu link de confirmação — ${nomeInst}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Confirmação de e-mail</h2>
        <p>Recebemos um pedido para reenviar seu link de confirmação.</p>
        <p><b>Instituição:</b> ${nomeInst}</p>
        <p style="margin:16px 0">
          <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;
             background:#0aa; color:#001; text-decoration:none; font-weight:700;">
            Confirmar meu e-mail
          </a>
        </p>
        <p style="color:#666">Este link expira em 24 horas e já direciona para a instituição correta.</p>
      </div>
    `;

    await sendEmailBestEffort({ to: email, subject, html });

    return res.json({
      mensagem: 'Se existir cadastro pendente, enviaremos um novo link.',
      tenant: tenantParam,
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla || null,
        slug: inst.slug || tenantParam,
      },
    });
  } catch (error) {
    console.error('Erro /auth/reenviar-confirmacao:', error);
    return res.status(500).json({ mensagem: 'Erro ao reenviar confirmação.' });
  }
});

/**
 * POST /auth/cadastrar (apenas admin)
 */
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario?.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, tipo = 'monitor' } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios.' });
  }

  const instituicaoId = req.usuario?.instituicao;
  if (!instituicaoId) {
    return res.status(400).json({ mensagem: 'Instituição do usuário logado não encontrada.' });
  }

  try {
    const emailNormalizado = normalizeEmail(email);

    const existente = await Usuario.findOne({
      email: emailNormalizado,
      instituicao: instituicaoId,
    });

    if (existente) {
      return res.status(409).json({ mensagem: 'E-mail já está em uso nesta instituição.' });
    }

      const check = validatePasswordStrength(senha);
      if (!check.ok) {
        return res.status(400).json({ mensagem: check.message || 'A senha não atende à política de segurança.' });
      }

      const novoUsuario = new Usuario({
        nome,
        email: emailNormalizado,
        senha,
        tipo,
        instituicao: instituicaoId,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        tokenVerificacaoHash: null,
        tokenVerificacaoExpiraEm: null,
        onboardingProfessor: String(tipo || '').trim().toLowerCase() === 'professor' ? {
          obrigarTrocaSenha: true,
          senhaTemporariaDefinidaEm: new Date(),
          senhaAlteradaEm: null,
        } : undefined,
      });

    await novoUsuario.save();

    return res.status(201).json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    console.error('Erro /auth/cadastrar:', error);
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie('tenant', {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

async function sendEmailBestEffort({ to, subject, html, text }) {
  try {
    const m = global.mensageria;
    if (m) {
      if (typeof m.sendEmail === 'function') return await m.sendEmail({ to, subject, html, text });
      if (m.email && typeof m.email.send === 'function') return await m.email.send({ to, subject, html, text });
      if (m.email && typeof m.email.sendMail === 'function') return await m.email.sendMail({ to, subject, html, text });
    }
  } catch (e) {
    console.warn('[MAIL] falha via mensageria:', e?.message || e);
  }

  try {
    const mailer = require('../utils/mailer');
    if (mailer) {
      if (typeof mailer.sendMail === 'function') return await mailer.sendMail({ to, subject, html, text });
      if (typeof mailer.send === 'function') return await mailer.send({ to, subject, html, text });
      if (typeof mailer.sendEmail === 'function') return await mailer.sendEmail({ to, subject, html, text });
    }
  } catch (e) {
    console.warn('[MAIL] utils/mailer indisponível ou sem função de envio:', e?.message || e);
  }

  console.log('📨 [MAIL-FALLBACK] To:', to);
  console.log('📨 [MAIL-FALLBACK] Subject:', subject);
  console.log('📨 [MAIL-FALLBACK] Conteudo protegido: corpo do e-mail nao registrado em log.');
  return { ok: false, fallback: true };
}

module.exports = router;