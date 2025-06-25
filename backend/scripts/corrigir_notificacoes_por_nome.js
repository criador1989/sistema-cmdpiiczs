const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    const notificacoes = await Notificacao.find({ nomeAluno: { $exists: true, $ne: "" } });

    let corrigidas = 0;
    let ignoradas = 0;

    for (const n of notificacoes) {
      const aluno = await Aluno.findOne({
        nome: new RegExp(n.nomeAluno, 'i'),
        instituicao: n.instituicao // importante garantir a instituição correta
      });

      if (aluno) {
        n.aluno = aluno._id;
        await n.save();
        corrigidas++;
        console.log(`✅ Notificação ${n._id} associada a ${aluno.nome}`);
      } else {
        ignoradas++;
        console.log(`⚠️ Aluno não encontrado para: ${n.nomeAluno}`);
      }
    }

    console.log(`\n🔧 Total corrigidas: ${corrigidas}`);
    console.log(`❌ Total ignoradas (sem aluno correspondente): ${ignoradas}`);

    mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
  } catch (err) {
    console.error('❌ Erro durante a correção:', err);
    mongoose.disconnect();
  }
})();
