'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  nome: { type: String, required: true, trim: true, index: true },
  tipo: { type: String, enum: ['Projeto', 'Campanha', 'Evento', 'Rifa', 'Reforma', 'Aquisição', 'Outro'], default: 'Projeto', index: true },
  descricao: { type: String, trim: true, default: null },
  dataInicio: { type: Date, default: null },
  dataFim: { type: Date, default: null },
  metaArrecadacao: { type: Number, default: 0, min: 0 },
  orcamentoPrevisto: { type: Number, default: 0, min: 0 },
  responsavelNome: { type: String, trim: true, default: null },
  status: { type: String, enum: ['Planejamento', 'Ativo', 'Concluído', 'Suspenso', 'Cancelado'], default: 'Planejamento', index: true },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, status: 1, dataInicio: -1 });

module.exports = mongoose.models.AssociacaoProjeto || mongoose.model('AssociacaoProjeto', schema);
