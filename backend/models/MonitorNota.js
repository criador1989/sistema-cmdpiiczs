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
    throw new Error('Inconsistência entre instituicao e tenantId na nota do monitor.');
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
    throw new Error('Inconsistência entre instituicao e tenantId no update da nota do monitor.');
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
const MonitorNotaSchema = new mongoose.Schema({
  monitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true,
    index: true
  },

  data: {
    type: Date,
    default: Date.now,
    index: true
  },

  tipo: {
    type: String,
    enum: ['elogio', 'advertencia', 'observacao'],
    default: 'observacao',
    trim: true,
    index: true
  },

  texto: {
    type: String,
    required: true,
    trim: true
  },

  pontos: {
    type: Number,
    default: 0
  }, // pode ser + ou -, altera o score

  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    index: true
  },

  // Campo institucional principal
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true
  },

  // Novo padrão SaaS
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true
  }

}, { timestamps: true });

/* =========================
   ÍNDICES
========================= */
MonitorNotaSchema.index({ instituicao: 1, monitor: 1, data: -1 });
MonitorNotaSchema.index({ tenantId: 1, monitor: 1, data: -1 });

MonitorNotaSchema.index({ instituicao: 1, tipo: 1, data: -1 });
MonitorNotaSchema.index({ tenantId: 1, tipo: 1, data: -1 });

MonitorNotaSchema.index({ instituicao: 1, registradoPor: 1, data: -1 });
MonitorNotaSchema.index({ tenantId: 1, registradoPor: 1, data: -1 });

/* =========================
   MIDDLEWARES
========================= */
MonitorNotaSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.tipo === 'string') {
      this.tipo = this.tipo.trim();
    }

    if (typeof this.texto === 'string') {
      this.texto = this.texto.trim();
    }

    const n = Number(this.pontos);
    this.pontos = Number.isFinite(n) ? n : 0;

    next();
  } catch (err) {
    next(err);
  }
});

MonitorNotaSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.tipo === 'string') alvo.tipo = alvo.tipo.trim();
    if (typeof alvo.texto === 'string') alvo.texto = alvo.texto.trim();

    if ('pontos' in alvo) {
      const n = Number(alvo.pontos);
      alvo.pontos = Number.isFinite(n) ? n : 0;
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
MonitorNotaSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.MonitorNota || mongoose.model('MonitorNota', MonitorNotaSchema);