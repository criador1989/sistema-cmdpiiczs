const mongoose = require('mongoose');
require('dotenv').config();
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado ao MongoDB.");

    // Buscar notificações com aluno como string (inválido)
    const notificacoes = await Notificacao.find({
      aluno: { $type: 'string' }
    });

    console.log(`🔍 Encontradas ${notificacoes.length} notificações com aluno em formato incorreto.`);

    let corrigidas = 0;

    for (const n of notificacoes) {
      try {
        const idCorrigido = new mongoose.Types.ObjectId(n.aluno);
        n.aluno = idCorrigido;
        await n.save();
        corrigidas++;
      } catch (e) {
        console.warn(`⚠️ Erro ao converter ID: ${n.aluno}`);
      }
    }

    console.log(`✅ Corrigidas ${corrigidas} notificações com aluno como ObjectId.`);
    mongoose.disconnect();
  } catch (erro) {
    console.error("❌ Erro geral:", erro);
    mongoose.disconnect();
  }
})();
