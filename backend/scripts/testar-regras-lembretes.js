'use strict';

const assert = require('assert');
const {
  addDaysToKey,
  nextAllowedDateKey,
  stageTargetKey,
  chooseEligibleStage,
  preencherTemplate,
  hourMinuteInTimezone,
} = require('../utils/associacaoReminderRules');

assert.strictEqual(addDaysToKey('2026-07-10', 3), '2026-07-13');
assert.strictEqual(addDaysToKey('2026-01-01', -5), '2025-12-27');
assert.strictEqual(nextAllowedDateKey('2026-07-11', [1, 2, 3, 4, 5]), '2026-07-13');
assert.strictEqual(stageTargetKey('2026-07-15', { deslocamentoDias: -5 }, [0, 1, 2, 3, 4, 5, 6]), '2026-07-10');

const config = {
  diasSemana: [0, 1, 2, 3, 4, 5, 6],
  etapas: [
    { codigo: 'antes_5', ativo: true, deslocamentoDias: -5 },
    { codigo: 'no_dia', ativo: true, deslocamentoDias: 0 },
    { codigo: 'apos_3', ativo: true, deslocamentoDias: 3 },
    { codigo: 'apos_10', ativo: true, deslocamentoDias: 10 },
  ],
};

const contribution = { vencimento: new Date('2026-07-15T00:00:00.000Z') };
assert.strictEqual(chooseEligibleStage({ contribution, config, todayKey: '2026-07-10' }).codigo, 'antes_5');
assert.strictEqual(chooseEligibleStage({ contribution, config, todayKey: '2026-07-15' }).codigo, 'no_dia');
assert.strictEqual(chooseEligibleStage({ contribution, config, todayKey: '2026-07-19' }).codigo, 'apos_3');
assert.strictEqual(chooseEligibleStage({ contribution, config, todayKey: '2026-07-30' }).codigo, 'apos_10');

const text = preencherTemplate('Olá, {{nome}}. Pendente: {valor_pendente}.', {
  nome: 'Maria',
  valorPendente: 50,
});
assert.strictEqual(text.startsWith('Olá, Maria.'), true);
assert.strictEqual(text.includes('{Maria}'), false);
assert(text.includes('R$'));
assert.deepStrictEqual(hourMinuteInTimezone(new Date('2026-07-11T05:30:00.000Z'), 'America/Rio_Branco'), { hour: 0, minute: 30 });

console.log('✅ Regras de lembretes automáticos validadas.');
