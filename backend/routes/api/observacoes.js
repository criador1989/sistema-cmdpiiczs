const express = require('express');
const router = express.Router();
const Observacao = require('../../models/Observacao');
const Aluno = require('../../models/Aluno');
const autenticar = require('../../middleware/autenticacao');

// Criar nova observação
router.post('/:alunoId', autenticar, async (req, res) => {
  try {
    const { texto } = req.body;
    const { alunoId } = req.params;

    if (!texto) return res.status(400).json({ mensagem: 'Texto da observação é obrigatório.' });

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });

    const novaObs = new Observacao({
      aluno: aluno._id,
      texto,
      autor: req.usuario.nome,
      instituicao: req.usuario.instituicao
    });

    await novaObs.save();
    res.status(201).json(novaObs);
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao salvar observação.' });
  }
});

// Listar observações
router.get('/:alunoId', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ _id: req.params.alunoId, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: req.usuario.instituicao
    }).sort({ criadoEm: -1 });

    res.json(observacoes);
  } catch (erro) {
    console.error('Erro ao buscar observações:', erro);
    res.status(500).json({ mensagem: 'Erro ao buscar observações.' });
  }
});

// Deletar observação
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const observacao = await Observacao.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });
    if (!observacao) return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });

    await observacao.deleteOne();
    res.json({ mensagem: 'Observação excluída com sucesso.' });
  } catch (erro) {
    console.error('Erro ao excluir observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao excluir observação.' });
  }
});

// Atualizar observação
router.put('/:id', autenticar, async (req, res) => {
  try {
    const { texto } = req.body;
    const observacao = await Observacao.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });

    if (!observacao) return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });

    observacao.texto = texto;
    await observacao.save();
    res.json({ mensagem: 'Observação atualizada com sucesso.' });
  } catch (erro) {
    console.error('Erro ao atualizar observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao atualizar observação.' });
  }
});

module.exports = router;
