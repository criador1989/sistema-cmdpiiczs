'use strict';

const Notificacao = require('../models/Notificacao');
const Aluno = require('../models/Aluno');
const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
const calcularNotaTSMD = require('./calculoNota');

function classificarComportamento(nota) {
  const n = Number(nota || 0);
  if (n >= 9.5) return 'Excepcional';
  if (n >= 8.5) return 'Ótimo';
  if (n >= 7.0) return 'Bom';
  if (n >= 5.0) return 'Regular';
  if (n >= 3.0) return 'Insuficiente';
  return 'Incompatível';
}

function normalizarValorPorNatureza(notificacao) {
  const valor = Number(notificacao?.valorNumerico || 0);

  if (String(notificacao?.natureza || '').toLowerCase() === 'elogio') {
    return Math.abs(valor);
  }

  return -Math.abs(valor);
}

function getDataBaseAluno(alunoDoc) {
  return (
    alunoDoc?.dataEntrada ||
    alunoDoc?.dataMatricula ||
    alunoDoc?.createdAt ||
    new Date()
  );
}

async function getConfigDisciplinarAluno(alunoDoc) {
  if (!alunoDoc?.instituicao) return null;

  return ConfiguracaoDisciplinar.findOne({
    instituicao: alunoDoc.instituicao
  }).lean();
}

async function recalcularNotificacaoIndividual(notificacaoDoc, alunoDoc, configDisc = null) {
  const config = configDisc || await getConfigDisciplinarAluno(alunoDoc);
  const dataBaseAluno = getDataBaseAluno(alunoDoc);

  const dt = new Date(notificacaoDoc.data || notificacaoDoc.createdAt || new Date());

  const inicioDia = new Date(dt);
  inicioDia.setHours(0, 0, 0, 0);

  const fimDia = new Date(dt);
  fimDia.setHours(23, 59, 59, 999);

  const anteriores = await Notificacao.find({
    aluno: notificacaoDoc.aluno,
    _id: { $ne: notificacaoDoc._id },
    ativo: { $ne: false },
    arquivada: { $ne: true },
    data: { $lt: inicioDia }
  })
    .sort({ data: 1, createdAt: 1 })
    .lean();

  const anterioresNormalizados = anteriores.map(n => ({
    ...n,
    valorNumerico: normalizarValorPorNatureza(n)
  }));

  const notaAnterior = calcularNotaTSMD(
    dataBaseAluno,
    new Date(inicioDia.getTime() - 1),
    anterioresNormalizados,
    config
  );

  const ateODia = await Notificacao.find({
    aluno: notificacaoDoc.aluno,
    ativo: { $ne: false },
    arquivada: { $ne: true },
    data: { $lte: fimDia }
  })
    .sort({ data: 1, createdAt: 1 })
    .lean();

  const ateODiaNormalizado = ateODia.map(n => {
    if (String(n._id) === String(notificacaoDoc._id)) {
      return {
        ...n,
        valorNumerico: normalizarValorPorNatureza(notificacaoDoc)
      };
    }

    return {
      ...n,
      valorNumerico: normalizarValorPorNatureza(n)
    };
  });

  const notaAtual = calcularNotaTSMD(
    dataBaseAluno,
    fimDia,
    ateODiaNormalizado,
    config
  );

  await Notificacao.updateOne(
    { _id: notificacaoDoc._id },
    {
      $set: {
        valorNumerico: normalizarValorPorNatureza(notificacaoDoc),
        notaAnterior: Number(notaAnterior.toFixed(2)),
        notaAtual: Number(notaAtual.toFixed(2)),
        classificacaoAnterior: classificarComportamento(notaAnterior),
        classificacaoAtual: classificarComportamento(notaAtual)
      }
    }
  );
}

async function recalcularAlunoCompleto(alunoId) {
  const aluno = await Aluno.findById(alunoId);
  if (!aluno) return null;

  const configDisc = await getConfigDisciplinarAluno(aluno);
  const dataBaseAluno = getDataBaseAluno(aluno);

  const notificacoes = await Notificacao.find({
    aluno: alunoId,
    ativo: { $ne: false },
    arquivada: { $ne: true }
  }).sort({ data: 1, createdAt: 1 });

  for (const notif of notificacoes) {
    await recalcularNotificacaoIndividual(notif, aluno, configDisc);
  }

  const historicoFinal = await Notificacao.find({
    aluno: alunoId,
    ativo: { $ne: false },
    arquivada: { $ne: true }
  })
    .sort({ data: 1, createdAt: 1 })
    .lean();

  const historicoNormalizado = historicoFinal.map(n => ({
    ...n,
    valorNumerico: normalizarValorPorNatureza(n)
  }));

  const notaFinal = calcularNotaTSMD(
    dataBaseAluno,
    new Date(),
    historicoNormalizado,
    configDisc
  );

  const elogios = historicoNormalizado.filter(
    n => String(n.natureza || '').toLowerCase() === 'elogio'
  ).length;

  const atosIndisciplina = historicoNormalizado.filter(
    n => String(n.natureza || '').toLowerCase() !== 'elogio'
  ).length;

  const notificacoesNegativas = historicoNormalizado.filter(
    n =>
      String(n.natureza || '').toLowerCase() !== 'elogio' &&
      String(n.status || '').toLowerCase() !== 'arquivado'
  ).length;

  aluno.comportamento = Number(notaFinal.toFixed(2));
  aluno.elogios = elogios;
  aluno.atosIndisciplina = atosIndisciplina;
  aluno.notificacoesNegativas = notificacoesNegativas;
  aluno.ultimaAtualizacaoComportamento = new Date();

  await aluno.save();
  return aluno;
}

async function recalcularTodosAlunos() {
  const alunos = await Aluno.find({}).select('_id');
  let total = 0;

  for (const aluno of alunos) {
    await recalcularAlunoCompleto(aluno._id);
    total += 1;
  }

  return { total };
}

module.exports = {
  classificarComportamento,
  normalizarValorPorNatureza,
  recalcularNotificacaoIndividual,
  recalcularAlunoCompleto,
  recalcularTodosAlunos
};