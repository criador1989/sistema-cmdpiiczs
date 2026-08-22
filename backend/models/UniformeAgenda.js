'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', required: true, index: true },
  titulo: { type: String, trim: true, default: '' },
  inicio: { type: Date, required: true, index: true },
  fim: { type: Date, required: true, index: true },
  horarioInicio: { type: String, trim: true, default: '' },
  horarioFim: { type: String, trim: true, default: '' },
  local: { type: String, trim: true, default: 'Escola' },
  turmas: { type: [String], default: [] },
  series: { type: [String], default: [] },
  capacidade: { type: Number, min: 0, default: 0 },
  instrucoes: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['planejada', 'confirmada', 'concluida', 'cancelada'], default: 'planejada', index: true },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na agenda de uniformes.');
  }
  if (this.inicio && this.fim && new Date(this.fim) < new Date(this.inicio)) {
    throw new Error('A data final da agenda não pode ser anterior à data inicial.');
  }
});

schema.index({ instituicao: 1, campanha: 1, inicio: 1, fornecedor: 1 });

module.exports = mongoose.models.UniformeAgenda || mongoose.model('UniformeAgenda', schema);
