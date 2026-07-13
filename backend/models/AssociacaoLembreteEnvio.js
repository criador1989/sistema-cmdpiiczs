'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  chave: { type: String, required: true, trim: true },
  contribuicao: { type: Schema.Types.ObjectId, ref: 'AssociacaoContribuicao', required: true, index: true },
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', required: true, index: true },
  etapa: { type: String, required: true, trim: true, index: true },
  etapaNome: { type: String, trim: true, default: null },
  origem: { type: String, enum: ['Automático', 'Manual'], default: 'Automático', index: true },
  canal: { type: String, enum: ['E-mail', 'WhatsApp'], required: true, index: true },
  destinatarioNome: { type: String, required: true, trim: true },
  destino: { type: String, required: true, trim: true },
  assunto: { type: String, trim: true, default: null },
  conteudo: { type: String, required: true, trim: true },
  referencia: { type: String, required: true, trim: true },
  vencimento: { type: Date, required: true },
  vencimentoChave: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  valorPendente: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['Processando', 'Enviado', 'Erro', 'Cancelado'],
    default: 'Processando',
    index: true,
  },
  tentativas: { type: Number, default: 1, min: 0 },
  proximaTentativaEm: { type: Date, default: null, index: true },
  enviadoEm: { type: Date, default: null },
  erro: { type: String, trim: true, default: null, maxlength: 2000 },
  provedor: { type: String, trim: true, default: null },
  provedorMensagemId: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, chave: 1 }, { unique: true });
schema.index({ tenantId: 1, contribuicao: 1, createdAt: -1 });
schema.index({ tenantId: 1, status: 1, proximaTentativaEm: 1 });
schema.index({ tenantId: 1, enviadoEm: -1 });

module.exports = mongoose.models.AssociacaoLembreteEnvio || mongoose.model('AssociacaoLembreteEnvio', schema);
