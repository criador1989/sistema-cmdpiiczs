'use strict';
const mongoose = require('mongoose');

const EventoContaSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  cpf: { type: String, default: undefined },
  telefone: { type: String, default: '' },
  senhaHash: { type: String, required: true, select: false },
  ativo: { type: Boolean, default: true },

  // Confirmação de e-mail do portal de eventos. Contas criadas antes da v1.0.1
  // continuam válidas porque o login só bloqueia quando emailConfirmado === false.
  emailConfirmado: { type: Boolean, default: true },
  emailConfirmadoEm: { type: Date, default: null },
  emailConfirmTokenHash: { type: String, default: '', select: false },
  emailConfirmExpiraEm: { type: Date, default: null },
  emailConfirmEnviadoEm: { type: Date, default: null },

  ultimoLoginEm: { type: Date, default: null },
}, { timestamps: true, collection: 'evento_contas' });

EventoContaSchema.index({ eventSlug: 1, email: 1 }, { unique: true });
EventoContaSchema.index({ eventSlug: 1, cpf: 1 }, { unique: true, sparse: true });
EventoContaSchema.index({ eventSlug: 1, emailConfirmTokenHash: 1 }, { sparse: true });

module.exports = mongoose.models.EventoConta || mongoose.model('EventoConta', EventoContaSchema);
