const mongoose = require('mongoose');
const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado ao MongoDB.');

    // Encontre o aluno pelo nome (ajuste aqui se necessário)
    const aluno = await Aluno.findOne({ nome: /Quirino Alessandro Cordeiro Gomes/i });

    if (!aluno) {
      console.log('Aluno não encontrado!');
      process.exit(1);
    }

    // Busque notificações sem campo "aluno"
    const notificacoes = await Notificacao.find({
      $or: [{ aluno: null }, { aluno: { $exists: false } }]
    });

    console.log(`Corrigindo ${notificacoes.length} notificações...`);

    for (const n of notificacoes) {
      n.aluno = aluno._id;
      await n.save();
    }

    console.log('✅ Notificações corrigidas com sucesso.');
    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro ao corrigir notificações:', err);
    mongoose.disconnect();
  }
})();
