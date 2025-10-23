// utils/calculoNota.js
// Cálculo da nota de comportamento com T.S.M.D. por DIAS ÚTEIS.
//
// Regras implementadas (com suporte a medidas multi-dia):
// - Nota inicial: 8,00.
// - Eventos positivos (>0) somam; negativos (<0) subtraem.
// - Soma TODOS os eventos do MESMO DIA em um único valor (agrupamento por AAAA-MM-DD).
// - Para medidas negativas que se estendem por vários dias (A.E.C.D.E / A.I.A):
//   • O DESCONTO (valorNumerico) incide apenas no dia do registro.
//   • A sequência do TSMD zera em CADA dia útil coberto pela quantidadeDias.
// - TSMD (dias úteis): após 60 DIAS ÚTEIS consecutivos sem penalidade, +0,01 por dia útil excedente.
// - Início estrito em dataEntrada; ignora eventos antes da matrícula e após dataReferencia.
// - Nota limitada a [0, 10] (2 casas). Usa `data` da ocorrência ou `createdAt` como fallback.

const { eachDayOfInterval, parseISO, isAfter, addDays } = require('date-fns');

const PRECISA_DIAS = new Set(['A.E.C.D.E', 'A.I.A']);

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

/** Avança para o próximo dia (calendário civil) */
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
 * Calcula a nota de comportamento com TSMD por DIAS ÚTEIS, considerando
 * retroativos corretamente a partir da data de ocorrência (campo `data`).
 *
 * Aceita (opcionalmente) os campos: quantidadeDias, tipoMedida, natureza.
 *
 * @param {Date|string|null} dataEntrada       - início estrito de contagem (matrícula)
 * @param {Date|string|null} dataReferencia    - normalmente "agora" (limite superior de cálculo)
 * @param {Array<{data?: Date|string, createdAt?: Date|string, valorNumerico: number, quantidadeDias?: number, tipoMedida?: string, natureza?: string}>} notificacoes
 * @returns {number} nota final (2 casas) em [0, 10]
 */
function calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes = []) {
  let nota = 8.0;

  const end = toDateOnly(dataReferencia || new Date());
  if (!end) return clampNota(nota);

  let start = toDateOnly(dataEntrada);
  if (!start) start = new Date(2000, 0, 1);
  if (isAfter(start, end)) return clampNota(nota);

  // 1) Pré-processamento: somas por dia e marcação de dias "com penalidade" (para TSMD)
  //    - sumByDay: soma de valores do dia (elogios somam, penalidades subtraem)
  //    - penalizeDay: Set com todos os DIAS ÚTEIS que devem zerar a sequência (inclui a faixa de dias de AECDE/AIA)
  const sumByDay = new Map(); // key -> sum (number)
  const penalizeDay = new Set(); // keys AAAA-MM-DD de dias úteis que zeram TSMD

  for (const n of notificacoes) {
    const raw = n?.data ?? n?.createdAt;
    const dt = toDateOnly(raw);
    if (!dt) continue;
    if (dt < start) continue;
    if (isAfter(dt, end)) continue;

    const key = keyYYYYMMDD(dt);
    const v = Number(n?.valorNumerico || 0);
    sumByDay.set(key, (sumByDay.get(key) || 0) + v);

    // Apenas medidas negativas disparam "zerar sequência"
    const isNeg = v < 0 || (n?.natureza === 'indisciplina' && v <= 0);
    const tipo = n?.tipoMedida || '';
    const precisaDias = PRECISA_DIAS.has(tipo);

    if (isNeg) {
      // Sempre zera no dia do registro
      if (isBusinessDay(dt)) penalizeDay.add(key);

      // Se for medida multi-dia, zera também nos próximos dias ÚTEIS dentro da janela
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

  // 2) Itera apenas pelos DIAS ÚTEIS no intervalo [start..end], aplicando:
  //    - somas do dia (uma única vez, já agrupadas)
  //    - regra de zerar sequência se dia ∈ penalizeDay
  const diasUteis = eachDayOfInterval({ start, end }).filter(isBusinessDay);

  let diasSemNeg = 0;
  for (const dia of diasUteis) {
    const k = keyYYYYMMDD(dia);

    // Aplica a soma do dia (elogios/penalidades)
    const sum = sumByDay.get(k);
    if (typeof sum === 'number' && sum !== 0) {
      nota = clampNota(nota + sum);
    }

    // Zerar sequência se esse dia for "penalizado"
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
