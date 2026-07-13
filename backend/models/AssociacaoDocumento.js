'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  titulo: { type: String, required: true, trim: true, index: true },
  tipo: { type: String, enum: ['Estatuto', 'Ata', 'Certidão', 'Contrato', 'Prestação de contas', 'Nota fiscal', 'Comprovante', 'Outro'], default: 'Outro', index: true },
  numeroReferencia: { type: String, trim: true, default: null },
  dataEmissao: { type: Date, default: null },
  dataValidade: { type: Date, default: null, index: true },
  responsavelNome: { type: String, trim: true, default: null },
  status: { type: String, enum: ['Vigente', 'Vencido', 'Arquivado', 'Cancelado'], default: 'Vigente', index: true },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, tipo: 1, dataValidade: 1 });

module.exports = mongoose.models.AssociacaoDocumento || mongoose.model('AssociacaoDocumento', schema);
