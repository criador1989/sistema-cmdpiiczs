'use strict';

const mongoose = require('mongoose');

const LinkSchema = new mongoose.Schema({
  texto: { type: String, default: '' },
  url: { type: String, default: '' },
  alvo: {
    type: String,
    enum: ['mesma-aba', 'nova-aba'],
    default: 'mesma-aba'
  }
}, { _id: false });

const SiteBlocoSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    index: true
  },

  pagina: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SitePagina',
    required: true,
    index: true
  },

  tipo: {
    type: String,
    enum: [
      'banner',
      'texto',
      'texto-imagem',
      'imagem',
      'galeria',
      'video',
      'botao',
      'cards',
      'noticias',
      'patrocinadores',
      'formulario-link',
      'documentos',
      'contador',
      'mapa',
      'html-livre'
    ],
    required: true
  },

  titulo: {
    type: String,
    default: ''
  },

  subtitulo: {
    type: String,
    default: ''
  },

  texto: {
    type: String,
    default: ''
  },

  imagemUrl: {
    type: String,
    default: ''
  },

  videoUrl: {
    type: String,
    default: ''
  },

  arquivoUrl: {
    type: String,
    default: ''
  },

  link: {
    type: LinkSchema,
    default: () => ({})
  },

  itens: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  configuracao: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  ordem: {
    type: Number,
    default: 0,
    index: true
  },

  ativo: {
    type: Boolean,
    default: true,
    index: true
  },

  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  }
}, {
  timestamps: true
});

SiteBlocoSchema.index({ tenant: 1, pagina: 1, ordem: 1 });

module.exports = mongoose.models.SiteBloco || mongoose.model('SiteBloco', SiteBlocoSchema);