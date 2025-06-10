// backend/routes/api/regulamento.js
const express = require('express');
const router = express.Router();
const { obterTodosMotivos } = require('../../utils/regulamento');

router.get('/', (req, res) => {
  const lista = obterTodosMotivos();
  res.json(lista);
});

module.exports = router;
