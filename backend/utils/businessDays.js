// backend/utils/businessDays.js
// Utilitário de calendário de DIAS ÚTEIS (sem fins de semana e com suporte a feriados)
// Timezone padrão: America/Rio_Branco (Acre)

const { DateTime } = require('luxon');

/**
 * Normaliza um array de feriados em um Set de strings ISO 'YYYY-MM-DD' para lookup rápido.
 * Aceita itens Date, string 'YYYY-MM-DD' ou DateTime.
 */
function _toHolidaySet(holidays = [], tz = 'America/Rio_Branco') {
  const set = new Set();
  for (const h of holidays) {
    if (!h) continue;
    if (typeof h === 'string') {
      // assume 'YYYY-MM-DD' (sem timezone)
      set.add(h);
    } else if (h instanceof Date) {
      set.add(DateTime.fromJSDate(h, { zone: tz }).toISODate());
    } else if (DateTime.isDateTime(h)) {
      set.add(h.setZone(tz).toISODate());
    }
  }
  return set;
}

/** Cria um DateTime na TZ informada a partir de Date | string | DateTime */
function _dt(value, tz = 'America/Rio_Branco') {
  if (DateTime.isDateTime(value)) return value.setZone(tz);
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: tz });
  if (typeof value === 'string') {
    // tenta parse ISO; se vier só "YYYY-MM-DD", trata como local
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return isYMD
      ? DateTime.fromISO(value, { zone: tz })
      : DateTime.fromJSDate(new Date(value), { zone: tz });
  }
  // fallback: agora
  return DateTime.now().setZone(tz);
}

function _isWeekend(dt) {
  // Luxon: 1=segunda ... 7=domingo
  return dt.weekday === 6 || dt.weekday === 7;
}

function _isHoliday(dt, holidaySet) {
  return holidaySet.has(dt.toISODate());
}

/**
 * Verifica se a data é DIA ÚTIL (não sábado/domingo e não feriado)
 */
function isBusinessDay(date, { holidays = [], tz = 'America/Rio_Branco' } = {}) {
  const dt = _dt(date, tz);
  const holidaySet = _toHolidaySet(holidays, tz);
  return !_isWeekend(dt) && !_isHoliday(dt, holidaySet);
}

/**
 * Retorna o PRÓXIMO dia útil (pode ser a própria data se já for útil, se includeToday=true)
 */
function nextBusinessDay(date, { holidays = [], tz = 'America/Rio_Branco', includeToday = false } = {}) {
  const holidaySet = _toHolidaySet(holidays, tz);
  let dt = _dt(date, tz).startOf('day');

  if (!includeToday) dt = dt.plus({ days: 1 });

  while (_isWeekend(dt) || _isHoliday(dt, holidaySet)) {
    dt = dt.plus({ days: 1 });
  }
  return dt.toJSDate();
}

/**
 * Retorna o DIA ÚTIL anterior (pode ser a própria data se já for útil, se includeToday=true)
 */
function previousBusinessDay(date, { holidays = [], tz = 'America/Rio_Branco', includeToday = false } = {}) {
  const holidaySet = _toHolidaySet(holidays, tz);
  let dt = _dt(date, tz).startOf('day');

  if (!includeToday) dt = dt.minus({ days: 1 });

  while (_isWeekend(dt) || _isHoliday(dt, holidaySet)) {
    dt = dt.minus({ days: 1 });
  }
  return dt.toJSDate();
}

/**
 * Soma N DIAS ÚTEIS à data (N pode ser negativo para subtrair).
 * Ex.: addBusinessDays(new Date(), 2) → pula sábados/domingos/feriados e retorna uma Date.
 */
function addBusinessDays(startDate, daysToAdd, { holidays = [], tz = 'America/Rio_Branco' } = {}) {
  const holidaySet = _toHolidaySet(holidays, tz);
  let dt = _dt(startDate, tz).startOf('day');

  if (!Number.isInteger(daysToAdd) || daysToAdd === 0) {
    return dt.toJSDate();
  }

  const step = daysToAdd > 0 ? 1 : -1;
  let remaining = Math.abs(daysToAdd);

  while (remaining > 0) {
    dt = dt.plus({ days: step });
    if (!_isWeekend(dt) && !_isHoliday(dt, holidaySet)) {
      remaining -= 1;
    }
  }

  return dt.toJSDate();
}

/**
 * Conta quantos DIAS ÚTEIS existem entre start (exclusivo) e end (inclusive por padrão).
 * Se inclusiveEnd=false, não conta o dia final.
 */
function businessDaysBetween(start, end, { holidays = [], tz = 'America/Rio_Branco', inclusiveEnd = true } = {}) {
  const holidaySet = _toHolidaySet(holidays, tz);
  let a = _dt(start, tz).startOf('day');
  let b = _dt(end, tz).startOf('day');

  if (b < a) [a, b] = [b, a];

  let count = 0;
  let cur = a.plus({ days: 1 }); // exclusivo de 'start'
  const last = inclusiveEnd ? b : b.minus({ days: 1 });

  while (cur <= last) {
    if (!_isWeekend(cur) && !_isHoliday(cur, holidaySet)) count += 1;
    cur = cur.plus({ days: 1 });
  }
  return count;
}

module.exports = {
  isBusinessDay,
  nextBusinessDay,
  previousBusinessDay,
  addBusinessDays,
  businessDaysBetween,
};
