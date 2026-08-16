'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const windowSchema = new Schema({
  ativo: { type: Boolean, default: true },
  inicio: { type: String, required: true, trim: true },
  fim: { type: String, required: true, trim: true },
}, { _id: false });

const classShiftSchema = new Schema({
  turma: { type: String, required: true, trim: true },
  turno: {
    type: String,
    enum: ['matutino', 'vespertino', 'noturno'],
    required: true,
  },
}, { _id: false });

const accessPolicySchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, unique: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  janelas: {
    matutino: { type: windowSchema, default: () => ({ ativo: true, inicio: '06:00', fim: '11:30' }) },
    vespertino: { type: windowSchema, default: () => ({ ativo: true, inicio: '12:00', fim: '17:30' }) },
    noturno: { type: windowSchema, default: () => ({ ativo: false, inicio: '18:00', fim: '22:30' }) },
  },

  turmas: { type: [classShiftSchema], default: [] },

  notificacoes: {
    notificarTurnoRegular: { type: Boolean, default: true },
    notificarContraturno: { type: Boolean, default: true },
    notificarForaTurno: { type: Boolean, default: true },
  },

  chamada: {
    somenteTurnoRegular: { type: Boolean, default: true },
  },
}, { timestamps: true });

accessPolicySchema.index({ tenantId: 1 });
attachTenantHooks(accessPolicySchema, 'AccessPolicy');

module.exports = mongoose.models.AccessPolicy || mongoose.model('AccessPolicy', accessPolicySchema);
