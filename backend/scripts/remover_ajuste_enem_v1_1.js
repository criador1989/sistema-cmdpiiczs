'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

async function main() {
  if (!process.argv.includes('--confirmar')) {
    console.log('Nenhuma alteração feita. Para remover somente o ajuste V1.1, execute:');
    console.log('node scripts/remover_ajuste_enem_v1_1.js --confirmar');
    return;
  }
  if (!MONGO_URI) throw new Error('MongoDB não configurado.');
  await mongoose.connect(MONGO_URI);
  const r = await Questao.deleteMany({ codigoOrigem: /^AXQ-ENEM-V1\.1-/ });
  console.log(`Questões removidas: ${r.deletedCount}`);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('❌ Falha:', err.message || err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
