'use strict';

/**
 * Utilitário central para datas de calendário (date-only) no Axoriin.
 *
 * REGRA DE OURO:
 * - Data de calendário deve trafegar como string YYYY-MM-DD.
 * - Date do JavaScript deve ser usado somente para instantes reais no tempo.
 *
 * Este arquivo evita o erro clássico de "voltar um dia" causado por:
 *   new Date('2025-01-01')
 *   date.toISOString().slice(0, 10)
 * quando o usuário/instituição está em fuso anterior ao UTC.
 *
 * Não usa dependências externas.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const UF_TIMEZONE = Object.freeze({
  AC: 'America/Rio_Branco',
  AM: 'America/Manaus',
  RO: 'America/Porto_Velho',
  RR: 'America/Boa_Vista',
  MT: 'America/Cuiaba',
  MS: 'America/Campo_Grande',
  PA: 'America/Belem',
  AP: 'America/Belem',
  MA: 'America/Fortaleza',
  PI: 'America/Fortaleza',
  CE: 'America/Fortaleza',
  RN: 'America/Fortaleza',
  PB: 'America/Fortaleza',
  PE: 'America/Recife',
  AL: 'America/Maceio',
  SE: 'America/Maceio',
  BA: 'America/Bahia',
  TO: 'America/Araguaina',
  GO: 'America/Sao_Paulo',
  DF: 'America/Sao_Paulo',
  MG: 'America/Sao_Paulo',
  ES: 'America/Sao_Paulo',
  RJ: 'America/Sao_Paulo',
  SP: 'America/Sao_Paulo',
  PR: 'America/Sao_Paulo',
  SC: 'America/Sao_Paulo',
  RS: 'America/Sao_Paulo',
});

function timezonePorUF(uf, fallback = 'America/Rio_Branco') {
  const sigla = String(uf || '').trim().toUpperCase();
  return UF_TIMEZONE[sigla] || fallback;
}

function isDateOnly(value) {
  return DATE_ONLY_RE.test(String(value || '').trim());
}

function assertDateOnly(value, fieldName = 'data') {
  const s = String(value || '').trim();
  if (!DATE_ONLY_RE.test(s)) {
    throw new Error(`${fieldName} deve estar no formato YYYY-MM-DD.`);
  }
  const [y, m, d] = s.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  const ok = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  if (!ok) throw new Error(`${fieldName} inválida: ${s}.`);
  return s;
}

function parseDateOnly(value, fieldName = 'data') {
  const s = assertDateOnly(value, fieldName);
  const [year, month, day] = s.split('-').map(Number);
  return { year, month, day, iso: s };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateOnlyString(year, month, day) {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

function getPartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }

  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const p = getPartsInTimeZone(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getUTCMilliseconds());
  return asUTC - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  let offset = getTimeZoneOffsetMs(guess, timeZone);
  let utc = new Date(guess.getTime() - offset);

  // Segunda passada para cobrir mudanças de offset/DST, caso existam.
  const offset2 = getTimeZoneOffsetMs(utc, timeZone);
  if (offset2 !== offset) {
    utc = new Date(guess.getTime() - offset2);
  }

  return utc;
}

function dateOnlyToUtcStart(dateOnly, timeZone = 'America/Rio_Branco') {
  const p = parseDateOnly(dateOnly, 'data inicial');
  return zonedDateTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
}

function dateOnlyToUtcEnd(dateOnly, timeZone = 'America/Rio_Branco') {
  const p = parseDateOnly(dateOnly, 'data final');
  return zonedDateTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone);
}

function dateToDateOnly(date, timeZone = 'America/Rio_Branco') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const p = getPartsInTimeZone(d, timeZone);
  return toDateOnlyString(p.year, p.month, p.day);
}

function normalizeToDateOnly(value, timeZone = 'America/Rio_Branco') {
  const s = String(value || '').trim();
  if (!s) return null;
  if (isDateOnly(s)) return assertDateOnly(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return dateToDateOnly(d, timeZone);
}

function formatDateOnlyBR(dateOnly) {
  const s = String(dateOnly || '').trim();
  if (!isDateOnly(s)) return s || '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function addDaysDateOnly(dateOnly, days) {
  const p = parseDateOnly(dateOnly);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + Number(days || 0)));
  return toDateOnlyString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function todayDateOnly(timeZone = 'America/Rio_Branco') {
  return dateToDateOnly(new Date(), timeZone);
}

function periodoPadraoAnoLetivo(timeZone = 'America/Rio_Branco') {
  const hoje = todayDateOnly(timeZone);
  const ano = Number(hoje.slice(0, 4));
  return { inicioDateOnly: `${ano}-01-01`, fimDateOnly: hoje };
}

function buildPeriodo({ inicio, fim, timeZone = 'America/Rio_Branco', defaultToAnoLetivo = true } = {}) {
  let inicioDateOnly = normalizeToDateOnly(inicio, timeZone);
  let fimDateOnly = normalizeToDateOnly(fim, timeZone);

  if (!inicioDateOnly && !fimDateOnly && defaultToAnoLetivo) {
    const padrao = periodoPadraoAnoLetivo(timeZone);
    inicioDateOnly = padrao.inicioDateOnly;
    fimDateOnly = padrao.fimDateOnly;
  }

  if (inicioDateOnly && !fimDateOnly) fimDateOnly = todayDateOnly(timeZone);
  if (!inicioDateOnly && fimDateOnly) inicioDateOnly = `${fimDateOnly.slice(0, 4)}-01-01`;

  if (inicioDateOnly && fimDateOnly && inicioDateOnly > fimDateOnly) {
    throw new Error('A data inicial não pode ser maior que a data final.');
  }

  const inicioUtc = inicioDateOnly ? dateOnlyToUtcStart(inicioDateOnly, timeZone) : null;
  const fimUtc = fimDateOnly ? dateOnlyToUtcEnd(fimDateOnly, timeZone) : null;

  return {
    timeZone,
    inicioDateOnly,
    fimDateOnly,
    inicio: inicioUtc,
    fim: fimUtc,
    match: inicioUtc && fimUtc ? { data: { $gte: inicioUtc, $lte: fimUtc } } : {},
    label: inicioDateOnly && fimDateOnly ? `${inicioDateOnly} a ${fimDateOnly}` : 'sem filtro de período',
    labelBR: inicioDateOnly && fimDateOnly ? `${formatDateOnlyBR(inicioDateOnly)} a ${formatDateOnlyBR(fimDateOnly)}` : 'sem filtro de período',
  };
}

function buildPeriodoFromQuery(query = {}, options = {}) {
  return buildPeriodo({
    inicio: query.inicio || query.de || null,
    fim: query.fim || query.ate || query['até'] || null,
    timeZone: options.timeZone || 'America/Rio_Branco',
    defaultToAnoLetivo: options.defaultToAnoLetivo !== false,
  });
}

module.exports = {
  UF_TIMEZONE,
  timezonePorUF,
  isDateOnly,
  assertDateOnly,
  parseDateOnly,
  toDateOnlyString,
  dateOnlyToUtcStart,
  dateOnlyToUtcEnd,
  dateToDateOnly,
  normalizeToDateOnly,
  formatDateOnlyBR,
  addDaysDateOnly,
  todayDateOnly,
  buildPeriodo,
  buildPeriodoFromQuery,
};
