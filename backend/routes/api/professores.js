// backend/routes/api/professores.js
const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const { autenticar } = require('../../middleware/autenticacao');
const qrcode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// POST /api/professores/qrcode
router.post('/qrcode', autenticar, async (req, res) => {
  try {
    const { identificador } = req.body;
    if (!identificador || identificador.trim() === '') {
      return res.status(400).json({ mensagem: 'Informe nome ou e-mail do professor.' });
    }

    const professor = await Usuario.findOne({
      $or: [
        { email: identificador.trim() },
        { nome: { $regex: new RegExp(identificador.trim(), 'i') } }
      ],
      tipo: 'professor'
    });

    if (!professor) {
      return res.status(404).json({ mensagem: 'Professor não encontrado.' });
    }

    // Se ainda não tiver tokenAcessoProfessor, gerar agora
    if (!professor.tokenAcessoProfessor) {
      professor.tokenAcessoProfessor = crypto.randomBytes(16).toString('hex');
      await professor.save();
    }

    const url = `${process.env.BASE_URL}/lista-alunos.html?token=${professor.tokenAcessoProfessor}`;
    const qrCodeDataUrl = await qrcode.toDataURL(url);

    res.json({ url, qrCode: qrCodeDataUrl });
  } catch (erro) {
    console.error('Erro ao gerar QR Code do professor:', erro);
    res.status(500).json({ mensagem: 'Erro ao gerar QR Code.' });
  }
});

// POST /api/professores - Cadastra novo professor
router.post('/', autenticar, async (req, res) => {
  try {
    const { nome, email, senha, instituicao } = req.body;

    if (!nome || !email || !senha || !instituicao) {
      return res.status(400).json({ mensagem: 'Todos os campos são obrigatórios.' });
    }

    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ mensagem: 'Já existe um usuário com este e-mail.' });
    }

    const hashed = await bcrypt.hash(senha, 10);

    const tokenAcessoProfessor = crypto.randomBytes(16).toString('hex');

    const novo = new Usuario({
      nome,
      email,
      senha: hashed,
      instituicao,
      tipo: 'professor',
      tokenAcessoProfessor
    });

    await novo.save();

    res.status(201).json({ mensagem: 'Professor cadastrado com sucesso.' });
  } catch (erro) {
    console.error('Erro ao cadastrar professor:', erro);
    res.status(500).json({ mensagem: 'Erro ao cadastrar professor.' });
  }
});

module.exports = router;
