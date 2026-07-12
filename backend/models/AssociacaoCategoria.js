'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  nome: { type: String, required: true, trim: true },
  tipoMovimentacao: { type: String, enum: ['Entrada', 'Saída', 'Ambos'], default: 'Ambos', index: true },
  status: { type: String, enum: ['Ativo', 'Inativo'], default: 'Ativo', index: true },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, nome: 1, tipoMovimentacao: 1 }, { unique: true });

module.exports = mongoose.models.AssociacaoCategoria || mongoose.model('AssociacaoCategoria', schema);
