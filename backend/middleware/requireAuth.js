// middlewares/requireAuth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, message: "Token ausente." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // payload esperado: { userId, role, tenantId, ... }
    req.user = payload;

    // trava consistência do tenant:
    if (req.tenantId && payload.tenantId && req.tenantId !== payload.tenantId) {
      return res.status(403).json({ ok: false, message: "Tenant inválido para este token." });
    }

    // se req.tenantId ainda não existe (ex: você não aplicou resolveTenant antes),
    // usa o tenant do token
    if (!req.tenantId) req.tenantId = payload.tenantId;

    if (!req.tenantId) {
      return res.status(400).json({ ok: false, message: "Tenant não definido." });
    }

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Token inválido." });
  }
}

module.exports = { requireAuth };
