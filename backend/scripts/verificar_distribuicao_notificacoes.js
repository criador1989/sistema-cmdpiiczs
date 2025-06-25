const mongoose = require('mongoose');
require('dotenv').config();

const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');

(async () => {
  try {
    console.log("🚀 Iniciando verificação de distribuição de notificações...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado ao MongoDB.");

    const alunos = await Aluno.find({});
    console.log(`📚 Total de alunos encontrados: ${alunos.length}`);

    const distribuicao = [];

    for (const aluno of alunos) {
      const total = await Notificacao.countDocuments({ aluno: aluno._id });
      if (total > 0) {
        distribuicao.push({
          nome: aluno.nome,
          turma: aluno.turma,
          codigoAcesso: aluno.codigoAcesso,
          totalNotificacoes: total
        });
      }
    }

    if (distribuicao.length > 0) {
      console.table(distribuicao);
    } else {
      console.log("⚠️ Nenhuma notificação encontrada para nenhum aluno.");
    }

    console.log(`📊 Total de alunos com notificações: ${distribuicao.length}`);
    mongoose.disconnect();
  } catch (err) {
    console.error("❌ Erro ao verificar notificações:", err);
    mongoose.disconnect();
  }
})();
