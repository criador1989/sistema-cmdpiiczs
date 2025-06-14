const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// GET /api/responsavel/ficha/:codigo
router.get('/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.trim().toUpperCase();
    
    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado' });

    const notificacoes = await Notificacao.find({ aluno: aluno._id }).sort({ data: -1 });

    res.json({ aluno, notificacoes });
  } catch (erro) {
    console.error('Erro ao buscar ficha do responsável:', erro);
    res.status(500).json({ mensagem: 'Erro interno no servidor' });
  }
});

module.exports = router;
