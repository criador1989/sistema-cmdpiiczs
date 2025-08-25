// routes/api/dashboard-fast.js
const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
let Observacao;
try { Observacao = require('../../models/Observacao'); } catch { /* opcional */ }

const { wrap } = require('../../utils/ttlCache');

// helper(s)
function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
function instKey(inst, suffix) {
  return `${inst}::${suffix}`;
}

/**
 * GET /api/dashboard-fast/summary
 * - alunosAtivos
 * - notifTotal
 * - notif7d
 * - obs7d (se o model existir)
 * - porTurma: [{ turma, qtd }]
 */
router.get('/summary', async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const cacheKey = instKey(inst, 'summary-v1');

    const data = await wrap(cacheKey, 60_000, async () => {
      const baseInst = { instituicao: inst };

      const [alunosAtivos, notifTotal, notif7d, obs7d, porTurmaAgg] = await Promise.all([
        Aluno.countDocuments(baseInst),

        Notificacao.countDocuments(baseInst),

        Notificacao.countDocuments({
          ...baseInst,
          $or: [{ data: { $gte: sevenDaysAgo() } }, { createdAt: { $gte: sevenDaysAgo() } }]
        }),

        Observacao
          ? Observacao.countDocuments({ ...baseInst, createdAt: { $gte: sevenDaysAgo() } }).catch(() => 0)
          : 0,

        Aluno.aggregate([
          { $match: baseInst },
          { $group: { _id: '$turma', qtd: { $sum: 1 } } },
          { $sort: { qtd: -1 } },
          { $limit: 30 }
        ])
      ]);

      return {
        alunosAtivos,
        notifTotal,
        notif7d,
        obs7d,
        porTurma: porTurmaAgg.map(t => ({ turma: t._id, qtd: t.qtd }))
      };
    });

    res.json(data);
  } catch (e) {
    console.error('Erro /dashboard-fast/summary:', e);
    res.status(500).json({ message: 'Erro no resumo do painel' });
  }
});

/**
 * GET /api/dashboard-fast/series?days=30
 * Série diária de notificações nos últimos N dias (default 30, máx 120)
 */
router.get('/series', async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 120);

    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    const cacheKey = instKey(inst, `series-${days}-v1`);

    const out = await wrap(cacheKey, 60_000, async () => {
      const rows = await Notificacao.aggregate([
        {
          $match: {
            instituicao: inst,
            $or: [{ data: { $gte: from } }, { createdAt: { $gte: from } }]
          }
        },
        {
          $addFields: {
            dia: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $ifNull: ['$data', '$createdAt'] }
              }
            }
          }
        },
        { $group: { _id: '$dia', qtd: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);

      const map = new Map(rows.map(r => [r._id, r.qtd]));
      const series = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        series.push({ dia: key, notificacoes: map.get(key) || 0 });
      }
      return series;
    });

    res.json(out);
  } catch (e) {
    console.error('Erro /dashboard-fast/series:', e);
    res.status(500).json({ message: 'Erro na série do painel' });
  }
});

module.exports = router;
