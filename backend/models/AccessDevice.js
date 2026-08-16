'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const accessDeviceSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  nome: { type: String, required: true, trim: true },
  codigo: { type: String, required: true, trim: true, uppercase: true },

  provider: {
    type: String,
    enum: ['controlid_idface_max', 'simulador', 'outro'],
    default: 'controlid_idface_max',
    index: true,
  },

  tipoUso: {
    type: String,
    enum: ['entrada', 'saida', 'misto'],
    default: 'entrada',
    index: true,
  },

  local: { type: String, trim: true, default: 'Portão principal' },
  externalDeviceId: { type: String, trim: true, default: null, index: true },
  serial: { type: String, trim: true, default: null },
  firmware: { type: String, trim: true, default: null },

  redeLocal: {
    ip: { type: String, trim: true, default: null, index: true },
    portaWeb: { type: Number, default: 80, min: 1, max: 65535 },
    protocolo: { type: String, enum: ['http', 'https'], default: 'http' },
  },

  controlId: {
    familiaFirmware: { type: String, enum: ['V7', 'V8', 'desconhecida'], default: 'desconhecida' },
    templateFacialSuportado: { type: Boolean, default: false },
    monitorConfigurado: { type: Boolean, default: false },
    monitorVerificadoEm: { type: Date, default: null },
  },

  ativo: { type: Boolean, default: true, index: true },

  notificarResponsavel: { type: Boolean, default: true },
  canaisNotificacao: {
    type: [String],
    enum: ['email', 'whatsapp', 'telegram'],
    default: ['email', 'whatsapp'],
  },

  bridgeKeyHash: { type: String, trim: true, default: null, unique: true, sparse: true, select: false },
  bridgeKeyPrefix: { type: String, trim: true, default: null },
  bridgeKeyRotacionadaEm: { type: Date, default: null },
  bridgeUltimoUsoEm: { type: Date, default: null },

  lastSeenAt: { type: Date, default: null, index: true },
  lastEventAt: { type: Date, default: null, index: true },

  configuracao: {
    timezone: { type: String, trim: true, default: null },
    observacoes: { type: String, trim: true, default: null },
  },
}, { timestamps: true });

accessDeviceSchema.index({ instituicao: 1, codigo: 1 }, { unique: true });
accessDeviceSchema.index({ tenantId: 1, codigo: 1 });
accessDeviceSchema.index({ instituicao: 1, provider: 1, ativo: 1 });
accessDeviceSchema.index({ instituicao: 1, externalDeviceId: 1 }, { sparse: true });

attachTenantHooks(accessDeviceSchema, 'AccessDevice');

module.exports = mongoose.models.AccessDevice || mongoose.model('AccessDevice', accessDeviceSchema);
