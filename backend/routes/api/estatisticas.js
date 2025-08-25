// routes/api/estatisticas.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');

/**
 * GET /api/estatisticas/comportamento-por-turma
 * Média simples usando o campo armazenado em Aluno.comportamento (barato).
 */
router.get('/comportamento-por-turma', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const data = await Aluno.aggregate([
      { $match: { instituicao: inst, comportamento: { $type: 'number' } } },
      { $group: { _id: '$turma', media: { $avg: '$comportamento' } } },
      { $project: { _id: 0, turma: '$_id', media: { $round: ['$media', 2] } } },
      { $sort: { turma: 1 } },
    ]);
    res.json(data);
  } catch (e) {
    console.error('comportamento-por-turma:', e);
    res.json([]);
  }
});

/**
 * GET /api/estatisticas/distribuicao
 * Contagem por faixas (mesmas do painel).
 */
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
