'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', required: true, index: true },
  responsavelNome: { type: String, required: true, trim: true },
  alunoNome: { type: String, trim: true, default: null, index: true },
  alunoTurma: { type: String, trim: true, default: null, index: true },
  referencia: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}$/, index: true },
  vencimento: { type: Date, required: true, index: true },
  valorPrevisto: { type: Number, required: true, min: 0.01 },
  valorPago: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['Pendente', 'Parcial', 'Em dia', 'Atrasado', 'Cancelado'], default: 'Pendente', index: true },
  lembretesSuspensos: { type: Boolean, default: false, index: true },
  lembretesSuspensosEm: { type: Date, default: null },
  lembretesSuspensosPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  lembretesSuspensosMotivo: { type: String, trim: true, default: null, maxlength: 500 },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, pessoa: 1, referencia: 1 }, { unique: true });
schema.index({ tenantId: 1, alunoTurma: 1, referencia: 1, status: 1 });
schema.index({ tenantId: 1, lembretesSuspensos: 1, vencimento: 1, status: 1 });

module.exports = mongoose.models.AssociacaoContribuicao || mongoose.model('AssociacaoContribuicao', schema);
