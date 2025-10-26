require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');

const app = express();

// ====== DIAGNÓSTICO / SEGURANÇA BÁSICA ======
console.log('NODE_ENV =', process.env.NODE_ENV || '(não definido)');
app.set('trust proxy', 1);

// evita cache geral em dev
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ====== CORS (antes das rotas)
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token'],
}));

// ====== PARSERS ======
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ====== MODELS ======
try { require('./models/Aluno'); } catch {}
try { require('./models/Notificacao'); } catch {}
try { require('./models/Usuario'); } catch {}
try { require('./models/Log'); } catch {}
try { require('./models/Instituicao'); } catch {}

// ====== ROTAS ======
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
const comunicacaoPaisRoutes = require('./routes/api/comunicacaoPais');
const publicAlunoRoutes = require('./routes/api/publicAluno');
const instituicoesRoutes = require('./routes/api/instituicoes');
const authRoutes = require('./routes/authRoutes');
const alertasRoutes = require('./routes/api/alunos-alertas');
const aphEstatisticasRoutes = require('./routes/api/aph-estatisticas');
const aphPdfRoutes = require('./routes/api/aph-pdf');

// ====== CONFIG SERVIDOR ======
const uploadRoot = path.join(__dirname, 'uploads');
const publicRoot = path.join(__dirname, 'public');
fs.mkdirSync(path.join(uploadRoot, 'alunos'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, 'uploads'), { recursive: true });

// ====== ESTÁTICOS ======
app.use('/uploads', express.static(uploadRoot));
app.use('/uploads', express.static(path.join(publicRoot, 'uploads'), { maxAge: '7d', immutable: true }));
app.use(express.static(publicRoot, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.get('/', (req, res) => res.redirect('/login.html'));

// ====== AUTH (router dedicado)
app.use('/auth', authRoutes);

// ====== HTMLs protegidos ======
const { autenticar } = require('./middleware/autenticacao');
app.get('/ficha-aluno.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'ficha-aluno.html'))
);
app.get('/lista-alunos.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'lista-alunos.html'))
);
app.get('/painel-professor.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'painel-professor.html'))
);
app.get('/comunicacao-pais.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'comunicacao-pais.html'))
);
app.get('/logs.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'logs.html'))
);
app.get('/estatisticas.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'estatisticas.html'))
);

// ✅ APH: páginas HTML protegidas
app.get('/aph-atendimentos.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'aph-atendimentos.html'))
);
app.get('/aph-atendimento.html', autenticar, (req, res) =>
  res.sendFile(path.join(publicRoot, 'aph-atendimento.html'))
);

// ====== APIs ======
app.use('/api/ficha', autenticar, fichaApiRoutes);
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
app.use('/api/qrcode-professor', qrcodeProfessoresRoute);
app.use('/api/qrcode-professores', qrcodeProfessoresRoute);
app.use('/api/professores/qrcode', qrcodeProfessoresRoute);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/controle-notificacoes', controleNotificacoesRoutes);
app.use('/api', relatorioNotificacoesRoute);
app.use('/api/estatisticas', estatisticasRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/observacoes', observacoesRoutes);
app.use('/api/usuarios', acessoProfessorRoute); // (se não for intencional, considere mover p/ /api/acesso-professor)
app.use('/api/diagnostico', diagnosticoNotaRoutes);
app.use('/api/comunicacao', comunicacaoPaisRoutes);
app.use('/api/dashboard-fast', autenticar, dashboardFastRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/notificacoes', require('./routes/api/notificacoes.metrics'));
app.use('/api', publicAlunoRoutes);
app.use('/api/instituicoes', instituicoesRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/aph', aphEstatisticasRoutes);
app.use('/api/aph', aphPdfRoutes);

// ✅ APH: API opcional (não quebra caso o arquivo não exista)
try {
  const aphRoutes = require('./routes/api/aph'); // crie em routes/api/aph.js se ainda não tiver
  app.use('/api/aph', autenticar, aphRoutes);
  console.log('API APH ligada em /api/aph');
} catch (e) {
  console.warn('API APH não encontrada (routes/api/aph.js). Prosseguindo sem ela.');
}

// ====== STATUS ======
app.get('/__version', (req, res) => {
  res.json({ commit: process.env.RENDER_GIT_COMMIT || 'desconhecido', builtAt: new Date().toISOString() });
});
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ====== DEBUG DE COOKIES ======
app.get('/debug/set-cookie', (req, res) => {
  res.cookie('debug_plain', 'ok', { path: '/' });
  res.cookie('debug_http', 'ok', { httpOnly: true, path: '/' });
  res.json({ ok: true, msg: 'cookies enviados' });
});
app.get('/debug/show-cookie', (req, res) => {
  res.json({ cookiesRecebidos: req.headers.cookie || '(nenhum)' });
});

// ====== CONEXÃO MONGO + START SERVER ======
const URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

(async () => {
  try {
    if (!/^mongodb(\+srv)?:\/\//i.test(URI)) {
      console.error('❌ URI do Mongo inválida/ausente.', {
        MONGODB_URI: process.env.MONGODB_URI,
        MONGO_URI: process.env.MONGO_URI
      });
      process.exit(1);
    }
    const masked = URI.replace(/\/\/.*?@/, '//***@');
    console.log('🔐 Conectando no Mongo:', masked);

    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      maxPoolSize: 10,
      family: 4,
    });
    console.log('🟢 Conectado ao MongoDB');

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor ligado em: http://localhost:${PORT}`);
      console.log('🧪 Health pronto: /__version e /healthz');
      console.log('🌍 CORS origin:', CLIENT_URL);
    });
  } catch (err) {
    console.error('❌ Falha ao conectar no Mongo:', err?.message || err);
    process.exit(1);
  }
})();

// Encerramento gracioso
process.on('SIGINT', async () => {
  try { await mongoose.disconnect(); } catch {}
  console.log('\n👋 Encerrado com sucesso');
  process.exit(0);
});
