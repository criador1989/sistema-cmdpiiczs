'use strict';

const PDFDocument = require('pdfkit');

function formatDate(value) {
  if (!value) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Rio_Branco',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function addFooter(doc, codigo, pagina, totalPaginas) {
  const bottom = doc.page.height - 42;
  doc.fontSize(8).fillColor('#536273')
    .text(`Axoriin • Comprovante ${codigo} • Página ${pagina} de ${totalPaginas}`, 50, bottom, {
      width: doc.page.width - 100,
      align: 'center',
      lineBreak: false,
    });
}

function gerarComprovanteTermoProfessor(res, { aceite, professor, instituicao, integridadeValida = null }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 52, bottom: 60, left: 58, right: 58 },
    bufferPages: true,
    info: {
      Title: `Comprovante de aceite - ${aceite.comprovanteCodigo}`,
      Author: 'Axoriin',
      Subject: 'Termo de Compromisso do Professor',
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="termo-professor-${aceite.comprovanteCodigo}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18)
    .text('COMPROVANTE DE ACEITE ELETRÔNICO', { align: 'center' });
  doc.moveDown(0.25).fontSize(14).text('Termo de Compromisso do Professor', { align: 'center' });
  doc.moveDown(1);

  doc.roundedRect(58, doc.y, doc.page.width - 116, 124, 8).fillAndStroke('#F4F7FA', '#CAD4DF');
  const boxY = doc.y + 14;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('PROFESSOR', 72, boxY);
  doc.font('Helvetica').fontSize(10).text(professor?.nome || 'Não informado', 150, boxY);
  doc.font('Helvetica-Bold').text('E-MAIL', 72, boxY + 21);
  doc.font('Helvetica').text(professor?.email || 'Não informado', 150, boxY + 21);
  doc.font('Helvetica-Bold').text('INSTITUIÇÃO', 72, boxY + 42);
  doc.font('Helvetica').text(instituicao?.nome || instituicao?.sigla || String(aceite.instituicao), 150, boxY + 42, { width: 350 });
  doc.font('Helvetica-Bold').text('TERMO / VERSÃO', 72, boxY + 63);
  doc.font('Helvetica').text(`${aceite.termoTitulo} — ${aceite.termoVersao}`, 150, boxY + 63, { width: 350 });
  doc.font('Helvetica-Bold').text('ACEITE', 72, boxY + 84);
  doc.font('Helvetica').text(formatDate(aceite.aceitoEm), 150, boxY + 84);
  doc.y = boxY + 124;

  doc.moveDown(1).fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Declaração registrada');
  doc.moveDown(0.35).font('Helvetica').fontSize(10.5).lineGap(3)
    .text('O professor declarou ter lido integralmente o termo apresentado e assumiu o compromisso de cumprir suas disposições no uso institucional do Axoriin. O aceite foi realizado por conta autenticada e ficou vinculado à versão e ao conteúdo abaixo identificados.');

  doc.moveDown(1).font('Helvetica-Bold').fontSize(12).text('Conteúdo integral aceito');
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).lineGap(3)
    .text(aceite.termoConteudo, { align: 'justify' });

  doc.addPage();
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Dados técnicos e integridade');
  doc.moveDown(0.5).font('Helvetica').fontSize(9.5).lineGap(2);
  const linhas = [
    ['Código do comprovante', aceite.comprovanteCodigo],
    ['Hash do comprovante (SHA-256)', aceite.comprovanteHash],
    ['Hash do conteúdo do termo (SHA-256)', aceite.termoConteudoHash],
    ['Verificação de integridade', integridadeValida === null ? 'Não aplicável ao modelo' : (integridadeValida ? 'Conferida com sucesso' : 'DIVERGÊNCIA IDENTIFICADA')],
    ['Data e hora do aceite', formatDate(aceite.aceitoEm)],
    ['Endereço IP registrado', aceite.ip || 'Não disponível'],
    ['Encaminhamento de rede', aceite.forwardedFor || 'Não disponível'],
    ['Dispositivo', aceite.dispositivo || 'Não identificado'],
    ['Sistema', aceite.sistema || 'Não identificado'],
    ['Navegador', aceite.navegador || 'Não identificado'],
    ['Identificador da requisição', aceite.requestId || 'Não disponível'],
  ];

  for (const [label, value] of linhas) {
    doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
    doc.font('Helvetica').text(` ${value}`, { width: doc.page.width - 116 });
    doc.moveDown(0.28);
  }

  doc.moveDown(1).font('Helvetica-Bold').text('Observação');
  doc.moveDown(0.3).font('Helvetica').text(
    'Este documento comprova o registro eletrônico de aceite mantido pelo Axoriin. Ele não é um certificado digital ICP-Brasil e não substitui procedimentos formais adicionais que a instituição eventualmente exija.',
    { align: 'justify' }
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    addFooter(doc, aceite.comprovanteCodigo, i - range.start + 1, range.count);
  }

  doc.end();
}

module.exports = { gerarComprovanteTermoProfessor };
