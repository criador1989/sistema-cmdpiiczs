'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const ALVOS = { Linguagens: 200, Matemática: 200, Humanas: 200, Natureza: 200 };

async function main() {
  if (!MONGO_URI) throw new Error('Defina MONGO_URI, MONGODB_URI ou DATABASE_URL no .env.');
  await mongoose.connect(MONGO_URI);

  const agregacao = await Questao.aggregate([
    { $match: { ativa: true, publicada: true } },
    {
      $group: {
        _id: { area: '$area', dificuldade: '$dificuldade' },
        total: { $sum: 1 }
      }
    }
  ]);

  const mapa = {};
  for (const area of Object.keys(ALVOS)) {
    mapa[area] = { area, total: 0, facil: 0, medio: 0, dificil: 0, alvo: ALVOS[area], faltam: 0 };
  }

  for (const item of agregacao) {
    const area = item?._id?.area;
    const dificuldade = item?._id?.dificuldade;
    if (!mapa[area]) mapa[area] = { area, total: 0, facil: 0, medio: 0, dificil: 0, alvo: 0, faltam: 0 };
    mapa[area].total += item.total;
    if (['facil', 'medio', 'dificil'].includes(dificuldade)) mapa[area][dificuldade] += item.total;
  }

  for (const r of Object.values(mapa)) {
    r.faltam = Math.max(0, (r.alvo || 0) - r.total);
  }

  console.log('\n=== AUDITORIA DO BANCO ATIVO/PUBLICADO ===');
  console.table(Object.values(mapa));

  const duplicadosCodigo = await Questao.aggregate([
    { $match: { codigoOrigem: { $ne: '' } } },
    { $group: { _id: '$codigoOrigem', total: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { total: { $gt: 1 } } },
    { $limit: 20 }
  ]);

  console.log(`Códigos duplicados encontrados: ${duplicadosCodigo.length}`);

  const novas = await Questao.countDocuments({ codigoOrigem: /^AXQ-ENEM-V1-/ });
  console.log(`Questões do pacote AXQ-ENEM-V1 já presentes: ${novas}/711`);

  await mongoose.disconnect();
}

main().catch(async (erro) => {
  console.error('❌ Falha:', erro);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
