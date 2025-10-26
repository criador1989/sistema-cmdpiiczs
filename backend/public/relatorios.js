// public/relatorios.js

/* ================= Helpers ================= */
function isoToBR(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function brToISO(br){ if(!br) return ''; const [d,m,y]=br.split('/').map(Number); if(!d||!m||!y) return ''; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function qs(id){ return document.getElementById(id); }
function fmtISODate(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

/* ===== Canvas: medição e quebra de rótulo ===== */
function wrapLabel(ctx, text, maxWidth, baseFontSize=12, minFontSize=9, maxLines=3){
  text = String(text||'');
  let fontSize = baseFontSize;
  let lines = [text];

  // tenta quebrar por espaços respeitando largura
  const fit = (fs) => {
    ctx.font = `${fs}px Segoe UI`;
    const words = text.split(' ');
    const lns = [];
    let line = '';
    for(const w of words){
      const test = line ? (line+' '+w) : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lns.push(line);
        line = w;
      }
    }
    if (line) lns.push(line);
    return lns;
  };

  while (fontSize >= minFontSize) {
    lines = fit(fontSize);
    if (lines.length <= maxLines) break;
    fontSize -= 1;
  }

  // se ainda passou do máximo de linhas, junta resto na última
  if (lines.length > maxLines) {
    const last = lines.slice(maxLines-1).join(' ');
    lines = lines.slice(0, maxLines-1).concat(last);
  }

  return { lines, fontSize };
}

async function fetchJsonSeguro(url, timeoutMs=10000){
  const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { credentials:'include', headers:{Accept:'application/json'}, cache:'no-store', signal:ctrl.signal });
    if(!r.ok){
      let t=''; try{ t=await r.text(); }catch{}
      throw new Error(`HTTP ${r.status} em ${url} — ${t.slice(0,120)}`);
    }
    const ct = r.headers.get('content-type')||'';
    if(!ct.includes('application/json')){
      let t=''; try{ t=await r.text(); }catch{}
      throw new Error(`Resposta não-JSON em ${url}: ${t.slice(0,120)}`);
    }
    return r.json();
  } finally { clearTimeout(to); }
}

function showError(msg){
  let el = qs('errBanner');
  if(!el){
    el = document.createElement('div');
    el.id = 'errBanner';
    el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;padding:12px 14px;border-radius:10px;background:#5f1212;color:#fff;border:1px solid rgba(255,255,255,.25);box-shadow:0 10px 20px rgba(0,0,0,.4);z-index:9999;font:14px/1.3 system-ui';
    document.body.appendChild(el);
  }
  el.textContent = `Erro: ${msg}`;
  clearTimeout(el._t); el._t = setTimeout(()=>el.remove(), 8000);
}

/* ================ Desenho básico em canvas (sem Chart.js) ================ */
function drawBars(canvasId, itens, labelKey, valueKey, maxY=10){
  const c = qs(canvasId); if(!c) return;
  const ctx = c.getContext('2d'); const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);

  if(!Array.isArray(itens) || itens.length===0){
    ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='14px Segoe UI'; ctx.fillText('Sem dados', 18, 24);
    return;
  }

  const padding=44, gw=W-padding*2, gh=H-padding*2;
  ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padding,padding); ctx.lineTo(padding,H-padding); ctx.lineTo(W-padding,H-padding); ctx.stroke();

  const vals = itens.map(x => Number(x[valueKey])||0);
  const maxVal = Math.max(maxY, ...vals);
  const barW = gw/(itens.length*1.6);

  itens.forEach((d,i)=>{
    const v = Number(d[valueKey])||0;
    const h = (v/maxVal)*gh;
    const x = padding + i*(barW*1.6) + barW*0.3;
    const y = H - padding - h;

    const grad = ctx.createLinearGradient(0,y,0,y+h);
    grad.addColorStop(0,'#d64545'); grad.addColorStop(1,'#8B0000');
    ctx.fillStyle = grad;
    ctx.fillRect(x,y,barW,h);

    // valor
    ctx.fillStyle='rgba(255,255,255,.9)'; ctx.textAlign='center';
    ctx.font='12px Segoe UI';
    const valStr = (v % 1 === 0 ? v.toString() : v.toFixed(1)).replace('.',',');
    ctx.fillText(valStr, x+barW/2, y-6);

    // rótulo com quebra automática (SEM reticências)
    const avail = barW * 1.25; // deixa um pouco mais de largura virtual p/ quebrar melhor
    const { lines, fontSize } = wrapLabel(ctx, String(d[labelKey]||''), avail, 12, 9, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle='rgba(255,255,255,.92)';
    ctx.font = `${fontSize}px Segoe UI`;

    let yy = H - padding + 16;
    lines.forEach(line => {
      ctx.fillText(line, x + barW/2, yy);
      yy += fontSize + 2;
    });
  });
}

function drawLine(canvasId, itens, labelKey, valueKey){
  const c = qs(canvasId); if(!c) return;
  const ctx = c.getContext('2d'); const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);

  if(!Array.isArray(itens) || itens.length===0){
    ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='14px Segoe UI'; ctx.fillText('Sem dados', 18, 24);
    return;
  }

  const padding=44, gw=W-padding*2, gh=H-padding*2;
  ctx.strokeStyle='rgba(255,255,255,.28)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(padding,padding); ctx.lineTo(padding,H-padding); ctx.lineTo(W-padding,H-padding); ctx.stroke();

  const vals = itens.map(x => Number(x[valueKey])||0);
  const maxVal = Math.max(1, ...vals);
  const stepX = gw/(Math.max(1,itens.length-1));

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#B22222';
  ctx.beginPath();

  itens.forEach((d,i)=>{
    const v = Number(d[valueKey])||0;
    const x = padding + i*stepX;
    const y = H - ( (v/maxVal)*gh ) - padding;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // pontos + rótulos (com quebra curta)
  itens.forEach((d,i)=>{
    const v = Number(d[valueKey])||0;
    const x = padding + i*stepX;
    const y = H - ( (v/maxVal)*gh ) - padding;
    ctx.fillStyle='#8B0000';
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();

    ctx.fillStyle='rgba(255,255,255,.9)';
    ctx.font='12px Segoe UI'; ctx.textAlign='center';
    ctx.fillText(String(v), x, y-8);

    const { lines, fontSize } = wrapLabel(ctx, String(d[labelKey]||''), 70, 11, 9, 2);
    ctx.font = `${fontSize}px Segoe UI`;
    let yy = H - padding + 16;
    lines.forEach(line => { ctx.fillText(line, x, yy); yy += fontSize + 2; });
  });
}

function drawDonut(canvasId, mapa){
  const c = qs(canvasId); if(!c) return;
  const ctx = c.getContext('2d'); const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);

  const items = [
    {name:'Excepcional', value:mapa.excepcional||mapa.exc||0, color:'#22c55e'},
    {name:'Ótimo',       value:mapa.otimo||mapa.oti||0,       color:'#3b82f6'},
    {name:'Bom',         value:mapa.bom||0,                   color:'#f59e0b'},
    {name:'Regular',     value:mapa.regular||mapa.reg||0,     color:'#ef4444'},
    {name:'Insuficiente',value:mapa.insuficiente||mapa.ins||0,color:'#dc2626'},
    {name:'Incompatível',value:mapa.incompativel||mapa.inc||0,color:'#7f1d1d'},
  ].filter(i=>i.value>0);

  if(items.length===0){
    ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='14px Segoe UI'; ctx.fillText('Sem dados', 18, 24);
    return;
  }

  const total = items.reduce((s,i)=>s+i.value,0) || 1;
  const cx=W/2, cy=H/2, r=Math.min(W,H)/3, ir=r*0.6;
  let start=-Math.PI/2;

  items.forEach(d=>{
    const ang=(d.value/total)*Math.PI*2; const end=start+ang;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
    ctx.fillStyle=d.color; ctx.fill(); start=end;
  });

  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';

  ctx.font='12px Segoe UI'; ctx.fillStyle='rgba(255,255,255,.92)';
  items.forEach((d,i)=>{ const y=20+i*18; ctx.fillStyle=d.color; ctx.fillRect(W-170,y-10,10,10); ctx.fillStyle='rgba(255,255,255,.92)'; ctx.fillText(`${d.name}: ${d.value}`, W-154, y); });
}

/* ================ Turmas (select) ================ */
async function carregarTurmas(){
  try{
    const lista = await fetchJsonSeguro('/api/estatisticas/turmas');
    const sel = qs('filtroTurma');
    if(!sel) return;
    const atual = sel.value || 'Todas';
    sel.innerHTML = '<option value="Todas">Todas</option>';
    if(Array.isArray(lista)){
      lista.forEach(t=>{
        if(!t) return;
        const opt = document.createElement('option'); opt.value=t; opt.textContent=t; sel.appendChild(opt);
      });
    }
    sel.value = atual;
  }catch(e){ console.warn(e); showError('Falha ao carregar turmas'); }
}

/* ================ NOTIFICAÇÕES ================ */
async function carregarDadosNotificacoes(){
  try{
    const inicioISO = qs('dataInicio')?.value || '';
    const fimISO    = qs('dataFim')?.value || '';
    const turma     = qs('filtroTurma')?.value || 'Todas';

    const p = new URLSearchParams();
    if(inicioISO) p.set('inicio', isoToBR(inicioISO));
    if(fimISO)    p.set('fim',    isoToBR(fimISO));
    if(turma)     p.set('turma',  turma);

    const alunosPorTurma = await fetchJsonSeguro('/api/estatisticas/alunos-por-turma' + (p.toString()?`?${p}`:''), 12000);
    drawBars('chartAlunosTurma', alunosPorTurma || [], 'turma', 'total', Math.max(10, ...((alunosPorTurma||[]).map(x=>x.total||0))));

    const comp = await fetchJsonSeguro('/api/estatisticas/comportamento-por-turma', 12000);
    drawBars('chartComportamento', comp || [], 'turma', 'media', 10);

    const dist = await fetchJsonSeguro('/api/estatisticas/distribuicao', 12000);
    drawDonut('chartDistribuicao', dist || {exc:0,oti:0,bom:0,reg:0,ins:0,inc:0});
  }catch(e){
    console.error(e); showError(e.message || 'Falha ao carregar estatísticas de Notificações');
  }
}

/* ================ APH ================ */
function ordPorMesAsc(arr){ return [...(arr||[])].sort((a,b)=> (a._id||'').localeCompare(b._id||'')); }

async function carregarDadosAPH(){
  try{
    const fromISO = qs('dataInicio')?.value || '';
    const toISO   = qs('dataFim')?.value   || '';
    const turma   = qs('filtroTurma')?.value;

    const p = new URLSearchParams();
    if(fromISO) p.set('from', fromISO);
    if(toISO)   p.set('to',   toISO);
    if(turma && turma !== 'Todas') p.set('turma', turma);

    const j = await fetchJsonSeguro('/api/aph/estatisticas' + (p.toString() ? `?${p.toString()}` : ''), 15000);

    drawBars('aphTipo',      j.porTipo || [],        '_id', 'total', Math.max(5, ...((j.porTipo||[]).map(x=>x.total||0))));
    drawBars('aphMateriais', j.porMaterial || [],    '_id', 'total', Math.max(5, ...((j.porMaterial||[]).map(x=>x.total||0))));
    drawBars('aphEnc',       j.porEncaminhamento||[],'_id', 'total', Math.max(5, ...((j.porEncaminhamento||[]).map(x=>x.total||0))));
    drawBars('aphLocal',     j.porLocal || [],       '_id', 'total', Math.max(5, ...((j.porLocal||[]).map(x=>x.total||0))));
    drawBars('aphTurma',     j.porTurma || [],       '_id', 'total', Math.max(5, ...((j.porTurma||[]).map(x=>x.total||0))));
    drawBars('aphTurno',     j.porTurno || [],       '_id', 'total', Math.max(5, ...((j.porTurno||[]).map(x=>x.total||0))));
    drawBars('aphResp',      j.porResponsavel || [], '_id', 'total', Math.max(5, ...((j.porResponsavel||[]).map(x=>x.total||0))));

    const mesOrd = ordPorMesAsc(j.porMes || []);
    drawLine('aphMes', mesOrd, '_id', 'total');

  }catch(e){
    console.error(e); showError(e.message || 'Falha ao carregar estatísticas de APH');
    ['aphTipo','aphMateriais','aphEnc','aphLocal','aphMes','aphTurma','aphTurno','aphResp'].forEach(id=>{
      const c=qs(id); if(c){ const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); }
    });
  }
}

/* ================ Exportação PDF (captura dos gráficos da tela) ================ */
function exportarPDF(){
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF){ showError('Biblioteca jsPDF não encontrada.'); return; }

  const doc = new jsPDF();
  const mapas = [
    // NOTIFICAÇÕES
    { id:'chartAlunosTurma',      titulo:'Alunos por turma' },
    { id:'chartComportamento',    titulo:'Comportamento médio por turma' },
    { id:'chartDistribuicao',     titulo:'Distribuição por faixa (comportamento)' },
    // APH
    { id:'aphTipo',               titulo:'APH • Ocorrências por tipo' },
    { id:'aphMateriais',          titulo:'APH • Materiais utilizados' },
    { id:'aphEnc',                titulo:'APH • Encaminhamentos' },
    { id:'aphLocal',              titulo:'APH • Locais' },
    { id:'aphMes',                titulo:'APH • Evolução mensal' },
    { id:'aphTurma',              titulo:'APH • Por turma' },
    { id:'aphTurno',              titulo:'APH • Por turno' },
    { id:'aphResp',               titulo:'APH • Atendimentos por responsável' },
  ];

  let pageIndex = 0;
  mapas.forEach(m=>{
    const cnv = qs(m.id);
    if(!cnv) return;
    const img = cnv.toDataURL('image/png', 1.0);
    if(pageIndex>0) doc.addPage();
    doc.setFontSize(16); doc.text(m.titulo, 10, 18);
    doc.addImage(img, 'PNG', 10, 26, 180, 110);
    pageIndex++;
  });

  doc.save('relatorios.pdf');
}

/* ================ PDF Consolidado (APH - backend) ================ */
async function gerarPdfConsolidadoAPH(){
  try{
    let fromISO = qs('dataInicio')?.value || '';
    let toISO   = qs('dataFim')?.value   || '';

    if(!fromISO || !toISO){
      const hoje = new Date();
      const de = new Date(hoje); de.setDate(hoje.getDate() - 30);
      fromISO = fmtISODate(de);
      toISO   = fmtISODate(hoje);
    }

    const url = `/api/aph/pdf-consolidado?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;

    const r = await fetch(url, { credentials:'include', cache:'no-store' });
    if(!r.ok){
      const t = await r.text().catch(()=> '');
      if(r.status===404){ showError('Nenhum atendimento encontrado no período.'); return; }
      throw new Error(`Falha ao gerar PDF (${r.status}) — ${t.slice(0,120)}`);
    }
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `APH-Consolidado_${fromISO}_a_${toISO}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(blobUrl), 5000);
  }catch(e){
    console.error(e);
    showError(e.message || 'Erro ao gerar PDF consolidado do APH.');
  }
}

/* ================ Sessão e Diagnóstico ================= */
async function checarSessaoEPing(){
  try{
    const me = await fetch('/api/usuario', { credentials:'include', cache:'no-store' });
    if (me.status === 401 || me.status === 403) { location.href = './login.html'; return false; }
    if (!me.ok) { showError('Falha ao validar sessão (usuario).'); return false; }
  }catch{ showError('Falha de rede ao validar sessão.'); return false; }

  try{
    const ping = await fetch('/api/estatisticas/ping', { credentials:'include', cache:'no-store' });
    if (!ping.ok) { showError('Falha no endpoint de estatísticas.'); return false; }
  }catch{ showError('Falha de rede ao acessar estatísticas.'); return false; }

  return true;
}

/* ================ Eventos & Boot ================= */
function wireEventos(){
  const btn = qs('btnFiltrar');
  const di  = qs('dataInicio');
  const df  = qs('dataFim');
  const turma = qs('filtroTurma');

  async function aplicar(){
    await carregarDadosNotificacoes();
    await carregarDadosAPH();
  }

  btn?.addEventListener('click', aplicar);
  di?.addEventListener('change', aplicar);
  df?.addEventListener('change', aplicar);
  turma?.addEventListener('change', aplicar);
}

async function logout(){
  try{ await fetch('/auth/logout',{method:'POST',credentials:'include'}); }catch{}
  location.href = './login.html';
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const ok = await checarSessaoEPing();
  if(!ok) return;

  await carregarTurmas();
  wireEventos();

  await carregarDadosNotificacoes();
  await carregarDadosAPH();
});

window.exportarPDF = exportarPDF;
window.gerarPdfConsolidadoAPH = gerarPdfConsolidadoAPH;
window.logout = logout;
