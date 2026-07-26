'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const requireSuperAdmin = require('../../middleware/requireSuperAdmin');
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
const { getPresetBase } = require('../../utils/configuracaoDisciplinar');
const { sendMail } = require('../../utils/mailer');
const { generateTemporaryPassword, validatePasswordStrength } = require('../../utils/passwordPolicy');

function normSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizarPreset(preset) {
  const p = String(preset || '').trim().toLowerCase();

  if (p === 'particular') return 'particular';
  if (p === 'personalizado') return 'personalizado';
  return 'militar';
}


function normalizarUF(estado) {
  const uf = String(estado || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : '';
}

function normalizarTextoCurto(valor) {
  return String(valor || '').trim();
}

function normalizarRedeEnsino(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (['estadual', 'municipal', 'federal', 'privada', 'militar', 'civico_militar', 'outra'].includes(v)) return v;
  return 'estadual';
}

function normalizarTipoEscola(valor, redeEnsino = '') {
  const v = String(valor || '').trim().toLowerCase();
  if (['militar', 'civico_militar', 'civil', 'privada', 'outra'].includes(v)) return v;
  if (redeEnsino === 'privada') return 'privada';
  if (redeEnsino === 'militar') return 'militar';
  if (redeEnsino === 'civico_militar') return 'civico_militar';
  return 'civil';
}

function boolFromBody(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'on'].includes(v);
}

function montarCamposGovernancaInstituicao(body = {}) {
  const redeEnsino = normalizarRedeEnsino(body.redeEnsino || body.rede || body.tipoRede);
  const tipoEscola = normalizarTipoEscola(body.tipoEscola, redeEnsino);
  const ambienteTeste = boolFromBody(body.ambienteTeste, false);

  let observatorioAtivo = boolFromBody(body.observatorioAtivo, false);
  let visivelParaSecretaria = boolFromBody(body.visivelParaSecretaria, false);

  // Regra de proteção: instituição privada nunca entra no Observatório da Secretaria por padrão.
  // Caso exista convênio no futuro, criaremos uma permissão específica e auditada.
  if (redeEnsino === 'privada' || tipoEscola === 'privada') {
    observatorioAtivo = false;
    visivelParaSecretaria = false;
  }

  if (ambienteTeste) {
    visivelParaSecretaria = false;
  }

  return {
    estado: normalizarUF(body.estado),
    municipio: normalizarTextoCurto(body.municipio),
    redeEnsino,
    tipoEscola,
    observatorioAtivo,
    visivelParaSecretaria,
    ambienteTeste,
  };
}

const NIVEIS_ESCOPO_VALIDOS = ['nacional', 'estadual', 'municipal', 'regional', 'rede', 'instituicoes'];
const REDES_ESCOPO_VALIDAS = ['estadual', 'municipal', 'federal', 'militar', 'civico_militar', 'outra'];

function normalizarEscopoSecretaria(body, instituicao) {
  const raw = body?.escopoObservatorio || {};
  const limitarInstituicao = raw.limitarInstituicao === true || String(raw.limitarInstituicao).toLowerCase() === 'true';
  const nivelRaw = String(raw.nivel || 'estadual').trim().toLowerCase();
  const nivelBase = NIVEIS_ESCOPO_VALIDOS.includes(nivelRaw) ? nivelRaw : 'estadual';
  const nivel = limitarInstituicao ? 'instituicoes' : nivelBase;

  const estado = normalizarUF(raw.estado || instituicao?.estado || '');
  const municipio = normalizarTextoCurto(raw.municipio || '');

  if ((nivel === 'estadual' || nivel === 'municipal') && !estado) {
    return { ok: false, mensagem: 'Estado/UF é obrigatório para escopo estadual ou municipal.' };
  }

  if (nivel === 'municipal' && !municipio) {
    return { ok: false, mensagem: 'Município é obrigatório para escopo municipal.' };
  }

  const redeRaw = String(raw.rede || '').trim().toLowerCase();
  if (redeRaw === 'privada') {
    return { ok: false, mensagem: 'Rede "privada" não pode ser adicionada ao escopo da Secretaria.' };
  }
  const rede = REDES_ESCOPO_VALIDAS.includes(redeRaw) ? redeRaw : null;

  const instituicoesPermitidas = limitarInstituicao && instituicao?._id
    ? [instituicao._id]
    : (Array.isArray(raw.instituicoesPermitidas) ? raw.instituicoesPermitidas : []);

  return {
    ok: true,
    escopo: {
      nivel,
      estado: estado || null,
      municipio: municipio || null,
      regional: normalizarTextoCurto(raw.regional || '') || null,
      rede: rede || null,
      instituicoesPermitidas,
      podeVerDadosIndividuais: false,
    }
  };
}

function buildInstitutionLinks(slug) {
  const safeSlug = String(slug || '').trim();

  return {
    login: `/login.html?t=${encodeURIComponent(safeSlug)}`,
    cadastro: `/cadastro-usuario.html?t=${encodeURIComponent(safeSlug)}`,
    loginAluno: `/login-aluno.html?t=${encodeURIComponent(safeSlug)}`
  };
}

function gerarCodigoAcesso() {
  return 'AXR-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Nota: gerador antigo retornava 6 dígitos numéricos.
// Agora utilizamos gerador legível/temporário centralizado em utils/passwordPolicy.
function gerarSenhaSimples() {
  return generateTemporaryPassword();
}

function normalizarTurma(valor) {
  return String(valor || '').trim();
}

async function criarConfiguracaoDisciplinarInicial(instituicaoId, preset, session = null) {
  const base = getPresetBase(preset);

  const payload = {
    instituicao: instituicaoId,
    preset: base.preset || normalizarPreset(preset),
    tipoRegulamento: base.tipoRegulamento || (preset === 'militar' ? 'militar' : 'adaptavel'),

    comportamento: {
      notaInicial: base.comportamento?.notaInicial ?? 8.0,
      faixas: Array.isArray(base.comportamento?.faixas) ? base.comportamento.faixas : []
    },

    medidas: {
      advertenciaEscrita: Number(base.medidas?.advertenciaEscrita ?? -0.30),
      repreensao: Number(base.medidas?.repreensao ?? -0.50),
      aecdePorDia: Number(base.medidas?.aecdePorDia ?? -0.70),
      aiaPorDia: Number(base.medidas?.aiaPorDia ?? -1.20),
    },

    recompensas: {
      elogioVerbal: Number(base.recompensas?.elogioVerbal ?? 0.15),
      elogioIndividual: Number(base.recompensas?.elogioIndividual ?? 0.60),
      elogioColetivo: Number(base.recompensas?.elogioColetivo ?? 0.20),
      mediaAlta: Number(base.recompensas?.mediaAlta ?? 0.40),
    },

    tsmd: {
      ativo: !!base.tsmd?.ativo,
      diasParaIniciar: Number(base.tsmd?.diasParaIniciar ?? 60),
      incrementoPorDia: Number(base.tsmd?.incrementoPorDia ?? 0.01),
      limiteMaximo: Number(base.tsmd?.limiteMaximo ?? 10),
    },

    regulamento: {
      nome: String(base.regulamento?.nome || 'Regulamento Disciplinar').trim(),
      versao: String(base.regulamento?.versao || '1.0').trim(),
      textos: {
        cabecalho: String(base.regulamento?.textos?.cabecalho || '').trim(),
        notificacao: String(base.regulamento?.textos?.notificacao || '').trim(),
        observacaoPadrao: String(base.regulamento?.textos?.observacaoPadrao || '').trim(),
      }
    }
  };

  if (session) {
    const docs = await ConfiguracaoDisciplinar.create([payload], { session });
    return docs[0];
  }

  return ConfiguracaoDisciplinar.create(payload);
}

/* =========================================================================
 * INSTITUIÇÕES
 * ========================================================================= */

router.get('/instituicoes', requireSuperAdmin, async (_req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const list = await Instituicao.find({})
      .select('_id nome sigla slug ativo ativa estado municipio redeEnsino tipoEscola observatorioAtivo visivelParaSecretaria ambienteTeste')
      .sort({ nome: 1 })
      .lean();

    res.json({ instituicoes: list || [] });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao listar instituições.',
      erro: String(e.message || e)
    });
  }
});

router.post('/instituicoes', requireSuperAdmin, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const nome = String(req.body?.nome || '').trim();
    const sigla = String(req.body?.sigla || '').trim();
    const slug = normSlug(req.body?.slug || sigla || nome);
    const preset = normalizarPreset(req.body?.preset);
    const governanca = montarCamposGovernancaInstituicao(req.body || {});

    if (!nome || nome.length < 3) {
      return res.status(400).json({ mensagem: 'Informe um nome válido.' });
    }

    if (!slug || slug.length < 3) {
      return res.status(400).json({ mensagem: 'Slug inválido.' });
    }

    const exists = await Instituicao.findOne({ slug })
      .select('_id')
      .lean()
      .catch(() => null);

    if (exists) {
      return res.status(409).json({
        mensagem: 'Já existe uma instituição com esse slug.'
      });
    }

    let inst = null;
    let config = null;

    await session.withTransaction(async () => {
      const created = await Instituicao.create([{
        nome,
        sigla: sigla || null,
        slug,
        ativo: true,
        ativa: true,
        estado: governanca.estado || undefined,
        municipio: governanca.municipio || undefined,
        redeEnsino: governanca.redeEnsino,
        tipoEscola: governanca.tipoEscola,
        observatorioAtivo: governanca.observatorioAtivo,
        visivelParaSecretaria: governanca.visivelParaSecretaria,
        ambienteTeste: governanca.ambienteTeste,
      }], { session });

      inst = created[0];

      config = await criarConfiguracaoDisciplinarInicial(inst._id, preset, session);
    });

    return res.status(201).json({
      mensagem: 'Instituição criada.',
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla,
        slug: inst.slug,
        ativo: inst.ativo,
        ativa: inst.ativa,
        estado: inst.estado || null,
        municipio: inst.municipio || null,
        redeEnsino: inst.redeEnsino || null,
        tipoEscola: inst.tipoEscola || null,
        observatorioAtivo: !!inst.observatorioAtivo,
        visivelParaSecretaria: !!inst.visivelParaSecretaria,
        ambienteTeste: !!inst.ambienteTeste
      },
      configuracaoDisciplinar: {
        id: String(config._id),
        preset: config.preset,
        tipoRegulamento: config.tipoRegulamento
      },
      links: buildInstitutionLinks(slug)
    });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao criar instituição.',
      erro: String(e.message || e)
    });
  } finally {
    await session.endSession().catch(() => null);
  }
});

router.patch('/instituicoes/:id', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const id = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const $set = {};

    if ('ativo' in (req.body || {})) {
      const ativo = !!req.body.ativo;
      $set.ativo = ativo;
      $set.ativa = ativo;
    }

    const camposGovernanca = ['estado', 'municipio', 'redeEnsino', 'tipoEscola', 'observatorioAtivo', 'visivelParaSecretaria', 'ambienteTeste'];
    const recebeuGovernanca = camposGovernanca.some(c => c in (req.body || {}));

    if (recebeuGovernanca) {
      const atual = await Instituicao.findById(id)
        .select('_id redeEnsino tipoEscola observatorioAtivo visivelParaSecretaria ambienteTeste')
        .lean();

      if (!atual) {
        return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
      }

      const governanca = montarCamposGovernancaInstituicao({
        ...atual,
        ...(req.body || {})
      });

      if ('estado' in req.body) $set.estado = governanca.estado || undefined;
      if ('municipio' in req.body) $set.municipio = governanca.municipio || undefined;
      if ('redeEnsino' in req.body || 'rede' in req.body || 'tipoRede' in req.body) $set.redeEnsino = governanca.redeEnsino;
      if ('tipoEscola' in req.body) $set.tipoEscola = governanca.tipoEscola;
      if ('observatorioAtivo' in req.body) $set.observatorioAtivo = governanca.observatorioAtivo;
      if ('visivelParaSecretaria' in req.body) $set.visivelParaSecretaria = governanca.visivelParaSecretaria;
      if ('ambienteTeste' in req.body) $set.ambienteTeste = governanca.ambienteTeste;

      if (governanca.redeEnsino === 'privada' || governanca.tipoEscola === 'privada') {
        $set.observatorioAtivo = false;
        $set.visivelParaSecretaria = false;
      }

      if (governanca.ambienteTeste === true) {
        $set.visivelParaSecretaria = false;
      }
    }

    const up = await Instituicao.findByIdAndUpdate(
      id,
      { $set },
      { new: true }
    )
      .select('_id nome sigla slug ativo ativa estado municipio redeEnsino tipoEscola observatorioAtivo visivelParaSecretaria ambienteTeste')
      .lean();

    if (!up) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    res.json({ mensagem: 'Atualizado.', instituicao: up });
  } catch (e) {
    res.status(500).json({
      mensagem: 'Erro ao atualizar.',
      erro: String(e.message || e)
    });
  }
});

router.delete('/instituicoes/:id', requireSuperAdmin, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const instituicaoId = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    await session.withTransaction(async () => {
      await Promise.all([
        Usuario.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Aluno.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Notificacao.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        Observacao.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
        ConfiguracaoDisciplinar.deleteMany({ instituicao: instituicaoId }, { session }).catch(() => null),
      ]);

      await Instituicao.deleteOne({ _id: instituicaoId }, { session });
    });

    return res.json({
      mensagem: `Instituição "${instituicao.nome}" excluída com sucesso.`
    });
  } catch (e) {
    console.error('[masterInstituicoes][DELETE]', e);
    return res.status(500).json({
      mensagem: 'Erro ao excluir instituição.',
      erro: String(e.message || e)
    });
  } finally {
    await session.endSession().catch(() => null);
  }
});

/* =========================================================================
 * USUÁRIOS DA INSTITUIÇÃO
 * ========================================================================= */

router.post('/instituicoes/:id/usuarios', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const nome = String(req.body?.nome || '').trim();
    const email = normalizeEmail(req.body?.email);
    const senha = String(req.body?.senha || '');
    const tipo = String(req.body?.tipo || '').trim().toLowerCase();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug ativo ativa estado municipio')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    if (!nome || nome.length < 3) {
      return res.status(400).json({ mensagem: 'Informe um nome válido.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
    }

    const check = validatePasswordStrength(senha);
    if (!check.ok) {
      return res.status(400).json({ mensagem: check.message || 'A senha não atende à política de segurança.' });
    }

    if (!['admin', 'monitor', 'professor', 'secretaria'].includes(tipo)) {
      return res.status(400).json({
        mensagem: 'Tipo inválido. Use admin, monitor, professor ou secretaria.'
      });
    }

    const existente = await Usuario.findOne({
      email,
      instituicao: instituicaoId
    }).select('_id');

    if (existente) {
      return res.status(409).json({
        mensagem: 'E-mail já cadastrado nesta instituição.'
      });
    }

    let escopoObservatorio = undefined;
    if (tipo === 'secretaria') {
      const escopoResult = normalizarEscopoSecretaria(req.body, instituicao);
      if (!escopoResult.ok) {
        return res.status(400).json({ mensagem: escopoResult.mensagem });
      }
      escopoObservatorio = escopoResult.escopo;
    }

    const novoUsuario = new Usuario({
      nome,
      email,
      senha,
      tipo,
      instituicao: instituicaoId,
      ativo: true,
      emailVerificado: true,
      emailVerificadoEm: new Date(),
      tokenVerificacaoHash: null,
      tokenVerificacaoExpiraEm: null,
      escopoObservatorio,
    });

    await novoUsuario.save();

    return res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        id: String(novoUsuario._id),
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        escopoObservatorio: novoUsuario.escopoObservatorio || null,
        instituicao: {
          id: String(instituicao._id),
          nome: instituicao.nome,
          sigla: instituicao.sigla || null,
          slug: instituicao.slug || null,
        }
      },
      links: buildInstitutionLinks(instituicao.slug || '')
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'E-mail já cadastrado nesta instituição.'
      });
    }

    res.status(500).json({
      mensagem: 'Erro ao criar usuário.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * USUÁRIOS DA INSTITUIÇÃO — LISTAGEM E STATUS
 * ========================================================================= */

const TIPOS_INSTITUCIONAIS = ['admin', 'monitor', 'professor', 'secretaria'];

router.get('/instituicoes/:id/usuarios', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const instituicaoId = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const usuarios = await Usuario.find({
      instituicao: instituicaoId,
      tipo: { $in: TIPOS_INSTITUCIONAIS },
    })
      .select('_id nome email tipo ativo portal escopoObservatorio createdAt updatedAt')
      .sort({ tipo: 1, nome: 1 })
      .lean();

    return res.json({
      instituicao: {
        id: String(instituicao._id),
        nome: instituicao.nome,
        sigla: instituicao.sigla || null,
        slug: instituicao.slug || null,
      },
      usuarios: (usuarios || []).map(u => ({
        id: String(u._id),
        nome: u.nome || '',
        email: u.email || '',
        tipo: u.tipo || '',
        ativo: u.ativo !== false,
        portal: u.portal || null,
        escopoObservatorio: u.escopoObservatorio || null,
        createdAt: u.createdAt || null,
        updatedAt: u.updatedAt || null,
      })),
    });
  } catch (e) {
    console.error('[masterInstituicoes][GET usuarios]', e);
    return res.status(500).json({
      mensagem: 'Erro ao listar usuários.',
      erro: String(e.message || e)
    });
  }
});

router.patch('/instituicoes/:id/usuarios/:usuarioId/status', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const instituicaoId = String(req.params.id || '').trim();
    const usuarioId = String(req.params.usuarioId || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!mongoose.isValidObjectId(usuarioId)) {
      return res.status(400).json({ mensagem: 'Usuário inválido.' });
    }

    const novoAtivo = req.body?.ativo;
    if (novoAtivo === undefined || novoAtivo === null || novoAtivo === '') {
      return res.status(400).json({ mensagem: 'Campo "ativo" é obrigatório.' });
    }
    const ativoFinal = novoAtivo === true || String(novoAtivo).toLowerCase() === 'true';

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const usuario = await Usuario.findOne({
      _id: usuarioId,
      instituicao: instituicaoId,
      tipo: { $in: TIPOS_INSTITUCIONAIS },
    })
      .select('_id nome email tipo ativo')
      .lean();

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado nesta instituição ou tipo não permitido.' });
    }

    // Impede o próprio superadmin logado de se desativar acidentalmente.
    const reqUserId = String(req.usuario?.id || req.usuario?._id || '').trim();
    if (!ativoFinal && reqUserId && reqUserId === String(usuario._id)) {
      return res.status(400).json({ mensagem: 'Você não pode desativar o próprio usuário.' });
    }

    const atualizado = await Usuario.findByIdAndUpdate(
      usuarioId,
      { $set: { ativo: ativoFinal } },
      { new: true }
    )
      .select('_id nome email tipo ativo portal escopoObservatorio createdAt updatedAt')
      .lean();

    return res.json({
      mensagem: ativoFinal ? 'Usuário reativado com sucesso.' : 'Usuário desativado com sucesso.',
      usuario: {
        id: String(atualizado._id),
        nome: atualizado.nome || '',
        email: atualizado.email || '',
        tipo: atualizado.tipo || '',
        ativo: atualizado.ativo !== false,
        portal: atualizado.portal || null,
        escopoObservatorio: atualizado.escopoObservatorio || null,
        createdAt: atualizado.createdAt || null,
        updatedAt: atualizado.updatedAt || null,
      },
    });
  } catch (e) {
    console.error('[masterInstituicoes][PATCH usuarios status]', e);
    return res.status(500).json({
      mensagem: 'Erro ao atualizar status do usuário.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * ALUNOS DA INSTITUIÇÃO PARA O MASTER
 * ========================================================================= */

async function listarTurmasAlunosMaster(req, res) {
  try {
    const instituicaoId = String(req.params.id || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    const turmas = await Aluno.distinct('turma', {
      instituicao: instituicaoId
    });

    turmas.sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      })
    );

    return res.json({ ok: true, turmas });
  } catch (e) {
    console.error('[masterInstituicoes][listar-turmas-alunos]', e);
    return res.status(500).json({
      mensagem: 'Erro ao listar turmas dos alunos para o master.',
      erro: String(e.message || e)
    });
  }
}

router.get('/instituicoes/:id/alunos/turmas', requireSuperAdmin, listarTurmasAlunosMaster);

router.get('/:id/alunos/turmas', requireSuperAdmin, listarTurmasAlunosMaster);

async function listarAlunosTurmaMaster(req, res) {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const turma = normalizarTurma(req.params.turma);

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!turma) {
      return res.status(400).json({ mensagem: 'Turma inválida.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug ativo ativa estado municipio redeEnsino tipoEscola observatorioAtivo visivelParaSecretaria ambienteTeste')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const alunos = await Aluno.find({
      instituicao: instituicaoId,
      turma
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao tenantId')
      .sort({ nome: 1 })
      .lean();

    const alunoIds = alunos.map(a => a._id);

    const [usuariosAlunos, usuariosResponsaveis] = await Promise.all([
      Usuario.find({
        instituicao: instituicaoId,
        tipo: 'aluno',
        alunoId: { $in: alunoIds }
      })
        .select('_id email alunoId')
        .lean(),
      Usuario.find({
        instituicao: instituicaoId,
        tipo: 'responsavel',
        alunoId: { $in: alunoIds }
      })
        .select('_id email alunoId')
        .lean()
    ]);

    const usuarioPorAluno = new Map(
      usuariosAlunos.map(u => [String(u.alunoId), u])
    );

    const responsavelPorAluno = new Map(
      usuariosResponsaveis.map(u => [String(u.alunoId), u])
    );

    const alunosNormalizados = [];

    for (const a of alunos) {
      const usuarioEncontrado = usuarioPorAluno.get(String(a._id));
      const responsavelEncontrado = responsavelPorAluno.get(String(a._id));
      const usuarioIdFinal = a.usuarioId || usuarioEncontrado?._id || null;

      if (!a.usuarioId && usuarioEncontrado?._id) {
        await Aluno.updateOne(
          { _id: a._id, instituicao: instituicaoId },
          { $set: { usuarioId: usuarioEncontrado._id } }
        );
      }

      alunosNormalizados.push({
        _id: String(a._id),
        id: String(a._id),
        nome: a.nome || '',
        turma: a.turma || '',
        codigoAcesso: a.codigoAcesso || '',
        usuarioId: usuarioIdFinal ? String(usuarioIdFinal) : null,
        acessoCriado: !!usuarioIdFinal,
        temAcesso: !!usuarioIdFinal,
        contatos: {
          emailResponsavel: normalizeEmail(
            a?.contatos?.emailResponsavel ||
            responsavelEncontrado?.email ||
            ''
          )
        }
      });
    }

    return res.json({
      ok: true,
      instituicao: {
        id: String(instituicao._id),
        nome: instituicao.nome,
        sigla: instituicao.sigla || '',
        slug: instituicao.slug || ''
      },
      turma,
      alunos: alunosNormalizados
    });
  } catch (e) {
    console.error('[masterInstituicoes][listar-alunos-turma]', e);
    return res.status(500).json({
      mensagem: 'Erro ao listar alunos da turma para o master.',
      erro: String(e.message || e)
    });
  }
}
// Compatível com front usando MASTER_BASE = /api/master/instituicoes/instituicoes
router.get('/instituicoes/:id/alunos/turma/:turma', requireSuperAdmin, listarAlunosTurmaMaster);

// Compatível com front usando /api/master/instituicoes/:id/alunos/turma/:turma
router.get('/:id/alunos/turma/:turma', requireSuperAdmin, listarAlunosTurmaMaster);

/* =========================================================================
 * ACESSOS DOS ALUNOS EM LOTE
 * ========================================================================= */

router.post('/instituicoes/:id/gerar-acessos-alunos', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const alunosPayload = Array.isArray(req.body?.alunos) ? req.body.alunos : [];

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!alunosPayload.length) {
      return res.status(400).json({ mensagem: 'Selecione pelo menos um aluno.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const ids = alunosPayload
      .map(a => String(a?.alunoId || '').trim())
      .filter(id => mongoose.isValidObjectId(id));

    if (!ids.length) {
      return res.status(400).json({ mensagem: 'Nenhum aluno válido foi enviado.' });
    }

    const alunos = await Aluno.find({
      _id: { $in: ids },
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao')
      .lean();

    if (!alunos.length) {
      return res.status(404).json({ mensagem: 'Nenhum aluno válido encontrado para esta instituição.' });
    }

    const emailPorAluno = new Map();

    for (const item of alunosPayload) {
      const alunoId = String(item?.alunoId || '').trim();
      const emailResponsavel = normalizeEmail(item?.emailResponsavel || '');

      if (alunoId) {
        emailPorAluno.set(alunoId, emailResponsavel);
      }
    }

    const acessos = [];
    const reutilizados = [];
    const ignorados = [];
    const acessosResponsaveis = [];
    const responsaveisReutilizados = [];
    const responsaveisIgnorados = [];

    for (const aluno of alunos) {
  const alunoId = String(aluno._id);

  let emailResponsavel = emailPorAluno.get(alunoId) || '';

  if (!emailResponsavel) {
    emailResponsavel = normalizeEmail(
      aluno?.contatos?.emailResponsavel ||
      aluno?.emailResponsavel ||
      ''
    );
  }

  if (!isValidEmail(emailResponsavel)) {
    ignorados.push({
      alunoId,
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      motivo: 'E-mail do responsável inválido ou ausente.'
    });

    responsaveisIgnorados.push({
      alunoId,
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      motivo: 'E-mail do responsável inválido ou ausente.'
    });

    continue;
  }

  let codigoAcesso = String(aluno.codigoAcesso || '').trim().toUpperCase();

  if (!codigoAcesso) {
    let tentativas = 0;

    do {
      codigoAcesso = gerarCodigoAcesso();
      tentativas++;

      if (tentativas > 30) {
        codigoAcesso = '';
        break;
      }
    } while (await Aluno.findOne({
      instituicao: instituicaoId,
      codigoAcesso
    }).select('_id').lean());
  }

  if (!codigoAcesso) {
    ignorados.push({
      alunoId,
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      motivo: 'Não foi possível gerar um código de acesso único.'
    });

    responsaveisIgnorados.push({
      alunoId,
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      motivo: 'Não foi possível gerar o acesso porque o aluno ficou sem código único.'
    });

    continue;
  }

  let senhaAlunoCriada = null;

  const usuarioJaVinculadoAoAluno = await Usuario.findOne({
    instituicao: instituicaoId,
    alunoId: aluno._id,
    tipo: 'aluno'
  })
    .select('_id nome email tipo portal alunoId')
    .lean();

  if (usuarioJaVinculadoAoAluno) {
    await Aluno.updateOne(
      { _id: aluno._id, instituicao: instituicaoId },
      {
        $set: {
          usuarioId: usuarioJaVinculadoAoAluno._id,
          codigoAcesso,
          'contatos.emailResponsavel': emailResponsavel
        }
      }
    );

    reutilizados.push({
      alunoId,
      usuarioId: String(usuarioJaVinculadoAoAluno._id),
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      codigoAcesso,
      senha: null,
      status: 'reutilizado',
      observacao: 'Este aluno já possuía usuário de aluno vinculado. A senha anterior foi mantida.'
    });
  } else if (aluno.usuarioId && mongoose.isValidObjectId(aluno.usuarioId)) {
    const usuarioDoAluno = await Usuario.findOne({
      _id: aluno.usuarioId,
      instituicao: instituicaoId
    })
      .select('_id nome email tipo portal alunoId')
      .lean();

    if (usuarioDoAluno) {
      const precisaCorrigirUsuario = (
        usuarioDoAluno.tipo !== 'aluno' ||
        usuarioDoAluno.portal !== 'aluno' ||
        String(usuarioDoAluno.alunoId || '') !== alunoId
      );

      if (precisaCorrigirUsuario) {
        await Usuario.updateOne(
          { _id: usuarioDoAluno._id, instituicao: instituicaoId },
          {
            $set: {
              tipo: 'aluno',
              portal: 'aluno',
              alunoId: aluno._id,
              ativo: true,
              emailVerificado: true,
              emailVerificadoEm: usuarioDoAluno.emailVerificadoEm || new Date()
            }
          }
        );
      }

      await Aluno.updateOne(
        { _id: aluno._id, instituicao: instituicaoId },
        {
          $set: {
            usuarioId: usuarioDoAluno._id,
            codigoAcesso,
            'contatos.emailResponsavel': emailResponsavel
          }
        }
      );

      reutilizados.push({
        alunoId,
        usuarioId: String(usuarioDoAluno._id),
        nome: aluno.nome,
        turma: normalizarTurma(aluno.turma),
        email: emailResponsavel,
        codigoAcesso,
        senha: null,
        status: 'reutilizado',
        observacao: 'Usuário já vinculado ao cadastro do aluno. A senha anterior foi mantida.'
      });
    } else {
      const senha = gerarSenhaSimples();
      senhaAlunoCriada = senha;

      const emailUnicoUsuario = `${String(codigoAcesso).toLowerCase().replace(/[^a-z0-9]/g, '')}.${alunoId.slice(-6)}@aluno.axoriin.local`;

      const novoUsuario = new Usuario({
        nome: aluno.nome,
        email: emailUnicoUsuario,
        senha,
        tipo: 'aluno',
        portal: 'aluno',
        alunoId: aluno._id,
        instituicao: instituicaoId,
        tenantId: instituicaoId,
        ativo: true,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        tokenVerificacaoHash: null,
        tokenVerificacaoExpiraEm: null,
      });

      await novoUsuario.save();

      await Aluno.updateOne(
        { _id: aluno._id, instituicao: instituicaoId },
        {
          $set: {
            usuarioId: novoUsuario._id,
            codigoAcesso,
            'contatos.emailResponsavel': emailResponsavel
          }
        }
      );

      acessos.push({
        alunoId,
        usuarioId: String(novoUsuario._id),
        nome: aluno.nome,
        turma: normalizarTurma(aluno.turma),
        email: emailResponsavel,
        codigoAcesso,
        senha,
        status: 'criado',
        observacao: 'Novo acesso do aluno criado com sucesso.'
      });
    }
  } else {
    const senha = gerarSenhaSimples();
    senhaAlunoCriada = senha;

    const emailUnicoUsuario = `${String(codigoAcesso).toLowerCase().replace(/[^a-z0-9]/g, '')}.${alunoId.slice(-6)}@aluno.axoriin.local`;

    const novoUsuario = new Usuario({
      nome: aluno.nome,
      email: emailUnicoUsuario,
      senha,
      tipo: 'aluno',
      portal: 'aluno',
      alunoId: aluno._id,
      instituicao: instituicaoId,
      tenantId: instituicaoId,
      ativo: true,
      emailVerificado: true,
      emailVerificadoEm: new Date(),
      tokenVerificacaoHash: null,
      tokenVerificacaoExpiraEm: null,
    });

    await novoUsuario.save();

    await Aluno.updateOne(
      { _id: aluno._id, instituicao: instituicaoId },
      {
        $set: {
          usuarioId: novoUsuario._id,
          codigoAcesso,
          'contatos.emailResponsavel': emailResponsavel
        }
      }
    );

    acessos.push({
      alunoId,
      usuarioId: String(novoUsuario._id),
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      codigoAcesso,
      senha,
      status: 'criado',
      observacao: 'Novo acesso do aluno criado com sucesso.'
    });
  }

  let usuarioResponsavel = await Usuario.findOne({
    email: emailResponsavel,
    instituicao: instituicaoId,
    tipo: 'responsavel'
  })
    .select('_id nome email tipo portal alunoId')
    .lean();

  if (usuarioResponsavel && String(usuarioResponsavel.alunoId || '') === alunoId) {
    responsaveisReutilizados.push({
      alunoId,
      usuarioId: String(usuarioResponsavel._id),
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      codigoAcesso,
      senha: null,
      status: 'responsavel_reutilizado',
      observacao: 'Responsável já possuía acesso vinculado a este aluno. A senha anterior foi mantida.'
    });

    continue;
  }

  if (usuarioResponsavel && String(usuarioResponsavel.alunoId || '') !== alunoId) {
    responsaveisIgnorados.push({
      alunoId,
      nome: aluno.nome,
      turma: normalizarTurma(aluno.turma),
      email: emailResponsavel,
      codigoAcesso,
      motivo: 'Este e-mail já está vinculado como responsável de outro aluno. Por enquanto, o sistema permite um aluno por acesso de responsável.'
    });

    continue;
  }

  const senhaResponsavel = gerarSenhaSimples();

  const novoResponsavel = new Usuario({
    nome: `Responsável - ${aluno.nome}`,
    email: emailResponsavel,
    senha: senhaResponsavel,
    tipo: 'responsavel',
    portal: 'responsavel',
    alunoId: aluno._id,
    instituicao: instituicaoId,
    tenantId: instituicaoId,
    ativo: true,
    emailVerificado: true,
    emailVerificadoEm: new Date(),
    tokenVerificacaoHash: null,
    tokenVerificacaoExpiraEm: null,
  });

  await novoResponsavel.save();

  acessosResponsaveis.push({
    alunoId,
    usuarioId: String(novoResponsavel._id),
    nome: aluno.nome,
    turma: normalizarTurma(aluno.turma),
    email: emailResponsavel,
    codigoAcesso,
    senha: senhaResponsavel,
    status: 'responsavel_criado',
    observacao: 'Acesso do responsável criado com sucesso.'
  });
}

    const totalCriados = acessos.length;
const totalReutilizados = reutilizados.length;
const totalIgnorados = ignorados.length;

const totalResponsaveisCriados = acessosResponsaveis.length;
const totalResponsaveisReutilizados = responsaveisReutilizados.length;
const totalResponsaveisIgnorados = responsaveisIgnorados.length;

const totalProcessados =
  totalCriados +
  totalReutilizados +
  totalIgnorados +
  totalResponsaveisCriados +
  totalResponsaveisReutilizados +
  totalResponsaveisIgnorados;

    return res.json({
  ok: true,

  mensagem:
    `Processamento concluído. ` +
    `Alunos criados: ${totalCriados}. ` +
    `Alunos reutilizados: ${totalReutilizados}. ` +
    `Alunos ignorados: ${totalIgnorados}. ` +
    `Responsáveis criados: ${acessosResponsaveis.length}. ` +
    `Responsáveis reutilizados: ${responsaveisReutilizados.length}. ` +
    `Responsáveis ignorados: ${responsaveisIgnorados.length}.`,

  total: totalCriados,

  totalCriados,
  totalReutilizados,
  totalIgnorados,

  totalResponsaveisCriados,
totalResponsaveisReutilizados,
totalResponsaveisIgnorados,

  totalProcessados,

  acessos,
  reutilizados,
  ignorados,

  acessosResponsaveis,
  responsaveisReutilizados,
  responsaveisIgnorados,

  links: buildInstitutionLinks(instituicao.slug || '')
});

  } catch (e) {
    console.error('[masterInstituicoes][gerar-acessos-alunos]', e);

    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'Já existe usuário cadastrado com este e-mail. Verifique se o aluno já possui acesso ou use outro e-mail.',
        erro: String(e.message || e)
      });
    }

    return res.status(500).json({
      mensagem: 'Erro ao gerar acessos dos alunos.',
      erro: String(e.message || e)
    });
  }
});

router.post('/instituicoes/:id/enviar-acessos-email', requireSuperAdmin, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const alunosPayload = Array.isArray(req.body?.alunos) ? req.body.alunos : [];

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!alunosPayload.length) {
      return res.status(400).json({ mensagem: 'Selecione pelo menos um aluno.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const ids = alunosPayload
      .map(a => String(a?.alunoId || '').trim())
      .filter(id => mongoose.isValidObjectId(id));

    if (!ids.length) {
      return res.status(400).json({ mensagem: 'Nenhum aluno válido foi enviado.' });
    }

    const emailPorAluno = new Map();

    for (const item of alunosPayload) {
      const alunoId = String(item?.alunoId || '').trim();
      const emailResponsavel = normalizeEmail(item?.emailResponsavel || '');

      if (alunoId) {
        emailPorAluno.set(alunoId, emailResponsavel);
      }
    }

    const alunos = await Aluno.find({
      _id: { $in: ids },
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao')
      .lean();

    const acessos = [];
    const acessosResponsaveis = [];
    const ignorados = [];
    const erros = [];

    const portal = `/login-aluno.html?t=${encodeURIComponent(instituicao.slug || '')}`;

    for (const aluno of alunos) {
      const alunoId = String(aluno._id);

      let emailResponsavel = emailPorAluno.get(alunoId) || '';

      if (!emailResponsavel) {
        emailResponsavel = normalizeEmail(
          aluno?.contatos?.emailResponsavel ||
          aluno?.emailResponsavel ||
          ''
        );
      }

      if (!isValidEmail(emailResponsavel)) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          motivo: 'E-mail do responsável inválido ou ausente.'
        });
        continue;
      }

      const codigoAcesso = String(aluno.codigoAcesso || '').trim().toUpperCase();

      if (!codigoAcesso) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          motivo: 'Aluno ainda não possui código de acesso. Gere o acesso antes de enviar por e-mail.'
        });
        continue;
      }

      const usuarioAluno = await Usuario.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id,
        tipo: 'aluno'
      }).select('+senha nome email tipo portal alunoId instituicao ativo');

      if (!usuarioAluno) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          motivo: 'Aluno ainda não possui usuário de acesso. Gere o acesso antes de enviar por e-mail.'
        });
        continue;
      }

      const usuarioResponsavel = await Usuario.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id,
        tipo: 'responsavel',
        email: emailResponsavel
      }).select('+senha nome email tipo portal alunoId instituicao ativo');

      if (!usuarioResponsavel) {
        ignorados.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          motivo: 'Responsável ainda não possui usuário de acesso. Gere o acesso antes de enviar por e-mail.'
        });
        continue;
      }

      const novaSenhaAluno = gerarSenhaSimples();
      const novaSenhaResponsavel = gerarSenhaSimples();

      usuarioAluno.senha = novaSenhaAluno;
      usuarioAluno.ativo = true;
      usuarioAluno.emailVerificado = true;
      usuarioAluno.emailVerificadoEm = usuarioAluno.emailVerificadoEm || new Date();
      await usuarioAluno.save();

      usuarioResponsavel.senha = novaSenhaResponsavel;
      usuarioResponsavel.ativo = true;
      usuarioResponsavel.emailVerificado = true;
      usuarioResponsavel.emailVerificadoEm = usuarioResponsavel.emailVerificadoEm || new Date();
      await usuarioResponsavel.save();

      await Aluno.updateOne(
        { _id: aluno._id, instituicao: instituicaoId },
        {
          $set: {
            codigoAcesso,
            'contatos.emailResponsavel': emailResponsavel
          }
        }
      );

      const nomeInstituicao = instituicao.nome || instituicao.sigla || 'Instituição';
      const siglaInstituicao = instituicao.sigla || instituicao.slug || 'Axoriin';

      const subject = `Axoriin • Credenciais de acesso — ${siglaInstituicao}`;

      const text = [
        `Prezados responsáveis,`,
        ``,
        `As credenciais de acesso ao Portal do Aluno e Responsável foram atualizadas.`,
        ``,
        `Portal: ${portal}`,
        ``,
        `DADOS DO ALUNO`,
        `Aluno: ${aluno.nome}`,
        `Turma: ${normalizarTurma(aluno.turma) || '—'}`,
        `Código de acesso: ${codigoAcesso}`,
        `Nova senha do aluno: ${novaSenhaAluno}`,
        ``,
        `DADOS DO RESPONSÁVEL`,
        `E-mail do responsável: ${emailResponsavel}`,
        `Nova senha do responsável: ${novaSenhaResponsavel}`,
        ``,
        `Atenção: as senhas anteriores deixam de funcionar a partir deste envio.`,
        ``,
        `Atenciosamente,`,
        `${nomeInstituicao}`,
        `Sistema Axoriin`
      ].join('\n');

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">
          <p>Prezados responsáveis,</p>

          <p>
            As credenciais de acesso ao <strong>Portal do Aluno e Responsável</strong>
            foram atualizadas.
          </p>

          <p>
            <strong>Portal:</strong><br>
            <a href="${portal}">${portal}</a>
          </p>

          <h3 style="margin-top:18px;">Dados do aluno</h3>
          <ul>
            <li><strong>Aluno:</strong> ${aluno.nome}</li>
            <li><strong>Turma:</strong> ${normalizarTurma(aluno.turma) || '—'}</li>
            <li><strong>Código de acesso:</strong> ${codigoAcesso}</li>
            <li><strong>Nova senha do aluno:</strong> ${novaSenhaAluno}</li>
          </ul>

          <h3 style="margin-top:18px;">Dados do responsável</h3>
          <ul>
            <li><strong>E-mail do responsável:</strong> ${emailResponsavel}</li>
            <li><strong>Nova senha do responsável:</strong> ${novaSenhaResponsavel}</li>
          </ul>

          <p>
            <strong>Atenção:</strong> as senhas anteriores deixam de funcionar a partir deste envio.
          </p>

          <p>
            Atenciosamente,<br>
            ${nomeInstituicao}<br>
            Sistema Axoriin
          </p>
        </div>
      `;

      try {
        await sendMail({
          to: emailResponsavel,
          subject,
          text,
          html
        });

        acessos.push({
          alunoId,
          usuarioId: String(usuarioAluno._id),
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          codigoAcesso,
          senha: novaSenhaAluno,
          status: 'senha_redefinida',
          observacao: 'Senha do aluno redefinida e enviada por e-mail.'
        });

        acessosResponsaveis.push({
          alunoId,
          usuarioId: String(usuarioResponsavel._id),
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          codigoAcesso,
          senha: novaSenhaResponsavel,
          status: 'senha_redefinida',
          observacao: 'Senha do responsável redefinida e enviada por e-mail.'
        });
      } catch (e) {
        erros.push({
          alunoId,
          nome: aluno.nome,
          turma: normalizarTurma(aluno.turma),
          email: emailResponsavel,
          codigoAcesso,
          motivo: `Senhas redefinidas, mas houve falha no envio do e-mail: ${String(e.message || e)}`
        });
      }
    }

    return res.json({
      ok: true,
      mensagem:
        `Envio concluído. ` +
        `E-mails enviados: ${acessosResponsaveis.length}. ` +
        `Ignorados: ${ignorados.length}. ` +
        `Erros: ${erros.length}.`,
      totalEnviados: acessosResponsaveis.length,
      totalIgnorados: ignorados.length,
      totalErros: erros.length,
      acessos,
      acessosResponsaveis,
      ignorados,
      erros,
      links: buildInstitutionLinks(instituicao.slug || '')
    });

  } catch (e) {
    console.error('[masterInstituicoes][enviar-acessos-email]', e);

    return res.status(500).json({
      mensagem: 'Erro ao enviar acessos por e-mail.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * GESTÃO DE ACESSOS DO ALUNO / RESPONSÁVEL
 * ========================================================================= */

router.get('/instituicoes/:id/alunos/:alunoId/acessos', requireSuperAdmin, async (req, res) => {
  try {
    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId) || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Instituição ou aluno inválido.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    const usuarioAluno = await Usuario.findOne({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'aluno'
    })
      .select('_id nome email tipo portal alunoId ativo createdAt updatedAt')
      .lean();

    const emailResponsavel = normalizeEmail(
      aluno?.contatos?.emailResponsavel ||
      ''
    );

    const usuarioResponsavel = await Usuario.findOne({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'responsavel'
    })
      .select('_id nome email tipo portal alunoId ativo createdAt updatedAt')
      .lean();

    const emailResponsavelEfetivo = normalizeEmail(
      usuarioResponsavel?.email || emailResponsavel || ''
    );

    return res.json({
      ok: true,
      aluno: {
        id: String(aluno._id),
        nome: aluno.nome || '',
        turma: aluno.turma || '',
        codigoAcesso: aluno.codigoAcesso || '',
        emailResponsavel: emailResponsavelEfetivo,
        emailCadastroAluno: emailResponsavel || '',
        emailDivergente: Boolean(
          usuarioResponsavel?.email &&
          emailResponsavel &&
          normalizeEmail(usuarioResponsavel.email) !== emailResponsavel
        )
      },
      acessoAluno: usuarioAluno
        ? {
            existe: true,
            usuarioId: String(usuarioAluno._id),
            nome: usuarioAluno.nome || '',
            email: usuarioAluno.email || '',
            tipo: usuarioAluno.tipo,
            portal: usuarioAluno.portal || 'aluno',
            ativo: usuarioAluno.ativo !== false,
            senhaDisponivel: false
          }
        : {
            existe: false,
            senhaDisponivel: false
          },
      acessoResponsavel: usuarioResponsavel
        ? {
            existe: true,
            usuarioId: String(usuarioResponsavel._id),
            nome: usuarioResponsavel.nome || '',
            email: usuarioResponsavel.email || '',
            tipo: usuarioResponsavel.tipo,
            portal: usuarioResponsavel.portal || 'responsavel',
            ativo: usuarioResponsavel.ativo !== false,
            senhaDisponivel: false
          }
        : {
            existe: false,
            email: emailResponsavelEfetivo || '',
            senhaDisponivel: false
          }
    });
  } catch (e) {
    console.error('[masterInstituicoes][consultar-acessos]', e);
    return res.status(500).json({
      mensagem: 'Erro ao consultar acessos.',
      erro: String(e.message || e)
    });
  }
});

router.patch('/instituicoes/:id/alunos/:alunoId/email-responsavel', requireSuperAdmin, async (req, res) => {
  try {
    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();
    const emailResponsavel = normalizeEmail(req.body?.emailResponsavel || '');

    if (!mongoose.isValidObjectId(instituicaoId) || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Instituição ou aluno inválido.' });
    }

    if (!isValidEmail(emailResponsavel)) {
      return res.status(400).json({ mensagem: 'Informe um e-mail válido para o responsável.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    }).select('_id nome turma codigoAcesso contatos instituicao');

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    const usuarioResponsavel = await Usuario.findOne({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'responsavel'
    });

    if (usuarioResponsavel && normalizeEmail(usuarioResponsavel.email) !== emailResponsavel) {
      const conflito = await Usuario.findOne({
        instituicao: instituicaoId,
        email: emailResponsavel,
        _id: { $ne: usuarioResponsavel._id }
      }).select('_id tipo alunoId').lean();

      if (conflito) {
        return res.status(409).json({
          mensagem: 'Este e-mail já está sendo usado por outro acesso nesta instituição.'
        });
      }

      usuarioResponsavel.email = emailResponsavel;
      usuarioResponsavel.tipo = 'responsavel';
      usuarioResponsavel.portal = 'responsavel';
      usuarioResponsavel.ativo = true;
      usuarioResponsavel.emailVerificado = true;
      usuarioResponsavel.emailVerificadoEm = usuarioResponsavel.emailVerificadoEm || new Date();
      await usuarioResponsavel.save();
    }

    aluno.contatos = aluno.contatos || {};
    aluno.contatos.emailResponsavel = emailResponsavel;
    await aluno.save();

    return res.json({
      ok: true,
      mensagem: usuarioResponsavel
        ? 'E-mail do responsável e acesso sincronizados com sucesso.'
        : 'E-mail do responsável atualizado com sucesso.',
      aluno: {
        id: String(aluno._id),
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || '',
        emailResponsavel
      },
      acessoResponsavel: usuarioResponsavel
        ? {
            existe: true,
            usuarioId: String(usuarioResponsavel._id),
            email: emailResponsavel,
            ativo: usuarioResponsavel.ativo !== false,
            portal: 'responsavel'
          }
        : { existe: false, email: emailResponsavel }
    });
  } catch (e) {
    console.error('[masterInstituicoes][email-responsavel]', e);

    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'Este e-mail já está sendo usado por outro acesso nesta instituição.'
      });
    }

    return res.status(500).json({
      mensagem: 'Erro ao atualizar e-mail do responsável.',
      erro: String(e.message || e)
    });
  }
});

router.post('/instituicoes/:id/alunos/:alunoId/gerar-acesso-responsavel', requireSuperAdmin, async (req, res) => {
  try {
    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();
    const emailResponsavel = normalizeEmail(req.body?.emailResponsavel || '');

    if (!mongoose.isValidObjectId(instituicaoId) || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Instituição ou aluno inválido.' });
    }

    if (!isValidEmail(emailResponsavel)) {
      return res.status(400).json({ mensagem: 'Informe um e-mail válido para o responsável.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso contatos instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    const existenteMesmoAluno = await Usuario.findOne({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'responsavel'
    }).lean();

    if (existenteMesmoAluno) {
      return res.status(409).json({
        mensagem: 'Este aluno já possui acesso de responsável. Use “Redefinir senha do responsável”.'
      });
    }

    const existenteOutroAluno = await Usuario.findOne({
      instituicao: instituicaoId,
      email: emailResponsavel,
      tipo: 'responsavel'
    }).lean();

    if (existenteOutroAluno) {
      return res.status(409).json({
        mensagem: 'Este e-mail já está vinculado como responsável de outro aluno nesta instituição.'
      });
    }

    const senha = gerarSenhaSimples();

    const novoResponsavel = new Usuario({
      nome: `Responsável - ${aluno.nome}`,
      email: emailResponsavel,
      senha,
      tipo: 'responsavel',
      portal: 'responsavel',
      alunoId: aluno._id,
      instituicao: instituicaoId,
      tenantId: instituicaoId,
      ativo: true,
      emailVerificado: true,
      emailVerificadoEm: new Date(),
      tokenVerificacaoHash: null,
      tokenVerificacaoExpiraEm: null,
    });

    await novoResponsavel.save();

    await Aluno.updateOne(
      { _id: aluno._id, instituicao: instituicaoId },
      { $set: { 'contatos.emailResponsavel': emailResponsavel } }
    );

    return res.json({
      ok: true,
      mensagem: 'Acesso do responsável criado com sucesso.',
      acesso: {
        alunoId,
        usuarioId: String(novoResponsavel._id),
        nome: aluno.nome,
        turma: normalizarTurma(aluno.turma),
        email: emailResponsavel,
        codigoAcesso: aluno.codigoAcesso || '',
        senha,
        status: 'responsavel_criado',
        observacao: 'Acesso do responsável criado com sucesso.'
      }
    });
  } catch (e) {
    console.error('[masterInstituicoes][gerar-acesso-responsavel]', e);

    if (e?.code === 11000) {
      return res.status(409).json({
        mensagem: 'Já existe usuário cadastrado com este e-mail.',
        erro: String(e.message || e)
      });
    }

    return res.status(500).json({
      mensagem: 'Erro ao gerar acesso do responsável.',
      erro: String(e.message || e)
    });
  }
});

router.post('/instituicoes/:id/alunos/:alunoId/redefinir-senha-responsavel', requireSuperAdmin, async (req, res) => {
  try {
    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId) || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Instituição ou aluno inválido.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso contatos instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    const usuarioResponsavel = await Usuario.findOne({
      instituicao: instituicaoId,
      alunoId: aluno._id,
      tipo: 'responsavel'
    });

    if (!usuarioResponsavel) {
      return res.status(404).json({
        mensagem: 'Este aluno ainda não possui acesso de responsável.'
      });
    }

    const senha = gerarSenhaSimples();
    usuarioResponsavel.senha = senha;
    usuarioResponsavel.ativo = true;
    usuarioResponsavel.portal = 'responsavel';
    usuarioResponsavel.tipo = 'responsavel';
    usuarioResponsavel.emailVerificado = true;
    usuarioResponsavel.emailVerificadoEm = usuarioResponsavel.emailVerificadoEm || new Date();

    await usuarioResponsavel.save();

    return res.json({
      ok: true,
      mensagem: 'Senha do responsável redefinida com sucesso.',
      acesso: {
        alunoId,
        usuarioId: String(usuarioResponsavel._id),
        nome: aluno.nome,
        turma: normalizarTurma(aluno.turma),
        email: usuarioResponsavel.email,
        codigoAcesso: aluno.codigoAcesso || '',
        senha,
        status: 'senha_redefinida',
        observacao: 'Nova senha do responsável gerada com sucesso.'
      }
    });
  } catch (e) {
    console.error('[masterInstituicoes][redefinir-senha-responsavel]', e);
    return res.status(500).json({
      mensagem: 'Erro ao redefinir senha do responsável.',
      erro: String(e.message || e)
    });
  }
});

/* =========================================================================
 * REDEFINIR SENHA DO ACESSO DO ALUNO
 * ========================================================================= */

async function redefinirSenhaAlunoMaster(req, res) {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const instituicaoId = String(req.params.id || '').trim();
    const alunoId = String(req.params.alunoId || '').trim();

    if (!mongoose.isValidObjectId(instituicaoId)) {
      return res.status(400).json({ mensagem: 'Instituição inválida.' });
    }

    if (!mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'Aluno inválido.' });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('_id nome sigla slug')
      .lean();

    if (!instituicao) {
      return res.status(404).json({ mensagem: 'Instituição não encontrada.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId contatos instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });
    }

    let usuario = null;

    if (aluno.usuarioId && mongoose.isValidObjectId(aluno.usuarioId)) {
      usuario = await Usuario.findOne({
        _id: aluno.usuarioId,
        instituicao: instituicaoId
      });
    }

    if (!usuario) {
      usuario = await Usuario.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id,
        tipo: 'aluno'
      });
    }

    if (!usuario) {
      return res.status(404).json({
        mensagem: 'Este aluno ainda não possui usuário de acesso. Gere o acesso primeiro.'
      });
    }

    let codigoAcesso = String(aluno.codigoAcesso || '').trim().toUpperCase();

    if (!codigoAcesso) {
      let tentativas = 0;

      do {
        codigoAcesso = gerarCodigoAcesso();
        tentativas++;

        if (tentativas > 30) {
          codigoAcesso = '';
          break;
        }
      } while (await Aluno.findOne({
        instituicao: instituicaoId,
        codigoAcesso
      }).select('_id').lean());

      if (!codigoAcesso) {
        return res.status(500).json({
          mensagem: 'Não foi possível gerar um código de acesso único para o aluno.'
        });
      }
    }

    const novaSenha = gerarSenhaSimples();

    usuario.senha = novaSenha;
    usuario.tipo = 'aluno';
    usuario.portal = 'aluno';
    usuario.alunoId = aluno._id;
    usuario.instituicao = instituicaoId;
    usuario.tenantId = instituicaoId;
    usuario.ativo = true;
    usuario.emailVerificado = true;
    usuario.emailVerificadoEm = usuario.emailVerificadoEm || new Date();

    await usuario.save();

    await Aluno.updateOne(
      { _id: aluno._id, instituicao: instituicaoId },
      {
        $set: {
          usuarioId: usuario._id,
          codigoAcesso
        }
      }
    );

    return res.json({
      ok: true,
      mensagem: 'Senha redefinida com sucesso.',
      acesso: {
        alunoId: String(aluno._id),
        usuarioId: String(usuario._id),
        nome: aluno.nome || '',
        turma: aluno.turma || '',
        email: normalizeEmail(usuario.email || ''),
        codigoAcesso,
        senha: novaSenha,
        status: 'senha_redefinida',
        observacao: 'A senha anterior foi substituída por esta nova senha.'
      },
      links: buildInstitutionLinks(instituicao.slug || '')
    });
  } catch (e) {
    console.error('[masterInstituicoes][redefinir-senha-aluno]', e);
    return res.status(500).json({
      mensagem: 'Erro ao redefinir senha do aluno.',
      erro: String(e.message || e)
    });
  }
}

// Compatível com: /api/master/instituicoes/instituicoes/:id/alunos/:alunoId/redefinir-senha
router.post('/instituicoes/:id/alunos/:alunoId/redefinir-senha', requireSuperAdmin, redefinirSenhaAlunoMaster);

// Compatível com: /api/master/instituicoes/:id/alunos/:alunoId/redefinir-senha
router.post('/:id/alunos/:alunoId/redefinir-senha', requireSuperAdmin, redefinirSenhaAlunoMaster);

module.exports = router;
