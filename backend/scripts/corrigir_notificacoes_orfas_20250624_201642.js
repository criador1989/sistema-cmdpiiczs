'use strict';

require('dotenv').config();


// Script: corrigir_notificacoes_orfas_20250624_201642.js
// Finalidade: Encontrar e remover notificações órfãs (sem aluno vinculado)

const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGO_URI) {
  throw new Error('Variável MONGODB_URI, MONGO_URI ou MONGO_URL não encontrada no ambiente.');
}

async function executar() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB.");

    const notificacoes = await Notificacao.find();
    let totalOrfas = 0;

    for (const notif of notificacoes) {
      const alunoExiste = await Aluno.exists({ _id: notif.aluno });
      if (!alunoExiste) {
        console.warn(`⚠️ Notificação órfã encontrada: ID=${notif._id}, removendo...`);
        await notif.deleteOne();
        totalOrfas++;
      }
    }

    console.log(`🧹 Total de notificações órfãs removidas: ${totalOrfas}`);
    process.exit(0);
  } catch (erro) {
    console.error("❌ Erro durante execução:", erro);
    process.exit(1);
  }
}

executar();
