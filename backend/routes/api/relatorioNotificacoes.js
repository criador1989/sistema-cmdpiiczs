const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const PDFDocument = require('pdfkit');

router.get('/relatorio-notificacoes', async (req, res) => {
  try {
    const notificacoes = await Notificacao.find({ instituicao: req.usuario.instituicao })
      .populate('aluno')
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-notificacoes.pdf"');
    doc.pipe(res);

    doc.fontSize(20).text('Relatório de Notificações Disciplinares', { align: 'center' });
    doc.moveDown();

    notificacoes.forEach((notificacao, index) => {
      const aluno = notificacao.aluno || {};
      doc.fontSize(12).fillColor('black');
      doc.text(`Aluno: ${aluno.nome || 'Desconhecido'} (${aluno.turma || '-'})`);
      doc.text(`Data: ${new Date(notificacao.createdAt).toLocaleDateString('pt-BR')}`);
      doc.text(`Tipo: ${notificacao.tipoMedida || '-'}`);
      doc.text(`Motivo: ${notificacao.motivo || '-'}`);
      doc.text(`Valor: ${notificacao.valorNumerico?.toFixed(2) || '-'}`);
      doc.text(`Comportamento Anterior: ${notificacao.notaAnterior?.toFixed(2) || '8.00'}`);
      doc.text(`Comportamento Atual: ${notificacao.notaAtual?.toFixed(2) || '-'}`);
      doc.moveDown(1);
      if (index < notificacoes.length - 1) doc.moveDown(0.5).lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);
    });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    res.status(500).json({ erro: 'Erro ao gerar relatório.' });
  }
});

module.exports = router;
