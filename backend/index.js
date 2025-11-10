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

// Cabeçalhos mínimos de segurança em produção
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
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').toLowerCase();
const RENDER_HOST = (process.env.RENDER_EXTERNAL_HOSTNAME || '').toLowerCase();
const allowedOrigins = new Set([
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'https://localhost:5173',
  'https://127.0.0.1:5173',
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
  } catch (_) {}
  return false;
}

function corsOptionsDelegate(req, cb) {
  const origin = req.headers.origin;
  const allow = isAllowedOrigin(origin);
  cb(null, {
    origin: allow,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token'],
    optionsSuccessStatus: 200,
  });
}

app.use(cors(corsOptionsDelegate));

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
try { require('./models/Aluno'); } catch {}
try { require('./models/Notificacao'); } catch {}
try { require('./models/Usuario'); } catch {}
try { require('./models/Log'); } catch {}
try { require('./models/Instituicao'); } catch {}
try { require('./models/AphAtendimento'); } catch {}
try { require('./models/Counter'); } catch {}
try { require('./models/Observacao'); } catch {} // garante Observacao carregado

/* =========================
   MENSAEGERIA
   ========================= */
try {
  const { initMensageria, getStatus: getMensageriaStatus } = require('./services/mensageria');
  initMensageria(app);
  global.mensageria = app.locals.mensageria;
  console.log('✉️  Mensageria injetada (email/telegram/whatsapp).');

  app.get('/debug/mensageria/status', (_req, res) => {
    try {
      const st = typeof getMensageriaStatus === 'function' ? getMensageriaStatus() : {};
      res.json({ ...st, hasAppMensageria: !!app.locals.mensageria });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
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
  getLastProvider,
} = require('./utils/mailer');

app.get('/debug/mail/verify', async (_req, res) => {
  try {
    if (!MAIL_ENABLED) return res.status(200).json({ ok: false, reason: 'MAIL_DISABLED' });
    const result = await verifyMail();
    return res.status(result.ok ? 200 : 500).json({ ...result, lastError: getLastMailError() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/debug/mail/status', (_req, res) => {
  res.json({
    MAIL_ENABLED: Boolean(MAIL_ENABLED),
    SMTP_HOST,
    SMTP_PORT,
    MAIL_USER: MAIL_USER ? '(definido)' : '(vazio)',
    MAIL_FROM,
    provider: getLastProvider && getLastProvider(),
    nodeEnv: process.env.NODE_ENV || '(unset)',
  });
});

try {
  app.use('/api', require('./routes/api/mail-health'));
  console.log('🩺  Mail health ligado em /api/_mail/health');
} catch (e) {
  console.warn('ℹ️  /api/_mail/health indisponível.');
}

/* =========================
   ROTAS
   ========================= */
const alunoRoutes = require('./routes/api/alunos');
const notificacoesApiRoutes = require('./routes/api/notificacoes');
const notificacoesViewRoutes = require('./routes/views/notificacoes');
const responsavelRoutes = require('./routes/api/responsavel');
const fichaResponsavelRoute = require('./routes/api/fichaResponsavel');
const fichaTesteRoute = require('./routes/api/fichaTeste');
const cartoesRoutes = require('./routes/api/cartoes');
const cartoesProfessoresRoute = require('./routes/api/cartoesProfessores');
const professoresRoute = require('./routes/api/professores');
const qrcodeProfessoresRoute = require('./routes/api/qrcodeProfessores');
const acessoProfessorRoute = require('./routes/api/acessoProfessor');
const pdfRoutes = require('./routes/api/pdf');
const fichaPdfRoutes = require('./routes/api/fichapdf');
const fichaApiRoutes = require('./routes/api/ficha');
const fichaAlunoRoutes = require('./routes/api/fichaAluno'); // 🔹 Adicionado
const fichaViewRoutes = require('./routes/views/fichaView');
const motivosRoutes = require('./routes/api/motivos');
const controleNotificacoesRoutes = require('./routes/api/controleNotificacoes');
const usuariosRoutes = require('./routes/api/usuarios');
const logsRoutes = require('./routes/api/logs');
const relatorioNotificacoesRoute = require('./routes/api/relatorioNotificacoes');
const estatisticasRoutes = require('./routes/api/estatisticas');
const mensagensRoutes = require('./routes/api/mensagens');
const observacoesRoutes = require('./routes/api/observacoes');
const diagnosticoNotaRoutes = require('./routes/api/diagnosticoNota');
const metricsRoutes = require('./routes/api/metrics');
const dashboardFastRoutes = require('./routes/api/dashboard-fast');
const publicAlunoRoutes = require('./routes/api/publicAluno');
const instituicoesRoutes = require('./routes/api/instituicoes');
const authRoutes = require('./routes/authRoutes');
const alertasRoutes = require('./routes/api/alunos-alertas');
const aphEstatisticasRoutes = require('./routes/api/aph-estatisticas');
const aphPdfRoutes = require('./routes/api/aph-pdf');
const telegramBotRoutes = require('./routes/api/telegramBot');
const comunicacaoPaisRoutes = require('./routes/api/comunicacaoPais');
const comunicacaoAutoRoutes = require('./routes/api/comunicacao');

// 🔹 CRUD do APH (faltava montar)
const aphCrudRoutes = require('./routes/api/aph');

/* =========================
   ESTÁTICOS
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
const { autenticar } = require('./middleware/autenticacao');
app.use('/auth', authRoutes);

// HTML protegidos
app.get('/ficha-aluno.html', autenticar, (_req, res) =>
  res.sendFile(path.join(publicRoot, 'ficha-aluno.html'))
);
app.get('/lista-alunos.html', autenticar, (_req, res) =>
  res.sendFile(path.join(publicRoot, 'lista-alunos.html'))
);

/* =========================
   APIs
   ========================= */
app.use('/api/ficha', autenticar, fichaApiRoutes);
app.use('/api/fichaAluno', autenticar, fichaAlunoRoutes); // 🔹 Nova rota
app.use('/ficha', autenticar, fichaViewRoutes);
app.use('/api', fichaTesteRoute);

app.use('/api/alunos', alunoRoutes);
app.use('/api/notificacoes', notificacoesApiRoutes);
app.use('/api', pdfRoutes);
app.use('/api', fichaPdfRoutes);
app.use('/notificacoes', notificacoesViewRoutes);
app.use('/api/responsavel', responsavelRoutes);
app.use('/api/motivos', motivosRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/cartoes-professores', cartoesProfessoresRoute);
app.use('/api/professores', professoresRoute);
app.use('/api/qrcode-professores', qrcodeProfessoresRoute);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/controle-notificacoes', controleNotificacoesRoutes);
app.use('/api', relatorioNotificacoesRoute);
app.use('/api/estatisticas', estatisticasRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/observacoes', observacoesRoutes);
app.use('/api/diagnostico', diagnosticoNotaRoutes);
app.use('/api/dashboard-fast', autenticar, dashboardFastRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api', publicAlunoRoutes);
app.use('/api/instituicoes', instituicoesRoutes);
app.use('/api/alertas', alertasRoutes);

// 🔹 Montagem correta do APH (CRUD + estatísticas + pdf)
app.use('/api/aph', autenticar, aphCrudRoutes); // <— CRUD do APH agora ativo
app.use('/api/aph', aphEstatisticasRoutes);
app.use('/api/aph', aphPdfRoutes);

app.use('/api/telegram', telegramBotRoutes);
app.use('/api/comunicacao', comunicacaoPaisRoutes);
app.use('/api/comunicacao', comunicacaoAutoRoutes);

/* =========================
   STATUS / DIAGNÓSTICO
   ========================= */
app.get('/__version', (_req, res) => {
  res.json({ commit: process.env.RENDER_GIT_COMMIT || 'desconhecido', builtAt: new Date().toISOString() });
});
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use((req, res, next) => {
  if (req.method === 'GET') {
    const notFound = path.join(__dirname, 'public', '404.html');
    if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
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
const URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor ligado em: http://localhost:${PORT}`);
  console.log('🧪 Health pronto: /__version e /healthz');
  console.log('✉️  SMTP: /debug/mail/verify e /debug/mail/status');
  console.log('🌍 CORS flexível ativo (Render + localhost + *.onrender.com)');
  (async () => { try { await verifyAll(); } catch {} })();
});

async function connectMongo() {
  if (!/^mongodb(\+srv)?:\/\//i.test(URI)) {
    console.error('❌ URI do Mongo inválida/ausente.');
    return;
  }

  const masked = URI.replace(/\/\/.*?@/, '//***@');
  console.log('🔐 Conectando no Mongo:', masked);

  try {
    await mongoose.connect(URI, {
      // Opções compatíveis com driver 6.x / Mongoose 8
      serverSelectionTimeoutMS: Number(process.env.DB_SERVER_SEL_MS || 60000),
      socketTimeoutMS:          Number(process.env.DB_SOCKET_MS || 60000),
      heartbeatFrequencyMS:     10000,
      maxPoolSize:              Number(process.env.DB_MAX_POOL || 20),
      minPoolSize:              Number(process.env.DB_MIN_POOL || 0),
      retryWrites:              true,
      family:                   4, // força IPv4 (bom em Windows/DNS IPv6)
      // ⚠️ keepAlive/keepAliveInitialDelay REMOVIDOS — não suportados no driver v6
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
