// backend/routes/api/aph-pdf.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const AphAtendimento = require('../../models/AphAtendimento');

let Aluno = null;
try { Aluno = require('../../models/Aluno'); } catch {}

const RUBI = '#8B0000';
const DOURADO = '#C9A227';
const CINZA_TEXTO = '#333333';
const PRETO = '#111111';
const INSTITUICAO_NOME = 'Colégio Militar Dom Pedro II • Unidade Cruzeiro do Sul';

function pad2(n){ return String(n).padStart(2,'0'); }
function dtBR(din){
  const d = (din instanceof Date) ? din : new Date(din);
  if (isNaN(d)) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function texto(v){ return (v==null || String(v).trim()==='') ? '—' : String(v).trim(); }
function joinArr(arr){
  if (!Array.isArray(arr) || !arr.length) return '—';
  return arr.map(x => (x==null ? '' : String(x))).filter(Boolean).join(', ');
}
function canPopulateAluno(){
  try{ return mongoose.modelNames().includes('Aluno'); } catch { return false; }
}

/* ---------- Cabeçalho / Rodapé / Página ---------- */
function headerTema(doc, titulo, subtitulo){
  const W = doc.page.width;
  doc.save().rect(0, 0, W, 70).fill(RUBI).restore();
  doc.save().rect(0, 68, W, 2).fill(DOURADO).restore();

  const m = doc.page.margins.left;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
     .text(INSTITUICAO_NOME, m, 18, { width: W - m*2, align: 'left', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(18)
     .text(titulo || '', m, 38, { width: W - m*2, align: 'left', lineBreak: false });
  if (subtitulo) {
    doc.font('Helvetica').fontSize(11)
       .text(subtitulo, m, 58, { width: W - m*2, align: 'left', lineBreak: false });
  }
  doc.y = 86; // um respiro extra
}
function footerTema(doc){
  const W = doc.page.width;
  const H = doc.page.height;
  const y = H - 28;
  doc.save().strokeColor('#dddddd').lineWidth(0.5).moveTo(32, y).lineTo(W-32, y).stroke().restore();
  doc.fillColor(CINZA_TEXTO).fontSize(9)
     .text(INSTITUICAO_NOME, 32, y+6, { width: W-120, align: 'left', lineBreak: false });
  doc.fillColor(CINZA_TEXTO).fontSize(9)
     .text(`Página ${doc.page.number}`, W-120, y+6, { width: 90, align: 'right', lineBreak: false });
}
function safeAddPage(doc, titulo, subtitulo){
  footerTema(doc);
  doc.addPage();
  headerTema(doc, titulo, subtitulo);
}

/* ---------- Helpers de layout (duas colunas e blocos) ---------- */
function writePairs(doc, pairs, opts = {}){
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const usableW = doc.page.width - (mL + mR);

  const labelW = opts.labelW ?? 140; // largura fixa do rótulo
  const gap = opts.gap ?? 10;        // espaço entre rótulo e valor
  const valW = usableW - labelW - gap;
  const linePadY = opts.linePadY ?? 4;
  const title = opts.title;

  if (title) {
    if (doc.y > doc.page.height - 80) safeAddPage(doc, title, opts.subtitle);
    doc.moveDown(0.4);
    doc.fillColor(PRETO).font('Helvetica-Bold').fontSize(13).text(title, mL, doc.y, {
      width: usableW, align: 'left'
    });
    doc.moveDown(0.2);
  }

  pairs.forEach(({k, v})=>{
    const label = String(k ?? '');
    const val = texto(v);
    const hLabel = 12; // rótulo é sempre uma linha

    // Altura estimada do valor
    const hVal = Math.max(
      12,
      doc.heightOfString(val, { width: valW, align: 'left' })
    );
    const rowH = Math.max(hLabel, hVal) + linePadY*2;

    // quebra de página
    if (doc.y + rowH > doc.page.height - 50) safeAddPage(doc, opts.headerTitle, opts.headerSubtitle);

    const baseY = doc.y;
    // rótulo
    doc.fillColor(PRETO).font('Helvetica-Bold').fontSize(11)
       .text(label + ':', mL, baseY + linePadY, { width: labelW, align: 'left', lineBreak: false });

    // valor (coluna fixa)
    doc.fillColor(CINZA_TEXTO).font('Helvetica').fontSize(11)
       .text(val, mL + labelW + gap, baseY + linePadY, { width: valW, align: 'left' });

    doc.y = baseY + rowH;
  });
}

function writeBlock(doc, title, value, opts = {}){
  const mL = doc.page.margins.left;
  const mR = doc.page.margins.right;
  const usableW = doc.page.width - (mL + mR);
  const padY = opts.padY ?? 6;

  const val = texto(value);

  // espaço para título + algumas linhas
  if (doc.y > doc.page.height - 100) safeAddPage(doc, opts.headerTitle, opts.headerSubtitle);

  doc.moveDown(0.5);
  doc.fillColor(PRETO).font('Helvetica-Bold').fontSize(12)
     .text(title + ':', mL, doc.y, { width: usableW, align: 'left' });

  doc.fillColor(CINZA_TEXTO).font('Helvetica').fontSize(11)
     .text(val, mL, doc.y + 2, { width: usableW, align: 'justify' });

  doc.moveDown(0.4);
  doc.y += padY;
}

/* ======================= PDF INDIVIDUAL ======================= */
router.get('/pdf/:id', async (req, res) => {
  try{
    const doPopulate = canPopulateAluno();
    let q = AphAtendimento.findById(req.params.id);
    if (doPopulate) q = q.populate({ path: 'alunoId', select: 'nome' });
    const item = await q.lean();
    if (!item) return res.status(404).send('Atendimento não encontrado.');

    const doc = new PDFDocument({ size:'A4', margins:{ top:36, left:32, right:32, bottom:40 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="APH_${String(item._id)}.pdf"`);
    doc.pipe(res);

    const titulo = 'Relatório de Atendimento - APH';
    const subtitulo = `Gerado em ${dtBR(new Date())}`;
    headerTema(doc, titulo, subtitulo);

    const alunoNome = texto(item?.alunoId?.nome || item?.alunoNome || item?.aluno || item?.alunoId);

    // Bloco "Dados do Atendimento" em DUAS COLUNAS
    writePairs(doc, [
      { k:'Data',         v: dtBR(item.createdAt) },
      { k:'Aluno',        v: alunoNome },
      { k:'Responsável',  v: item.responsavel || item.criadoPor },
      { k:'Local',        v: item.local },
      { k:'Hora',         v: item.hora },
      { k:'Criado por',   v: item.criadoPor },
    ], {
      headerTitle: titulo, headerSubtitle: subtitulo,
      title: 'Dados do atendimento',
      labelW: 150, gap: 12, linePadY: 4
    });

    // Blocos de texto corrido (justificado)
    writeBlock(doc, 'Tipos', joinArr(item.tipos), { headerTitle: titulo, headerSubtitle: subtitulo });
    writeBlock(doc, 'Materiais', joinArr(item.materiais), { headerTitle: titulo, headerSubtitle: subtitulo });
    writeBlock(doc, 'Encaminhamento', item.encaminhamento, { headerTitle: titulo, headerSubtitle: subtitulo });
    writeBlock(doc, 'Responsáveis informados', item.responsaveisInformados, { headerTitle: titulo, headerSubtitle: subtitulo });
    writeBlock(doc, 'Meio de comunicação', item.meioComunicacao, { headerTitle: titulo, headerSubtitle: subtitulo });
    writeBlock(doc, 'Observações', item.observacoes, { headerTitle: titulo, headerSubtitle: subtitulo });

    footerTema(doc);
    doc.end();
  }catch(err){
    console.error('pdf individual erro:', err);
    try{ res.status(500).send('Erro ao gerar PDF individual.'); }catch{}
  }
});

/* ======================= PDF CONSOLIDADO ======================= */
router.get('/pdf-consolidado', async (req, res) => {
  try{
    const { from, to } = req.query;
    const filtro = {};
    if (from) {
      const d = new Date(from); if (!isNaN(d)) filtro.createdAt = { ...(filtro.createdAt||{}), $gte: d };
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d)) { const end = new Date(d); end.setDate(end.getDate()+1); filtro.createdAt = { ...(filtro.createdAt||{}), $lt: end }; }
    }

    const doPopulate = canPopulateAluno();
    let itens;
    try{
      let q = AphAtendimento.find(filtro).sort({ createdAt: 1 });
      if (doPopulate) q = q.populate({ path: 'alunoId', select: 'nome' });
      itens = await q.lean();
    }catch{
      itens = await AphAtendimento.find(filtro).sort({ createdAt: 1 }).lean();
    }
    if (!Array.isArray(itens) || !itens.length){
      return res.status(404).send('Nenhum atendimento encontrado no período.');
    }

    const doc = new PDFDocument({ size:'A4', margins:{ top:36, left:32, right:32, bottom:40 } });
    const nome = `APH-Consolidado_${from||'inicio'}_a_${to||'atual'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    doc.pipe(res);

    const titulo = 'Relatório Consolidado de Atendimentos APH';
    const subtitulo = `Período: ${from || 'início'} até ${to || 'atual'} • Gerado em ${dtBR(new Date())}`;
    headerTema(doc, titulo, subtitulo);

    const usableW = doc.page.width - (doc.page.margins.left + doc.page.margins.right); // ~531
    const COLS = [
      { key:'data',   title:'Data',           w: 80, lineBreak:false },
      { key:'aluno',  title:'Aluno',          w: 90 },
      { key:'resp',   title:'Responsável',    w: 80 },
      { key:'local',  title:'Local',          w: 55 },
      { key:'tipos',  title:'Tipos',          w: 80 },
      { key:'mats',   title:'Materiais',      w: 80 },
      { key:'enc',    title:'Encaminhamento', w: 81 },
    ]; // soma ≈ 531

    const startX = doc.page.margins.left;
    let y = doc.y;

    function cabecalhoTabela(){
      doc.save().rect(startX, y, usableW, 20).fill(RUBI).restore();
      let x = startX;
      COLS.forEach(c=>{
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
           .text(c.title, x+6, y+5, { width: c.w-12, align:'left', lineBreak:false });
        x += c.w;
      });
      y += 24;
    }

    function linhaTabela(dados, zebra=false){
      const padX = 6, padY = 4;
      const alturas = COLS.map(c=>{
        const txt = String(dados[c.key] ?? '—');
        try{
          const opts = { width: c.w - padX*2, align:'left' };
          const h = c.lineBreak === false
            ? 10 + padY*2
            : Math.max(10, doc.heightOfString(txt, opts)) + padY*2;
          return Math.max(18, h);
        }catch{ return 18; }
      });
      const rowH = Math.max(18, ...alturas);

      if (y + rowH > doc.page.height - 50) {
        safeAddPage(doc, titulo, subtitulo);
        y = doc.y;
        cabecalhoTabela();
      }

      if (zebra) doc.save().rect(startX, y, usableW, rowH).fill('#f7efef').restore();
      doc.save().strokeColor('#e8e0e0').lineWidth(0.5)
         .moveTo(startX, y+rowH).lineTo(startX+usableW, y+rowH).stroke().restore();

      let x = startX;
      COLS.forEach(c=>{
        const txt = String(dados[c.key] ?? '—');
        const opts = { width: c.w - padX*2, align:'left' };
        doc.fillColor(PRETO).font('Helvetica').fontSize(10);
        if (c.lineBreak === false) doc.text(txt, x+padX, y+padY, { ...opts, lineBreak:false });
        else doc.text(txt, x+padX, y+padY, opts);
        x += c.w;
      });

      y += rowH;
    }

    cabecalhoTabela();
    itens.forEach((a, i)=>{
      const alunoNome = texto(a?.alunoId?.nome || a?.alunoNome || a?.aluno || a?.alunoId);
      const dados = {
        data: dtBR(a.createdAt),
        aluno: alunoNome,
        resp: texto(a.responsavel || a.criadoPor),
        local: texto(a.local),
        tipos: joinArr(a.tipos),
        mats: joinArr(a.materiais),
        enc: texto(a.encaminhamento),
      };
      linhaTabela(dados, i % 2 === 1);
    });

    if (y > doc.page.height - 80) {
      safeAddPage(doc, titulo, subtitulo);
      y = doc.y;
    }
    doc.font('Helvetica').fontSize(9).fillColor(CINZA_TEXTO)
       .text('Observação: textos longos são automaticamente quebrados e justificados para caber na página.', startX, y, { width: usableW });

    footerTema(doc);
    doc.end();
  }catch(err){
    console.error('pdf consolidado erro (fatal):', err);
    try{ res.status(500).send('Erro ao gerar PDF consolidado.'); }catch{}
  }
});

module.exports = router;
