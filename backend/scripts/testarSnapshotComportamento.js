'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const { gerarSnapshotsTodasInstituicoes } = require('../utils/snapshotsComportamento');

async function main() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URI/MONGO_URI não encontrado no .env');
    }

    console.log('[teste] conectando ao Mongo...');
    await mongoose.connect(mongoUri);

    console.log('[teste] gerando snapshots de comportamento...');
    const resultado = await gerarSnapshotsTodasInstituicoes({
      data: new Date(),
      origem: 'manual',
    });

    console.log('[teste] resultado:');
    console.log(JSON.stringify(resultado, null, 2));

    await mongoose.disconnect();
    console.log('[teste] finalizado com sucesso');
  } catch (err) {
    console.error('[teste] erro:', err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  }
}

main();