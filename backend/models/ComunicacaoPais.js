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
      throw new Error('Inconsistência entre instituicao e tenantId em ComunicacaoPais.');
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
      throw new Error('Inconsistência entre instituicao e tenantId no update de ComunicacaoPais.');
    }
  }
}

/* =========================
   SCHEMA
========================= */
const ComunicacaoPaisSchema = new mongoose.Schema({
  instituicao: { type: String, required: true, index: true },

  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true,
  },

  aluno: { type: mongoose.Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },

  notificacao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notificacao',
    required: true,
    unique: true,
    index: true
  },

  nomeAluno: { type: String, required: true, trim: true },
  turma: { type: String, required: true, trim: true },
  dataNotificacao: { type: Date, required: true, index: true },
  tipoMedida: { type: String, enum: ['A.I.A', 'A.E.C.D.E'], required: true, trim: true },

  observacao: { type: String, default: '', trim: true },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date, required: true },
  horaApresentacao: { type: String, required: true, trim: true }, // HH:MM
  horaSaida: { type: String, required: true, trim: true },        // HH:MM

  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
}, { timestamps: true });

/* =========================
   ÍNDICES
========================= */
ComunicacaoPaisSchema.index({ instituicao: 1, aluno: 1, dataNotificacao: -1 });
ComunicacaoPaisSchema.index({ tenantId: 1, aluno: 1, dataNotificacao: -1 });

ComunicacaoPaisSchema.index({ instituicao: 1, tipoMedida: 1, dataInicio: 1, dataFim: 1 });
ComunicacaoPaisSchema.index({ tenantId: 1, tipoMedida: 1, dataInicio: 1, dataFim: 1 });

ComunicacaoPaisSchema.index({ instituicao: 1, turma: 1, dataNotificacao: -1 });
ComunicacaoPaisSchema.index({ tenantId: 1, turma: 1, dataNotificacao: -1 });

/* =========================
   MIDDLEWARES
========================= */
ComunicacaoPaisSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.instituicao === 'string') {
      this.instituicao = this.instituicao.trim();
    }

    if (typeof this.nomeAluno === 'string') this.nomeAluno = this.nomeAluno.trim();
    if (typeof this.turma === 'string') this.turma = this.turma.trim();
    if (typeof this.tipoMedida === 'string') this.tipoMedida = this.tipoMedida.trim();
    if (typeof this.observacao === 'string') this.observacao = this.observacao.trim();
    if (typeof this.horaApresentacao === 'string') this.horaApresentacao = this.horaApresentacao.trim();
    if (typeof this.horaSaida === 'string') this.horaSaida = this.horaSaida.trim();

    next();
  } catch (err) {
    next(err);
  }
});

ComunicacaoPaisSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.instituicao === 'string') alvo.instituicao = alvo.instituicao.trim();
    if (typeof alvo.nomeAluno === 'string') alvo.nomeAluno = alvo.nomeAluno.trim();
    if (typeof alvo.turma === 'string') alvo.turma = alvo.turma.trim();
    if (typeof alvo.tipoMedida === 'string') alvo.tipoMedida = alvo.tipoMedida.trim();
    if (typeof alvo.observacao === 'string') alvo.observacao = alvo.observacao.trim();
    if (typeof alvo.horaApresentacao === 'string') alvo.horaApresentacao = alvo.horaApresentacao.trim();
    if (typeof alvo.horaSaida === 'string') alvo.horaSaida = alvo.horaSaida.trim();

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUALS
========================= */
ComunicacaoPaisSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.ComunicacaoPais || mongoose.model('ComunicacaoPais', ComunicacaoPaisSchema);