// scripts/remover_vinculos.js
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
require('dotenv').config();

(async () => {
  console.log("🚀 Iniciando remoção de vínculos...");

  try {
    console.log("🌐 Conectando ao MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🟢 Conectado ao MongoDB.");

    console.log("🔍 Buscando notificações com vínculo de aluno...");
    const notificacoesComAluno = await Notificacao.find({ aluno: { $exists: true } });

    console.log(`📄 Total de notificações com aluno: ${notificacoesComAluno.length}`);
    if (notificacoesComAluno.length === 0) {
      console.log("⚠️ Nenhuma notificação com vínculo de aluno encontrada.");
    } else {
      const resultado = await Notificacao.updateMany({}, { $unset: { aluno: "" } });
      console.log(`✅ Vínculos removidos: ${resultado.modifiedCount}`);
    }

  } catch (erro) {
    console.error('❌ Erro ao remover vínculos:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
  }
})();
