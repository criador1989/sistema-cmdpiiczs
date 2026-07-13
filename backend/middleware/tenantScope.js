'use strict';

const mongoose = require('mongoose');

function getUserInstitutionId(req) {
  return String(req.usuario?.instituicao || '').trim();
}

function getUserType(req) {
  return String(req.usuario?.tipo || '').trim().toLowerCase();
}

function isMasterLike(req) {
  return ['master', 'superadmin'].includes(getUserType(req));
}

function normalizeInstitutionId(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? v : null;
}

function resolveInstitutionId(req, explicitInstitutionId = null) {
  const userInstitutionId = getUserInstitutionId(req);

  if (isMasterLike(req)) {
    const explicit = normalizeInstitutionId(explicitInstitutionId);
    return explicit || userInstitutionId || null;
  }

  return userInstitutionId || null;
}

function requireTenant(req, res, next) {
  const instituicao = getUserInstitutionId(req);

  if (!instituicao) {
    return res.status(401).json({
      mensagem: 'Instituição do usuário não encontrada na sessão.'
    });
  }

  req.instituicaoId = instituicao;
  return next();
}

function tenantFilter(req, extra = {}, explicitInstitutionId = null) {
  const instituicao = resolveInstitutionId(req, explicitInstitutionId);

  if (!instituicao) return { ...extra };

  return {
    ...extra,
    instituicao
  };
}

function assertSameInstitution(req, resourceInstitutionId) {
  const current = getUserInstitutionId(req);
  const target = String(resourceInstitutionId || '').trim();

  if (!current || !target) return false;
  if (isMasterLike(req)) return true;

  return current === target;
}

// 🔒 Middleware forte para garantir isolamento total
function enforceSameInstitution(req, res, next) {
  const current = getUserInstitutionId(req);

  if (!current) {
    return res.status(401).json({ mensagem: 'Instituição não definida na sessão.' });
  }

  // tenta pegar instituição do resource carregado previamente
  const resourceInstitution = req.resource?.instituicao;

  if (resourceInstitution && !assertSameInstitution(req, resourceInstitution)) {
    return res.status(403).json({ mensagem: 'Acesso negado para outra instituição.' });
  }

  return next();
}

module.exports = {
  getUserInstitutionId,
  getUserType,
  isMasterLike,
  normalizeInstitutionId,
  resolveInstitutionId,
  requireTenant,
  tenantFilter,
  assertSameInstitution,
  enforceSameInstitution
};
