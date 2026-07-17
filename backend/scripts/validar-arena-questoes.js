'use strict';

const fs = require('fs');
const path = require('path');

const arquivo = path.resolve(__dirname, '../data/questoes/6ano/arena_6ano_base_v1.json');
const payload = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const questoes = Array.isArray(payload.questoes) ? payload.questoes : [];
const erros = [];
const codigos = new Set();
const enunciados = new Set();
const distribuicao = {};

if (payload.anoEscolar !== 6) erros.push('O arquivo deve ser destinado ao 6º ano.');
if (questoes.length < 100) erros.push('O banco inicial deve possuir pelo menos 100 questões.');

for (const [indice, q] of questoes.entries()) {
  const ref = q.codigoOrigem || `índice ${indice}`;
  if (!q.codigoOrigem) erros.push(`${ref}: código de origem ausente.`);
  if (codigos.has(q.codigoOrigem)) erros.push(`${ref}: código duplicado.`);
  codigos.add(q.codigoOrigem);

  const enunciado = String(q.enunciado || '').trim().toLowerCase();
  if (!enunciado) erros.push(`${ref}: enunciado ausente.`);
  if (enunciados.has(enunciado)) erros.push(`${ref}: enunciado duplicado.`);
  enunciados.add(enunciado);

  if (q.anoEscolar !== 6) erros.push(`${ref}: ano escolar diferente de 6.`);
  if (!q.disciplina) erros.push(`${ref}: disciplina ausente.`);
  if (!q.habilidade) erros.push(`${ref}: habilidade ausente.`);
  if (!q.localId) erros.push(`${ref}: local da Arena ausente.`);
  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 4) erros.push(`${ref}: deve possuir 4 alternativas.`);

  const letras = new Set((q.alternativas || []).map((a) => a.letra));
  if (!letras.has(q.gabarito)) erros.push(`${ref}: gabarito não corresponde às alternativas.`);
  if (!String(q.explicacao || '').trim()) erros.push(`${ref}: explicação pedagógica ausente.`);

  distribuicao[q.disciplina] = (distribuicao[q.disciplina] || 0) + 1;
}

if (erros.length) {
  console.error(`Banco inválido: ${erros.length} problema(s).`);
  for (const erro of erros.slice(0, 50)) console.error(`- ${erro}`);
  process.exitCode = 1;
} else {
  console.log(`Banco válido: ${questoes.length} questões do 6º ano.`);
  console.table(distribuicao);
}
