'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const Usuario = require('../../models/Usuario');
const ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
const { getPresetBase } = require('../../utils/configuracaoDisciplinar');

function verificarMaster(req, res, next) {
  const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();

  if (['admin', 'superadmin', 'master'].includes(tipo)) {
    return next();
  }

  return res.status(403).json({
    mensagem: 'Acesso restrito ao painel master.'
  });
}

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

router.get('/instituicoes', autenticar, verificarMaster, async (_req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const list = await Instituicao.find({})
      .select('_id nome sigla slug ativo')
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

router.post('/instituicoes', autenticar, verificarMaster, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const nome = String(req.body?.nome || '').trim();
    const sigla = String(req.body?.sigla || '').trim();
    const slug = normSlug(req.body?.slug || sigla || nome);
    const preset = normalizarPreset(req.body?.preset);

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
        ativo: inst.ativo
      },
      configuracaoDisciplinar: {
        id: String(config._id),
        preset: config.preset,
        tipoRegulamento: config.tipoRegulamento
      },
      links: {
        login: `/login.html?t=${encodeURIComponent(slug)}`,
        cadastro: `/cadastro-usuario.html?t=${encodeURIComponent(slug)}`
      }
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

router.patch('/instituicoes/:id', autenticar, verificarMaster, async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const id = String(req.params.id || '').trim();
    const ativo = !!req.body?.ativo;

    const up = await Instituicao.findByIdAndUpdate(
      id,
      { $set: { ativo } },
      { new: true }
    )
      .select('_id nome sigla slug ativo')
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

/* =========================================================================
 * USUÁRIOS DA INSTITUIÇÃO
 * ========================================================================= */

router.post('/instituicoes/:id/usuarios', autenticar, verificarMaster, async (req, res) => {
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
      .select('_id nome sigla slug ativo')
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

    if (!senha || senha.length < 6) {
      return res.status(400).json({ mensagem: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    if (!['admin', 'monitor', 'professor'].includes(tipo)) {
      return res.status(400).json({
        mensagem: 'Tipo inválido. Use admin, monitor ou professor.'
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
    });

    await novoUsuario.save();

    return res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        id: String(novoUsuario._id),
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        instituicao: {
          id: String(instituicao._id),
          nome: instituicao.nome,
          sigla: instituicao.sigla || null,
          slug: instituicao.slug || null,
        }
      },
      links: {
        login: `/login.html?t=${encodeURIComponent(instituicao.slug || '')}`
      }
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

module.exports = router;