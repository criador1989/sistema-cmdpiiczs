'use strict';

const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const ComportamentoSnapshot = require('../models/ComportamentoSnapshot');

function inicioDoDia(data = new Date()) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(data = new Date()) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

function numeroSeguro(valor, padrao = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

function obterNomeTurma(aluno) {
  if (!aluno) return '';

  if (aluno.turma?.nome) return aluno.turma.nome;
  if (aluno.turmaNome) return aluno.turmaNome;
  if (aluno.turmaTexto) return aluno.turmaTexto;
  if (typeof aluno.turma === 'string') return aluno.turma;

  return '';
}

function obterIdTurma(aluno) {
  if (!aluno) return null;

  if (aluno.turma?._id) return aluno.turma._id;

  if (aluno.turma && mongoose.Types.ObjectId.isValid(String(aluno.turma))) {
    return aluno.turma;
  }

  return null;
}

function obterNotaComportamento(aluno) {
  return numeroSeguro(
    aluno?.comportamento?.notaAtual ??
      aluno?.comportamento?.nota ??
      aluno?.notaComportamento ??
      aluno?.comportamentoNota,
    8
  );
}

function obterFaixaComportamento(aluno, nota) {
  if (aluno?.comportamento?.faixa) return aluno.comportamento.faixa;
  if (aluno?.faixaComportamento) return aluno.faixaComportamento;

  if (nota >= 9) return 'Excepcional';
  if (nota >= 8) return 'Ótimo';
  if (nota >= 7) return 'Bom';
  if (nota >= 5) return 'Regular';
  if (nota >= 3) return 'Insuficiente';

  return 'Incompatível';
}

function alunoEstaAtivo(aluno) {
  const status = String(aluno?.status || aluno?.situacao || '').toLowerCase();

  if (status.includes('transfer')) return false;
  if (status.includes('inativo')) return false;
  if (status.includes('deslig')) return false;
  if (status.includes('cancel')) return false;

  if (aluno?.ativo === false) return false;

  return true;
}

function montarFiltroAlunoInstituicao(instituicaoId) {
  return {
    instituicao: instituicaoId,
  };
}

function montarFiltroNotificacoesAluno({ instituicaoId, alunoId, ate }) {
  return {
    instituicao: instituicaoId,
    aluno: alunoId,
    createdAt: { $lte: fimDoDia(ate) },
  };
}

async function obterResumoNotificacoes({ instituicaoId, alunoId, ate }) {
  const filtro = montarFiltroNotificacoesAluno({ instituicaoId, alunoId, ate });

  const notificacoes = await Notificacao.find(filtro)
    .select('status deferida tipo ocorrencia motivo valor pontuacao createdAt')
    .lean();

  let totalOcorrenciasPositivas = 0;
  let totalOcorrenciasNegativas = 0;
  let totalNotificacoesDeferidas = 0;
  let totalElogios = 0;
  let totalMedidas = 0;

  for (const n of notificacoes) {
    const status = String(n.status || '').toLowerCase();
    const tipo = String(n.tipo || n.ocorrencia?.tipo || '').toLowerCase();
    const motivo = String(n.motivo || n.ocorrencia?.nome || '').toLowerCase();

    const deferida =
      n.deferida === true ||
      status.includes('defer') ||
      status.includes('aprov');

    if (deferida) totalNotificacoesDeferidas += 1;

    const valor = numeroSeguro(
      n.valor ?? n.pontuacao ?? n.ocorrencia?.valor,
      0
    );

    const pareceElogio =
      tipo.includes('positivo') ||
      tipo.includes('elogio') ||
      motivo.includes('elogio') ||
      valor > 0;

    const pareceNegativa =
      tipo.includes('negativo') ||
      motivo.includes('advert') ||
      motivo.includes('repreens') ||
      motivo.includes('medida') ||
      valor < 0;

    if (pareceElogio) {
      totalOcorrenciasPositivas += 1;
      totalElogios += 1;
    }

    if (pareceNegativa) {
      totalOcorrenciasNegativas += 1;
      totalMedidas += 1;
    }
  }

  return {
    totalNotificacoes: notificacoes.length,
    totalNotificacoesDeferidas,
    totalOcorrenciasPositivas,
    totalOcorrenciasNegativas,
    saldoOcorrencias: totalOcorrenciasPositivas - totalOcorrenciasNegativas,
    totalElogios,
    totalMedidas,
  };
}

async function gerarSnapshotAluno({ aluno, instituicaoId, data = new Date(), origem = 'automatico' }) {
  const dataReferencia = inicioDoDia(data);
  const anoReferencia = dataReferencia.getFullYear();
  const mesReferencia = dataReferencia.getMonth() + 1;
  const diaReferencia = dataReferencia.getDate();

  const notaComportamento = obterNotaComportamento(aluno);
  const faixaComportamento = obterFaixaComportamento(aluno, notaComportamento);
  const resumo = await obterResumoNotificacoes({
    instituicaoId,
    alunoId: aluno._id,
    ate: dataReferencia,
  });

  const payload = {
    instituicao: instituicaoId,
    aluno: aluno._id,
    alunoNome: aluno.nome || aluno.nomeCompleto || '',
    turma: obterIdTurma(aluno),
    turmaNome: obterNomeTurma(aluno),
    anoReferencia,
    mesReferencia,
    diaReferencia,
    dataReferencia,
    notaComportamento,
    faixaComportamento,
    ...resumo,
    origem,
    ativoAlunoNoMomento: alunoEstaAtivo(aluno),
  };

  await ComportamentoSnapshot.findOneAndUpdate(
    {
      instituicao: instituicaoId,
      aluno: aluno._id,
      anoReferencia,
      mesReferencia,
      diaReferencia,
    },
    {
      $set: payload,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return payload;
}

async function gerarSnapshotsComportamento({
  instituicaoId,
  data = new Date(),
  origem = 'automatico',
} = {}) {
  if (!instituicaoId) {
    throw new Error('instituicaoId é obrigatório para gerar snapshots de comportamento.');
  }

  const alunos = await Aluno.find(montarFiltroAlunoInstituicao(instituicaoId))
    .populate('turma', 'nome')
    .lean();

  let total = 0;
  let erros = 0;

  for (const aluno of alunos) {
    try {
      await gerarSnapshotAluno({
        aluno,
        instituicaoId,
        data,
        origem,
      });

      total += 1;
    } catch (err) {
      erros += 1;
      console.error('[snapshot-comportamento] erro ao gerar snapshot do aluno:', {
        aluno: aluno?._id,
        nome: aluno?.nome,
        erro: err.message,
      });
    }
  }

  return {
    instituicao: instituicaoId,
    dataReferencia: inicioDoDia(data),
    total,
    erros,
  };
}

async function gerarSnapshotsTodasInstituicoes({
  data = new Date(),
  origem = 'automatico',
} = {}) {
  const Instituicao = require('../models/Instituicao');

  const instituicoes = await Instituicao.find({})
    .select('_id nome slug ativo')
    .lean();

  const resultados = [];

  for (const inst of instituicoes) {
    try {
      const resultado = await gerarSnapshotsComportamento({
        instituicaoId: inst._id,
        data,
        origem,
      });

      resultados.push({
        instituicao: inst._id,
        nome: inst.nome,
        ...resultado,
      });
    } catch (err) {
      resultados.push({
        instituicao: inst._id,
        nome: inst.nome,
        erro: err.message,
      });

      console.error('[snapshot-comportamento] erro na instituição:', {
        instituicao: inst._id,
        nome: inst.nome,
        erro: err.message,
      });
    }
  }

  return resultados;
}

module.exports = {
  gerarSnapshotAluno,
  gerarSnapshotsComportamento,
  gerarSnapshotsTodasInstituicoes,
};