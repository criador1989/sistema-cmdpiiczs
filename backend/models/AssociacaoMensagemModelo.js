'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  nome: { type: String, required: true, trim: true },
  evento: { type: String, enum: ['Aniversário', 'Natal', 'Ano-Novo', 'Dia das Mães', 'Dia dos Pais', 'Boas-vindas', 'Comunicado', 'Outro'], default: 'Comunicado', index: true },
  canal: { type: String, enum: ['E-mail', 'WhatsApp', 'SMS'], default: 'E-mail' },
  assunto: { type: String, trim: true, default: null },
  conteudo: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Ativo', 'Inativo'], default: 'Ativo', index: true },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, nome: 1 }, { unique: true });

module.exports = mongoose.models.AssociacaoMensagemModelo || mongoose.model('AssociacaoMensagemModelo', schema);
