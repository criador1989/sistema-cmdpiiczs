'use strict';

const { normalizarTurma, classificarGrupoTurmaAlamar } = require('./alamarImport');
const { normalizarChaveComponente } = require('./alamarRules');

function normalizarListaComponentesExcluidos(lista = []) {
  return [...new Set((Array.isArray(lista) ? lista : [])
    .map(normalizarChaveComponente)
    .filter(Boolean))]
    .slice(0, 100);
}

function normalizarConfiguracaoComponentesLote(configuracao = {}) {
  const gruposOrigem = configuracao && typeof configuracao === 'object' && configuracao.grupos && typeof configuracao.grupos === 'object'
    ? configuracao.grupos
    : {};
  const porTurmaOrigem = configuracao && typeof configuracao === 'object' && configuracao.porTurma && typeof configuracao.porTurma === 'object'
    ? configuracao.porTurma
    : {};

  const grupos = {
    fundamental: normalizarListaComponentesExcluidos(gruposOrigem.fundamental),
    medio: normalizarListaComponentesExcluidos(gruposOrigem.medio),
    outros: normalizarListaComponentesExcluidos(gruposOrigem.outros),
  };

  const porTurma = {};
  Object.entries(porTurmaOrigem).slice(0, 100).forEach(([turma, lista]) => {
    const chaveTurma = normalizarTurma(turma);
    if (!chaveTurma || !Array.isArray(lista)) return;
    porTurma[chaveTurma] = normalizarListaComponentesExcluidos(lista);
  });

  return { grupos, porTurma };
}

function resolverConfiguracaoComponentesTurma({ configuracaoComponentes, turma, importacao }) {
  const config = normalizarConfiguracaoComponentesLote(configuracaoComponentes);
  const turmaNormalizada = normalizarTurma(turma);
  const grupoConfiguracao = classificarGrupoTurmaAlamar(turma);
  const detectados = [...new Set((importacao?.cabecalhos || [])
    .map(normalizarChaveComponente)
    .filter(Boolean))];

  const temExcecao = Object.prototype.hasOwnProperty.call(config.porTurma, turmaNormalizada);
  const solicitados = temExcecao
    ? config.porTurma[turmaNormalizada]
    : (config.grupos[grupoConfiguracao] || []);

  const componentesExcluidos = solicitados.filter(chave => detectados.includes(chave));
  const componentesConsiderados = detectados.filter(chave => !componentesExcluidos.includes(chave));

  if (detectados.length && !componentesConsiderados.length) {
    throw new Error(`A configuração da turma ${turma} exclui todos os componentes acadêmicos. Mantenha pelo menos um componente selecionado.`);
  }

  return {
    grupoConfiguracao,
    turmaNormalizada,
    componentesExcluidos,
    componentesConsiderados,
    origem: temExcecao ? 'excecao_turma' : `grupo_${grupoConfiguracao}`,
  };
}

module.exports = {
  normalizarListaComponentesExcluidos,
  normalizarConfiguracaoComponentesLote,
  resolverConfiguracaoComponentesTurma,
};
