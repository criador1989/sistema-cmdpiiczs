const mongoose = require('mongoose');
require('dotenv').config();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado ao MongoDB.');

    // 🧑‍🎓 Nome do aluno
    const nomeDoAluno = "Quirino Alessandro Cordeiro Gomes";

    // 🔍 Buscar todos os cadastros com o mesmo nome
    const alunos = await Aluno.find({ nome: new RegExp(nomeDoAluno, 'i') });

    if (alunos.length !== 2) {
      console.error(`❌ Esperava 2 cadastros para o aluno, mas encontrei ${alunos.length}. Corrija manualmente.`);
      return;
    }

    // 🧠 Separar o mais antigo e o mais novo com base na data de criação (_id)
    const alunoAntigo = alunos.sort((a, b) => a._id.getTimestamp() - b._id.getTimestamp())[0];
    const alunoNovo = alunos.sort((a, b) => b._id.getTimestamp() - a._id.getTimestamp())[0];

    console.log(`🔁 Transferindo notificações de:\n- Antigo: ${alunoAntigo._id}\n- Novo: ${alunoNovo._id}`);

    // 🔄 Atualizar todas as notificações
    const resultado = await Notificacao.updateMany(
      { aluno: alunoAntigo._id },
      { $set: { aluno: alunoNovo._id } }
    );

    console.log(`✅ ${resultado.modifiedCount} notificações transferidas com sucesso.`);

    mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a transferência:', err);
    mongoose.disconnect();
  }
})();
