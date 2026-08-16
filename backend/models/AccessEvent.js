'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const notificationChannelSchema = new Schema({
  canal: { type: String, trim: true },
  ok: { type: Boolean, default: false },
  provider: { type: String, trim: true, default: null },
  messageId: { type: String, trim: true, default: null },
  erro: { type: String, trim: true, default: null },
}, { _id: false });

const accessEventSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  device: { type: Schema.Types.ObjectId, ref: 'AccessDevice', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null, index: true },

  eventKey: { type: String, required: true, trim: true },
  externalEventId: { type: String, trim: true, default: null, index: true },
  externalUserId: { type: String, trim: true, default: null, index: true },
  externalDeviceId: { type: String, trim: true, default: null },

  occurredAt: { type: Date, required: true, index: true },
  eventCode: { type: Number, required: true, index: true },
  identifierId: { type: String, trim: true, default: null },
  portalId: { type: String, trim: true, default: null },
  confidence: { type: Number, default: null },

  direction: {
    type: String,
    enum: ['entrada', 'saida'],
    default: 'entrada',
    index: true,
  },

  source: {
    type: String,
    enum: ['controlid_monitor', 'bridge', 'simulador'],
    default: 'bridge',
    index: true,
  },

  status: {
    type: String,
    enum: ['reconhecido', 'nao_vinculado', 'ignorado'],
    default: 'reconhecido',
    index: true,
  },

  alunoSnapshot: {
    nome: { type: String, trim: true, default: null },
    turma: { type: String, trim: true, default: null },
  },

  notificacao: {
    tentada: { type: Boolean, default: false },
    ok: { type: Boolean, default: false },
    tentadaEm: { type: Date, default: null },
    canais: { type: [notificationChannelSchema], default: [] },
  },

  // Deliberadamente não existe campo de foto, template facial ou payload bruto.
  // O Axoriin registra somente metadados necessários ao evento de acesso.
}, { timestamps: true });

accessEventSchema.index({ instituicao: 1, eventKey: 1 }, { unique: true });
accessEventSchema.index({ tenantId: 1, eventKey: 1 });
accessEventSchema.index({ instituicao: 1, occurredAt: -1 });
accessEventSchema.index({ instituicao: 1, aluno: 1, occurredAt: -1 });
accessEventSchema.index({ instituicao: 1, status: 1, occurredAt: -1 });

attachTenantHooks(accessEventSchema, 'AccessEvent');

module.exports = mongoose.models.AccessEvent || mongoose.model('AccessEvent', accessEventSchema);
