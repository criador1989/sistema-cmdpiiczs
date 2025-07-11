const express = require('express');
const path = require('path');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao'); // ✅ Importação correta

// ✅ Rota protegida com autenticação
router.get('/:id', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/ficha-aluno.html'));
});

module.exports = router;
