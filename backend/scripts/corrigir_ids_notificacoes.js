const mongoose = require('mongoose');
require('dotenv').config();
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado ao MongoDB.");

    const notificacoes = await Notificacao.find({});
    let corrigidas = 0;

    for (const n of notificacoes) {
      if (typeof n.aluno === 'string') {
        try {
          const idValido = new mongoose.Types.ObjectId(n.aluno);
          n.aluno = idValido;
          await n.save();
          corrigidas++;
        } catch (e) {
          console.warn("⚠️ ID inválido ignorado:", n.aluno);
        }
      }
    }

    console.log(`✅ Total de notificações corrigidas: ${corrigidas}`);
    mongoose.disconnect();
  } catch (err) {
    console.error("❌ Erro ao conectar ou corrigir:", err);
    mongoose.disconnect();
  }
})();
