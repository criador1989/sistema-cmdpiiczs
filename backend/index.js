// backend/index.js
require('dotenv').config();

const metricsRoutes = require('./routes/api/metrics');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');             // thumbs/previews
const compression = require('compression'); // compressão HTTP
const diagnosticoNotaRoutes = require('./routes/api/diagnosticoNota');

// Models
const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');
const Log = require('./models/Log');

// Rotas
const alunoRoutes = require('./routes/api/alunos'); // ✅ router correto
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

const autenticarTokenProfessor = require('./middleware/tokenProfessor');

// endpoints rápidos do painel
const dashboardFastRoutes = require('./routes/api/dashboard-fast');

// 🔗 NOVO: rota “Comunicação aos Pais”
const comunicacaoPaisRoutes = require('./routes/api/comunicacaoPais');

const app = express();

// ===== Helpers uploads/public =====
const uploadRoot = path.join(__dirname, 'uploads');
const publicRoot = path.join(__dirname, 'public');

fs.mkdirSync(path.join(uploadRoot, 'alunos'), { recursive: true });
fs.mkdirSync(path.join(publicRoot, 'uploads'), { recursive: true });

// compressão
app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// estáticos
app.use('/uploads', express.static(uploadRoot));
app.use('/uploads', express.static(path.join(publicRoot, 'uploads'), {
  maxAge: '7d',
  immutable: true,
}));

const staticRoot = publicRoot;
app.use(express.static(staticRoot, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => res.redirect('/login.html'));

// ===== autenticação cookie =====
function autenticar(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = verificado;
    next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido.' });
  }
}

// ===== LOGIN / LOGOUT / CADASTRO =====
app.post('/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await Usuario.findOne({ email }).select('+senha');
    if (!usuario || !(await usuario.compararSenha(senha))) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' });
    }

    const token = jwt.sign({
      id: usuario._id,
      nome: usuario.nome,
      tipo: usuario.tipo,
      instituicao: usuario.instituicao
    }, process.env.JWT_SECRET, { expiresIn: '2h' });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000
    });

    const redirecionar = usuario.tipo === 'professor' ? '/painel-professor.html' : '/painel.html';
    res.json({ mensagem: 'Login bem-sucedido', redirecionar });
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
    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) return res.status(409).json({ mensagem: 'E-mail já cadastrado.' });

    const novoUsuario = new Usuario({
      nome, email, senha, instituicao, tipo,
      ...(tipo === 'professor' && { tokenAcessoProfessor: crypto.randomBytes(12).toString('hex') })
    });

    await novoUsuario.save();
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (erro) {
    console.error('Erro no cadastro:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao cadastrar usuário.' });
  }
});

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

// ===== HTMLs protegidos =====
app.get('/ficha-aluno.html', autenticar, (req, res) => {
  res.sendFile(path.join(staticRoot, 'ficha-aluno.html'));
});
app.get('/lista-alunos.html', autenticar, (req, res) => {
  res.sendFile(path.join(staticRoot, 'lista-alunos.html'));
});
app.get('/painel-professor.html', autenticar, (req, res) => {
  res.sendFile(path.join(staticRoot, 'painel-professor.html'));
});
// 🔐 NOVO: página do formulário “Comunicação aos Pais”
app.get('/comunicacao-pais.html', autenticar, (req, res) => {
  res.sendFile(path.join(staticRoot, 'comunicacao-pais.html'));
});

// ===== Rotas =====
app.use('/api/ficha', autenticar, fichaApiRoutes);
app.use('/ficha', autenticar, fichaViewRoutes);
app.use('/api', fichaTesteRoute);
app.use('/api/alunos', alunoRoutes); // ✅
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
app.use('/api/usuarios', acessoProfessorRoute);
app.use('/api/diagnostico', diagnosticoNotaRoutes);

// 🔗 NOVO: ligar a API de Comunicação aos Pais
app.use('/api/comunicacao', comunicacaoPaisRoutes);

// endpoints rápidos do painel
app.use('/api/dashboard-fast', autenticar, dashboardFastRoutes);
app.use('/api/metrics', metricsRoutes);

// ===== versão/saúde =====
app.get('/__version', (req, res) => {
  res.json({
    commit: process.env.RENDER_GIT_COMMIT || 'desconhecido',
    builtAt: new Date().toISOString()
  });
});

// ===== extensões p/ thumbs =====
const allowedThumbExt = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tif', '.tiff'
]);

// ===== Miniaturas (thumb 200x200) cacheadas =====
app.get('/api/imagens/thumb/:id', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.id).select('foto');
    const placeholderAbs = path.join(publicRoot, 'img', 'sem-foto.png');
    if (!aluno) return res.sendFile(placeholderAbs);

    const foto = (aluno.foto || '').trim();

    if (/^https?:\/\//i.test(foto) || /^data:image\//i.test(foto)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.redirect(foto);
    }

    function resolveOriginalPath(relOrAbs) {
      const clean = String(relOrAbs).replace(/^\/+/, '');
      const candidates = [];
      if (/^uploads\//i.test(clean)) {
        candidates.push(path.join(uploadRoot, clean.replace(/^uploads\//i, '')));
        candidates.push(path.join(publicRoot, clean));
      } else {
        candidates.push(path.join(uploadRoot, clean));
        candidates.push(path.join(publicRoot, clean));
        if (/^alunos\//i.test(clean)) candidates.push(path.join(publicRoot, 'uploads', clean));
      }
      for (const p of candidates) {
        const safe = path.normalize(p);
        if ((safe.startsWith(uploadRoot) || safe.startsWith(publicRoot)) && fs.existsSync(safe)) return safe;
      }
      return null;
    }

    function sendOriginalOrPlaceholder() {
      const rel = (aluno.foto || '').replace(/^\/+/, '');
      if (!rel) return res.sendFile(placeholderAbs);
      const url = '/' + (rel.toLowerCase().startsWith('uploads/') ? rel : 'uploads/' + rel);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.redirect(url);
    }

    const absOriginal = resolveOriginalPath(foto);
    if (!absOriginal) return res.sendFile(placeholderAbs);

    const thumbDir = path.join(publicRoot, 'uploads', 'alunos', String(aluno._id));
    const thumbPath = path.join(thumbDir, 'foto_thumb.jpg');

    if (fs.existsSync(thumbPath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.sendFile(thumbPath);
    }

    const ext = path.extname(absOriginal).toLowerCase();
    const isHeic = ['.heic', '.heif', '.heics', '.heifs'].includes(ext);
    if (isHeic || !allowedThumbExt.has(ext)) return sendOriginalOrPlaceholder();

    try {
      fs.mkdirSync(thumbDir, { recursive: true });
      await sharp(absOriginal)
        .rotate()
        .resize({ width: 200, height: 200, fit: 'cover' })
        .jpeg({ quality: 72 })
        .toFile(thumbPath);

      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.sendFile(thumbPath);
    } catch (e) {
      console.warn('Thumb fallback:', e?.message || e);
      return sendOriginalOrPlaceholder();
    }
  } catch (e) {
    console.error('Erro ao servir thumb:', e);
    const placeholderAbs = path.join(publicRoot, 'img', 'sem-foto.png');
    return res.sendFile(placeholderAbs);
  }
});

// ===== Pré-visualização (preview) com width variável e cache =====
// GET /api/imagens/preview/:id?w=640
app.get('/api/imagens/preview/:id', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.id).select('foto');
    const placeholderAbs = path.join(publicRoot, 'img', 'sem-foto.png');
    const w = Math.max(160, Math.min(parseInt(req.query.w || '640', 10) || 640, 1400));

    if (!aluno) return res.sendFile(placeholderAbs);
    const foto = (aluno.foto || '').trim();

    if (/^https?:\/\//i.test(foto) || /^data:image\//i.test(foto)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.redirect(foto);
    }

    function resolveOriginalPath(relOrAbs) {
      const clean = String(relOrAbs).replace(/^\/+/, '');
      const candidates = [];
      if (/^uploads\//i.test(clean)) {
        candidates.push(path.join(uploadRoot, clean.replace(/^uploads\//i, '')));
        candidates.push(path.join(publicRoot, clean));
      } else {
        candidates.push(path.join(uploadRoot, clean));
        candidates.push(path.join(publicRoot, clean));
        if (/^alunos\//i.test(clean)) candidates.push(path.join(publicRoot, 'uploads', clean));
      }
      for (const p of candidates) {
        const safe = path.normalize(p);
        if ((safe.startsWith(uploadRoot) || safe.startsWith(publicRoot)) && fs.existsSync(safe)) return safe;
      }
      return null;
    }

    const absOriginal = resolveOriginalPath(foto);
    if (!absOriginal) return res.sendFile(placeholderAbs);

    const prevDir = path.join(publicRoot, 'uploads', 'alunos', String(aluno._id));
    const prevPath = path.join(prevDir, `preview_w${w}.jpg`);

    if (fs.existsSync(prevPath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.sendFile(prevPath);
    }

    const ext = path.extname(absOriginal).toLowerCase();
    const isHeic = ['.heic', '.heif', '.heics', '.heifs'].includes(ext);
    if (isHeic || !allowedThumbExt.has(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      const rel = (aluno.foto || '').replace(/^\/+/, '');
      const url = '/' + (rel.toLowerCase().startsWith('uploads/') ? rel : 'uploads/' + rel);
      return res.redirect(url);
    }

    try {
      fs.mkdirSync(prevDir, { recursive: true });
      await sharp(absOriginal)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(prevPath);

      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.sendFile(prevPath);
    } catch (e) {
      console.warn('Preview fallback:', e?.message || e);
      return res.sendFile(placeholderAbs);
    }
  } catch (e) {
    console.error('Erro preview:', e);
    const placeholderAbs = path.join(publicRoot, 'img', 'sem-foto.png');
    return res.sendFile(placeholderAbs);
  }
});

// ======================= Mongo + Start =======================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!/^mongodb(\+srv)?:\/\//i.test(MONGO_URI)) {
  console.error('❌ MONGO_URI inválido ou ausente. Valor lido:', JSON.stringify(MONGO_URI));
  process.exit(1);
}
const masked = MONGO_URI.replace(/\/\/.*?@/, '//***@');
console.log('🔎 MONGO_URI lido:', masked);

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => {
    console.log('🟢 Conectado ao MongoDB');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log('🧪 Rota de teste carregada');
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await mongoose.disconnect().catch(() => {});
  console.log('\n👋 Encerrado com sucesso');
  process.exit(0);
});
