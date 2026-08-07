'use strict';

const assert = require('assert');
const { avaliarAlunoAlamar } = require('../utils/alamarRules');

function disciplina(nome, n1, n2, recuperacao = false) {
  return {
    nome,
    notas: [
      { bimestre: 1, valor: n1, recuperacaoExplicita: false },
      { bimestre: 2, valor: n2, recuperacaoExplicita: false },
    ],
    recuperacao,
  };
}

const apto = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 9, 9), disciplina('Matemática', 8.5, 8.5)],
  alunoVinculado: true,
  notaDisciplinar: 7,
});
assert.equal(apto.status, 'APTO');
assert.equal(apto.mediaGlobal, 8.75);
assert.equal(apto.pontuacaoClassificacao, 8.75);
assert.equal(apto.criterios.notaDisciplinarMinima, true);

const disciplinarBaixa = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 9, 9), disciplina('Matemática', 9, 9)],
  alunoVinculado: true,
  notaDisciplinar: 6.99,
});
assert.equal(disciplinarBaixa.elegibilidadeAcademica, 'APTO');
assert.equal(disciplinarBaixa.status, 'NAO_APTO');
assert(disciplinarBaixa.motivos.includes('NOTA_DISCIPLINAR_INFERIOR_A_7'));
assert.equal(disciplinarBaixa.pontuacaoClassificacao, 9);

const globalBaixa = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 8, 8), disciplina('Matemática', 8, 8)],
  alunoVinculado: true,
  notaDisciplinar: 10,
});
assert.equal(globalBaixa.status, 'NAO_APTO');
assert(globalBaixa.motivos.includes('MEDIA_GLOBAL_INFERIOR_A_8_5'));

const disciplinaBaixa = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 10, 10), disciplina('Matemática', 7.8, 7.8)],
  alunoVinculado: true,
  notaDisciplinar: 10,
});
assert.equal(disciplinaBaixa.status, 'NAO_APTO');
assert(disciplinaBaixa.motivos.includes('DISCIPLINA_COM_MEDIA_SEMESTRAL_INFERIOR_A_8'));

const recuperacaoPorNota = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 6.9, 10), disciplina('Matemática', 9, 9)],
  alunoVinculado: true,
  notaDisciplinar: 9,
});
assert.equal(recuperacaoPorNota.status, 'NAO_APTO');
assert.equal(recuperacaoPorNota.teveRecuperacao, true);

const semVinculo = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 9, 9), disciplina('Matemática', 9, 9)],
  alunoVinculado: false,
});
assert.equal(semVinculo.elegibilidadeAcademica, 'APTO');
assert.equal(semVinculo.status, 'PENDENTE');

const semNotaDisciplinar = avaliarAlunoAlamar({
  disciplinas: [disciplina('Português', 9, 9), disciplina('Matemática', 9, 9)],
  alunoVinculado: true,
  notaDisciplinar: null,
});
assert.equal(semNotaDisciplinar.status, 'PENDENTE');
assert(semNotaDisciplinar.motivos.includes('NOTA_DISCIPLINAR_INDISPONIVEL'));

const mediaSemRecuperacaoInformada = avaliarAlunoAlamar({
  disciplinas: [{ nome: 'Português', mediaSemestral: 9, recuperacaoDesconhecida: true }],
  alunoVinculado: true,
  notaDisciplinar: 9,
});
assert.equal(mediaSemRecuperacaoInformada.status, 'PENDENTE');


const ignorandoGeografia = avaliarAlunoAlamar({
  disciplinas: [
    disciplina('Português', 9, 9),
    { nome: 'Geografia', notas: [{ bimestre: 1, valor: 9 }, { bimestre: 2, valor: null }] },
    disciplina('Linguagens e suas Tecnologias', 9.5, 9.5),
  ],
  alunoVinculado: true,
  notaDisciplinar: 9,
  componentesExcluidos: ['geografia'],
});
assert.equal(ignorandoGeografia.status, 'APTO');
assert.equal(ignorandoGeografia.mediaGlobal, 9.25);
assert.equal(ignorandoGeografia.disciplinas.find(d => d.nome === 'Geografia').considerarNoCalculo, false);

const areaContaNoCalculo = avaliarAlunoAlamar({
  disciplinas: [
    disciplina('Português', 10, 10),
    disciplina('Ciências Humanas e Sociais Aplicadas', 7.9, 7.9),
  ],
  alunoVinculado: true,
  notaDisciplinar: 9,
});
assert.equal(areaContaNoCalculo.status, 'NAO_APTO');
assert(areaContaNoCalculo.motivos.includes('DISCIPLINA_COM_MEDIA_SEMESTRAL_INFERIOR_A_8'));

console.log('OK: regras do Alamar validadas em 10 cenários, incluindo seleção de componentes e áreas do Ensino Médio.');
