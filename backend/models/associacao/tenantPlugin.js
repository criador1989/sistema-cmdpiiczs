'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
}

function sameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function syncDocumentTenant(doc) {
  const instituicao = asObjectId(doc.instituicao);
  const tenantId = asObjectId(doc.tenantId);

  if (instituicao && tenantId && !sameId(instituicao, tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no módulo de associações.');
  }

  if (instituicao && !tenantId) doc.tenantId = instituicao;
  if (!instituicao && tenantId) doc.instituicao = tenantId;
}

function syncUpdateTenant(update) {
  if (!update || typeof update !== 'object') return;

  const set = update.$set || update;
  const onInsert = update.$setOnInsert || {};
  const instituicao = asObjectId(set.instituicao ?? onInsert.instituicao ?? update.instituicao);
  const tenantId = asObjectId(set.tenantId ?? onInsert.tenantId ?? update.tenantId);

  if (instituicao && tenantId && !sameId(instituicao, tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do módulo de associações.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  }

  if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

function associationTenantPlugin(schema) {
  schema.add({
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },
    legacyId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
      index: true,
    },
  });

  schema.pre('validate', function associationTenantValidate(next) {
    try {
      syncDocumentTenant(this);
      next();
    } catch (error) {
      next(error);
    }
  });

  schema.pre('findOneAndUpdate', function associationTenantUpdate(next) {
    try {
      const update = this.getUpdate() || {};
      syncUpdateTenant(update);
      this.setUpdate(update);
      next();
    } catch (error) {
      next(error);
    }
  });

  schema.index({ tenantId: 1, createdAt: -1 });
  schema.index({ instituicao: 1, createdAt: -1 });
  schema.index({ tenantId: 1, legacyId: 1 }, { sparse: true });
}

module.exports = {
  associationTenantPlugin,
  asObjectId,
};
