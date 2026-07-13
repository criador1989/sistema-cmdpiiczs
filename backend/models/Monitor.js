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
  return value;
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
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no monitor.');
  }

  if (instituicao && !tenantId) {
    doc.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    doc.instituicao = tenantId;
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

  const instituicao = toObjectIdOrNull(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do monitor.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

/* =========================
   SCHEMA
========================= */
const MonitorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  matricula: { type: String, default: '', trim: true },
  telefone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  turno: { type: String, enum: ['manhã', 'tarde', 'noite', 'integral'], default: 'tarde', trim: true },
  ativo: { type: Boolean, default: true, index: true },
  dataAdmissao: { type: Date, default: Date.now },
  dataDesligamento: { type: Date, default: null },
  score: { type: Number, default: 0 },
  observacaoGeral: { type: String, default: '', trim: true },

  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },

  publicView: {
    token: { type: String, index: true, sparse: true },
  },

  // Campo institucional principal
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true,
  },

  // Novo padrão SaaS
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true,
  }
}, { timestamps: true });

/* =========================
   ÍNDICES
========================= */
MonitorSchema.index({ instituicao: 1, nome: 1 });
MonitorSchema.index({ tenantId: 1, nome: 1 });

MonitorSchema.index({ instituicao: 1, ativo: 1, nome: 1 });
MonitorSchema.index({ tenantId: 1, ativo: 1, nome: 1 });

MonitorSchema.index({ instituicao: 1, score: -1, nome: 1 });
MonitorSchema.index({ tenantId: 1, score: -1, nome: 1 });

MonitorSchema.index({ instituicao: 1, matricula: 1 }, { sparse: true });
MonitorSchema.index({ tenantId: 1, matricula: 1 }, { sparse: true });

MonitorSchema.index({ instituicao: 1, email: 1 }, { sparse: true });
MonitorSchema.index({ tenantId: 1, email: 1 }, { sparse: true });

/* =========================
   MIDDLEWARES
========================= */
MonitorSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.nome === 'string') this.nome = this.nome.trim();
    if (typeof this.matricula === 'string') this.matricula = this.matricula.trim();
    if (typeof this.telefone === 'string') this.telefone = this.telefone.trim();
    if (typeof this.email === 'string') this.email = this.email.trim().toLowerCase();
    if (typeof this.turno === 'string') this.turno = this.turno.trim();
    if (typeof this.observacaoGeral === 'string') this.observacaoGeral = this.observacaoGeral.trim();

    if (this.publicView && typeof this.publicView.token === 'string') {
      this.publicView.token = this.publicView.token.trim();
    }

    if (typeof this.score !== 'number' || !Number.isFinite(this.score)) {
      this.score = 0;
    }

    next();
  } catch (err) {
    next(err);
  }
});

MonitorSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.nome === 'string') alvo.nome = alvo.nome.trim();
    if (typeof alvo.matricula === 'string') alvo.matricula = alvo.matricula.trim();
    if (typeof alvo.telefone === 'string') alvo.telefone = alvo.telefone.trim();
    if (typeof alvo.email === 'string') alvo.email = alvo.email.trim().toLowerCase();
    if (typeof alvo.turno === 'string') alvo.turno = alvo.turno.trim();
    if (typeof alvo.observacaoGeral === 'string') alvo.observacaoGeral = alvo.observacaoGeral.trim();

    if (alvo.publicView && typeof alvo.publicView.token === 'string') {
      alvo.publicView.token = alvo.publicView.token.trim();
    }

    if ('score' in alvo) {
      const n = Number(alvo.score);
      alvo.score = Number.isFinite(n) ? n : 0;
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
MonitorSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.Monitor || mongoose.model('Monitor', MonitorSchema);