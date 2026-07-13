const mongoose = require('mongoose');
require('dotenv').config();

const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
const Instituicao = require('../models/Instituicao');

const { PRESET_MILITAR } = require('../utils/configuracaoDisciplinar');

async function rodar() {
  await mongoose.connect(process.env.MONGO_URI);

  const instituicao = await Instituicao.findOne({ nome: /cmdpii/i });

  if (!instituicao) {
    console.log('❌ Instituição não encontrada.');
    process.exit(1);
  }

  let config = await ConfiguracaoDisciplinar.findOne({
    instituicao: instituicao._id
  });

  if (!config) {
    console.log('🆕 Criando nova configuração militar...');

    config = new ConfiguracaoDisciplinar({
      ...PRESET_MILITAR,
      instituicao: instituicao._id,
      preset: 'militar',
      tipoRegulamento: 'militar'
    });

  } else {
    console.log('♻️ Atualizando para preset militar...');

    Object.assign(config, PRESET_MILITAR);

    config.instituicao = instituicao._id;
    config.preset = 'militar';
    config.tipoRegulamento = 'militar';
  }

  await config.save();

  console.log('✅ CMDPII agora está com preset MILITAR aplicado!');
  process.exit(0);
}

rodar().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});