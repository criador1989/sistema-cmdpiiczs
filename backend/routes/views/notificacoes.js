// routes/views/notificacoes.js
const express = require('express');
const router = express.Router();

// Serve a página HTML moderna com layout e JS no frontend
router.get('/', (req, res) => {
  res.sendFile('notificacoes.html', { root: 'public' });
});

module.exports = router;
