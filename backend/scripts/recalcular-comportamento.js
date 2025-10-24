#!/usr/bin/env node
/**
 * Recalcula a NOTA DE COMPORTAMENTO a partir das Notificações.
 *
 * DRY-RUN por padrão (não grava). Use --apply para persistir.
 *
 * Exemplos:
 * 1) Wilckson, 2025, bimestre 3, gravar em boletim.2025.Comportamento.b3
 *    node scripts/recalcular-comportamento.js \
 *      --nome "Wilckson Fernando da Silva Nascimento" \
 *      --ano 2025 --bim 3 \
 *      --target "boletim.{ano}.Comportamento.b{bim}" \
 *      --apply
 *
 * 2) Todos os alunos, 2025, por intervalo de datas:
 *    node scripts/recalcular-comportamento.js \
 *      --todos --range "2025-08-01,2025-09-30" \
 *      --target "boletim.{ano}.Comportamento.b{bim}" \
 *      --apply
 *
 * 3) Informar RÚBRICA custom (fallback) e limites:
 *    node scripts/recalcular-comportamento.js \
 *      --nome "Wilckson" --ano 2025 --bim 4 \
 *      --rubrica "./configs/rubrica-disciplinar.json" \
 *      --min 0 --max 10 \
 *      --apply
 *
 * 4) Recalcular mediaFinal após atualizar bimestres:
 *    node scripts/recalcular-comportamento.js \
 *      --todos --ano 2025 --recalcularMediaFinal \
 *      --target "boletim.{ano}.Comportamento.b{bim}" \
 *      --targetFinal "boletim.{ano}.Comportamento.mediaFinal" \
 *      --apply
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const mongoose = require('mongoose');

// === Ajuste estes requires conforme sua estrutura ===
const Aluno = require(path.join(process.cwd(), 'models/Aluno'));
const Notificacao = require(path.join(process.cwd(), 'models/Notificacao'));

// Tenta carregar sua função oficial, se existir:
let calcularComportamentoOficial = null;
try {
  const calc = require(path.join(process.cwd(), 'utils/calculoNota'));
  // ajuste o nome abaixo se sua função tiver outro identificador
  calcularComportamentoOficial =
    calc.calcularComportamento || calc.calcularNotaComportamento || null;
} catch (_) { /* ok, usamos fallback */ }

// ------- CLI helpers -------
function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const val = process.argv[i + 1];
  if (!val || val.startsWith('--')) return true; // boolean flag
  return val;
}
const alunoId = getArg('--id');
const nomeRegex = getArg('--nome');           // regex case-insensitive
const todos = !!getArg('--todos');

const ano = getArg('--ano') ? Number(getArg('--ano')) : null;
const bim = getArg('--bim') ? Number(getArg('--bim')) : null; // 1..4
const range = getArg('--range'); // "YYYY-MM-DD,YYYY-MM-DD"
const targetTpl = getArg('--target') || 'boletim.{ano}.Comportamento.b{bim}';
const targetFinalTpl = getArg('--targetFinal') || 'boletim.{ano}.Comportamento.mediaFinal';

const apply = !!getArg('--apply');
const mongoUri = getArg('--uri') || process.env.MONGODB_URI;

// controle de nota (0..10)
const min = getArg('--min') != null ? Number(getArg('--min')) : null;
const max = getArg('--max') != null ? Number(getArg('--max')) : null;

// filtrar notificações por campos opcionais
const categoria = getArg('--categoria');    // ex: "disciplina"
const tipo = getArg('--tipo');              // ex: "atraso", "indisciplina", ...
const status = getArg('--status');          // ex: "confirmada", "ativa", ...

// Rúbrica fallback (JSON)
const rubricaPath = getArg('--rubrica'); // ex: ./configs/rubrica-disciplinar.json

const recalcularMediaFinal = !!getArg('--recalcularMediaFinal');

// ------- Utilidades -------
function parseRange(r) {
  if (!r) return null;
  const [start, end] = r.split(',').map(s => s.trim());
  const s = start ? new Date(start + 'T00:00:00.000Z') : null;
  const e = end ? new Date(end + 'T23:59:59.999Z') : null;
  return { start: s, end: e };
}

function inferirBimestrePorData(date) {
  // ajuste se seu calendário escolar for diferente
  const m = (date.getUTCMonth() + 1);
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

function tpl(str, ctx) {
  return str
    .replace('{ano}', ctx.ano)
    .replace('{bim}', ctx.bim);
}

function clamp(n, lo, hi) {
  if (typeof n !== 'number') return n;
  if (lo != null && n < lo) return lo;
  if (hi != null && n > hi) return hi;
  return n;
}

// ------- Carregar RÚBRICA fallback (opcional) -------
// Estrutura sugerida do JSON:
// {
//   "base": 10,
//   "deducoes": [
//     { "match": { "tipo": "atraso" }, "pontos": -0.2 },
//     { "match": { "tipo": "indisciplina" }, "pontos": -1 },
//     { "match": { "categoria": "disciplina", "severidade": "grave" }, "pontos": -2 }
//   ],
//   "bonus": [
//     { "match": { "tipo": "elogio" }, "pontos": 0.5 }
//   ]
// }
let rubrica = null;
if (rubricaPath) {
  try {
    rubrica = JSON.parse(fs.readFileSync(path.resolve(rubricaPath), 'utf-8'));
  } catch (e) {
    console.error('⚠️ Erro ao ler rúbrica JSON:', e.message);
  }
}

function matchAll(needle, notif) {
  return Object.entries(needle).every(([k, v]) => {
    return (notif[k] === v);
  });
}

function calcularComportamentoPorRubrica(notifs) {
  const base = rubrica?.base ?? 10;
  let nota = base;
  if (Array.isArray(rubrica?.deducoes)) {
    for (const n of notifs) {
      for (const rule of rubrica.deducoes) {
        if (matchAll(rule.match || {}, n)) {
          nota += Number(rule.pontos || 0);
        }
      }
    }
  }
  if (Array.isArray(rubrica?.bonus)) {
    for (const n of notifs) {
      for (const rule of rubrica.bonus) {
        if (matchAll(rule.match || {}, n)) {
          nota += Number(rule.pontos || 0);
        }
      }
    }
  }
  return nota;
}

function normalizarNota(n) {
  let v = n;
  if (typeof v === 'string' && !isNaN(Number(v))) v = Number(v);
  if (typeof v !== 'number') return v;
  v = Number(v.toFixed(2));
  v = clamp(v, min, max);
  return v;
}

(async () => {
  try {
    if (!mongoUri) {
      console.error('❌ Defina MONGODB_URI no .env ou passe --uri.');
      process.exit(1);
    }
    if (!todos && !alunoId && !nomeRegex) {
      console.error('❌ Informe --todos, ou --id, ou --nome "<regex>".');
      process.exit(1);
    }
    // Para gravar por bimestre, precisamos de ano+bim OU um range de datas
    const dateRange = parseRange(range);
    if (!dateRange && (!ano || (!bim && !recalcularMediaFinal))) {
      console.error('❌ Informe --ano e --bim (ou --range "YYYY-MM-DD,YYYY-MM-DD"), ou use --recalcularMediaFinal.');
      process.exit(1);
    }

    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(mongoUri, { autoIndex: false });
    console.log('🟢 Conectado.');

    // Monta filtro de alunos
    let filtroAlunos = {};
    if (alunoId) filtroAlunos._id = alunoId;
    else if (nomeRegex) filtroAlunos.nome = { $regex: new RegExp(nomeRegex, 'i') };

    const alunos = await Aluno.find(todos ? {} : filtroAlunos).lean();
    if (!alunos.length) {
      console.log('⚠️ Nenhum aluno encontrado para o filtro informado.');
      process.exit(0);
    }
    console.log(`👥 ${alunos.length} aluno(s) alvo.`);

    for (const aluno of alunos) {
      console.log('\n────────────────────────────────────────');
      console.log(`🧑 Aluno: ${aluno.nome || aluno.nomeCompleto || aluno._id}`);

      // Filtro das notificações
      const nf = { };
      // Campo de referência do aluno na Notificação:
      // ajuste aqui conforme seu schema: 'aluno', 'alunoId', 'alunoRef', etc.
      nf.aluno = aluno._id;

      // Filtrar por data
      if (dateRange) {
        nf.createdAt = {};
        if (dateRange.start) nf.createdAt.$gte = dateRange.start;
        if (dateRange.end) nf.createdAt.$lte = dateRange.end;
      } else if (ano && bim) {
        // Se vier ano+bim, montamos intervalo padrão por bimestre (ajuste conforme calendário da escola)
        const bimestres = {
          1: [`${ano}-01-01T00:00:00.000Z`, `${ano}-03-31T23:59:59.999Z`],
          2: [`${ano}-04-01T00:00:00.000Z`, `${ano}-06-30T23:59:59.999Z`],
          3: [`${ano}-07-01T00:00:00.000Z`, `${ano}-09-30T23:59:59.999Z`],
          4: [`${ano}-10-01T00:00:00.000Z`, `${ano}-12-31T23:59:59.999Z`],
        };
        const [s, e] = bimestres[bim];
        nf.createdAt = { $gte: new Date(s), $lte: new Date(e) };
      }

      // Filtros opcionais (categoria/tipo/status)
      if (categoria) nf.categoria = categoria;
      if (tipo) nf.tipo = tipo;
      if (status) nf.status = status;

      // Busca notificações
      const notifs = await Notificacao.find(nf).sort({ createdAt: 1 }).lean();

      console.log(`🔎 Notificações encontradas: ${notifs.length}`);
      if (notifs.length) {
        const preview = notifs.slice(0, 5).map(n => ({
          id: n._id,
          data: n.createdAt,
          tipo: n.tipo,
          categoria: n.categoria,
          severidade: n.severidade,
          pontos: n.pontos
        }));
        console.table(preview);
        if (notifs.length > 5) console.log(`... (+${notifs.length - 5} mais)`);
      }

      // === Cálculo da nota ===
      let nota;
      if (calcularComportamentoOficial) {
        // Se sua função oficial requer um shape específico, adapte aqui:
        // Ex.: nota = calcularComportamentoOficial({ aluno, notificacoes: notifs, ano, bimestre: bim });
        nota = calcularComportamentoOficial({ aluno, notificacoes: notifs, ano, bimestre: bim });
      } else {
        if (!rubrica) {
          console.log('ℹ️ Usando fallback padrão (base 10; sem rúbrica explícita).');
          // Fallback mínimo: -1 por "indisciplina grave", -0.2 por "atraso"
          const soft = { base: 10, deducoes: [
            { match: { tipo: 'atraso' }, pontos: -0.2 },
            { match: { severidade: 'leve' }, pontos: -0.3 },
            { match: { severidade: 'moderada' }, pontos: -0.7 },
            { match: { severidade: 'grave' }, pontos: -1.5 },
          ]};
          rubrica = soft;
        }
        nota = calcularComportamentoPorRubrica(
          notifs.map(n => ({
            tipo: n.tipo, categoria: n.categoria,
            severidade: n.severidade, pontos: n.pontos
          }))
        );
      }

      nota = normalizarNota(nota);
      console.log('🧮 Nota calculada (antes de clamp/round):', nota);

      // Para mediaFinal sem bimestre:
      if (recalcularMediaFinal) {
        // Lê b1..b4 existentes do aluno (conforme targetTpl)
        const getPath = (p, obj) => p.split('.').reduce((o,k)=>o?.[k], obj);
        function pathForB(b) {
          const p = tpl(targetTpl, { ano: ano || new Date().getUTCFullYear(), bim: b });
          return p;
        }
        const bVals = [1,2,3,4].map(bx => getPath(pathForB(bx), aluno))
          .filter(v => typeof v === 'number' && !isNaN(v));

        if (bVals.length) {
          const media = Number((bVals.reduce((a,c)=>a+c,0)/bVals.length).toFixed(2));
          const finalPath = tpl(targetFinalTpl, { ano: ano || new Date().getUTCFullYear(), bim: '' });
          console.log(`📊 Recalculando mediaFinal em ${finalPath} = ${media}`);
          if (apply) {
            await Aluno.updateOne({ _id: aluno._id }, { $set: { [finalPath]: clamp(media, min, max) } });
            console.log('✅ mediaFinal atualizada.');
          } else {
            console.log('🧪 Dry-run: mediaFinal NÃO gravada.');
          }
        } else {
          console.log('⚠️ Não há bimestres numéricos para média final.');
        }
        continue; // pula gravação de bimestre quando objetivo é apenas mediaFinal
      }

      // Caminho de gravação do bimestre
      const targetPath = tpl(targetTpl, { ano: ano || new Date().getUTCFullYear(), bim: bim || (notifs[0] ? inferirBimestrePorData(new Date(notifs[0].createdAt)) : 1) });
      console.log('📝 Campo alvo:', targetPath);
      console.log('➡️ Novo valor:', nota);

      if (apply) {
        const res = await Aluno.updateOne({ _id: aluno._id }, { $set: { [targetPath]: nota } });
        if (res.modifiedCount > 0) {
          console.log('✅ Atualizado com sucesso.');
        } else {
          console.log('⚠️ Nenhuma modificação aplicada (valor idêntico?).');
        }
      } else {
        console.log('🧪 Dry-run: nada foi gravado. Use --apply para persistir.');
      }
    }

    console.log('\n🏁 Finalizado.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();
