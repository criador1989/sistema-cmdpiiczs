// backend/routes/api/aph-estatisticas.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AphAtendimento = require('../../models/AphAtendimento');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

// (Opcional) enriquecer com turma/turno do aluno, se existir o model
let Aluno;
try { Aluno = require('../../models/Aluno'); } catch { /* opcional */ }

/* ================= Helpers multi-tenant ================= */

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

function buildTenantOrMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function buildTenantExprForLookup(tenantId, fieldName) {
  const asStr = String(tenantId);
  const exprOr = [
    { $eq: [`$${fieldName}`, asStr] }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    exprOr.push({ $eq: [`$${fieldName}`, oid] });
  }

  return { $or: exprOr };
}

/* ================= Helpers ================= */
function parseDateOnly(s) {
  // Espera 'YYYY-MM-DD'; retorna Date no início do dia local
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function buildMatch(query, req) {
  const { from, to, turma, turno, local, responsavel } = query;
  const tenantId = getTenantId(req);

  const pre = {
    ...buildTenantOrMatch(tenantId)
  };

  // Período em createdAt (timestamps do schema)
  const gte = parseDateOnly(from);
  const lte = parseDateOnly(to);
  if (gte || lte) {
    pre.createdAt = {};
    if (gte) pre.createdAt.$gte = gte;
    if (lte) {
      const end = new Date(lte);
      end.setDate(end.getDate() + 1); // fim do dia
      pre.createdAt.$lt = end;
    }
  }

  if (local) pre.local = local;

  if (responsavel) {
    pre.$and = pre.$and || [];
    pre.$and.push({
      $or: [
        { responsavel },
        { criadoPor: responsavel }
      ]
    });
  }

  // turma/turno serão aplicados após $lookup
  const post = {};
  if (turma && turma !== 'Todas') post['aluno.turma'] = turma;
  if (turno) post['aluno.turno'] = turno;

  return { pre, post };
}

function pipelineBase(req, preMatch, postMatch, enrichAluno = true) {
  const tenantId = getTenantId(req);
  const pipe = [];

  if (Object.keys(preMatch).length) {
    pipe.push({ $match: preMatch });
  }

  if (enrichAluno && Aluno) {
    const alunoTenantExpr = {
      $or: [
        buildTenantExprForLookup(tenantId, 'tenantId'),
        buildTenantExprForLookup(tenantId, 'instituicao')
      ]
    };

    pipe.push(
      {
        $lookup: {
          from: 'alunos',
          let: { alunoIdRef: '$alunoId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$alunoIdRef'] },
                    alunoTenantExpr
                  ]
                }
              }
            }
          ],
          as: 'aluno'
        }
      },
      { $unwind: { path: '$aluno', preserveNullAndEmptyArrays: true } }
    );

    if (Object.keys(postMatch).length) {
      pipe.push({ $match: postMatch });
    }
  }

  return pipe;
}

function groupCount(fieldExpr) {
  return [
    { $group: { _id: fieldExpr, total: { $sum: 1 } } },
    { $sort: { total: -1, _id: 1 } }
  ];
}

/* ================== GET /api/aph/estatisticas ================== */
/**
 * Query params aceitos:
 *  - from=YYYY-MM-DD
 *  - to=YYYY-MM-DD
 *  - turma=ex.: "7º A" (ou "Todas")
 *  - turno=ex.: "Matutino"
 *  - local=ex.: "Pátio"
 *  - responsavel=ex.: "Sgt Fulano" (casa com 'responsavel' OU 'criadoPor')
 */
router.get('/estatisticas', autenticar, requireTenant, async (req, res) => {
  try {
    const { pre, post } = buildMatch(req.query, req);

    // total geral
    const totalPipe = pipelineBase(req, pre, post);
    totalPipe.push(...groupCount(null));
    const totalAgg = await AphAtendimento.aggregate(totalPipe);
    const total = totalAgg.reduce((acc, r) => acc + r.total, 0);

    // por tipo (array: tipos)
    const porTipoPipe = pipelineBase(req, pre, post);
    porTipoPipe.push(
      { $unwind: { path: '$tipos', preserveNullAndEmptyArrays: false } },
      ...groupCount('$tipos')
    );

    // por material (array: materiais)
    const porMaterialPipe = pipelineBase(req, pre, post);
    porMaterialPipe.push(
      { $unwind: { path: '$materiais', preserveNullAndEmptyArrays: false } },
      ...groupCount('$materiais')
    );

    // por encaminhamento (string/bool normalizado)
    const porEncPipe = pipelineBase(req, pre, post);
    porEncPipe.push(
      {
        $project: {
          encaminhamento: {
            $cond: [
              { $eq: ['$houveEncaminhamento', true] },
              'Sim',
              {
                $cond: [
                  { $eq: ['$encaminhamento', true] },
                  'Sim',
                  {
                    $cond: [
                      { $gt: [{ $strLenCP: { $ifNull: ['$encaminhamento', ''] } }, 0] },
                      '$encaminhamento',
                      'Não'
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      ...groupCount('$encaminhamento')
    );

    // por local (string)
    const porLocalPipe = pipelineBase(req, pre, post);
    porLocalPipe.push(
      { $project: { local: { $ifNull: ['$local', ''] } } },
      ...groupCount('$local')
    );

    // por mês (YYYY-MM)
    const porMesPipe = pipelineBase(req, pre, post);
    porMesPipe.push(
      {
        $addFields: {
          ym: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }
        }
      },
      ...groupCount('$ym')
    );

    // por turma (via aluno)
    const porTurmaPipe = pipelineBase(req, pre, post, true);
    porTurmaPipe.push(
      { $project: { turma: '$aluno.turma' } },
      ...groupCount('$turma')
    );

    // por turno (via aluno)
    const porTurnoPipe = pipelineBase(req, pre, post, true);
    porTurnoPipe.push(
      { $project: { turno: '$aluno.turno' } },
      ...groupCount('$turno')
    );

    // por responsável (coalesce responsavel/criadoPor)
    const porRespPipe = pipelineBase(req, pre, post, false);
    porRespPipe.push(
      {
        $addFields: {
          responsavelFinal: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$responsavel', ''] } }, 0] },
              '$responsavel',
              { $ifNull: ['$criadoPor', ''] }
            ]
          }
        }
      },
      { $match: { responsavelFinal: { $ne: '' } } },
      ...groupCount('$responsavelFinal')
    );

    const [
      porTipo,
      porMaterial,
      porEncaminhamento,
      porLocal,
      porMes,
      porTurma,
      porTurno,
      porResponsavel
    ] = await Promise.all([
      AphAtendimento.aggregate(porTipoPipe),
      AphAtendimento.aggregate(porMaterialPipe),
      AphAtendimento.aggregate(porEncPipe),
      AphAtendimento.aggregate(porLocalPipe),
      AphAtendimento.aggregate(porMesPipe),
      AphAtendimento.aggregate(porTurmaPipe),
      AphAtendimento.aggregate(porTurnoPipe),
      AphAtendimento.aggregate(porRespPipe)
    ]);

    res.json({
      ok: true,
      total,
      filtros: {
        from: req.query.from || null,
        to: req.query.to || null,
        turma: req.query.turma || null,
        turno: req.query.turno || null,
        local: req.query.local || null,
        responsavel: req.query.responsavel || null
      },
      porTipo,
      porMaterial,
      porEncaminhamento,
      porLocal,
      porMes,
      porTurma,
      porTurno,
      porResponsavel
    });
  } catch (err) {
    console.error('APH /estatisticas error:', err);
    res.status(500).json({ ok: false, error: 'Falha ao gerar estatísticas de APH.' });
  }
});

/* ============== GET /api/aph/top-responsaveis ============== */
/**
 * Query params:
 *  - limit (1..100) — padrão 10
 *  - mesmos filtros de /estatisticas (from, to, turma, turno, local, responsavel)
 */
router.get('/top-responsaveis', autenticar, requireTenant, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const { pre, post } = buildMatch(req.query, req);
    const pipe = pipelineBase(req, pre, post, false);

    pipe.push(
      {
        $addFields: {
          responsavelFinal: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$responsavel', ''] } }, 0] },
              '$responsavel',
              { $ifNull: ['$criadoPor', ''] }
            ]
          }
        }
      },
      { $match: { responsavelFinal: { $ne: '' } } },
      { $group: { _id: '$responsavelFinal', total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } },
      { $limit: limit }
    );

    const data = await AphAtendimento.aggregate(pipe);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('APH /top-responsaveis error:', err);
    res.status(500).json({ ok: false, error: 'Falha ao gerar ranking de responsáveis.' });
  }
});

module.exports = router;