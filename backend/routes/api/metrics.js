// routes/api/metrics.js
const express = require('express');
const router = express.Router();
const { autenticar } = require('../../middleware/autenticacao');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// tenta carregar modelos opcionais sem quebrar
function tryRequire(p) { try { return require(p); } catch { return null; } }
const ControleNotifA = tryRequire('../../models/ControleNotificacao') || tryRequire('../../models/ControleNotificacoes');
const Mensagem       = tryRequire('../../models/Mensagem');

/**
 * GET /api/metrics/overview
 * Retorna: { alunosCount, notifPend, msgs }
 */
router.get('/overview', autenticar, async (req, res) => {
  const inst = req.usuario.instituicao;

  const alunosCountP = Aluno.countDocuments({ instituicao: inst });

  const notifPendP = (async () => {
    if (ControleNotifA) {
      return ControleNotifA.countDocuments({ instituicao: inst, status: 'pendente' });
    }
    // fallback
    return Notificacao.countDocuments({ instituicao: inst, status: 'pendente' });
  })();

  const msgsP = (async () => {
    if (Mensagem) {
      // ajuste conforme sua regra real de "não lidas"
      return Mensagem.countDocuments({ instituicao: inst, lida: false });
    }
    return 0;
  })();

  try {
    const [alunosCount, notifPend, msgs] = await Promise.all([alunosCountP, notifPendP, msgsP]);
    res.json({ alunosCount, notifPend, msgs });
  } catch (e) {
    console.error('metrics/overview:', e);
    res.json({ alunosCount: 0, notifPend: 0, msgs: 0 });
  }
});

/**
 * GET /api/metrics/atencao?limite=500
 * Lista alunos com comportamento <= 4.99 (rápido, usando campo armazenado).
 */
router.get('/atencao', autenticar, async (req, res) => {
  try {
    const inst = req.usuario.instituicao;
    const limite = Math.min(parseInt(req.query.limite || '200', 10), 1000);

    const alunos = await Aluno.find({
      instituicao: inst,
      comportamento: { $type: 'number', $lte: 4.99 },
    })
      .select('nome turma comportamento')
      .sort({ comportamento: 1 })
      .limit(limite)
      .lean();

    res.json(alunos);
  } catch (e) {
    console.error('metrics/atencao:', e);
    res.json([]);
  }
});

module.exports = router;
