'use strict';

const assert = require('assert');
const { lerArquivoNotas, lerArquivosNotas } = require('../utils/alamarImport');

async function main() {
  const csvLongo = Buffer.from([
    'MATRICULA;ALUNO;TURMA;DISCIPLINA;1º BIMESTRE;2º BIMESTRE;RECUPERACAO',
    '1;Ana Teste;7º A;Português;9,0;8,5;NÃO',
    '1;Ana Teste;7º A;Matemática;8,0;9,0;NÃO',
  ].join('\n'), 'utf8');

  const longo = await lerArquivoNotas({ buffer: csvLongo, nomeArquivo: 'notas.csv', mimeType: 'text/csv', semestre: 1 });
  assert.equal(longo.formato, 'long_pareado');
  assert.equal(longo.alunos.length, 1);
  assert.equal(longo.alunos[0].disciplinas.length, 2);
  assert.equal(longo.alunos[0].disciplinas[0].notas.length, 2);

  const viaLista = await lerArquivosNotas({
    arquivos: [{ buffer: csvLongo, originalname: 'notas.csv', mimetype: 'text/csv' }],
    semestre: 1,
  });
  assert.equal(viaLista.alunos.length, 1);

  const csvBimestre = Buffer.from([
    'ALUNO;TURMA;DISCIPLINA;BIMESTRE;NOTA;RECUPERACAO',
    'Bruno Teste;8º B;Ciências;1;8,5;NÃO',
    'Bruno Teste;8º B;Ciências;2;9,0;NÃO',
  ].join('\n'), 'utf8');
  const evento = await lerArquivoNotas({ buffer: csvBimestre, nomeArquivo: 'eventos.csv', mimeType: 'text/csv', semestre: 1 });
  assert.equal(evento.formato, 'long_bimestre');
  assert.equal(evento.alunos[0].disciplinas[0].notas[1].valor, 9);

  const csvWide = Buffer.from([
    'ALUNO;TURMA;Português 1º BIMESTRE;Português 2º BIMESTRE;Matemática 1º BIMESTRE;Matemática 2º BIMESTRE',
    'Carla Teste;9º C;9;9;8,5;9,5',
  ].join('\n'), 'utf8');
  const wide = await lerArquivoNotas({ buffer: csvWide, nomeArquivo: 'wide.csv', mimeType: 'text/csv', semestre: 1 });
  assert.equal(wide.formato, 'wide_bimestres');
  assert.equal(wide.alunos[0].disciplinas.length, 2);

  const csvWindows = Buffer.from([
    'ALUNO;TURMA;Português 1B;Português 2B',
    'João Teste;6º A;8,5;9,0',
  ].join('\n'), 'latin1');
  const windows = await lerArquivoNotas({ buffer: csvWindows, nomeArquivo: 'windows.csv', mimeType: 'text/csv', semestre: 1 });
  assert.equal(windows.formato, 'wide_bimestres');
  assert.equal(windows.alunos[0].nome, 'João Teste');
  assert.equal(windows.alunos[0].disciplinas[0].notas.length, 2);

  console.log('OK: importação CSV/XLSX-base validada nos formatos longo, por bimestre, largo e Windows-1252.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
