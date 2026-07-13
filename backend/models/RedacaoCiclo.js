'use strict';

const mongoose = require('mongoose');

const RedacaoCicloSchema = new mongoose.Schema({
  instituicao: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    index: true
  },

  nome: {
    type: String,
    required: true,
    trim: true
  },

  modalidade: {
    type: String,
    enum: ['trilha_orientada', 'avaliacao_institucional'],
    required: true,
    index: true
  },

  temaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RedacaoTema',
    required: true,
    index: true
  },

  turmasDestinadas: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  publicoAlvo: {
    type: String,
    default: 'Ensino Médio',
    trim: true
  },

  status: {
    type: String,
    enum: ['rascunho', 'ativo', 'encerrado'],
    default: 'rascunho',
    index: true
  },

  dataInicio: {
    type: Date,
    default: null
  },

  dataFim: {
    type: Date,
    default: null
  },

  maxEnviosPorAluno: {
    type: Number,
    default: 2,
    min: 1,
    max: 10
  },

  permiteReescrita: {
    type: Boolean,
    default: true
  },

  assistenteDuranteEscrita: {
    type: Boolean,
    default: true
  },

  cronometroObrigatorio: {
    type: Boolean,
    default: false
  },

  tempoLimiteMinutos: {
    type: Number,
    default: 60,
    min: 10,
    max: 240
  },

  mostrarTextosMotivadores: {
    type: Boolean,
    default: true
  },

  instrucoesAluno: {
    type: String,
    default: '',
    trim: true
  },

  criadoPor: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  atualizadoPor: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  collection: 'redacao_ciclos'
});

RedacaoCicloSchema.index({
  instituicao: 1,
  modalidade: 1,
  status: 1,
  dataInicio: 1,
  dataFim: 1
});

RedacaoCicloSchema.index({
  instituicao: 1,
  temaId: 1,
  status: 1
});

module.exports = mongoose.model('RedacaoCiclo', RedacaoCicloSchema);
