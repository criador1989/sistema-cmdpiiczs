// middlewares/resolveTenant.js
function resolveTenant(req, res, next) {
  // 1) subdomain: tenant.seudominio.com
  const host = (req.headers.host || "").split(":")[0]; // remove porta
  const parts = host.split(".");

  // ajuste conforme seu domínio real (ex: smartclass.app)
  // se for localhost, vai cair pro header
  let tenantFromSubdomain = null;
  if (parts.length >= 3 && !host.includes("localhost")) {
    tenantFromSubdomain = parts[0];
  }

  // 2) fallback por header
  const tenantFromHeader = req.headers["x-tenant"];

  const tenantId = tenantFromSubdomain || tenantFromHeader;

  if (!tenantId) {
    return res.status(400).json({ ok: false, message: "Tenant ausente." });
  }

  // Normalização simples
  req.tenantId = String(tenantId).trim().toLowerCase();

  next();
}

module.exports = { resolveTenant };
