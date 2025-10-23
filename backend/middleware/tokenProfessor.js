// backend/middleware/tokenProfessor.js
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const SECRET = process.env.JWT_SECRET || 'segredo_padrao';

function extrairToken(req) {
  // Prioridade: query ?token= | Authorization: Bearer | x-access-token | cookie (opcional)
  const q = req.query?.token;
  const auth = req.headers?.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const header = req.headers['x-access-token'];
  const cookie = req.cookies?.tokenProfessor || req.cookies?.token; // fallback se você usar cookie único
  return q || bearer || header || cookie || null;
}

async function autenticarTokenProfessor(req, res, next) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ mensagem: 'Acesso negado: token ausente.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // Normaliza ID
    const id = decoded.id || decoded._id || decoded.sub || decoded.userId;
    if (!id) {
      return res.status(401).json({ mensagem: 'Sessão inválida: id ausente no token.' });
    }

    // Busca apenas os campos necessários
    const usuario = await Usuario.findById(id)
      .select('_id nome tipo instituicao ativo')
      .lean();

    if (!usuario) {
      return res.status(401).json({ mensagem: 'Sessão inválida: usuário não encontrado.' });
    }

    if (usuario.tipo !== 'professor') {
      return res.status(403).json({ mensagem: 'Acesso negado: usuário não é professor.' });
    }

    if (!usuario.instituicao) {
      return res.status(401).json({ mensagem: 'Sessão inválida: instituição ausente.' });
    }

    // Opcional: se houver campo "ativo" no usuário
    if (typeof usuario.ativo !== 'undefined' && !usuario.ativo) {
      return res.status(403).json({ mensagem: 'Acesso negado: usuário inativo.' });
    }

    // Prepara objeto padrão esperado pelas rotas
    req.professor = {
      id: String(usuario._id),
      _id: String(usuario._id),
      nome: usuario.nome,
      tipo: usuario.tipo,
      instituicao: String(usuario.instituicao),
    };
    res.locals.professor = req.professor;

    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ mensagem: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ mensagem: 'Token inválido.' });
  }
}

module.exports = autenticarTokenProfessor;
