// backend/models/Log.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

/* =========================
   HELPERS TENANT
========================= */
function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

function normalizeInstituicaoString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function objectIdToString(value) {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function toTrimmedStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function sanitizeObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value;
}

function sincronizarTenant(doc) {
  const instituicaoStr = normalizeInstituicaoString(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (tenantId && !instituicaoStr) {
    doc.instituicao = String(tenantId);
    return;
  }

  if (instituicaoStr && !tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    doc.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    return;
  }

  if (instituicaoStr && tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (instituicaoStr !== objectIdToString(tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId em Log.');
    }
  }
}

function sincronizarTenantNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};

  const instituicaoDireta = update.instituicao;
  const tenantDireto = update.tenantId;

  const instituicaoSet = $set.instituicao ?? $setOnInsert.instituicao ?? instituicaoDireta;
  const tenantSet = $set.tenantId ?? $setOnInsert.tenantId ?? tenantDireto;

  const instituicaoStr = normalizeInstituicaoString(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (tenantId && !instituicaoStr) {
    if (update.$set) update.$set.instituicao = String(tenantId);
    else update.instituicao = String(tenantId);
    return;
  }

  if (instituicaoStr && !tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (update.$set) update.$set.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    else update.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    return;
  }

  if (instituicaoStr && tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (instituicaoStr !== objectIdToString(tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId no update de Log.');
    }
  }
}

/* =========================
   SUBSCHEMAS
========================= */
const actorSnapshotSchema = new Schema({
  id: { type: String, trim: true, default: null },
  nome: { type: String, trim: true, default: null },
  tipo: { type: String, trim: true, default: null },
  email: { type: String, trim: true, default: null },
  instituicao: { type: String, trim: true, default: null }
}, { _id: false });

const requestContextSchema = new Schema({
  method: { type: String, trim: true, default: null },
  path: { type: String, trim: true, default: null },
  originalUrl: { type: String, trim: true, default: null },
  baseUrl: { type: String, trim: true, default: null },
  routePath: { type: String, trim: true, default: null },
  statusCode: { type: Number, default: null },
  origin: { type: String, trim: true, default: null },
  referer: { type: String, trim: true, default: null },
  host: { type: String, trim: true, default: null },
  protocolo: { type: String, trim: true, default: null },
  ip: { type: String, trim: true, default: null },
  forwardedFor: { type: String, trim: true, default: null }
}, { _id: false });

/* =========================
   SCHEMA
========================= */
const logSchema = new mongoose.Schema({
  instituicao: { type: String, required: true, index: true },

  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true,
  },

  // Quem fez a ação
  usuario:       { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  usuarioNome:   { type: String, trim: true },
  usuarioTipo:   { type: String, trim: true },
  usuarioEmail:  { type: String, trim: true },

  // O que aconteceu
  acao:         { type: String, required: true, index: true, trim: true },
  entidade:     { type: String, required: true, trim: true, index: true },
  entidadeId:   { type: String, required: true, index: true, trim: true },
  entidadeNome: { type: String, trim: true },

  // Extras pra filtro rápido
  aluno:     { type: mongoose.Schema.Types.ObjectId, ref: 'Aluno', index: true, default: null },
  alunoNome: { type: String, trim: true },

  // ✅ NOVOS CAMPOS DE AUDITORIA (mantendo compatibilidade)
  modulo:        { type: String, trim: true, index: true, default: null },
  categoria:     { type: String, trim: true, index: true, default: null },
  severidade:    { type: String, trim: true, index: true, default: null }, // info | aviso | critica
  status:        { type: String, trim: true, index: true, default: 'sucesso' }, // sucesso | erro | negado
  motivo:        { type: String, trim: true, default: null },

  sessionId:     { type: String, trim: true, index: true, default: null },
  correlationId: { type: String, trim: true, index: true, default: null },
  requestId:     { type: String, trim: true, index: true, default: null },

  tempoExecucaoMs: { type: Number, default: null, min: 0 },

  // Contexto técnico
  ip:          { type: String, trim: true, index: true },
  userAgent:   { type: String, trim: true },
  dispositivo: { type: String, trim: true, default: null },
  navegador:   { type: String, trim: true, default: null },
  sistema:     { type: String, trim: true, default: null },
  origem:      { type: String, trim: true, default: null },

  // Contexto de request
  requestContext: { type: requestContextSchema, default: () => ({}) },

  // Snapshot do ator
  ator: { type: actorSnapshotSchema, default: () => ({}) },

  // Delta de alteração
  antes: { type: Schema.Types.Mixed, default: null },
  depois: { type: Schema.Types.Mixed, default: null },

  // Payload livre (backward compatible)
  detalhes: { type: Schema.Types.Mixed, default: {} },

  // Campo legado / livre para erro
  erro: { type: Schema.Types.Mixed, default: null },

}, { timestamps: true });

/* =========================
   ÍNDICES
========================= */
logSchema.index({ instituicao: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, usuario: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, usuario: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, acao: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, acao: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, entidade: 1, entidadeId: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, entidade: 1, entidadeId: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, aluno: 1, createdAt: -1 });

// ✅ índices novos
logSchema.index({ instituicao: 1, modulo: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, modulo: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, sessionId: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, sessionId: 1, createdAt: -1 });

logSchema.index({ instituicao: 1, correlationId: 1, createdAt: -1 });
logSchema.index({ tenantId: 1, correlationId: 1, createdAt: -1 });

/* =========================
   MIDDLEWARES
========================= */
logSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.instituicao === 'string') this.instituicao = this.instituicao.trim();
    if (typeof this.usuarioNome === 'string') this.usuarioNome = this.usuarioNome.trim();
    if (typeof this.usuarioTipo === 'string') this.usuarioTipo = this.usuarioTipo.trim();
    if (typeof this.usuarioEmail === 'string') this.usuarioEmail = this.usuarioEmail.trim();

    if (typeof this.acao === 'string') this.acao = this.acao.trim();
    if (typeof this.entidade === 'string') this.entidade = this.entidade.trim();
    if (typeof this.entidadeId === 'string') this.entidadeId = this.entidadeId.trim();
    if (typeof this.entidadeNome === 'string') this.entidadeNome = this.entidadeNome.trim();

    if (typeof this.alunoNome === 'string') this.alunoNome = this.alunoNome.trim();

    if (typeof this.modulo === 'string') this.modulo = this.modulo.trim();
    if (typeof this.categoria === 'string') this.categoria = this.categoria.trim();
    if (typeof this.severidade === 'string') this.severidade = this.severidade.trim();
    if (typeof this.status === 'string') this.status = this.status.trim();
    if (typeof this.motivo === 'string') this.motivo = this.motivo.trim();

    if (typeof this.sessionId === 'string') this.sessionId = this.sessionId.trim();
    if (typeof this.correlationId === 'string') this.correlationId = this.correlationId.trim();
    if (typeof this.requestId === 'string') this.requestId = this.requestId.trim();

    if (typeof this.ip === 'string') this.ip = this.ip.trim();
    if (typeof this.userAgent === 'string') this.userAgent = this.userAgent.trim();
    if (typeof this.dispositivo === 'string') this.dispositivo = this.dispositivo.trim();
    if (typeof this.navegador === 'string') this.navegador = this.navegador.trim();
    if (typeof this.sistema === 'string') this.sistema = this.sistema.trim();
    if (typeof this.origem === 'string') this.origem = this.origem.trim();

    this.modulo = toTrimmedStringOrNull(this.modulo);
    this.categoria = toTrimmedStringOrNull(this.categoria);
    this.severidade = toTrimmedStringOrNull(this.severidade);
    this.status = toTrimmedStringOrNull(this.status) || 'sucesso';
    this.motivo = toTrimmedStringOrNull(this.motivo);

    this.sessionId = toTrimmedStringOrNull(this.sessionId);
    this.correlationId = toTrimmedStringOrNull(this.correlationId);
    this.requestId = toTrimmedStringOrNull(this.requestId);

    this.ip = toTrimmedStringOrNull(this.ip);
    this.userAgent = toTrimmedStringOrNull(this.userAgent);
    this.dispositivo = toTrimmedStringOrNull(this.dispositivo);
    this.navegador = toTrimmedStringOrNull(this.navegador);
    this.sistema = toTrimmedStringOrNull(this.sistema);
    this.origem = toTrimmedStringOrNull(this.origem);

    if (!Number.isFinite(this.tempoExecucaoMs) || this.tempoExecucaoMs < 0) {
      this.tempoExecucaoMs = null;
    }

    this.detalhes = sanitizeObject(this.detalhes, {});
    this.requestContext = sanitizeObject(this.requestContext, {});
    this.ator = sanitizeObject(this.ator, {});
    this.erro = this.erro && typeof this.erro === 'object' ? this.erro : this.erro ?? null;

    if (this.requestContext) {
      if (typeof this.requestContext.method === 'string') this.requestContext.method = this.requestContext.method.trim();
      if (typeof this.requestContext.path === 'string') this.requestContext.path = this.requestContext.path.trim();
      if (typeof this.requestContext.originalUrl === 'string') this.requestContext.originalUrl = this.requestContext.originalUrl.trim();
      if (typeof this.requestContext.baseUrl === 'string') this.requestContext.baseUrl = this.requestContext.baseUrl.trim();
      if (typeof this.requestContext.routePath === 'string') this.requestContext.routePath = this.requestContext.routePath.trim();
      if (typeof this.requestContext.origin === 'string') this.requestContext.origin = this.requestContext.origin.trim();
      if (typeof this.requestContext.referer === 'string') this.requestContext.referer = this.requestContext.referer.trim();
      if (typeof this.requestContext.host === 'string') this.requestContext.host = this.requestContext.host.trim();
      if (typeof this.requestContext.protocolo === 'string') this.requestContext.protocolo = this.requestContext.protocolo.trim();
      if (typeof this.requestContext.ip === 'string') this.requestContext.ip = this.requestContext.ip.trim();
      if (typeof this.requestContext.forwardedFor === 'string') this.requestContext.forwardedFor = this.requestContext.forwardedFor.trim();
    }

    if (this.ator) {
      if (typeof this.ator.id === 'string') this.ator.id = this.ator.id.trim();
      if (typeof this.ator.nome === 'string') this.ator.nome = this.ator.nome.trim();
      if (typeof this.ator.tipo === 'string') this.ator.tipo = this.ator.tipo.trim();
      if (typeof this.ator.email === 'string') this.ator.email = this.ator.email.trim();
      if (typeof this.ator.instituicao === 'string') this.ator.instituicao = this.ator.instituicao.trim();
    }

    next();
  } catch (err) {
    next(err);
  }
});

logSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.instituicao === 'string') alvo.instituicao = alvo.instituicao.trim();
    if (typeof alvo.usuarioNome === 'string') alvo.usuarioNome = alvo.usuarioNome.trim();
    if (typeof alvo.usuarioTipo === 'string') alvo.usuarioTipo = alvo.usuarioTipo.trim();
    if (typeof alvo.usuarioEmail === 'string') alvo.usuarioEmail = alvo.usuarioEmail.trim();

    if (typeof alvo.acao === 'string') alvo.acao = alvo.acao.trim();
    if (typeof alvo.entidade === 'string') alvo.entidade = alvo.entidade.trim();
    if (typeof alvo.entidadeId === 'string') alvo.entidadeId = alvo.entidadeId.trim();
    if (typeof alvo.entidadeNome === 'string') alvo.entidadeNome = alvo.entidadeNome.trim();

    if (typeof alvo.alunoNome === 'string') alvo.alunoNome = alvo.alunoNome.trim();

    if (typeof alvo.modulo === 'string') alvo.modulo = alvo.modulo.trim();
    if (typeof alvo.categoria === 'string') alvo.categoria = alvo.categoria.trim();
    if (typeof alvo.severidade === 'string') alvo.severidade = alvo.severidade.trim();
    if (typeof alvo.status === 'string') alvo.status = alvo.status.trim();
    if (typeof alvo.motivo === 'string') alvo.motivo = alvo.motivo.trim();

    if (typeof alvo.sessionId === 'string') alvo.sessionId = alvo.sessionId.trim();
    if (typeof alvo.correlationId === 'string') alvo.correlationId = alvo.correlationId.trim();
    if (typeof alvo.requestId === 'string') alvo.requestId = alvo.requestId.trim();

    if (typeof alvo.ip === 'string') alvo.ip = alvo.ip.trim();
    if (typeof alvo.userAgent === 'string') alvo.userAgent = alvo.userAgent.trim();
    if (typeof alvo.dispositivo === 'string') alvo.dispositivo = alvo.dispositivo.trim();
    if (typeof alvo.navegador === 'string') alvo.navegador = alvo.navegador.trim();
    if (typeof alvo.sistema === 'string') alvo.sistema = alvo.sistema.trim();
    if (typeof alvo.origem === 'string') alvo.origem = alvo.origem.trim();

    if ('tempoExecucaoMs' in alvo) {
      if (!Number.isFinite(alvo.tempoExecucaoMs) || alvo.tempoExecucaoMs < 0) {
        alvo.tempoExecucaoMs = null;
      }
    }

    if ('detalhes' in alvo) {
      alvo.detalhes = sanitizeObject(alvo.detalhes, {});
    }

    if ('requestContext' in alvo) {
      alvo.requestContext = sanitizeObject(alvo.requestContext, {});
    }

    if ('ator' in alvo) {
      alvo.ator = sanitizeObject(alvo.ator, {});
    }

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUALS
========================= */
logSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.Log || mongoose.model('Log', logSchema);