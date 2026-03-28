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
    throw new Error('Inconsistência entre instituicao e tenantId no APH atendimento.');
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
    throw new Error('Inconsistência entre instituicao e tenantId no update do APH atendimento.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(v => String(v || '').trim()).filter(Boolean))];
}

/* =========================
   SCHEMA
========================= */
const AphAtendimentoSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },

    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      default: null,
      index: true,
    },

    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Aluno',
    },

    // Identificação & contexto
    responsavel: { type: String, trim: true, default: '' },
    local: { type: String, trim: true, default: '' },
    hora: { type: String, trim: true, default: '' },
    data: { type: Date, default: Date.now, index: true },

    // Seleções do formulário
    tipos: { type: [String], default: [] },
    materiais: { type: [String], default: [] },

    // Campos livres (compat com versões anteriores)
    sinaisESintomas: { type: String, trim: true, default: '' },
    procedimentos:   { type: String, trim: true, default: '' },
    observacoes:     { type: String, trim: true, default: '' },
    observacao:      { type: String, trim: true, default: '' }, // legado

    // Comunicação com responsáveis
    responsaveisInformados: { type: String, enum: ['Sim', 'Não'], default: 'Não', trim: true },
    meioComunicacao: { type: String, trim: true, default: '' },

    // Encaminhamento
    houveEncaminhamento: { type: Boolean, default: false },
    encaminhamento: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

/* =========================
   ÍNDICES
========================= */
AphAtendimentoSchema.index({ instituicao: 1, alunoId: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, alunoId: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, local: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, local: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, responsaveisInformados: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, responsaveisInformados: 1, data: -1 });

/* =========================
   MIDDLEWARES
========================= */
AphAtendimentoSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.responsavel === 'string') this.responsavel = this.responsavel.trim();
    if (typeof this.local === 'string') this.local = this.local.trim();
    if (typeof this.hora === 'string') this.hora = this.hora.trim();

    this.tipos = normalizeStringArray(this.tipos);
    this.materiais = normalizeStringArray(this.materiais);

    if (typeof this.sinaisESintomas === 'string') this.sinaisESintomas = this.sinaisESintomas.trim();
    if (typeof this.procedimentos === 'string') this.procedimentos = this.procedimentos.trim();
    if (typeof this.observacoes === 'string') this.observacoes = this.observacoes.trim();
    if (typeof this.observacao === 'string') this.observacao = this.observacao.trim();

    if (typeof this.responsaveisInformados === 'string') {
      const v = this.responsaveisInformados.trim();
      this.responsaveisInformados = (v === 'Sim' || v === 'Não') ? v : 'Não';
    }

    if (typeof this.meioComunicacao === 'string') this.meioComunicacao = this.meioComunicacao.trim();
    if (typeof this.encaminhamento === 'string') this.encaminhamento = this.encaminhamento.trim();

    next();
  } catch (err) {
    next(err);
  }
});

AphAtendimentoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.responsavel === 'string') alvo.responsavel = alvo.responsavel.trim();
    if (typeof alvo.local === 'string') alvo.local = alvo.local.trim();
    if (typeof alvo.hora === 'string') alvo.hora = alvo.hora.trim();

    if (Array.isArray(alvo.tipos)) alvo.tipos = normalizeStringArray(alvo.tipos);
    if (Array.isArray(alvo.materiais)) alvo.materiais = normalizeStringArray(alvo.materiais);

    if (typeof alvo.sinaisESintomas === 'string') alvo.sinaisESintomas = alvo.sinaisESintomas.trim();
    if (typeof alvo.procedimentos === 'string') alvo.procedimentos = alvo.procedimentos.trim();
    if (typeof alvo.observacoes === 'string') alvo.observacoes = alvo.observacoes.trim();
    if (typeof alvo.observacao === 'string') alvo.observacao = alvo.observacao.trim();

    if (typeof alvo.responsaveisInformados === 'string') {
      const v = alvo.responsaveisInformados.trim();
      alvo.responsaveisInformados = (v === 'Sim' || v === 'Não') ? v : 'Não';
    }

    if (typeof alvo.meioComunicacao === 'string') alvo.meioComunicacao = alvo.meioComunicacao.trim();
    if (typeof alvo.encaminhamento === 'string') alvo.encaminhamento = alvo.encaminhamento.trim();

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUALS
========================= */
AphAtendimentoSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.AphAtendimento || mongoose.model('AphAtendimento', AphAtendimentoSchema);