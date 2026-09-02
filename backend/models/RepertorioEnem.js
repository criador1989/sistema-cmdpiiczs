'use strict';

const mongoose = require('mongoose');

const RepertorioEnemSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, default: 'global', index: true },
  codigo: { type: String, required: true, trim: true, uppercase: true, index: true },
  titulo: { type: String, required: true, trim: true },
  autorFonte: { type: String, default: '', trim: true },
  area: { type: String, default: '', trim: true, index: true },
  eixos: [{ type: String, trim: true, index: true }],
  ideiaCentral: { type: String, default: '', trim: true },
  comoUsarProdutivamente: { type: String, default: '', trim: true },
  riscoUsoGenerico: { type: String, default: 'Evite citar sem contextualizar e sem relacionar ao argumento.', trim: true },
  fonteReferencia: { type: String, default: '', trim: true },
  status: { type: String, enum: ['ativo','inativo','arquivado'], default: 'ativo', index: true },
  criadoPor: { type: mongoose.Schema.Types.Mixed, default: null },
  atualizadoPor: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, collection: 'enem_repertorios' });

RepertorioEnemSchema.index({ instituicao: 1, codigo: 1 }, { unique: true });
RepertorioEnemSchema.index({ instituicao: 1, status: 1, area: 1 });

module.exports = mongoose.models.RepertorioEnem || mongoose.model('RepertorioEnem', RepertorioEnemSchema);
