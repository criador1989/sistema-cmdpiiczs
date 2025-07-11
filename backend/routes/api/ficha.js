const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');

// GET /api/ficha/dados/:id — retorna dados completos da ficha do aluno
router.get('/dados/:id', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.id);
    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado' });
    }

    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao: aluno.instituicao
    }).sort({ data: -1 });

    const observacoes = await Observacao.find({ aluno: aluno._id })
      .sort({ criadoEm: -1 });

    res.json({ aluno, notificacoes, observacoes });
  } catch (err) {
    console.error('Erro ao buscar ficha do aluno:', err);
    res.status(500).json({ erro: 'Erro ao carregar dados da ficha' });
  }
});

// POST /api/ficha/salvar/:id (opcional, se for salvar observações depois)
router.post('/salvar/:id', async (req, res) => {
  res.json({ mensagem: 'Observação salva com sucesso (rota funcional).' });
});

module.exports = router;
