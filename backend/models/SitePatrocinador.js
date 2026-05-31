'use strict';

const mongoose = require('mongoose');

const SitePatrocinadorSchema = new mongoose.Schema({
  tenant: {
    type: String,
    default: 'cmdpii-czs',
    index: true
  },

  nome: {
    type: String,
    required: true,
    trim: true
  },

  descricao: {
    type: String,
    default: ''
  },

  imagem: {
    type: String,
    default: ''
  },

  url: {
    type: String,
    default: ''
  },

  tipo: {
    type: String,
    enum: ['patrocinador', 'parceiro', 'atalho', 'campanha'],
    default: 'patrocinador',
    index: true
  },

  status: {
    type: String,
    enum: ['ativo', 'inativo'],
    default: 'ativo',
    index: true
  },

  destaque: {
    type: Boolean,
    default: false,
    index: true
  },

  ordem: {
    type: Number,
    default: 0,
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

SitePatrocinadorSchema.index({
  tenant: 1,
  ordem: 1,
  createdAt: -1
});

module.exports =
  mongoose.models.SitePatrocinador ||
  mongoose.model(
    'SitePatrocinador',
    SitePatrocinadorSchema
  );