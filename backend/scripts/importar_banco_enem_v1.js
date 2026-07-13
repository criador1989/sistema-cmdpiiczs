'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const DIRETORIO = path.resolve(__dirname, '../data/banco_enem_v1');
const ARQUIVOS = [
  'questoes_enem_complemento_linguagens_145.json',
  'questoes_enem_complemento_matematica_174.json',
  'questoes_enem_complemento_humanas_196.json',
  'questoes_enem_complemento_natureza_196.json'
];

function normalizarTexto(v) {
  return String(v || '').trim();
}

function normalizarAlternativas(alternativas) {
  return (Array.isArray(alternativas) ? alternativas : [])
    .map((a) => ({
      letra: normalizarTexto(a.letra).toUpperCase(),
      texto: normalizarTexto(a.texto)
    }))
    .filter((a) => a.letra && a.texto);
}

function validar(q, arquivo, indice) {
  if (!normalizarTexto(q.codigoOrigem)) throw new Error(`${arquivo} [${indice + 1}]: codigoOrigem ausente`);
  if (!normalizarTexto(q.area)) throw new Error(`${arquivo} [${indice + 1}]: área ausente`);
  if (!normalizarTexto(q.enunciado)) throw new Error(`${arquivo} [${indice + 1}]: enunciado ausente`);
  if (!['facil', 'medio', 'dificil'].includes(q.dificuldade)) throw new Error(`${arquivo} [${indice + 1}]: dificuldade inválida`);
  const alternativas = normalizarAlternativas(q.alternativas);
  if (alternativas.length !== 5) throw new Error(`${arquivo} [${indice + 1}]: alternativas inválidas`);
  if (!alternativas.some((a) => a.letra === normalizarTexto(q.gabarito).toUpperCase())) {
    throw new Error(`${arquivo} [${indice + 1}]: gabarito inválido`);
  }
}

function payload(q) {
  return {
    instituicao: null,
    escopo: 'global',
    area: normalizarTexto(q.area),
    disciplina: normalizarTexto(q.disciplina),
    competencia: normalizarTexto(q.competencia),
    habilidade: normalizarTexto(q.habilidade),
    tema: normalizarTexto(q.tema),
    subtema: normalizarTexto(q.subtema),
    dificuldade: q.dificuldade,
    estilo: q.estilo || 'enem_adaptado',
    origem: q.origem || 'autor',
    anoReferencia: Number(q.anoReferencia) || 2026,
    codigoOrigem: normalizarTexto(q.codigoOrigem),
    enunciado: normalizarTexto(q.enunciado),
    apoioTexto: normalizarTexto(q.apoioTexto),
    imagemUrl: normalizarTexto(q.imagemUrl),
    alternativas: normalizarAlternativas(q.alternativas),
    gabarito: normalizarTexto(q.gabarito).toUpperCase(),
    explicacao: normalizarTexto(q.explicacao),
    comentarioPedagogico: normalizarTexto(q.comentarioPedagogico),
    tags: Array.isArray(q.tags) ? q.tags.map(normalizarTexto).filter(Boolean) : [],
    ativa: q.ativa !== false,
    publicada: q.publicada !== false,
    metadadosIA: q.metadadosIA || {},
    criadoPor: q.criadoPor || null
  };
}

async function main() {
  if (!MONGO_URI) throw new Error('Defina MONGO_URI, MONGODB_URI ou DATABASE_URL no .env.');

  const somenteValidar = process.argv.includes('--dry-run');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');

  let criadas = 0;
  let atualizadas = 0;
  let validadas = 0;

  for (const arquivo of ARQUIVOS) {
    const caminho = path.join(DIRETORIO, arquivo);
    const lista = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    console.log(`\n📘 ${arquivo}: ${lista.length} questões`);

    for (let i = 0; i < lista.length; i += 1) {
      const q = lista[i];
      validar(q, arquivo, i);
      validadas += 1;

      if (somenteValidar) continue;

      const dados = payload(q);
      const resultado = await Questao.updateOne(
        { codigoOrigem: dados.codigoOrigem },
        { $set: dados },
        { upsert: true }
      );

      if (resultado.upsertedCount > 0) criadas += 1;
      else atualizadas += 1;
    }
  }

  console.log('\n=== RESULTADO DA IMPORTAÇÃO ===');
  console.log(`Questões validadas: ${validadas}`);
  if (somenteValidar) {
    console.log('Modo --dry-run: nenhuma alteração foi feita no banco.');
  } else {
    console.log(`Criadas: ${criadas}`);
    console.log(`Atualizadas: ${atualizadas}`);
  }

  await mongoose.disconnect();
}

main().catch(async (erro) => {
  console.error('❌ Falha:', erro);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
