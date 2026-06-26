'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Instituicao = require('../models/Instituicao');
const { timezonePorUF } = require('../utils/dateOnly');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

async function main() {
  if (!MONGO_URI) throw new Error('Defina MONGODB_URI, MONGO_URI ou MONGO_URL no .env.');
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB conectado.');

  const instituicoes = await Instituicao.find({}).select('_id nome sigla slug estado municipio timezone').lean();
  console.log(`Instituições encontradas: ${instituicoes.length}`);

  let atualizadas = 0;
  for (const inst of instituicoes) {
    const uf = String(inst.estado || '').trim().toUpperCase();
    const timezone = inst.timezone || timezonePorUF(uf || 'AC');

    await Instituicao.updateOne(
      { _id: inst._id },
      { $set: { timezone } }
    );

    atualizadas += 1;
    console.log(`OK - ${inst.nome || inst.sigla || inst.slug} | UF=${uf || '—'} | timezone=${timezone}`);
  }

  console.log(`Concluído. Instituições atualizadas/verificadas: ${atualizadas}`);
}

main()
  .catch((err) => {
    console.error('Erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
