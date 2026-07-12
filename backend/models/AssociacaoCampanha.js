'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  titulo: { type: String, required: true, trim: true, index: true },
  evento: { type: String, trim: true, default: 'Comunicado' },
  canal: { type: String, enum: ['E-mail', 'WhatsApp', 'SMS'], default: 'E-mail', index: true },
  assunto: { type: String, trim: true, default: null },
  conteudo: { type: String, required: true, trim: true },
  agendadaPara: { type: Date, default: null, index: true },
  publico: {
    tipos: [{ type: String, trim: true }],
    turmas: [{ type: String, trim: true }],
    apenasAutorizados: { type: Boolean, default: true },
    apenasAniversariantes: { type: Boolean, default: false },
  },
  status: { type: String, enum: ['Rascunho', 'Preparada', 'Programada', 'Em processamento', 'Concluída', 'Cancelada'], default: 'Rascunho', index: true },
  totalDestinatarios: { type: Number, default: 0, min: 0 },
  totalEnviadas: { type: Number, default: 0, min: 0 },
  totalErros: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, status: 1, agendadaPara: 1 });

module.exports = mongoose.models.AssociacaoCampanha || mongoose.model('AssociacaoCampanha', schema);
