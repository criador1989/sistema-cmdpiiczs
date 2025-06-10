const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// GET /api/responsavel/:codigoAcesso
router.get('/:codigoAcesso', async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ codigoAcesso: req.params.codigoAcesso });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado' });

    const notificacoes = await Notificacao.find({ aluno: aluno._id }).sort({ data: -1 });
    res.json(notificacoes);
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao buscar notificações', error });
  }
});

module.exports = router;
