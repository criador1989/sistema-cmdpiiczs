// backend/scripts/corrigir_notificacoes_automatico_20250624_204626.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

const MONGO_URI = process.env.MONGO_URI;

async function conectar() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB Atlas.");
  } catch (erro) {
    console.error("❌ Erro ao conectar ao MongoDB:", erro);
    process.exit(1);
  }
}

async function corrigirNotificacoes() {
  try {
    const alunos = await Aluno.find({});
    const mapaAlunos = new Map(alunos.map(aluno => [aluno.nome.trim(), aluno._id]));

    const notificacoes = await Notificacao.find({});
    let totalCorrigidas = 0;

    for (const notificacao of notificacoes) {
      if (!notificacao.aluno || typeof notificacao.aluno === 'string') {
        const alunoId = mapaAlunos.get(notificacao.nomeAluno?.trim());
        if (alunoId) {
          notificacao.aluno = alunoId;
          await notificacao.save();
          totalCorrigidas++;
        }
      }
    }

    console.log(`✅ Total de notificações corrigidas: ${totalCorrigidas}`);
  } catch (erro) {
    console.error("❌ Erro durante a correção:", erro);
  } finally {
    mongoose.disconnect();
  }
}

(async () => {
  await conectar();
  await corrigirNotificacoes();
})();
