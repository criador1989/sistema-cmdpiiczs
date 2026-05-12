// utils/calculoNota.js
// Cálculo da nota de comportamento com T.S.M.D. por DIAS ÚTEIS.
//
// Agora configurável por instituição:
// - nota inicial configurável
// - TSMD configurável (ativo, dias, incremento, limite)
// - mantém compatibilidade com a lógica atual
//
// Regras preservadas:
// - Eventos positivos (>0) somam; negativos (<0) subtraem.
// - Soma TODOS os eventos do MESMO DIA em um único valor.
// - Para medidas negativas multi-dia (A.E.C.D.E / A.I.A):
//   • O desconto (valorNumerico) incide apenas no dia do registro.
//   • A sequência do TSMD zera em CADA dia útil coberto pela quantidadeDias.
// - Início estrito em dataEntrada; ignora eventos antes da matrícula e após dataReferencia.
// - Nota limitada ao intervalo configurado do TSMD (normalmente 10) e piso 0.
// - Usa `data` da ocorrência ou `createdAt` como fallback.

const { eachDayOfInterval, parseISO, isAfter } = require('date-fns');
const { CONFIG_PADRAO_CBMAC } = require('./configuracaoDisciplinar');

const PRECISA_DIAS = new Set(['a.e.c.d.e', 'a.i.a']);

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

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

function keyYYYYMMDD(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);

  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
}

function isBusinessDay(d) {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

function nextDay(d) {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function clampIntMin1(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getSafeConfig(config) {
  const base = CONFIG_PADRAO_CBMAC || {};

  const notaInicial = toFiniteNumber(
    config?.comportamento?.notaInicial,
    toFiniteNumber(base?.comportamento?.notaInicial, 8.0)
  );

  const tsmdAtivo =
    typeof config?.tsmd?.ativo === 'boolean'
      ? config.tsmd.ativo
      : (typeof base?.tsmd?.ativo === 'boolean' ? base.tsmd.ativo : true);

  const diasParaIniciar = Math.max(
    0,
    toFiniteNumber(config?.tsmd?.diasParaIniciar, toFiniteNumber(base?.tsmd?.diasParaIniciar, 60))
  );

  const incrementoPorDia = toFiniteNumber(
    config?.tsmd?.incrementoPorDia,
    toFiniteNumber(base?.tsmd?.incrementoPorDia, 0.01)
  );

  const limiteMaximo = toFiniteNumber(
    config?.tsmd?.limiteMaximo,
    toFiniteNumber(base?.tsmd?.limiteMaximo, 10)
  );

  return {
    comportamento: {
      notaInicial,
    },
    tsmd: {
      ativo: tsmdAtivo,
      diasParaIniciar,
      incrementoPorDia,
      limiteMaximo,
    },
  };
}

function clampNota(n, limiteMaximo = 10) {
  const max = Number.isFinite(Number(limiteMaximo)) ? Number(limiteMaximo) : 10;
  const valor = Number(n);

  if (!Number.isFinite(valor)) return 0;
  if (valor > max) return +Number(max).toFixed(2);

  // Permite nota negativa
  return +Number(valor).toFixed(2);
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
 * @param {Object} [config]
 * @returns {number}
 */
function calcularNotaTSMD(dataEntrada, dataReferencia, notificacoes = [], config = null) {
  const cfg = getSafeConfig(config);
  let nota = cfg.comportamento.notaInicial;

  const end = toDateOnly(dataReferencia || new Date());
  if (!end) return clampNota(nota, cfg.tsmd.limiteMaximo);

  let start = toDateOnly(dataEntrada);
  if (!start) start = new Date(2000, 0, 1);

  if (isAfter(start, end)) {
    return clampNota(nota, cfg.tsmd.limiteMaximo);
  }

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

    sumByDay.set(key, (sumByDay.get(key) || 0) + valor);

    const natureza = normalizeText(n?.natureza);
    const tipoMedida = normalizeText(n?.tipoMedida);
    const isNeg = valor < 0 || (natureza === 'indisciplina' && valor <= 0);
    const precisaDias = PRECISA_DIAS.has(tipoMedida);

    if (isNeg) {
      if (isBusinessDay(dt)) {
        penalizeDay.add(key);
      }

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

  const dias = eachDayOfInterval({ start, end });
  let diasSemNeg = 0;

  for (const dia of dias) {
    const k = keyYYYYMMDD(dia);

    const sum = sumByDay.get(k);
    if (typeof sum === 'number' && sum !== 0) {
      nota = clampNota(nota + sum, cfg.tsmd.limiteMaximo);
    }

    if (!isBusinessDay(dia)) {
      continue;
    }

    if (penalizeDay.has(k)) {
      diasSemNeg = 0;
    } else {
      diasSemNeg++;

      if (
        cfg.tsmd.ativo &&
        diasSemNeg > cfg.tsmd.diasParaIniciar &&
        nota < cfg.tsmd.limiteMaximo
      ) {
        nota = clampNota(nota + cfg.tsmd.incrementoPorDia, cfg.tsmd.limiteMaximo);
      }
    }
  }

  return clampNota(nota, cfg.tsmd.limiteMaximo);
}

module.exports = calcularNotaTSMD;