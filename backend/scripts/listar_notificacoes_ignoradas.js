const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    // 🔎 Busca notificações com nomeAluno mas sem aluno associado
    const notificacoesIgnoradas = await Notificacao.find({
      $or: [
        { aluno: null },
        { aluno: { $exists: false } },
      ],
      nomeAluno: { $exists: true, $ne: "" }
    });

    if (notificacoesIgnoradas.length === 0) {
      console.log('✅ Nenhuma notificação ignorada encontrada.');
      mongoose.disconnect();
      return;
    }

    let nomesNaoEncontrados = [];

    for (const notif of notificacoesIgnoradas) {
      const nome = notif.nomeAluno.trim();
      const aluno = await Aluno.findOne({ nome: new RegExp(`^${nome}$`, 'i') });

      if (!aluno) {
        nomesNaoEncontrados.push(nome);
      }
    }

    // 📋 Mostra os nomes únicos
    const unicos = [...new Set(nomesNaoEncontrados)];

    console.log(`⚠️ Total de nomes não encontrados: ${unicos.length}`);
    console.log('🧾 Lista:');
    unicos.forEach((n, i) => console.log(`${i + 1}. ${n}`));

    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro ao listar notificações ignoradas:', err);
    mongoose.disconnect();
  }
})();
