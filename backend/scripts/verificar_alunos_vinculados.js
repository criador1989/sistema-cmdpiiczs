const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
require('dotenv').config();

async function verificarAlunosVinculados() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.');

    const notificacoes = await Notificacao.find({});
    console.log(`📦 Total de notificações encontradas: ${notificacoes.length}`);

    let comAluno = 0;
    let semAluno = 0;

    for (const n of notificacoes) {
      if (n.aluno) {
        console.log(`✅ Notificação ${n._id} vinculada ao aluno ${n.aluno}`);
        comAluno++;
      } else {
        console.warn(`❌ Notificação ${n._id} sem vínculo de aluno`);
        semAluno++;
      }
    }

    console.log('\n📊 Resumo Final:');
    console.log(`🔗 Com aluno: ${comAluno}`);
    console.log(`🚫 Sem aluno: ${semAluno}`);

  } catch (erro) {
    console.error('❌ Erro na verificação:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
  }
}

verificarAlunosVinculados();
