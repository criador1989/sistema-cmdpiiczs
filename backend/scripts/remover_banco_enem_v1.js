'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Questao = require('../models/Questao');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

async function main() {
  if (!process.argv.includes('--confirmar')) {
    console.log('Nenhuma alteração feita. Para remover somente as questões deste pacote, execute:');
    console.log('node scripts/remover_banco_enem_v1.js --confirmar');
    return;
  }
  if (!MONGO_URI) throw new Error('MongoDB não configurado.');
  await mongoose.connect(MONGO_URI);
  const resultado = await Questao.deleteMany({ codigoOrigem: /^AXQ-ENEM-V1-/ });
  console.log(`Questões removidas: ${resultado.deletedCount}`);
  await mongoose.disconnect();
}

main().catch(async (erro) => {
  console.error(erro);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
