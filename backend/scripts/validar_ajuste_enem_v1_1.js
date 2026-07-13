'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.resolve(__dirname, '../data/banco_enem_v1/questoes_enem_ajuste_v1_1_11.json');

function t(v) { return String(v || '').trim(); }

function main() {
  if (!fs.existsSync(ARQUIVO)) throw new Error(`Arquivo não encontrado: ${ARQUIVO}`);
  const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  if (!Array.isArray(lista) || lista.length !== 11) throw new Error('O ajuste precisa conter exatamente 11 questões.');

  const codigos = new Set();
  const textos = new Set();
  const resumo = {};
  const erros = [];

  lista.forEach((q, i) => {
    const p = `[${i + 1}]`;
    for (const campo of ['area','disciplina','competencia','habilidade','tema','dificuldade','codigoOrigem','enunciado','gabarito','explicacao']) {
      if (!t(q[campo])) erros.push(`${p} campo ${campo} vazio`);
    }
    if (!['facil','medio','dificil'].includes(q.dificuldade)) erros.push(`${p} dificuldade inválida`);
    if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) erros.push(`${p} alternativas inválidas`);

    const letras = (q.alternativas || []).map(a => t(a.letra).toUpperCase());
    const alternativas = (q.alternativas || []).map(a => t(a.texto));
    if (letras.join('') !== 'ABCDE') erros.push(`${p} letras devem ser ABCDE`);
    if (alternativas.some(x => !x) || new Set(alternativas).size !== 5) erros.push(`${p} alternativas vazias ou repetidas`);
    if (!letras.includes(t(q.gabarito).toUpperCase())) erros.push(`${p} gabarito inválido`);

    const codigo = t(q.codigoOrigem);
    const texto = `${t(q.apoioTexto)} ${t(q.enunciado)}`.toLowerCase().replace(/\s+/g, ' ');
    if (codigos.has(codigo)) erros.push(`${p} código repetido: ${codigo}`);
    if (textos.has(texto)) erros.push(`${p} texto repetido`);
    codigos.add(codigo);
    textos.add(texto);

    if (!resumo[q.area]) resumo[q.area] = { total: 0, facil: 0, medio: 0, dificil: 0 };
    resumo[q.area].total++;
    resumo[q.area][q.dificuldade]++;
  });

  console.log('\n=== AJUSTE ENEM V1.1 ===');
  console.table(Object.entries(resumo).map(([area, r]) => ({ area, ...r })));
  console.log(`Total: ${lista.length}`);

  if (erros.length) {
    erros.forEach(e => console.error(`- ${e}`));
    process.exit(1);
  }
  console.log('✅ Ajuste validado sem erros estruturais.');
}

main();
