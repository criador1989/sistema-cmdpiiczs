'use strict';

const Instituicao = require('../models/Instituicao');

const TENANT_COOKIE_NAME = process.env.TENANT_COOKIE_NAME || 'tenant';

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getHostWithoutPort(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

function extractSubdomain(host) {
  const cleanHost = getHostWithoutPort(host);

  if (!cleanHost || isLocalHost(cleanHost)) return null;

  const parts = cleanHost.split('.').filter(Boolean);
  if (parts.length < 3) return null;

  // exemplo: tenant.seudominio.com => pega tenant
  return normalizeSlug(parts[0]);
}

async function resolveTenant(req, res, next) {
  try {
    req.tenant = null;
    req.tenantId = null;
    req.tenantSlug = null;

    const host = getHostWithoutPort(req.hostname || req.headers.host || '');
    const fromSubdomain = extractSubdomain(host);
    const fromQuery = normalizeSlug(req.query?.t);
    const fromCookie = normalizeSlug(req.cookies?.[TENANT_COOKIE_NAME]);

    const slugCandidate = fromSubdomain || fromQuery || fromCookie;

    if (!slugCandidate) {
      return next();
    }

    const instituicao = await Instituicao.findOne({
      slug: slugCandidate,
      ativa: { $ne: false }
    }).lean();

    if (!instituicao) {
      return next();
    }

    req.tenant = instituicao;
    req.tenantId = String(instituicao._id);
    req.tenantSlug = instituicao.slug;

    const isProd = process.env.NODE_ENV === 'production';

    const currentCookie = normalizeSlug(req.cookies?.[TENANT_COOKIE_NAME]);
    if (currentCookie !== instituicao.slug) {
      res.cookie(TENANT_COOKIE_NAME, instituicao.slug, {
        httpOnly: false,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24 * 60
      });
    }

    return next();
  } catch (err) {
    console.error('[resolveTenant] erro:', err);
    return next();
  }
}

module.exports = resolveTenant;