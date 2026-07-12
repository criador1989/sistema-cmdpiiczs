'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  contribuicao: { type: Schema.Types.ObjectId, ref: 'AssociacaoContribuicao', required: true, index: true },
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', required: true, index: true },
  movimentacao: { type: Schema.Types.ObjectId, ref: 'AssociacaoMovimentacao', required: true, index: true },
  conta: { type: Schema.Types.ObjectId, ref: 'AssociacaoConta', default: null },
  valor: { type: Number, required: true, min: 0.01 },
  dataPagamento: { type: Date, required: true, index: true },
  formaPagamento: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, contribuicao: 1, dataPagamento: -1 });

module.exports = mongoose.models.AssociacaoPagamento || mongoose.model('AssociacaoPagamento', schema);
