'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const attendanceSessionSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  sessionKey: { type: String, required: true, trim: true },
  dateKey: { type: String, required: true, trim: true, index: true },
  turno: {
    type: String,
    enum: ['matutino', 'vespertino', 'noturno'],
    required: true,
    index: true,
  },
  turma: { type: String, required: true, trim: true, index: true },

  componenteCurricular: { type: String, trim: true, default: '' },
  aulaNumero: { type: Number, default: 0, min: 0, max: 20 },

  professor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  professorNome: { type: String, trim: true, default: null },

  status: {
    type: String,
    enum: ['aberta', 'finalizada', 'reaberta'],
    default: 'aberta',
    index: true,
  },

  finalizadaEm: { type: Date, default: null },
  finalizadaPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },

  integracaoSimaed: {
    status: {
      type: String,
      enum: ['nao_configurado', 'pendente', 'enviado', 'erro'],
      default: 'nao_configurado',
      index: true,
    },
    tentativaEm: { type: Date, default: null },
    enviadoEm: { type: Date, default: null },
    externalId: { type: String, trim: true, default: null },
    erro: { type: String, trim: true, default: null },
  },
}, { timestamps: true });

attendanceSessionSchema.index({ instituicao: 1, sessionKey: 1 }, { unique: true });
attendanceSessionSchema.index({ tenantId: 1, dateKey: 1, turma: 1, turno: 1 });
attendanceSessionSchema.index({ instituicao: 1, professor: 1, dateKey: -1 });

attachTenantHooks(attendanceSessionSchema, 'AttendanceSession');

module.exports = mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', attendanceSessionSchema);
