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
    throw new Error('Inconsistência entre instituicao e tenantId na atividade do monitor.');
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
    throw new Error('Inconsistência entre instituicao e tenantId no update da atividade.');
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
const MonitorAtividadeSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true },
  descricao: { type: String, default: '', trim: true },

  tipo: {
    type: String,
    enum: ['revista', 'patrulha', 'evento', 'treinamento', 'outro'],
    default: 'revista',
    trim: true,
    index: true
  },

  inicio: { type: Date, required: true, index: true },
  fim: { type: Date, required: true, index: true },

  participantes: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor' }
  ],

  resultados: { type: String, default: '', trim: true },

  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },

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
MonitorAtividadeSchema.index({ inicio: 1, fim: 1 });

MonitorAtividadeSchema.index({ instituicao: 1, inicio: -1 });
MonitorAtividadeSchema.index({ tenantId: 1, inicio: -1 });

MonitorAtividadeSchema.index({ instituicao: 1, tipo: 1, inicio: -1 });
MonitorAtividadeSchema.index({ tenantId: 1, tipo: 1, inicio: -1 });

MonitorAtividadeSchema.index({ instituicao: 1, participantes: 1 });
MonitorAtividadeSchema.index({ tenantId: 1, participantes: 1 });

/* =========================
   MIDDLEWARES
========================= */
MonitorAtividadeSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.titulo === 'string') this.titulo = this.titulo.trim();
    if (typeof this.descricao === 'string') this.descricao = this.descricao.trim();
    if (typeof this.tipo === 'string') this.tipo = this.tipo.trim();
    if (typeof this.resultados === 'string') this.resultados = this.resultados.trim();

    if (!Array.isArray(this.participantes)) {
      this.participantes = [];
    }

    // garante datas válidas
    if (this.inicio && this.fim && this.fim < this.inicio) {
      throw new Error('Data fim não pode ser menor que a data início.');
    }

    next();
  } catch (err) {
    next(err);
  }
});

MonitorAtividadeSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.titulo === 'string') alvo.titulo = alvo.titulo.trim();
    if (typeof alvo.descricao === 'string') alvo.descricao = alvo.descricao.trim();
    if (typeof alvo.tipo === 'string') alvo.tipo = alvo.tipo.trim();
    if (typeof alvo.resultados === 'string') alvo.resultados = alvo.resultados.trim();

    if (Array.isArray(alvo.participantes)) {
      alvo.participantes = [...new Set(alvo.participantes)];
    }

    if (alvo.inicio && alvo.fim && new Date(alvo.fim) < new Date(alvo.inicio)) {
      return next(new Error('Data fim não pode ser menor que a data início.'));
    }

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUAL
========================= */
MonitorAtividadeSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.MonitorAtividade || mongoose.model('MonitorAtividade', MonitorAtividadeSchema);