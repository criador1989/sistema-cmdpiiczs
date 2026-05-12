'use strict';

const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const calcularNotaTSMD = require('./calculoNota');

const {
  getConfigDisciplinar,
  getClassificacaoComportamento
} = require('./configuracaoDisciplinar');

function buildTenantMatch(instituicao) {
  if (!instituicao) return { _id: null };

  const asStr = String(instituicao);
  const or = [
    { instituicao: asStr },
    { tenantId: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ instituicao: oid });
    or.push({ tenantId: oid });
  }

  return { $or: or };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fix2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function normalizarValorPorNatureza(natureza, valor) {
  const bruto = toNumber(valor, 0);
  return normalizeText(natureza) === 'elogio'
    ? Math.abs(bruto)
    : -Math.abs(bruto);
}

function getDataEvento(n) {
  return n?.data || n?.createdAt || new Date();
}

function ehElogio(n) {
  const natureza = normalizeText(n?.natureza);
  const tipo = normalizeText(n?.tipo);
  const tipoMedida = normalizeText(n?.tipoMedida);

  return natureza === 'elogio' || tipo === 'elogio' || tipoMedida === 'elogio';
}

function ehIndisciplina(n) {
  if (ehElogio(n)) return false;

  const natureza = normalizeText(n?.natureza);
  const valor = toNumber(n?.valorNumerico, 0);

  return natureza === 'indisciplina' || valor < 0;
}

/**
 * Recalcula TODA a linha histórica comportamental do aluno.
 *
 * Isso corrige automaticamente:
 * - notaAnterior
 * - notaAtual
 * - classificacaoAnterior
 * - classificacaoAtual
 * - comportamento atual do aluno
 *
 * Especialmente importante para notificações lançadas hoje
 * com data retroativa.
 */
async function recalcularHistoricoComportamentoAluno({
  alunoId,
  instituicao
}) {
  if (!alunoId || !instituicao) {
    return {
      ok: false,
      motivo: 'alunoId ou instituição ausente'
    };
  }

  const tenantMatch = buildTenantMatch(instituicao);

  const aluno = await Aluno.findOne({
    _id: alunoId,
    ...tenantMatch
  });

  if (!aluno) {
    return {
      ok: false,
      motivo: 'aluno não encontrado'
    };
  }

  const config = await getConfigDisciplinar(instituicao);

  const notificacoes = await Notificacao.find({
    aluno: aluno._id,
    ...tenantMatch,
    ativo: { $ne: false },
    arquivada: { $ne: true }
  })
    .sort({ data: 1, createdAt: 1, _id: 1 });

  const eventos = [];
  const historico = [];

  for (const notif of notificacoes) {
    const valorCorrigido = normalizarValorPorNatureza(
      notif.natureza,
      notif.valorNumerico
    );

    const eventoAtual = {
      _id: String(notif._id),
      data: notif.data || null,
      createdAt: notif.createdAt || null,
      valorNumerico: valorCorrigido,
      quantidadeDias: notif.quantidadeDias ?? 1,
      tipoMedida: notif.tipoMedida || notif.tipo || '',
      natureza: notif.natureza || ''
    };

    const dataReferencia = getDataEvento(notif);

    const notaAnterior = calcularNotaTSMD(
      aluno.dataEntrada,
      dataReferencia,
      eventos,
      config
    );

    const notaAtual = calcularNotaTSMD(
      aluno.dataEntrada,
      dataReferencia,
      [...eventos, eventoAtual],
      config
    );

    const notaAnteriorFmt = fix2(notaAnterior);
    const notaAtualFmt = fix2(notaAtual);

    const classificacaoAnterior = getClassificacaoComportamento(
      notaAnteriorFmt,
      config
    );

    const classificacaoAtual = getClassificacaoComportamento(
      notaAtualFmt,
      config
    );

    historico.push({
      _id: String(notif._id),
      data: notif.data,
      createdAt: notif.createdAt,
      tipo: notif.tipo,
      tipoMedida: notif.tipoMedida,
      natureza: notif.natureza,
      motivo: notif.motivo,
      valorNumerico: valorCorrigido,
      notaAnterior: notaAnteriorFmt,
      notaAtual: notaAtualFmt,
      classificacaoAnterior,
      classificacaoAtual
    });

    eventos.push(eventoAtual);
  }

  const notaFinal = calcularNotaTSMD(
    aluno.dataEntrada,
    new Date(),
    eventos,
    config
  );

  const bulkOps = historico.map((h) => ({
    updateOne: {
      filter: {
        _id: h._id,
        ...tenantMatch
      },
      update: {
        $set: {
          valorNumerico: h.valorNumerico,
          notaAnterior: h.notaAnterior,
          notaAtual: h.notaAtual,
          classificacaoAnterior: h.classificacaoAnterior,
          classificacaoAtual: h.classificacaoAtual
        }
      }
    }
  }));

  if (bulkOps.length) {
    await Notificacao.bulkWrite(bulkOps);
  }

  let elogios = 0;
  let atosIndisciplina = 0;
  let notificacoesNegativas = 0;

  for (const n of notificacoes) {
    if (ehElogio(n)) elogios += 1;
    if (ehIndisciplina(n)) {
      atosIndisciplina += 1;
      notificacoesNegativas += 1;
    }
  }

  aluno.comportamento = fix2(notaFinal);
  aluno.elogios = elogios;
  aluno.atosIndisciplina = atosIndisciplina;
  aluno.notificacoesNegativas = notificacoesNegativas;
  aluno.ultimaAtualizacaoComportamento = new Date();

  await aluno.save();

  return {
    ok: true,
    aluno,
    notaFinal: aluno.comportamento,
    totalNotificacoes: notificacoes.length,
    historico
  };
}

module.exports = {
  recalcularHistoricoComportamentoAluno
};