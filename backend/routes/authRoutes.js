'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

const Usuario = require('../models/Usuario');
let Instituicao = null;
let Aluno = null;

try { Instituicao = require('../models/Instituicao'); } catch {}
try { Aluno = require('../models/Aluno'); } catch {}

const { autenticar } = require('../middleware/autenticacao');

const isProd = process.env.NODE_ENV === 'production';

const TENANT_ALIASES = {
  cmdpii: 'cmdpii',
  'cmdpii-czs': 'cmdpii',
};

const DEFAULT_TENANT_SLUG = (process.env.DEFAULT_TENANT_SLUG || 'cmdpii').trim().toLowerCase();
const TIPOS_LOGIN_INSTITUCIONAL = ['admin', 'monitor', 'professor', 'secretaria'];

const { validatePasswordStrength, generateTemporaryPassword } = require('../utils/passwordPolicy');

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

function setTenantCookie(res, tenantCookie) {
  res.cookie('tenant', tenantCookie, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function isObjectIdLike(v) {
  return /^[a-f\d]{24}$/i.test(String(v || '').trim());
}

function normalizeLoginIdentifier(value) {
  return String(value || '').trim();
}

function normalizeCodigoAcesso(value) {
  return String(value || '').trim().toUpperCase();
}

function pickBackendBaseUrl(req) {
  const env =
    process.env.PUBLIC_API_URL ||
    process.env.APP_API_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (env) return String(env).replace(/\/+$/, '');

  if (!isProd) return 'http://localhost:5000';

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function pickFrontendBaseUrl(_req) {
  const site = process.env.PUBLIC_SITE_URL;
  if (site) return String(site).replace(/\/+$/, '');

  const client = process.env.CLIENT_URL;
  if (client) return String(client).replace(/\/+$/, '');

  return '';
}

function pickTenantParam(inst) {
  if (!inst) return '';
  if (inst.slug) return String(inst.slug);
  if (inst._id) return String(inst._id);
  if (inst.sigla) return String(inst.sigla).toLowerCase();
  return '';
}

async function findInstituicaoByTenant(t) {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const tenantRaw = String(t || '').trim();
  if (!tenantRaw) return null;

  const tenant = tenantRaw.toLowerCase();
  const candidates = [...new Set([
    tenant,
    TENANT_ALIASES[tenant],
    tenantRaw.toUpperCase()
  ].filter(Boolean))];

  if (isObjectIdLike(tenantRaw)) {
    const byId =
      (await Instituicao.findOne({ _id: tenantRaw, ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
      (await Instituicao.findOne({ _id: tenantRaw }).select('_id nome sigla slug ativo').lean().catch(() => null));
    if (byId) return byId;
  }

  for (const candidate of candidates) {
    const bySlug =
      (await Instituicao.findOne({ slug: String(candidate).toLowerCase(), ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
      (await Instituicao.findOne({ slug: String(candidate).toLowerCase() }).select('_id nome sigla slug ativo').lean().catch(() => null));
    if (bySlug) return bySlug;
  }

  for (const candidate of candidates) {
    const bySigla =
      (await Instituicao.findOne({ sigla: String(candidate).toUpperCase(), ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
      (await Instituicao.findOne({ sigla: String(candidate).toUpperCase() }).select('_id nome sigla slug ativo').lean().catch(() => null));
    if (bySigla) return bySigla;
  }

  return null;
}

async function getDefaultInstituicao() {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const byDefaultSlug = await findInstituicaoByTenant(DEFAULT_TENANT_SLUG);
  if (byDefaultSlug) return byDefaultSlug;

  const ativa = await Instituicao.findOne({ ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null);
  if (ativa) return ativa;

  const qualquer = await Instituicao.findOne({}).select('_id nome sigla slug ativo').lean().catch(() => null);
  if (qualquer) return qualquer;

  return null;
}

function getTenantFromReq(req) {
  return (
    req.tenantSlug ||
    req.query?.t ||
    req.query?.tenant ||
    req.body?.tenantSlug ||
    req.body?.tenant ||
    req.body?.t ||
    req.headers['x-tenant'] ||
    req.headers['x-tenant-slug'] ||
    req.cookies?.tenant ||
    ''
  );
}

function getTenantFromReqOrDefault(req) {
  const t = String(getTenantFromReq(req) || '').trim();
  return t || DEFAULT_TENANT_SLUG;
}

async function resolveInstituicaoOnlyIfTenantProvided(req) {
  const t = String(getTenantFromReq(req) || '').trim();
  if (!t) return null;
  return await findInstituicaoByTenant(t);
}

function buildJwtPayload(usuario) {
  const payload = {
    id: String(usuario._id),
    tipo: usuario.tipo,
    nome: usuario.nome,
    instituicao: String(usuario.instituicao || ''),
    email: String(usuario.email || '').toLowerCase(),
  };

  if (usuario.alunoId) {
    payload.alunoId = String(usuario.alunoId);
  }

  if (usuario.escopoObservatorio) {
    payload.escopoObservatorio = usuario.escopoObservatorio;
  }

  if (usuario.portal) {
    payload.portal = String(usuario.portal);
  } else if (usuario.tipo === 'aluno') {
    payload.portal = 'aluno';
  }

  return payload;
}

function buildAlunoPublicData(aluno) {
  if (!aluno) return null;

  return {
    _id: String(aluno._id),
    nome: aluno.nome || '',
    turma: aluno.turma || '',
    codigoAcesso: aluno.codigoAcesso || '',
    usuarioId: aluno.usuarioId ? String(aluno.usuarioId) : null
  };
}

function buildLoginResponse({ usuario, inst, token, aluno = null }) {
  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;

  let redirecionar = '/painel.html';

  if (usuario.tipo === 'professor') {
    redirecionar = '/painel-professor.html';
  }

  if (usuario.tipo === 'secretaria') {
    redirecionar = '/observatorio.html';
  }

  if (usuario.tipo === 'aluno') {
    redirecionar = '/painel-aluno.html';
  }

  if (usuario.tipo === 'responsavel' && usuario.alunoId) {
    redirecionar = `/ficha-aluno.html?id=${String(usuario.alunoId)}`;
  }

  return {
    mensagem: 'Login realizado com sucesso.',
    redirecionar,
    token,
    usuario: {
      id: String(usuario._id),
      tipo: usuario.tipo,
      nome: usuario.nome,
      instituicao: String(usuario.instituicao || ''),
      email: String(usuario.email || '').toLowerCase(),
      alunoId: usuario.alunoId ? String(usuario.alunoId) : null,
      portal:
  usuario.portal ||
  (usuario.tipo === 'aluno'
    ? 'aluno'
    : usuario.tipo === 'responsavel'
      ? 'responsavel'
      : 'institucional'),
      escopoObservatorio: usuario.escopoObservatorio || null
    },
    aluno: buildAlunoPublicData(aluno),
    instituicao: inst ? {
      id: String(inst._id),
      nome: inst.nome,
      sigla: inst.sigla,
      slug: inst.slug
    } : undefined,
    tenant: tenantCookie,
    portal:
  usuario.portal ||
  (usuario.tipo === 'aluno'
    ? 'aluno'
    : usuario.tipo === 'responsavel'
      ? 'responsavel'
      : 'institucional')
  };
}

async function doLoginForInstituicao(req, res, { email, senha, inst, portal = 'institucional' }) {
  const instituicaoId = inst?._id ? String(inst._id) : null;

  const filtrosBase = {
    email,
    ...(instituicaoId ? { instituicao: instituicaoId } : {}),
    $or: [{ ativo: true }, { ativo: { $exists: false } }],
  };

  if (portal === 'aluno') {
    filtrosBase.tipo = 'aluno';
  } else {
    filtrosBase.tipo = { $in: TIPOS_LOGIN_INSTITUCIONAL };
  }

  const usuario = await Usuario.findOne(filtrosBase)
    .select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio');

  if (!usuario) {
    if (portal === 'aluno') {
      return res.status(401).json({
        mensagem: 'Acesso do aluno não encontrado nesta instituição.',
      });
    }

    if (instituicaoId) {
      return res.status(401).json({
        mensagem: 'Usuário não encontrado nesta instituição. Verifique se você está no link correto (instituição).',
      });
    }

    return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
  }

  if (usuario.emailVerificado === false) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      mensagem: 'Conta não confirmada. Verifique seu e-mail para liberar o acesso.',
    });
  }

  const senhaValida = await bcrypt.compare(String(senha || ''), usuario.senha);
  if (!senhaValida) {
    return res.status(401).json({ mensagem: 'Senha incorreta.' });
  }

  const token = jwt.sign(buildJwtPayload(usuario), process.env.JWT_SECRET, { expiresIn: '2h' });
  setAuthCookie(res, token);

  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;
  setTenantCookie(res, tenantCookie);

  let aluno = null;
  if (usuario.tipo === 'aluno' && Aluno && usuario.alunoId) {
    aluno = await Aluno.findOne({
      _id: usuario.alunoId,
      instituicao: instituicaoId
    })
      .select('_id nome turma codigoAcesso usuarioId')
      .lean()
      .catch(() => null);
  }

  return res.json(buildLoginResponse({ usuario, inst, token, aluno }));
}

async function doLoginAluno(req, res, { login, senha, inst }) {
  const instituicaoId = inst?._id ? String(inst._id) : null;

  if (!instituicaoId) {
    return res.status(400).json({
      mensagem: 'Instituição não encontrada para o portal do aluno.'
    });
  }

  const loginNormalizado = normalizeLoginIdentifier(login);
  const email = isValidEmail(loginNormalizado) ? normalizeEmail(loginNormalizado) : null;
  const codigoAcesso = email ? null : normalizeCodigoAcesso(loginNormalizado);

  let usuario = null;
  let aluno = null;

  if (email) {
    usuario = await Usuario.findOne({
      email,
      instituicao: instituicaoId,
      tipo: { $in: ['aluno', 'responsavel'] },
      $or: [{ ativo: true }, { ativo: { $exists: false } }]
    }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio');
  } else {
    if (!Aluno || typeof Aluno.findOne !== 'function') {
      return res.status(500).json({
        mensagem: 'Model de aluno não disponível para login por código de acesso.'
      });
    }

    aluno = await Aluno.findOne({
      instituicao: instituicaoId,
      codigoAcesso
    }).select('_id nome turma codigoAcesso usuarioId instituicao tenantId').lean();

    if (!aluno) {
      return res.status(401).json({
        mensagem: 'Código de acesso não encontrado nesta instituição.'
      });
    }

    if (aluno.usuarioId) {
      usuario = await Usuario.findOne({
        _id: aluno.usuarioId,
        instituicao: instituicaoId,
        tipo: 'aluno',
        $or: [{ ativo: true }, { ativo: { $exists: false } }]
      }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio');
    }

    if (!usuario) {
      usuario = await Usuario.findOne({
        alunoId: aluno._id,
        instituicao: instituicaoId,
        tipo: 'aluno',
        $or: [{ ativo: true }, { ativo: { $exists: false } }]
      }).select('+senha nome email tipo instituicao tenantId emailVerificado alunoId portal ativo escopoObservatorio');
    }

    if (!usuario) {
      return res.status(401).json({
        mensagem: 'Acesso do aluno não vinculado corretamente. Procure a administração da instituição.'
      });
    }
  }

  if (!usuario) {
    return res.status(401).json({
      mensagem: 'Acesso não encontrado nesta instituição.'
    });
  }

  if (!['aluno', 'responsavel'].includes(String(usuario.tipo || '').toLowerCase())) {
    return res.status(403).json({
      mensagem: 'Este usuário não possui acesso ao portal do aluno/responsável.'
    });
  }

  if (usuario.emailVerificado === false) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      mensagem: 'Conta não confirmada. Verifique seu e-mail para liberar o acesso.',
    });
  }

  const senhaValida = await bcrypt.compare(String(senha || ''), usuario.senha);
  if (!senhaValida) {
    return res.status(401).json({ mensagem: 'Senha incorreta.' });
  }

  if (!aluno && Aluno && usuario.alunoId) {
    aluno = await Aluno.findOne({
      _id: usuario.alunoId,
      instituicao: instituicaoId
    }).select('_id nome turma codigoAcesso usuarioId').lean().catch(() => null);
  }

  if (!aluno) {
    return res.status(404).json({
      mensagem: 'Aluno vinculado a este acesso não foi encontrado nesta instituição.'
    });
  }

  const portalFinal = usuario.tipo === 'responsavel' ? 'responsavel' : 'aluno';

  const token = jwt.sign(
    {
      ...buildJwtPayload(usuario),
      portal: portalFinal,
      alunoId: usuario.alunoId ? String(usuario.alunoId) : String(aluno._id)
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  setAuthCookie(res, token);

  const tenantCookie = inst?.slug || DEFAULT_TENANT_SLUG;
  setTenantCookie(res, tenantCookie);

  return res.json(buildLoginResponse({
    usuario: {
      ...usuario.toObject(),
      portal: portalFinal,
      alunoId: usuario.alunoId ? String(usuario.alunoId) : String(aluno._id)
    },
    inst,
    token,
    aluno
  }));
}

/**
 * GET /auth/me
 */
/**
 * GET /auth/me
 */
router.get('/me', autenticar, (req, res) => {
  return res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    tipo: req.usuario.tipo,
    instituicao: req.usuario.instituicao,
    email: req.usuario.email || null,
    alunoId: req.usuario.alunoId || null,
    portal: req.usuario.portal || null,
    escopoObservatorio: req.usuario.escopoObservatorio || null
  });
});

/**
 * GET /auth/portais
 * Apenas para o front saber quais botões/telas mostrar
 */
router.get('/portais', async (_req, res) => {
  return res.json({
    ok: true,
    portais: {
      institucional: {
        ativo: true,
        loginUrl: '/login.html'
      },
      aluno: {
        ativo: true,
        loginUrl: '/login-aluno.html'
      }
    }
  });
});

/**
 * POST /auth/login
 * Login institucional
 */
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const senha = String(req.body?.senha || '');

  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }
  if (!senha) {
    return res.status(400).json({ mensagem: 'Informe sua senha.' });
  }

  try {
    const instFromTenant = await resolveInstituicaoOnlyIfTenantProvided(req);

    if (!instFromTenant?._id) {
      const defaultInst = await findInstituicaoByTenant(DEFAULT_TENANT_SLUG);

      if (defaultInst?._id) {
        const usuarioDefault = await Usuario.findOne({
          email,
          instituicao: String(defaultInst._id),
          tipo: { $in: TIPOS_LOGIN_INSTITUCIONAL },
          $or: [{ ativo: true }, { ativo: { $exists: false } }],
        }).select('_id');

        if (usuarioDefault) {
          return await doLoginForInstituicao(req, res, {
            email,
            senha,
            inst: defaultInst,
            portal: 'institucional'
          });
        }
      }

      const encontrados = await Usuario.find({
        email,
        tipo: { $in: TIPOS_LOGIN_INSTITUCIONAL },
        $or: [{ ativo: true }, { ativo: { $exists: false } }],
      }).select('_id instituicao emailVerificado tipo nome').lean();

      if (!encontrados?.length) {
        return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
      }

      const instIds = [...new Set(encontrados.map(u => String(u.instituicao || '')).filter(Boolean))];

      if (instIds.length > 1 && Instituicao) {
        const insts = await Instituicao.find({ _id: { $in: instIds } })
          .select('_id nome sigla slug')
          .lean()
          .catch(() => []);

        return res.status(409).json({
          code: 'AMBIGUOUS_TENANT',
          mensagem: 'Seu e-mail existe em mais de uma instituição. Selecione a instituição para entrar.',
          instituicoes: (insts || []).map(i => ({
            id: String(i._id),
            nome: i.nome,
            sigla: i.sigla || null,
            slug: i.slug || null,
            tenant: i.slug || String(i._id),
          })),
        });
      }

      const onlyId = instIds[0];
      if (!onlyId) {
        return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
      }

      let instLoaded = null;
      if (Instituicao) {
        instLoaded = await Instituicao.findOne({ _id: onlyId }).select('_id nome sigla slug').lean().catch(() => null);
      }

      return await doLoginForInstituicao(req, res, {
        email,
        senha,
        inst: instLoaded || { _id: onlyId },
        portal: 'institucional'
      });
    }

    return await doLoginForInstituicao(req, res, {
      email,
      senha,
      inst: instFromTenant,
      portal: 'institucional'
    });

  } catch (error) {
    console.error('Erro /auth/login:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao fazer login.', erro: error.message });
  }
});

/**
 * POST /auth/login-aluno
 * Login do aluno por código de acesso OU e-mail + senha
 */
router.post('/login-aluno', async (req, res) => {
  const login =
    normalizeLoginIdentifier(
      req.body?.login ||
      req.body?.email ||
      req.body?.codigoAcesso
    );

  const senha = String(req.body?.senha || '');

  if (!login) {
    return res.status(400).json({ mensagem: 'Informe o código de acesso ou e-mail do aluno.' });
  }

  if (!senha) {
    return res.status(400).json({ mensagem: 'Informe a senha.' });
  }

  try {
    const inst =
      await resolveInstituicaoOnlyIfTenantProvided(req) ||
      await findInstituicaoByTenant(DEFAULT_TENANT_SLUG) ||
      await getDefaultInstituicao();

    if (!inst?._id) {
      return res.status(400).json({ mensagem: 'Instituição não encontrada para o portal do aluno.' });
    }

    return await doLoginAluno(req, res, {
      login,
      senha,
      inst
    });
  } catch (error) {
    console.error('Erro /auth/login-aluno:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao fazer login do aluno.', erro: error.message });
  }
});

/**
 * GET /auth/usuario-logado
 */
router.get('/usuario-logado', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id)
      .select('-senha -__v')
      .populate('instituicao', 'nome sigla slug');

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    res.json(usuario);
  } catch (error) {
    console.error('Erro /auth/usuario-logado:', error);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário logado.' });
  }
});

/**
 * POST /auth/cadastro (PÚBLICO)
 */
router.post('/cadastro', async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  const email = normalizeEmail(req.body?.email);
  const senha = String(req.body?.senha || '');
  const tipo = String(req.body?.tipo || '').trim().toLowerCase();

  if (!nome || nome.length < 3) {
    return res.status(400).json({ mensagem: 'Informe o nome completo.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }
  const check = validatePasswordStrength(senha);
  if (!check.ok) {
    return res.status(400).json({ mensagem: check.message || 'A senha deve atender à política de segurança.' });
  }
  if (!['monitor', 'professor'].includes(tipo)) {
    return res.status(400).json({ mensagem: 'Tipo inválido. Selecione Monitor ou Professor.' });
  }

  try {
    const tenantInformado = getTenantFromReqOrDefault(req);
    const inst = await findInstituicaoByTenant(tenantInformado);
    const instituicaoId = inst?._id ? String(inst._id) : null;

    if (!instituicaoId) {
      return res.status(400).json({
        mensagem: 'Instituição não encontrada para este cadastro. Use o link correto da instituição.'
      });
    }

    const existente = await Usuario.findOne({ email, instituicao: instituicaoId });

    if (existente && existente.emailVerificado !== false) {
      return res.status(409).json({ mensagem: 'Este e-mail já está cadastrado nesta instituição.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const u = existente || new Usuario();
    u.nome = nome;
    u.email = email;
    u.senha = senha;
    u.tipo = tipo;
    u.instituicao = instituicaoId;

    u.emailVerificado = false;
    u.emailVerificadoEm = null;
    u.tokenVerificacaoHash = tokenHash;
    u.tokenVerificacaoExpiraEm = expiraEm;

    if (typeof u.ativo !== 'undefined') u.ativo = true;

    await u.save();

    const backendBase = pickBackendBaseUrl(req);
    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const tenantQs = tenantParam ? `&t=${encodeURIComponent(tenantParam)}` : '';
    const link = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}${tenantQs}`;

    const nomeInst = inst?.nome || 'SmartClass';
    const subject = `Confirme seu e-mail — ${nomeInst}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Confirmação de e-mail</h2>
        <p>Olá, <b>${nome}</b>.</p>
        <p>
          Seu cadastro foi solicitado para a instituição:
          <br><b style="font-size:15px">${nomeInst}</b>
        </p>
        <p>Para concluir seu cadastro como <b>${tipo}</b>, confirme seu e-mail clicando abaixo:</p>
        <p style="margin:16px 0">
          <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;
             background:#0aa; color:#001; text-decoration:none; font-weight:700;">
            Confirmar meu e-mail
          </a>
        </p>
        <p style="color:#666">Este link expira em 24 horas e já direciona para a instituição correta.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p style="color:#999;font-size:12px">Se você não solicitou este cadastro, ignore este e-mail.</p>
      </div>
    `;

    await sendEmailBestEffort({ to: email, subject, html });

    return res.status(201).json({
      mensagem: `Cadastro enviado. Verifique seu e-mail para confirmar o acesso (${nomeInst}).`,
      tenant: tenantParam,
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla || null,
        slug: inst.slug || tenantParam,
      },
    });
  } catch (error) {
    console.error('Erro /auth/cadastro:', error);
    return res.status(500).json({ mensagem: 'Erro ao cadastrar.', erro: error.message });
  }
});

/**
 * GET /auth/confirmar-email?token=...&t=...
 */
router.get('/confirmar-email', async (req, res) => {
  const rawToken = String(req.query?.token || '');
  const t = String(req.query?.t || req.tenantSlug || '').trim();

  if (!rawToken) return res.status(400).send('Token ausente.');

  try {
    const tokenHash = hashToken(rawToken);

    const usuario = await Usuario.findOne({
      tokenVerificacaoHash: tokenHash,
      tokenVerificacaoExpiraEm: { $gt: new Date() },
      emailVerificado: false,
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    });

    if (!usuario) {
      return res.status(400).send('Token inválido ou expirado.');
    }

    usuario.emailVerificado = true;
    usuario.emailVerificadoEm = new Date();
    usuario.tokenVerificacaoHash = null;
    usuario.tokenVerificacaoExpiraEm = null;
    await usuario.save();

    let tenantParam = t;
    if (!tenantParam && Instituicao && usuario.instituicao) {
      const inst = await Instituicao.findOne({ _id: usuario.instituicao }).select('_id sigla slug').lean().catch(() => null);
      tenantParam = pickTenantParam(inst);
    }

    if (!tenantParam) {
      tenantParam = DEFAULT_TENANT_SLUG;
    }

    setTenantCookie(res, tenantParam);

    const qs = `?t=${encodeURIComponent(tenantParam)}&verified=1`;

    const frontBase = pickFrontendBaseUrl(req);
    const target = frontBase ? `${frontBase}/login.html${qs}` : `/login.html${qs}`;

    return res.redirect(target);
  } catch (error) {
    console.error('Erro /auth/confirmar-email:', error);
    return res.status(500).send('Erro ao confirmar e-mail.');
  }
});

/**
 * POST /auth/reenviar-confirmacao (PÚBLICO)
 */
router.post('/reenviar-confirmacao', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const tenantInformado = getTenantFromReqOrDefault(req);

  if (!isValidEmail(email)) return res.status(400).json({ mensagem: 'E-mail inválido.' });

  try {
    const inst = await findInstituicaoByTenant(tenantInformado);
    const instituicaoId = inst?._id ? String(inst._id) : null;

    if (!instituicaoId) {
      return res.status(400).json({ mensagem: 'Instituição não encontrada.' });
    }

    const usuario = await Usuario.findOne({
      email,
      instituicao: instituicaoId,
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    });

    if (!usuario) {
      return res.json({ mensagem: 'Se existir cadastro pendente, enviaremos um novo link.' });
    }

    if (usuario.emailVerificado !== false) {
      return res.status(400).json({ mensagem: 'Este e-mail já foi confirmado.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);

    usuario.tokenVerificacaoHash = tokenHash;
    usuario.tokenVerificacaoExpiraEm = expiraEm;
    await usuario.save();

    const backendBase = pickBackendBaseUrl(req);
    const tenantParam = pickTenantParam(inst) || DEFAULT_TENANT_SLUG;
    const tenantQs = tenantParam ? `&t=${encodeURIComponent(tenantParam)}` : '';
    const link = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}${tenantQs}`;

    const nomeInst = inst?.nome || 'SmartClass';
    const subject = `Seu link de confirmação — ${nomeInst}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Confirmação de e-mail</h2>
        <p>Recebemos um pedido para reenviar seu link de confirmação.</p>
        <p><b>Instituição:</b> ${nomeInst}</p>
        <p style="margin:16px 0">
          <a href="${link}" style="display:inline-block;padding:10px 14px;border-radius:10px;
             background:#0aa; color:#001; text-decoration:none; font-weight:700;">
            Confirmar meu e-mail
          </a>
        </p>
        <p style="color:#666">Este link expira em 24 horas e já direciona para a instituição correta.</p>
      </div>
    `;

    await sendEmailBestEffort({ to: email, subject, html });

    return res.json({
      mensagem: 'Se existir cadastro pendente, enviaremos um novo link.',
      tenant: tenantParam,
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla || null,
        slug: inst.slug || tenantParam,
      },
    });
  } catch (error) {
    console.error('Erro /auth/reenviar-confirmacao:', error);
    return res.status(500).json({ mensagem: 'Erro ao reenviar confirmação.' });
  }
});

/**
 * POST /auth/cadastrar (apenas admin)
 */
router.post('/cadastrar', autenticar, async (req, res) => {
  if (req.usuario?.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar novos usuários.' });
  }

  const { nome, email, senha, tipo = 'monitor' } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios.' });
  }

  const instituicaoId = req.usuario?.instituicao;
  if (!instituicaoId) {
    return res.status(400).json({ mensagem: 'Instituição do usuário logado não encontrada.' });
  }

  try {
    const emailNormalizado = normalizeEmail(email);

    const existente = await Usuario.findOne({
      email: emailNormalizado,
      instituicao: instituicaoId,
    });

    if (existente) {
      return res.status(409).json({ mensagem: 'E-mail já está em uso nesta instituição.' });
    }

      const check = validatePasswordStrength(senha);
      if (!check.ok) {
        return res.status(400).json({ mensagem: check.message || 'A senha não atende à política de segurança.' });
      }

      const novoUsuario = new Usuario({
        nome,
        email: emailNormalizado,
        senha,
        tipo,
        instituicao: instituicaoId,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        tokenVerificacaoHash: null,
        tokenVerificacaoExpiraEm: null,
      });

    await novoUsuario.save();

    return res.status(201).json({ mensagem: 'Usuário criado com sucesso.' });
  } catch (error) {
    console.error('Erro /auth/cadastrar:', error);
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.', erro: error.message });
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie('tenant', {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

async function sendEmailBestEffort({ to, subject, html, text }) {
  try {
    const m = global.mensageria;
    if (m) {
      if (typeof m.sendEmail === 'function') return await m.sendEmail({ to, subject, html, text });
      if (m.email && typeof m.email.send === 'function') return await m.email.send({ to, subject, html, text });
      if (m.email && typeof m.email.sendMail === 'function') return await m.email.sendMail({ to, subject, html, text });
    }
  } catch (e) {
    console.warn('[MAIL] falha via mensageria:', e?.message || e);
  }

  try {
    const mailer = require('../utils/mailer');
    if (mailer) {
      if (typeof mailer.sendMail === 'function') return await mailer.sendMail({ to, subject, html, text });
      if (typeof mailer.send === 'function') return await mailer.send({ to, subject, html, text });
      if (typeof mailer.sendEmail === 'function') return await mailer.sendEmail({ to, subject, html, text });
    }
  } catch (e) {
    console.warn('[MAIL] utils/mailer indisponível ou sem função de envio:', e?.message || e);
  }

  console.log('📨 [MAIL-FALLBACK] To:', to);
  console.log('📨 [MAIL-FALLBACK] Subject:', subject);
  console.log('📨 [MAIL-FALLBACK] HTML:', html?.slice?.(0, 900) || '');
  return { ok: false, fallback: true };
}

module.exports = router;