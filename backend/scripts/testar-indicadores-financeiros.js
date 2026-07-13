'use strict';

const assert = require('node:assert/strict');
const { buildFinancialInsights } = require('../utils/associacaoFinancialInsights');

const now = new Date('2026-07-12T12:00:00.000Z');
const contributions = [
  {
    _id: '1', pessoa: 'p1', responsavelNome: 'Pessoa 1', alunoTurma: '7º A', referencia: '2026-06',
    vencimento: new Date('2026-06-10T00:00:00.000Z'), valorPrevisto: 100, valorPago: 40, status: 'Parcial',
  },
  {
    _id: '2', pessoa: 'p2', responsavelNome: 'Pessoa 2', alunoTurma: '7º A', referencia: '2026-07',
    vencimento: new Date('2026-07-05T00:00:00.000Z'), valorPrevisto: 100, valorPago: 0, status: 'Atrasado',
  },
  {
    _id: '3', pessoa: 'p3', responsavelNome: 'Pessoa 3', alunoTurma: '8º B', referencia: '2026-07',
    vencimento: new Date('2026-07-20T00:00:00.000Z'), valorPrevisto: 200, valorPago: 0, status: 'Pendente',
  },
  {
    _id: '4', pessoa: 'p4', responsavelNome: 'Pessoa 4', alunoTurma: '8º B', referencia: '2026-08',
    vencimento: new Date('2026-08-10T00:00:00.000Z'), valorPrevisto: 100, valorPago: 0, status: 'Pendente',
  },
  {
    _id: '5', pessoa: 'p5', responsavelNome: 'Pessoa 5', alunoTurma: '9º C', referencia: '2026-05',
    vencimento: new Date('2026-05-10T00:00:00.000Z'), valorPrevisto: 100, valorPago: 100, status: 'Em dia',
  },
  {
    _id: '6', pessoa: 'p6', responsavelNome: 'Cancelada', alunoTurma: '7º A', referencia: '2026-07',
    vencimento: new Date('2026-07-01T00:00:00.000Z'), valorPrevisto: 999, valorPago: 0, status: 'Cancelado',
  },
];

const movements = [
  { _id: 'm1', tipo: 'Entrada', status: 'Previsto', dataVencimento: new Date('2026-07-25T00:00:00.000Z'), valor: 50 },
  { _id: 'm2', tipo: 'Saída', status: 'Previsto', dataVencimento: new Date('2026-07-30T00:00:00.000Z'), valor: 80 },
  { _id: 'm3', tipo: 'Saída', status: 'Previsto', dataVencimento: new Date('2026-09-01T00:00:00.000Z'), valor: 120 },
  { _id: 'm4', tipo: 'Entrada', status: 'Cancelado', dataVencimento: new Date('2026-07-20T00:00:00.000Z'), valor: 1000 },
];

const result = buildFinancialInsights({ contributions, movements, now, months: 3 });

assert.equal(result.filtros.meses, 3);
assert.equal(result.indicadores.valorPrevisto, 500);
assert.equal(result.indicadores.valorPago, 140);
assert.equal(result.indicadores.valorPendente, 360);
assert.equal(result.indicadores.valorInadimplente, 160);
assert.equal(result.indicadores.contribuicoesEmAtraso, 2);
assert.equal(result.indicadores.contribuintesInadimplentes, 2);
assert.equal(result.serieMensal.length, 3);
assert.equal(result.envelhecimento.reduce((sum, item) => sum + item.valor, 0), 160);
assert.equal(result.maioresPendencias[0].responsavelNome, 'Pessoa 1');
assert.equal(result.previsao.find(item => item.dias === 30).receitasPrevistasBrutas, 350);
assert.equal(result.previsao.find(item => item.dias === 30).despesasPrevistas, 80);
assert.ok(result.alertas.length >= 1);

const classResult = buildFinancialInsights({ contributions, movements, now, months: 3, turma: '7º A' });
assert.equal(classResult.indicadores.valorPrevisto, 200);
assert.equal(classResult.indicadores.valorInadimplente, 160);
assert.equal(classResult.turmas.length, 1);
assert.equal(classResult.turmas[0].turma, '7º A');

console.log('✅ Indicadores financeiros validados.');
