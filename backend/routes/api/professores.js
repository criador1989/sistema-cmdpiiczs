// backend/routes/api/professores.js
const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const { autenticar } = require('../../middleware/autenticacao');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'segredo_padrao';

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

    const token = jwt.sign({ id: professor._id, tipo: 'professor' }, SECRET, {
      expiresIn: '30d'
    });

    const url = `${req.protocol}://${req.get('host')}/lista-alunos.html?token=${token}`;
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

    const hashed = await require('bcryptjs').hash(senha, 10);
    const novo = new Usuario({ nome, email, senha: hashed, instituicao, tipo: 'professor' });
    await novo.save();

    res.status(201).json({ mensagem: 'Professor cadastrado com sucesso.' });
  } catch (erro) {
    console.error('Erro ao cadastrar professor:', erro);
    res.status(500).json({ mensagem: 'Erro ao cadastrar professor.' });
  }
});

module.exports = router;
