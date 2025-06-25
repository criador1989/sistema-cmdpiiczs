// scripts/restaurar_vinculo_notificacoes.js
const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');
require('dotenv').config();

const mapaVinculos = {
  '50/2025': '664b37e8e8f56c29c14ccdf2',
  '51/2025': '664b37e8e8f56c29c14ccdf2',
  '52/2025': '664b37e8e8f56c29c14ccdf2',
  '53/2025': '664b37e8e8f56c29c14ccdf2',
  '54/2025': '664b37e8e8f56c29c14ccdf2',
  '27/2025': '664b37e8e8f56c29c14ccdf2',
  '01/2024': '664b37e8e8f56c29c14ccdf2',
  '02/2024': '664b37e8e8f56c29c14ccdf2',
  '03/2024': '664b37e8e8f56c29c14ccdf2',
  '04/2024': '664b37e8e8f56c29c14ccdf2',
  '28/2025': '664b37e8e8f56c29c14ccdf2',
  '29/2025': '664b37e8e8f56c29c14ccdf2',
  '24/2025': '664b37e8e8f56c29c14ccdf2',
  '25/2025': '664b37e8e8f56c29c14ccdf2'
};

async function restaurarVinculos() {
  try {
   await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Conectado ao MongoDB.');

    let restauradas = 0;
    let ignoradas = 0;

    for (const [numero, alunoId] of Object.entries(mapaVinculos)) {
      const notificacao = await Notificacao.findOne({ numeroSequencial: numero });

      if (!notificacao) {
        console.warn(`⚠️ Notificação ${numero} não encontrada.`);
        ignoradas++;
        continue;
      }

      notificacao.aluno = alunoId;
      await notificacao.save();
      console.log(`✅ Vinculado ${numero} ao aluno ${alunoId}`);
      restauradas++;
    }

    console.log('\n📊 Resumo:');
    console.log(`🔄 Notificações restauradas: ${restauradas}`);
    console.log(`❌ Notificações não encontradas: ${ignoradas}`);
  } catch (erro) {
    console.error('❌ Erro ao restaurar:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado do MongoDB.');
  }
}

restaurarVinculos();
