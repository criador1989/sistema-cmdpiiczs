'use strict';

const { gerarSnapshotsTodasInstituicoes } = require('../utils/snapshotsComportamento');

function msAteProximaExecucao(hora = 2, minuto = 30) {
  const agora = new Date();
  const proxima = new Date();

  proxima.setHours(hora, minuto, 0, 0);

  if (proxima <= agora) {
    proxima.setDate(proxima.getDate() + 1);
  }

  return proxima.getTime() - agora.getTime();
}

function iniciarAgendadorSnapshotsComportamento() {
  async function executar() {
    try {
      console.log('[snapshot-comportamento] iniciando geração automática...');
      const resultados = await gerarSnapshotsTodasInstituicoes({
        data: new Date(),
        origem: 'automatico',
      });

      const total = resultados.reduce((acc, item) => acc + Number(item.total || 0), 0);

      console.log(`[snapshot-comportamento] concluído. Snapshots gerados/atualizados: ${total}`);
    } catch (err) {
      console.error('[snapshot-comportamento] erro:', err);
    } finally {
      const espera = msAteProximaExecucao(2, 30);
      setTimeout(executar, espera);
    }
  }

  const primeiraEspera = msAteProximaExecucao(2, 30);

  console.log('[snapshot-comportamento] agendador ligado para 02:30.');
  setTimeout(executar, primeiraEspera);
}

module.exports = {
  iniciarAgendadorSnapshotsComportamento,
};