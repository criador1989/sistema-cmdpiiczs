// backend/middleware/tenant.js
function tenantResolver(req, res, next) {
  // prioridade: querystring ?t=slug
  const q = (req.query?.t || req.query?.tenant || '').toString().trim();

  // headers (útil p/ mobile)
  const h = (req.headers['x-tenant'] || req.headers['x-tenant-slug'] || '').toString().trim();

  // cookie (se quiser persistir via backend)
  const c = (req.cookies?.tenant || '').toString().trim();

  const slug = (q || h || c || '').toLowerCase();

  if (slug) {
    req.tenantSlug = slug;
    res.locals.tenantSlug = slug;
  }

  return next();
}

module.exports = { tenantResolver };
