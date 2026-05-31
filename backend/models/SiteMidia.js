'use strict';

const mongoose = require('mongoose');

const SiteMidiaSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    index: true
  },

  nomeOriginal: {
    type: String,
    required: true
  },

  nomeArquivo: {
    type: String,
    required: true
  },

  url: {
    type: String,
    required: true
  },

  mimeType: {
    type: String,
    default: ''
  },

  tipo: {
    type: String,
    enum: ['imagem', 'video', 'pdf', 'documento', 'audio', 'outro'],
    default: 'outro',
    index: true
  },

  tamanho: {
    type: Number,
    default: 0
  },

  descricao: {
    type: String,
    default: ''
  },

  alt: {
    type: String,
    default: ''
  },

  usadoEm: {
    type: [String],
    default: []
  },

  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true
});

SiteMidiaSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.models.SiteMidia || mongoose.model('SiteMidia', SiteMidiaSchema);