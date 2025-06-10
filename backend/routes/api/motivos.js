const express = require('express');
const router = express.Router();
const { listarTodosMotivos } = require('../../utils/regulamento');

// GET /api/motivos - Lista todos os motivos do regulamento
router.get('/', (req, res) => {
  const motivos = listarTodosMotivos();
  res.json(motivos);
});

module.exports = router;
