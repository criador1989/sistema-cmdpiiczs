const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

dotenv.config();

const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');
const Log = require('./models/Log');

const alunoRoutes = require('./routes/alunoRoutes');
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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

function autenticar(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ mensagem: 'Acesso negado. Token ausente.' });
  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = verificado;
    next();
  } catch (err) {
    return res.status(401).json({ mensagem: 'Token inválido.' });
  }
}

// LOGIN
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
      secure: false,
      sameSite: 'Lax',
      maxAge: 2 * 60 * 60 * 1000
    });

    const redirecionar = usuario.tipo === 'professor' ? '/painel-professor.html' : '/bemvindo.html';
    res.json({ mensagem: 'Login bem-sucedido', redirecionar });
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao fazer login.' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensagem: 'Logout realizado com sucesso' });
});

// CADASTRO
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
    if (usuarioExistente) {
      return res.status(409).json({ mensagem: 'E-mail já cadastrado.' });
    }

    const novoUsuario = new Usuario({
      nome,
      email,
      senha,
      instituicao,
      tipo,
      ...(tipo === 'professor' && { tokenAcessoProfessor: crypto.randomBytes(12).toString('hex') })
    });

    await novoUsuario.save();
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (erro) {
    console.error('Erro no cadastro:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao cadastrar usuário.' });
  }
});

app.get('/api/usuario-logado', autenticar, (req, res) => {
  res.json(req.usuario);
});

app.get('/api/usuario', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('nome tipo instituicao');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao buscar usuário' });
  }
});

// HTMLs protegidos
app.get('/ficha-aluno.html', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ficha-aluno.html'));
});
app.get('/painel-professor.html', autenticar, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel-professor.html'));
});
app.get('/lista-alunos.html', autenticarTokenProfessor, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lista-alunos.html'));
});

// Rotas protegidas ou públicas
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
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/controle-notificacoes', controleNotificacoesRoutes);
app.use('/api', relatorioNotificacoesRoute);
app.use('/api/estatisticas', estatisticasRoutes);
app.use('/api/mensagens', mensagensRoutes);
app.use('/api/observacoes', observacoesRoutes);
app.use('/api/usuarios', acessoProfessorRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('🧪 Rota de teste carregada');
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
