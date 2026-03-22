// utils/calculoNota.js
// Cálculo da nota de comportamento com T.S.M.D. por DIAS ÚTEIS.
//
// Regras implementadas:
// - Nota inicial: 8,00.
// - Eventos positivos (>0) somam; negativos (<0) subtraem.
// - Soma TODOS os eventos do MESMO DIA em um único valor.
// - Para medidas negativas multi-dia (A.E.C.D.E / A.I.A):
//   • O desconto (valorNumerico) incide apenas no dia do registro.
//   • A sequência do TSMD zera em CADA dia útil coberto pela quantidadeDias.
// - TSMD (dias úteis): após 60 DIAS ÚTEIS consecutivos sem penalidade, +0,01 por dia útil excedente.
// - Início estrito em dataEntrada; ignora eventos antes da matrícula e após dataReferencia.
// - Nota limitada a [0, 10] com 2 casas.
// - Usa `data` da ocorrência ou `createdAt` como fallback.

const { eachDayOfInterval, parseISO, isAfter } = require('date-fns');

const PRECISA_DIAS = new Set(['a.e.c.d.e', 'a.i.a']);

/** Normaliza texto para comparação segura */
function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Normaliza para data local "seca" (00:00:00.000) */
function toDateOnly(d) {
  if (!d) return null;

  let src = d;

  if (typeof d === 'string') {
    src = parseISO(d);
  }

  if (!src || isNaN(src)) return null;

  const x = new Date(src);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Chave local AAAA-MM-DD sem depender de UTC */
function keyYYYYMMDD(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);

  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
}

/** Dia útil? (seg..sex) */
function isBusinessDay(d) {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

/** Avança para o próximo dia civil */
function nextDay(d) {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Limita a nota ao intervalo [0, 10] com 2 casas */
function clampNota(n) {
  if (n > 10) return 10;
  if (n < 0) return 0;
  return +Number(n).toFixed(2);
}

function clampIntMin1(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Calcula a nota de comportamento com TSMD por dias úteis.
 *
 * @param {Date|string|null} dataEntrada
 * @param {Date|string|null} dataReferencia
 * @param {Array<{
 *   data?: Date|string,
 *   createdAt?: Date|string,
 *   valorNumerico?: number,
 *   quantidadeDias?: number,
 *   tipoMedida?: string,
 *   natureza?: string
 * }>} notificacoes
 * @returns {number}
 */
function calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes = []) {
  let nota = 8.0;

  const end = toDateOnly(dataReferencia || new Date());
  if (!end) return clampNota(nota);

  let start = toDateOnly(dataEntrada);
  if (!start) start = new Date(2000, 0, 1);

  if (isAfter(start, end)) {
    return clampNota(nota);
  }

  // sumByDay: soma de descontos/elogios do dia civil
  // penalizeDay: dias úteis que zeram sequência do TSMD
  const sumByDay = new Map();
  const penalizeDay = new Set();

  for (const n of notificacoes) {
    const raw = n?.data ?? n?.createdAt;
    const dt = toDateOnly(raw);

    if (!dt) continue;
    if (dt < start) continue;
    if (isAfter(dt, end)) continue;

    const key = keyYYYYMMDD(dt);
    const valor = Number(n?.valorNumerico || 0);

    // Aplica desconto/elogio apenas no dia do registro
    sumByDay.set(key, (sumByDay.get(key) || 0) + valor);

    const natureza = normalizeText(n?.natureza);
    const tipoMedida = normalizeText(n?.tipoMedida);
    const isNeg = valor < 0 || (natureza === 'indisciplina' && valor <= 0);
    const precisaDias = PRECISA_DIAS.has(tipoMedida);

    if (isNeg) {
      // O próprio dia zera sequência se for útil
      if (isBusinessDay(dt)) {
        penalizeDay.add(key);
      }

      // Multi-dia: zera cada dia útil coberto
      if (precisaDias) {
        const dias = clampIntMin1(n?.quantidadeDias ?? 1);
        let cursor = new Date(dt);

        for (let i = 1; i < dias; i++) {
          cursor = nextDay(cursor);

          if (cursor > end) break;
          if (cursor < start) continue;

          if (isBusinessDay(cursor)) {
            penalizeDay.add(keyYYYYMMDD(cursor));
          }
        }
      }
    }
  }

  // Itera todos os dias civis; TSMD só conta em dias úteis
  const dias = eachDayOfInterval({ start, end });
  let diasSemNeg = 0;

  for (const dia of dias) {
    const k = keyYYYYMMDD(dia);

    // Valor do dia entra sempre no dia do registro
    const sum = sumByDay.get(k);
    if (typeof sum === 'number' && sum !== 0) {
      nota = clampNota(nota + sum);
    }

    // TSMD só opera em dia útil
    if (!isBusinessDay(dia)) {
      continue;
    }

    if (penalizeDay.has(k)) {
      diasSemNeg = 0;
    } else {
      diasSemNeg++;
      if (diasSemNeg > 60 && nota < 10) {
        nota = clampNota(nota + 0.01);
      }
    }
  }

  return clampNota(nota);
}

module.exports = calcularNotaTSMD;