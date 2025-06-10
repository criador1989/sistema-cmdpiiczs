
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');

const notificacoesRoutes = require('./routes/api/notificacoes');
const pdfRoutes = require('./routes/api/pdf');

dotenv.config();

console.log('🔍 URI carregada:', process.env.MONGO_URI ? '✅ OK' : '❌ FALTA');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 Conectado ao MongoDB'))
  .catch(err => {
    console.error('❌ Erro ao conectar no MongoDB:');
    console.error(err.message);
  });

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
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

app.post('/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await Usuario.findOne({ email });
    if (!usuario || !(await usuario.compararSenha(senha))) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' });
    }
    const token = jwt.sign(
      { id: usuario._id, nome: usuario.nome, tipo: usuario.tipo },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      maxAge: 2 * 60 * 60 * 1000
    });
    res.json({ mensagem: 'Login bem-sucedido' });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro no servidor ao fazer login.' });
  }
});

app.post('/auth/cadastrar', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha todos os campos obrigatórios.' });
  }
  try {
    const existente = await Usuario.findOne({ email });
    if (existente) return res.status(409).json({ mensagem: 'E-mail já está cadastrado.' });
    const novoUsuario = new Usuario({ nome, email, senha });
    await novoUsuario.save();
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso.' });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro ao cadastrar usuário.' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensagem: 'Logout realizado com sucesso' });
});

app.get('/api/usuario', autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('nome tipo');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário' });
  }
});

app.get('/api/alunos', autenticar, async (req, res) => {
  const alunos = await Aluno.find();
  res.json(alunos);
});

app.post('/api/alunos', autenticar, async (req, res) => {
  const { nome, turma } = req.body;
  const novoAluno = new Aluno({ nome, turma });
  await novoAluno.save();
  res.json(novoAluno);
});

app.use('/api/notificacoes', autenticar, notificacoesRoutes);
app.use('/api', pdfRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🔵 Servidor rodando em http://localhost:${PORT}`);
});
