const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'segredo_padrao';

/** Somente ADMIN */
function verificarAdmin(req, res, next) {
  if (req.usuario?.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem acessar esta funcionalidade.' });
  }
  next();
}

/* =========================================
 *  ADMIN: CRUD de usuários
 * =======================================*/

// POST /api/usuarios
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

    const novoUsuario = new Usuario({ nome, email, senha, tipo, instituicao });

    // Gera token de acesso automático se for professor
    if (tipo === 'professor') {
      const tokenGerado = jwt.sign({ email, tipo, data: Date.now() }, SECRET);
      novoUsuario.tokenAcesso = tokenGerado;
    }

    await novoUsuario.save();

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: {
        _id: novoUsuario._id,
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

// GET /api/usuarios
router.get('/', autenticar, verificarAdmin, async (_req, res) => {
  try {
    const usuarios = await Usuario.find().select('-senha');
    res.json(usuarios);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuários.' });
  }
});

// GET /api/usuarios/:id
router.get('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select('-senha');
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao buscar usuário.' });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', autenticar, verificarAdmin, async (req, res) => {
  const { nome, tipo, instituicao, senha } = req.body;
  if (!nome || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
  }

  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });

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

// DELETE /api/usuarios/:id
router.delete('/:id', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findByIdAndDelete(req.params.id);
    if (!usuario) return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    res.json({ mensagem: 'Usuário excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ mensagem: 'Erro ao excluir usuário.' });
  }
});

/* =========================================
 *  CONTATOS PARA MENSAGENS (não-admin)
 *  Lista da MESMA instituição, exclui a si mesmo.
 *  Suporta ?q=busca e ?tipo=professor|admin|...
 *  GET /api/usuarios/contatos
 * =======================================*/
router.get('/contatos', autenticar, async (req, res) => {
  try {
    const { q, tipo } = req.query;
    const where = {
      instituicao: req.usuario.instituicao,
      _id: { $ne: req.usuario.id }
    };

    if (tipo) where.tipo = tipo;

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim(), 'i');
      // busca por nome OU email
      where.$or = [{ nome: rx }, { email: rx }];
    }

    const contatos = await Usuario.find(where)
      .select('_id nome tipo email')
      .sort({ nome: 1 });

    res.json(contatos);
  } catch (err) {
    console.error('Erro ao listar contatos:', err);
    res.status(500).json({ mensagem: 'Erro ao listar contatos.' });
  }
});

/* =========================================
 *  ACESSO VIA TOKEN (QR Code do professor)
 *  Obs: mantenha apenas UM endpoint /acesso/:token
 *       no projeto (aqui OU no acessoProfessorRoute).
 * =======================================*/
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = req.params.token.trim();
    const professor = await Usuario.findOne({ tokenAcesso: token, tipo: 'professor' });
    if (!professor) {
      return res.status(404).json({ mensagem: 'Professor não encontrado ou token inválido.' });
    }

    const instituicao = professor.instituicao?.trim();
    const alunos = await Aluno.find({ instituicao })
      .select('nome turma comportamento foto');

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
