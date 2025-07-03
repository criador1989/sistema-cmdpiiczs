const express = require('express');
const router = express.Router();

router.get('/teste', (req, res) => {
  res.json({ mensagem: 'Rota /api/ficha funcionando!' });
});

module.exports = router;
