'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const rascunho = args.has('--rascunho');
const arquivo = path.resolve(__dirname, '../data/questoes/6ano/arena_6ano_base_v1.json');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';

function validar(payload) {
  const questoes = Array.isArray(payload?.questoes) ? payload.questoes : [];
  if (!questoes.length) throw new Error('O arquivo não contém questões.');
  const codigos = new Set();
  for (const q of questoes) {
    if (!q.codigoOrigem || !q.enunciado || !q.disciplina || !q.habilidade) {
      throw new Error(`Questão incompleta: ${q.codigoOrigem || q.enunciado || 'sem identificação'}`);
    }
    if (codigos.has(q.codigoOrigem)) throw new Error(`Código duplicado no arquivo: ${q.codigoOrigem}`);
    codigos.add(q.codigoOrigem);
    if (!Array.isArray(q.alternativas) || q.alternativas.length < 2) {
      throw new Error(`Alternativas inválidas em ${q.codigoOrigem}`);
    }
    if (!(q.alternativas || []).some((a) => a.letra === q.gabarito)) {
      throw new Error(`Gabarito inválido em ${q.codigoOrigem}`);
    }
  }
  return questoes;
}

async function executar() {
  const payload = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const questoes = validar(payload);

  console.log(`Arquivo validado: ${questoes.length} questões.`);
  console.log(`Modo de publicação: ${rascunho ? 'rascunho' : 'publicadas'}.`);

  if (dryRun) {
    console.log('Simulação concluída. Nenhuma alteração foi realizada no MongoDB.');
    return;
  }

  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGODB_URI ou MONGO_URI não foi encontrada no .env.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.DB_SERVER_SEL_MS || 60000),
    socketTimeoutMS: Number(process.env.DB_SOCKET_MS || 60000),
    maxPoolSize: 5,
    family: 4
  });

  const operacoes = questoes.map((questao) => ({
    updateOne: {
      filter: { codigoOrigem: questao.codigoOrigem },
      update: {
        $set: {
          ...questao,
          publicada: rascunho ? false : Boolean(questao.publicada),
          ativa: Boolean(questao.ativa)
        }
      },
      upsert: true
    }
  }));

  const resultado = await Questao.bulkWrite(operacoes, { ordered: false });
  console.log('Importação concluída.');
  console.log({
    inseridas: resultado.upsertedCount || 0,
    atualizadas: resultado.modifiedCount || 0,
    correspondentes: resultado.matchedCount || 0
  });
}

executar()
  .catch((error) => {
    console.error(`Falha na importação: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => null);
  });
