// scripts/restaurar_notificacoes_para_alunos_corretos.js
const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    console.clear();
    console.log("\n🚀 Iniciando restauração de notificações...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🟢 Conectado ao MongoDB.");

    const notificacoes = await Notificacao.find({ aluno: { $in: [null, undefined] } });
    console.log(`🔍 Notificações sem aluno encontradas: ${notificacoes.length}`);

    const anoAtual = new Date().getFullYear();
    let contador = 1;

    const ultima = await Notificacao.find({
      numeroSequencial: { $regex: `/${anoAtual}$` }
    }).sort({ createdAt: -1 }).limit(1);

    if (ultima.length > 0) {
      const ultNum = parseInt(ultima[0].numeroSequencial.split('/')[0]);
      if (!isNaN(ultNum)) contador = ultNum + 1;
    }

    let totalRestauradas = 0;
    let totalIgnoradas = 0;

    for (const n of notificacoes) {
      if (!n.nomeAluno) {
        console.log(`⚠️ Notificação ignorada (sem nomeAluno): ID ${n._id}`);
        totalIgnoradas++;
        continue;
      }

      const aluno = await Aluno.findOne({ nome: new RegExp(`^${n.nomeAluno}$`, 'i') });
      if (!aluno) {
        console.log(`❌ Aluno não encontrado para: ${n.nomeAluno}`);
        totalIgnoradas++;
        continue;
      }

      n.aluno = aluno._id;

      if (!n.numeroSequencial) {
        n.numeroSequencial = `${String(contador).padStart(2, '0')}/${anoAtual}`;
        contador++;
      }

      await n.save();
      console.log(`✅ Notificação restaurada para ${n.nomeAluno} (${aluno._id})`);
      totalRestauradas++;
    }

    console.log(`\n📊 Resumo da Restauração:`);
    console.log(`🔄 Notificações restauradas: ${totalRestauradas}`);
    console.log(`⚠️ Notificações ignoradas: ${totalIgnoradas}`);

    await mongoose.disconnect();
    console.log("🔌 Desconectado do MongoDB.");
  } catch (erro) {
    console.error("❌ Erro durante a restauração:", erro);
    await mongoose.disconnect();
  }
})();
