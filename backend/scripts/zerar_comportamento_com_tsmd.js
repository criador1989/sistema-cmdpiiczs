// scripts/zerar_comportamento_com_tsmd.js
const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const calcularNotaTSMD = require('../utils/calculoNota');
require('dotenv').config();

console.log("🚀 Iniciando atualização de comportamento de todos os alunos com base no T.S.M.D...");

async function atualizarTodos() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🟢 Conectado ao MongoDB");

    const alunos = await Aluno.find({});
    console.log(`👥 Total de alunos encontrados: ${alunos.length}`);

    for (const aluno of alunos) {
      if (!aluno.dataEntrada) {
        console.warn(`⚠️ Aluno ${aluno.nome} não possui data de entrada.`);
        continue;
      }

      const novaNota = calcularNotaTSMD(aluno.dataEntrada, new Date(), []);
      aluno.comportamento = parseFloat(novaNota.toFixed(2));
      await aluno.save();

      console.log(`✅ ${aluno.nome} atualizado para nota ${aluno.comportamento}`);
    }

    console.log("✅ Todos os alunos foram atualizados com sucesso.");
  } catch (erro) {
    console.error("❌ Erro durante a atualização:", erro);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Desconectado do MongoDB.");
  }
}

atualizarTodos();
