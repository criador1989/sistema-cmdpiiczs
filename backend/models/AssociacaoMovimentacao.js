'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  dataMovimentacao: { type: Date, required: true, index: true },
  dataVencimento: { type: Date, default: null, index: true },
  tipo: { type: String, enum: ['Entrada', 'Saída'], required: true, index: true },
  status: { type: String, enum: ['Pago', 'Pendente', 'Previsto', 'Atrasado', 'Cancelado'], default: 'Pago', index: true },
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', default: null, index: true },
  pessoaNome: { type: String, trim: true, default: null },
  alunoNome: { type: String, trim: true, default: null, index: true },
  alunoTurma: { type: String, trim: true, default: null, index: true },
  descricao: { type: String, required: true, trim: true },
  categoria: { type: Schema.Types.ObjectId, ref: 'AssociacaoCategoria', default: null, index: true },
  categoriaNome: { type: String, required: true, trim: true, index: true },
  conta: { type: Schema.Types.ObjectId, ref: 'AssociacaoConta', default: null, index: true },
  contaNome: { type: String, trim: true, default: null },
  projeto: { type: Schema.Types.ObjectId, ref: 'AssociacaoProjeto', default: null, index: true },
  projetoNome: { type: String, trim: true, default: null },
  formaPagamento: { type: String, trim: true, default: null },
  valor: { type: Number, required: true, min: 0.01 },
  observacoes: { type: String, trim: true, default: null },
  origemTipo: { type: String, trim: true, default: null, index: true },
  origemId: { type: String, trim: true, default: null, index: true },
  grupoRecorrencia: { type: String, trim: true, default: null, index: true },
  parcelaNumero: { type: Number, default: null },
  parcelaTotal: { type: Number, default: null },
  cancelamento: {
    motivo: { type: String, trim: true, default: null },
    canceladoEm: { type: Date, default: null },
    canceladoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, dataMovimentacao: -1, status: 1 });
schema.index({ tenantId: 1, pessoa: 1, dataMovimentacao: -1 });
schema.index({ tenantId: 1, projeto: 1, dataMovimentacao: -1 });
schema.index({ tenantId: 1, conta: 1, dataMovimentacao: -1 });

module.exports = mongoose.models.AssociacaoMovimentacao || mongoose.model('AssociacaoMovimentacao', schema);
