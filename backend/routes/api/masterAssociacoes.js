'use strict';

const express = require('express');
const mongoose = require('mongoose');

const requireSuperAdmin = require('../../middleware/requireSuperAdmin');
const Instituicao = require('../../models/Instituicao');
const Usuario = require('../../models/Usuario');
const UsuarioVinculoInstituicao = require('../../models/UsuarioVinculoInstituicao');
const { criarOuAtualizarVinculo } = require('../../services/usuarioVinculos');
const { generateTemporaryPassword, validatePasswordStrength } = require('../../utils/passwordPolicy');
const { sendMail } = require('../../utils/mailer');

const router = express.Router();

function slugify(value) {
  return String(value || '')
    .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function email(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1','true','sim','yes','on'].includes(String(value).trim().toLowerCase());
}

router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const filter = {
      $or: [
        { categoriaInstituicao: 'associacao' },
        { 'associacaoConfig.ativo': true },
        { modulosAtivos: 'associacao' },
      ],
    };
    if (req.query.status === 'ativo') filter.ativo = true;
    if (req.query.status === 'inativo') filter.ativo = false;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$and = [{ $or: [{ nome: rx }, { sigla: rx }, { slug: rx }, { cnpj: rx }] }];
    }

    const associacoes = await Instituicao.find(filter)
      .select('nome nomeExibicao sigla slug logoUrl cnpj email telefone ativo ativa categoriaInstituicao instituicaoMatriz modulosAtivos associacaoConfig createdAt updatedAt')
      .populate('instituicaoMatriz', 'nome sigla slug')
      .sort({ nome: 1 })
      .lean();

    const tenantIds = associacoes.map(item => item._id);
    const [vinculos, legados] = await Promise.all([
      UsuarioVinculoInstituicao.aggregate([
        {
          $match: {
            instituicao: { $in: tenantIds },
            ativo: true,
            'acessosModulos.associacao.ativo': true,
          },
        },
        { $group: { _id: '$instituicao', usuarios: { $addToSet: '$usuario' } } },
      ]),
      Usuario.aggregate([
        {
          $match: {
            instituicao: { $in: tenantIds },
            ativo: { $ne: false },
            'acessosModulos.associacao.ativo': true,
          },
        },
        { $group: { _id: '$instituicao', usuarios: { $addToSet: '$_id' } } },
      ]),
    ]);

    const userMap = new Map();
    for (const item of [...vinculos, ...legados]) {
      const key = String(item._id);
      const set = userMap.get(key) || new Set();
      for (const userId of item.usuarios || []) set.add(String(userId));
      userMap.set(key, set);
    }

    return res.json({
      associacoes: associacoes.map(item => ({
        ...item,
        totalUsuarios: userMap.get(String(item._id))?.size || 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro ao listar associações.', erro: error.message });
  }
});

router.get('/matrizes', requireSuperAdmin, async (_req, res) => {
  try {
    const instituicoes = await Instituicao.find({
      $and: [
        { $or: [{ categoriaInstituicao: { $ne: 'associacao' } }, { categoriaInstituicao: { $exists: false } }] },
        { $or: [{ ativo: true }, { ativa: true }] },
      ],
    })
      .select('nome nomeExibicao sigla slug categoriaInstituicao ativo ativa')
      .sort({ nome: 1 })
      .lean();

    return res.json({ instituicoes });
  } catch (error) {
    return res.status(500).json({ mensagem: 'Erro ao listar instituições vinculáveis.', erro: error.message });
  }
});

router.post('/', requireSuperAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const nome = String(req.body.nome || '').trim();
    const slug = slugify(req.body.slug || req.body.sigla || nome);
    const adminNome = String(req.body.adminNome || req.body.presidenteNome || '').trim();
    const adminEmail = email(req.body.adminEmail);
    const senha = String(req.body.senhaTemporaria || generateTemporaryPassword());

    if (nome.length < 3) return res.status(400).json({ mensagem: 'Informe o nome oficial da associação.' });
    if (slug.length < 3) return res.status(400).json({ mensagem: 'Slug inválido.' });
    if (adminNome.length < 3) return res.status(400).json({ mensagem: 'Informe o nome do primeiro administrador.' });
    if (!isEmail(adminEmail)) return res.status(400).json({ mensagem: 'Informe um e-mail válido para o presidente.' });

    const identidadeExistente = await Usuario.findOne({ email: adminEmail })
      .select('_id nome email ativo instituicao tenantId')
      .lean();

    if (identidadeExistente?.ativo === false) {
      return res.status(409).json({ mensagem: 'Esse e-mail pertence a um usuário inativo. Reative o usuário antes de conceder o vínculo.' });
    }

    if (!identidadeExistente) {
      const passwordCheck = validatePasswordStrength(senha);
      if (!passwordCheck.ok) return res.status(400).json({ mensagem: passwordCheck.message });
    }

    const existing = await Instituicao.findOne({ $or: [{ slug }, { nome }] }).lean();
    if (existing) return res.status(409).json({ mensagem: 'Já existe uma instituição com esse nome ou slug.' });

    let associacao;
    let usuario;
    let vinculo;
    let identidadeReutilizada = Boolean(identidadeExistente);

    await session.withTransaction(async () => {
      const created = await Instituicao.create([{
        nome,
        nomeExibicao: String(req.body.nomeExibicao || nome).trim(),
        sigla: String(req.body.sigla || '').trim() || undefined,
        slug,
        cnpj: String(req.body.cnpj || '').replace(/\D/g, '') || undefined,
        email: email(req.body.email || adminEmail),
        telefone: String(req.body.telefone || '').trim() || undefined,
        endereco: String(req.body.endereco || '').trim() || undefined,
        municipio: String(req.body.municipio || '').trim() || undefined,
        estado: String(req.body.estado || '').trim().toUpperCase() || undefined,
        timezone: String(req.body.timezone || 'America/Rio_Branco').trim(),
        logoUrl: String(req.body.logoUrl || '').trim() || undefined,
        categoriaInstituicao: 'associacao',
        instituicaoMatriz: mongoose.isValidObjectId(String(req.body.instituicaoMatriz || '')) ? req.body.instituicaoMatriz : null,
        modulosAtivos: ['associacao'],
        associacaoConfig: {
          ativo: true,
          plano: ['piloto','essencial','profissional','rede','personalizado'].includes(req.body.plano) ? req.body.plano : 'piloto',
          limiteUsuarios: Number(req.body.limiteUsuarios || 10),
          limiteArmazenamentoMb: Number(req.body.limiteArmazenamentoMb || 1024),
          nomePresidente: adminNome,
          periodoMandato: String(req.body.periodoMandato || '').trim() || null,
          emailResposta: email(req.body.emailResposta || adminEmail),
          identidadeHerdadaDaMatriz: bool(req.body.identidadeHerdadaDaMatriz, false),
        },
        redeEnsino: 'outra',
        tipoEscola: 'outra',
        observatorioAtivo: false,
        visivelParaSecretaria: false,
        ambienteTeste: bool(req.body.ambienteTeste, false),
        ativo: true,
        ativa: true,
      }], { session });
      associacao = created[0];

      if (identidadeExistente) {
        usuario = await Usuario.findById(identidadeExistente._id).session(session);
      } else {
        const users = await Usuario.create([{
          nome: adminNome,
          email: adminEmail,
          senha,
          tipo: 'admin',
          portal: 'institucional',
          instituicao: associacao._id,
          tenantId: associacao._id,
          ativo: true,
          emailVerificado: true,
          emailVerificadoEm: new Date(),
          acessosModulos: { associacao: { ativo: true, perfil: 'presidente' } },
        }], { session });
        usuario = users[0];
      }

      vinculo = await criarOuAtualizarVinculo({
        usuarioId: usuario._id,
        instituicaoId: associacao._id,
        perfilAssociacao: 'presidente',
        tipoInstitucional: 'admin',
        ativo: true,
        origem: 'master_associacoes',
        session,
      });
    });

    let envio = null;
    try {
      const base = String(process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
      const link = `${base || ''}/login.html?t=${encodeURIComponent(slug)}`;
      const nomeSaudacao = identidadeExistente?.nome || adminNome;
      const subject = `Seu acesso ao Axoriin Associações — ${associacao.sigla || associacao.nome}`;

      if (identidadeReutilizada) {
        envio = await sendMail({
          to: adminEmail,
          subject,
          text: `Olá, ${nomeSaudacao}. Seu acesso à associação ${associacao.nome} foi liberado. Use o mesmo e-mail e a mesma senha que você já utiliza no Axoriin. Acesso: ${link}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Axoriin Associações</h2><p>Olá, <b>${nomeSaudacao}</b>.</p><p>Seu acesso a <b>${associacao.nome}</b> foi liberado.</p><p>Utilize <b>o mesmo e-mail e a mesma senha</b> que você já usa no Axoriin.</p><p><a href="${link}">Acessar a associação</a></p></div>`,
        });
      } else {
        envio = await sendMail({
          to: adminEmail,
          subject,
          text: `Olá, ${adminNome}. Sua associação foi criada no Axoriin. Usuário: ${adminEmail}. Senha temporária: ${senha}. Acesso: ${link}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Axoriin Associações</h2><p>Olá, <b>${adminNome}</b>.</p><p>O ambiente de <b>${associacao.nome}</b> foi criado.</p><p><b>Usuário:</b> ${adminEmail}<br><b>Senha temporária:</b> ${senha}</p><p><a href="${link}">Acessar o sistema</a></p><p>Troque a senha no primeiro acesso.</p></div>`,
        });
      }
    } catch (error) {
      envio = { ok: false, error: error.message };
    }

    return res.status(201).json({
      mensagem: identidadeReutilizada
        ? 'Associação criada e vinculada a uma identidade Axoriin já existente.'
        : 'Associação e primeiro acesso criados no ecossistema Axoriin.',
      associacao: {
        id: String(associacao._id), nome: associacao.nome, sigla: associacao.sigla,
        slug: associacao.slug, plano: associacao.associacaoConfig?.plano,
      },
      administrador: {
        id: String(usuario._id),
        nome: usuario.nome,
        email: usuario.email,
        perfil: 'presidente',
        vinculoId: String(vinculo._id),
        identidadeReutilizada,
      },
      senhaTemporaria: identidadeReutilizada ? null : senha,
      links: {
        login: `/login.html?t=${encodeURIComponent(slug)}`,
        modulo: `/associacao.html?t=${encodeURIComponent(slug)}`,
      },
      email: envio,
    });
  } catch (error) {
    console.error('[masterAssociacoes] erro ao criar:', error);
    if (error?.code === 11000) {
      return res.status(409).json({ mensagem: 'Já existe um vínculo ou cadastro com esses dados.', erro: error.message });
    }
    return res.status(500).json({ mensagem: 'Erro ao criar associação.', erro: error.message });
  } finally {
    await session.endSession().catch(() => null);
  }
});

router.patch('/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensagem: 'Associação inválida.' });
    const set = {};
    for (const field of ['nome','nomeExibicao','sigla','email','telefone','endereco','logoUrl']) {
      if (field in req.body) set[field] = String(req.body[field] || '').trim() || undefined;
    }
    if ('ativo' in req.body) { set.ativo = bool(req.body.ativo); set.ativa = set.ativo; }
    if ('plano' in req.body) set['associacaoConfig.plano'] = req.body.plano;
    if ('limiteUsuarios' in req.body) set['associacaoConfig.limiteUsuarios'] = Number(req.body.limiteUsuarios);
    if ('limiteArmazenamentoMb' in req.body) set['associacaoConfig.limiteArmazenamentoMb'] = Number(req.body.limiteArmazenamentoMb);
    if ('nomePresidente' in req.body) set['associacaoConfig.nomePresidente'] = String(req.body.nomePresidente || '').trim() || null;
    if ('periodoMandato' in req.body) set['associacaoConfig.periodoMandato'] = String(req.body.periodoMandato || '').trim() || null;
    if ('instituicaoMatriz' in req.body) set.instituicaoMatriz = mongoose.isValidObjectId(String(req.body.instituicaoMatriz || '')) ? req.body.instituicaoMatriz : null;
    if ('identidadeHerdadaDaMatriz' in req.body) set['associacaoConfig.identidadeHerdadaDaMatriz'] = bool(req.body.identidadeHerdadaDaMatriz, false);
    const doc = await Instituicao.findOneAndUpdate(
      { _id: req.params.id, categoriaInstituicao: 'associacao' },
      { $set: set },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ mensagem: 'Associação não encontrada.' });
    return res.json({ mensagem: 'Associação atualizada.', associacao: doc });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

module.exports = router;
