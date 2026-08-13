'use strict';

const assert = require('assert');
const {
  normalizarConfiguracaoComponentesLote,
  resolverConfiguracaoComponentesTurma,
} = require('../utils/alamarBatchConfig');

const importacaoFundamental = {
  cabecalhos: ['Língua Portuguesa', 'Matemática', 'Geografia', 'História'],
};

const importacaoMedio = {
  cabecalhos: ['Matemática', 'Geografia', 'Física', 'Química'],
};

const config = normalizarConfiguracaoComponentesLote({
  grupos: {
    fundamental: ['Geografia'],
    medio: [],
  },
  porTurma: {
    '8º C': [],
    '2º D': ['Geografia'],
  },
});

assert.deepStrictEqual(config.grupos.fundamental, ['geografia']);
assert.deepStrictEqual(config.grupos.medio, []);
assert.deepStrictEqual(config.porTurma['8c'], []);
assert.deepStrictEqual(config.porTurma['2d'], ['geografia']);

const fundamental = resolverConfiguracaoComponentesTurma({
  configuracaoComponentes: config,
  turma: '6º A',
  importacao: importacaoFundamental,
});
assert.strictEqual(fundamental.grupoConfiguracao, 'fundamental');
assert.deepStrictEqual(fundamental.componentesExcluidos, ['geografia']);
assert.ok(fundamental.componentesConsiderados.includes('matematica'));

const excecaoFundamental = resolverConfiguracaoComponentesTurma({
  configuracaoComponentes: config,
  turma: '8º C',
  importacao: importacaoFundamental,
});
assert.deepStrictEqual(excecaoFundamental.componentesExcluidos, []);
assert.strictEqual(excecaoFundamental.origem, 'excecao_turma');

const medio = resolverConfiguracaoComponentesTurma({
  configuracaoComponentes: config,
  turma: '1º A',
  importacao: importacaoMedio,
});
assert.deepStrictEqual(medio.componentesExcluidos, []);

const excecaoMedio = resolverConfiguracaoComponentesTurma({
  configuracaoComponentes: config,
  turma: '2º D',
  importacao: importacaoMedio,
});
assert.deepStrictEqual(excecaoMedio.componentesExcluidos, ['geografia']);

assert.throws(() => resolverConfiguracaoComponentesTurma({
  configuracaoComponentes: {
    grupos: {
      fundamental: ['Língua Portuguesa', 'Matemática', 'Geografia', 'História'],
    },
  },
  turma: '7º A',
  importacao: importacaoFundamental,
}), /exclui todos os componentes/i);

console.log('OK - configuração de componentes em lote validada: grupos, Geografia e exceções por turma.');
