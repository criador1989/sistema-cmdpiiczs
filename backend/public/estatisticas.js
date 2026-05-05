// public/relatorios.js (ou o JS da sua página de relatórios)

/* ================= Helpers ================= */
function isoToBR(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function qs(id){ return document.getElementById(id); }

async function fetchJsonSeguro(url, timeoutMs=10000){
  const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { credentials:'include', headers:{Accept:'application/json'}, cache:'no-store', signal:ctrl.signal });
    if(!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    const ct = r.headers.get('content-type')||'';
    if(!ct.includes('application/json')) throw new Error(`Resposta não-JSON em ${url}`);
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
  clearTimeout(el._t); el._t = setTimeout(()=>el.remove(), 7000);
}

/* ================ Estado dos gráficos (Chart.js) ================ */
let chartAlunosTurma = null;
let chartTiposNotif = null;
let chartCompMedio = null;

async function carregarEvolucaoComportamental(){
  const di = qs('dataInicio')?.value;
  const df = qs('dataFim')?.value;

  const params = new URLSearchParams();
  if(di) params.set('inicio', di);
  if(df) params.set('fim', df);

  const query = params.toString() ? `?${params.toString()}` : '';

  const evolucao = await fetchJsonSeguro(
    `/api/estatisticas-comportamento/evolucao-geral${query}`
  );

  const melhores = await fetchJsonSeguro(
    `/api/estatisticas-comportamento/ranking-evolucao${query}${query ? '&' : '?'}tipo=melhores&limite=10`
  );

  const quedas = await fetchJsonSeguro(
    `/api/estatisticas-comportamento/ranking-evolucao${query}${query ? '&' : '?'}tipo=piores&limite=10`
  );

  // 📈 LINHA DO TEMPO
  const labelsLinha = (evolucao.dados || []).map(d => d.periodo);
  const dataLinha = (evolucao.dados || []).map(d => d.mediaNota);

  new Chart(qs('chartEvolucaoComportamental'), {
    type: 'line',
    data: {
      labels: labelsLinha,
      datasets: [{
        label: 'Média de Comportamento',
        data: dataLinha,
        tension: 0.3
      }]
    }
  });

  // 🏆 MELHORES
  const labelsMelhores = (melhores.dados || []).map(d => d.alunoNome);
  const dataMelhores = (melhores.dados || []).map(d => d.variacao);

  new Chart(qs('chartRankingMelhores'), {
    type: 'bar',
    data: {
      labels: labelsMelhores,
      datasets: [{
        label: 'Evolução',
        data: dataMelhores
      }]
    }
  });

  // ⚠️ QUEDAS
  const labelsQuedas = (quedas.dados || []).map(d => d.alunoNome);
  const dataQuedas = (quedas.dados || []).map(d => Math.abs(d.variacao));

  new Chart(qs('chartRankingQuedas'), {
    type: 'bar',
    data: {
      labels: labelsQuedas,
      datasets: [{
        label: 'Queda',
        data: dataQuedas
      }]
    }
  });
}

/* ================ Carregamento de dados ================ */
async function carregarGraficos(){
  try{
    await carregarEvolucaoComportamental();
    setLoading(true);

    const di = document.getElementById('dataInicio')?.value;
    const df = document.getElementById('dataFim')?.value;
    const turma = document.getElementById('filtroTurma')?.value;

    const params = new URLSearchParams();
    if(di) params.set('inicio', di);
    if(df) params.set('fim', df);

    // 🚀 NOVO BACKEND
    const evolucao = await fetchJsonSeguro(
      '/api/estatisticas-comportamento/evolucao-geral?' + params.toString()
    );

    const distribuicao = await fetchJsonSeguro(
      '/api/estatisticas-comportamento/distribuicao-faixas?' + params.toString()
    );

    const turmas = await fetchJsonSeguro(
      '/api/estatisticas-comportamento/evolucao-turmas?' + params.toString()
    );

    // =========================
    // 📊 TRATAMENTO DOS DADOS
    // =========================

    const dadosLinha = (evolucao.dados || []).map(d => ({
      periodo: d.periodo,
      valor: d.mediaNota
    }));

    const dadosTurma = (turmas.dados || []).reduce((acc, item) => {
      const nome = item.turmaNome || '—';
      if(!acc[nome]) acc[nome] = [];
      acc[nome].push(item);
      return acc;
    }, {});

    const dadosDistribuicao = {};
    (distribuicao.dados || []).forEach(d => {
      dadosDistribuicao[d.faixa.toLowerCase()] = d.total;
    });

    // =========================
    // 🎨 DESENHAR GRÁFICOS
    // =========================

    drawLine(
      'chartComportamento',
      dadosLinha.map(d => ({ periodo: d.periodo, valor: d.valor })),
      'periodo',
      'valor'
    );

    drawDonut('chartDistribuicao', dadosDistribuicao);

    drawBars(
      'chartAlunosTurma',
      Object.keys(dadosTurma).map(t => ({
        turma: t,
        total: dadosTurma[t].length
      })),
      'turma',
      'total'
    );

  }catch(e){
    console.error(e);
    showError(e.message || 'Erro ao carregar dados');
  }finally{
    setLoading(false);
  }
}

/* ================ Desenho (Chart.js) ================ */
function desenharGraficos({ labelsTurma, dataTurma, labelsDist, dataDist, labelsComp, dataComp }){
  // Bar: Alunos por turma
  const c1 = qs('graficoAlunosTurma');
  if(c1){
    chartAlunosTurma?.destroy();
    chartAlunosTurma = new Chart(c1, {
      type: 'bar',
      data: {
        labels: labelsTurma,
        datasets: [{
          label: 'Quantidade de Alunos',
          data: dataTurma,
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Pie: Distribuição por faixas
  const c2 = qs('graficoTiposNotificacao');
  if(c2){
    chartTiposNotif?.destroy();
    chartTiposNotif = new Chart(c2, {
      type: 'pie',
      data: {
        labels: labelsDist,
        datasets: [{
          label: 'Distribuição de Notificações',
          data: dataDist,
        }]
      },
      options: { responsive: true }
    });
  }

  // Line: Comportamento médio por turma
  const c3 = qs('graficoComportamentoMedio');
  if(c3){
    chartCompMedio?.destroy();
    chartCompMedio = new Chart(c3, {
      type: 'line',
      data: {
        labels: labelsComp,
        datasets: [{
          label: 'Nota Média de Comportamento',
          data: dataComp,
          fill: false,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { suggestedMin: 0, suggestedMax: 10 } }
      }
    });
  }
}

/* ================ Exportação PDF ================ */
async function exportarPDF(){
  try{
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF) throw new Error('jsPDF não encontrado. Inclua o script da biblioteca.');
    const doc = new jsPDF();
    const charts = [
      { id: 'graficoAlunosTurma',       titulo: 'Alunos por Turma' },
      { id: 'graficoTiposNotificacao',  titulo: 'Distribuição por Faixas' },
      { id: 'graficoComportamentoMedio',titulo: 'Comportamento Médio por Turma' }
    ];

    let pageIndex = 0;
    for(const chart of charts){
      const cnv = qs(chart.id);
      if(!cnv) continue;
      const img = cnv.toDataURL('image/png', 1.0);
      if(pageIndex>0) doc.addPage();
      doc.setFontSize(14); doc.text(chart.titulo, 10, 16);
      doc.addImage(img, 'PNG', 10, 22, 190, 110);
      pageIndex++;
    }
    doc.save('relatorio_estatisticas.pdf');
  }catch(e){
    showError(e.message || 'Falha ao exportar PDF');
  }
}

/* ================ Boot ================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Se existirem filtros, ligamos os eventos
  const di = qs('dataInicio'), df = qs('dataFim'), turma = qs('filtroTurma'), btn = qs('btnFiltrar');
  if(btn) btn.addEventListener('click', carregarGraficos);
  di?.addEventListener('change', carregarGraficos);
  df?.addEventListener('change', carregarGraficos);
  turma?.addEventListener('change', carregarGraficos);

  // Carregar opcionalmente lista de turmas no select
  if(turma){
    try{
      const lista = await fetchJsonSeguro('/api/estatisticas/turmas');
      turma.innerHTML = `<option value="Todas">Todas</option>` + (lista||[]).map(t=>`<option>${t}</option>`).join('');
    }catch{ /* silencioso */ }
  }

  await carregarGraficos();
});

// Botão de PDF (se existir)
document.getElementById('btnExportarPDF')?.addEventListener('click', exportarPDF);
