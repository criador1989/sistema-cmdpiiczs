// backend/middleware/exigirSuperAdmin.js
'use strict';

function parseSuperAdmins() {
  const raw = String(process.env.SUPERADMINS || '').trim();
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = function exigirSuperAdmin(req, res, next) {
  const u = req.usuario || {};
  const email = String(u.email || '').trim().toLowerCase();

  const list = parseSuperAdmins();
  if (!list.length) {
    return res.status(500).json({ mensagem: 'SUPERADMINS não configurado no servidor.' });
  }

  if (!email || !list.includes(email)) {
    return res.status(403).json({ mensagem: 'Acesso restrito ao SuperAdmin.' });
  }

  return next();
};
