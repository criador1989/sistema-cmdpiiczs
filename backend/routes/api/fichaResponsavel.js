const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// GET /api/responsavel/ficha/:codigo
router.get('/ficha/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.trim().toUpperCase();

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) {
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    const notificacoes = await Notificacao.find({ aluno: aluno._id })
      .sort({ createdAt: -1 })
      .select('tipo tipoMedida motivo valorNumerico createdAt');

    res.json({
      aluno: {
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso,
        comportamento: aluno.comportamento || 8.00
      },
      notificacoes
    });
  } catch (erro) {
    console.error('Erro ao buscar ficha do aluno para responsável:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar ficha do aluno.' });
  }
});

module.exports = router;
