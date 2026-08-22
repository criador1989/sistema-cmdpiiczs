'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoNomeSnapshot: { type: String, trim: true, required: true },
  turmaSnapshot: { type: String, trim: true, required: true, index: true },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', required: true, index: true },
  voucher: { type: Schema.Types.ObjectId, ref: 'UniformeVoucher', default: null, index: true },
  tipo: {
    type: String,
    enum: ['item_nao_veio', 'tamanho_incorreto', 'modelo_incorreto', 'quantidade_divergente', 'voucher_nao_localizado', 'aluno_nao_localizado', 'fornecedor_incorreto', 'sem_documento', 'recusa', 'defeito', 'outro'],
    default: 'outro',
    index: true,
  },
  descricao: { type: String, trim: true, required: true },
  status: { type: String, enum: ['aberta', 'em_tratamento', 'resolvida', 'cancelada'], default: 'aberta', index: true },
  resolucao: { type: String, trim: true, default: '' },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  resolvidoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  resolvidoEm: { type: Date, default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na divergência de uniformes.');
  }
});

schema.index({ instituicao: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.UniformeDivergencia || mongoose.model('UniformeDivergencia', schema);
