'use strict';

function texto(v) {
  return String(v || '').trim().toLowerCase();
}

/**
 * Política única de assistência durante a escrita no Portal ENEM.
 *
 * - diagnóstico: sem assistência;
 * - formativa/prática: acompanhamento formativo;
 * - reescrita: acompanhamento orientado pela devolutiva anterior;
 * - simulado/avaliativa: sem assistência.
 *
 * A flag assistenteDuranteEscrita pode DESATIVAR um ciclo formativo, mas nunca
 * reativar assistência em diagnóstico, simulado ou avaliação.
 */
function resolverAssistenciaEscrita(ciclo, uso, modalidade = null) {
  const natureza = texto(ciclo?.natureza);
  const etapa = texto(uso?.etapaSeguinte);
  const modalidadeEfetiva = texto(modalidade || ciclo?.modalidade);

  if (
    natureza === 'diagnostico' ||
    natureza === 'simulado' ||
    natureza === 'avaliativo' ||
    modalidadeEfetiva === 'avaliacao_institucional'
  ) {
    return {
      modo: 'nenhuma',
      habilitada: false,
      motivo: modalidadeEfetiva === 'avaliacao_institucional' ? 'avaliacao' : (natureza || 'avaliacao')
    };
  }

  if (ciclo && ciclo.assistenteDuranteEscrita === false) {
    return {
      modo: 'nenhuma',
      habilitada: false,
      motivo: 'desativada_pela_escola'
    };
  }

  if (etapa === 'reescrita') {
    return {
      modo: 'reescrita',
      habilitada: true,
      motivo: 'reescrita_orientada'
    };
  }

  return {
    modo: 'formativa',
    habilitada: true,
    motivo: 'aprendizagem_formativa'
  };
}

module.exports = {
  resolverAssistenciaEscrita
};
