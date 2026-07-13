require('dotenv').config();
const mongoose = require('mongoose');

const Instituicao = require('../models/Instituicao');
const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
const { CONFIG_PADRAO_CBMAC } = require('../utils/configuracaoDisciplinar');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const instituicoes = await Instituicao.find({}).select('_id nome slug').lean();

  if (!instituicoes.length) {
    console.log('Nenhuma instituição encontrada.');
    process.exit(0);
  }

  for (const inst of instituicoes) {
    const jaExiste = await ConfiguracaoDisciplinar.findOne({ instituicao: inst._id }).lean();

    if (jaExiste) {
      console.log(`Configuração já existe para: ${inst.nome}`);
      continue;
    }

    await ConfiguracaoDisciplinar.create({
      instituicao: inst._id,
      ...CONFIG_PADRAO_CBMAC,
    });

    console.log(`Configuração criada para: ${inst.nome}`);
  }

  console.log('Seed concluído.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no seed:', err);
  process.exit(1);
});