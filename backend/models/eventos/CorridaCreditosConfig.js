'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditoriaSchema = new Schema({
  acao: { type: String, required: true, trim: true },
  em: { type: Date, default: Date.now },
  usuarioId: { type: Schema.Types.ObjectId, default: null },
  usuarioNome: { type: String, trim: true, default: '' },
  usuarioTipo: { type: String, trim: true, default: '' },
  anterior: { type: Schema.Types.Mixed, default: null },
  novo: { type: Schema.Types.Mixed, default: null },
}, { _id: false });

const schema = new Schema({
  eventSlug: { type: String, required: true, index: true },
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  ativo: { type: Boolean, default: false },
  prazoDestinacao: { type: Date, default: null },
  prazoProcessamento: { type: Date, default: null },
  alteradoEm: { type: Date, default: null },
  alteradoPorId: { type: Schema.Types.ObjectId, default: null },
  alteradoPorNome: { type: String, trim: true, default: '' },
  alteradoPorTipo: { type: String, trim: true, default: '' },
  auditoria: { type: [auditoriaSchema], default: [] },
}, {
  timestamps: true,
  collection: 'corrida_creditos_config',
});

schema.index({ eventSlug: 1, instituicao: 1 }, { unique: true });

module.exports = mongoose.models.CorridaCreditosConfig || mongoose.model('CorridaCreditosConfig', schema);
