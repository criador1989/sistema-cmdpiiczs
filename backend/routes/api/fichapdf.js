const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');

// Gera PDF da ficha do aluno com base em ID ou código de acesso
router.get('/ficha/:codigoOuId', async (req, res) => {
  try {
    const valor = req.params.codigoOuId.trim().toUpperCase();
    console.log("🔍 Valor recebido:", valor);

    let aluno = null;

    // Se o valor tem 24 caracteres e é um ObjectId válido, tenta buscar pelo _id
    if (/^[0-9a-fA-F]{24}$/.test(valor)) {
      aluno = await Aluno.findById(valor);
    }

    // Se não achou por ID, tenta pelo código de acesso
    if (!aluno) {
      aluno = await Aluno.findOne({ codigoAcesso: valor });
    }

    if (!aluno) {
      console.warn("⚠️ Aluno não encontrado com valor:", valor);
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    // Busca notificações e observações
    const notificacoes = await Notificacao.find({ aluno: aluno._id }).sort({ data: -1 });
    const observacoes = await Observacao.find({ aluno: aluno._id }).sort({ criadoEm: -1 });

    // Inicia o PDF
    const doc = new PDFDocument();
    const nomeArquivo = `ficha_aluno_${aluno._id}.pdf`;
    const caminho = path.join(__dirname, '../../public/uploads/', nomeArquivo);
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    // Logo
    const logoPath = path.join(__dirname, '../../public/uploads/logo-cmdp.jpg');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { width: 100, align: 'center' });
    }

    // Título
    doc.moveDown().fontSize(20).fillColor('#d82327').text('Ficha Comportamental do Aluno', { align: 'center' });

    // Dados do aluno
    doc.moveDown().fontSize(12).fillColor('black');
    doc.text(`Nome: ${aluno.nome}`);
    doc.text(`Turma: ${aluno.turma}`);
    doc.text(`Data de Entrada: ${aluno.dataEntrada?.toLocaleDateString('pt-BR') || '—'}`);
    doc.text(`Comportamento Atual: ${aluno.comportamento?.toFixed(2) || '—'}`);
    doc.text(`Código de Acesso: ${aluno.codigoAcesso || '—'}`);

    // Observações
    doc.moveDown().fontSize(14).fillColor('#d82327').text('Observações', { underline: true });
    if (observacoes.length === 0) {
      doc.fontSize(12).fillColor('black').text('Nenhuma observação registrada.');
    } else {
      observacoes.forEach(obs => {
        doc.fontSize(12).text(`• ${obs.criadoEm.toLocaleDateString('pt-BR')} - ${obs.autor || '—'}: ${obs.texto}`);
      });
    }

    // Notificações
    doc.moveDown().fontSize(14).fillColor('#d82327').text('Notificações Disciplinares', { underline: true });
    if (notificacoes.length === 0) {
      doc.fontSize(12).fillColor('black').text('Nenhuma notificação registrada.');
    } else {
      notificacoes.forEach(n => {
        doc.fontSize(12).text(`• ${n.data.toLocaleDateString('pt-BR')} - ${n.tipoMedida}: ${n.motivo}`);
        doc.text(`  Tipo: ${n.tipo} | Valor: ${n.valorNumerico} | Dias: ${n.quantidadeDias}`);
        doc.text(`  Nota: ${n.notaAnterior?.toFixed(2) || '—'} → ${n.notaAtual?.toFixed(2) || '—'}`);
        doc.text(`  Observação: ${n.observacao || '—'}`).moveDown(0.5);
      });
    }

    doc.end();

    stream.on('finish', () => {
      res.download(caminho, nomeArquivo, err => {
        if (err) res.status(500).send('Erro ao enviar PDF');
        fs.unlinkSync(caminho); // Remove o arquivo após envio
      });
    });

  } catch (erro) {
    console.error("Erro ao gerar ficha do aluno:", erro);
    res.status(500).send('Erro ao gerar ficha do aluno');
  }
});

module.exports = router;
