'use strict';

const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Instituicao = require('../models/Instituicao');
const UsuarioVinculoInstituicao = require('../models/UsuarioVinculoInstituicao');

function normalizarEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function id(value) {
  if (!value) return '';
  return String(value._id || value.id || value);
}

function usuarioAtivoFilter() {
  return { $or: [{ ativo: true }, { ativo: { $exists: false } }] };
}

function selecionarUsuario(query, comSenha = false) {
  const campos = [
    'nome', 'email', 'tipo', 'instituicao', 'tenantId', 'ativo', 'emailVerificado',
    'alunoId', 'portal', 'turmas', 'escopoObservatorio', 'acessosModulos',
  ];
  if (comSenha) campos.push('+senha');
  return query.select(campos.join(' '));
}

function montarUsuarioEfetivo(usuario, vinculo = null, instituicaoAlvo = null) {
  const raw = typeof usuario?.toObject === 'function'
    ? usuario.toObject({ virtuals: false })
    : { ...(usuario || {}) };

  if (!raw?._id) return null;

  const tenant = instituicaoAlvo || vinculo?.instituicao || vinculo?.tenantId || raw.instituicao || raw.tenantId;
  const acessos = vinculo?.acessosModulos || raw.acessosModulos || {};

  return {
    ...raw,
    _id: raw._id,
    id: String(raw._id),
    instituicao: tenant,
    tenantId: tenant,
    tipo: vinculo?.tipoInstitucional || raw.tipo,
    portal: vinculo?.portal || raw.portal || 'institucional',
    alunoId: vinculo?.alunoId || raw.alunoId || null,
    turmas: Array.isArray(vinculo?.turmas) && vinculo.turmas.length ? vinculo.turmas : (raw.turmas || []),
    escopoObservatorio: vinculo?.escopoObservatorio || raw.escopoObservatorio || null,
    acessosModulos: acessos,
    vinculoId: vinculo?._id ? String(vinculo._id) : null,
    vinculoOrigem: vinculo?.origem || null,
    identidadePrimariaInstituicao: raw.instituicao ? String(raw.instituicao) : null,
  };
}

async function buscarVinculoAtivo(usuarioId, instituicaoId, options = {}) {
  if (!mongoose.isValidObjectId(String(usuarioId || '')) || !mongoose.isValidObjectId(String(instituicaoId || ''))) {
    return null;
  }
  let query = UsuarioVinculoInstituicao.findOne({
    usuario: usuarioId,
    instituicao: instituicaoId,
    ativo: true,
  });
  if (options.session) query = query.session(options.session);
  if (options.lean !== false) query = query.lean();
  return query;
}

async function resolverUsuarioNoTenant({ email, instituicaoId, comSenha = false, tiposPermitidos = null }) {
  const normalized = normalizarEmail(email);
  if (!normalized || !mongoose.isValidObjectId(String(instituicaoId || ''))) return null;

  const usuario = await selecionarUsuario(
    Usuario.findOne({ email: normalized, ...usuarioAtivoFilter() }),
    comSenha
  );
  if (!usuario) return null;

  const vinculo = await buscarVinculoAtivo(usuario._id, instituicaoId, { lean: true });
  if (vinculo) {
    const efetivo = montarUsuarioEfetivo(usuario, vinculo, instituicaoId);
    if (Array.isArray(tiposPermitidos) && tiposPermitidos.length && !tiposPermitidos.includes(efetivo.tipo)) return null;
    return { usuario, vinculo, efetivo, origem: 'vinculo' };
  }

  const instituicaoPrimaria = String(usuario.instituicao || usuario.tenantId || '');
  if (instituicaoPrimaria !== String(instituicaoId)) return null;

  const efetivo = montarUsuarioEfetivo(usuario, null, instituicaoId);
  if (Array.isArray(tiposPermitidos) && tiposPermitidos.length && !tiposPermitidos.includes(efetivo.tipo)) return null;

  return { usuario, vinculo: null, efetivo, origem: 'legado' };
}

async function criarOuAtualizarVinculo({
  usuarioId,
  instituicaoId,
  perfilAssociacao = null,
  tipoInstitucional = 'admin',
  ativo = true,
  origem = 'manual',
  actorId = null,
  session = null,
}) {
  if (!mongoose.isValidObjectId(String(usuarioId || ''))) throw new Error('Usuário inválido para vínculo.');
  if (!mongoose.isValidObjectId(String(instituicaoId || ''))) throw new Error('Instituição inválida para vínculo.');

  const update = {
    $set: {
      tenantId: instituicaoId,
      ativo: ativo !== false,
      tipoInstitucional,
      portal: 'institucional',
      origem,
      atualizadoPor: actorId || null,
      'acessosModulos.associacao.ativo': Boolean(perfilAssociacao) && ativo !== false,
      'acessosModulos.associacao.perfil': perfilAssociacao || null,
    },
    $setOnInsert: {
      usuario: usuarioId,
      instituicao: instituicaoId,
      criadoPor: actorId || null,
    },
  };

  let query = UsuarioVinculoInstituicao.findOneAndUpdate(
    { usuario: usuarioId, instituicao: instituicaoId },
    update,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  if (session) query = query.session(session);
  return query;
}

async function listarAmbientesDoUsuario(usuarioId) {
  if (!mongoose.isValidObjectId(String(usuarioId || ''))) return [];

  const usuario = await Usuario.findById(usuarioId)
    .select('nome email tipo instituicao tenantId ativo portal acessosModulos')
    .lean();
  if (!usuario || usuario.ativo === false) return [];

  const vinculos = await UsuarioVinculoInstituicao.find({ usuario: usuarioId, ativo: true })
    .populate('instituicao', 'nome nomeExibicao sigla slug logoUrl categoriaInstituicao associacaoConfig modulosAtivos ativo ativa')
    .sort({ createdAt: 1 })
    .lean();

  const ids = new Set();
  const ambientes = [];

  const primaryId = id(usuario.instituicao || usuario.tenantId);
  if (primaryId) {
    const inst = await Instituicao.findById(primaryId)
      .select('nome nomeExibicao sigla slug logoUrl categoriaInstituicao associacaoConfig modulosAtivos ativo ativa')
      .lean();
    if (inst && inst.ativo !== false && inst.ativa !== false) {
      ids.add(primaryId);
      ambientes.push({
        instituicaoId: primaryId,
        tenant: inst.slug || primaryId,
        nome: inst.nomeExibicao || inst.nome,
        sigla: inst.sigla || null,
        logoUrl: inst.logoUrl || null,
        categoria: inst.categoriaInstituicao || 'escola',
        tipo: usuario.tipo,
        portal: usuario.portal || 'institucional',
        associacao: usuario.acessosModulos?.associacao || null,
        vinculoId: null,
        primario: true,
      });
    }
  }

  for (const vinculo of vinculos) {
    const inst = vinculo.instituicao;
    const instId = id(inst);
    if (!instId || ids.has(instId) || !inst || inst.ativo === false || inst.ativa === false) continue;
    ids.add(instId);
    ambientes.push({
      instituicaoId: instId,
      tenant: inst.slug || instId,
      nome: inst.nomeExibicao || inst.nome,
      sigla: inst.sigla || null,
      logoUrl: inst.logoUrl || null,
      categoria: inst.categoriaInstituicao || 'escola',
      tipo: vinculo.tipoInstitucional || usuario.tipo,
      portal: vinculo.portal || 'institucional',
      associacao: vinculo.acessosModulos?.associacao || null,
      vinculoId: String(vinculo._id),
      primario: false,
    });
  }

  return ambientes;
}

async function listarAmbientesPorEmail(email) {
  const usuario = await Usuario.findOne({ email: normalizarEmail(email), ...usuarioAtivoFilter() })
    .select('_id')
    .lean();
  if (!usuario) return [];
  return listarAmbientesDoUsuario(usuario._id);
}

module.exports = {
  normalizarEmail,
  montarUsuarioEfetivo,
  buscarVinculoAtivo,
  resolverUsuarioNoTenant,
  criarOuAtualizarVinculo,
  listarAmbientesDoUsuario,
  listarAmbientesPorEmail,
};
