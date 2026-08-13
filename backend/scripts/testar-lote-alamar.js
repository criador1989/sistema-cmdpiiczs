'use strict';

const assert = require('assert');
const { organizarRelatoriosPorTurma, classificarGrupoTurmaAlamar } = require('../utils/alamarImport');

function relatorio(turma, bimestre, nomeArquivo) {
  return {
    turma,
    bimestre,
    nomeArquivo,
    disciplinas: ['Matemática'],
    alunos: [
      { nome: 'ALUNO TESTE', turma, notas: { Matemática: 9.0 }, situacao: 'Em Curso' },
    ],
  };
}

const ok = organizarRelatoriosPorTurma({
  semestre: 1,
  relatorios: [
    relatorio('6º A', 2, '6A-2.pdf'),
    relatorio('7º B', 1, '7B-1.pdf'),
    relatorio('6º A', 1, '6A-1.pdf'),
    relatorio('7º B', 2, '7B-2.pdf'),
  ],
});
assert.strictEqual(ok.valido, true);
assert.strictEqual(ok.totalTurmas, 2);
assert.deepStrictEqual(ok.turmas[0].bimestres, [1, 2]);
assert.deepStrictEqual(ok.turmas[0].arquivos, ['6A-1.pdf', '6A-2.pdf']);
assert.strictEqual(ok.turmas[0].status, 'PRONTO');

const faltando = organizarRelatoriosPorTurma({
  semestre: 1,
  relatorios: [relatorio('8º C', 1, '8C-1.pdf')],
});
assert.strictEqual(faltando.valido, false);
assert.strictEqual(faltando.turmas[0].status, 'INCOMPLETO');
assert.ok(faltando.erros.some(item => item.includes('Falta 2º bimestre')));

const duplicado = organizarRelatoriosPorTurma({
  semestre: 1,
  relatorios: [
    relatorio('9º A', 1, '9A-1-a.pdf'),
    relatorio('9º A', 1, '9A-1-b.pdf'),
    relatorio('9º A', 2, '9A-2.pdf'),
  ],
});
assert.strictEqual(duplicado.valido, false);
assert.strictEqual(duplicado.turmas[0].status, 'DUPLICADO');
assert.ok(duplicado.erros.some(item => item.includes('mais de um arquivo')));

const semestre2 = organizarRelatoriosPorTurma({
  semestre: 2,
  relatorios: [relatorio('1º D', 3, '1D-3.pdf'), relatorio('1º D', 4, '1D-4.pdf')],
});
assert.strictEqual(semestre2.valido, true);
assert.deepStrictEqual(semestre2.bimestresEsperados, [3, 4]);


assert.strictEqual(classificarGrupoTurmaAlamar('6º A'), 'fundamental');
assert.strictEqual(classificarGrupoTurmaAlamar('9º B'), 'fundamental');
assert.strictEqual(classificarGrupoTurmaAlamar('1ª Série A'), 'medio');
assert.strictEqual(classificarGrupoTurmaAlamar('3º C'), 'medio');
assert.strictEqual(classificarGrupoTurmaAlamar('Turma Especial'), 'outros');

console.log('OK - testes de apuração em lote do Alamar concluídos, incluindo agrupamento Fundamental/Médio.');
