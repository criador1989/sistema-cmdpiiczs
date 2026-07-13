'use strict';

const { recalcularTodosAlunos } = require('../utils/recalculoComportamento');

function msAteProximaExecucao(hora = 2, minuto = 0) {
  const agora = new Date();
  const proxima = new Date();
  proxima.setHours(hora, minuto, 0, 0);

  if (proxima <= agora) {
    proxima.setDate(proxima.getDate() + 1);
  }

  return proxima.getTime() - agora.getTime();
}

function iniciarAgendadorRecalculo() {
  async function executarRecalculo() {
    try {
      console.log('[recalculo] iniciando recálculo automático...');
      const resultado = await recalcularTodosAlunos();
      console.log(`[recalculo] concluído. Alunos recalculados: ${resultado.total}`);
    } catch (err) {
      console.error('[recalculo] erro:', err);
    } finally {
      const espera = msAteProximaExecucao(2, 0);
      setTimeout(executarRecalculo, espera);
    }
  }

  const primeiraEspera = msAteProximaExecucao(2, 0);
  console.log(`[recalculo] primeiro agendamento em ${Math.round(primeiraEspera / 1000)}s`);
  setTimeout(executarRecalculo, primeiraEspera);
}

module.exports = { iniciarAgendadorRecalculo };