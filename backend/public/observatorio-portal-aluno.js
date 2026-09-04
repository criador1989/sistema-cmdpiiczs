'use strict';

(() => {
  const $ = (sel) => document.querySelector(sel);

  const statusMeta = {
    nunca_acessou: ['Nunca acessou', 'red'],
    so_portal: ['Acessou o Portal', 'blue'],
    abriu_simulados: ['Abriu Simulados', 'yellow'],
    iniciou: ['Iniciou atividade', 'yellow'],
    em_andamento: ['Em andamento', 'yellow'],
    concluido: ['Concluiu revisão', 'green'],
  };

  let timer = null;
  let debounce = null;

  function tenant() {
    const qs = new URLSearchParams(location.search);
    return qs.get('t') || '';
  }

  function withTenant(url) {
    const t = tenant();
    if (!t) return url;
    const u = new URL(url, location.origin);
    u.searchParams.set('t', t);
    return u.pathname + u.search;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  function pct(n, total) {
    if (!total) return '0%';
    return `${Math.round((Number(n || 0) / total) * 100)}%`;
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(url) {
    const r = await fetch(withTenant(url), {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (r.status === 401) {
      location.href = withTenant('/login.html');
      throw new Error('Sessão expirada.');
    }

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.mensagem || `Erro HTTP ${r.status}`);
    return data;
  }

  function queryUrl() {
    const p = new URLSearchParams();
    const q = $('#fBusca').value.trim();
    const turma = $('#fTurma').value;
    const status = $('#fStatus').value;
    const periodo = $('#fPeriodo').value;
    if (q) p.set('q', q);
    if (turma) p.set('turma', turma);
    if (status) p.set('status', status);
    if (periodo) p.set('periodo', periodo);
    return `/api/admin/observatorio-portal-aluno/resumo?${p.toString()}`;
  }

  function renderMetricas(d) {
    const m = d.metricas || {};
    $('#mConta').textContent = m.alunosComConta ?? 0;
    $('#mPortal').textContent = m.acessaramPortal ?? 0;
    $('#mPortalPct').textContent = `${pct(m.acessaramPortal, m.alunosComConta)} dos alunos com conta`;
    $('#mNunca').textContent = m.nuncaAcessaram ?? 0;
    $('#m7d').textContent = m.acessaramUltimos7Dias ?? 0;
    $('#mSimulados').textContent = m.abriramSimulados ?? 0;
    $('#mIniciaram').textContent = m.iniciaramAtividade ?? 0;
    $('#mAndamento').textContent = m.emAndamento ?? 0;
    $('#mConcluiram').textContent = m.concluiramRevisao ?? 0;

    const a = d.alertas || {};
    $('#aNunca').textContent = a.nuncaAcessaram ?? 0;
    $('#aSemSimulados').textContent = a.acessaramSemSimulados ?? 0;
    $('#aSemIniciar').textContent = a.abriramSemIniciar ?? 0;
    $('#aAndamento').textContent = a.emAndamento ?? 0;

    $('#geradoEm').textContent = d.geradoEm ? `Atualizado em ${fmtDate(d.geradoEm)}` : '—';
  }

  function renderFunil(d) {
    const total = Number(d.metricas?.alunosComConta || 0);
    $('#funil').innerHTML = (d.funil || []).map((item) => `
      <div class="funnel-step">
        <span>${esc(item.rotulo)}</span>
        <strong>${Number(item.valor || 0)}</strong>
        <small>${pct(item.valor, total)}</small>
      </div>
    `).join('');
  }

  function renderTurmas(d) {
    const select = $('#fTurma');
    const atual = select.value;
    const options = ['<option value="">Todas as turmas</option>']
      .concat((d.filtros?.turmas || []).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`));
    select.innerHTML = options.join('');
    if ([...select.options].some((o) => o.value === atual)) select.value = atual;
  }

  function renderAlunos(d) {
    const alunos = d.alunos || [];
    $('#tableCount').textContent = `${alunos.length} aluno(s) exibido(s).`;

    if (!alunos.length) {
      $('#tbodyAlunos').innerHTML = '<tr><td colspan="7" class="empty">Nenhum aluno encontrado para estes filtros.</td></tr>';
      return;
    }

    $('#tbodyAlunos').innerHTML = alunos.map((a) => {
      const meta = statusMeta[a.status] || ['Sem status', 'blue'];
      const p = a.progressoAtual || {};
      const progresso = p.total
        ? `<div class="progress"><strong>${Number(p.revisadas || 0)}/${Number(p.total || 0)}</strong> <span class="muted">(${Number(p.percentual || 0)}%)</span><div class="progress-track"><i style="width:${Math.max(0, Math.min(100, Number(p.percentual || 0)))}%"></i></div>${p.titulo ? `<small class="muted">${esc(p.titulo)}</small>` : ''}</div>`
        : '<span class="muted">—</span>';

      const sim = a.simuladosIniciados
        ? `<strong>${Number(a.simuladosIniciados)}</strong> iniciado(s)<br><span class="muted">${Number(a.simuladosConcluidos || 0)} revisão(ões) concluída(s)</span>`
        : '<span class="muted">Não iniciou</span>';

      return `
        <tr>
          <td><span class="student-name">${esc(a.nome)}</span><span class="student-code">${esc(a.codigo || '')}</span></td>
          <td>${esc(a.turma || '—')}</td>
          <td><span class="badge ${meta[1]}">${meta[0]}</span></td>
          <td>${fmtDate(a.ultimoAcessoPortalEm)}${a.totalAcessosPortal ? `<br><span class="muted">${Number(a.totalAcessosPortal)} carregamento(s)</span>` : ''}</td>
          <td>${sim}</td>
          <td>${progresso}</td>
          <td>${fmtDate(a.ultimaAtividadeEm)}${a.ultimaAtividadeTipo ? `<br><span class="muted">${esc(a.ultimaAtividadeTipo.replaceAll('_',' '))}</span>` : ''}</td>
        </tr>`;
    }).join('');
  }

  function renderTimeline(d) {
    const itens = d.atividadeRecente || [];
    if (!itens.length) {
      $('#timeline').innerHTML = '<div class="empty">Nenhuma atividade registrada neste período.</div>';
      return;
    }

    $('#timeline').innerHTML = itens.map((ev) => `
      <div class="timeline-item">
        <div class="timeline-time">${fmtDate(ev.em)}</div>
        <div class="timeline-main">
          <strong>${esc(ev.nome)}</strong> <span>• ${esc(ev.turma || '—')}</span><br>
          <span>${esc(ev.rotulo || '')}${ev.simuladoTitulo ? ` — <strong>${esc(ev.simuladoTitulo)}</strong>` : ''}</span>
          ${ev.detalhe ? `<small>${esc(ev.detalhe)}</small>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function carregar({ silencioso = false } = {}) {
    const erro = $('#erro');
    if (!silencioso) $('#btnAtualizar').disabled = true;
    erro.hidden = true;

    try {
      const d = await fetchJson(queryUrl());
      renderMetricas(d);
      renderFunil(d);
      renderTurmas(d);
      renderAlunos(d);
      renderTimeline(d);
    } catch (e) {
      erro.textContent = e.message || 'Não foi possível carregar o Observatório.';
      erro.hidden = false;
    } finally {
      $('#btnAtualizar').disabled = false;
    }
  }

  function agendar() {
    clearInterval(timer);
    timer = setInterval(() => carregar({ silencioso: true }), 60000);
  }

  function atualizarComDebounce() {
    clearTimeout(debounce);
    debounce = setTimeout(() => carregar(), 300);
  }

  $('#btnVoltar').href = withTenant('/painel.html');
  $('#btnAtualizar').addEventListener('click', () => carregar());
  $('#fBusca').addEventListener('input', atualizarComDebounce);
  $('#fTurma').addEventListener('change', () => carregar());
  $('#fStatus').addEventListener('change', () => carregar());
  $('#fPeriodo').addEventListener('change', () => carregar());

  carregar();
  agendar();
})();
