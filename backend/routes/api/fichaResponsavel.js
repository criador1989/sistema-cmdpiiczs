// routes/api/fichaResponsavel.js
const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

router.get('/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.toUpperCase().trim();

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado.' });

    const notificacoes = await Notificacao.find({ aluno: aluno._id }).sort({ data: -1 });

    res.json({
      aluno: {
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso,
        comportamento: aluno.comportamento || 8.0
      },
      notificacoes
    });

  } catch (err) {
    console.error('❌ Erro ao buscar ficha:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar ficha.' });
  }
});

module.exports = router;
