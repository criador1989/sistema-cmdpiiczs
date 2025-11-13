// backend/index.js
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

// Evita cache de HTML
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Cabeçalhos de segurança em produção
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
      allowedHeaders: ['Content-Type','Authorization','x-access-token'],
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
const dashboardCompatRoutes         = require('./routes/api/dashboard-compat');
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

// APH
let aphCrudRoutes = null, aphEstatisticasRoutes = null, aphPdfRoutes = null;
try { aphCrudRoutes = require('./routes/api/aph'); } catch {}
try { aphEstatisticasRoutes = require('./routes/api/aph-estatisticas'); } catch {}
try { aphPdfRoutes = require('./routes/api/aph-pdf'); } catch {}

/* =========================
   AUTH
   ========================= */
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const { autenticar } = require('./middleware/autenticacao');

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

// Debug opcional
app.get('/api/debug/whoami-raw', (req, res) => {
  res.json({
    cookies: req.cookies || {},
    authHeader: req.headers['authorization'] || null,
    origin: req.headers.origin || null,
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

// Notificações
mountIf('/api/notificacoes', notificacoesMetricsRoutes);
mountIf('/api/notificacoes', notificacoesApiRoutes);

// Dashboard compat
mountIf('/api/dashboard', dashboardCompatRoutes);

// Dashboard-fast protegido
mountIf('/api/dashboard-fast', dashboardFastRoutes, autenticar);

// APIs diversas
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

mountIf('/api/telegram',       telegramBotRoutes);
mountIf('/api/comunicacao',    comunicacaoPaisRoutes);
mountIf('/api/comunicacao',    comunicacaoAutoRoutes);

/* 🔥 🔒 CORREÇÃO AQUI — PROTEGENDO API MONITORES */
mountIf('/api/monitores', monitoresApiRoutes, autenticar);

// APH
mountIf('/api/aph', aphCrudRoutes, autenticar);
mountIf('/api/aph', aphEstatisticasRoutes);
mountIf('/api/aph', aphPdfRoutes);

/* =========================
   ESTÁTICOS / HTML
   ========================= */
const uploadRoot = path.join(__dirname, 'uploads');
const publicRoot = path.join(__dirname, 'public');
fs.mkdirSync(path.join(uploadRoot, 'alunos'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, 'uploads'), { recursive: true });

app.use('/uploads', express.static(uploadRoot));
app.use('/uploads', express.static(path.join(publicRoot, 'uploads'), { maxAge: '7d', immutable: true }));

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
   AUTH / HTML PROTEGIDOS
   ========================= */
function exigirAdmin(req, res, next) {
  const u = req.usuario || {};
  const role = String(u.perfil || u.role || u.tipo || '').toLowerCase();
  if (!role.includes('admin')) return res.status(403).sendFile(path.join(publicRoot, '403.html'));
  next();
}

app.get('/ficha-aluno.html',  autenticar, (_req, res) => res.sendFile(path.join(publicRoot, 'ficha-aluno.html')));
app.get('/lista-alunos.html', autenticar, (_req, res) => res.sendFile(path.join(publicRoot, 'lista-alunos.html')));
app.get('/monitores.html',    autenticar, exigirAdmin, (_req, res) => res.sendFile(path.join(publicRoot, 'monitores.html')));
app.get('/monitor-ficha.html',autenticar, exigirAdmin, (_req, res) => res.sendFile(path.join(publicRoot, 'monitor-ficha.html')));

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
