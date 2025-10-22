// middleware/autenticacao.js
const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  // 1) Token via cookie ou header Authorization: Bearer
  const cookieToken = req.cookies?.token;
  const auth = req.headers?.authorization || '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Normaliza o ID para sempre existir em .id e ._id
    // Aceita qualquer uma destas chaves que você possa ter usado ao assinar o token
    const id =
      payload.id ||
      payload._id ||
      payload.sub ||
      payload.userId;

    if (!id) {
      return res.status(401).json({ mensagem: 'Sessão inválida: id ausente no token.' });
    }

    const tipo = payload.tipo;
    const instituicao = payload.instituicao;
    const nome = payload.nome;

    if (!instituicao) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente.' });
    }

    // IMPORTANTE: disponibiliza ambas as propriedades para compatibilidade
    req.usuario = {
      id,             // <— usado por várias rotas (ex.: mensagens)
      _id: id,        // <— compatibilidade com código que espera _id
      nome,
      tipo,
      instituicao
    };

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
