'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const enrollmentResultSchema = new Schema({
  device: { type: Schema.Types.ObjectId, ref: 'AccessDevice', default: null },
  deviceName: { type: String, trim: true, default: null },
  externalDeviceId: { type: String, trim: true, default: null },
  role: { type: String, enum: ['origem', 'destino'], default: 'destino' },
  userId: { type: String, trim: true, default: null },
  userCreated: { type: Boolean, default: false },
  groupOk: { type: Boolean, default: false },
  biometricStatus: {
    type: String,
    enum: ['nao_iniciado', 'capturada', 'replicada', 'ja_existente', 'falhou'],
    default: 'nao_iniciado',
  },
  identityOk: { type: Boolean, default: false },
  ok: { type: Boolean, default: false },
  message: { type: String, trim: true, default: null },
}, { _id: false });

const accessEnrollmentJobSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoSnapshot: {
    nome: { type: String, trim: true, required: true },
    turma: { type: String, trim: true, default: null },
    codigoAcesso: { type: String, trim: true, required: true },
  },

  sourceDevice: { type: Schema.Types.ObjectId, ref: 'AccessDevice', required: true, index: true },
  targetDevices: [{ type: Schema.Types.ObjectId, ref: 'AccessDevice' }],
  groupId: { type: Number, default: 1 },

  status: {
    type: String,
    enum: ['aguardando_bridge', 'processando', 'concluido', 'falhou', 'cancelado'],
    default: 'aguardando_bridge',
    index: true,
  },
  etapa: {
    type: String,
    enum: [
      'fila',
      'preparando_usuarios',
      'aguardando_captura',
      'capturando',
      'replicando',
      'criando_vinculos',
      'concluido',
      'falhou',
      'cancelado',
    ],
    default: 'fila',
  },
  mensagem: { type: String, trim: true, default: 'Aguardando o Axoriin Face Bridge.' },

  resultados: { type: [enrollmentResultSchema], default: [] },

  bridge: {
    claimedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
  },

  erro: {
    code: { type: String, trim: true, default: null },
    message: { type: String, trim: true, default: null },
  },

  privacy: {
    photoPersisted: { type: Boolean, default: false, immutable: true },
    templatePersisted: { type: Boolean, default: false, immutable: true },
  },
}, { timestamps: true });

accessEnrollmentJobSchema.index({ instituicao: 1, status: 1, createdAt: 1 });
accessEnrollmentJobSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
accessEnrollmentJobSchema.index({ instituicao: 1, sourceDevice: 1, status: 1, createdAt: 1 });

attachTenantHooks(accessEnrollmentJobSchema, 'AccessEnrollmentJob');

module.exports = mongoose.models.AccessEnrollmentJob || mongoose.model('AccessEnrollmentJob', accessEnrollmentJobSchema);
