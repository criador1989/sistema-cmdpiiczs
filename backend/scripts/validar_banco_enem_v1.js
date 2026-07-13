'use strict';

const fs = require('fs');
const path = require('path');

const DIRETORIO = path.resolve(__dirname, '../data/banco_enem_v1');
const ARQUIVOS = [
  'questoes_enem_complemento_linguagens_145.json',
  'questoes_enem_complemento_matematica_174.json',
  'questoes_enem_complemento_humanas_196.json',
  'questoes_enem_complemento_natureza_196.json'
];

function normalizar(v) {
  return String(v || '').trim();
}

function validarQuestao(q, arquivo, indice) {
  const erros = [];
  const prefixo = `${arquivo} [${indice + 1}]`;

  for (const campo of ['area', 'disciplina', 'competencia', 'habilidade', 'tema', 'dificuldade', 'codigoOrigem', 'enunciado', 'gabarito', 'explicacao']) {
    if (!normalizar(q[campo])) erros.push(`${prefixo}: campo ${campo} vazio`);
  }

  if (!['facil', 'medio', 'dificil'].includes(q.dificuldade)) {
    erros.push(`${prefixo}: dificuldade inválida`);
  }

  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 5) {
    erros.push(`${prefixo}: precisa ter exatamente 5 alternativas`);
  } else {
    const letras = q.alternativas.map((a) => normalizar(a.letra).toUpperCase());
    const textos = q.alternativas.map((a) => normalizar(a.texto));
    if (new Set(letras).size !== 5 || letras.join('') !== 'ABCDE') {
      erros.push(`${prefixo}: letras das alternativas devem ser A, B, C, D e E`);
    }
    if (textos.some((t) => !t) || new Set(textos).size !== 5) {
      erros.push(`${prefixo}: alternativas vazias ou duplicadas`);
    }

    const alternativasGenericas = [
      'não corresponde ao resultado obtido',
      'alternativa incorreta',
      'opção incorreta',
      'nenhuma das anteriores'
    ];
    for (const texto of textos) {
      const normalizado = texto.toLowerCase().replace(/[.!?]+$/g, '').trim();
      if (alternativasGenericas.includes(normalizado)) {
        erros.push(`${prefixo}: alternativa genérica encontrada: ${texto}`);
      }
    }
    if (!letras.includes(normalizar(q.gabarito).toUpperCase())) {
      erros.push(`${prefixo}: gabarito não corresponde às alternativas`);
    }
  }

  return erros;
}

function main() {
  const codigos = new Set();
  const textos = new Set();
  const resumo = {};
  const erros = [];
  let total = 0;

  for (const arquivo of ARQUIVOS) {
    const caminho = path.join(DIRETORIO, arquivo);
    if (!fs.existsSync(caminho)) {
      erros.push(`Arquivo não encontrado: ${caminho}`);
      continue;
    }

    const lista = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    if (!Array.isArray(lista)) {
      erros.push(`${arquivo}: conteúdo não é um array`);
      continue;
    }

    for (let i = 0; i < lista.length; i += 1) {
      const q = lista[i];
      erros.push(...validarQuestao(q, arquivo, i));

      const codigo = normalizar(q.codigoOrigem);
      const texto = `${normalizar(q.apoioTexto)} ${normalizar(q.enunciado)}`.toLowerCase().replace(/\s+/g, ' ');

      if (codigos.has(codigo)) erros.push(`${arquivo} [${i + 1}]: codigoOrigem duplicado: ${codigo}`);
      if (textos.has(texto)) erros.push(`${arquivo} [${i + 1}]: enunciado/contexto duplicado`);

      codigos.add(codigo);
      textos.add(texto);
      total += 1;

      const area = q.area;
      if (!resumo[area]) resumo[area] = { total: 0, facil: 0, medio: 0, dificil: 0, gabaritos: {} };
      resumo[area].total += 1;
      resumo[area][q.dificuldade] += 1;
      resumo[area].gabaritos[q.gabarito] = (resumo[area].gabaritos[q.gabarito] || 0) + 1;
    }
  }

  console.log('\n=== VALIDAÇÃO OFFLINE DO BANCO ENEM V1 ===');
  console.table(Object.entries(resumo).map(([area, r]) => ({
    area,
    total: r.total,
    facil: r.facil,
    medio: r.medio,
    dificil: r.dificil,
    A: r.gabaritos.A || 0,
    B: r.gabaritos.B || 0,
    C: r.gabaritos.C || 0,
    D: r.gabaritos.D || 0,
    E: r.gabaritos.E || 0
  })));
  console.log(`Total de questões novas: ${total}`);

  if (erros.length) {
    console.error(`\n❌ Foram encontrados ${erros.length} erro(s):`);
    erros.slice(0, 100).forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  }

  console.log('\n✅ Banco validado sem erros estruturais, códigos repetidos ou textos idênticos.');
}

main();
