'use strict';

const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const PortalAlunoAtividade = require('../models/PortalAlunoAtividade');

const TIPOS = new Set([
  'portal_acesso',
  'simulados_abriu',
  'simulado_abriu',
  'questao_abriu',
  'revisao_questao',
  'revisao_conteudo',
  'revisao_concluida',
]);

function oid(valor) {
  if (!valor) return null;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  return mongoose.Types.ObjectId.isValid(String(valor))
    ? new mongoose.Types.ObjectId(String(valor))
    : null;
}

function instituicaoReq(req) {
  return oid(req?.usuario?.instituicao || req?.usuario?.tenantId);
}

function alunoReq(req) {
  return oid(req?.usuario?.alunoId);
}

function usuarioReq(req) {
  return oid(req?.usuario?.id || req?.usuario?._id);
}

function detalheSeguro(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function progressoSeguro(progresso = {}) {
  const total = Math.max(0, Number(progresso.totalQuestoesRevisao || 0));
  const revisadas = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Number(progresso.revisadas || 0)));
  const percentual = total > 0
    ? Math.max(0, Math.min(100, Math.round((revisadas / total) * 100)))
    : 0;

  return {
    resultadoId: oid(progresso.resultadoId),
    simuladoId: oid(progresso.simuladoId),
    titulo: String(progresso.titulo || '').trim(),
    totalQuestoesRevisao: total,
    revisadas,
    percentual,
    concluido: Boolean(progresso.concluido || (total > 0 && revisadas >= total)),
    atualizadoEm: new Date(),
  };
}

async function snapshotAluno({ instituicaoId, alunoId, aluno }) {
  if (aluno && (aluno.nome || aluno.turma || aluno.codigoAcesso)) {
    return {
      nome: String(aluno.nome || '').trim(),
      turma: String(aluno.turma || '').trim(),
      codigo: String(aluno.codigoAcesso || '').trim(),
    };
  }

  const doc = await Aluno.findOne({
    _id: alunoId,
    $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
  })
    .select('nome turma codigoAcesso')
    .lean()
    .catch(() => null);

  return {
    nome: String(doc?.nome || '').trim(),
    turma: String(doc?.turma || '').trim(),
    codigo: String(doc?.codigoAcesso || '').trim(),
  };
}

async function registrarAtividadePortalAluno({
  req,
  tipo,
  aluno = null,
  resultadoId = null,
  simuladoId = null,
  simuladoTitulo = '',
  detalhe = '',
  progresso = null,
}) {
  const tipoNormalizado = String(tipo || '').trim();
  if (!TIPOS.has(tipoNormalizado)) return null;

  const instituicaoId = instituicaoReq(req);
  const alunoId = alunoReq(req);
  const usuarioId = usuarioReq(req);

  if (!instituicaoId || !alunoId) return null;
  if (String(req?.usuario?.tipo || '').toLowerCase() !== 'aluno') return null;

  const agora = new Date();
  const atual = await PortalAlunoAtividade.findOne({
    instituicao: instituicaoId,
    aluno: alunoId,
  })
    .select(
      'primeiroAcessoPortalEm primeiroAcessoSimuladosEm primeiroSimuladoAbertoEm ' +
      'ultimaAtividadeEm ultimaAtividadeTipo resultadosAbertos revisoesConcluidas'
    )
    .lean()
    .catch(() => null);

  const snap = await snapshotAluno({ instituicaoId, alunoId, aluno });

  const set = {
    tenantId: instituicaoId,
    usuario: usuarioId,
    alunoNomeSnapshot: snap.nome,
    alunoTurmaSnapshot: snap.turma,
    alunoCodigoSnapshot: snap.codigo,
    ultimaAtividadeEm: agora,
    ultimaAtividadeTipo: tipoNormalizado,
  };

  const inc = {};
  const addToSet = {};
  const push = {};
  const setOnInsert = {
    instituicao: instituicaoId,
    aluno: alunoId,
  };

  const resultadoObjectId = oid(resultadoId);
  const simuladoObjectId = oid(simuladoId);

  if (tipoNormalizado === 'portal_acesso') {
    set.ultimoAcessoPortalEm = agora;
    inc.totalAcessosPortal = 1;
    if (!atual?.primeiroAcessoPortalEm) set.primeiroAcessoPortalEm = agora;
  }

  if (tipoNormalizado === 'simulados_abriu') {
    set.ultimoAcessoSimuladosEm = agora;
    inc.totalAberturasSimulados = 1;
    if (!atual?.primeiroAcessoSimuladosEm) set.primeiroAcessoSimuladosEm = agora;
  }

  if (tipoNormalizado === 'simulado_abriu') {
    set.ultimoSimuladoAbertoEm = agora;
    if (!atual?.primeiroSimuladoAbertoEm) set.primeiroSimuladoAbertoEm = agora;
    if (resultadoObjectId) addToSet.resultadosAbertos = resultadoObjectId;
  }

  let progressoAtual = null;
  if (progresso) {
    progressoAtual = progressoSeguro({
      ...progresso,
      resultadoId: progresso.resultadoId || resultadoObjectId,
      simuladoId: progresso.simuladoId || simuladoObjectId,
      titulo: progresso.titulo || simuladoTitulo,
    });
    set.progressoAtual = progressoAtual;
  }

  const jaConcluido = Boolean(
    resultadoObjectId &&
    Array.isArray(atual?.revisoesConcluidas) &&
    atual.revisoesConcluidas.some((id) => String(id) === String(resultadoObjectId))
  );

  if (progressoAtual?.concluido && resultadoObjectId) {
    addToSet.revisoesConcluidas = resultadoObjectId;
  }

  const ultimaMuitoRecente =
    atual?.ultimaAtividadeEm &&
    atual?.ultimaAtividadeTipo === tipoNormalizado &&
    (agora.getTime() - new Date(atual.ultimaAtividadeEm).getTime()) < 30000;

  if (!ultimaMuitoRecente) {
    push.eventosRecentes = {
      $each: [{
        tipo: tipoNormalizado,
        em: agora,
        resultadoId: resultadoObjectId,
        simuladoId: simuladoObjectId,
        simuladoTitulo: String(simuladoTitulo || '').trim(),
        detalhe: detalheSeguro(detalhe),
      }],
      $slice: -30,
    };
  }

  const update = { $set: set, $setOnInsert: setOnInsert };
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;
  if (Object.keys(push).length) update.$push = push;

  const doc = await PortalAlunoAtividade.findOneAndUpdate(
    { instituicao: instituicaoId, aluno: alunoId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch((erro) => {
    console.warn('[PORTAL-ATIVIDADE] Falha ao registrar atividade:', erro?.message || erro);
    return null;
  });

  if (progressoAtual?.concluido && resultadoObjectId && !jaConcluido) {
    await PortalAlunoAtividade.findOneAndUpdate(
      { instituicao: instituicaoId, aluno: alunoId },
      {
        $set: {
          ultimaAtividadeEm: agora,
          ultimaAtividadeTipo: 'revisao_concluida',
        },
        $push: {
          eventosRecentes: {
            $each: [{
              tipo: 'revisao_concluida',
              em: agora,
              resultadoId: resultadoObjectId,
              simuladoId: simuladoObjectId,
              simuladoTitulo: String(simuladoTitulo || '').trim(),
              detalhe: 'Concluiu a revisão das questões erradas deste simulado.',
            }],
            $slice: -30,
          },
        },
      }
    ).catch(() => null);
  }

  return doc;
}

module.exports = {
  registrarAtividadePortalAluno,
};
