// routes/api/estatisticas.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');

/** ===========================
 *  Helpers
 *  =========================== */
function parseDiaInicio(brDateStr) {
  if (!brDateStr) return null;
  const [d, m, y] = brDateStr.split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function parseDiaFim(brDateStr) {
  if (!brDateStr) return null;
  const [d, m, y] = brDateStr.split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

// Ajuste estes nomes conforme seu schema:
const CAMPO_TURMA = 'turma';       // ex.: 'turma' ou 'turma.nome'
const CAMPO_DATA  = 'createdAt';   // ex.: 'createdAt' ou 'dataMatricula'

/** ===========================
 *  Endpoints utilitários
 *  =========================== */
router.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Evita 404 na raiz e dá um guia rápido
router.get('/', (req, res) => {
  res.json({
    ok: true,
    endpoints: [
      'GET /api/estatisticas/turmas',
      'GET /api/estatisticas/alunos-por-turma?inicio=dd/mm/aaaa&fim=dd/mm/aaaa&turma=Todas',
      'GET /api/estatisticas/comportamento-por-turma',
      'GET /api/estatisticas/distribuicao',
      'GET /api/estatisticas/ping',
    ],
  });
});

/** ===========================
 *  Novos endpoints do painel
 *  =========================== */

// Lista de turmas (distintas), filtradas pela instituição do usuário
router.get('/turmas', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const filtro = { instituicao: inst, [CAMPO_TURMA]: { $ne: null } };
    const turmas = await Aluno.distinct(CAMPO_TURMA, filtro);
    turmas.sort((a, b) => String(a).localeCompare(String(b)));
    res.json(turmas);
  } catch (e) {
    console.error('estatisticas/turmas:', e);
    res.status(500).json([]);
  }
});

// Alunos por turma com filtros de data e turma
router.get('/alunos-por-turma', autenticar, async (req, res) => {
  try {
    const inst   = req.usuario.instituicao;
    const { inicio, fim, turma } = req.query;

    const filtro = { instituicao: inst };

    // Filtro de datas
    const di = parseDiaInicio(inicio);
    const df = parseDiaFim(fim);
    if (di || df) {
      filtro[CAMPO_DATA] = {};
      if (di) filtro[CAMPO_DATA].$gte = di;
      if (df) filtro[CAMPO_DATA].$lte = df;
    }

    // Filtro por turma (se for informada e diferente de 'Todas')
    if (turma && turma !== 'Todas') {
      filtro[CAMPO_TURMA] = turma;
    }

    const pipeline = [
      { $match: filtro },
      { $group: { _id: `$${CAMPO_TURMA}`, total: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];

    const rows = await Aluno.aggregate(pipeline);
    const saida = rows.map(r => ({ turma: r._id || 'Sem turma', total: r.total }));
    res.json(saida);
  } catch (e) {
    console.error('estatisticas/alunos-por-turma:', e);
    res.status(500).json([]);
  }
});

/** ===========================
 *  Seus endpoints existentes
 *  =========================== */

// Média simples usando Aluno.comportamento
router.get('/comportamento-por-turma', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const data = await Aluno.aggregate([
      { $match: { instituicao: inst, comportamento: { $type: 'number' } } },
      { $group: { _id: `$${CAMPO_TURMA}`, media: { $avg: '$comportamento' } } },
      { $project: { _id: 0, turma: '$_id', media: { $round: ['$media', 2] } } },
      { $sort: { turma: 1 } },
    ]);
    res.json(data);
  } catch (e) {
    console.error('comportamento-por-turma:', e);
    res.json([]);
  }
});

// Distribuição por faixas do campo comportamento
router.get('/distribuicao', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const TH = { exc: 9.6, oti: 8.6, bom: 7.6, reg: 6.1, ins: 5.1 };

    const rows = await Aluno.aggregate([
      { $match: { instituicao: inst, comportamento: { $type: 'number' } } },
      {
        $project: {
          cat: {
            $switch: {
              branches: [
                { case: { $gte: ['$comportamento', TH.exc] }, then: 'excepcional' },
                { case: { $gte: ['$comportamento', TH.oti] }, then: 'otimo' },
                { case: { $gte: ['$comportamento', TH.bom] }, then: 'bom' },
                { case: { $gte: ['$comportamento', TH.reg] }, then: 'regular' },
                { case: { $gte: ['$comportamento', TH.ins] }, then: 'insuficiente' },
              ],
              default: 'incompativel',
            },
          },
        },
      },
      { $group: { _id: '$cat', total: { $sum: 1 } } },
    ]);

    const m = Object.fromEntries(rows.map(r => [r._id, r.total]));
    res.json({
      excepcional: m.excepcional || 0,
      otimo: m.otimo || 0,
      bom: m.bom || 0,
      regular: m.regular || 0,
      insuficiente: m.insuficiente || 0,
      incompativel: m.incompativel || 0,
    });
  } catch (e) {
    console.error('distribuicao:', e);
    res.json({ excepcional: 0, otimo: 0, bom: 0, regular: 0, insuficiente: 0, incompativel: 0 });
  }
});

module.exports = router;
