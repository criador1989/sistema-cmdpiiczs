const mongoose = require('mongoose');
require('dotenv').config();

const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    const notificacoesSemNome = await Notificacao.find({
      $or: [
        { aluno: null },
        { aluno: { $exists: false } }
      ],
      $or: [
        { nomeAluno: { $exists: false } },
        { nomeAluno: "" }
      ]
    });

    if (notificacoesSemNome.length === 0) {
      console.log('✅ Nenhuma notificação sem nomeAluno encontrada.');
    } else {
      console.log(`⚠️ Total de notificações sem nomeAluno: ${notificacoesSemNome.length}`);
      notificacoesSemNome.forEach((n, i) => {
        console.log(`${i + 1}. ID: ${n._id}, Data: ${n.data || 'sem data'}`);
      });
    }

    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro ao buscar notificações:', err);
    mongoose.disconnect();
  }
})();
