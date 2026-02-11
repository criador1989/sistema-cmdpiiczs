// backend/models/Observacao.js
'use strict';
const mongoose = require('mongoose');

const observacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true,
    index: true,
  },
  texto: {
    type: String,
    required: true
  },
  autor: {
    type: String,
    default: 'Desconhecido'
  },
  criadoEm: {
    type: Date,
    default: Date.now,
    index: true,
  },

  // ✅ AGORA PADRÃO MULTI-TENANT (ObjectId)
  instituicao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true,
  }
}, { timestamps: true });

// Índices coerentes com as consultas por aluno/instituição e ordenação por data
observacaoSchema.index({ aluno: 1, criadoEm: -1 });
observacaoSchema.index({ instituicao: 1, aluno: 1, criadoEm: -1 });

module.exports = mongoose.models.Observacao || mongoose.model('Observacao', observacaoSchema);
