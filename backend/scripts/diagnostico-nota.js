// scripts/diagnostico-nota.js
//
// Diagnóstico de cálculo de nota de comportamento para um aluno específico
// Uso: node scripts/diagnostico-nota.js <alunoId> [dataInicio] [dataFim]

const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const calcularNotaTSMD = require('../utils/calculoNota');

const MONGO_URI = 'mongodb+srv://admin:admin123@cluster0.yyf7zhy.mongodb.net/colegiomilitar?retryWrites=true&w=majority';

(async () => {
  try {
    const [, , alunoId, dataInicio, dataFim] = process.argv;
    if (!alunoId) {
      console.log('❌ Informe o ID do aluno.');
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('🔗 Conectado ao MongoDB\n');

    const aluno = await Aluno.findById(alunoId).lean();
    if (!aluno) {
      console.log('Aluno não encontrado.');
      process.exit(1);
    }

    console.log(`🧩 Aluno: ${aluno.nome} (${aluno.turma})`);
    console.log(`Data de entrada: ${aluno.dataEntrada ? aluno.dataEntrada.toISOString().split('T')[0] : '—'}`);

    const inicio = dataInicio ? new Date(dataInicio) : aluno.dataEntrada || new Date(2000, 0, 1);
    const fim = dataFim ? new Date(dataFim) : new Date();

    const historico = await Notificacao.find({ aluno: alunoId })
      .select('data valorNumerico quantidadeDias tipoMedida natureza motivo createdAt')
      .sort({ data: 1 })
      .lean();

    console.log('\n— Histórico bruto —');
    historico.forEach(n => {
      console.log(
        `${n.data?.toISOString().slice(0,10) || n.createdAt?.toISOString().slice(0,10)} | ${n.tipoMedida || '?'} | ${n.motivo || '?'} | ${n.valorNumerico} | ${n.quantidadeDias || 1}`
      );
    });

    const nota = calcularNotaTSMD(inicio, fim, historico);
    console.log('\n— Resultado —');
    console.log('Nota calculada:', nota.toFixed(2));

    process.exit(0);
  } catch (err) {
    console.error('Erro no diagnóstico:', err);
    process.exit(1);
  }
})();
