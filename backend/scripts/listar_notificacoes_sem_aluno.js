// scripts/listar_notificacoes_sem_aluno.js
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
require('dotenv').config();

async function listarSemAluno() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.\n');

    const notificacoes = await Notificacao.find({
      $or: [{ aluno: null }, { aluno: { $exists: false } }]
    }).sort({ createdAt: -1 });

    if (notificacoes.length === 0) {
      console.log('✅ Todas as notificações possuem vínculo com aluno.');
    } else {
      console.log(`🔎 ${notificacoes.length} notificações sem vínculo:\n`);
      notificacoes.forEach((n) => {
        console.log(`🆔 ${n._id} | Nº ${n.numeroSequencial || '-'} | Motivo: ${n.motivo}`);
      });
    }
  } catch (err) {
    console.error('❌ Erro ao buscar notificações:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado do MongoDB.');
  }
}

listarSemAluno();
