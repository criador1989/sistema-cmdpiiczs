'use strict';

const mongoose = require('mongoose');

const SiteNoticiaSchema = new mongoose.Schema({
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

  resumo: {
    type: String,
    default: ''
  },

  conteudo: {
    type: String,
    default: ''
  },

  categoria: {
    type: String,
    default: 'Comunicado',
    index: true
  },

  autor: {
    type: String,
    default: 'Comunicação CMDPII'
  },

  imagem: {
    type: String,
    default: ''
  },

  status: {
    type: String,
    enum: ['rascunho', 'publicada', 'arquivada'],
    default: 'rascunho',
    index: true
  },

  destaque: {
    type: Boolean,
    default: false,
    index: true
  },

  dataPublicacao: {
    type: Date,
    default: Date.now,
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

SiteNoticiaSchema.index({ tenant: 1, slug: 1 }, { unique: true });
SiteNoticiaSchema.index({ tenant: 1, status: 1, dataPublicacao: -1 });

module.exports =
  mongoose.models.SiteNoticia ||
  mongoose.model('SiteNoticia', SiteNoticiaSchema);