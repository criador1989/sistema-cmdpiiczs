const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Gera cartão com QR Code para um professor
router.get('/:id', async (req, res) => {
  try {
    const professor = await Usuario.findById(req.params.id);

    if (!professor || professor.tipo !== 'professor') {
      return res.status(404).json({ erro: 'Professor não encontrado.' });
    }

    // Se não houver token, gera um automaticamente
    if (!professor.tokenAcessoProfessor) {
      professor.tokenAcessoProfessor = gerarTokenUnico();
      await professor.save();
    }

    const url = `https://SEU_DOMINIO/lista-alunos.html?token=${professor.tokenAcessoProfessor}`;
    const qrImage = await QRCode.toDataURL(url);

    const canvas = createCanvas(400, 250);
    const ctx = canvas.getContext('2d');

    // Fundo branco
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nome do colégio
    ctx.fillStyle = '#941a1d';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('COLÉGIO MILITAR DOM PEDRO II', 20, 40);

    // Nome do professor
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    ctx.fillText(`Professor: ${professor.nome}`, 20, 80);

    // Instituição
    ctx.fillText(`Instituição: ${professor.instituicao}`, 20, 110);

    // QR Code
    const qr = await loadImage(qrImage);
    ctx.drawImage(qr, 240, 50, 130, 130);

    // Salva como imagem temporária
    const imgPath = path.join(__dirname, `../../temp/cartao_${professor._id}.png`);
    const out = fs.createWriteStream(imgPath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);

    out.on('finish', () => {
      res.download(imgPath, `cartao_${professor.nome}.png`, () => {
        fs.unlinkSync(imgPath); // Remove após envio
      });
    });
  } catch (erro) {
    console.error('Erro ao gerar cartão do professor:', erro);
    res.status(500).json({ erro: 'Erro ao gerar cartão do professor.' });
  }
});

// Função simples para gerar token
function gerarTokenUnico() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

module.exports = router;
