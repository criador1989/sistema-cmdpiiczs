'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const accessIdentitySchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

  provider: {
    type: String,
    enum: ['controlid', 'simulador', 'outro'],
    default: 'controlid',
    index: true,
  },

  device: { type: Schema.Types.ObjectId, ref: 'AccessDevice', default: null, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },

  externalUserId: { type: String, required: true, trim: true, index: true },
  registration: { type: String, trim: true, default: null, index: true },
  mappingKey: { type: String, required: true, trim: true },

  ativo: { type: Boolean, default: true, index: true },
  sincronizadoEm: { type: Date, default: null },
}, { timestamps: true });

accessIdentitySchema.index({ instituicao: 1, mappingKey: 1 }, { unique: true });
accessIdentitySchema.index({ tenantId: 1, mappingKey: 1 });
accessIdentitySchema.index({ instituicao: 1, aluno: 1, provider: 1 });
accessIdentitySchema.index({ instituicao: 1, device: 1, externalUserId: 1 });

attachTenantHooks(accessIdentitySchema, 'AccessIdentity');

module.exports = mongoose.models.AccessIdentity || mongoose.model('AccessIdentity', accessIdentitySchema);
