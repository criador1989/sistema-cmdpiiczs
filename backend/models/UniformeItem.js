'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const componenteSchema = new Schema({
  nome: { type: String, required: true, trim: true },
  quantidade: { type: Number, min: 1, default: 1 },
}, { _id: false });

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', default: null, index: true },
  codigoExterno: { type: String, trim: true, default: '', index: true },
  nome: { type: String, required: true, trim: true },
  descricao: { type: String, trim: true, default: '' },
  categoria: { type: String, trim: true, default: 'uniforme' },
  genero: {
    type: String,
    enum: ['masculino', 'feminino', 'unissex', 'nao_aplicavel'],
    default: 'nao_aplicavel',
  },
  etapa: { type: String, trim: true, default: '' },
  quantidadePecas: { type: Number, min: 1, default: 1 },
  composicao: { type: [componenteSchema], default: [] },
  ativo: { type: Boolean, default: true, index: true },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no item de uniforme.');
  }
});

schema.index({ instituicao: 1, campanha: 1, fornecedor: 1, ativo: 1 });

module.exports = mongoose.models.UniformeItem || mongoose.model('UniformeItem', schema);
