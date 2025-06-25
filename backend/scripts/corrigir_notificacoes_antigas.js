const mongoose = require('mongoose');
require('dotenv').config();

const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB');

    // Busca o aluno pelo nome (ou ID direto se preferir)
    const aluno = await Aluno.findOne({ nome: /Quirino Alessandro Cordeiro Gomes/i });

    if (!aluno) {
      console.log('❌ Aluno não encontrado.');
      return;
    }

    // Busca notificações sem campo "aluno" ou com string
    const notificacoes = await Notificacao.find({
      $or: [
        { aluno: null },
        { aluno: { $exists: false } },
        { aluno: aluno._id.toString() } // Se estiver como string
      ]
    });

    console.log(`🔧 Corrigindo ${notificacoes.length} notificações...`);

    for (const n of notificacoes) {
      n.aluno = aluno._id;

      // Se não tiver data, define uma padrão
      if (!n.data) {
        n.data = new Date('2024-01-01T12:00:00Z');
      }

      await n.save();
    }

    console.log('✅ Notificações corrigidas com sucesso.');
    mongoose.disconnect();
  } catch (erro) {
    console.error('❌ Erro ao corrigir notificações:', erro);
    mongoose.disconnect();
  }
})();
