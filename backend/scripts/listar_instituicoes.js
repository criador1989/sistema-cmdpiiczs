'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

// 🔹 Ajuste o caminho se necessário
const Instituicao = require('../models/Instituicao');

async function listarInstituicoes() {
  try {
    console.log('🔐 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('✅ Conectado com sucesso!\n');

    const instituicoes = await Instituicao.find().lean();

    if (!instituicoes.length) {
      console.log('⚠️ Nenhuma instituição encontrada neste banco.');
    } else {
      console.log(`📊 Total de instituições: ${instituicoes.length}\n`);

      instituicoes.forEach((inst, index) => {
        console.log(`🏫 ${index + 1}. ${inst.nome || 'Sem nome'}`);
        console.log(`   🆔 ID: ${inst._id}`);
        console.log(`   🔗 Slug: ${inst.slug || '—'}`);
        console.log(`   📅 Criado em: ${inst.createdAt || '—'}`);
        console.log('-----------------------------------');
      });
    }

  } catch (erro) {
    console.error('❌ Erro ao listar instituições:', erro);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Conexão encerrada.');
  }
}

listarInstituicoes();