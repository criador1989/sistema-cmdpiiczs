// backend/routes/api/logs.js
const express = require('express');
const router = express.Router();
const Log = require('../../models/Log');
const Usuario = require('../../models/Usuario');
const { autenticar } = require('../../middleware/autenticacao');

// GET /api/logs - Lista todos os logs da mesma instituição (apenas para admin)
router.get('/', autenticar, async (req, res) => {
  try {
    if (req.usuario.tipo !== 'admin') {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const logs = await Log.find({})
      .populate({ path: 'usuario', select: 'nome' })
      .sort({ data: -1 })
      .limit(200);

    res.json(logs);
  } catch (erro) {
    console.error('Erro ao buscar logs:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar logs' });
  }
});

module.exports = router;
