// routes/api/metrics.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// Mensagens é opcional; tratamos ausência com 0.
let Mensagem = null;
try { Mensagem = require('../../models/Mensagem'); } catch { /* ok sem mensagens */ }

/** Match amplo para campo instituicao (aceita ObjectId, string, ausente e null) */
function buildInstMatch(inst) {
  const ors = [{ instituicao: { $exists: false } }, { instituicao: null }];
  if (!inst) return { $or: ors };
  ors.push({ instituicao: String(inst) });
  if (mongoose.isValidObjectId(inst)) {
    ors.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  }
  return { $or: ors };
}

/** Match para Aluno por instituicao (string OU ObjectId) */
function buildAlunoMatch(inst) {
  const ors = [{ instituicao: { $exists: false } }, { instituicao: null }];
  if (inst) {
    ors.push({ instituicao: String(inst) });
    if (mongoose.isValidObjectId(inst)) ors.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  }
  return { $or: ors };
}

// GET /api/metrics/overview
// -> usado em painel.html (mAlunos, mNotif, mMsgs)
router.get('/overview', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;

    const [alunosCount, notifPend, msgs] = await Promise.all([
      // alunos ativos da instituição (tolerando bases antigas sem "ativo")
      Aluno.countDocuments({ ...buildAlunoMatch(inst), $or: [{ ativo: true }, { ativo: { $exists: false } }] }),

      // ✔️ pendências como no Controle de Notificações:
      // status em "pendente" OU "revisao_solicitada"
      Notificacao.countDocuments({ ...buildInstMatch(inst), status: { $in: ['pendente', 'revisao_solicitada'] } }),

      // mensagens não lidas (se existir o model)
      Mensagem && Mensagem.countDocuments
        ? Mensagem.countDocuments({ ...buildInstMatch(inst), lida: false })
        : 0
    ]);

    res.json({ alunosCount, notifPend, msgs });
  } catch (e) {
    console.error('metrics/overview:', e);
    res.status(500).json({ alunosCount: 0, notifPend: 0, msgs: 0 });
  }
});

module.exports = router;
