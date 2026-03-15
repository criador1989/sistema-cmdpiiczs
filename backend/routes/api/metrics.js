// routes/api/metrics.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// Mensagens é opcional; tratamos ausência com 0.
let Mensagem = null;
try { Mensagem = require('../../models/Mensagem'); } catch { /* ok sem mensagens */ }

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
// -> usado em painel.html (mAlunos, mNotif, mMsgs)
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
        {
          status: { $in: ['pendente', 'revisao_solicitada'] }
        }
      ]
    };

    const filtroMsgs = {
      $and: [
        buildInstMatch(inst),
        { lida: false }
      ]
    };

    const [alunosCount, notifPend, msgs] = await Promise.all([
      Aluno.countDocuments(filtroAlunos),

      Notificacao.countDocuments(filtroNotifPend),

      Mensagem && Mensagem.countDocuments
        ? Mensagem.countDocuments(filtroMsgs)
        : 0
    ]);

    res.json({ alunosCount, notifPend, msgs });
  } catch (e) {
    console.error('metrics/overview:', e);
    res.status(500).json({ alunosCount: 0, notifPend: 0, msgs: 0 });
  }
});

module.exports = router;