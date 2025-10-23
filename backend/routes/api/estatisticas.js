// routes/api/estatisticas.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');

/** ===========================
 *  Helpers
 *  =========================== */

// aceita "dd/mm/aaaa" ou "aaaa-mm-dd"
function parseQualquerDataInicio(s) {
  if (!s) return null;
  if (s.includes('/')) {
    const [d, m, y] = s.split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  if (s.includes('-')) {
    const [y, m, d] = s.split('-').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return null;
}
function parseQualquerDataFim(s) {
  if (!s) return null;
  if (s.includes('/')) {
    const [d, m, y] = s.split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  if (s.includes('-')) {
    const [y, m, d] = s.split('-').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return null;
}

// Aceita instituicao como ObjectId ou string (base mista)
function buildInstMatch(inst) {
  if (!inst) return {};
  if (mongoose.isValidObjectId(inst)) {
    const oid = new mongoose.Types.ObjectId(inst);
    return { $or: [{ instituicao: oid }, { instituicao: String(inst) }] };
  }
  return { instituicao: String(inst) };
}

// Ajuste conforme seu schema:
const CAMPO_TURMA = 'turma';     // ex.: 'turma' ou 'turma.nome'
const CAMPO_DATA  = 'createdAt'; // ex.: 'createdAt' ou 'dataMatricula'

// projeção para pegar nota de comportamento com fallback
const PROJ_NOTA = {
  nota: {
    $cond: [
      { $and: [{ $ne: ['$comportamento', null] }, { $eq: [{ $type: '$comportamento' }, 'double'] }] },
      '$comportamento',
      {
        $cond: [
          { $and: [{ $ne: ['$notaComportamento', null] }, { $eq: [{ $type: '$notaComportamento' }, 'double'] }] },
          '$notaComportamento',
          null
        ]
      }
    ]
  }
};

/** ===========================
 *  Utilitários e raiz
 *  =========================== */
router.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

router.get('/', (req, res) => {
  res.json({
    ok: true,
    endpoints: [
      'GET /api/estatisticas/turmas',
      'GET /api/estatisticas/alunos-por-turma?inicio=dd/mm/aaaa|aaaa-mm-dd&fim=dd/mm/aaaa|aaaa-mm-dd&turma=Todas',
      'GET /api/estatisticas/comportamento-por-turma',
      'GET /api/estatisticas/distribuicao',
      'GET /api/estatisticas/ping',
    ],
  });
});

/** ===========================
 *  Endpoints
 *  =========================== */

// Distinct de turmas por instituição, com limpeza e ordenação
router.get('/turmas', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const filtro = { ...buildInstMatch(inst), [CAMPO_TURMA]: { $ne: null } };
    let turmas = await Aluno.distinct(CAMPO_TURMA, filtro);

    // normaliza/limpa
    turmas = Array.from(
      new Set(
        (turmas || [])
          .filter(Boolean)
          .map(t => String(t).trim())
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

    res.json(turmas);
  } catch (e) {
    console.error('estatisticas/turmas:', e);
    res.status(500).json([]);
  }
});

// Alunos por turma (opcionalmente filtrando por intervalo de datas e turma)
router.get('/alunos-por-turma', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const { inicio, fim, turma } = req.query;

    const filtro = { ...buildInstMatch(inst) };

    // datas opcionais
    const di = parseQualquerDataInicio(inicio);
    const df = parseQualquerDataFim(fim);
    if (di || df) {
      filtro[CAMPO_DATA] = {};
      if (di) filtro[CAMPO_DATA].$gte = di;
      if (df) filtro[CAMPO_DATA].$lte = df;
    }

    // turma opcional (exceto "Todas")
    if (turma && turma !== 'Todas') {
      filtro[CAMPO_TURMA] = String(turma).trim();
    }

    const rows = await Aluno.aggregate([
      { $match: filtro },
      { $group: { _id: { $ifNull: [`$${CAMPO_TURMA}`, 'Sem turma'] }, total: { $sum: 1 } } },
      { $project: { _id: 0, turma: '$_id', total: 1 } },
      { $sort: { turma: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/alunos-por-turma:', e);
    res.status(500).json([]);
  }
});

// Média de comportamento por turma (usa comportamento OU notaComportamento)
router.get('/comportamento-por-turma', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;

    const data = await Aluno.aggregate([
      { $match: buildInstMatch(inst) },
      { $project: { [CAMPO_TURMA]: 1, ...PROJ_NOTA } },
      { $match: { nota: { $ne: null } } },
      { $group: { _id: `$${CAMPO_TURMA}`, media: { $avg: '$nota' }, n: { $sum: 1 } } },
      { $project: { _id: 0, turma: { $ifNull: ['$_id', 'Sem turma'] }, media: { $round: ['$media', 2] }, n: 1 } },
      { $sort: { turma: 1 } },
    ]);

    res.json(data);
  } catch (e) {
    console.error('comportamento-por-turma:', e);
    res.json([]);
  }
});

// Distribuição por faixas (excepcional/ótimo/bom/regular/insuficiente/incompatível)
router.get('/distribuicao', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;

    const rows = await Aluno.aggregate([
      { $match: buildInstMatch(inst) },
      { $project: PROJ_NOTA },
      { $match: { nota: { $ne: null } } },
      {
        $project: {
          cat: {
            $switch: {
              branches: [
                { case: { $gte: ['$nota', 9.0] }, then: 'excepcional' },
                { case: { $gte: ['$nota', 8.0] }, then: 'otimo' },
                { case: { $gte: ['$nota', 7.0] }, then: 'bom' },
                { case: { $gte: ['$nota', 6.0] }, then: 'regular' },
                { case: { $and: [{ $gte: ['$nota', 0] }, { $lt: ['$nota', 6.0] }] }, then: 'insuficiente' },
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
      otimo:       m.otimo || 0,
      bom:         m.bom || 0,
      regular:     m.regular || 0,
      insuficiente:m.insuficiente || 0,
      incompativel:m.incompativel || 0,
    });
  } catch (e) {
    console.error('distribuicao:', e);
    res.json({ excepcional: 0, otimo: 0, bom: 0, regular: 0, insuficiente: 0, incompativel: 0 });
  }
});

module.exports = router;
