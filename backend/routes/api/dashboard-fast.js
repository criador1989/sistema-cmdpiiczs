// backend/routes/api/dashboard-fast.js
'use strict';
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Aluno = mongoose.model('Aluno');
const Notificacao = mongoose.model('Notificacao');

function instMatch(inst) {
  if (!inst) return {};
  const or = [{ instituicao: String(inst) }];
  if (mongoose.isValidObjectId(inst)) or.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  // também aceita registros sem campo (compat)
  or.push({ instituicao: { $exists: false } }, { instituicao: null });
  return { $or: or };
}

router.get('/summary', async (req, res) => {
  try {
    const inst = req.usuario?.instituicao || req.user?.instituicao || req.auth?.instituicao || null;
    const im = instMatch(inst);

    const [alunosAtivos, notifTotal, mediaAgg, pendAgg] = await Promise.all([
      Aluno.countDocuments({ ativo: true, ...im }),
      Notificacao.countDocuments({ ...im }),
      Aluno.aggregate([
        { $match: { ativo: true, ...(inst ? instMatch(inst) : {}) } },
        { $group: { _id: null, m: { $avg: { $ifNull: ['$comportamento', 0] } } } }
      ]),
      Notificacao.countDocuments({
  ...im,
  status: 'deferido',
  entregue: true,
  devolvidoPeloAluno: { $ne: true },
  arquivada: { $ne: true },
  ativo: { $ne: false },
  prazoDevolucao: { $ne: null, $lt: new Date() }
})
    ]);

    const comportamentoMedio = Number(((mediaAgg?.[0]?.m) || 0).toFixed(2));

    res.json({
      alunosAtivos,
      notifTotal,
      comportamentoMedio,
      devolucoesAtrasadas: pendAgg
    });
  } catch (e) {
    console.error('Erro /dashboard-fast/summary:', e);
    res.status(500).json({ error: 'Erro ao gerar resumo rápido' });
  }
});

module.exports = router;
