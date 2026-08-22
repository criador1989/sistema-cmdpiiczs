'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const voucherSnapshotSchema = new Schema({
  voucher: { type: Schema.Types.ObjectId, ref: 'UniformeVoucher', required: true },
  codigo: { type: String, trim: true, required: true },
  item: { type: Schema.Types.ObjectId, ref: 'UniformeItem', required: true },
  itemNome: { type: String, trim: true, required: true },
  quantidade: { type: Number, min: 1, default: 1 },
}, { _id: false });

const responsavelSchema = new Schema({
  nome: { type: String, trim: true, required: true },
  tipoDocumento: { type: String, trim: true, default: 'RG/CPF' },
  documento: { type: String, trim: true, required: true },
  parentesco: { type: String, trim: true, default: '' },
  telefone: { type: String, trim: true, default: '' },
}, { _id: false });

const checklistSchema = new Schema({
  documentoConferido: { type: Boolean, default: false },
  vouchersConferidos: { type: Boolean, default: false },
  itensConferidos: { type: Boolean, default: false },
  assinaturaColetada: { type: Boolean, default: false },
}, { _id: false });

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoNomeSnapshot: { type: String, trim: true, required: true },
  turmaSnapshot: { type: String, trim: true, required: true, index: true },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', required: true, index: true },
  vouchers: { type: [voucherSnapshotSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
  responsavel: { type: responsavelSchema, required: true },
  checklist: { type: checklistSchema, required: true },
  status: { type: String, enum: ['concluida', 'parcial', 'divergencia', 'cancelada'], default: 'concluida', index: true },
  observacoes: { type: String, trim: true, default: '' },
  protocolo: { type: String, trim: true, required: true, index: true },
  entregueEm: { type: Date, default: Date.now, index: true },
  atendente: {
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nome: { type: String, trim: true, default: '' },
    tipo: { type: String, trim: true, default: '' },
  },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na entrega de uniformes.');
  }
});

schema.index({ instituicao: 1, entregueEm: -1 });
schema.index({ instituicao: 1, aluno: 1, fornecedor: 1, entregueEm: -1 });

module.exports = mongoose.models.UniformeEntrega || mongoose.model('UniformeEntrega', schema);
