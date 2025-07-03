const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Observacao = require('../../models/Observacao'); // Corrigido capitalização
const Notificacao = require('../../models/Notificacao');
const autenticar = require('../../middleware/autenticacao'); // Caminho corrigido

// Página para visualizar ficha (HTML)
router.get('/ver/:id', autenticar, async (req, res) => {
  res.sendFile('ver-ficha.html', { root: 'public' });
});

// Página HTML para registrar observações
router.get('/:id', autenticar, async (req, res) => {
  const aluno = await Aluno.findOne({
    _id: req.params.id,
    instituicao: req.usuario.instituicao
  });
  if (!aluno) return res.status(404).send('Aluno não encontrado');
  res.sendFile('ficha-aluno.html', { root: 'public' });
});

// API interna para dados da ficha
router.get('/dados/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: req.usuario.instituicao
    }).sort({ criadoEm: -1 });

    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao: req.usuario.instituicao
    }).sort({ data: -1 });

    res.json({ aluno, observacoes, notificacoes });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao buscar dados da ficha' });
  }
});

// Salvar nova observação
router.post('/salvar/:id', autenticar, async (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ erro: 'Texto da observação é obrigatório' });

  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });

    const nova = new Observacao({
      aluno: aluno._id,
      texto,
      autor: req.usuario.nome || 'Desconhecido',
      instituicao: req.usuario.instituicao
    });

    await nova.save();
    res.json({ mensagem: 'Observação salva com sucesso' });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar observação' });
  }
});

module.exports = router;
