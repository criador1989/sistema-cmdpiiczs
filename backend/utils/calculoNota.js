// utils/calculoNota.js
// Cálculo da nota de comportamento com T.S.M.D. por DIAS ÚTEIS.
// Atende às regras solicitadas:
// - Nota inicial: 8,00.
// - Eventos positivos (>0) somam; negativos (<0) subtraem.
// - Soma TODOS os eventos do MESMO DIA em um único valor.
// - Se houver qualquer NEGATIVO no dia, a contagem do TSMD ZERA.
// - TSMD (dias úteis): após 60 DIAS ÚTEIS consecutivos sem penalidade, +0,01 por dia útil excedente.
// - A contagem de dias do TSMD começa ESTRITAMENTE na dataEntrada.
// - Nota sempre limitada ao intervalo [0, 10].
// - Ignora eventos anteriores à dataEntrada (modo estrito).

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

/** Dia útil? (seg..sex) */
function isBusinessDay(d) {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

/** Limita a nota ao intervalo [0, 10] com 2 casas */
function clampNota(n) {
  if (n > 10) return 10;
  if (n < 0) return 0;
  return +Number(n).toFixed(2);
}

/**
 * Calcula nota com TSMD por DIAS ÚTEIS, iniciando na dataEntrada.
 * @param {Date|string} dataEntrada
 * @param {Date|string} dataReferencia  - normalmente "agora"
 * @param {Array<{data?: Date|string, createdAt?: Date|string, valorNumerico: number}>} notificacoes
 * @returns {number} nota final em [0,10] com 2 casas
 */
function calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes = []) {
  let nota = 8.0;

  const end = toDateOnly(dataReferencia || new Date());
  if (!end) return clampNota(nota);

  // Início ESTRITO na data de entrada
  let start = toDateOnly(dataEntrada);
  if (!start) start = end; // sem dataEntrada → intervalo vazio

  // Se o start for depois do end, não há intervalo
  if (isAfter(start, end)) return clampNota(nota);

  // Agrupa eventos por dia a partir da dataEntrada (somando valores) e marca se houve penalidade
  const byDay = new Map(); // key -> { sum, hasNeg }
  for (const n of notificacoes) {
    const raw = n?.data ?? n?.createdAt;
    const dt = toDateOnly(raw);
    if (!dt || isAfter(dt, end)) continue;
    if (dt < start) continue; // ignora eventos antes do início estrito

    const key = keyYYYYMMDD(dt);
    const prev = byDay.get(key) || { sum: 0, hasNeg: false };
    const v = Number(n?.valorNumerico || 0);
    prev.sum += v;
    if (v < 0) prev.hasNeg = true; // qualquer negativo no dia zera sequência de TSMD
    byDay.set(key, prev);
  }

  // Percorre APENAS DIAS ÚTEIS no intervalo [start..end]
  const diasUteis = eachDayOfInterval({ start, end }).filter(isBusinessDay);

  // dias úteis consecutivos sem penalidade desde o último negativo
  let diasSemNeg = 0;

  for (const dia of diasUteis) {
    const k = keyYYYYMMDD(dia);
    const e = byDay.get(k);

    if (e) {
      // Aplica a soma (elogios somam, penalidades subtraem)
      nota = clampNota(nota + e.sum);

      if (e.hasNeg) {
        // Penalidade no dia → zera a sequência
        diasSemNeg = 0;
      } else {
        // Sem penalidade no dia → avança a sequência e aplica TSMD se > 60 dias úteis
        diasSemNeg++;
        if (diasSemNeg > 60 && nota < 10) {
          nota = clampNota(nota + 0.01);
        }
      }
    } else {
      // Dia útil sem evento → só conta para TSMD
      diasSemNeg++;
      if (diasSemNeg > 60 && nota < 10) {
        nota = clampNota(nota + 0.01);
      }
    }
  }

  return clampNota(nota);
}

module.exports = calcularNotaTSMD;
