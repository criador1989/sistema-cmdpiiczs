'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const os = require('os');

const app = express();

/* =========================
   DIAGNÓSTICO / SEGURANÇA
   ========================= */
console.log('NODE_ENV =', process.env.NODE_ENV || '(não definido)');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  });
}

/* =========================
   CORS
   ========================= */
const CLIENT_URL   = (process.env.CLIENT_URL || 'http://localhost:5173').toLowerCase();
const RENDER_HOST  = (process.env.RENDER_EXTERNAL_HOSTNAME || '').toLowerCase();
const allowedOrigins = new Set([
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  (process.env.RENDER_EXTERNAL_URL || '').toLowerCase(),
  (process.env.DASHBOARD_URL || '').toLowerCase(),
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const o = origin.toLowerCase();
    if (allowedOrigins.has(o)) return true;
    const u = new URL(o);
    if (RENDER_HOST && u.hostname === RENDER_HOST) return true;
    if (u.hostname.endsWith('.onrender.com')) return true;
    if (u.hostname === os.hostname()) return true;
  } catch {}
  return false;
}

app.use(
  cors((req, cb) => {
    cb(null, {
      origin: isAllowedOrigin(req.headers.origin),
      credentials: true,
      methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
      allowedHeaders: ['Content-Type','Authorization','x-access-token','x-tenant','x-tenant-slug'],
      optionsSuccessStatus: 200,
    });
  })
);

/* =========================
   PARSERS
   ========================= */
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

/* =========================
   ✅ TENANT RESOLVER (ANTES DE TUDO)
   ========================= */
function normalizeSlug(s) {
  return String(s || '').trim().toLowerCase();
}

function extractSubdomainSlug(host) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return '';

  const noPort = h.split(':')[0];

  if (noPort === 'localhost') return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(noPort)) return '';

  const parts = noPort.split('.').filter(Boolean);
  if (parts.length < 3) return '';

  const sub = parts[0];
  if (sub === 'www') return '';
  return sub;
}

try {
  const { tenantResolver } = require('./middleware/tenant');

  app.use((req, res, next) => {
    const sub = extractSubdomainSlug(req.headers.host);

    if (!req.query) req.query = {};
    if (!req.query.t && sub) req.query.t = sub;

    return tenantResolver(req, res, () => {
      const slug = normalizeSlug(req.tenantSlug);

      if (slug) {
        res.cookie('tenant', slug, {
          httpOnly: false,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 24 * 60 * 60 * 1000,
        });
      }

      return next();
    });
  });

  console.log('🏷️  Tenant resolver ligado (query/header/cookie/subdomínio).');
} catch (e) {
  console.warn('⚠️  Tenant resolver não carregado:', e?.message || e);
}

/* =========================
   MODELS
   ========================= */
[
  'Aluno','Notificacao','Usuario','Log','Instituicao','AphAtendimento','Counter',
  'Observacao','Monitor','MonitorPresenca','MonitorNota','MonitorAtividade'
].forEach(m => { try { require(`./models/${m}`); } catch {} });

/* =========================
   MENSAEGERIA
   ========================= */
try {
  const { initMensageria, getStatus } = require('./services/mensageria');
  initMensageria(app);
  global.mensageria = app.locals.mensageria;
  console.log('✉️  Mensageria injetada (email/telegram/whatsapp).');
  app.get('/debug/mensageria/status', (_req, res) => {
    try { res.json({ ...(getStatus?.() || {}), ativo: !!app.locals.mensageria }); }
    catch (e) { res.status(500).json({ erro: String(e.message || e) }); }
  });
} catch (e) {
  console.warn('⚠️  Mensageria não carregada:', e?.message || e);
}

/* =========================
   DEBUG DE E-MAIL
   ========================= */
const {
  verify: verifyMail,
  verifyAll,
  MAIL_ENABLED,
  SMTP_HOST,
  SMTP_PORT,
  MAIL_USER,
  MAIL_FROM,
  getLastMailError,
  getLastProvider
} = require('./utils/mailer');

app.get('/debug/mail/verify', async (_req, res) => {
  try {
    if (!MAIL_ENABLED) return res.status(200).json({ ok: false, reason: 'MAIL_DISABLED' });
    const result = await verifyMail();
    return res.status(result.ok ? 200 : 500).json({ ...result, lastError: getLastMailError() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/debug/mail/status', (_req, res) => {
  res.json({
    MAIL_ENABLED: !!MAIL_ENABLED,
    SMTP_HOST,
    SMTP_PORT,
    MAIL_USER: MAIL_USER ? '(definido)' : '(vazio)',
    MAIL_FROM,
    provider: getLastProvider?.(),
    nodeEnv: process.env.NODE_ENV || '(unset)',
  });
});

try {
  app.use('/api', require('./routes/api/mail-health'));
  console.log('🩺  Mail health ligado em /api/_mail/health');
} catch {
  console.warn('ℹ️  /api/_mail/health indisponível.');
}

/* =========================
   IMPORTS DE ROTAS
   ========================= */
const alunoRoutes                   = require('./routes/api/alunos');
const notificacoesMetricsRoutes     = require('./routes/api/notificacoes.metrics');
const notificacoesApiRoutes         = require('./routes/api/notificacoes');
const alertasRoutes                 = require('./routes/api/alunos-alertas');
const dashboardFastRoutes           = require('./routes/api/dashboard-fast');

const pdfRoutes                     = require('./routes/api/pdf');
const fichaPdfRoutes                = require('./routes/api/fichapdf');
const fichaApiRoutes                = require('./routes/api/ficha');
const fichaAlunoRoutes              = require('./routes/api/fichaAluno');
const fichaViewRoutes               = require('./routes/views/fichaView');
const motivosRoutes                 = require('./routes/api/motivos');
const controleNotificacoesRoutes    = require('./routes/api/controleNotificacoes');
const usuariosRoutes                = require('./routes/api/usuarios');
const logsRoutes                    = require('./routes/api/logs');
const relatorioNotificacoesRoute    = require('./routes/api/relatorioNotificacoes');
const estatisticasRoutes            = require('./routes/api/estatisticas');
const mensagensRoutes               = require('./routes/api/mensagens');
const observacoesRoutes             = require('./routes/api/observacoes');
const diagnosticoNotaRoutes         = require('./routes/api/diagnosticoNota');
const metricsRoutes                 = require('./routes/api/metrics');
const publicAlunoRoutes             = require('./routes/api/publicAluno');
const instituicoesRoutes            = require('./routes/api/instituicoes');
const notificacoesViewRoutes        = require('./routes/views/notificacoes');
const qrcodeProfessoresRoute        = require('./routes/api/qrcodeProfessores');
const professoresRoute              = require('./routes/api/professores');
const cartoesRoutes                 = require('./routes/api/cartoes');
const cartoesProfessoresRoute       = require('./routes/api/cartoesProfessores');
const acessoProfessorRoute          = require('./routes/api/acessoProfessor');
const responsavelRoutes             = require('./routes/api/responsavel');
const fichaResponsavelRoute         = require('./routes/api/fichaResponsavel');
const fichaTesteRoute               = require('./routes/api/fichaTeste');
const telegramBotRoutes             = require('./routes/api/telegramBot');
const comunicacaoPaisRoutes         = require('./routes/api/comunicacaoPais');
const comunicacaoAutoRoutes         = require('./routes/api/comunicacao');
const monitoresApiRoutes            = require('./routes/api/monitores');
const rankingAlunosRouter           = require('./routes/api/rankingAlunos');
const fixInstituicaoLegacy          = require('./routes/api/fixInstituicaoLegacy');

// ✅ MASTER (SuperAdmin)
let masterInstituicoesRoutes = null;
try { masterInstituicoesRoutes = require('./routes/api/masterInstituicoes'); } catch {}

/* =========================
   AUTH
   ========================= */
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

/* ==========================================================
   ✅ FALLBACK: /auth/confirmar-email (se authRoutes não tiver)
   ========================================================== */
app.get('/auth/confirmar-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).send('Token ausente.');

    const Usuario = mongoose.models.Usuario || mongoose.model('Usuario');

    const tokenFields = [
      'emailConfirmToken',
      'emailConfirmacaoToken',
      'confirmEmailToken',
      'tokenConfirmacaoEmail',
      'tokenConfirmacao',
      'confirmacaoEmailToken',
      'emailToken',
      'token'
    ];

    const or = tokenFields.map(f => ({ [f]: token }));

    let usuario = await Usuario.findOne({ $or: or }).catch(() => null);

    if (!usuario) {
      usuario = await Usuario.findOne({
        $or: [
          { 'emailConfirm.token': token },
          { 'confirmacaoEmail.token': token },
          { 'email.confirm.token': token }
        ]
      }).catch(() => null);
    }

    if (!usuario) {
      return res.status(400).send('Token inválido ou usuário não encontrado.');
    }

    const now = new Date();
    const expCandidates = [
      usuario.emailConfirmExpires,
      usuario.emailConfirmacaoExpires,
      usuario.confirmEmailExpires,
      usuario.tokenExpires,
      usuario.expiraEm,
      usuario['emailConfirm']?.expires,
      usuario['confirmacaoEmail']?.expires
    ].filter(Boolean);

    if (expCandidates.length) {
      const exp = expCandidates.find(d => d instanceof Date) || null;
      if (exp && exp <= now) {
        return res.status(400).send('Token expirado. Solicite um novo cadastro/confirmação.');
      }
    }

    if ('emailConfirmado' in usuario) usuario.emailConfirmado = true;
    if ('emailVerificado' in usuario) usuario.emailVerificado = true;
    if ('confirmado' in usuario) usuario.confirmado = true;

    if ('status' in usuario) usuario.status = 'ATIVO';
    if ('ativo' in usuario) usuario.ativo = true;

    if ('confirmadoEm' in usuario) usuario.confirmadoEm = now;
    if ('emailConfirmadoEm' in usuario) usuario.emailConfirmadoEm = now;

    tokenFields.forEach(f => { if (f in usuario) usuario[f] = undefined; });
    if (usuario.emailConfirm) {
      if ('token' in usuario.emailConfirm) usuario.emailConfirm.token = undefined;
      if ('expires' in usuario.emailConfirm) usuario.emailConfirm.expires = undefined;
    }
    if (usuario.confirmacaoEmail) {
      if ('token' in usuario.confirmacaoEmail) usuario.confirmacaoEmail.token = undefined;
      if ('expires' in usuario.confirmacaoEmail) usuario.confirmacaoEmail.expires = undefined;
    }

    await usuario.save();

    const front = (process.env.FRONTEND_URL || process.env.CLIENT_URL || '').trim();
    const target = front
      ? `${front.replace(/\/+$/, '')}/login.html?confirmado=1`
      : `/login.html?confirmado=1`;

    return res.redirect(target);
  } catch (err) {
    console.error('Erro fallback /auth/confirmar-email:', err);
    return res.status(500).send('Erro interno ao confirmar e-mail.');
  }
});

const { autenticar } = require('./middleware/autenticacao');
const exigirSuperAdmin = require('./middleware/exigirSuperAdmin');

/* =========================
   APH
   ========================= */
let aphCrudRoutes = null, aphEstatisticasRoutes = null, aphPdfRoutes = null;
try { aphCrudRoutes = require('./routes/api/aph'); } catch {}
try { aphEstatisticasRoutes = require('./routes/api/aph-estatisticas'); } catch {}
try { aphPdfRoutes = require('./routes/api/aph-pdf'); } catch {}

/* =========================
   HELPERS DE PERFIL
   ========================= */
function getRole(req) {
  const u = req.usuario || {};
  const raw = String(u.tipo ?? u.perfil ?? u.role ?? u.cargo ?? u.funcao ?? '').toLowerCase();
  return raw.trim().replace(/\s+/g, ' ');
}

function send403(res, publicRoot) {
  const p403 = path.join(publicRoot, '403.html');
  if (fs.existsSync(p403)) return res.status(403).sendFile(p403);
  return res.status(403).send('403 - Acesso negado');
}

/* =========================
   ✅ BLOQUEIO REAL POR URL (ANTES DO express.static)
   ========================= */
function buildProfessorGuard(publicRoot) {
  const blockedExact = new Set([
    '/notificacoes.html',
    '/ver-notificacoes.html',
    '/usuarios.html',
    '/estatisticas.html',
    '/logs.html',
    '/controle-notificacoes.html',
    '/cadastro-aluno.html',
    '/transferir-turma.html',
    '/monitores.html',
    '/monitor-ficha.html',
    '/ranking-alunos.html'
  ]);

  const blockedPrefixes = [
    '/notificacoes',
    '/ver-notificacoes',
    '/usuarios',
    '/estatisticas',
    '/logs',
    '/controle-notificacoes',
    '/cadastro-aluno',
    '/transferir-turma',
    '/monitores',
    '/api/ranking-alunos',
    '/api/usuarios',
    '/api/logs',
    '/api/estatisticas',
    '/api/controle-notificacoes',
  ];

  const alwaysPublic = new Set([
    '/login.html',
    '/cadastro-usuario.html',
    '/bem-vindo.html',
    '/manifest.json',
    '/service-worker.js',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/axoriin-32x32.png',
    '/icons/axoriin-192x192.png',
    '/icons/axoriin-512x512.png',
    '/favicon.ico',
    '/__version',
    '/healthz',
    '/public/tenant',
    '/assets',
    '/assets/',
    '/icons',
    '/icons/',
    '/img',
    '/img/',
    '/uploads',
    '/uploads/'
  ]);

  return function professorGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;

    if (
      p.startsWith('/assets/') ||
      p.startsWith('/icons/')  ||
      p.startsWith('/img/')    ||
      p.startsWith('/uploads/')
    ) return next();

    if (alwaysPublic.has(p)) return next();

    const looksLikeHtml = p.endsWith('.html');
    const prefixHit = blockedPrefixes.some(pref => p === pref || p.startsWith(pref + '/'));
    const shouldCheck = looksLikeHtml || prefixHit;
    if (!shouldCheck) return next();

    autenticar(req, res, () => {
      const role = getRole(req);

      const isAdmin     = role.includes('admin');
      const isMonitor   = role.includes('monitor');
      const isProfessor = role.includes('prof') && !isAdmin && !isMonitor;

      if (isProfessor) {
        if (blockedExact.has(p) || prefixHit) return send403(res, publicRoot);
      }

      return next();
    });
  };
}

/* =========================
   ENDPOINTS p/ PAINEL (whoami)
   ========================= */
app.get('/api/usuario', autenticar, (req, res) => {
  const u = req.usuario || {};
  res.json({
    id: u._id || u.id || null,
    nome: u.nome || u.login || 'Usuário',
    email: u.email || null,
    tipo: u.tipo || u.perfil || 'usuario',
    perfil: u.perfil || u.tipo || 'usuario',
    instituicao: u.instituicao || null,
  });
});

app.get('/api/usuario-logado', autenticar, (req, res) => {
  const u = req.usuario || {};
  res.json({
    id: u._id || u.id || null,
    nome: u.nome || u.login || 'Usuário',
    tipo: u.tipo || u.perfil || 'usuario',
  });
});

app.get('/api/debug/whoami-raw', (req, res) => {
  res.json({
    tenant: req.tenantSlug || null,
    cookies: req.cookies || {},
    authHeader: req.headers['authorization'] || null,
    origin: req.headers.origin || null,
    host: req.headers.host || null,
  });
});

/* =========================
   FALLBACKS LEVES
   ========================= */
app.get('/api/dashboard/alertas', async (_req, res) => {
  try {
    const Aluno = mongoose.model('Aluno');
    const alunos = await Aluno.find({ ativo: true }).select('nome turma comportamento notaComportamento').lean();
    const comp = a => Number(a.comportamento ?? a.notaComportamento ?? 0);
    const regular = alunos.filter(a => { const n = comp(a); return n >= 5 && n < 7; });
    const insuf   = alunos.filter(a => { const n = comp(a); return n >= 3 && n < 5; });
    res.json({ regular, insuficiente: insuf });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/dashboard/graficos', async (_req, res) => {
  try {
    const Aluno = mongoose.model('Aluno');
    const alunos = await Aluno.find({ ativo: true }).select('turma comportamento notaComportamento').lean();
    const comp = a => Number(a.comportamento ?? a.notaComportamento ?? 0);
    const turmas = [...new Set(alunos.map(a => (a.turma || '—').trim()))];
    const medias = turmas.map(t => {
      const g = alunos.filter(a => (a.turma || '—').trim() === t).map(comp).filter(n => Number.isFinite(n) && n > 0);
      const m = g.length ? g.reduce((s, n) => s + n, 0) / g.length : 0;
      return Number(m.toFixed(2));
    });
    const dist = { labels: ['<3','3-5','5-7','7-10'], valores: [0,0,0,0] };
    alunos.forEach(a => {
      const c = comp(a);
      if (!Number.isFinite(c) || c <= 0) return;
      if (c < 3) dist.valores[0]++; else if (c < 5) dist.valores[1]++;
      else if (c < 7) dist.valores[2]++; else dist.valores[3]++;
    });
    res.json({ turmas, medias, distribuicao: dist });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* =========================
   MONTAGEM DE ROTAS
   ========================= */
function mountIf(prefix, router, ...middlewares) {
  if (!router) return;
  if (middlewares && middlewares.length) app.use(prefix, ...middlewares, router);
  else app.use(prefix, router);
}

mountIf('/api/notificacoes', notificacoesMetricsRoutes);
mountIf('/api/notificacoes', notificacoesApiRoutes);

mountIf('/api/dashboard-fast', dashboardFastRoutes, autenticar);

mountIf('/api/ficha',          fichaApiRoutes, autenticar);
mountIf('/api/fichaAluno',     fichaAlunoRoutes, autenticar);
mountIf('/ficha',              fichaViewRoutes, autenticar);
mountIf('/api',                fichaTesteRoute);

mountIf('/api/alunos',         alunoRoutes);
mountIf('/api',                pdfRoutes);
mountIf('/api',                fichaPdfRoutes);
mountIf('/notificacoes',       notificacoesViewRoutes);
mountIf('/api/responsavel',    responsavelRoutes);
mountIf('/api/motivos',        motivosRoutes);
mountIf('/api/cartoes',        cartoesRoutes);
mountIf('/api/cartoes-professores', cartoesProfessoresRoute);
mountIf('/api/professores',    professoresRoute);
mountIf('/api/qrcode-professores', qrcodeProfessoresRoute);
mountIf('/api/usuarios',       usuariosRoutes);
mountIf('/api/logs',           logsRoutes);
mountIf('/api/controle-notificacoes', controleNotificacoesRoutes);
mountIf('/api',                relatorioNotificacoesRoute);
mountIf('/api/estatisticas',   estatisticasRoutes);
mountIf('/api/mensagens',      mensagensRoutes);
mountIf('/api/observacoes',    observacoesRoutes);
mountIf('/api/diagnostico',    diagnosticoNotaRoutes);
mountIf('/api/metrics',        metricsRoutes);
mountIf('/api',                publicAlunoRoutes);
mountIf('/api/instituicoes',   instituicoesRoutes);
mountIf('/api/alertas',        alertasRoutes);
mountIf('/api/ranking-alunos', rankingAlunosRouter, autenticar);

mountIf('/api/telegram',       telegramBotRoutes);
mountIf('/api/comunicacao',    comunicacaoPaisRoutes);
mountIf('/api/comunicacao',    comunicacaoAutoRoutes);

mountIf('/api/monitores',      monitoresApiRoutes, autenticar);

mountIf('/api/aph', aphCrudRoutes, autenticar);
mountIf('/api/aph', aphEstatisticasRoutes);
mountIf('/api/aph', aphPdfRoutes);

/* =========================
   ✅ MASTER INSTITUIÇÕES (SuperAdmin)
   ========================= */
mountIf('/api/master/instituicoes', masterInstituicoesRoutes, autenticar, exigirSuperAdmin);

/* =========================
   ✅ FIX TEMPORÁRIO DE INSTITUIÇÃO LEGADA (SuperAdmin)
   ========================= */
mountIf('/api/fix-instituicao', fixInstituicaoLegacy, autenticar, exigirSuperAdmin);

/* =========================
   ESTÁTICOS / HTML
   ========================= */
const uploadRoot = path.join(__dirname, 'uploads');
const publicRoot = path.join(__dirname, 'public');
const imgRoot    = path.join(__dirname, 'img');
const assetsRoot = path.join(publicRoot, 'assets');

fs.mkdirSync(path.join(uploadRoot, 'alunos'), { recursive: true });
fs.mkdirSync(path.join(uploadRoot, 'observacoes'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, 'uploads'), { recursive: true });
fs.mkdirSync(imgRoot, { recursive: true });
fs.mkdirSync(assetsRoot, { recursive: true });

app.use('/uploads', express.static(uploadRoot));
app.use('/uploads', express.static(path.join(publicRoot, 'uploads'), {
  maxAge: '7d',
  immutable: true
}));

app.use('/img', express.static(imgRoot, {
  maxAge: '30d',
  immutable: true
}));

app.use('/assets', express.static(assetsRoot, {
  maxAge: '30d',
  immutable: true
}));

/* =========================
   ✅ GUARD ANTES DO STATIC
   ========================= */
app.use(buildProfessorGuard(publicRoot));

/* =========================
   STATIC (HTML)
   ========================= */
app.use(express.static(publicRoot, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/service-worker.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicRoot, 'service-worker.js'));
});

app.get('/', (_req, res) => res.redirect('/login.html'));

/* =========================
   ✅ PUBLIC TENANT
   ========================= */
function slugToNameRegex(slug) {
  const safe = String(slug || '').replace(/[^a-z0-9]+/gi, ' ').trim();
  if (!safe) return null;
  const parts = safe
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('\\s*'), 'i');
}

app.get('/public/tenant', async (req, res) => {
  try {
    const InstituicaoModel = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const slug = normalizeSlug(req.tenantSlug);

    let inst = null;

    if (slug) {
      inst =
        (await InstituicaoModel.findOne({ slug, ativo: true }).select('nome sigla slug ativo').lean().catch(() => null)) ||
        (await InstituicaoModel.findOne({ slug }).select('nome sigla slug ativo').lean().catch(() => null));

      if (!inst) {
        const rx = slugToNameRegex(slug);
        if (rx) {
          inst =
            (await InstituicaoModel.findOne({ nome: rx, ativo: true }).select('nome sigla ativo').lean().catch(() => null)) ||
            (await InstituicaoModel.findOne({ nome: rx }).select('nome sigla ativo').lean().catch(() => null));
        }
      }
    }

    if (!inst) {
      inst =
        (await InstituicaoModel.findOne({ ativo: true }).select('nome sigla slug ativo').lean().catch(() => null)) ||
        (await InstituicaoModel.findOne({}).select('nome sigla slug ativo').lean().catch(() => null));
    }

    const nome = inst?.nome || process.env.NOME_COLEGIO || 'SmartClass';
    const sigla = inst?.sigla || null;

    return res.json({
      nomeColegio: nome,
      sigla,
      tenant: slug || inst?.slug || null,
    });
  } catch (e) {
    return res.json({
      nomeColegio: process.env.NOME_COLEGIO || 'SmartClass',
      sigla: null,
      tenant: normalizeSlug(req.tenantSlug) || null,
    });
  }
});

/* =========================
   AUTH / HTML PROTEGIDOS
   ========================= */
function exigirAdmin(req, res, next) {
  const u = req.usuario || {};
  const role = String(u.perfil || u.role || u.tipo || '').toLowerCase();
  if (!role.includes('admin')) return send403(res, publicRoot);
  next();
}

app.get('/ficha-aluno.html',    autenticar, (_req, res) => res.sendFile(path.join(publicRoot, 'ficha-aluno.html')));
app.get('/lista-alunos.html',   autenticar, (_req, res) => res.sendFile(path.join(publicRoot, 'lista-alunos.html')));
app.get('/ranking-alunos.html', autenticar, (_req, res) => res.sendFile(path.join(publicRoot, 'ranking-alunos.html')));
app.get('/monitores.html',      autenticar, exigirAdmin, (_req, res) => res.sendFile(path.join(publicRoot, 'monitores.html')));
app.get('/monitor-ficha.html',  autenticar, exigirAdmin, (_req, res) => res.sendFile(path.join(publicRoot, 'monitor-ficha.html')));

/* =========================
   DIAGNÓSTICOS / ERRORS
   ========================= */
app.get('/__version', (_req, res) =>
  res.json({ commit: process.env.RENDER_GIT_COMMIT || 'desconhecido', builtAt: new Date().toISOString() })
);
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use((req, res) => {
  if (req.method === 'GET') {
    const nf = path.join(publicRoot, '404.html');
    if (fs.existsSync(nf)) return res.status(404).sendFile(nf);
  }
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

/* =========================
   START HTTP + MONGO
   ========================= */
const URI  = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor ligado em: http://localhost:${PORT}`);
  console.log('🧪 Health pronto: /__version e /healthz');
  console.log('🌍 CORS: Render + localhost + *.onrender.com');
  (async () => { try { await verifyAll(); } catch {} })();
});

async function connectMongo() {
  if (!/^mongodb(\+srv)?:\/\//i.test(URI)) return console.error('❌ URI do Mongo inválida.');
  const masked = URI.replace(/\/\/.*?@/, '//***@');
  console.log('🔐 Conectando no Mongo:', masked);
  try {
    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: Number(process.env.DB_SERVER_SEL_MS || 60000),
      socketTimeoutMS:         Number(process.env.DB_SOCKET_MS || 60000),
      heartbeatFrequencyMS: 10000,
      maxPoolSize:          Number(process.env.DB_MAX_POOL || 20),
      minPoolSize:          Number(process.env.DB_MIN_POOL || 0),
      retryWrites: true,
      family: 4,
    });
    console.log('🟢 Conectado ao MongoDB');
  } catch (err) {
    console.error('🟡 Falha ao conectar no Mongo:', err?.message || err);
    setTimeout(connectMongo, 15000);
  }
}
connectMongo();

process.on('SIGINT', async () => {
  try { await mongoose.disconnect(); } catch {}
  console.log('\n👋 Encerrado com sucesso');
  process.exit(0);
});