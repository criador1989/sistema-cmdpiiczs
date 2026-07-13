'use strict';

const { processAllActiveAssociations } = require('../services/associacaoLembretes');

let timer = null;
let running = false;

async function run(mensageria) {
  if (running) return;
  running = true;
  try {
    const summary = await processAllActiveAssociations({ mensageria });
    if (summary.sent || summary.errors || summary.failures.length) {
      console.log(`[lembretes-associacao] tenants=${summary.tenants} processados=${summary.processed} enviados=${summary.sent} erros=${summary.errors} falhas=${summary.failures.length}`);
    }
    if (summary.failures.length) console.warn('[lembretes-associacao] falhas:', summary.failures);
  } catch (error) {
    console.error('[lembretes-associacao] erro geral:', error?.message || error);
  } finally {
    running = false;
  }
}

function iniciarAgendadorLembretesAssociacao({ mensageria = null, intervalMs = 15 * 60 * 1000 } = {}) {
  if (timer) return timer;
  const safeInterval = Math.max(Number(intervalMs) || 15 * 60 * 1000, 60 * 1000);
  setTimeout(() => run(mensageria), 30 * 1000).unref?.();
  timer = setInterval(() => run(mensageria), safeInterval);
  timer.unref?.();
  console.log(`[lembretes-associacao] agendador ligado a cada ${Math.round(safeInterval / 60000)} min.`);
  return timer;
}

function pararAgendadorLembretesAssociacao() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  iniciarAgendadorLembretesAssociacao,
  pararAgendadorLembretesAssociacao,
};
