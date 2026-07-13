// utils/pdfComunicacao.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Gera PDF da Comunicação aos Pais
 * @param {Object} doc ComunicaçãoPais (objeto vindo do Mongo)
 * @returns {Buffer} PDF pronto
 */
async function gerarPdfComunicacao(doc = {}) {
  // === define conteúdo ===
  const aluno = doc.nomeAluno || doc.alunoNome || '—';
  const turma = doc.turma || '—';
  const instituicao = doc.instituicao || 'Colégio Militar Dom Pedro II — CZS';
  const tipoMedida = doc.tipoMedida || 'Medida Disciplinar';
  const numeroSeq = doc.numeroSequencial || '—';
  const dataNotif = dataBR(doc.dataNotificacao);
  const dataInicio = dataBR(doc.dataInicio);
  const dataFim = dataBR(doc.dataFim);
  const horaApresentacao = doc.horaApresentacao || '14:00';
  const horaSaida = doc.horaSaida || '18:00';
  const observacao = doc.observacao || '—';

  // === cria PDF ===
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  const rubi = rgb(0.55, 0, 0);
  const gold = rgb(0.9, 0.78, 0.45);
  const black = rgb(0, 0, 0);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 80;

  // === Cabeçalho ===
  page.drawText('Colégio Militar Dom Pedro II – Cruzeiro do Sul/AC', {
    x: margin,
    y,
    size: 14,
    font: fontBold,
    color: rubi,
  });
  y -= 20;
  page.drawText('Comunicação aos Pais/Responsáveis', {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: gold,
  });

  y -= 30;
  drawLine(page, margin, y, width - margin, y, rubi);

  // === Corpo principal ===
  y -= 35;
  drawLabel(page, 'Aluno:', aluno, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Turma:', turma, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Instituição:', instituicao, margin, y, fontBold, font);
  y -= 25;
  drawLabel(page, 'Medida Disciplinar:', tipoMedida, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Nº da Notificação:', numeroSeq, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Data da Notificação:', dataNotif, margin, y, fontBold, font);

  y -= 30;
  drawLabel(page, 'Data de Início:', dataInicio, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Data de Fim:', dataFim, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Hora de Apresentação:', horaApresentacao, margin, y, fontBold, font);
  y -= 20;
  drawLabel(page, 'Hora de Saída:', horaSaida, margin, y, fontBold, font);

  // === Observações ===
  y -= 40;
  page.drawText('Observações:', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rubi,
  });
  y -= 16;
  const obsLines = dividirTexto(observacao, 90);
  obsLines.forEach((line) => {
    page.drawText(line, { x: margin + 10, y, size: 10.5, font, color: black });
    y -= 14;
  });

  // === Assinaturas ===
  y -= 50;
  drawLine(page, margin, y, width / 2 - 20, y, black);
  drawLine(page, width / 2 + 20, y, width - margin, y, black);
  y -= 12;
  page.drawText('Assinatura do Responsável', {
    x: margin,
    y,
    size: 10,
    font,
    color: black,
  });
  page.drawText('Assinatura do Coordenador do Corpo de Alunos', {
    x: width / 2 + 20,
    y,
    size: 10,
    font,
    color: black,
  });

  // === Rodapé ===
  page.drawText('Documento gerado automaticamente pelo Sistema Escolar CMDPII/CZS', {
    x: margin,
    y: 40,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/* ===== helpers ===== */

function dataBR(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Rio_Branco' });
  } catch {
    return '—';
  }
}

function drawLine(page, x1, y1, x2, y2, color) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness: 1 });
}

function drawLabel(page, label, value, x, y, fontLabel, fontValue) {
  page.drawText(label, { x, y, size: 11, font: fontLabel, color: rgb(0, 0, 0) });
  page.drawText(String(value || '—'), { x: x + 150, y, size: 11, font: fontValue, color: rgb(0, 0, 0) });
}

function dividirTexto(texto, max) {
  if (!texto) return [];
  const words = texto.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

module.exports = gerarPdfComunicacao;
