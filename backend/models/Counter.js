// backend/models/Counter.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/* =========================
   HELPERS
========================= */
function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

function objectIdToString(value) {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function trimStr(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function getInstituicaoFromChave(chave) {
  const s = String(chave || '').trim();
  if (!s) return null;

  // padrão esperado: notificacao:<instituicao>:<ano>
  const parts = s.split(':').map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const instituicao = parts[1];
  return instituicao || null;
}

function sincronizarTenant(doc) {
  const tenantId = toObjectIdOrNull(doc.tenantId);
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const instituicaoDaChave = getInstituicaoFromChave(doc.chave);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no Counter.');
  }

  if (instituicao && !tenantId) {
    doc.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    doc.instituicao = tenantId;
  }

  // Se a chave tiver ObjectId válido, tenta alinhar
  if (instituicaoDaChave && mongoose.Types.ObjectId.isValid(instituicaoDaChave)) {
    const instituicaoFromKey = new mongoose.Types.ObjectId(instituicaoDaChave);

    if (!doc.instituicao && !doc.tenantId) {
      doc.instituicao = instituicaoFromKey;
      doc.tenantId = instituicaoFromKey;
      return;
    }

    if (doc.instituicao && objectIdToString(doc.instituicao) !== objectIdToString(instituicaoFromKey)) {
      throw new Error('A chave do Counter não corresponde à instituicao informada.');
    }

    if (doc.tenantId && objectIdToString(doc.tenantId) !== objectIdToString(instituicaoFromKey)) {
      throw new Error('A chave do Counter não corresponde ao tenantId informado.');
    }
  }
}

function sincronizarTenantNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};

  const chaveDireta = update.chave;
  const instituicaoDireta = update.instituicao;
  const tenantDireto = update.tenantId;

  const chaveSet = $set.chave ?? $setOnInsert.chave ?? chaveDireta;
  const instituicaoSet = $set.instituicao ?? $setOnInsert.instituicao ?? instituicaoDireta;
  const tenantSet = $set.tenantId ?? $setOnInsert.tenantId ?? tenantDireto;

  const instituicao = toObjectIdOrNull(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);
  const instituicaoDaChave = getInstituicaoFromChave(chaveSet);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do Counter.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }

  if (instituicaoDaChave && mongoose.Types.ObjectId.isValid(instituicaoDaChave)) {
    const instituicaoFromKey = new mongoose.Types.ObjectId(instituicaoDaChave);

    const finalInstituicao = toObjectIdOrNull(
      (update.$set && update.$set.instituicao) ?? update.instituicao ?? instituicao
    );
    const finalTenantId = toObjectIdOrNull(
      (update.$set && update.$set.tenantId) ?? update.tenantId ?? tenantId
    );

    if (!finalInstituicao && !finalTenantId) {
      if (update.$set) {
        update.$set.instituicao = instituicaoFromKey;
        update.$set.tenantId = instituicaoFromKey;
      } else {
        update.instituicao = instituicaoFromKey;
        update.tenantId = instituicaoFromKey;
      }
      return;
    }

    if (finalInstituicao && objectIdToString(finalInstituicao) !== objectIdToString(instituicaoFromKey)) {
      throw new Error('A chave do Counter não corresponde à instituicao no update.');
    }

    if (finalTenantId && objectIdToString(finalTenantId) !== objectIdToString(instituicaoFromKey)) {
      throw new Error('A chave do Counter não corresponde ao tenantId no update.');
    }
  }
}

/* =========================
   SCHEMA
========================= */
const CounterSchema = new mongoose.Schema({
  // chave no formato: notificacao:<instituicao>:<ano>
  chave: {
    type: String,
    unique: true,
    index: true,
    required: true,
    trim: true
  },

  seq: {
    type: Number,
    default: 0
  },

  atualizadoEm: {
    type: Date,
    default: Date.now
  },

  // Novo apoio estrutural para multi-tenant
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true
  },

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
CounterSchema.index({ instituicao: 1, chave: 1 });
CounterSchema.index({ tenantId: 1, chave: 1 });
CounterSchema.index({ instituicao: 1, atualizadoEm: -1 });
CounterSchema.index({ tenantId: 1, atualizadoEm: -1 });

/* =========================
   MIDDLEWARES
========================= */
CounterSchema.pre('validate', function (next) {
  try {
    this.chave = trimStr(this.chave);

    if (typeof this.seq !== 'number' || !Number.isFinite(this.seq)) {
      this.seq = 0;
    }

    sincronizarTenant(this);

    if (!this.atualizadoEm) {
      this.atualizadoEm = new Date();
    }

    next();
  } catch (err) {
    next(err);
  }
});

CounterSchema.pre('save', function (next) {
  this.atualizadoEm = new Date();
  next();
});

CounterSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};

    if (!update.$set) update.$set = {};
    update.$set.atualizadoEm = new Date();

    if ('chave' in update.$set) update.$set.chave = trimStr(update.$set.chave);
    else if ('chave' in update) update.chave = trimStr(update.chave);

    if ('seq' in update.$set) {
      const n = Number(update.$set.seq);
      update.$set.seq = Number.isFinite(n) ? n : 0;
    } else if ('seq' in update) {
      const n = Number(update.seq);
      update.seq = Number.isFinite(n) ? n : 0;
    }

    sincronizarTenantNoUpdate(update);

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUALS
========================= */
CounterSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.Counter || mongoose.model('Counter', CounterSchema, 'counters');