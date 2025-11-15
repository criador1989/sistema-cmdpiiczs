// routes/api/usuario-logado.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');

// GET /api/usuario-logado
router.get('/', autenticar, (req, res) => {
  res.json(req.usuario); // Retorna os dados do token (id e tipo)
});

module.exports = router;
