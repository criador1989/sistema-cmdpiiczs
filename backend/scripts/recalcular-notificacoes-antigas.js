'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');
const calcularNotaTSMD = require('../utils/calculoNota');

// 🔥 CLASSIFICAÇÃO PADRÃO
function classificar(nota) {
  const n = Number(nota || 0);
  if (n >= 9.5) return 'Excepcional';
  if (n >= 8.5) return 'Ótimo';
  if (n >= 7.0) return 'Bom';
  if (n >= 5.0) return 'Regular';
  if (n >= 3.0) return 'Insuficiente';
  return 'Incompatível';
}

// 🔥 CORRIGE SINAL (NÃO MUDA REGRA DE NEGÓCIO)
function normalizarValor(n) {
  const valor = Number(n.valorNumerico || 0);

  if (n.natureza === 'elogio') {
    return Math.abs(valor);
  }

  return -Math.abs(valor);
}

async function executar() {
  try {
    console.log('🔌 Conectando ao Mongo...');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('📥 Buscando notificações...');
    const notificacoes = await Notificacao.find({})
      .sort({ aluno: 1, data: 1, createdAt: 1 });

    console.log(`📊 Total: ${notificacoes.length}`);

    const cacheAlunos = new Map();

    for (const notif of notificacoes) {

      const alunoId = String(notif.aluno);

      if (!cacheAlunos.has(alunoId)) {
        const aluno = await Aluno.findById(alunoId).lean();
        if (!aluno) continue;
        cacheAlunos.set(alunoId, aluno);
      }

      const aluno = cacheAlunos.get(alunoId);

      // 🔹 histórico anterior
      const anteriores = await Notificacao.find({
        aluno: notif.aluno,
        data: { $lt: notif.data },
        _id: { $ne: notif._id },
        ativo: { $ne: false },
        arquivada: { $ne: true }
      }).sort({ data: 1, createdAt: 1 });

      const notaAnterior = calcularNotaTSMD(
        aluno.dataEntrada,
        notif.data,
        anteriores
      );

      // 🔹 histórico incluindo atual
      const ateAgora = [...anteriores, notif];

      // 🔥 garante sinal correto (sem mudar regra geral)
      ateAgora.forEach(n => {
        n.valorNumerico = normalizarValor(n);
      });

      const notaAtual = calcularNotaTSMD(
        aluno.dataEntrada,
        notif.data,
        ateAgora
      );

      // 🔥 atualização segura
      await Notificacao.updateOne(
        { _id: notif._id },
        {
          $set: {
            valorNumerico: normalizarValor(notif),
            notaAnterior: Number(notaAnterior.toFixed(2)),
            notaAtual: Number(notaAtual.toFixed(2)),
            classificacaoAnterior: classificar(notaAnterior),
            classificacaoAtual: classificar(notaAtual),
          }
        }
      );

      console.log(`✔ Atualizado: ${notif.numeroSequencial}`);
    }

    console.log('✅ RECÁLCULO FINALIZADO COM SUCESSO');
    process.exit();

  } catch (err) {
    console.error('❌ ERRO:', err);
    process.exit(1);
  }
}

executar();