const mongoose = require('mongoose');
require('dotenv').config();

const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.');

    const quirino = await Aluno.findOne({ nome: /quirino alessandro/i });
    if (!quirino) {
      console.error('❌ Aluno Quirino não encontrado.');
      return mongoose.disconnect();
    }

    const notificacoes = await Notificacao.find({ aluno: quirino._id });
    if (notificacoes.length === 0) {
      console.log('✅ Nenhuma notificação vinculada ao Quirino.');
      return mongoose.disconnect();
    }

    console.log(`🔍 Encontradas ${notificacoes.length} notificações. Removendo vínculo com Quirino...`);

    for (const n of notificacoes) {
      n.set('aluno', undefined, { strict: false }); // Remove o campo completamente
      await n.save();
    }

    console.log('✅ Vínculos removidos com sucesso.');
    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a restauração:', err);
    mongoose.disconnect();
  }
})();
