'use strict';

const mongoose = require('mongoose');

function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function asString(value) {
  if (!value) return '';
  try { return String(value); } catch { return ''; }
}

function syncTenantPair(doc, label = 'documento') {
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (instituicao && tenantId && asString(instituicao) !== asString(tenantId)) {
    throw new Error(`Inconsistência entre instituicao e tenantId em ${label}.`);
  }

  if (instituicao && !tenantId) doc.tenantId = instituicao;
  if (!instituicao && tenantId) doc.instituicao = tenantId;
}

function syncTenantPairUpdate(update, label = 'documento') {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};
  const instituicaoRaw = $set.instituicao ?? $setOnInsert.instituicao ?? update.instituicao;
  const tenantRaw = $set.tenantId ?? $setOnInsert.tenantId ?? update.tenantId;

  const instituicao = toObjectIdOrNull(instituicaoRaw);
  const tenantId = toObjectIdOrNull(tenantRaw);

  if (instituicao && tenantId && asString(instituicao) !== asString(tenantId)) {
    throw new Error(`Inconsistência entre instituicao e tenantId no update de ${label}.`);
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

function attachTenantHooks(schema, label) {
  schema.pre('validate', function (next) {
    try {
      syncTenantPair(this, label);
      next();
    } catch (err) {
      next(err);
    }
  });

  schema.pre('findOneAndUpdate', function (next) {
    try {
      const update = this.getUpdate() || {};
      syncTenantPairUpdate(update, label);
      this.setUpdate(update);
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  toObjectIdOrNull,
  syncTenantPair,
  syncTenantPairUpdate,
  attachTenantHooks,
};
