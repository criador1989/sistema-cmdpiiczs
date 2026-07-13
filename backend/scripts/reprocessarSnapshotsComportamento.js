'use strict';

require('dotenv').config();

const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const Instituicao = require('../models/Instituicao');
const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
const ComportamentoSnapshot = require('../models/ComportamentoSnapshot');

const calcularNotaTSMD = require('../utils/calculoNota');
const {
  classificarComportamento,
  normalizarValorPorNatureza
} = require('../utils/recalculoComportamento');

function getDataBaseAluno(aluno) {
  return aluno?.dataEntrada || aluno?.dataMatricula || aluno?.createdAt || new Date();
}

function fimDoMes(ano, mes) {
  return new Date(ano, mes, 0, 23, 59, 59, 999);
}

function gerarMeses(inicio, fim) {
  const meses = [];
  const atual = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

  while (atual <= fim) {
    meses.push({
      ano: atual.getFullYear(),
      mes: atual.getMonth() + 1,
      data: fimDoMes(atual.getFullYear(), atual.getMonth() + 1)
    });

    atual.setMonth(atual.getMonth() + 1);
  }

  return meses;
}

function nomeTurma(aluno) {
  if (aluno?.turma?.nome) return aluno.turma.nome;
  return aluno?.turmaNome || aluno?.turmaTexto || '';
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGODB_URI/MONGO_URI não encontrado no .env');

  const inicioArg = process.argv[2] || '2025-02-01';
  const fimArg = process.argv[3] || new Date().toISOString().slice(0, 10);

  const inicio = new Date(`${inicioArg}T00:00:00`);
  const fim = new Date(`${fimArg}T23:59:59`);

  console.log('[histórico] conectando...');
  await mongoose.connect(mongoUri);

  console.log(`[histórico] período: ${inicioArg} até ${fimArg}`);

  const meses = gerarMeses(inicio, fim);
  const instituicoes = await Instituicao.find({}).select('_id nome').lean();

  for (const inst of instituicoes) {
    console.log(`\n[histórico] ${inst.nome}`);

    const configDisc = await ConfiguracaoDisciplinar.findOne({
      instituicao: inst._id
    }).lean();

    const alunos = await Aluno.find({ instituicao: inst._id })
      .populate('turma', 'nome')
      .lean();

    let processados = 0;
    let snapshots = 0;

    for (const aluno of alunos) {
      const dataBaseAluno = getDataBaseAluno(aluno);

      const notificacoes = await Notificacao.find({
        aluno: aluno._id,
        ativo: { $ne: false },
        arquivada: { $ne: true }
      })
        .sort({ data: 1, createdAt: 1 })
        .lean();

      for (const mesInfo of meses) {
        const historicoAteMes = notificacoes
          .filter(n => {
            const dataNotif = new Date(n.data || n.createdAt);
            return dataNotif <= mesInfo.data;
          })
          .map(n => ({
            ...n,
            valorNumerico: normalizarValorPorNatureza(n)
          }));

        const nota = calcularNotaTSMD(
          dataBaseAluno,
          mesInfo.data,
          historicoAteMes,
          configDisc
        );

        const notaFinal = Number(Number(nota || 0).toFixed(2));

        await ComportamentoSnapshot.findOneAndUpdate(
          {
            instituicao: inst._id,
            aluno: aluno._id,
            anoReferencia: mesInfo.ano,
            mesReferencia: mesInfo.mes,
            diaReferencia: 1
          },
          {
            $set: {
              instituicao: inst._id,
              aluno: aluno._id,
              alunoNome: aluno.nome || aluno.nomeCompleto || '',
              turma:
                aluno.turma?._id ||
                (mongoose.Types.ObjectId.isValid(String(aluno.turma)) ? aluno.turma : null),
              turmaNome: nomeTurma(aluno),
              anoReferencia: mesInfo.ano,
              mesReferencia: mesInfo.mes,
              diaReferencia: 1,
              dataReferencia: mesInfo.data,
              notaComportamento: notaFinal,
              faixaComportamento: classificarComportamento(notaFinal),
              totalNotificacoes: historicoAteMes.length,
              totalOcorrenciasPositivas: historicoAteMes.filter(n => String(n.natureza || '').toLowerCase() === 'elogio').length,
              totalOcorrenciasNegativas: historicoAteMes.filter(n => String(n.natureza || '').toLowerCase() !== 'elogio').length,
              saldoOcorrencias:
                historicoAteMes.filter(n => String(n.natureza || '').toLowerCase() === 'elogio').length -
                historicoAteMes.filter(n => String(n.natureza || '').toLowerCase() !== 'elogio').length,
              origem: 'reprocessamento'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        snapshots++;
      }

      processados++;

      if (processados % 50 === 0) {
        console.log(`[histórico] ${processados}/${alunos.length} alunos processados... snapshots: ${snapshots}`);
      }
    }

    console.log(`[histórico] ${inst.nome}: ${processados} alunos, ${snapshots} snapshots.`);
  }

  await mongoose.disconnect();
  console.log('\n[histórico] FINALIZADO COM SUCESSO');
}

main().catch(async err => {
  console.error('[histórico] erro:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});