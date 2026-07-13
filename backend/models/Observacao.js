// backend/models/Observacao.js
'use strict';
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
      throw new Error('Inconsistência entre instituicao e tenantId em Observacao.');
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
      throw new Error('Inconsistência entre instituicao e tenantId no update de Observacao.');
    }
  }
}

/* =========================
   SUBSCHEMA DE ANEXOS
========================= */
const anexoSchema = new Schema(
  {
    nome: { type: String, default: '' },
    url: { type: String, default: '' },       // ex: /uploads/observacoes/arquivo.pdf
    mime: { type: String, default: '' },
    tamanho: { type: Number, default: 0 },
    criadoEm: { type: Date, default: Date.now }
  },
  { _id: false }
);

/* =========================
   SCHEMA PRINCIPAL
========================= */
const observacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true,
    index: true,
  },

  texto: {
    type: String,
    required: true,
    trim: true
  },

  autor: {
    type: String,
    default: 'Desconhecido',
    trim: true
  },

  criadoEm: {
    type: Date,
    default: Date.now,
    index: true,
  },

  // ✅ anexos (fotos, PDFs, docs etc.)
  // Mantém 100% compatível com observações antigas
  anexos: {
    type: [anexoSchema],
    default: []
  },

  // Mantém como String para compatibilidade com o restante do sistema
  instituicao: {
    type: String,
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
});

/* =========================
   ÍNDICES
========================= */

// Índices coerentes com as consultas por aluno/instituição e ordenação por data
observacaoSchema.index({ aluno: 1, criadoEm: -1 });
observacaoSchema.index({ instituicao: 1, aluno: 1, criadoEm: -1 });
observacaoSchema.index({ tenantId: 1, aluno: 1, criadoEm: -1 });
observacaoSchema.index({ instituicao: 1, criadoEm: -1 });
observacaoSchema.index({ tenantId: 1, criadoEm: -1 });

/* =========================
   MIDDLEWARES
========================= */
observacaoSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.instituicao === 'string') {
      this.instituicao = this.instituicao.trim();
    }

    if (typeof this.texto === 'string') {
      this.texto = this.texto.trim();
    }

    if (typeof this.autor === 'string') {
      this.autor = this.autor.trim() || 'Desconhecido';
    }

    if (!Array.isArray(this.anexos)) {
      this.anexos = [];
    }

    this.anexos = this.anexos.map((anexo) => ({
      nome: typeof anexo?.nome === 'string' ? anexo.nome.trim() : '',
      url: typeof anexo?.url === 'string' ? anexo.url.trim() : '',
      mime: typeof anexo?.mime === 'string' ? anexo.mime.trim() : '',
      tamanho: typeof anexo?.tamanho === 'number' ? anexo.tamanho : Number(anexo?.tamanho || 0),
      criadoEm: anexo?.criadoEm || new Date()
    }));

    next();
  } catch (err) {
    next(err);
  }
});

observacaoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.instituicao === 'string') {
      alvo.instituicao = alvo.instituicao.trim();
    }

    if (typeof alvo.texto === 'string') {
      alvo.texto = alvo.texto.trim();
    }

    if (typeof alvo.autor === 'string') {
      alvo.autor = alvo.autor.trim() || 'Desconhecido';
    }

    if (Array.isArray(alvo.anexos)) {
      alvo.anexos = alvo.anexos.map((anexo) => ({
        nome: typeof anexo?.nome === 'string' ? anexo.nome.trim() : '',
        url: typeof anexo?.url === 'string' ? anexo.url.trim() : '',
        mime: typeof anexo?.mime === 'string' ? anexo.mime.trim() : '',
        tamanho: typeof anexo?.tamanho === 'number' ? anexo.tamanho : Number(anexo?.tamanho || 0),
        criadoEm: anexo?.criadoEm || new Date()
      }));
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
observacaoSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

module.exports = mongoose.models.Observacao || mongoose.model('Observacao', observacaoSchema);