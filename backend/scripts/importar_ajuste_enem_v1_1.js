'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const ARQUIVO = path.resolve(__dirname, '../data/banco_enem_v1/questoes_enem_ajuste_v1_1_11.json');

function t(v) { return String(v || '').trim(); }
function alternativas(lista) {
  return (Array.isArray(lista) ? lista : []).map(a => ({
    letra: t(a.letra).toUpperCase(),
    texto: t(a.texto)
  })).filter(a => a.letra && a.texto);
}

function validar(q, i) {
  if (!t(q.codigoOrigem)) throw new Error(`[${i + 1}] codigoOrigem ausente`);
  if (!t(q.area)) throw new Error(`[${i + 1}] área ausente`);
  if (!t(q.enunciado)) throw new Error(`[${i + 1}] enunciado ausente`);
  if (!['facil','medio','dificil'].includes(q.dificuldade)) throw new Error(`[${i + 1}] dificuldade inválida`);
  const alts = alternativas(q.alternativas);
  if (alts.length !== 5) throw new Error(`[${i + 1}] alternativas inválidas`);
  if (!alts.some(a => a.letra === t(q.gabarito).toUpperCase())) throw new Error(`[${i + 1}] gabarito inválido`);
}

function payload(q) {
  return {
    instituicao: null,
    escopo: 'global',
    area: t(q.area),
    disciplina: t(q.disciplina),
    competencia: t(q.competencia),
    habilidade: t(q.habilidade),
    tema: t(q.tema),
    subtema: t(q.subtema),
    dificuldade: q.dificuldade,
    estilo: q.estilo || 'enem_adaptado',
    origem: q.origem || 'autor',
    anoReferencia: Number(q.anoReferencia) || 2026,
    codigoOrigem: t(q.codigoOrigem),
    enunciado: t(q.enunciado),
    apoioTexto: t(q.apoioTexto),
    imagemUrl: t(q.imagemUrl),
    alternativas: alternativas(q.alternativas),
    gabarito: t(q.gabarito).toUpperCase(),
    explicacao: t(q.explicacao),
    comentarioPedagogico: t(q.comentarioPedagogico),
    tags: Array.isArray(q.tags) ? q.tags.map(t).filter(Boolean) : [],
    ativa: q.ativa !== false,
    publicada: q.publicada !== false,
    metadadosIA: q.metadadosIA || {},
    criadoPor: q.criadoPor || null
  };
}

async function main() {
  if (!MONGO_URI) throw new Error('Defina MONGO_URI, MONGODB_URI ou DATABASE_URL no .env.');
  const dryRun = process.argv.includes('--dry-run');
  const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  if (!Array.isArray(lista) || lista.length !== 11) throw new Error('O arquivo precisa conter exatamente 11 questões.');

  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado ao MongoDB');

  let criadas = 0, atualizadas = 0;
  for (let i = 0; i < lista.length; i++) {
    const q = lista[i];
    validar(q, i);
    if (dryRun) continue;

    const dados = payload(q);
    const r = await Questao.updateOne(
      { codigoOrigem: dados.codigoOrigem },
      { $set: dados },
      { upsert: true }
    );
    if (r.upsertedCount > 0) criadas++;
    else atualizadas++;
  }

  console.log('\n=== RESULTADO DO AJUSTE ENEM V1.1 ===');
  console.log(`Questões validadas: ${lista.length}`);
  if (dryRun) console.log('Modo --dry-run: nenhuma alteração foi feita no banco.');
  else {
    console.log(`Criadas: ${criadas}`);
    console.log(`Atualizadas: ${atualizadas}`);
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('❌ Falha:', err.message || err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
