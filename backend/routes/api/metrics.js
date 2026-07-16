// routes/api/metrics.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

/** Match estrito por instituição (SEM misturar registros sem instituição) */
function buildInstMatch(inst) {
  if (!inst) return { _id: null };

  if (mongoose.isValidObjectId(inst)) {
    return {
      $or: [
        { instituicao: String(inst) },
        { instituicao: new mongoose.Types.ObjectId(inst) }
      ]
    };
  }

  return { instituicao: String(inst) };
}

/** Match estrito para Aluno por instituição */
function buildAlunoMatch(inst) {
  if (!inst) return { _id: null };

  if (mongoose.isValidObjectId(inst)) {
    return {
      $or: [
        { instituicao: String(inst) },
        { instituicao: new mongoose.Types.ObjectId(inst) }
      ]
    };
  }

  return { instituicao: String(inst) };
}

// GET /api/metrics/overview
// -> usado no painel principal (alunos ativos e notificações pendentes)
router.get('/overview', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;

    const filtroAlunos = {
      $and: [
        buildAlunoMatch(inst),
        {
          $or: [
            { ativo: true },
            { ativo: { $exists: false } }
          ]
        }
      ]
    };

    const filtroNotifPend = {
      $and: [
        buildInstMatch(inst),
        { status: { $in: ['pendente', 'revisao_solicitada'] } }
      ]
    };

    const [alunosCount, notifPend] = await Promise.all([
      Aluno.countDocuments(filtroAlunos),
      Notificacao.countDocuments(filtroNotifPend)
    ]);

    res.json({ alunosCount, notifPend });
  } catch (e) {
    console.error('metrics/overview:', e);
    res.status(500).json({ alunosCount: 0, notifPend: 0 });
  }
});

module.exports = router;
