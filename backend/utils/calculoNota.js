// utils/calculoNota.js
// Calcula a nota de comportamento com TSMD.
// Regras:
// - Nota inicial 8,00.
// - Eventos positivos (>0) somam; negativos (<0) subtraem.
// - Soma TODOS os eventos do MESMO DIA.
// - Se houver qualquer negativo no dia, o contador de TSMD é zerado.
// - TSMD: após 60 DIAS ÚTEIS consecutivos sem negativo, +0,01 por dia útil (máx. 10).
// - >>> POR PADRÃO, inicia no PRIMEIRO EVENTO do aluno (ignora dataEntrada se houver evento anterior).
//
// Assinatura (compatível com uso atual):
// calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes, opts?)
//
// Se quiser forçar o início na data de entrada:
// calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes, { useDataEntradaEstrita: true })

const { eachDayOfInterval, parseISO, isAfter } = require('date-fns');

/** Normaliza para data "seca" (00:00:00.000) */
function toDateOnly(d) {
  if (!d) return null;
  const src = typeof d === 'string' ? parseISO(d) : d;
  if (!src || isNaN(src)) return null;
  const x = new Date(src);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Chave AAAA-MM-DD */
function keyYYYYMMDD(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

/** Retorna true se dia for útil (segunda..sexta) */
function isBusinessDay(d) {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

/**
 * Calcula nota com TSMD.
 * @param {Date|String} dataEntrada
 * @param {Date|String} dataReferencia - normalmente "agora"
 * @param {Array} notificacoes - [{ data?, createdAt?, valorNumerico }]
 * @param {Object} opts
 *   - useDataEntradaEstrita: se true, ignora eventos anteriores à dataEntrada
 */
function calcularNotaTSMD(
  dataEntrada,
  dataReferencia,
  notificacoes = [],
  opts = {}
) {
  const { useDataEntradaEstrita = false } = opts;

  let nota = 8.0;

  const end = toDateOnly(dataReferencia || new Date());
  if (!end) return +nota.toFixed(2);

  // data base padrão = dataEntrada
  let start = toDateOnly(dataEntrada);

  // encontra o PRIMEIRO evento do aluno
  let earliestEvent = null;
  for (const n of notificacoes) {
    const raw = n?.data ?? n?.createdAt;
    const dt = toDateOnly(raw);
    if (!dt) continue;
    if (!earliestEvent || dt < earliestEvent) earliestEvent = dt;
  }

  // Por padrão (useDataEntradaEstrita = false), se existir evento anterior à dataEntrada,
  // iniciamos no PRIMEIRO EVENTO para que nada seja "ignorado".
  if (!useDataEntradaEstrita) {
    if (earliestEvent && (!start || earliestEvent < start)) start = earliestEvent;
  }

  // fallback: se ainda não temos start, usa o próprio end (intervalo vazio → retorna 8.00)
  if (!start) start = end;

  // Se o start for depois do end, não há intervalo a percorrer
  if (isAfter(start, end)) return +nota.toFixed(2);

  // Agrupa eventos por dia (SOMANDO valores) e marca se o dia teve negativo
  const byDay = new Map(); // key -> { sum, hasNeg }
  for (const n of notificacoes) {
    const raw = n?.data ?? n?.createdAt;
    const dt = toDateOnly(raw);
    if (!dt || isAfter(dt, end)) continue;
    if (useDataEntradaEstrita && dt < start) continue; // corta eventos antes do start se estrito

    const key = keyYYYYMMDD(dt);
    const prev = byDay.get(key) || { sum: 0, hasNeg: false };
    const v = Number(n?.valorNumerico || 0);
    prev.sum += v;
    if (v < 0) prev.hasNeg = true;
    byDay.set(key, prev);
  }

  // Percorre dias úteis no intervalo [start..end]
  const dias = eachDayOfInterval({ start, end }).filter(isBusinessDay);
  let diasSemNeg = 0;

  for (const dia of dias) {
    const k = keyYYYYMMDD(dia);
    const e = byDay.get(k);

    if (e) {
      // aplica os eventos do dia (soma total)
      nota += e.sum;
      if (nota > 10) nota = 10;
      if (nota < 0) nota = 0;

      // TSMD: reseta se houve negativo no dia
      if (e.hasNeg) {
        diasSemNeg = 0;
      } else {
        diasSemNeg++;
        if (diasSemNeg > 60 && nota < 10) {
          nota = Math.min(10, +((nota + 0.01).toFixed(2)));
        }
      }
    } else {
      // dia útil sem evento
      diasSemNeg++;
      if (diasSemNeg > 60 && nota < 10) {
        nota = Math.min(10, +((nota + 0.01).toFixed(2)));
      }
    }
  }

  return +nota.toFixed(2);
}

module.exports = calcularNotaTSMD;
