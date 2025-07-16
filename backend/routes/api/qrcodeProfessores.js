const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const QRCode = require('qrcode');

router.get('/:id', async (req, res) => {
  try {
    const professor = await Usuario.findById(req.params.id);
    if (!professor || professor.tipo !== 'professor') {
      return res.status(404).json({ mensagem: 'Professor não encontrado.' });
    }

    // Garante que o tokenAcesso existe
    if (!professor.tokenAcessoProfessor) {
      return res.status(400).json({ mensagem: 'Token de acesso não definido para este professor.' });
    }

    const link = `${process.env.BASE_URL}/lista-alunos.html?token=${professor.tokenAcessoProfessor}`;

    QRCode.toDataURL(link, { width: 300 }, (err, url) => {
      if (err) {
        console.error('Erro ao gerar QR Code:', err);
        return res.status(500).json({ mensagem: 'Erro ao gerar QR Code.' });
      }

      res.json({
        nome: professor.nome,
        link,
        qrCodeBase64: url
      });
    });

  } catch (err) {
    console.error('Erro ao buscar professor:', err);
    res.status(500).json({ mensagem: 'Erro no servidor.' });
  }
});

module.exports = router;
