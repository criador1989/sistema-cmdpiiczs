'use strict';

const DAY_MS = 86400000;
const FORECAST_WINDOWS = [30, 60, 90];
const AGING_BUCKETS = [
  { codigo: '1_7', rotulo: '1 a 7 dias', min: 1, max: 7 },
  { codigo: '8_15', rotulo: '8 a 15 dias', min: 8, max: 15 },
  { codigo: '16_30', rotulo: '16 a 30 dias', min: 16, max: 30 },
  { codigo: '31_60', rotulo: '31 a 60 dias', min: 31, max: 60 },
  { codigo: '61_mais', rotulo: 'Mais de 60 dias', min: 61, max: Number.POSITIVE_INFINITY },
];

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
}

function roundPercent(value) {
  return Math.round((asNumber(value) + Number.EPSILON) * 10) / 10;
}

function percent(part, total) {
  if (!(asNumber(total) > 0)) return 0;
  return roundPercent((asNumber(part) / asNumber(total)) * 100);
}

function utcDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcMonthStart(value) {
  const date = utcDay(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(value, amount) {
  const date = utcDay(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return date;
}

function addUtcMonths(value, amount) {
  const date = utcMonthStart(value);
  if (!date) return null;
  date.setUTCMonth(date.getUTCMonth() + Number(amount || 0));
  return date;
}

function daysBetween(from, to) {
  const start = utcDay(from);
  const end = utcDay(to);
  if (!start || !end) return 0;
  return Math.max(Math.floor((end.getTime() - start.getTime()) / DAY_MS), 0);
}

function monthKey(value) {
  const date = utcDay(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '');
}

function contributionPending(item) {
  return roundMoney(Math.max(asNumber(item.valorPrevisto) - asNumber(item.valorPago), 0));
}

function isCancelled(item) {
  return String(item.status || '').toLowerCase() === 'cancelado';
}

function movementEffectiveDate(item) {
  return utcDay(item.dataVencimento || item.dataMovimentacao);
}

function normalizeMonths(value, fallback = 12) {
  const allowed = new Set([3, 6, 12, 18, 24]);
  const parsed = Number.parseInt(value, 10);
  return allowed.has(parsed) ? parsed : fallback;
}

function normalizeClass(value) {
  return String(value || '').trim();
}

function createMonthlySeries(start, months) {
  const rows = [];
  for (let index = 0; index < months; index += 1) {
    const date = addUtcMonths(start, index);
    const key = monthKey(date);
    rows.push({
      referencia: key,
      rotulo: monthLabel(key),
      previsto: 0,
      pago: 0,
      pendente: 0,
      vencido: 0,
      quantidade: 0,
      emAtraso: 0,
      taxaArrecadacao: 0,
    });
  }
  return rows;
}

function buildAlerts({ indicators, forecast, classRows, overdueRows }) {
  const alerts = [];
  const delinquency = asNumber(indicators.inadimplenciaPercentual);

  if (delinquency >= 20) {
    alerts.push({ tipo: 'critico', titulo: 'Inadimplência elevada', mensagem: `${delinquency.toFixed(1).replace('.', ',')}% do valor vencido ainda está pendente.` });
  } else if (delinquency >= 10) {
    alerts.push({ tipo: 'atencao', titulo: 'Inadimplência merece atenção', mensagem: `${delinquency.toFixed(1).replace('.', ',')}% do valor vencido permanece em aberto.` });
  } else {
    alerts.push({ tipo: 'positivo', titulo: 'Inadimplência controlada', mensagem: `A taxa atual está em ${delinquency.toFixed(1).replace('.', ',')}%.` });
  }

  const forecast30 = forecast.find(item => item.dias === 30);
  if (forecast30 && forecast30.saldoProjetado < 0) {
    alerts.push({ tipo: 'critico', titulo: 'Projeção negativa para 30 dias', mensagem: 'As despesas previstas superam a arrecadação provável no curto prazo.' });
  }

  if (!forecast.some(item => item.receitasPrevistasBrutas > 0 || item.despesasPrevistas > 0)) {
    alerts.push({ tipo: 'info', titulo: 'Previsão ainda sem lançamentos futuros', mensagem: 'Cadastre contribuições e movimentações previstas para obter uma projeção mais completa.' });
  }

  const classLeader = classRows[0];
  if (classLeader && indicators.valorInadimplente > 0) {
    const concentration = percent(classLeader.valorInadimplente, indicators.valorInadimplente);
    if (concentration >= 40) {
      alerts.push({ tipo: 'atencao', titulo: 'Pendências concentradas', mensagem: `${concentration.toFixed(1).replace('.', ',')}% do valor inadimplente está concentrado em ${classLeader.turma}.` });
    }
  }

  if (overdueRows.some(item => item.diasAtraso > 60)) {
    alerts.push({ tipo: 'atencao', titulo: 'Há pendências antigas', mensagem: 'Existem contribuições em atraso há mais de 60 dias. Considere contato individual e negociação.' });
  }

  return alerts;
}

function buildFinancialInsights({
  contributions = [],
  movements = [],
  now = new Date(),
  months = 12,
  turma = '',
} = {}) {
  const today = utcDay(now) || utcDay(new Date());
  const selectedMonths = normalizeMonths(months);
  const selectedClass = normalizeClass(turma);
  const periodStart = addUtcMonths(utcMonthStart(today), -(selectedMonths - 1));
  const periodEnd = addUtcMonths(utcMonthStart(today), 1);
  const historyStart = addUtcMonths(utcMonthStart(today), -6);
  const historyEnd = utcMonthStart(today);

  const activeContributions = contributions
    .filter(item => !isCancelled(item))
    .filter(item => !selectedClass || normalizeClass(item.alunoTurma) === selectedClass)
    .map(item => ({
      ...item,
      vencimentoNormalizado: utcDay(item.vencimento),
      valorPrevistoNormalizado: roundMoney(item.valorPrevisto),
      valorPagoNormalizado: roundMoney(item.valorPago),
      valorPendenteNormalizado: contributionPending(item),
    }))
    .filter(item => item.vencimentoNormalizado);

  const periodContributions = activeContributions.filter(item => item.vencimentoNormalizado >= periodStart && item.vencimentoNormalizado < periodEnd);
  const dueContributions = activeContributions.filter(item => item.vencimentoNormalizado < today);
  const overdueContributions = dueContributions.filter(item => item.valorPendenteNormalizado > 0);

  const monthlyRows = createMonthlySeries(periodStart, selectedMonths);
  const monthlyMap = new Map(monthlyRows.map(item => [item.referencia, item]));
  for (const item of periodContributions) {
    const row = monthlyMap.get(monthKey(item.vencimentoNormalizado));
    if (!row) continue;
    row.previsto = roundMoney(row.previsto + item.valorPrevistoNormalizado);
    row.pago = roundMoney(row.pago + item.valorPagoNormalizado);
    row.pendente = roundMoney(row.pendente + item.valorPendenteNormalizado);
    row.quantidade += 1;
    if (item.vencimentoNormalizado < today && item.valorPendenteNormalizado > 0) {
      row.vencido = roundMoney(row.vencido + item.valorPendenteNormalizado);
      row.emAtraso += 1;
    }
  }
  monthlyRows.forEach(row => { row.taxaArrecadacao = percent(row.pago, row.previsto); });

  const totalExpected = roundMoney(periodContributions.reduce((sum, item) => sum + item.valorPrevistoNormalizado, 0));
  const totalPaid = roundMoney(periodContributions.reduce((sum, item) => sum + item.valorPagoNormalizado, 0));
  const totalPending = roundMoney(periodContributions.reduce((sum, item) => sum + item.valorPendenteNormalizado, 0));
  const dueExpected = roundMoney(dueContributions.reduce((sum, item) => sum + item.valorPrevistoNormalizado, 0));
  const overdueValue = roundMoney(overdueContributions.reduce((sum, item) => sum + item.valorPendenteNormalizado, 0));
  const uniquePayers = new Set(periodContributions.map(item => String(item.pessoa || item.responsavelNome || '')).filter(Boolean));
  const overduePayers = new Set(overdueContributions.map(item => String(item.pessoa || item.responsavelNome || '')).filter(Boolean));
  const weightedLateDaysTotal = overdueContributions.reduce((sum, item) => sum + (daysBetween(item.vencimentoNormalizado, today) * item.valorPendenteNormalizado), 0);

  const indicators = {
    valorPrevisto: totalExpected,
    valorPago: totalPaid,
    valorPendente: totalPending,
    valorVencidoBase: dueExpected,
    valorInadimplente: overdueValue,
    taxaArrecadacao: percent(totalPaid, totalExpected),
    inadimplenciaPercentual: percent(overdueValue, dueExpected),
    contribuicoes: periodContributions.length,
    contribuicoesEmAtraso: overdueContributions.length,
    contribuintes: uniquePayers.size,
    contribuintesInadimplentes: overduePayers.size,
    ticketMedio: periodContributions.length ? roundMoney(totalExpected / periodContributions.length) : 0,
    mediaDiasAtraso: overdueValue > 0 ? Math.round(weightedLateDaysTotal / overdueValue) : 0,
  };

  const aging = AGING_BUCKETS.map(bucket => {
    const matches = overdueContributions.filter(item => {
      const days = daysBetween(item.vencimentoNormalizado, today);
      return days >= bucket.min && days <= bucket.max;
    });
    const value = roundMoney(matches.reduce((sum, item) => sum + item.valorPendenteNormalizado, 0));
    return {
      codigo: bucket.codigo,
      rotulo: bucket.rotulo,
      quantidade: matches.length,
      valor: value,
      percentual: percent(value, overdueValue),
    };
  });

  const classMap = new Map();
  for (const item of periodContributions) {
    const className = normalizeClass(item.alunoTurma) || 'Sem turma';
    if (!classMap.has(className)) classMap.set(className, { turma: className, previsto: 0, pago: 0, pendente: 0, valorInadimplente: 0, quantidade: 0, emAtraso: 0 });
    const row = classMap.get(className);
    row.previsto = roundMoney(row.previsto + item.valorPrevistoNormalizado);
    row.pago = roundMoney(row.pago + item.valorPagoNormalizado);
    row.pendente = roundMoney(row.pendente + item.valorPendenteNormalizado);
    row.quantidade += 1;
    if (item.vencimentoNormalizado < today && item.valorPendenteNormalizado > 0) {
      row.valorInadimplente = roundMoney(row.valorInadimplente + item.valorPendenteNormalizado);
      row.emAtraso += 1;
    }
  }
  const classRows = [...classMap.values()].map(row => ({
    ...row,
    taxaArrecadacao: percent(row.pago, row.previsto),
    inadimplenciaPercentual: percent(row.valorInadimplente, row.previsto),
  })).sort((a, b) => b.valorInadimplente - a.valorInadimplente || a.turma.localeCompare(b.turma, 'pt-BR'));

  const oldestOverdue = overdueContributions.map(item => ({
    id: String(item._id || ''),
    pessoa: String(item.pessoa || ''),
    responsavelNome: item.responsavelNome || 'Responsável não informado',
    alunoNome: item.alunoNome || null,
    alunoTurma: item.alunoTurma || null,
    referencia: item.referencia || monthKey(item.vencimentoNormalizado),
    vencimento: item.vencimentoNormalizado,
    diasAtraso: daysBetween(item.vencimentoNormalizado, today),
    valorPrevisto: item.valorPrevistoNormalizado,
    valorPago: item.valorPagoNormalizado,
    valorPendente: item.valorPendenteNormalizado,
  })).sort((a, b) => b.diasAtraso - a.diasAtraso || b.valorPendente - a.valorPendente).slice(0, 30);

  const historyContributions = activeContributions.filter(item => item.vencimentoNormalizado >= historyStart && item.vencimentoNormalizado < historyEnd);
  const historyExpected = roundMoney(historyContributions.reduce((sum, item) => sum + item.valorPrevistoNormalizado, 0));
  const historyPaid = roundMoney(historyContributions.reduce((sum, item) => sum + item.valorPagoNormalizado, 0));
  const historicalCollectionRate = historyExpected > 0 ? Math.min(percent(historyPaid, historyExpected), 100) : 100;

  const relevantMovements = movements
    .filter(item => String(item.status || '').toLowerCase() !== 'cancelado')
    .filter(item => !selectedClass || normalizeClass(item.alunoTurma) === selectedClass)
    .map(item => ({ ...item, dataEfetiva: movementEffectiveDate(item), valorNormalizado: roundMoney(item.valor) }))
    .filter(item => item.dataEfetiva);

  const forecast = FORECAST_WINDOWS.map(days => {
    const end = addUtcDays(today, days + 1);
    const futureContributions = activeContributions.filter(item => item.vencimentoNormalizado >= today && item.vencimentoNormalizado < end && item.valorPendenteNormalizado > 0);
    const contributionValue = roundMoney(futureContributions.reduce((sum, item) => sum + item.valorPendenteNormalizado, 0));
    const plannedEntries = relevantMovements.filter(item => item.tipo === 'Entrada' && ['Pendente', 'Previsto'].includes(item.status) && item.dataEfetiva >= today && item.dataEfetiva < end);
    const plannedExpenses = relevantMovements.filter(item => item.tipo === 'Saída' && ['Pendente', 'Previsto'].includes(item.status) && item.dataEfetiva >= today && item.dataEfetiva < end);
    const otherEntryValue = roundMoney(plannedEntries.reduce((sum, item) => sum + item.valorNormalizado, 0));
    const expenseValue = roundMoney(plannedExpenses.reduce((sum, item) => sum + item.valorNormalizado, 0));
    const probableCollection = roundMoney((contributionValue * historicalCollectionRate / 100) + otherEntryValue);
    return {
      dias: days,
      ate: addUtcDays(today, days),
      contribuicoesPrevistas: contributionValue,
      outrasReceitasPrevistas: otherEntryValue,
      receitasPrevistasBrutas: roundMoney(contributionValue + otherEntryValue),
      arrecadacaoProvavel: probableCollection,
      despesasPrevistas: expenseValue,
      saldoProjetado: roundMoney(probableCollection - expenseValue),
      taxaHistoricaAplicada: historicalCollectionRate,
      quantidadeContribuicoes: futureContributions.length,
      quantidadeReceitas: plannedEntries.length,
      quantidadeDespesas: plannedExpenses.length,
    };
  });

  const alerts = buildAlerts({ indicators, forecast, classRows, overdueRows: oldestOverdue });

  return {
    geradoEm: new Date().toISOString(),
    filtros: {
      meses: selectedMonths,
      turma: selectedClass || null,
      inicio: periodStart,
      fimExclusivo: periodEnd,
      hoje: today,
    },
    indicadores: indicators,
    serieMensal: monthlyRows,
    envelhecimento: aging,
    turmas: classRows,
    maioresPendencias: oldestOverdue,
    previsao: forecast,
    basePrevisao: {
      mesesHistoricos: 6,
      inicio: historyStart,
      fimExclusivo: historyEnd,
      valorPrevisto: historyExpected,
      valorPago: historyPaid,
      taxaArrecadacao: historicalCollectionRate,
      metodologia: 'A arrecadação provável aplica a taxa de recebimento dos seis meses completos anteriores às contribuições futuras e soma outras receitas previstas integralmente.',
    },
    alertas: alerts,
  };
}

module.exports = {
  AGING_BUCKETS,
  FORECAST_WINDOWS,
  addUtcDays,
  addUtcMonths,
  buildFinancialInsights,
  contributionPending,
  daysBetween,
  monthKey,
  normalizeMonths,
  percent,
  roundMoney,
  utcDay,
  utcMonthStart,
};
