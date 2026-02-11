// backend/routes/authRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

const Usuario = require('../models/Usuario');
let Instituicao = null;
try { Instituicao = require('../models/Instituicao'); } catch { /* ok */ }

const { autenticar } = require('../middleware/autenticacao');

const isProd = process.env.NODE_ENV === 'production';

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000, // 2h
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

/**
 * ✅ Base URL do BACKEND (para o link /auth/confirmar-email)
 */
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

/**
 * ✅ Base URL do FRONTEND (para redirecionar ao /login.html após confirmar)
 */
function pickFrontendBaseUrl(_req) {
  const site = process.env.PUBLIC_SITE_URL;
  if (site) return String(site).replace(/\/+$/, '');

  const client = process.env.CLIENT_URL;
  if (client) return String(client).replace(/\/+$/, '');

  return ''; // fallback: usa /login.html relativo
}

function pickTenantParam(inst) {
  if (!inst) return '';
  if (inst.slug) return String(inst.slug);
  if (inst._id) return String(inst._id);
  if (inst.sigla) return String(inst.sigla).toLowerCase();
  return '';
}

// ✅ tenantId “oficial” que vai no token (prioriza slug por ser estável/legível)
function pickTenantIdForToken(inst) {
  if (!inst) return '';
  if (inst.slug) return String(inst.slug).trim().toLowerCase();
  if (inst._id) return String(inst._id).trim();
  return '';
}

async function findInstituicaoByTenant(t) {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const tenant = String(t || '').trim();
  if (!tenant) return null;

  if (isObjectIdLike(tenant)) {
    const byId =
      (await Instituicao.findOne({ _id: tenant, ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
      (await Instituicao.findOne({ _id: tenant }).select('_id nome sigla slug ativo').lean().catch(() => null));
    if (byId) return byId;
  }

  const bySlug =
    (await Instituicao.findOne({ slug: tenant.toLowerCase(), ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
    (await Instituicao.findOne({ slug: tenant.toLowerCase() }).select('_id nome sigla slug ativo').lean().catch(() => null));
  if (bySlug) return bySlug;

  const bySigla =
    (await Instituicao.findOne({ sigla: tenant.toUpperCase(), ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null)) ||
    (await Instituicao.findOne({ sigla: tenant.toUpperCase() }).select('_id nome sigla slug ativo').lean().catch(() => null));
  if (bySigla) return bySigla;

  return null;
}

async function getDefaultInstituicao() {
  if (!Instituicao || typeof Instituicao.findOne !== 'function') return null;

  const ativa = await Instituicao.findOne({ ativo: true }).select('_id nome sigla slug ativo').lean().catch(() => null);
  if (ativa) return ativa;

  const qualquer = await Instituicao.findOne({}).select('_id nome sigla slug ativo').lean().catch(() => null);
  if (qualquer) return qualquer;

  return null;
}

function getTenantFromReq(req) {
  return (
    req.tenantId || // ✅ se resolveTenant estiver ativo no /auth no futuro
    req.tenantSlug ||
    req.query?.t ||
    req.body?.tenant ||
    req.body?.t ||
    req.headers['x-tenant'] ||
    req.headers['x-tenant-slug'] ||
    req.cookies?.tenant ||
    ''
  );
}

async function resolveInstituicaoFromReq(req) {
  const t = getTenantFromReq(req);
  const inst = (await findInstituicaoByTenant(t)) || (await getDefaultInstituicao());
  return inst;
}

async function resolveInstituicaoOnlyIfTenantProvided(req) {
  const t = getTenantFromReq(req);
  if (!t) return null;
  return await findInstituicaoByTenant(t);
}

// tenta usar mensageria/mailer; se não existir, não quebra
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

/**
 * GET /auth/me
 */
router.get('/me', autenticar, (req, res) => {
  return res.json({
    id: req.usuario.id,
    userId: req.usuario.id,
    nome: req.usuario.nome,
    tipo: req.usuario.tipo,
    role: req.usuario.tipo,
    instituicao: req.usuario.instituicao,
    tenantId: req.usuario.tenantId || null, // ✅ novo
    email: req.usuario.email || null,
  });
});

/**
 * POST /auth/login
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

    // Se NÃO veio tenant explícito, tenta resolver pelo e-mail e pode cair no AMBIGUOUS
    if (!instFromTenant?._id) {
      const encontrados = await Usuario.find({
        email,
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

      return await doLoginForInstituicao(req, res, { email, senha, inst: instLoaded || { _id: onlyId } });
    }

    return await doLoginForInstituicao(req, res, { email, senha, inst: instFromTenant });

  } catch (error) {
    console.error('Erro /auth/login:', error);
    return res.status(500).json({ mensagem: 'Erro interno ao fazer login.', erro: error.message });
  }
});

async function doLoginForInstituicao(req, res, { email, senha, inst }) {
  const instituicaoId = inst?._id ? String(inst._id) : null;

  const usuario = await Usuario.findOne({
    email,
    ...(instituicaoId ? { instituicao: instituicaoId } : {}),
    $or: [{ ativo: true }, { ativo: { $exists: false } }],
  }).select('+senha nome email tipo instituicao emailVerificado');

  if (!usuario) {
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

  // ✅ tenantId que será usado pelo requireAuth depois
  const tenantId = pickTenantIdForToken(inst) || pickTenantIdForToken({ _id: usuario.instituicao });

  const payload = {
    // compatibilidade atual
    id: String(usuario._id),
    tipo: usuario.tipo,
    nome: usuario.nome,
    instituicao: String(usuario.instituicao || ''),
    email: String(usuario.email || '').toLowerCase(),

    // ✅ novos campos p/ multi-tenant + migração
    tenantId: tenantId || null,
    userId: String(usuario._id),
    role: usuario.tipo,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
  setAuthCookie(res, token);

  const redirecionar =
    usuario.tipo === 'professor'
      ? '/painel-professor.html'
      : '/painel.html';

  return res.json({
    mensagem: 'Login realizado com sucesso.',
    redirecionar,
    token,
    tenantId: payload.tenantId, // ✅ já devolve pro front se quiser salvar
    usuario: payload,
    instituicao: inst ? { id: String(inst._id), nome: inst.nome, sigla: inst.sigla, slug: inst.slug } : undefined,
  });
}

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

    return res.json({
      ...usuario.toObject(),
      tenantId: req.usuario.tenantId || null, // ✅ novo
    });
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
  const tipo = String(req.body?.tipo || '').trim().toLowerCase(); // monitor|professor

  if (!nome || nome.length < 3) {
    return res.status(400).json({ mensagem: 'Informe o nome completo.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }
  if (!senha || senha.length < 6) {
    return res.status(400).json({ mensagem: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (!['monitor', 'professor'].includes(tipo)) {
    return res.status(400).json({ mensagem: 'Tipo inválido. Selecione Monitor ou Professor.' });
  }

  try {
    const inst = await resolveInstituicaoFromReq(req);
    const instituicaoId = inst?._id ? String(inst._id) : null;

    if (!instituicaoId) {
      return res.status(400).json({
        mensagem: 'Instituição não encontrada para este cadastro. Use o link correto da instituição (ex.: subdomínio ou ?t=...).'
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
    const tenantParam = pickTenantParam(inst);
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
    });
  } catch (error) {
    console.error('Erro /auth/cadastro:', error);
    return res.status(500).json({ mensagem: 'Erro ao cadastrar.', erro: error.message });
  }
});

/**
 * ✅ GET /auth/confirmar-email?token=...&t=...
 * ✅ Agora redireciona para o FRONTEND (CLIENT_URL/PUBLIC_SITE_URL)
 */
router.get('/confirmar-email', async (req, res) => {
  const rawToken = String(req.query?.token || '');
  const t = String(req.query?.t || req.tenantSlug || req.tenantId || '').trim();

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

    const qs = tenantParam ? `?t=${encodeURIComponent(tenantParam)}&verified=1` : `?verified=1`;

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
  const t =
    String(req.body?.t || req.query?.t || req.tenantSlug || req.tenantId || req.cookies?.tenant || '').trim();

  if (!isValidEmail(email)) return res.status(400).json({ mensagem: 'E-mail inválido.' });

  try {
    const usuario = await Usuario.findOne({
      email,
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

    let tenantParam = t;
    if (!tenantParam && Instituicao && usuario.instituicao) {
      const inst = await Instituicao.findOne({ _id: usuario.instituicao }).select('_id sigla slug nome').lean().catch(() => null);
      tenantParam = pickTenantParam(inst);
    } else if (tenantParam) {
      const inst = await findInstituicaoByTenant(tenantParam);
      tenantParam = pickTenantParam(inst) || tenantParam;
    }

    const tenantQs = tenantParam ? `&t=${encodeURIComponent(tenantParam)}` : '';
    const link = `${backendBase}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}${tenantQs}`;

    let nomeInst = 'SmartClass';
    if (Instituicao && usuario.instituicao) {
      const inst = await Instituicao.findOne({ _id: usuario.instituicao }).select('nome').lean().catch(() => null);
      if (inst?.nome) nomeInst = inst.nome;
    }

    const subject = `Seu link de confirmação — ${nomeInst}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Confirmação de e-mail</h2>
        <p>Recebemos um pedido para reenviar seu link de confirmação.</p>
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

    return res.json({ mensagem: 'Se existir cadastro pendente, enviaremos um novo link.' });
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
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

module.exports = router;
