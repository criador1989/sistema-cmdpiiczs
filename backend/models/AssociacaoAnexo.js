'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  entidadeTipo: { type: String, enum: ['movimentacao', 'projeto', 'patrimonio', 'documento', 'pessoa'], required: true, index: true },
  entidadeId: { type: Schema.Types.ObjectId, required: true, index: true },
  entidadeNome: { type: String, trim: true, default: null },
  nomeOriginal: { type: String, required: true, trim: true },
  mimeType: { type: String, required: true, trim: true },
  extensao: { type: String, trim: true, default: null },
  tamanhoBytes: { type: Number, default: 0, min: 0 },
  descricao: { type: String, trim: true, default: null },
  storageProvider: { type: String, enum: ['s3', 'local', 'url'], default: 'url' },
  storageKey: { type: String, trim: true, default: null },
  url: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Ativo', 'Removido'], default: 'Ativo', index: true },
  removidoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  motivoRemocao: { type: String, trim: true, default: null },
  removidoEm: { type: Date, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, entidadeTipo: 1, entidadeId: 1, status: 1 });

module.exports = mongoose.models.AssociacaoAnexo || mongoose.model('AssociacaoAnexo', schema);
