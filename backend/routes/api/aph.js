// backend/routes/api/aph.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AphAtendimento = require('../../models/AphAtendimento'); // ajuste se o nome do arquivo/modelo diferir
const Aluno = require('../../models/Aluno');                    // usado no PDF para pegar nome/turma

// Helpers
const okId = (id) => mongoose.Types.ObjectId.isValid(id);
const arr  = (v) => Array.isArray(v) ? v.filter(Boolean).map(String) : [];

// Health
router.get('/health', (req, res) => res.json({ ok: true, scope: 'APH' }));

// CONTADOR por aluno
router.get('/atendimentos/count/:alunoId', async (req, res) => {
  try{
    if(!okId(req.params.alunoId)) return res.status(400).json({ message:'alunoId inválido' });
    const count = await AphAtendimento.countDocuments({ alunoId: req.params.alunoId });
    res.json({ count });
  }catch(e){
    console.error('APH COUNT erro:', e);
    res.status(500).json({ message: 'Falha ao contar atendimentos.' });
  }
});

// LISTAR por aluno
router.get('/atendimentos/:alunoId', async (req, res) => {
  try{
    const { alunoId } = req.params;
    if(!okId(alunoId)) return res.status(400).json({ message:'alunoId inválido' });
    const list = await AphAtendimento.find({ alunoId }).sort({ createdAt: -1 }).lean();
    res.json(list);
  }catch(e){
    console.error('APH LIST erro:', e);
    res.status(500).json({ message:'Falha ao listar atendimentos.' });
  }
});

// OBTER 1
router.get('/atendimento/:id', async (req, res) => {
  try{
    const { id } = req.params;
    if(!okId(id)) return res.status(400).json({ message:'id inválido' });
    const doc = await AphAtendimento.findById(id).lean();
    if(!doc) return res.status(404).json({ message:'Não encontrado' });
    res.json(doc);
  }catch(e){
    console.error('APH GET erro:', e);
    res.status(500).json({ message:'Falha ao obter atendimento.' });
  }
});

// CRIAR
router.post('/atendimentos', async (req, res) => {
  try{
    const {
      alunoId, responsavel='', local='', hora='',
      tipos=[], materiais=[], observacoes='',
      informados=false, meio='', encaminhamento=''
    } = req.body || {};
    if(!okId(alunoId)) return res.status(400).json({ message:'alunoId inválido' });

    const doc = await AphAtendimento.create({
      alunoId, responsavel, local, hora,
      tipos: arr(tipos), materiais: arr(materiais),
      observacoes, informados: !!informados, meio, encaminhamento,
      criadoPor: req.user?._id
    });

    res.status(201).json(doc);
  }catch(e){
    console.error('APH POST erro:', e);
    res.status(500).json({ message:'Falha ao salvar atendimento.' });
  }
});

// ATUALIZAR
router.put('/atendimentos/:id', async (req, res) => {
  try{
    const { id } = req.params;
    if(!okId(id)) return res.status(400).json({ message:'id inválido' });

    const update = {
      responsavel: req.body.responsavel ?? '',
      local:       req.body.local ?? '',
      hora:        req.body.hora ?? '',
      tipos:       arr(req.body.tipos),
      materiais:   arr(req.body.materiais),
      observacoes: req.body.observacoes ?? '',
      informados:  !!req.body.informados,
      meio:        req.body.meio ?? '',
      encaminhamento: req.body.encaminhamento ?? ''
    };

    const doc = await AphAtendimento.findByIdAndUpdate(id, update, { new:true }).lean();
    if(!doc) return res.status(404).json({ message:'Não encontrado' });
    res.json(doc);
  }catch(e){
    console.error('APH PUT erro:', e);
    res.status(500).json({ message:'Falha ao atualizar atendimento.' });
  }
});

// EXCLUIR
router.delete('/atendimento/:id', async (req, res) => {
  try{
    const { id } = req.params;
    if(!okId(id)) return res.status(400).json({ message:'id inválido' });
    const r = await AphAtendimento.findByIdAndDelete(id);
    if(!r) return res.status(404).json({ message:'Não encontrado' });
    res.json({ ok:true });
  }catch(e){
    console.error('APH DEL erro:', e);
    res.status(500).json({ message:'Falha ao excluir atendimento.' });
  }
});

// PDF (HTML imprimível com tema rubi + nome/turma do aluno)
router.get('/atendimento/:id/pdf', async (req, res) => {
  try{
    const { id } = req.params;
    if(!okId(id)) return res.status(400).send('ID inválido');

    const a = await AphAtendimento.findById(id).lean();
    if(!a) return res.status(404).send('Registro não encontrado');

    // busca nome/turma
    let alunoNome = '—', turma = '—';
    try{
      if(okId(a.alunoId)){
        const al = await Aluno.findById(a.alunoId).lean();
        if(al){ alunoNome = al.nome || alunoNome; turma = al.turma || turma; }
      }
    }catch{}

    const dtLabel = new Date(a.createdAt || Date.now()).toLocaleString('pt-BR');
    const esc = s => String(s||'').replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]));
    const chips = (xs=[]) => xs.map(t=>`<span class="chip">${esc(t)}</span>`).join('') || '—';
    const slug = (s='').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'atendimento';

    res.setHeader('Content-Disposition', `inline; filename="APH-${slug}-${new Date(a.createdAt||Date.now()).toISOString().slice(0,10)}.html"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>APH · ${esc(alunoNome)} · ${dtLabel}</title>
<style>
  :root{ --rubi-1:#8B0000; --rubi-2:#B22222; --rubi-3:#d82327; --gold:#E7C873; --text:#111; }
  @page { margin: 16mm; }
  @media print { .no-print{ display:none } }
  body{ font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:var(--text); margin:0; background:#fff; }
  .top{ background:linear-gradient(135deg,var(--rubi-1),var(--rubi-2)); color:#fff; padding:14px 18px; border-bottom:3px solid var(--gold); }
  .title{ margin:0; font-size:20px; font-weight:800 }
  .sub{opacity:.9}
  .wrap{ padding:18px }
  .kvs{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:12px 0 6px }
  .kv{ border:1px solid #e7e7e7; border-radius:10px; padding:10px; background:#fafafa }
  .kv b{ display:block; color:#444; font-size:12px; margin-bottom:4px }
  .chips{ display:flex; flex-wrap:wrap; gap:6px }
  .chip{ display:inline-block; border:1px solid #e1e1e1; border-radius:999px; padding:3px 8px; font-size:12px; background:#fff }
  .box{ border:1px solid #e7e7e7; border-radius:10px; padding:12px; margin:10px 0; background:#fff }
  .box h3{ margin:0 0 8px; color:#7a1111 }
  pre{ white-space:pre-wrap; font-family:inherit; margin:0 }
  .footer{ margin-top:8px; font-size:12px; color:#666 }
  .btn{ padding:8px 12px; border:1px solid #ccc; border-radius:8px; cursor:pointer; margin:12px 0 0 18px; background:#fff }
</style>
</head>
<body>
  <div class="no-print"><button class="btn" onclick="window.print()">Imprimir</button></div>
  <div class="top">
    <h1 class="title">APH · Atendimento de ${esc(alunoNome)}</h1>
    <div class="sub">Registrado em ${dtLabel} · Turma: ${esc(turma)}</div>
  </div>

  <div class="wrap">
    <div class="kvs">
      <div class="kv"><b>Aluno</b><div>${esc(alunoNome)}</div></div>
      <div class="kv"><b>Turma</b><div>${esc(turma)}</div></div>
      <div class="kv"><b>Responsável</b><div>${esc(a.responsavel || '—')}</div></div>
      <div class="kv"><b>Local · Hora</b><div>${esc(a.local || '—')} · ${esc(a.hora || '—')}</div></div>
    </div>

    <div class="box">
      <h3>Tipos de ocorrência</h3>
      <div class="chips">${chips(a.tipos)}</div>
    </div>

    <div class="box">
      <h3>Materiais & Procedimentos</h3>
      <div class="chips">${chips(a.materiais)}</div>
    </div>

    <div class="box">
      <h3>Relato / Observações</h3>
      <pre>${esc(a.observacoes || '—')}</pre>
    </div>

    <div class="box">
      <h3>Comunicação</h3>
      <div>Responsáveis informados: <b>${a.informados ? 'Sim' : 'Não'}</b></div>
      <div>Meio: <b>${esc(a.meio || '—')}</b></div>
      <div>Encaminhamento: <b>${esc(a.encaminhamento || '—')}</b></div>
    </div>

    <div class="footer">Gerado automaticamente · ${new Date().toLocaleString('pt-BR')}</div>
  </div>

  <script>setTimeout(()=>{ try{window.print()}catch{} }, 200);</script>
</body>
</html>`;
    res.send(html);
  }catch(e){
    console.error('APH PDF erro:', e);
    res.status(500).send('Falha ao gerar impressão.');
  }
});

module.exports = router;
