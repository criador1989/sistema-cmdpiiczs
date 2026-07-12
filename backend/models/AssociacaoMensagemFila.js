'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  campanha: { type: Schema.Types.ObjectId, ref: 'AssociacaoCampanha', required: true, index: true },
  pessoa: { type: Schema.Types.ObjectId, ref: 'AssociacaoPessoa', default: null, index: true },
  destinatarioNome: { type: String, trim: true, default: null },
  destino: { type: String, required: true, trim: true },
  canal: { type: String, enum: ['E-mail', 'WhatsApp', 'SMS'], required: true, index: true },
  assunto: { type: String, trim: true, default: null },
  conteudo: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Pendente', 'Processando', 'Enviada', 'Erro', 'Cancelada'], default: 'Pendente', index: true },
  provedor: { type: String, trim: true, default: null },
  provedorMensagemId: { type: String, trim: true, default: null },
  erro: { type: String, trim: true, default: null },
  tentativas: { type: Number, default: 0, min: 0 },
  agendadaPara: { type: Date, default: null, index: true },
  enviadaEm: { type: Date, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, status: 1, agendadaPara: 1 });
schema.index({ tenantId: 1, campanha: 1, pessoa: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.AssociacaoMensagemFila || mongoose.model('AssociacaoMensagemFila', schema);
