// routes/api/acessoProfessor.js
const express = require('express');
const router = express.Router();

const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const calcularNotaTSMD = require('../../utils/calculoNota');

/**
 * GET /api/usuarios/acesso/:token
 * Acesso público via token do professor:
 * - Lista os alunos da mesma instituição
 * - Calcula a nota de comportamento de cada aluno
 *   usando TSMD por DIAS ÚTEIS desde a data de entrada
 */
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = req.params.token;

    // 1) Valida o professor pelo token
    const professor = await Usuario.findOne({
      tokenAcessoProfessor: token,
      tipo: 'professor'
    }).select('_id instituicao');

    if (!professor) {
      return res.status(404).json({ erro: 'Token inválido ou professor não encontrado.' });
    }

    // (opcional) filtro por turma via query ?turma=...
    const filtroAlunos = { instituicao: professor.instituicao };
    if (req.query.turma) filtroAlunos.turma = req.query.turma;

    // (opcional) lista rápida sem nota via ?semNota=1|true
    const semNota = String(req.query.semNota || '').toLowerCase();
    const somenteLista = semNota === '1' || semNota === 'true';

    // 2) Busca alunos
    const alunos = await Aluno.find(filtroAlunos)
      .select('nome turma foto instituicao dataEntrada') // campos essenciais
      .lean();

    if (somenteLista) {
      // retorno rápido sem calcular nota
      return res.json({ alunos });
    }

    // 3) Busca TODAS as notificações de uma vez (evita N+1 queries)
    const ids = alunos.map(a => a._id);
    const notificacoes = await Notificacao.find({
      instituicao: professor.instituicao,
      aluno: { $in: ids }
    })
      .select('aluno data valorNumerico createdAt')
      .sort({ data: 1, createdAt: 1 })
      .lean();

    // 4) Agrupa notificações por aluno
    const porAluno = new Map();
    for (const n of notificacoes) {
      const k = String(n.aluno);
      if (!porAluno.has(k)) porAluno.set(k, []);
      porAluno.get(k).push(n);
    }

    // 5) Calcula nota de cada aluno (TSMD por dias úteis desde dataEntrada)
    const agora = new Date();
    const alunosComNotas = alunos.map(a => {
      const lista = porAluno.get(String(a._id)) || [];
      const comportamento = calcularNotaTSMD(a.dataEntrada, agora, lista);
      return { ...a, comportamento };
    });

    res.json({ alunos: alunosComNotas });
  } catch (erro) {
    console.error('Erro em GET /api/usuarios/acesso/:token:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar alunos' });
  }
});

module.exports = router;
