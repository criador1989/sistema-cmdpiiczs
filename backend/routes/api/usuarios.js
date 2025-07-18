const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'segredo_padrao';

// Middleware interno para restringir acesso apenas a administradores
function verificarAdmin(req, res, next) {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem acessar esta funcionalidade.' });
  }
  next();
}

// POST /api/usuarios - Cria um novo usuário (restrito a admins)
router.post('/', autenticar, verificarAdmin, async (req, res) => {
  const { nome, email, senha, tipo, instituicao } = req.body;

  if (!nome || !email || !senha || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
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
      tipo,
      instituicao
    });

    // Gerar token de acesso automaticamente se for professor
    if (tipo === 'professor') {
      const tokenGerado = jwt.sign({ email, tipo, data: Date.now() }, SECRET);
      novoUsuario.tokenAcesso = tokenGerado;
    }

    await novoUsuario.save();

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        tipo: novoUsuario.tipo,
        instituicao: novoUsuario.instituicao,
        tokenAcesso: novoUsuario.tokenAcesso || null
      }
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao criar usuário.' });
  }
});

// GET /api/usuarios - Lista todos os usuários
router.get('/', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find().select('-senha');
    res.json(usuarios);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuários.' });
  }
});

// GET /api/usuarios/:id - Retorna um usuário específico
router.get('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-senha');
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário.' });
  }
});

// PUT /api/usuarios/:id - Atualiza os dados de um usuário
router.put('/:id', autenticar, verificarAdmin, async (req, res) => {
  const { nome, tipo, instituicao, senha } = req.body;

  if (!nome || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
  }

  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    usuario.nome = nome;
    usuario.tipo = tipo;
    usuario.instituicao = instituicao;

    if (senha && senha.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      usuario.senha = await bcrypt.hash(senha, salt);
    }

    await usuario.save();
    res.json({ mensagem: 'Usuário atualizado com sucesso.', usuario });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao atualizar usuário.' });
  }
});

// DELETE /api/usuarios/:id - Exclui um usuário pelo ID
router.delete('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndDelete(req.params.id);
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }
    res.json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao excluir usuário.' });
  }
});

// GET /api/usuarios/acesso/:token - Acesso via QR Code para professores (sem login)
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = req.params.token.trim();

    const professor = await Usuario.findOne({ tokenAcesso: token, tipo: 'professor' });
    if (!professor) {
      return res.status(404).json({ mensagem: 'Professor não encontrado ou token inválido.' });
    }

    const instituicao = professor.instituicao?.trim().toUpperCase();

    const alunos = await Aluno.find({
      instituicao: { $regex: `^${instituicao}$`, $options: 'i' }
    }).select('nome turma comportamento foto');

    console.log(`🔎 ${alunos.length} aluno(s) encontrados para ${instituicao}`);

    res.json({
      professor: professor.nome,
      instituicao: professor.instituicao,
      alunos
    });

  } catch (err) {
    console.error('Erro ao acessar com token do professor:', err);
    res.status(500).json({ mensagem: 'Erro ao acessar com token.' });
  }
});

module.exports = router;
