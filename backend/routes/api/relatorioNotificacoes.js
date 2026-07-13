const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const PDFDocument = require('pdfkit');
const { autenticar } = require('../../middleware/autenticacao');

router.get('/relatorio/notificacoes', autenticar, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notificacoes = await Notificacao.find({ instituicao }).populate('aluno');

    // Contador por tipo de medida
    const porTipo = {};
    const porTurma = {};

    notificacoes.forEach(n => {
      porTipo[n.tipoMedida] = (porTipo[n.tipoMedida] || 0) + 1;
      if (n.aluno && n.aluno.turma) {
        porTurma[n.aluno.turma] = (porTurma[n.aluno.turma] || 0) + 1;
      }
    });

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio-notificacoes.pdf');
    doc.pipe(res);

    doc.fontSize(16).text('Colégio Militar Dom Pedro II', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('Relatório Geral de Notificações', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Data: ${new Date().toLocaleDateString('pt-BR')}`);
    doc.text(`Total de Notificações: ${notificacoes.length}`);
    doc.moveDown();

    doc.fontSize(12).text('Por Tipo de Medida:', { underline: true });
    Object.entries(porTipo).forEach(([tipo, count]) => {
      doc.text(`- ${tipo}: ${count}`);
    });
    doc.moveDown();

    doc.fontSize(12).text('Por Turma:', { underline: true });
    Object.entries(porTurma).forEach(([turma, count]) => {
      doc.text(`- ${turma}: ${count}`);
    });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar relatório PDF:', err);
    res.status(500).json({ mensagem: 'Erro ao gerar relatório PDF' });
  }
});

module.exports = router;
