'use strict';

const { DateTime } = require('luxon');
const AccessPolicy = require('../models/AccessPolicy');

const DEFAULT_POLICY = Object.freeze({
  janelas: {
    matutino: { ativo: true, inicio: '06:00', fim: '11:30' },
    vespertino: { ativo: true, inicio: '12:00', fim: '17:30' },
    noturno: { ativo: false, inicio: '18:00', fim: '22:30' },
  },
  turmas: [],
  notificacoes: {
    notificarTurnoRegular: true,
    notificarContraturno: true,
    notificarForaTurno: true,
  },
  chamada: {
    somenteTurnoRegular: true,
  },
});

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeClass(value) {
  return clean(value, 80)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function timeToMinutes(value) {
  if (!validTime(value)) return null;
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_POLICY));
}

function mergePolicy(raw) {
  const base = cloneDefaults();
  if (!raw) return base;
  const obj = typeof raw.toObject === 'function' ? raw.toObject() : raw;
  return {
    ...base,
    ...obj,
    janelas: {
      matutino: { ...base.janelas.matutino, ...(obj.janelas?.matutino || {}) },
      vespertino: { ...base.janelas.vespertino, ...(obj.janelas?.vespertino || {}) },
      noturno: { ...base.janelas.noturno, ...(obj.janelas?.noturno || {}) },
    },
    turmas: Array.isArray(obj.turmas) ? obj.turmas : [],
    notificacoes: { ...base.notificacoes, ...(obj.notificacoes || {}) },
    chamada: { ...base.chamada, ...(obj.chamada || {}) },
  };
}

async function getPolicy(instituicaoId) {
  const found = await AccessPolicy.findOne({ instituicao: instituicaoId }).lean();
  return mergePolicy(found);
}

function validateWindows(janelas = {}) {
  const names = ['matutino', 'vespertino', 'noturno'];
  const ranges = [];

  for (const name of names) {
    const item = janelas[name];
    if (!item?.ativo) continue;
    if (!validTime(item.inicio) || !validTime(item.fim)) {
      return { ok: false, mensagem: `Horário inválido na janela ${name}. Use HH:mm.` };
    }
    const start = timeToMinutes(item.inicio);
    const end = timeToMinutes(item.fim);
    if (start >= end) {
      return { ok: false, mensagem: `Na janela ${name}, o horário inicial deve ser menor que o final.` };
    }
    ranges.push({ name, start, end });
  }

  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) {
      return { ok: false, mensagem: `As janelas ${ranges[i - 1].name} e ${ranges[i].name} estão sobrepostas.` };
    }
  }
  return { ok: true };
}

function classShift(policy, turma) {
  const target = normalizeClass(turma);
  if (!target) return null;
  const item = (policy?.turmas || []).find((row) => normalizeClass(row?.turma) === target);
  return item?.turno || null;
}

function resolveWindow(local, policy) {
  const minute = local.hour * 60 + local.minute;
  for (const name of ['matutino', 'vespertino', 'noturno']) {
    const item = policy?.janelas?.[name];
    if (!item?.ativo) continue;
    const start = timeToMinutes(item.inicio);
    const end = timeToMinutes(item.fim);
    if (start === null || end === null) continue;
    if (minute >= start && minute <= end) return name;
  }
  return 'fora_turno';
}

function classifyAccess({ occurredAt, timezone, policy, turma }) {
  const local = DateTime.fromJSDate(occurredAt, { zone: 'utc' }).setZone(timezone);
  const janela = resolveWindow(local, policy);
  const turnoRegular = classShift(policy, turma);

  let classificacao = 'sem_turno_definido';
  let attendanceEligible = false;

  if (janela === 'fora_turno') {
    classificacao = 'fora_turno';
  } else if (!turnoRegular) {
    classificacao = 'sem_turno_definido';
  } else if (turnoRegular === janela) {
    classificacao = 'turno_regular';
    attendanceEligible = true;
  } else {
    classificacao = 'contraturno';
  }

  const labels = {
    matutino: 'Matutino',
    vespertino: 'Vespertino',
    noturno: 'Noturno',
    fora_turno: 'Fora de turno',
  };

  return {
    timezone,
    dateKey: local.toFormat('yyyy-LL-dd'),
    janela,
    turno: janela,
    janelaLabel: labels[janela] || janela,
    turnoRegularAluno: turnoRegular,
    classificacao,
    attendanceEligible,
    dateLabel: local.setLocale('pt-BR').toFormat('dd/LL/yyyy'),
    timeLabel: local.toFormat('HH:mm'),
  };
}

function shouldNotify(policy, classification) {
  if (classification === 'turno_regular') return policy?.notificacoes?.notificarTurnoRegular !== false;
  if (classification === 'contraturno' || classification === 'sem_turno_definido') {
    return policy?.notificacoes?.notificarContraturno !== false;
  }
  if (classification === 'fora_turno') return policy?.notificacoes?.notificarForaTurno !== false;
  return true;
}

module.exports = {
  DEFAULT_POLICY,
  normalizeClass,
  validTime,
  mergePolicy,
  getPolicy,
  validateWindows,
  classShift,
  classifyAccess,
  shouldNotify,
};
