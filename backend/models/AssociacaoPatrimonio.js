'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  codigo: { type: String, required: true, trim: true, uppercase: true },
  nome: { type: String, required: true, trim: true, index: true },
  categoria: { type: String, trim: true, default: null, index: true },
  descricao: { type: String, trim: true, default: null },
  dataAquisicao: { type: Date, default: null },
  valorAquisicao: { type: Number, default: 0, min: 0 },
  origem: { type: String, enum: ['Compra', 'Doação', 'Parceria', 'Campanha', 'Outro'], default: 'Compra' },
  localizacao: { type: String, trim: true, default: null },
  responsavelNome: { type: String, trim: true, default: null },
  estadoConservacao: { type: String, enum: ['Novo', 'Bom', 'Regular', 'Ruim', 'Inservível'], default: 'Bom', index: true },
  status: { type: String, enum: ['Em uso', 'Em estoque', 'Cedido à escola', 'Em manutenção', 'Baixado'], default: 'Em uso', index: true },
  projeto: { type: Schema.Types.ObjectId, ref: 'AssociacaoProjeto', default: null },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });
schema.index({ tenantId: 1, status: 1, categoria: 1 });

module.exports = mongoose.models.AssociacaoPatrimonio || mongoose.model('AssociacaoPatrimonio', schema);
