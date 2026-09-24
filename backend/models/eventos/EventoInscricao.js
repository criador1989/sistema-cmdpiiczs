'use strict';
const mongoose = require('mongoose');

const EventoInscricaoSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventoConta', required: true, index: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventoParticipante', required: true, index: true },
  numeroPeito: { type: String, required: true },
  categoriaKey: { type: String, required: true },
  categoriaNome: { type: String, required: true },
  idadeReferencia: { type: Number, required: true },
  camisetaTamanho: { type: String, default: '' },
  loteKey: { type: String, default: '' },
  loteNome: { type: String, default: '' },
  valorCentavos: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['rascunho','aguardando_pagamento','pagamento_em_analise','pagamento_recusado','confirmada','cancelada'], default: 'aguardando_pagamento', index: true },
  deferidaEm: { type: Date, default: null },
  pagamento: {
    modo: { type: String, enum: ['manual','sicoob_api'], default: 'manual' },
    status: { type: String, enum: ['aguardando','em_analise','aprovado','recusado','dispensado'], default: 'aguardando' },
    comprovanteMediaId: { type: String, default: '' },
    comprovanteNome: { type: String, default: '' },
    comprovanteMime: { type: String, default: '' },
    comprovanteEnviadoEm: { type: Date, default: null },
    analisadoEm: { type: Date, default: null },
    analisadoPorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    analisadoPorNome: { type: String, default: '' },
    observacao: { type: String, default: '' },
    provider: { type: String, default: '' },
    txid: { type: String, default: '' },
    endToEndId: { type: String, default: '' },
    pagoEm: { type: Date, default: null },
  },
  consent: {
    termsAccepted: { type: Boolean, default: false },
    vinculoVerdadeiro: { type: Boolean, default: false },
    publicResult: { type: Boolean, default: false },
    photos: { type: Boolean, default: false },
    versaoTermo: { type: String, default: '' },
    acceptedAt: { type: Date, default: null },
    acceptedIp: { type: String, default: '' },
  },
  kit: {
    status: { type: String, enum: ['nao_disponivel','aguardando','disponivel','retirado'], default: 'aguardando' },
    retiradoEm: { type: Date, default: null },
    observacao: { type: String, default: '' },
  },
}, { timestamps: true, collection: 'evento_inscricoes' });

EventoInscricaoSchema.index({ eventSlug: 1, participantId: 1 }, { unique: true });
EventoInscricaoSchema.index({ eventSlug: 1, numeroPeito: 1 }, { unique: true });

module.exports = mongoose.models.EventoInscricao || mongoose.model('EventoInscricao', EventoInscricaoSchema);
