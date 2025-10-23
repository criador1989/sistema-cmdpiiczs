// backend/routes/api/notificacoes.metrics.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

// ===== Helpers =====
function parseDateAny(s, end = false) {
  if (!s) return null;
  if (s.includes('/')) { // dd/mm/aaaa
    const [d, m, y] = s.split('/').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  }
  if (s.includes('-')) { // aaaa-mm-dd
    const [y, m, d] = s.split('-').map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  }
  return null;
}
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }
function toISODate(d){ return new Date(d).toISOString().slice(0,10); }
function daysBetween(from, to) {
  const out = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur <= end) { out.push(toISODate(cur)); cur.setDate(cur.getDate()+1); }
  return out;
}

// GET /api/notificacoes/metrics?from=2025-10-01&to=2025-10-31&somenteNaoLidas=true
router.get('/metrics', autenticar, async (req, res) => {
  try {
    // instituição: query > usuário logado
    let instituicaoId = req.query.instituicao || req.usuario?.instituicao;
    let instituicao = null;
    if (instituicaoId && mongoose.Types.ObjectId.isValid(instituicaoId)) {
      instituicao = new mongoose.Types.ObjectId(instituicaoId);
    }

    // datas (padrão: últimos 30 dias)
    const now = new Date();
    const defFrom = new Date(now.getTime() - 29*24*3600*1000);
    const from = parseDateAny(req.query.from) || startOfDay(defFrom);
    const to   = parseDateAny(req.query.to, true) || endOfDay(now);

    // filtro principal
    const match = {
      ativo: true,
      arquivada: false,
      data: { $gte: startOfDay(from), $lte: endOfDay(to) },
    };
    if (instituicao) match.instituicao = instituicao;

    const onlyUnread = String(req.query.somenteNaoLidas || req.query.onlyUnread || '').toLowerCase();
    if (onlyUnread === 'true' || onlyUnread === '1') {
      match.lida = false;
    }

    // 1) KPIs gerais
    const [kpisRaw] = await Notificacao.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total:        { $sum: 1 },
          indisciplina: { $sum: { $cond: [{ $eq: ['$natureza','indisciplina'] }, 1, 0] } },
          elogio:       { $sum: { $cond: [{ $eq: ['$natureza','elogio'] }, 1, 0] } },
          entregues:    { $sum: { $cond: ['$entregue', 1, 0] } },
          devolvidas:   { $sum: { $cond: ['$devolvidoPeloAluno', 1, 0] } },
        }
      }
    ]);
    const kpis = kpisRaw || { total:0, indisciplina:0, elogio:0, entregues:0, devolvidas:0 };

    // 2) Série temporal por dia (total e por natureza)
    const grouped = await Notificacao.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$data' } },
            natureza: '$natureza'
          },
          n: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.day',
          porNatureza: { $push: { k: '$_id.natureza', v: '$n' } },
          total: { $sum: '$n' }
        }
      },
      {
        $project: {
          _id: 0,
          day: '$_id',
          total: 1,
          indisciplina: {
            $let: {
              vars: { found: { $arrayElemAt: [ { $filter: { input: '$porNatureza', as: 'p', cond: { $eq: ['$$p.k', 'indisciplina'] } } }, 0 ] } },
              in: { $ifNull: ['$$found.v', 0] }
            }
          },
          elogio: {
            $let: {
              vars: { found: { $arrayElemAt: [ { $filter: { input: '$porNatureza', as: 'p', cond: { $eq: ['$$p.k', 'elogio'] } } }, 0 ] } },
              in: { $ifNull: ['$$found.v', 0] }
            }
          }
        }
      },
      { $sort: { day: 1 } }
    ]);

    // preenche dias faltantes com 0
    const byDay = new Map(grouped.map(d => [d.day, d]));
    const fullDays = daysBetween(from, to).map(day => ({
      day,
      total: byDay.get(day)?.total || 0,
      indisciplina: byDay.get(day)?.indisciplina || 0,
      elogio: byDay.get(day)?.elogio || 0,
    }));

    // 3) Top 10 motivos (ranking)
    const topMotivos = await Notificacao.aggregate([
      { $match: match },
      { $group: { _id: '$motivo', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, motivo: '$_id', n: 1 } }
    ]);

    // 4) Distribuição por tipoMedida
    const porTipoMedida = await Notificacao.aggregate([
      { $match: match },
      { $group: { _id: '$tipoMedida', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $project: { _id: 0, tipoMedida: '$_id', n: 1 } }
    ]);

    // 5) Funil de devolução
    const [funnelRaw] = await Notificacao.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          geradas:   { $sum: 1 },
          entregues: { $sum: { $cond: ['$entregue', 1, 0] } },
          devolvidas:{ $sum: { $cond: ['$devolvidoPeloAluno', 1, 0] } },
        }
      },
      { $project: { _id: 0 } }
    ]);
    const funnel = funnelRaw || { geradas:0, entregues:0, devolvidas:0 };

    res.json({
      range: { from, to },
      kpis,
      timeSeries: fullDays,
      topMotivos,
      porTipoMedida,
      funnel
    });
  } catch (err) {
    console.error('notificacoes/metrics:', err);
    res.status(500).json({ error: 'Erro ao gerar métricas', details: String(err) });
  }
});

module.exports = router;
