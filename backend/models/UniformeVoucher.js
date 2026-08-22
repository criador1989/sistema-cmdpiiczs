'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const divergenciaSchema = new Schema({
  tipo: { type: String, trim: true, default: '' },
  descricao: { type: String, trim: true, default: '' },
  registradaEm: { type: Date, default: null },
}, { _id: false });

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoNomeSnapshot: { type: String, required: true, trim: true, index: true },
  turmaSnapshot: { type: String, required: true, trim: true, index: true },
  codigo: { type: String, required: true, trim: true },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', required: true, index: true },
  item: { type: Schema.Types.ObjectId, ref: 'UniformeItem', required: true, index: true },
  itemCodigoSnapshot: { type: String, trim: true, default: '' },
  itemNomeSnapshot: { type: String, required: true, trim: true },
  quantidade: { type: Number, min: 1, default: 1 },
  lote: { type: String, trim: true, default: '' },
  validade: { type: Date, default: null, index: true },
  emitidoEm: { type: Date, default: null, index: true },
  origem: { type: String, enum: ['manual', 'pdf', 'excel', 'csv', 'api'], default: 'manual' },
  status: {
    type: String,
    enum: [
      'cadastrado',
      'validado',
      'aguardando_fornecedor',
      'disponivel_entrega',
      'agendado',
      'entregue',
      'divergencia',
      'cancelado',
    ],
    default: 'cadastrado',
    index: true,
  },
  entrega: { type: Schema.Types.ObjectId, ref: 'UniformeEntrega', default: null, index: true },
  entregueEm: { type: Date, default: null, index: true },
  observacoes: { type: String, trim: true, default: '' },
  importacao: { type: Schema.Types.ObjectId, ref: 'UniformeImportacao', default: null, index: true },
  arquivoOrigem: { type: String, trim: true, default: '' },
  paginaOrigem: { type: Number, min: 1, default: null },
  fornecedorNomeOrigem: { type: String, trim: true, default: '' },
  turmaOrigem: { type: String, trim: true, default: '' },
  instituicaoOrigem: { type: String, trim: true, default: '' },
  criadoPorOrigem: { type: String, trim: true, default: '' },
  divergencia: { type: divergenciaSchema, default: null },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no voucher de uniforme.');
  }
  this.codigo = String(this.codigo || '').trim().toUpperCase();
});

schema.index({ instituicao: 1, codigo: 1 }, { unique: true });
schema.index({ instituicao: 1, campanha: 1, turmaSnapshot: 1, status: 1 });
schema.index({ instituicao: 1, aluno: 1, fornecedor: 1, status: 1 });

module.exports = mongoose.models.UniformeVoucher || mongoose.model('UniformeVoucher', schema);
