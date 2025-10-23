// backend/index.js
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const crypto = require('crypto');
const compression = require('compression');

// Models
const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');
const Log = require('./models/Log');
// (opcional, mas útil para garantir o registro do model)
try { require('./models/Instituicao'); } catch {}

// Rotas
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

// ✅ nova rota de instituições
const instituicoesRoutes = require('./routes/api/instituicoes');

// Middlewares
const { autenticar } = require('./middleware/autenticacao'); // usa o middleware revisado
const autenticarTokenProfessor = require('./middleware/tokenProfessor');

const app = express();

// ====== CONFIGURAÇÕES ======
const uploadRoot = path.join(__dirname, 'uploads');
const publicRoot = path.join(__dirname, 'public');
fs.mkdirSync(path.join(uploadRoot, 'alunos'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, 'uploads'), { recursive: true });

// Middlewares globais
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ====== ARQUIVOS ESTÁTICOS ======
app.use('/uploads', express.static(uploadRoot));
app.use('/uploads', express.static(path.join(publicRoot, 'uploads'), { maxAge: '7d', immutable: true }));
app.use(express.static(publicRoot, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => res.redirect('/login.html'));

// ====== LOGIN / LOGOUT / CADASTRO ======
// (mantemos aqui para compatibilidade; agora o middleware autenticar é importado)

app.post('/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const emailNorm = String(email || '').trim().toLowerCase();

    // 🔧 AJUSTE: tolera usuários legados sem campo "ativo"
    const usuario = await Usuario.findOne({
      email: emailNorm,
      $or: [{ ativo: true }, { ativo: { $exists: false } }],
    }).select('+senha');

    if (!usuario) {
      return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const senhaOk = await usuario.compararSenha(senha);
    if (!senhaOk) {
      return res.status(401).json({ mensagem: 'Senha incorreta.' });
    }

    // ✅ mantém instituicao como ObjectId (NÃO converter para string)
    const payload = {
      id: String(usuario._id),
      nome: usuario.nome,
      tipo: usuario.tipo,
      instituicao: usuario.instituicao, // <= ajuste importante
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000
    });

    const redirecionar = usuario.tipo === 'professor' ? '/painel-professor.html' : '/painel.html';
    res.json({ mensagem: 'Login bem-sucedido', redirecionar, token, usuario: payload });
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao fazer login.' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ mensagem: 'Logout realizado com sucesso' });
});

app.post('/auth/cadastrar', autenticar, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar usuários.' });
  }
  const { nome, email, senha, instituicao, tipo = 'professor' } = req.body;
  if (!nome || !email || !senha || !instituicao) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos.' });
  }
  try {
    const emailNorm = String(email).trim().toLowerCase();
    const existente = await Usuario.findOne({ email: emailNorm, instituicao });
    if (existente) return res.status(409).json({ mensagem: 'E-mail já cadastrado nesta instituição.' });

    // O model já aplica hash no pre('save')
    const novoUsuario = new Usuario({
      nome,
      email: emailNorm,
      senha,
      tipo,
      instituicao,
      // NÃO crie "tokenAcessoProfessor" aqui; o model usa "tokenAcesso" e gera sozinho se tipo === 'professor'
    });

    await novoUsuario.save();
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (erro) {
    console.error('Erro no cadastro:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao cadastrar usuário.' });
  }
});

// ====== ROTAS DE USUÁRIO ======
app.get('/api/usuario-logado', autenticar, (req, res) => res.json(req.usuario));
app.get('/api/usuario', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('nome tipo instituicao');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    res.json(usuario);
  } catch {
    res.status(500).json({ mensagem: 'Erro ao buscar usuário' });
  }
});

// ====== HTMLs PROTEGIDOS ======
app.get('/ficha-aluno.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'ficha-aluno.html'));
});
app.get('/lista-alunos.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'lista-alunos.html'));
});
app.get('/painel-professor.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'painel-professor.html'));
});
app.get('/comunicacao-pais.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'comunicacao-pais.html'));
});
app.get('/logs.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'logs.html'));
});
// ====== HTMLs PROTEGIDOS ======
app.get('/estatisticas.html', autenticar, (req, res) => {
  res.sendFile(path.join(publicRoot, 'estatisticas.html'));
});


// ====== ROTAS API ======
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
// ⚠️ Cuidado: você já usa '/api/usuarios' acima; este "acessoProfessorRoute" aponta ao mesmo prefixo.
// Se for intencional, beleza; se não, considere mudar para '/api/acesso-professor'.
app.use('/api/usuarios', acessoProfessorRoute);
app.use('/api/diagnostico', diagnosticoNotaRoutes);
app.use('/api/comunicacao', comunicacaoPaisRoutes);
app.use('/api/dashboard-fast', autenticar, dashboardFastRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/notificacoes', require('./routes/api/notificacoes.metrics'));
// ✅ nova rota pública para QR Code dos pais
app.use('/api', publicAlunoRoutes);

// ✅ nova rota de instituições (admin)
app.use('/api/instituicoes', instituicoesRoutes);

// ====== STATUS E SAÚDE ======
app.get('/__version', (req, res) => {
  res.json({ commit: process.env.RENDER_GIT_COMMIT || 'desconhecido', builtAt: new Date().toISOString() });
});
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ====== CONEXÃO MONGO E SERVIDOR ======
const MONGO_URI = process.env.MONGO_URI || '';
if (!/^mongodb(\+srv)?:\/\//i.test(MONGO_URI)) {
  console.error('❌ MONGO_URI inválido ou ausente. Valor lido:', JSON.stringify(MONGO_URI));
} else {
  const masked = MONGO_URI.replace(/\/\/.*?@/, '//***@');
  console.log('🔎 MONGO_URI lido:', masked);
}

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor ligado em: http://localhost:${PORT}`);
  console.log('🧪 Health pronto: /__version e /healthz');
});

// ====== CONEXÃO COM RETENTATIVAS ======
async function conectarMongoComRetry(tentativa = 1) {
  const maxTentativas = 10;
  const atraso = Math.min(30000, Math.floor(1000 * Math.pow(1.6, tentativa)));
  if (!/^mongodb(\+srv)?:\/\//i.test(MONGO_URI)) {
    console.error('⛔ Mongo URI inválido. Pulei conexão.');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 7000, socketTimeoutMS: 20000 });
    console.log('🟢 Conectado ao MongoDB');
  } catch (err) {
    console.error(`🔴 Falha Mongo (tentativa ${tentativa}/${maxTentativas}):`, err?.message || err);
    if (tentativa < maxTentativas) {
      console.log(`⏳ Retentando em ${Math.round(atraso / 1000)}s...`);
      setTimeout(() => conectarMongoComRetry(tentativa + 1), atraso);
    }
  }
}
conectarMongoComRetry();

process.on('SIGINT', async () => {
  try { await mongoose.disconnect(); } catch {}
  server?.close?.(() => {
    console.log('\n👋 Encerrado com sucesso');
    process.exit(0);
  });
});
