const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

// GET /api/estatisticas
router.get('/', autenticar, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const { inicio, fim, turma } = req.query;

    const filtroDatas = {};
    if (inicio || fim) filtroDatas.createdAt = {};
    if (inicio) filtroDatas.createdAt.$gte = new Date(inicio);
    if (fim) filtroDatas.createdAt.$lte = new Date(fim);

    const filtroAluno = { instituicao };
    if (turma) filtroAluno.turma = turma;

    const alunos = await Aluno.find(filtroAluno);
    const alunosPorTurma = {};
    const comportamentoMedioPorTurma = {};

    alunos.forEach(a => {
      if (!alunosPorTurma[a.turma]) {
        alunosPorTurma[a.turma] = 0;
        comportamentoMedioPorTurma[a.turma] = [];
      }
      alunosPorTurma[a.turma]++;
      comportamentoMedioPorTurma[a.turma].push(a.comportamento || 8);
    });

    Object.keys(comportamentoMedioPorTurma).forEach(turma => {
      const notas = comportamentoMedioPorTurma[turma];
      const media = notas.reduce((s, n) => s + n, 0) / notas.length;
      comportamentoMedioPorTurma[turma] = parseFloat(media.toFixed(2));
    });

    const alunosIds = alunos.map(a => a._id);
    const filtroNotificacoes = {
      instituicao,
      aluno: { $in: alunosIds },
      ...filtroDatas
    };

    const notificacoes = await Notificacao.find(filtroNotificacoes);
    const tiposNotificacao = {};
    const tiposMedida = {};

    notificacoes.forEach(n => {
      tiposNotificacao[n.tipo] = (tiposNotificacao[n.tipo] || 0) + 1;
      tiposMedida[n.tipoMedida] = (tiposMedida[n.tipoMedida] || 0) + 1;
    });

    res.json({ alunosPorTurma, tiposNotificacao, comportamentoMedioPorTurma, tiposMedida });
  } catch (erro) {
    console.error('Erro ao gerar estatísticas:', erro);
    res.status(500).json({ erro: 'Erro ao gerar estatísticas.' });
  }
});

module.exports = router;
