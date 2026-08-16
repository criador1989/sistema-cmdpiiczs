'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const attendanceRecordSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  session: { type: Schema.Types.ObjectId, ref: 'AttendanceSession', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },

  alunoNome: { type: String, required: true, trim: true },
  turma: { type: String, required: true, trim: true, index: true },

  gateDetected: { type: Boolean, default: false, index: true },
  gateFirstEntryAt: { type: Date, default: null },
  gateLastSeenAt: { type: Date, default: null },
  gateDetectionCount: { type: Number, default: 0 },

  statusProfessor: {
    type: String,
    enum: [
      'pendente',
      'presente',
      'ausente',
      'atrasado',
      'falta_justificada',
      'entrou_colegio_fora_sala',
    ],
    default: 'pendente',
    index: true,
  },

  confirmadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  confirmadoEm: { type: Date, default: null },

  observacao: { type: String, trim: true, default: '' },

  simaed: {
    statusMapeado: { type: String, trim: true, default: null },
    sincronizado: { type: Boolean, default: false },
    sincronizadoEm: { type: Date, default: null },
    erro: { type: String, trim: true, default: null },
  },
}, { timestamps: true });

attendanceRecordSchema.index({ session: 1, aluno: 1 }, { unique: true });
attendanceRecordSchema.index({ instituicao: 1, session: 1, alunoNome: 1 });
attendanceRecordSchema.index({ tenantId: 1, session: 1, statusProfessor: 1 });

attachTenantHooks(attendanceRecordSchema, 'AttendanceRecord');

module.exports = mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceRecordSchema);
