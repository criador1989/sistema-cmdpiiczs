'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  eventSlug: { type: String, required: true, index: true },
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },

  aliasNomeOriginal: { type: String, trim: true, default: '' },
  aliasTurmaOriginal: { type: String, trim: true, default: '' },
  aliasNomeNorm: { type: String, trim: true, required: true },
  aliasTurmaNorm: { type: String, trim: true, required: true },

  alunoId: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoNome: { type: String, trim: true, required: true },
  alunoTurma: { type: String, trim: true, required: true },

  origem: { type: String, enum: ['confirmacao_manual'], default: 'confirmacao_manual' },
  confirmadoPorId: { type: Schema.Types.ObjectId, default: null },
  confirmadoPorNome: { type: String, trim: true, default: '' },
  primeiraConfirmacaoEm: { type: Date, default: Date.now },
  ultimaConfirmacaoEm: { type: Date, default: Date.now },
  confirmacoes: { type: Number, default: 1, min: 1 },
  ultimoCreditoId: { type: Schema.Types.ObjectId, ref: 'CorridaCredito', default: null },
  ativo: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
  collection: 'corrida_aluno_aliases',
});

schema.index(
  { eventSlug: 1, instituicao: 1, aliasNomeNorm: 1, aliasTurmaNorm: 1 },
  { unique: true, partialFilterExpression: { ativo: true } }
);
schema.index({ instituicao: 1, alunoId: 1, ativo: 1 });

module.exports = mongoose.models.CorridaAlunoAlias || mongoose.model('CorridaAlunoAlias', schema);
