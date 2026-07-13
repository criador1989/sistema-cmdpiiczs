const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Usuario = require('../../models/Usuario');

router.get('/qrcode/:id', async (req, res) => {
  try {
    const professor = await Usuario.findById(req.params.id);
    if (!professor || professor.tipo !== 'professor') {
      return res.status(404).json({ erro: 'Professor não encontrado' });
    }

    // Gera token de acesso caso não exista
    if (!professor.tokenAcessoProfessor) {
      const crypto = require('crypto');
      professor.tokenAcessoProfessor = crypto.randomBytes(10).toString('hex');
      await professor.save();
    }

    const url = `https://seusite.com/api/usuarios/acesso/${professor.tokenAcessoProfessor}`;
    const qr = await QRCode.toDataURL(url);

    // Envia a imagem PNG
    const img = Buffer.from(qr.split(',')[1], 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length
    });
    res.end(img);
  } catch (err) {
    console.error('Erro ao gerar QR Code do professor:', err);
    res.status(500).json({ erro: 'Erro ao gerar QR Code' });
  }
});

module.exports = router;
