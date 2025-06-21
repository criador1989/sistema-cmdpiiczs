const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const autenticar = require('../../middleware/autenticacao');
const bcrypt = require('bcryptjs');

// Middleware interno para restringir acesso apenas a administradores
function verificarAdmin(req, res, next) {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ mensagem: 'Apenas administradores podem acessar esta funcionalidade.' });
  }
  next();
}

// GET /api/usuarios - Lista todos os usuários
router.get('/', autenticar, verificarAdmin, async (req, res) => {
  try {
    const usuarios = await Usuario.find().select('-senha'); // Exclui a senha
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
  const { nome, email, tipo, instituicao, senha } = req.body;

  if (!nome || !email || !tipo || !instituicao) {
    return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
  }

  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
    }

    usuario.nome = nome;
    usuario.email = email;
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

module.exports = router;
