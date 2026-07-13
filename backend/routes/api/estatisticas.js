// routes/api/estatisticas.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

const Aluno = require('../../models/Aluno');
const AphAtendimento = require('../../models/AphAtendimento');

/* =========================
   HELPERS GERAIS
========================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function parseQualquerDataInicio(s) {
  if (!s) return null;

  if (String(s).includes('/')) {
    const [d, m, y] = String(s).split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  if (String(s).includes('-')) {
    const [y, m, d] = String(s).split('-').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  return null;
}

function parseQualquerDataFim(s) {
  if (!s) return null;

  if (String(s).includes('/')) {
    const [d, m, y] = String(s).split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }

  if (String(s).includes('-')) {
    const [y, m, d] = String(s).split('-').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  }

  return null;
}

function buildInstMatch(inst) {
  if (!inst) return { _id: null };

  const asStr = String(inst);

  const or = [
    { instituicao: asStr },
    { tenantId: asStr },
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ instituicao: oid });
    or.push({ tenantId: oid });
  }

  return { $or: or };
}

function buildDataMatch({ inicio, fim, campo = 'data' }) {
  const di = parseQualquerDataInicio(inicio);
  const df = parseQualquerDataFim(fim);

  if (!di && !df) return {};

  const filtro = {};
  filtro[campo] = {};
  if (di) filtro[campo].$gte = di;
  if (df) filtro[campo].$lte = df;

  return filtro;
}

function normalizarTurma(turma) {
  return String(turma || '').trim();
}

function addTurmaMatch(filtro, turma, campo = 'alunoTurmaSnapshot') {
  const t = normalizarTurma(turma);
  if (t && t !== 'Todas') {
    filtro[campo] = t;
  }
}

function safeRegex(texto) {
  return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchMatch(q) {
  const termo = String(q || '').trim();
  if (!termo) return {};

  const rx = new RegExp(safeRegex(termo), 'i');

  return {
    $or: [
      { numeroRegistro: rx },
      { alunoNomeSnapshot: rx },
      { alunoTurmaSnapshot: rx },
      { local: rx },
      { localOutro: rx },
      { servidorResponsavelRegistro: rx },
      { responsavel: rx },
      { classificacoes: rx },
      { tipos: rx },
      { materiais: rx },
      { providenciasAdotadas: rx },
      { desfecho: rx },
      { descricaoFatos: rx },
      { sinaisESintomas: rx },
      { descricaoProvidencias: rx },
      { descricaoDesfecho: rx },
    ],
  };
}

const CAMPO_TURMA = 'turma';
const CAMPO_DATA = 'createdAt';

const PROJ_NOTA = {
  nota: {
    $cond: [
      {
        $and: [
          { $ne: ['$comportamento', null] },
          { $in: [{ $type: '$comportamento' }, ['double', 'int', 'long', 'decimal']] },
        ],
      },
      '$comportamento',
      {
        $cond: [
          {
            $and: [
              { $ne: ['$notaComportamento', null] },
              { $in: [{ $type: '$notaComportamento' }, ['double', 'int', 'long', 'decimal']] },
            ],
          },
          '$notaComportamento',
          null,
        ],
      },
    ],
  },
};

/* =========================
   ENDPOINTS BÁSICOS
========================= */

router.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    endpoints: [
      'GET /api/estatisticas/turmas',
      'GET /api/estatisticas/alunos-por-turma',
      'GET /api/estatisticas/comportamento-por-turma',
      'GET /api/estatisticas/distribuicao',
      'GET /api/estatisticas/aph/resumo',
      'GET /api/estatisticas/aph/tipos',
      'GET /api/estatisticas/aph/materiais',
      'GET /api/estatisticas/aph/locais',
      'GET /api/estatisticas/aph/turmas',
      'GET /api/estatisticas/aph/mes',
      'GET /api/estatisticas/aph/responsaveis',
      'GET /api/estatisticas/aph/desfechos',
      'GET /api/estatisticas/aph/encaminhamentos',
      'GET /api/estatisticas/aph/turnos',
    ],
  });
});

/* =========================
   ESTATÍSTICAS EXISTENTES
========================= */

router.get('/turmas', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = getTenantId(req);

    const filtro = {
      ...buildInstMatch(inst),
      [CAMPO_TURMA]: { $ne: null },
    };

    let turmas = await Aluno.distinct(CAMPO_TURMA, filtro);

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

router.get('/alunos-por-turma', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = getTenantId(req);
    const { inicio, fim, turma } = req.query;

    const filtro = {
      ...buildInstMatch(inst),
      ...buildDataMatch({ inicio, fim, campo: CAMPO_DATA }),
    };

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

router.get('/comportamento-por-turma', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = getTenantId(req);

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

router.get('/distribuicao', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = getTenantId(req);

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
      otimo: m.otimo || 0,
      bom: m.bom || 0,
      regular: m.regular || 0,
      insuficiente: m.insuficiente || 0,
      incompativel: m.incompativel || 0,
    });
  } catch (e) {
    console.error('distribuicao:', e);
    res.json({
      excepcional: 0,
      otimo: 0,
      bom: 0,
      regular: 0,
      insuficiente: 0,
      incompativel: 0,
    });
  }
});

/* =========================
   HELPERS APH
========================= */

function buildAphFiltro(req) {
  const inst = getTenantId(req);
  const { inicio, fim, turma, q } = req.query;

  const filtro = {
    ...buildInstMatch(inst),
    ...buildDataMatch({ inicio, fim, campo: 'data' }),
  };

  addTurmaMatch(filtro, turma, 'alunoTurmaSnapshot');

  const busca = buildSearchMatch(q);
  if (Object.keys(busca).length) {
    filtro.$and = filtro.$and || [];
    filtro.$and.push(busca);
  }

  return filtro;
}

function groupArrayFieldPipeline({ filtro, field, labelName = 'nome', limit = 12 }) {
  return [
    { $match: filtro },
    {
      $project: {
        arr: {
          $cond: [
            { $isArray: `$${field}` },
            `$${field}`,
            [],
          ],
        },
      },
    },
    { $unwind: '$arr' },
    {
      $project: {
        item: {
          $trim: {
            input: { $toString: '$arr' },
          },
        },
      },
    },
    { $match: { item: { $ne: '' } } },
    { $group: { _id: '$item', total: { $sum: 1 } } },
    { $sort: { total: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, [labelName]: '$_id', total: 1 } },
  ];
}

function groupStringFieldPipeline({ filtro, field, labelName = 'nome', limit = 12, fallback = 'Não informado' }) {
  return [
    { $match: filtro },
    {
      $project: {
        item: {
          $trim: {
            input: {
              $toString: {
                $ifNull: [`$${field}`, fallback],
              },
            },
          },
        },
      },
    },
    { $match: { item: { $ne: '' } } },
    { $group: { _id: '$item', total: { $sum: 1 } } },
    { $sort: { total: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, [labelName]: '$_id', total: 1 } },
  ];
}

/* =========================
   APH — RESUMO GERAL
========================= */

router.get('/aph/resumo', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const [
      total,
      comEncaminhamento,
      comComunicacao,
      semComunicacao,
      alunosUnicos,
    ] = await Promise.all([
      AphAtendimento.countDocuments(filtro),

      AphAtendimento.countDocuments({
        ...filtro,
        houveEncaminhamento: true,
      }),

      AphAtendimento.countDocuments({
        ...filtro,
        $or: [
          { responsaveisInformados: 'Sim' },
          { 'comunicacaoPais.houveComunicacao': 'Sim' },
        ],
      }),

      AphAtendimento.countDocuments({
        ...filtro,
        $and: [
          ...(filtro.$and || []),
          {
            $or: [
              { responsaveisInformados: { $ne: 'Sim' } },
              { responsaveisInformados: { $exists: false } },
            ],
          },
        ],
      }),

      AphAtendimento.distinct('alunoId', filtro),
    ]);

    const topAlunoRows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            alunoId: '$alunoId',
            nome: { $ifNull: ['$alunoNomeSnapshot', 'Aluno não informado'] },
            turma: { $ifNull: ['$alunoTurmaSnapshot', '—'] },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          alunoId: '$_id.alunoId',
          aluno: '$_id.nome',
          turma: '$_id.turma',
          total: 1,
        },
      },
    ]);

    res.json({
      ok: true,
      total,
      comEncaminhamento,
      semEncaminhamento: Math.max(0, total - comEncaminhamento),
      comComunicacao,
      semComunicacao,
      alunosAtendidos: Array.isArray(alunosUnicos) ? alunosUnicos.length : 0,
      topAlunos: topAlunoRows,
    });
  } catch (e) {
    console.error('estatisticas/aph/resumo:', e);
    res.status(500).json({
      ok: false,
      total: 0,
      comEncaminhamento: 0,
      semEncaminhamento: 0,
      comComunicacao: 0,
      semComunicacao: 0,
      alunosAtendidos: 0,
      topAlunos: [],
    });
  }
});

/* =========================
   APH — AGRUPAMENTOS
========================= */

router.get('/aph/tipos', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          arr: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$classificacoes', []] } }, 0] },
              '$classificacoes',
              { $ifNull: ['$tipos', []] },
            ],
          },
        },
      },
      { $unwind: '$arr' },
      {
        $project: {
          tipo: { $trim: { input: { $toString: '$arr' } } },
        },
      },
      { $match: { tipo: { $ne: '' } } },
      { $group: { _id: '$tipo', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: 15 },
      { $project: { _id: 0, tipo: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/tipos:', e);
    res.json([]);
  }
});

router.get('/aph/materiais', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate(
      groupArrayFieldPipeline({
        filtro,
        field: 'materiais',
        labelName: 'material',
        limit: 15,
      })
    );

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/materiais:', e);
    res.json([]);
  }
});

router.get('/aph/providencias', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate(
      groupArrayFieldPipeline({
        filtro,
        field: 'providenciasAdotadas',
        labelName: 'providencia',
        limit: 15,
      })
    );

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/providencias:', e);
    res.json([]);
  }
});

router.get('/aph/locais', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          local: {
            $trim: {
              input: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$local', 'Outro'] },
                      { $ne: ['$localOutro', null] },
                      { $ne: ['$localOutro', ''] },
                    ],
                  },
                  '$localOutro',
                  { $ifNull: ['$local', 'Não informado'] },
                ],
              },
            },
          },
        },
      },
      { $match: { local: { $ne: '' } } },
      { $group: { _id: '$local', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: 15 },
      { $project: { _id: 0, local: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/locais:', e);
    res.json([]);
  }
});

router.get('/aph/turmas', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          turma: {
            $trim: {
              input: {
                $toString: {
                  $ifNull: ['$alunoTurmaSnapshot', 'Sem turma'],
                },
              },
            },
          },
        },
      },
      { $match: { turma: { $ne: '' } } },
      { $group: { _id: '$turma', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: 20 },
      { $project: { _id: 0, turma: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/turmas:', e);
    res.json([]);
  }
});

router.get('/aph/responsaveis', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          responsavel: {
            $trim: {
              input: {
                $toString: {
                  $ifNull: [
                    '$servidorResponsavelRegistro',
                    { $ifNull: ['$responsavel', 'Não informado'] },
                  ],
                },
              },
            },
          },
        },
      },
      { $match: { responsavel: { $ne: '' } } },
      { $group: { _id: '$responsavel', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: 15 },
      { $project: { _id: 0, responsavel: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/responsaveis:', e);
    res.json([]);
  }
});

router.get('/aph/desfechos', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          desfecho: {
            $trim: {
              input: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$desfecho', 'Outro'] },
                      { $ne: ['$desfechoOutro', null] },
                      { $ne: ['$desfechoOutro', ''] },
                    ],
                  },
                  '$desfechoOutro',
                  { $ifNull: ['$desfecho', 'Não informado'] },
                ],
              },
            },
          },
        },
      },
      { $match: { desfecho: { $ne: '' } } },
      { $group: { _id: '$desfecho', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: 15 },
      { $project: { _id: 0, desfecho: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/desfechos:', e);
    res.json([]);
  }
});

router.get('/aph/encaminhamentos', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          encaminhamento: {
            $cond: [
              { $eq: ['$houveEncaminhamento', true] },
              'Com encaminhamento',
              'Sem encaminhamento',
            ],
          },
        },
      },
      { $group: { _id: '$encaminhamento', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $project: { _id: 0, encaminhamento: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/encaminhamentos:', e);
    res.json([]);
  }
});

router.get('/aph/comunicacao', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          comunicacao: {
            $cond: [
              {
                $or: [
                  { $eq: ['$responsaveisInformados', 'Sim'] },
                  { $eq: ['$comunicacaoPais.houveComunicacao', 'Sim'] },
                ],
              },
              'Com comunicação',
              'Sem comunicação',
            ],
          },
        },
      },
      { $group: { _id: '$comunicacao', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $project: { _id: 0, comunicacao: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/comunicacao:', e);
    res.json([]);
  }
});

router.get('/aph/turnos', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          horaBase: {
            $ifNull: ['$horaInicioAtendimento', '$hora'],
          },
        },
      },
      {
        $project: {
          horaNum: {
            $toInt: {
              $substrBytes: [
                {
                  $cond: [
                    { $regexMatch: { input: { $ifNull: ['$horaBase', ''] }, regex: /^[0-9]{2}:/ } },
                    '$horaBase',
                    '00:00',
                  ],
                },
                0,
                2,
              ],
            },
          },
        },
      },
      {
        $project: {
          turno: {
            $switch: {
              branches: [
                { case: { $and: [{ $gte: ['$horaNum', 5] }, { $lt: ['$horaNum', 12] }] }, then: 'Manhã' },
                { case: { $and: [{ $gte: ['$horaNum', 12] }, { $lt: ['$horaNum', 18] }] }, then: 'Tarde' },
                { case: { $and: [{ $gte: ['$horaNum', 18] }, { $lte: ['$horaNum', 23] }] }, then: 'Noite' },
              ],
              default: 'Não informado',
            },
          },
        },
      },
      { $group: { _id: '$turno', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $project: { _id: 0, turno: '$_id', total: 1 } },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/turnos:', e);
    res.json([]);
  }
});

router.get('/aph/mes', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $project: {
          ano: { $year: '$data' },
          mes: { $month: '$data' },
        },
      },
      {
        $group: {
          _id: { ano: '$ano', mes: '$mes' },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.ano': 1, '_id.mes': 1 } },
      {
        $project: {
          _id: 0,
          ano: '$_id.ano',
          mes: '$_id.mes',
          label: {
            $concat: [
              {
                $cond: [
                  { $lt: ['$_id.mes', 10] },
                  { $concat: ['0', { $toString: '$_id.mes' }] },
                  { $toString: '$_id.mes' },
                ],
              },
              '/',
              { $toString: '$_id.ano' },
            ],
          },
          total: 1,
        },
      },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/mes:', e);
    res.json([]);
  }
});

/* =========================
   APH — TOP ALUNOS
========================= */

router.get('/aph/alunos-recorrentes', autenticar, requireTenant, async (req, res) => {
  try {
    const filtro = buildAphFiltro(req);

    const rows = await AphAtendimento.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            alunoId: '$alunoId',
            nome: { $ifNull: ['$alunoNomeSnapshot', 'Aluno não informado'] },
            turma: { $ifNull: ['$alunoTurmaSnapshot', '—'] },
          },
          total: { $sum: 1 },
          ultimoAtendimento: { $max: '$data' },
        },
      },
      { $sort: { total: -1, ultimoAtendimento: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          alunoId: '$_id.alunoId',
          aluno: '$_id.nome',
          turma: '$_id.turma',
          total: 1,
          ultimoAtendimento: 1,
        },
      },
    ]);

    res.json(rows);
  } catch (e) {
    console.error('estatisticas/aph/alunos-recorrentes:', e);
    res.json([]);
  }
});

module.exports = router;