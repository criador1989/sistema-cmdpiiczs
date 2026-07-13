'use strict';

const mongoose = require('mongoose');

const SitePaginaSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    index: true
  },

  titulo: {
    type: String,
    required: true,
    trim: true
  },

  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  descricao: {
    type: String,
    default: ''
  },

  tipo: {
    type: String,
    enum: ['home', 'pagina', 'noticias', 'galeria', 'contato', 'processo-seletivo', 'interclasse'],
    default: 'pagina'
  },

  status: {
    type: String,
    enum: ['rascunho', 'publicada', 'arquivada'],
    default: 'publicada',
    index: true
  },

  seoTitulo: {
    type: String,
    default: ''
  },

  seoDescricao: {
    type: String,
    default: ''
  },

  ordem: {
    type: Number,
    default: 0
  },

  criadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  atualizadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true
});

SitePaginaSchema.index({ tenant: 1, slug: 1 }, { unique: true });

module.exports = mongoose.models.SitePagina || mongoose.model('SitePagina', SitePaginaSchema);