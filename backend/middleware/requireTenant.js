'use strict';

function requireTenant(req, res, next) {
  if (!req.tenant || !req.tenantId) {
    return res.status(400).json({
      ok: false,
      erro: 'Instituição não identificada. Informe o tenant por subdomínio, query ?t=slug ou cookie.'
    });
  }

  return next();
}

module.exports = requireTenant;