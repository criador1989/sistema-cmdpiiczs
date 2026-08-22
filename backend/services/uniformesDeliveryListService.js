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
  entregue: 'Recebido',
  divergencia: 'Divergência',
  cancelado: 'Cancelado',
};

const GROUP_STATUS_LABEL = {
  completo: 'Completo',
  parcial: 'Parcial',
  pendente: 'Pendente',
  divergencia: 'Divergência',
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asObjectIdString(value) {
  return value == null ? '' : String(value);
}

function buildBaseFilter(tenantId, query = {}) {
  const filter = { instituicao: tenantId, status: { $ne: 'cancelado' } };
  if (query.campanha) filter.campanha = query.campanha;
  if (query.fornecedor) filter.fornecedor = query.fornecedor;
  if (query.item) filter.item = query.item;
  if (query.turma && query.turma !== 'todas') filter.turmaSnapshot = String(query.turma).trim();

  const q = String(query.q || query.aluno || '').trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { alunoNomeSnapshot: rx },
      { turmaSnapshot: rx },
      { codigo: rx },
      { itemNomeSnapshot: rx },
      { fornecedorNomeOrigem: rx },
    ];
  }
  return filter;
}

function itemStatusLabel(status) {
  return STATUS_LABEL[status] || String(status || '-');
}

function groupStatusLabel(status) {
  return GROUP_STATUS_LABEL[status] || String(status || '-');
}

function formatDate(value, withTime = false) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const opts = {
    timeZone: 'America/Rio_Branco',
    day: '2-digit', month: '2-digit', year: 'numeric',
  };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat('pt-BR', opts).format(d);
}

function classify(total, delivered, divergence) {
  if (total > 0 && delivered === total) return 'completo';
  if (delivered > 0) return 'parcial';
  if (divergence > 0) return 'divergencia';
  return 'pendente';
}

function unique(arr) {
  return [...new Set((arr || []).filter(Boolean).map(String))];
}

function buildGroups(vouchers) {
  const map = new Map();

  for (const v of vouchers) {
    const fornecedorId = asObjectIdString(v.fornecedor?._id || v.fornecedor);
    const campanhaId = asObjectIdString(v.campanha?._id || v.campanha);
    const alunoId = asObjectIdString(v.aluno?._id || v.aluno);
    const key = `${campanhaId}|${alunoId}|${fornecedorId}`;

    if (!map.has(key)) {
      map.set(key, {
        chave: key,
        campanha: v.campanha ? {
          _id: v.campanha._id || v.campanha,
          nome: v.campanha.nome || '',
          anoLetivo: v.campanha.anoLetivo || '',
        } : null,
        aluno: { _id: v.aluno?._id || v.aluno, nome: v.alunoNomeSnapshot || '', turma: v.turmaSnapshot || '' },
        fornecedor: v.fornecedor ? {
          _id: v.fornecedor._id || v.fornecedor,
          nome: v.fornecedor.nome || v.fornecedor.nomeFantasia || v.fornecedor.razaoSocial || v.fornecedorNomeOrigem || 'Fornecedor',
        } : { _id: null, nome: v.fornecedorNomeOrigem || 'Fornecedor' },
        vouchers: [],
        responsaveis: [],
        protocolos: [],
        ultimaEntrega: null,
        ultimaEntregaDetalhe: null,
      });
    }

    const g = map.get(key);
    const entrega = v.entrega || null;
    if (entrega?.responsavel?.nome) g.responsaveis.push(entrega.responsavel.nome);
    if (entrega?.protocolo) g.protocolos.push(entrega.protocolo);
    const dt = v.entregueEm || entrega?.entregueEm || null;
    if (dt && (!g.ultimaEntrega || new Date(dt) > new Date(g.ultimaEntrega))) {
      g.ultimaEntrega = dt;
      g.ultimaEntregaDetalhe = {
        data: dt,
        protocolo: entrega?.protocolo || '',
        responsavel: entrega?.responsavel?.nome || '',
        tipoDocumento: entrega?.responsavel?.tipoDocumento || '',
        documento: entrega?.responsavel?.documento || '',
        parentesco: entrega?.responsavel?.parentesco || '',
        atendente: entrega?.atendente?.nome || '',
        atendenteTipo: entrega?.atendente?.tipo || '',
        observacoes: entrega?.observacoes || '',
      };
    }

    g.vouchers.push({
      _id: v._id,
      codigo: v.codigo,
      item: v.item ? { _id: v.item._id || v.item, nome: v.item.nome || v.itemNomeSnapshot || '', codigoExterno: v.item.codigoExterno || v.itemCodigoSnapshot || '' } : null,
      itemNome: v.itemNomeSnapshot || v.item?.nome || 'Item',
      itemCodigo: v.itemCodigoSnapshot || v.item?.codigoExterno || '',
      quantidade: Number(v.quantidade || 1),
      status: v.status,
      statusLabel: itemStatusLabel(v.status),
      entregueEm: v.entregueEm || entrega?.entregueEm || null,
      protocolo: entrega?.protocolo || '',
      responsavel: entrega?.responsavel?.nome || '',
      tipoDocumento: entrega?.responsavel?.tipoDocumento || '',
      documento: entrega?.responsavel?.documento || '',
      parentesco: entrega?.responsavel?.parentesco || '',
      atendente: entrega?.atendente?.nome || '',
      atendenteTipo: entrega?.atendente?.tipo || '',
    });
  }

  const groups = [...map.values()].map(g => {
    g.vouchers.sort((a, b) => String(a.itemNome).localeCompare(String(b.itemNome), 'pt-BR', { numeric: true }));
    const totalVouchers = g.vouchers.length;
    const entregues = g.vouchers.filter(v => v.status === 'entregue').length;
    const divergencias = g.vouchers.filter(v => v.status === 'divergencia').length;
    const pendentes = g.vouchers.filter(v => !['entregue', 'cancelado'].includes(v.status)).length;
    const totalItens = g.vouchers.reduce((s, v) => s + Number(v.quantidade || 1), 0);
    const itensEntregues = g.vouchers.filter(v => v.status === 'entregue').reduce((s, v) => s + Number(v.quantidade || 1), 0);
    const itensPendentes = g.vouchers.filter(v => !['entregue', 'cancelado'].includes(v.status)).reduce((s, v) => s + Number(v.quantidade || 1), 0);

    g.totais = { totalVouchers, entregues, pendentes, divergencias, totalItens, itensEntregues, itensPendentes };
    g.situacao = classify(totalVouchers, entregues, divergencias);
    g.situacaoLabel = groupStatusLabel(g.situacao);
    g.progresso = {
      recebidos: itensEntregues,
      total: totalItens,
      faltantes: itensPendentes,
      label: `${itensEntregues} de ${totalItens} ${totalItens === 1 ? 'item recebido' : 'itens recebidos'}`,
    };
    g.responsaveis = unique(g.responsaveis);
    g.protocolos = unique(g.protocolos);
    return g;
  });

  groups.sort((a, b) => {
    const turma = String(a.aluno.turma).localeCompare(String(b.aluno.turma), 'pt-BR', { numeric: true });
    if (turma) return turma;
    const aluno = String(a.aluno.nome).localeCompare(String(b.aluno.nome), 'pt-BR');
    if (aluno) return aluno;
    return String(a.fornecedor.nome).localeCompare(String(b.fornecedor.nome), 'pt-BR');
  });
  return groups;
}

function summarize(groups) {
  const alunos = new Map();
  let vouchers = 0;
  let vouchersEntregues = 0;
  let vouchersPendentes = 0;
  let itens = 0;
  let itensEntregues = 0;
  let itensPendentes = 0;
  let completos = 0;
  let parciais = 0;
  let pendentes = 0;
  let divergencias = 0;

  for (const g of groups) {
    if (g.situacao === 'completo') completos++;
    else if (g.situacao === 'parcial') parciais++;
    else if (g.situacao === 'divergencia') divergencias++;
    else pendentes++;

    vouchers += g.totais.totalVouchers;
    vouchersEntregues += g.totais.entregues;
    vouchersPendentes += g.totais.pendentes;
    itens += g.totais.totalItens;
    itensEntregues += g.totais.itensEntregues;
    itensPendentes += g.totais.itensPendentes;

    const aid = asObjectIdString(g.aluno._id) || g.aluno.nome;
    if (!alunos.has(aid)) alunos.set(aid, { total: 0, entregues: 0, divergencias: 0 });
    const a = alunos.get(aid);
    a.total += g.totais.totalVouchers;
    a.entregues += g.totais.entregues;
    a.divergencias += g.totais.divergencias;
  }

  let alunosCompletos = 0;
  let alunosParciais = 0;
  let alunosPendentes = 0;
  let alunosComDivergencia = 0;
  for (const a of alunos.values()) {
    const s = classify(a.total, a.entregues, a.divergencias);
    if (s === 'completo') alunosCompletos++;
    else if (s === 'parcial') alunosParciais++;
    else if (s === 'divergencia') alunosComDivergencia++;
    else alunosPendentes++;
  }

  return {
    atendimentos: groups.length,
    completos,
    parciais,
    pendentes,
    divergencias,
    faltamAtendimentos: Math.max(0, groups.length - completos),
    alunos: alunos.size,
    alunosCompletos,
    alunosParciais,
    alunosPendentes,
    alunosComDivergencia,
    alunosFaltam: Math.max(0, alunos.size - alunosCompletos),
    vouchers,
    vouchersEntregues,
    vouchersPendentes,
    itens,
    itensEntregues,
    itensPendentes,
    percentualItensEntregues: itens ? Number(((itensEntregues / itens) * 100).toFixed(1)) : 0,
  };
}

async function getDeliveryListData(tenantId, query = {}) {
  const filter = buildBaseFilter(tenantId, query);
  const vouchers = await UniformeVoucher.find(filter)
    .populate('fornecedor', 'nome nomeFantasia razaoSocial')
    .populate('item', 'nome codigoExterno categoria')
    .populate('campanha', 'nome anoLetivo')
    .populate({ path: 'entrega', select: 'responsavel entregueEm protocolo status atendente observacoes' })
    .sort({ turmaSnapshot: 1, alunoNomeSnapshot: 1, createdAt: 1 })
    .lean();

  let groups = buildGroups(vouchers);
  const situacao = String(query.situacao || query.statusGrupo || 'todos').trim().toLowerCase();
  if (situacao && situacao !== 'todos') groups = groups.filter(g => g.situacao === situacao);

  const relatorio = String(query.relatorio || 'operacional').trim().toLowerCase();
  if (relatorio === 'pendentes') groups = groups.filter(g => ['pendente', 'parcial'].includes(g.situacao));
  else if (relatorio === 'entregues') groups = groups.filter(g => g.situacao === 'completo');
  else if (relatorio === 'parciais') groups = groups.filter(g => g.situacao === 'parcial');
  else if (relatorio === 'divergencias') groups = groups.filter(g => g.situacao === 'divergencia');

  const resumo = summarize(groups);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const total = groups.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const paginated = groups.slice(start, start + limit);

  const institution = await Instituicao.findById(tenantId).select('nome sigla').lean().catch(() => null);

  return {
    instituicao: institution || null,
    filtros: {
      campanha: query.campanha || '', fornecedor: query.fornecedor || '', item: query.item || '',
      turma: query.turma || '', situacao, q: query.q || query.aluno || '', relatorio,
    },
    resumo,
    total,
    page,
    pages,
    grupos: paginated,
    todosGrupos: groups,
  };
}

function itemText(v) {
  const mark = v.status === 'entregue' ? '✓' : (v.status === 'divergencia' ? '!' : '○');
  const qty = Number(v.quantidade || 1) > 1 ? ` x${v.quantidade}` : '';
  return `${mark} ${v.itemNome}${qty}`;
}

function filtersText(data) {
  const f = data.filtros || {};
  const parts = [];
  if (f.turma) parts.push(`Turma: ${f.turma}`);
  if (f.situacao && f.situacao !== 'todos') parts.push(`Situação: ${groupStatusLabel(f.situacao)}`);
  if (f.q) parts.push(`Busca: ${f.q}`);
  return parts.join(' • ') || 'Todos os registros do recorte selecionado';
}

function reportTitle(data) {
  const type = String(data?.filtros?.relatorio || 'operacional');
  return ({
    pendentes: 'PENDENTES DE RETIRADA',
    entregues: 'ENTREGAS CONCLUÍDAS',
    parciais: 'ENTREGAS PARCIAIS',
    divergencias: 'DIVERGÊNCIAS DE ENTREGA',
    resumo_fornecedor: 'RESUMO POR FORNECEDOR',
    resumo_turma: 'RESUMO POR TURMA',
  })[type] || 'RELATÓRIO OPERACIONAL DE ENTREGA DE UNIFORMES';
}

function aggregateGroups(groups, by = 'fornecedor') {
  const map = new Map();
  for (const g of groups || []) {
    const key = by === 'turma' ? (g.aluno?.turma || 'Sem turma') : (g.fornecedor?.nome || 'Sem fornecedor');
    if (!map.has(key)) map.set(key, {
      chave: key, alunos: new Set(), atendimentos: 0, completos: 0, parciais: 0, pendentes: 0, divergencias: 0,
      itens: 0, itensEntregues: 0, itensPendentes: 0,
    });
    const x = map.get(key);
    x.alunos.add(asObjectIdString(g.aluno?._id) || g.aluno?.nome || '');
    x.atendimentos++;
    if (g.situacao === 'completo') x.completos++;
    else if (g.situacao === 'parcial') x.parciais++;
    else if (g.situacao === 'divergencia') x.divergencias++;
    else x.pendentes++;
    x.itens += g.totais?.totalItens || 0;
    x.itensEntregues += g.totais?.itensEntregues || 0;
    x.itensPendentes += g.totais?.itensPendentes || 0;
  }
  return [...map.values()].map(x => ({
    ...x,
    alunos: [...x.alunos].filter(Boolean).length,
    percentual: x.itens ? Number(((x.itensEntregues / x.itens) * 100).toFixed(1)) : 0,
  })).sort((a, b) => String(a.chave).localeCompare(String(b.chave), 'pt-BR', { numeric: true }));
}

function createDeliveryPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const r = data.resumo || {};
      const inst = data.instituicao?.nome || data.instituicao?.sigla || 'Instituição';
      const type = String(data?.filtros?.relatorio || 'operacional');
      doc.font('Helvetica-Bold').fontSize(15).text(reportTitle(data), { align: 'center' });
      doc.moveDown(0.15).font('Helvetica').fontSize(9).text(inst, { align: 'center' });
      doc.moveDown(0.15).fontSize(8).fillColor('#4b5563').text(filtersText(data), { align: 'center' }).fillColor('#111827');
      doc.moveDown(0.65);

      doc.font('Helvetica-Bold').fontSize(8.7).text(
        `Alunos: ${r.alunos || 0}   |   Completos: ${r.alunosCompletos || 0}   |   Faltam: ${r.alunosFaltam || 0}   |   Parciais: ${r.alunosParciais || 0}   |   Pendentes: ${r.alunosPendentes || 0}   |   Divergências: ${r.alunosComDivergencia || 0}`
      );
      doc.moveDown(0.15).font('Helvetica').text(
        `Itens previstos: ${r.itens || 0}   |   Itens recebidos: ${r.itensEntregues || 0}   |   Itens faltantes: ${r.itensPendentes || 0}   |   Conclusão: ${r.percentualItensEntregues || 0}%`
      );
      doc.moveDown(0.65);

      let y = doc.y;
      function row(values, cols, header = false, fontSize = 6.6) {
        const wrapped = values.map((v, i) => Math.max(1, Math.ceil(String(v ?? '').length / Math.max(12, Math.floor(cols[i] / 4.8)))));
        const h = header ? 22 : Math.max(27, 11 + Math.max(...wrapped) * 8);
        if (y + h > doc.page.height - 34) { doc.addPage(); y = 28; }
        let x = 28;
        values.forEach((v, i) => {
          if (header) doc.rect(x, y, cols[i], h).fillAndStroke('#eef2f7', '#cbd5e1');
          else doc.rect(x, y, cols[i], h).stroke('#d1d5db');
          doc.fillColor('#111827').font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 6.8 : fontSize)
            .text(String(v ?? ''), x + 3, y + 4, { width: cols[i] - 6, height: h - 7, ellipsis: true });
          x += cols[i];
        });
        y += h;
      }

      if (type === 'resumo_fornecedor' || type === 'resumo_turma') {
        const by = type === 'resumo_turma' ? 'turma' : 'fornecedor';
        const rows = aggregateGroups(data.todosGrupos, by);
        const cols = [160, 55, 66, 55, 55, 55, 62, 72, 72, 72, 58];
        row([by === 'turma' ? 'Turma' : 'Fornecedor', 'Alunos', 'Atend.', 'Compl.', 'Parc.', 'Pend.', 'Diverg.', 'Itens', 'Receb.', 'Faltam', '%'], cols, true);
        rows.forEach(x => row([x.chave, x.alunos, x.atendimentos, x.completos, x.parciais, x.pendentes, x.divergencias, x.itens, x.itensEntregues, x.itensPendentes, `${x.percentual}%`], cols));
      } else {
        const cols = [22, 105, 40, 82, 150, 52, 85, 75, 82, 70];
        row(['Nº', 'Aluno', 'Turma', 'Fornecedor', 'Itens / marcação', 'Situação', 'Responsável / doc.', 'Protocolo', 'Conferido por', 'Última entrega'], cols, true);
        data.todosGrupos.forEach((g, idx) => {
          const d = g.ultimaEntregaDetalhe || {};
          row([
            idx + 1,
            g.aluno.nome,
            g.aluno.turma,
            g.fornecedor.nome,
            g.vouchers.map(itemText).join(' | '),
            `${g.situacaoLabel}\n${g.progresso?.label || ''}`,
            d.responsavel ? `${d.responsavel}\n${d.tipoDocumento || 'Documento'}: ${d.documento || '-'}` : '-',
            d.protocolo || '-',
            d.atendente || '-',
            g.ultimaEntrega ? formatDate(g.ultimaEntrega, true) : '-',
          ], cols);
        });
      }

      doc.fontSize(7).fillColor('#6b7280').text('Legenda: ✓ recebido   ○ pendente   ! divergência. Relatório gerado pelo Axoriin.', 28, Math.min(y + 7, doc.page.height - 22));
      doc.end();
    } catch (e) { reject(e); }
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: 'EAF0F7', type: ShadingType.CLEAR } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
    },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold: Boolean(opts.header), size: 18 })] })],
  });
}

async function createDeliveryDocxBuffer(data) {
  const r = data.resumo || {};
  const type = String(data?.filtros?.relatorio || 'operacional');
  let rows;

  if (type === 'resumo_fornecedor' || type === 'resumo_turma') {
    const by = type === 'resumo_turma' ? 'turma' : 'fornecedor';
    const aggregated = aggregateGroups(data.todosGrupos, by);
    rows = [
      new TableRow({ children: [
        cell(by === 'turma' ? 'Turma' : 'Fornecedor', { header: true }), cell('Alunos', { header: true }), cell('Atend.', { header: true }),
        cell('Completos', { header: true }), cell('Parciais', { header: true }), cell('Pendentes', { header: true }), cell('Diverg.', { header: true }),
        cell('Itens', { header: true }), cell('Recebidos', { header: true }), cell('Faltam', { header: true }), cell('%', { header: true }),
      ] }),
      ...aggregated.map(x => new TableRow({ children: [
        cell(x.chave), cell(x.alunos), cell(x.atendimentos), cell(x.completos), cell(x.parciais), cell(x.pendentes), cell(x.divergencias),
        cell(x.itens), cell(x.itensEntregues), cell(x.itensPendentes), cell(`${x.percentual}%`),
      ] })),
    ];
  } else {
    rows = [
      new TableRow({ children: [
        cell('Nº', { header: true }), cell('Aluno', { header: true }), cell('Turma', { header: true }),
        cell('Fornecedor', { header: true }), cell('Itens / marcação', { header: true }), cell('Situação', { header: true }),
        cell('Responsável / documento', { header: true }), cell('Protocolo', { header: true }), cell('Conferido por', { header: true }), cell('Última entrega', { header: true }),
      ] }),
      ...data.todosGrupos.map((g, idx) => {
        const d = g.ultimaEntregaDetalhe || {};
        return new TableRow({ children: [
          cell(idx + 1), cell(g.aluno.nome), cell(g.aluno.turma), cell(g.fornecedor.nome),
          cell(g.vouchers.map(itemText).join(' | ')), cell(`${g.situacaoLabel} — ${g.progresso?.label || ''}`),
          cell(d.responsavel ? `${d.responsavel} | ${d.tipoDocumento || 'Documento'}: ${d.documento || '-'}` : '-'),
          cell(d.protocolo || '-'), cell(d.atendente || '-'), cell(g.ultimaEntrega ? formatDate(g.ultimaEntrega, true) : '-'),
        ] });
      }),
    ];
  }

  const doc = new Document({ sections: [{
    properties: { page: { size: { orientation: 'landscape' } } },
    children: [
      new Paragraph({ text: reportTitle(data), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: data.instituicao?.nome || data.instituicao?.sigla || 'Instituição', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: filtersText(data), alignment: AlignmentType.CENTER }),
      new Paragraph({ text: `Alunos: ${r.alunos || 0} | Completos: ${r.alunosCompletos || 0} | Faltam: ${r.alunosFaltam || 0} | Parciais: ${r.alunosParciais || 0} | Pendentes: ${r.alunosPendentes || 0} | Divergências: ${r.alunosComDivergencia || 0}` }),
      new Paragraph({ text: `Itens previstos: ${r.itens || 0} | Recebidos: ${r.itensEntregues || 0} | Faltantes: ${r.itensPendentes || 0} | Conclusão: ${r.percentualItensEntregues || 0}%` }),
      new Paragraph({ text: 'Legenda: ✓ recebido   ○ pendente   ! divergência.' }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    ],
  }] });
  return Packer.toBuffer(doc);
}

module.exports = {
  buildBaseFilter,
  getDeliveryListData,
  createDeliveryPdfBuffer,
  createDeliveryDocxBuffer,
};
