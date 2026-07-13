const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Log = require('../../models/Log');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

/* =========================================================
   HELPERS MULTI-TENANT
========================================================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseSortDirection(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'asc' || v === '1') return 1;
  return -1;
}

function normalizeDateStart(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeDateEnd(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildSearchFilter(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;

  const rx = new RegExp(escapeRegex(q), 'i');

  return {
    $or: [
      { usuarioNome: rx },
      { usuarioTipo: rx },
      { usuarioEmail: rx },
      { acao: rx },
      { entidade: rx },
      { entidadeNome: rx },
      { entidadeId: rx },
      { alunoNome: rx },
      { modulo: rx },
      { categoria: rx },
      { severidade: rx },
      { status: rx },
      { motivo: rx },
      { ip: rx },
      { userAgent: rx },
      { navegador: rx },
      { sistema: rx },
      { dispositivo: rx },
      { origem: rx },
      { sessionId: rx },
      { correlationId: rx },
      { requestId: rx },
      { 'ator.nome': rx },
      { 'ator.tipo': rx },
      { 'ator.email': rx },
      { 'requestContext.method': rx },
      { 'requestContext.path': rx },
      { 'requestContext.originalUrl': rx }
    ]
  };
}

function buildExtraFilters(query = {}) {
  const and = [];

  if (query.acao) and.push({ acao: String(query.acao).trim() });
  if (query.entidade) and.push({ entidade: String(query.entidade).trim() });
  if (query.status) and.push({ status: String(query.status).trim() });
  if (query.modulo) and.push({ modulo: String(query.modulo).trim() });
  if (query.usuarioTipo) and.push({ usuarioTipo: String(query.usuarioTipo).trim() });
  if (query.sessionId) and.push({ sessionId: String(query.sessionId).trim() });
  if (query.correlationId) and.push({ correlationId: String(query.correlationId).trim() });
  if (query.requestId) and.push({ requestId: String(query.requestId).trim() });
  if (query.severidade) and.push({ severidade: String(query.severidade).trim() });
  if (query.entidadeId) and.push({ entidadeId: String(query.entidadeId).trim() });

  if (query.usuario) {
    const rx = new RegExp(escapeRegex(String(query.usuario).trim()), 'i');
    and.push({
      $or: [
        { usuarioNome: rx },
        { usuarioEmail: rx },
        { 'ator.nome': rx },
        { 'ator.email': rx }
      ]
    });
  }

  if (query.aluno) {
    const rx = new RegExp(escapeRegex(String(query.aluno).trim()), 'i');
    and.push({
      $or: [
        { alunoNome: rx },
        { entidadeNome: rx }
      ]
    });
  }

  const start = normalizeDateStart(query.dataInicial || query.inicio);
  const end = normalizeDateEnd(query.dataFinal || query.fim);

  if (start || end) {
    const range = {};
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    and.push({ createdAt: range });
  }

  return and;
}

function buildMongoFilter(req) {
  const tenantId = getTenantId(req);
  const tenantMatch = buildTenantMatch(tenantId);

  const and = [tenantMatch];

  const searchFilter = buildSearchFilter(req.query.search || req.query.q || req.query.busca);
  if (searchFilter) and.push(searchFilter);

  const extras = buildExtraFilters(req.query);
  if (extras.length) and.push(...extras);

  return and.length === 1 ? tenantMatch : { $and: and };
}

function summarizeDetalhes(detalhes = {}) {
  if (!detalhes || typeof detalhes !== 'object' || Array.isArray(detalhes)) return null;

  const keys = Object.keys(detalhes);
  if (!keys.length) return null;

  const preview = {};
  for (const key of keys.slice(0, 8)) {
    const value = detalhes[key];
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      preview[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      preview[key] = `[array:${value.length}]`;
      continue;
    }
    if (typeof value === 'object') {
      preview[key] = '[objeto]';
      continue;
    }
    preview[key] = String(value);
  }

  return preview;
}

function toResponseItem(l) {
  const detalhesPreview = summarizeDetalhes(l.detalhes || {});

  return {
    _id: l._id,

    usuario: (
  l.usuarioNome ||
  l?.ator?.nome ||
  '—'
)
  ? `${l.usuarioNome || l?.ator?.nome}${(l.usuarioTipo || l?.ator?.tipo) ? ` (${l.usuarioTipo || l?.ator?.tipo})` : ''}`
  : '—',

    usuarioId: l.usuario || null,
    usuarioNome: l.usuarioNome || l.ator?.nome || null,
    usuarioTipo: l.usuarioTipo || l.ator?.tipo || null,
    usuarioEmail: l.usuarioEmail || l.ator?.email || null,

    acao: l.acao || '—',
    entidade: l.entidade || '—',
    entidadeNome: l.entidadeNome || null,
    entidadeId: l.entidadeId || '—',

    aluno: l.aluno || null,
    alunoNome: l.alunoNome || null,

    modulo: l.modulo || null,
    categoria: l.categoria || null,
    severidade: l.severidade || null,
    status: l.status || 'sucesso',
    motivo: l.motivo || null,

    sessionId: l.sessionId || null,
    correlationId: l.correlationId || null,
    requestId: l.requestId || null,

    tempoExecucaoMs: Number.isFinite(l.tempoExecucaoMs) ? l.tempoExecucaoMs : null,

    ip: l.ip || l.requestContext?.ip || null,
    userAgent: l.userAgent || null,
    dispositivo: l.dispositivo || null,
    navegador: l.navegador || null,
    sistema: l.sistema || null,
    origem: l.origem || l.requestContext?.origin || null,

    ator: l.ator || {},
    requestContext: l.requestContext || {},

    antes: l.antes ?? null,
    depois: l.depois ?? null,
    erro: l.erro ?? null,

    detalhes: l.detalhes || {},
    detalhesPreview,

    tenantId: l.tenantId || null,
    instituicao: l.instituicao || null,

    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    data: l.createdAt
  };
}

/**
 * GET /api/logs/meta/filtros/lista
 * Retorna listas úteis para filtros do frontend.
 * IMPORTANTE: vem antes de "/:id" para não conflitar.
 */
router.get('/meta/filtros/lista', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ mensagem: 'Tenant não identificado.' });
    }

    const baseMatch = buildTenantMatch(tenantId);

    const [acoes, entidades, statusDb, modulosDb, usuariosTipos, severidadesDb] = await Promise.all([
      Log.distinct('acao', baseMatch),
      Log.distinct('entidade', baseMatch),
      Log.distinct('status', baseMatch),
      Log.distinct('modulo', baseMatch),
      Log.distinct('usuarioTipo', baseMatch),
      Log.distinct('severidade', baseMatch)
    ]);

    const status = new Set((statusDb || []).filter(Boolean));
    const modulos = new Set((modulosDb || []).filter(Boolean));
    const severidades = new Set((severidadesDb || []).filter(Boolean));

    // fallback para base legada
    status.add('sucesso');

    return res.json({
      acoes: Array.from(new Set((acoes || []).filter(Boolean))).sort(),
      entidades: Array.from(new Set((entidades || []).filter(Boolean))).sort(),
      status: Array.from(status).sort(),
      modulos: Array.from(modulos).sort(),
      usuariosTipos: Array.from(new Set((usuariosTipos || []).filter(Boolean))).sort(),
      severidades: Array.from(severidades).sort()
    });
  } catch (err) {
    console.error('Erro ao carregar metadados de logs:', err);
    return res.status(500).json({ mensagem: 'Erro ao carregar metadados de logs.' });
  }
});

/**
 * GET /api/logs
 */
router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ mensagem: 'Tenant não identificado.' });
    }

    const limit = Math.min(parsePositiveInt(req.query.limit, 200), 500);

    const requestedPage = parsePositiveInt(req.query.page, 1);
    const requestedSkip = req.query.skip !== undefined
      ? parseNonNegativeInt(req.query.skip, 0)
      : (requestedPage - 1) * limit;

    const sortFieldRaw = String(req.query.sort || 'createdAt').trim();
    const allowedSortFields = new Set([
      'createdAt',
      'updatedAt',
      'acao',
      'entidade',
      'usuarioNome',
      'status',
      'modulo',
      'tempoExecucaoMs'
    ]);
    const sortField = allowedSortFields.has(sortFieldRaw) ? sortFieldRaw : 'createdAt';
    const sortDirection = parseSortDirection(req.query.order || req.query.dir || 'desc');

    const filtro = buildMongoFilter(req);

    const total = await Log.countDocuments(filtro);

    const docs = await Log.find(filtro)
      .sort({ [sortField]: sortDirection, _id: sortDirection })
      .skip(requestedSkip)
      .limit(limit)
      .lean();

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.max(1, Math.floor(requestedSkip / limit) + 1);

    const data = docs.map(toResponseItem);

    res.json({
      total,
      count: total,
      skip: requestedSkip,
      limit,
      page: currentPage,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      sort: sortField,
      order: sortDirection === 1 ? 'asc' : 'desc',
      data
    });
  } catch (err) {
    console.error('Erro ao listar logs:', err);
    res.status(500).json({ mensagem: 'Erro ao listar logs.' });
  }
});

/**
 * GET /api/logs/:id
 */
router.get('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ mensagem: 'Tenant não identificado.' });
    }

    const id = String(req.params.id || '').trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'ID de log inválido.' });
    }

    const filtro = {
      $and: [
        buildTenantMatch(tenantId),
        { _id: new mongoose.Types.ObjectId(id) }
      ]
    };

    const doc = await Log.findOne(filtro).lean();

    if (!doc) {
      return res.status(404).json({ mensagem: 'Log não encontrado.' });
    }

    return res.json(toResponseItem(doc));
  } catch (err) {
    console.error('Erro ao detalhar log:', err);
    return res.status(500).json({ mensagem: 'Erro ao detalhar log.' });
  }
});

module.exports = router;