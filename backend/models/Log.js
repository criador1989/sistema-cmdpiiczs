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
  usuarioNome:   { type: String, trim: true },  // denormalizado (pra listar rápido)
  usuarioTipo:   { type: String, trim: true },  // 'admin', 'professor', ...
  usuarioEmail:  { type: String, trim: true },  // opcional, útil no filtro

  // O que aconteceu
  acao:         { type: String, required: true, index: true, trim: true }, // 'NOTIFICACAO_CRIADA', ...
  entidade:     { type: String, required: true, trim: true },              // 'Notificacao'
  entidadeId:   { type: String, required: true, index: true, trim: true },
  entidadeNome: { type: String, trim: true },                              // ex.: nome do aluno (quando fizer sentido)

  // Extras pra filtro rápido
  aluno:     { type: mongoose.Schema.Types.ObjectId, ref: 'Aluno', index: true },
  alunoNome: { type: String, trim: true },

  // Payload livre (antes/depois, etc.)
  detalhes: { type: Object, default: {} },

  // (opcional) rastros
  ip:        { type: String, trim: true },
  userAgent: { type: String, trim: true },

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
    if (typeof this.ip === 'string') this.ip = this.ip.trim();
    if (typeof this.userAgent === 'string') this.userAgent = this.userAgent.trim();

    if (!this.detalhes || typeof this.detalhes !== 'object' || Array.isArray(this.detalhes)) {
      this.detalhes = {};
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
    if (typeof alvo.ip === 'string') alvo.ip = alvo.ip.trim();
    if (typeof alvo.userAgent === 'string') alvo.userAgent = alvo.userAgent.trim();

    if ('detalhes' in alvo) {
      if (!alvo.detalhes || typeof alvo.detalhes !== 'object' || Array.isArray(alvo.detalhes)) {
        alvo.detalhes = {};
      }
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