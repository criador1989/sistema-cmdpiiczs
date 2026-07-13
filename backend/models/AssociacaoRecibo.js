'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  numero: { type: String, required: true, trim: true },
  movimentacao: { type: Schema.Types.ObjectId, ref: 'AssociacaoMovimentacao', required: true, index: true },
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', default: null },
  pagadorNome: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0.01 },
  dataRecibo: { type: Date, required: true },
  finalidade: { type: String, required: true, trim: true },
  formaPagamento: { type: String, trim: true, default: null },
  status: { type: String, enum: ['Ativo', 'Cancelado'], default: 'Ativo', index: true },
  motivoCancelamento: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, numero: 1 }, { unique: true });
schema.index({ tenantId: 1, movimentacao: 1 }, { unique: true });

module.exports = mongoose.models.AssociacaoRecibo || mongoose.model('AssociacaoRecibo', schema);
