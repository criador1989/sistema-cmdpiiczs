'use strict';

const Usuario = require('../models/Usuario');
const TermoCompromissoProfessor = require('../models/TermoCompromissoProfessor');
const AceiteTermoProfessor = require('../models/AceiteTermoProfessor');

function normalizeId(value) {
  return value ? String(value._id || value.id || value) : '';
}

function obterTermoVigente(instituicaoId) {
  if (!instituicaoId) return null;
  return TermoCompromissoProfessor.findOne({
    instituicao: instituicaoId,
    publico: 'professor',
    ativo: true,
  }).sort({ publicadoEm: -1, createdAt: -1 });
}

async function obterEstadoOnboardingProfessor(usuario, options = {}) {
  const tipo = String(usuario?.tipo || '').trim().toLowerCase();
  const usuarioId = normalizeId(usuario);
  const instituicaoId = normalizeId(options.instituicaoId || usuario?.instituicao || usuario?.tenantId);

  if (tipo !== 'professor') {
    return {
      aplicavel: false,
      concluido: true,
      precisaTrocarSenha: false,
      precisaAceitarTermo: false,
      termoDisponivel: false,
      proximaEtapa: null,
      redirecionar: options.destinoPadrao || '/painel.html',
    };
  }

  const identidade = options.usuarioDb || await Usuario.findById(usuarioId)
    .select('nome email tipo instituicao tenantId onboardingProfessor ativo')
    .lean();

  if (!identidade || identidade.ativo === false) {
    const error = new Error('Professor não encontrado ou inativo.');
    error.statusCode = 401;
    throw error;
  }

  const precisaTrocarSenha = identidade.onboardingProfessor?.obrigarTrocaSenha === true;
  const termo = await obterTermoVigente(instituicaoId).lean();

  let aceite = null;
  if (termo?._id) {
    aceite = await AceiteTermoProfessor.findOne({
      instituicao: instituicaoId,
      usuario: usuarioId,
      termo: termo._id,
      revogadoEm: null,
    }).select('_id aceitoEm comprovanteCodigo comprovanteHash termoVersao').lean();
  }

  const termoDisponivel = Boolean(termo?._id);
  const precisaAceitarTermo = termoDisponivel && !aceite;
  const concluido = !precisaTrocarSenha && !precisaAceitarTermo;
  const proximaEtapa = precisaTrocarSenha
    ? 'trocar_senha'
    : precisaAceitarTermo
      ? 'aceitar_termo'
      : null;

  return {
    aplicavel: true,
    concluido,
    precisaTrocarSenha,
    precisaAceitarTermo,
    termoDisponivel,
    proximaEtapa,
    redirecionar: concluido
      ? (options.destinoPadrao || '/painel-professor.html')
      : '/primeiro-acesso-professor.html',
    professor: {
      id: usuarioId,
      nome: identidade.nome || usuario?.nome || 'Professor',
      email: identidade.email || usuario?.email || null,
      instituicao: instituicaoId,
    },
    termo: termo ? {
      id: String(termo._id),
      titulo: termo.titulo,
      versao: termo.versao,
      conteudo: options.incluirConteudo ? termo.conteudo : undefined,
      conteudoHash: termo.conteudoHash,
      publicadoEm: termo.publicadoEm,
    } : null,
    aceite: aceite ? {
      id: String(aceite._id),
      aceitoEm: aceite.aceitoEm,
      comprovanteCodigo: aceite.comprovanteCodigo,
      termoVersao: aceite.termoVersao,
    } : null,
  };
}

module.exports = {
  obterTermoVigente,
  obterEstadoOnboardingProfessor,
};
