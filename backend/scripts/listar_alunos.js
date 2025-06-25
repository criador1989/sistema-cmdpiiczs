const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
require('dotenv').config();

async function listarAlunos() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.\n');

    const alunos = await Aluno.find({}, { nome: 1, turma: 1 });

    if (alunos.length === 0) {
      console.log('Nenhum aluno encontrado.');
      return;
    }

    console.log('📚 Lista de Alunos:\n');
    alunos.forEach(aluno => {
      console.log(`🆔 ${aluno._id} | 👤 ${aluno.nome} | 🏫 Turma: ${aluno.turma}`);
    });

  } catch (erro) {
    console.error('❌ Erro ao listar alunos:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado do MongoDB.');
  }
}

listarAlunos();
