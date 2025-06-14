const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Modelos
const Aluno = require('./models/Aluno');
const Notificacao = require('./models/Notificacao');
const Usuario = require('./models/Usuario');

// Rotas
const alunoRoutes = require('./routes/alunoRoutes');
const notificacoesApiRoutes = require('./routes/api/notificacoes');
const notificacoesViewRoutes = require('./routes/views/notificacoes');
const responsavelRoutes = require('./routes/api/responsavel');
const fichaResponsavelRoute = require('./routes/api/fichaResponsavel'); // ✅ pública
const pdfRoutes = require('./routes/api/pdf');
const fichaPdfRoutes = require('./routes/api/fichapdf');
const fichaAlunoRoutes = require('./routes/views/fichaAluno');
const motivosRoutes = require('./routes/api/motivos');

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

// ✅ ROTA DE CADASTRO DE USUÁRIO
app.post('/auth/cadastrar', async (req, res) => {
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

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ mensagem: 'Logout realizado com sucesso' });
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

app.get('/api/pdf/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findById(req.params.id).populate('aluno');
    if (!notificacao) return res.status(404).send('Notificação não encontrada');

    const aluno = notificacao.aluno;
    const notaAnterior = notificacao.notaAnterior || 8.00;
    const notaAtual = notificacao.notaAtual || 7.70;

    const dados = {
      numero: notificacao._id.toString().slice(-6).toUpperCase(),
      aluno: aluno.nome || '',
      turma: aluno.turma || '',
      artigo: notificacao.artigo || 'Art. 54',
      paragrafo: notificacao.paragrafo || '',
      inciso: notificacao.inciso || '',
      classificacaoRegulamento: notificacao.classificacaoRegulamento || '',
      tipoMedida: notificacao.tipoMedida || '',
      observacao: notificacao.observacao || '',
      Valor: notificacao.valorNumerico?.toFixed(2) || '',
      comportamento: getClassificacao(notaAtual),
      notaAnterior: notaAnterior.toFixed(2),
      notaAtual: notaAtual.toFixed(2),
      dataHora: new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    };

    console.log("🔍 Dados enviados ao Python:", dados);

    const scriptPath = path.join(__dirname, 'pdf', 'generate_notification_docx.py');
    const python = spawn('python', [scriptPath], { shell: true });

    let pdfPath = '';

    python.stdout.on('data', (data) => {
      pdfPath = data.toString().trim();
    });

    python.stderr.on('data', (data) => {
      console.error(`Erro Python: ${data}`);
    });

    python.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(pdfPath)) {
        return res.status(500).send('Erro ao gerar PDF');
      }
      res.download(pdfPath, 'notificacao.docx');
    });

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar PDF');
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

app.use('/api/responsavel/ficha', fichaResponsavelRoute); // ✅ pública e funcional

// Rotas protegidas e públicas
app.use('/api/alunos', autenticar, alunoRoutes);
app.use('/api/notificacoes', autenticar, notificacoesApiRoutes);
app.use('/api', autenticar, pdfRoutes);
app.use('/api', autenticar, fichaPdfRoutes);
app.use('/notificacoes', autenticar, notificacoesViewRoutes);
app.use('/ficha', autenticar, fichaAlunoRoutes);

app.use('/api/responsavel', autenticar, responsavelRoutes); // 🔒 protegida

app.use('/api/motivos', motivosRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
