// backend/middleware/tokenProfessor.js
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const SECRET = process.env.JWT_SECRET || 'segredo_padrao';

async function autenticarTokenProfessor(req, res, next) {
  const token = req.query.token || req.headers['x-access-token'];

  if (!token) {
    return res.status(401).send('Acesso negado: token ausente.');
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    const usuario = await Usuario.findById(decoded.id);

    if (!usuario || usuario.tipo !== 'professor') {
      return res.status(403).send('Acesso negado: usuário inválido ou não é professor.');
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('Erro na autenticação do token do professor:', err);
    return res.status(403).send('Token inválido ou expirado.');
  }
}

module.exports = autenticarTokenProfessor;
