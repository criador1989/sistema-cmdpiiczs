'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const dailyNotificationChannelSchema = new Schema({
  canal: { type: String, trim: true },
  ok: { type: Boolean, default: false },
  provider: { type: String, trim: true, default: null },
  messageId: { type: String, trim: true, default: null },
  erro: { type: String, trim: true, default: null },
}, { _id: false });

const dailyStudentAccessSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  dateKey: { type: String, required: true, trim: true, index: true },
  turno: {
    type: String,
    enum: ['matutino', 'vespertino', 'noturno', 'fora_turno'],
    required: true,
    index: true,
  },

  turnoRegularAluno: {
    type: String,
    enum: ['matutino', 'vespertino', 'noturno', null],
    default: null,
    index: true,
  },

  classificacao: {
    type: String,
    enum: ['turno_regular', 'contraturno', 'fora_turno', 'sem_turno_definido'],
    default: 'sem_turno_definido',
    index: true,
  },

  attendanceEligible: { type: Boolean, default: false, index: true },

  firstEntryAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  detectionCount: { type: Number, default: 1, min: 1 },

  firstDevice: { type: Schema.Types.ObjectId, ref: 'AccessDevice', default: null },
  lastDevice: { type: Schema.Types.ObjectId, ref: 'AccessDevice', default: null },

  notificacao: {
    tentada: { type: Boolean, default: false, index: true },
    tentativas: { type: Number, default: 0 },
    ok: { type: Boolean, default: false },
    tentadaEm: { type: Date, default: null },
    enviadaEm: { type: Date, default: null },
    canais: { type: [dailyNotificationChannelSchema], default: [] },
  },
}, { timestamps: true });

dailyStudentAccessSchema.index(
  { instituicao: 1, aluno: 1, dateKey: 1, turno: 1 },
  { unique: true }
);
dailyStudentAccessSchema.index({ tenantId: 1, dateKey: 1, turno: 1, aluno: 1 });
dailyStudentAccessSchema.index({ instituicao: 1, dateKey: 1, turno: 1, firstEntryAt: 1 });
dailyStudentAccessSchema.index({ instituicao: 1, dateKey: 1, classificacao: 1, attendanceEligible: 1 });

attachTenantHooks(dailyStudentAccessSchema, 'DailyStudentAccess');

module.exports = mongoose.models.DailyStudentAccess || mongoose.model('DailyStudentAccess', dailyStudentAccessSchema);
