// backend/routes/api/dashboard-alertas.js
const express = require('express');
const router = express.Router();

const { wrap } = require('../../utils/ttlCache');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

let calcularNotaTSMD;
try { calcularNotaTSMD = require('../../utils/calculoNota'); } catch { calcularNotaTSMD = null; }

// ===== helpers =====
const TTL = 60_000; // 60s
function instKey(inst, suff){ return `${inst}::alertas::${suff}`; }
function inFaixa(n, min, max){ return typeof n === 'number' && n >= min && n <= max; }

/**
 * GET /api/dashboard/alertas
 * Retorna:
 * { regular:[{_id,nome,turma,nota}], insuficiente:[...] }
 * - regular: 5,00–6,99 (encaminhar ao NP)
 * - insuficiente: 3,00–4,99 (informar responsáveis)
 */
router.get('/', async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const cacheKey = instKey(inst, 'v2');
    const data = await wrap(cacheKey, TTL, async () => {
      // 1) Trazer alunos com campos mínimos
      const alunos = await Aluno.find({ instituicao: inst })
        .select('_id nome turma comportamento dataEntrada')
        .lean();

      // 2) Calcular notas faltantes (limitado p/ não pesar)
      const faltantes = alunos.filter(a => typeof a.comportamento !== 'number' || Number.isNaN(a.comportamento));
      if (calcularNotaTSMD && faltantes.length) {
        const limite = Math.min(faltantes.length, 300);
        const faltantesSlice = faltantes.slice(0, limite);

        const ids = faltantesSlice.map(a => a._id);
        const notif = await Notificacao.find({ instituicao: inst, aluno: { $in: ids } })
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
            a.comportamento = 8.0; // fallback leve
          }
        }
      }

      // 3) Filtrar faixas
      const regular = [];
      const insuficiente = [];

      for (const a of alunos) {
        const nota = Number(a.comportamento);
        if (!Number.isFinite(nota)) continue;

        if (inFaixa(nota, 5.00, 6.99)) {
          regular.push({ _id: a._id, nome: a.nome, turma: a.turma, nota: Number(nota.toFixed(2)) });
        } else if (inFaixa(nota, 3.00, 4.99)) {
          insuficiente.push({ _id: a._id, nome: a.nome, turma: a.turma, nota: Number(nota.toFixed(2)) });
        }
      }

      // ordenar por menor nota (prioridade)
      regular.sort((a,b) => a.nota - b.nota);
      insuficiente.sort((a,b) => a.nota - b.nota);

      // limitar tamanho (front leve)
      return {
        regular: regular.slice(0, 120),
        insuficiente: insuficiente.slice(0, 120)
      };
    });

    res.json(data);
  } catch (e) {
    console.error('Erro GET /api/dashboard/alertas:', e);
    res.status(500).json({ message: 'Erro ao carregar alertas' });
  }
});

module.exports = router;
