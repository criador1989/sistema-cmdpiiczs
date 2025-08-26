const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  // 1) Leia do cookie 'token' e também aceite Authorization: Bearer (útil p/ testes)
  const cookieToken = req.cookies?.token;
  const hdr = req.headers?.authorization || '';
  const bearerToken = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  const token = cookieToken || bearerToken;
  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Garanta o shape usado no backend todo
    // recomendação: payload contém { sub, tipo, instituicao }
    req.usuario = {
      _id: payload.sub || payload._id || payload.id,
      tipo: payload.tipo,
      instituicao: payload.instituicao
    };

    if (!req.usuario.instituicao) {
      // evita 500 lá na frente
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente.' });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ mensagem: 'Token inválido.' });
  }
}

// Apenas professor
function apenasProfessor(req, res, next) {
  if (req.usuario?.tipo === 'professor') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a professores.' });
}

// Monitor ou admin
function apenasMonitorOuAdmin(req, res, next) {
  const tipo = req.usuario?.tipo;
  if (tipo === 'monitor' || tipo === 'admin') return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a monitores ou administradores.' });
}

module.exports = { autenticar, apenasProfessor, apenasMonitorOuAdmin };
