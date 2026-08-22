'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  nome: { type: String, required: true, trim: true },
  anoLetivo: { type: Number, required: true, min: 2000, max: 2200, index: true },
  dataInicio: { type: Date, default: null },
  dataFim: { type: Date, default: null },
  descricao: { type: String, trim: true, default: '' },
  fornecedores: [{ type: Schema.Types.ObjectId, ref: 'UniformeFornecedor' }],
  status: {
    type: String,
    enum: ['rascunho', 'ativa', 'encerrada', 'arquivada'],
    default: 'rascunho',
    index: true,
  },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na campanha de uniformes.');
  }
});

schema.index({ instituicao: 1, anoLetivo: -1, status: 1 });

module.exports = mongoose.models.UniformeCampanha || mongoose.model('UniformeCampanha', schema);
