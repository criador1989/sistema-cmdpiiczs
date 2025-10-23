// middleware/autenticacao.js
const jwt = require('jsonwebtoken');

function extrairToken(req) {
  // 1) Cookie "token"
  const cookieToken = req.cookies?.token;

  // 2) Header Authorization: Bearer <token>
  const auth = req.headers?.authorization || '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  // 3) Header x-access-token (fallback comum)
  const headerToken = req.headers['x-access-token'];

  return cookieToken || bearerToken || headerToken || null;
}

function autenticar(req, res, next) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  }

  try {
    // Verifica expiração e assinatura (não ignoramos expiração)
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Normaliza o ID para sempre existir em .id e ._id
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
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente no token.' });
    }

    // Validação leve do formato de ObjectId (24 chars hex). Não convertemos aqui.
    const isProvavelObjectId = typeof instituicao === 'string' && /^[a-fA-F0-9]{24}$/.test(instituicao);
    if (!isProvavelObjectId) {
      // Não bloqueamos forçosamente, mas avisamos claramente para facilitar debug.
      // Se a sua base armazena instituicao como ObjectId, garanta que o token contenha o _id (24 hex).
      // Se preferir bloquear, troque por "return res.status(401)..."
      // console.warn('[auth] Formato de instituicao no token não parece um ObjectId:', instituicao);
    }

    // Disponibiliza para rotas/controladores e views
    req.usuario = {
      id,          // usado por várias rotas
      _id: id,     // compatibilidade com código que espera _id
      nome,
      tipo,
      instituicao, // string (Mongoose fará cast para ObjectId ao consultar campos do schema)
    };
    res.locals.usuario = req.usuario;

    return next();
  } catch (err) {
    // Diferencia mensagens comuns de JWT
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
    }
    if (err?.name === 'JsonWebTokenError') {
      return res.status(401).json({ mensagem: 'Token inválido.' });
    }
    return res.status(401).json({ mensagem: 'Falha na autenticação.' });
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
