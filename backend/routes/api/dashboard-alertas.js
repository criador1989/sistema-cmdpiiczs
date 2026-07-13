// backend/routes/api/dashboard-alertas.js
const express = require('express');
const router = express.Router();

const { wrap } = require('../../utils/ttlCache');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

let calcularNotaTSMD;
try {
  calcularNotaTSMD = require('../../utils/calculoNota');
} catch {
  calcularNotaTSMD = null;
}

// ===== helpers =====
const TTL = 60_000; // 60s

function instKey(inst, suff) {
  return `${inst}::alertas::${suff}`;
}

function inFaixa(n, min, max) {
  return typeof n === 'number' && n >= min && n <= max;
}

/**
 * GET /api/dashboard/alertas
 * Retorna:
 * {
 *   regular: [{ _id, nome, turma, nota }],
 *   insuficiente: [{ _id, nome, turma, nota }],
 *   incompativel: [{ _id, nome, turma, nota }]
 * }
 *
 * - regular: 5,00–6,99
 * - insuficiente: 3,00–4,99
 * - incompatível: 0,00–2,99
 */
router.get('/', async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;

    if (!inst) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const cacheKey = instKey(inst, 'v3');

    const data = await wrap(cacheKey, TTL, async () => {
      const alunos = await Aluno.find({ instituicao: inst })
        .select('_id nome turma comportamento dataEntrada')
        .lean();

      const faltantes = alunos.filter(
        (a) => typeof a.comportamento !== 'number' || Number.isNaN(a.comportamento)
      );

      if (calcularNotaTSMD && faltantes.length) {
        const limite = Math.min(faltantes.length, 300);
        const faltantesSlice = faltantes.slice(0, limite);

        const ids = faltantesSlice.map((a) => a._id);

        const notif = await Notificacao.find({
          instituicao: inst,
          aluno: { $in: ids },
        })
          .select('aluno data valorNumerico createdAt')
          .sort({ aluno: 1, data: 1, createdAt: 1 })
          .lean();

        const porAluno = new Map();

        for (const n of notif) {
          const k = String(n.aluno);
          if (!porAluno.has(k)) porAluno.set(k, []);
          porAluno.get(k).push(n);
        }

        for (const a of faltantesSlice) {
          try {
            const lista = porAluno.get(String(a._id)) || [];
            const nota = calcularNotaTSMD(a.dataEntrada, new Date(), lista);
            a.comportamento = nota;
          } catch {
            a.comportamento = 8.0;
          }
        }
      }

      const regular = [];
      const insuficiente = [];
      const incompativel = [];

      for (const a of alunos) {
        const nota = Number(a.comportamento);

        if (!Number.isFinite(nota)) continue;

        const item = {
          _id: a._id,
          nome: a.nome,
          turma: a.turma,
          nota: Number(nota.toFixed(2)),
        };

        if (inFaixa(nota, 5.0, 6.99)) {
          regular.push(item);
        } else if (inFaixa(nota, 3.0, 4.99)) {
          insuficiente.push(item);
        } else if (inFaixa(nota, 0.0, 2.99)) {
          incompativel.push(item);
        }
      }

      regular.sort((a, b) => a.nota - b.nota);
      insuficiente.sort((a, b) => a.nota - b.nota);
      incompativel.sort((a, b) => a.nota - b.nota);

      return {
        regular: regular.slice(0, 120),
        insuficiente: insuficiente.slice(0, 120),
        incompativel: incompativel.slice(0, 120),
      };
    });

    return res.json(data);
  } catch (e) {
    console.error('Erro GET /api/dashboard/alertas:', e);
    return res.status(500).json({ message: 'Erro ao carregar alertas' });
  }
});

module.exports = router;