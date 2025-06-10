const express = require('express');
const router = express.Router();
const Observacao = require('../../models/Observacao');
const Aluno = require('../../models/Aluno');
const autenticar = require('../../middlewares/autenticacao');

// Salvar nova observação
router.post('/:alunoId', autenticar, async (req, res) => {
  try {
    const { texto } = req.body;
    const { alunoId } = req.params;

    if (!texto) {
      return res.status(400).json({ mensagem: 'O campo texto é obrigatório.' });
    }

    // Verifica se o aluno é da mesma instituição
    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.usuario.instituicao });
    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    const nova = new Observacao({
      aluno: alunoId,
      texto,
      autor: req.usuario.nome || 'Desconhecido',
      instituicao: req.usuario.instituicao
    });

    await nova.save();
    res.status(201).json(nova);
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao salvar observação.' });
  }
});

// Listar observações de um aluno
router.get('/:alunoId', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.alunoId,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    const observacoes = await Observacao.find({
      aluno: req.params.alunoId,
      instituicao: req.usuario.instituicao
    }).sort({ data: -1 });

    res.json(observacoes);
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao buscar observações.' });
  }
});

module.exports = router;
