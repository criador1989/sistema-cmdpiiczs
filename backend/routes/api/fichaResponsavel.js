const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// ROTA CERTA: /api/responsavel/ficha/:codigo
router.get('/ficha/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.toUpperCase().trim();

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

    const notificacoes = await Notificacao.find({ aluno: aluno._id }).sort({ createdAt: -1 });

    res.json({ aluno, notificacoes });
  } catch (erro) {
    console.error('Erro ao buscar ficha do responsável:', erro);
    res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

module.exports = router;
