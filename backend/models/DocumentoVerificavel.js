'use strict';

const mongoose = require('mongoose');

const documentoVerificavelSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    index: true
  },

  titulo: {
    type: String,
    required: true
  },

  hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    default: null,
    index: true
  },

  alunoNome: {
    type: String,
    default: ''
  },

  alunoTurma: {
    type: String,
    default: ''
  },

  caminhoLocal: {
    type: String,
    default: ''
  },

  urlValidacao: {
    type: String,
    default: ''
  },

  instituicao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true
  },

  geradoPor: {
    type: String,
    default: 'Sistema'
  },

  metadados: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true
});

documentoVerificavelSchema.pre('validate', function(next) {
  if (this.instituicao && !this.tenantId) {
    this.tenantId = this.instituicao;
  }

  if (this.tenantId && !this.instituicao) {
    this.instituicao = this.tenantId;
  }

  next();
});

module.exports = mongoose.models.DocumentoVerificavel ||
  mongoose.model('DocumentoVerificavel', documentoVerificavelSchema);