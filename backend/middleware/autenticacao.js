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

module.exports = autenticar; // ✅ Exportando diretamente a função
