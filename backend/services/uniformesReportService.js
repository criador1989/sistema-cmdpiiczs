'use strict';

const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
} = require('docx');

const UniformeVoucher = require('../models/UniformeVoucher');
const Instituicao = require('../models/Instituicao');

const STATUS_LABEL = {
  cadastrado: 'Cadastrado',
  validado: 'Validado',
  aguardando_fornecedor: 'Aguardando fornecedor',
  disponivel_entrega: 'Disponível para entrega',
  agendado: 'Agendado',
  entregue: 'Entregue',
  divergencia: 'Divergência',
  cancelado: 'Cancelado',
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asDateStart(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asDateEnd(value) {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildVoucherFilter(tenantId, query = {}) {
  const filter = { instituicao: tenantId };
  if (query.campanha) filter.campanha = query.campanha;
  if (query.fornecedor) filter.fornecedor = query.fornecedor;
  if (query.item) filter.item = query.item;
  if (query.status && query.status !== 'todos') filter.status = query.status;
  if (query.turma && query.turma !== 'todas') filter.turmaSnapshot = query.turma;

  const q = String(query.q || query.aluno || '').trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { alunoNomeSnapshot: rx },
      { turmaSnapshot: rx },
      { codigo: rx },
      { itemNomeSnapshot: rx },
    ];
  }

  const inicio = asDateStart(query.dataInicio);
  const fim = asDateEnd(query.dataFim);
  if (inicio || fim) {
    const campo = query.periodoCampo === 'cadastro' ? 'createdAt' : (query.periodoCampo === 'emissao' ? 'emitidoEm' : 'entregueEm');
    filter[campo] = {};
    if (inicio) filter[campo].$gte = inicio;
    if (fim) filter[campo].$lte = fim;
  }

  return filter;
}

function statusLabel(status) {
  return STATUS_LABEL[status] || String(status || '-');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Rio_Branco',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

function normalizeCell(value, fallback = '-') {
  const s = String(value ?? '').trim();
  return s || fallback;
}

async function getReportData(tenantId, query = {}) {
  const filter = buildVoucherFilter(tenantId, query);
  const vouchers = await UniformeVoucher.find(filter)
    .populate('fornecedor', 'nome nomeFantasia razaoSocial')
    .populate('item', 'nome codigoExterno categoria')
    .populate('campanha', 'nome anoLetivo')
    .sort({ turmaSnapshot: 1, alunoNomeSnapshot: 1, createdAt: 1 })
    .lean();

  const institution = await Instituicao.findById(tenantId)
    .select('nome sigla')
    .lean()
    .catch(() => null);

  const total = vouchers.length;
  const statusCounts = {};
  const porTurma = new Map();
  const porFornecedor = new Map();
  const alunos = new Set();
  let entregues = 0;
  let pendentes = 0;
  let divergencias = 0;

  for (const v of vouchers) {
    statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
    alunos.add(String(v.aluno || v.alunoNomeSnapshot));
    const turma = normalizeCell(v.turmaSnapshot, 'Sem turma');
    const fornecedor = normalizeCell(v.fornecedor?.nome || v.fornecedor?.nomeFantasia || v.fornecedor?.razaoSocial, 'Sem fornecedor');
    porTurma.set(turma, (porTurma.get(turma) || 0) + 1);
    porFornecedor.set(fornecedor, (porFornecedor.get(fornecedor) || 0) + 1);
    if (v.status === 'entregue') entregues++;
    else if (v.status === 'divergencia') divergencias++;
    else if (v.status !== 'cancelado') pendentes++;
  }

  return {
    institution: institution || { nome: 'Instituição de Ensino', sigla: '' },
    generatedAt: new Date(),
    filters: { ...query },
    summary: {
      total,
      alunos: alunos.size,
      entregues,
      pendentes,
      divergencias,
      statusCounts,
      porTurma: [...porTurma.entries()].map(([nome, quantidade]) => ({ nome, quantidade })),
      porFornecedor: [...porFornecedor.entries()].map(([nome, quantidade]) => ({ nome, quantidade })),
    },
    vouchers,
  };
}

function addPdfHeader(doc, data, title) {
  doc.font('Helvetica-Bold').fontSize(15).text(data.institution.nome || 'Instituição de Ensino', { align: 'center' });
  if (data.institution.sigla) doc.font('Helvetica').fontSize(9).text(data.institution.sigla, { align: 'center' });
  doc.moveDown(0.35);
  doc.font('Helvetica-Bold').fontSize(13).text(title, { align: 'center' });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(8).fillColor('#555555').text(
    `Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Rio_Branco' }).format(data.generatedAt)}`,
    { align: 'center' }
  );
  doc.fillColor('#111111').moveDown(0.7);
}

function ensurePdfSpace(doc, need = 38) {
  if (doc.y + need > doc.page.height - 55) doc.addPage();
}

function pdfKeyValue(doc, label, value, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(8).text(label, x, y, { width });
  doc.font('Helvetica').fontSize(11).text(String(value), x, y + 11, { width });
}

function addPdfSummary(doc, data) {
  const { summary } = data;
  const startX = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const w = usable / 5;
  const y = doc.y;
  const entries = [
    ['ALUNOS', summary.alunos],
    ['VOUCHERS', summary.total],
    ['ENTREGUES', summary.entregues],
    ['PENDENTES', summary.pendentes],
    ['DIVERGÊNCIAS', summary.divergencias],
  ];
  entries.forEach(([label, value], i) => {
    doc.roundedRect(startX + i * w + 2, y, w - 4, 40, 5).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
    pdfKeyValue(doc, label, value, startX + i * w + 8, y + 7, w - 16);
  });
  doc.y = y + 50;
}

function addPdfTableHeader(doc, widths, x) {
  const y = doc.y;
  const labels = ['Aluno', 'Turma', 'Fornecedor', 'Item/Kit', 'Status', 'Entrega'];
  doc.rect(x, y, widths.reduce((a, b) => a + b, 0), 20).fill('#e2e8f0');
  let cursor = x;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.2);
  labels.forEach((label, i) => {
    doc.text(label, cursor + 3, y + 6, { width: widths[i] - 6, ellipsis: true });
    cursor += widths[i];
  });
  doc.y = y + 20;
}

async function createPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 38, right: 34, bottom: 40, left: 34 },
        bufferPages: true,
        info: { Title: 'Relatório de Uniformes e Vouchers', Producer: 'Axoriin' },
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      addPdfHeader(doc, data, 'Relatório de Uniformes e Vouchers');
      addPdfSummary(doc, data);

      const x = doc.page.margins.left;
      const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const widths = [155, 72, 135, 160, 100, usable - 622];
      addPdfTableHeader(doc, widths, x);

      for (const v of data.vouchers) {
        ensurePdfSpace(doc, 29);
        if (doc.y < 70) addPdfTableHeader(doc, widths, x);
        const y = doc.y;
        const row = [
          normalizeCell(v.alunoNomeSnapshot),
          normalizeCell(v.turmaSnapshot),
          normalizeCell(v.fornecedor?.nome || v.fornecedor?.nomeFantasia || v.fornecedor?.razaoSocial),
          normalizeCell(v.itemNomeSnapshot || v.item?.nome),
          statusLabel(v.status),
          formatDate(v.entregueEm),
        ];
        let cursor = x;
        doc.font('Helvetica').fontSize(7.1).fillColor('#111827');
        row.forEach((value, i) => {
          doc.text(value, cursor + 3, y + 5, { width: widths[i] - 6, height: 19, ellipsis: true });
          cursor += widths[i];
        });
        doc.moveTo(x, y + 25).lineTo(x + usable, y + 25).lineWidth(0.35).strokeColor('#dbe3ec').stroke();
        doc.y = y + 25;
      }

      if (!data.vouchers.length) {
        doc.moveDown(1).font('Helvetica').fontSize(10).text('Nenhum registro encontrado para os filtros selecionados.', { align: 'center' });
      }

      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(
          `Axoriin • Uniformes e Vouchers • Página ${i + 1} de ${pages.count}`,
          doc.page.margins.left,
          doc.page.height - 26,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

const noBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'D6DEE8' },
};

function docxCell(text, { bold = false, shade = null } = {}) {
  return new TableCell({
    borders: noBorders,
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: String(text ?? '-'), bold, size: 18 })],
    })],
  });
}

async function createDocxBuffer(data) {
  const summaryRows = [
    new TableRow({ children: [
      docxCell('Alunos', { bold: true, shade: 'EAF2FF' }), docxCell(data.summary.alunos),
      docxCell('Vouchers', { bold: true, shade: 'EAF2FF' }), docxCell(data.summary.total),
      docxCell('Entregues', { bold: true, shade: 'EAF2FF' }), docxCell(data.summary.entregues),
      docxCell('Pendentes', { bold: true, shade: 'EAF2FF' }), docxCell(data.summary.pendentes),
      docxCell('Divergências', { bold: true, shade: 'EAF2FF' }), docxCell(data.summary.divergencias),
    ] }),
  ];

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Aluno', 'Turma', 'Fornecedor', 'Item/Kit', 'Voucher', 'Status', 'Entrega'].map(v => docxCell(v, { bold: true, shade: 'DCEBFF' })),
    }),
    ...data.vouchers.map(v => new TableRow({ children: [
      docxCell(normalizeCell(v.alunoNomeSnapshot)),
      docxCell(normalizeCell(v.turmaSnapshot)),
      docxCell(normalizeCell(v.fornecedor?.nome || v.fornecedor?.nomeFantasia || v.fornecedor?.razaoSocial)),
      docxCell(normalizeCell(v.itemNomeSnapshot || v.item?.nome)),
      docxCell(normalizeCell(v.codigo)),
      docxCell(statusLabel(v.status)),
      docxCell(formatDate(v.entregueEm)),
    ] })),
  ];

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: data.institution.nome || 'Instituição de Ensino', bold: true, size: 28 })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Relatório de Uniformes e Vouchers', bold: true })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Rio_Branco' }).format(data.generatedAt)}`, color: '667085', size: 18 })],
      spacing: { after: 180 },
    }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows }),
    new Paragraph({ text: '', spacing: { after: 160 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
  ];

  if (!data.vouchers.length) {
    children.push(new Paragraph({ text: 'Nenhum registro encontrado para os filtros selecionados.', alignment: AlignmentType.CENTER }));
  }

  const doc = new Document({
    creator: 'Axoriin',
    title: 'Relatório de Uniformes e Vouchers',
    sections: [{
      properties: {
        page: {
          size: { orientation: 'landscape' },
          margin: { top: 720, right: 560, bottom: 720, left: 560 },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  buildVoucherFilter,
  getReportData,
  createPdfBuffer,
  createDocxBuffer,
  statusLabel,
};
