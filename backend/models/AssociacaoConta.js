'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  nome: { type: String, required: true, trim: true },
  tipo: { type: String, enum: ['Caixa', 'Banco', 'PIX', 'Poupança', 'Fundo', 'Outro'], default: 'Caixa' },
  saldoInicial: { type: Number, default: 0 },
  dataSaldoInicial: { type: Date, default: null },
  status: { type: String, enum: ['Ativo', 'Inativo'], default: 'Ativo', index: true },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, nome: 1 }, { unique: true });

module.exports = mongoose.models.AssociacaoConta || mongoose.model('AssociacaoConta', schema);
