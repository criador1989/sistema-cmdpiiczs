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
    throw new Error('Inconsistência entre instituicao e tenantId na presença de monitor.');
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
  const instituicao = $set.instituicao ?? update.instituicao;
  const tenantId = $set.tenantId ?? update.tenantId;

  const i = toObjectIdOrNull(instituicao);
  const t = toObjectIdOrNull(tenantId);

  if (i && t && objectIdToString(i) !== objectIdToString(t)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update da presença.');
  }

  if (i && !t) {
    if (update.$set) update.$set.tenantId = i;
    else update.tenantId = i;
  } else if (!i && t) {
    if (update.$set) update.$set.instituicao = t;
    else update.instituicao = t;
  }
}

/* =========================
   SCHEMA
========================= */
const MonitorPresencaSchema = new mongoose.Schema({
  monitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Monitor',
    required: true,
    index: true
  },

  data: {
    type: Date,
    required: true,
    index: true
  },

  status: {
    type: String,
    enum: ['P', 'A', 'FJ'], // Presente, Ausente, Falta Justificada
    required: true,
    trim: true
  },

  motivo: { type: String, default: '', trim: true },
  observacao: { type: String, default: '', trim: true },

  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    index: true
  },

  // 🔐 institucional
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true
  },

  // 🔐 SaaS
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

// único por monitor + data + instituição
MonitorPresencaSchema.index(
  { monitor: 1, data: 1, instituicao: 1 },
  { unique: true }
);

MonitorPresencaSchema.index(
  { monitor: 1, data: 1, tenantId: 1 }
);

// consultas por instituição
MonitorPresencaSchema.index({ instituicao: 1, data: -1 });
MonitorPresencaSchema.index({ tenantId: 1, data: -1 });

MonitorPresencaSchema.index({ instituicao: 1, monitor: 1, data: -1 });
MonitorPresencaSchema.index({ tenantId: 1, monitor: 1, data: -1 });

/* =========================
   MIDDLEWARES
========================= */
MonitorPresencaSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.status === 'string') {
      this.status = this.status.trim();
    }

    if (typeof this.motivo === 'string') {
      this.motivo = this.motivo.trim();
    }

    if (typeof this.observacao === 'string') {
      this.observacao = this.observacao.trim();
    }

    next();
  } catch (err) {
    next(err);
  }
});

MonitorPresencaSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.status === 'string') alvo.status = alvo.status.trim();
    if (typeof alvo.motivo === 'string') alvo.motivo = alvo.motivo.trim();
    if (typeof alvo.observacao === 'string') alvo.observacao = alvo.observacao.trim();

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUAL
========================= */
MonitorPresencaSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.MonitorPresenca || mongoose.model('MonitorPresenca', MonitorPresencaSchema);