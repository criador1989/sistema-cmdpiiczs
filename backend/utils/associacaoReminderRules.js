'use strict';

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function dateKeyUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function dateKeyInTimezone(value = new Date(), timezone = 'America/Rio_Branco') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hourMinuteInTimezone(value = new Date(), timezone = 'America/Rio_Branco') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

function keyToDate(key) {
  return new Date(`${key}T12:00:00.000Z`);
}

function addDaysToKey(key, days) {
  const date = keyToDate(key);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function weekdayFromKey(key) {
  return keyToDate(key).getUTCDay();
}

function nextAllowedDateKey(key, allowedDays = [0, 1, 2, 3, 4, 5, 6]) {
  const allowed = new Set((allowedDays || []).map(Number));
  if (!allowed.size) return key;
  let candidate = key;
  for (let i = 0; i < 7; i += 1) {
    if (allowed.has(weekdayFromKey(candidate))) return candidate;
    candidate = addDaysToKey(candidate, 1);
  }
  return key;
}

function isAtOrAfterConfiguredTime(now, timezone, config) {
  const current = hourMinuteInTimezone(now, timezone);
  const targetMinutes = Number(config.horaEnvio || 0) * 60 + Number(config.minutoEnvio || 0);
  const currentMinutes = current.hour * 60 + current.minute;
  return currentMinutes >= targetMinutes;
}

function formatReference(reference) {
  const [year, month] = String(reference || '').split('-');
  if (!year || !month) return String(reference || '');
  return `${month}/${year}`;
}

function replaceToken(text, token, value) {
  return String(text || '')
    .replaceAll(`{{${token}}}`, value)
    .replaceAll(`{${token}}`, value);
}

function preencherTemplate(text, context = {}) {
  const values = {
    nome: context.nome || '',
    aluno: context.aluno || '',
    turma: context.turma || '',
    referencia: formatReference(context.referencia),
    vencimento: context.vencimento ? DATE.format(new Date(context.vencimento)) : '',
    valor_previsto: MONEY.format(Number(context.valorPrevisto || 0)),
    valor_pago: MONEY.format(Number(context.valorPago || 0)),
    valor_pendente: MONEY.format(Number(context.valorPendente || 0)),
    associacao: context.associacao || 'Associação',
    sigla: context.sigla || '',
    email: context.email || '',
    telefone: context.telefone || '',
  };

  return Object.entries(values).reduce((output, [token, value]) => replaceToken(output, token, String(value)), String(text || ''));
}

function stageTargetKey(dueKey, stage, allowedDays) {
  return nextAllowedDateKey(addDaysToKey(dueKey, Number(stage.deslocamentoDias || 0)), allowedDays);
}

function chooseEligibleStage({ contribution, config, todayKey }) {
  const dueKey = dateKeyUtc(contribution.vencimento);
  if (!dueKey) return null;

  const enabled = (config.etapas || [])
    .filter(stage => stage?.ativo !== false)
    .map(stage => {
      const plainStage = typeof stage?.toObject === 'function' ? stage.toObject() : { ...stage };
      return { ...plainStage, targetKey: stageTargetKey(dueKey, plainStage, config.diasSemana) };
    })
    .filter(stage => stage.targetKey <= todayKey)
    .sort((a, b) => a.targetKey.localeCompare(b.targetKey));

  if (!enabled.length) return null;

  const latest = enabled[enabled.length - 1];
  if (todayKey < dueKey && Number(latest.deslocamentoDias) >= 0) return null;
  if (todayKey >= dueKey && Number(latest.deslocamentoDias) < 0) return null;
  return latest;
}

module.exports = {
  dateKeyUtc,
  dateKeyInTimezone,
  hourMinuteInTimezone,
  addDaysToKey,
  weekdayFromKey,
  nextAllowedDateKey,
  isAtOrAfterConfiguredTime,
  stageTargetKey,
  chooseEligibleStage,
  preencherTemplate,
};
