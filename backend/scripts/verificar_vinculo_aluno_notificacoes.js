const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  console.log('🚀 Iniciando script de verificação...');
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI não encontrada no .env');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    console.log('🔍 Buscando notificações com vínculo...');
    const notificacoes = await Notificacao.find({ aluno: { $exists: true, $ne: null } });

    let total = notificacoes.length;
    let quebradas = 0;

    if (total === 0) {
      console.log('⚠️ Nenhuma notificação encontrada com campo "aluno".');
    }

    for (const n of notificacoes) {
      const alunoExiste = await Aluno.exists({ _id: n.aluno });
      if (!alunoExiste) {
        console.log(`❌ Vínculo quebrado - Notificação ID: ${n._id}, Aluno ID inválido: ${n.aluno}`);
        quebradas++;
      }
    }

    console.log('\n📊 Resumo final:');
    console.log(`🔎 Total de notificações verificadas: ${total}`);
    console.log(`✅ Com vínculo válido: ${total - quebradas}`);
    console.log(`❌ Com vínculo inválido: ${quebradas}`);

    await mongoose.disconnect();
    console.log('🔌 Conexão encerrada.');

  } catch (err) {
    console.error('❌ Erro no script:', err);
    mongoose.disconnect();
  }
})();
