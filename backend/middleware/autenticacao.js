const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  }

  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = verificado;
    next();
  } catch (err) {
    return res.status(401).json({ mensagem: 'Token inválido.' });
  }
}

// ✅ Apenas usuários com tipo "professor"
function apenasProfessor(req, res, next) {
  if (req.usuario?.tipo === 'professor') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a professores.' });
}

// ✅ Apenas "monitor" ou "admin"
function apenasMonitorOuAdmin(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'monitor' || tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a monitores ou administradores.' });
}

module.exports = {
  autenticar,
  apenasProfessor,
  apenasMonitorOuAdmin
};
