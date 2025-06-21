const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');
const Log = require('./models/Log'); // ✅ modelo de logs

// Rotas
const alunoRoutes = require('./routes/alunoRoutes');
const notificacoesApiRoutes = require('./routes/api/notificacoes');
const notificacoesViewRoutes = require('./routes/views/notificacoes');
const responsavelRoutes = require('./routes/api/responsavel');
const fichaResponsavelRoute = require('./routes/api/fichaResponsavel');
const fichaTesteRoute = require('./routes/api/fichaTeste');
const cartoesRoutes = require('./routes/api/cartoes');
const pdfRoutes = require('./routes/api/pdf');
const fichaPdfRoutes = require('./routes/api/fichapdf');
const fichaAlunoRoutes = require('./routes/views/fichaAluno');
const motivosRoutes = require('./routes/api/motivos');
const controleNotificacoesRoutes = require('./routes/api/controleNotificacoes');
const usuariosRoutes = require('./routes/api/usuarios');
const logsRoutes = require('./routes/api/logs');
const relatorioNotificacoesRoute = require('./routes/api/relatorioNotificacoes');
const estatisticasRoutes = require('./routes/api/estatisticas'); // ✅ NOVO

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Login
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

    res.json({ mensagem: 'Login bem-sucedido', redirecionar: '/bemvindo.html' });
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao fazer login.' });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensagem: 'Logout realizado com sucesso' });
});

// Cadastro de novo usuário
app.post('/auth/cadastrar', autenticar, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem criar usuários.' });
  }

  const { nome, email, senha, instituicao } = req.body;
  if (!nome || !email || !senha || !instituicao) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos.' });
  }

  try {
    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) {
      return res.status(409).json({ mensagem: 'E-mail já cadastrado.' });
    }

    const novoUsuario = new Usuario({ nome, email, senha, instituicao });
    await novoUsuario.save();
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (erro) {
    console.error('Erro no cadastro:', erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao cadastrar usuário.' });
  }
});

// Ver usuário logado
app.get('/api/usuario-logado', autenticar, (req, res) => {
  res.json(req.usuario);
});

// Obter dados completos do usuário
app.get('/api/usuario', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('nome tipo instituicao');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao buscar usuário' });
  }
});

function getClassificacao(nota) {
  nota = parseFloat(nota);
  if (nota >= 9.01) return 'Excepcional';
  if (nota >= 8.01) return 'Ótimo';
  if (nota >= 7.00) return 'Bom';
  if (nota >= 5.00) return 'Regular';
  if (nota >= 3.00) return 'Insuficiente';
  return 'Incompatível';
}

// ROTAS PÚBLICAS
app.use('/api/ficha', fichaResponsavelRoute);
app.use('/api', fichaTesteRoute);

// ROTAS PROTEGIDAS
app.use('/api/alunos', autenticar, alunoRoutes);
app.use('/api/notificacoes', autenticar, notificacoesApiRoutes);
app.use('/api', autenticar, pdfRoutes);
app.use('/api', autenticar, fichaPdfRoutes);
app.use('/notificacoes', autenticar, notificacoesViewRoutes);
app.use('/ficha', autenticar, fichaAlunoRoutes);
app.use('/api/responsavel', autenticar, responsavelRoutes);
app.use('/api/motivos', motivosRoutes);
app.use('/api/cartoes', autenticar, cartoesRoutes);
app.use('/api/controle-notificacoes', autenticar, controleNotificacoesRoutes);
app.use('/api/usuarios', autenticar, usuariosRoutes);
app.use('/api/logs', autenticar, logsRoutes);
app.use('/api', autenticar, relatorioNotificacoesRoute);
app.use('/api/estatisticas', autenticar, estatisticasRoutes); // ✅ rota adicionada

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
