'use strict';

const state = {
  tenant: new URLSearchParams(location.search).get('t') || localStorage.getItem('tenantSlug') || 'cmdpii',
  processos: [],
  processo: null,
  resultados: [],
  resultadoVinculo: null,
};

const qs = selector => document.querySelector(selector);
const byId = id => document.getElementById(id);

function withTenant(url) {
  const u = new URL(url, location.origin);
  if (state.tenant) u.searchParams.set('t', state.tenant);
  return u.pathname + u.search + u.hash;
}

function api(url) {
  const u = new URL(url, location.origin);
  if (state.tenant) u.searchParams.set('t', state.tenant);
  return u.pathname + u.search;
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function toast(message, type = 'ok') {
  const el = byId('toast');
  el.textContent = message;
  el.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 5500);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(api(url), {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.mensagem || payload.error || `Falha HTTP ${response.status}`);
  return payload;
}

function statusLabel(status) {
  return ({ APTO: 'Apto', NAO_APTO: 'Não apto', PENDENTE: 'Pendente' })[status] || status || '—';
}

function habilitacaoDisciplinarLabel(item) {
  if (!item?.criterios?.notaDisciplinarDisponivel) return 'Pendente';
  return item.criterios.notaDisciplinarMinima ? 'Habilitado' : 'Não habilitado';
}

function reasonLabel(code) {
  return ({
    MEDIA_GLOBAL_INFERIOR_A_8_5: 'Média global inferior a 8,5',
    DISCIPLINA_COM_MEDIA_SEMESTRAL_INFERIOR_A_8: 'Disciplina com média semestral inferior a 8,0',
    RECUPERACAO_NO_SEMESTRE: 'Recuperação identificada durante o semestre',
    DADOS_ACADEMICOS_INCOMPLETOS: 'Dados acadêmicos incompletos',
    ALUNO_NAO_LOCALIZADO_NO_AXORIIN: 'Aluno não localizado no Axoriin',
    NOTA_DISCIPLINAR_INDISPONIVEL: 'Nota disciplinar indisponível',
    NOTA_DISCIPLINAR_INFERIOR_A_7: 'Nota disciplinar inferior a 7,0',
    NENHUM_COMPONENTE_SELECIONADO: 'Nenhum componente foi selecionado para o cálculo',
  })[code] || code;
}

function setBusy(button, busy, text = 'Processando…') {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.original || button.textContent;
    button.disabled = false;
  }
}

function defaultDate(semester, year) {
  const y = Number(year) || new Date().getFullYear();
  return `${y}-${semester === 2 ? '12-31' : '06-30'}`;
}

async function loadUser() {
  let response = await fetch(withTenant('/auth/usuario-logado'), { credentials: 'include', cache: 'no-store' });
  if (!response.ok) response = await fetch(withTenant('/auth/me'), { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    location.href = withTenant('/login.html');
    return;
  }
  const user = await response.json();
  byId('userInfo').textContent = `${user.nome || 'Usuário'} · ${user.tipo || 'perfil'}`;
}

function renderProcessList() {
  const container = byId('processList');
  if (!state.processos.length) {
    container.innerHTML = '<div class="empty">Nenhuma apuração encontrada.</div>';
    return;
  }
  container.innerHTML = state.processos.map(item => `
    <article class="process-item ${state.processo?._id === item._id ? 'active' : ''}" data-process-id="${item._id}">
      <div class="process-item-top">
        <strong>${item.anoLetivo} · ${item.semestre}º semestre</strong>
        <span class="status-mini">${item.status}</span>
      </div>
      <small>${item.arquivo?.nomeOriginal || 'Arquivo sem nome'} · ${formatDate(item.createdAt)}</small>
      <small>${item.totais?.aptos || 0} aptos · ${item.totais?.pendentes || 0} pendentes</small>
    </article>
  `).join('');
  container.querySelectorAll('[data-process-id]').forEach(el => {
    el.addEventListener('click', () => selectProcess(el.dataset.processId));
  });
}

async function loadProcesses(selectLatest = false) {
  const payload = await fetchJson('/api/alamar/processos');
  state.processos = payload.processos || [];
  renderProcessList();
  if (selectLatest && state.processos[0]) await selectProcess(state.processos[0]._id);
}

function renderSummary() {
  const p = state.processo;
  byId('sumTotal').textContent = p?.totais?.importados || 0;
  byId('sumAptos').textContent = p?.totais?.aptos || 0;
  byId('sumNaoAptos').textContent = p?.totais?.naoAptos || 0;
  byId('sumPendentes').textContent = p?.totais?.pendentes || 0;
  byId('resultTitle').textContent = `${p.anoLetivo} · ${p.semestre}º semestre`;
  byId('resultMeta').textContent = `Referência disciplinar: ${formatDate(p.dataReferencia)} · Arquivos: ${p.arquivo?.nomeOriginal || '—'} · Classificação: média global dos componentes selecionados · Status: ${p.status}`;
  byId('btnCsv').href = api(`/api/alamar/processos/${p._id}/exportar.csv`);
  byId('btnXlsx').href = api(`/api/alamar/processos/${p._id}/exportar.xlsx`);
  byId('btnHomologate').disabled = p.status === 'homologado';
  byId('btnReprocess').disabled = p.status === 'homologado';

  const warnings = [...new Set([...(p.avisosImportacao || []), ...(state.resultados.flatMap(r => r.avisos || []))])];
  const box = byId('importWarnings');
  if (warnings.length) {
    box.innerHTML = `<strong>Avisos da apuração</strong><ul>${warnings.slice(0, 8).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}

function componentKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function collectComponents() {
  const map = new Map();
  const totalAlunos = state.resultados.length;

  state.resultados.forEach(resultado => {
    const presentes = new Set();
    (resultado.disciplinas || []).forEach(disciplina => {
      const nome = String(disciplina?.nome || '').trim();
      const chave = componentKey(disciplina?.chave || nome);
      if (!chave) return;
      presentes.add(chave);
      if (!map.has(chave)) {
        map.set(chave, { chave, nome, completos: 0, incompletos: 0, presentes: 0 });
      }
      const item = map.get(chave);
      item.presentes += 1;
      if (disciplina.dadosIncompletos) item.incompletos += 1;
      else item.completos += 1;
    });
  });

  map.forEach(item => {
    item.ausentes = Math.max(0, totalAlunos - item.presentes);
    item.incompletos += item.ausentes;
  });

  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function renderComponentSelector() {
  const container = byId('componentList');
  const button = byId('btnSaveComponents');
  if (!container || !button || !state.processo) return;

  const componentes = collectComponents();
  const excluidos = new Set((state.processo.componentesExcluidos || []).map(componentKey));
  if (!componentes.length) {
    container.innerHTML = '<div class="empty">Nenhum componente acadêmico detectado.</div>';
    button.disabled = true;
    return;
  }

  container.innerHTML = componentes.map(item => {
    const checked = !excluidos.has(item.chave);
    const detalhe = item.incompletos > 0
      ? `${item.incompletos} aluno(s) com dado incompleto`
      : `${item.completos} aluno(s) com dados completos`;
    return `
      <label class="component-option ${checked ? '' : 'ignored'}">
        <input type="checkbox" data-component-key="${escapeAttr(item.chave)}" ${checked ? 'checked' : ''} ${state.processo.status === 'homologado' ? 'disabled' : ''} />
        <span>
          <strong>${escapeHtml(item.nome)}</strong>
          <small>${escapeHtml(detalhe)} · <span class="component-state">${checked ? 'considerado' : 'ignorado'}</span></small>
        </span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('input[data-component-key]').forEach(input => {
    input.addEventListener('change', () => {
      const label = input.closest('.component-option');
      label?.classList.toggle('ignored', !input.checked);
      const stateLabel = label?.querySelector('.component-state');
      if (stateLabel) stateLabel.textContent = input.checked ? 'considerado' : 'ignorado';
    });
  });

  button.disabled = state.processo.status === 'homologado';
}

async function saveComponents() {
  if (!state.processo) return;
  const inputs = [...document.querySelectorAll('#componentList input[data-component-key]')];
  const selecionados = inputs.filter(input => input.checked);
  if (!selecionados.length) return toast('Selecione pelo menos um componente para o cálculo.', 'error');
  const componentesExcluidos = inputs.filter(input => !input.checked).map(input => input.dataset.componentKey);
  const button = byId('btnSaveComponents');
  setBusy(button, true, 'Recalculando…');
  try {
    await fetchJson(`/api/alamar/processos/${state.processo._id}/componentes`, {
      method: 'PATCH',
      body: JSON.stringify({ componentesExcluidos }),
    });
    toast('Componentes atualizados. A apuração foi recalculada.');
    await loadProcesses(false);
    await selectProcess(state.processo._id);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function renderFilters() {
  const turmas = [...new Set(state.resultados.map(r => r.turmaImportada).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  byId('filterTurma').innerHTML = '<option value="">Todas as turmas</option>' + turmas.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function filteredResults() {
  const q = byId('filterSearch').value.trim().toLowerCase();
  const status = byId('filterStatus').value;
  const turma = byId('filterTurma').value;
  return state.resultados.filter(item => {
    if (status && item.status !== status) return false;
    if (turma && item.turmaImportada !== turma) return false;
    if (q && !`${item.nomeImportado} ${item.matriculaImportada || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderResults() {
  const rows = filteredResults();
  const tbody = byId('resultBody');
  byId('tableEmpty').classList.toggle('hidden', rows.length > 0);
  tbody.innerHTML = rows.map(item => {
    const mainReason = (item.motivos || []).map(reasonLabel).join('; ') || 'Todos os critérios atendidos';
    const needsLink = item.vinculo?.status === 'pendente';
    return `
      <tr>
        <td>${item.posicaoGeral || '—'}</td>
        <td><span class="student-name">${escapeHtml(item.nomeImportado)}</span><span class="student-sub">${escapeHtml(mainReason)}</span></td>
        <td>${escapeHtml(item.turmaImportada || '—')}</td>
        <td>${formatNumber(item.mediaGlobal)}</td>
        <td>${formatNumber(item.menorMediaSemestral)}<span class="student-sub">${escapeHtml(item.disciplinaMenorMedia || '')}</span></td>
        <td class="${item.teveRecuperacao ? 'yes' : 'no'}">${item.teveRecuperacao ? 'SIM' : 'NÃO'}</td>
        <td>${formatNumber(item.notaDisciplinar)}<span class="student-sub">${habilitacaoDisciplinarLabel(item)}</span></td>
        <td><span class="badge ${item.status}">${statusLabel(item.status)}</span></td>
        <td class="no-print"><div class="row-actions">
          <button class="btn ghost" data-detail="${item._id}" type="button">Detalhes</button>
          ${needsLink ? `<button class="btn primary" data-link="${item._id}" type="button">Vincular</button>` : ''}
        </div></td>
      </tr>
    `;
  }).join('');
  tbody.querySelectorAll('[data-detail]').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.detail)));
  tbody.querySelectorAll('[data-link]').forEach(btn => btn.addEventListener('click', () => openLink(btn.dataset.link)));
}

async function selectProcess(id) {
  const [processPayload, resultPayload] = await Promise.all([
    fetchJson(`/api/alamar/processos/${id}`),
    fetchJson(`/api/alamar/processos/${id}/resultados?limit=2000`),
  ]);
  state.processo = processPayload.processo;
  state.resultados = resultPayload.resultados || [];
  byId('resultSection').classList.remove('hidden');
  renderProcessList();
  renderSummary();
  renderComponentSelector();
  renderFilters();
  renderResults();
  history.replaceState({}, '', withTenant(`/alamar.html?processo=${id}`));
  setTimeout(() => byId('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function openDetail(id) {
  const item = state.resultados.find(r => r._id === id);
  if (!item) return;
  byId('detailTitle').textContent = `${item.nomeImportado} · ${item.turmaImportada || 'Sem turma'}`;
  const reasons = (item.motivos || []).map(reasonLabel);
  byId('detailContent').innerHTML = `
    <div class="detail-summary">
      <div><small>Média global</small><strong>${formatNumber(item.mediaGlobal)}</strong></div>
      <div><small>Nota disciplinar</small><strong>${formatNumber(item.notaDisciplinar)}</strong></div>
      <div><small>Habilitação disciplinar</small><strong>${habilitacaoDisciplinarLabel(item).toUpperCase()}</strong></div>
      <div><small>Situação</small><strong>${statusLabel(item.status)}</strong></div>
    </div>
    ${reasons.length ? `<ul class="reason-list">${reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '<p class="no">Todos os critérios foram atendidos.</p>'}
    <table class="detail-table">
      <thead><tr><th>Disciplina</th><th>Notas do semestre</th><th>Média semestral</th><th>Recuperação</th></tr></thead>
      <tbody>${(item.disciplinas || []).map(d => `
        <tr class="${d.considerarNoCalculo === false ? 'ignored-component' : ''}">
          <td>${escapeHtml(d.nome)}${d.considerarNoCalculo === false ? '<span class="component-tag">IGNORADO</span>' : ''}</td>
          <td>${(d.notas || []).map(n => `${n.bimestre}º: ${formatNumber(n.valor)}`).join(' · ')}</td>
          <td>${formatNumber(d.mediaSemestral)}</td>
          <td class="${d.recuperacao ? 'yes' : 'no'}">${d.recuperacao ? 'SIM' : 'NÃO'}</td>
        </tr>`).join('')}</tbody>
    </table>
    <p class="muted">Somente os componentes marcados como considerados participam da média global, da média mínima e da verificação de recuperação.</p>
    <p class="muted">Nota disciplinar calculada até ${formatDate(item.dataNotaDisciplinar)}. É exigido o mínimo de 7,0 e essa nota não entra no cálculo da média global. Origem: ${escapeHtml(item.origemNotaDisciplinar || '—')}.</p>
  `;
  byId('detailDialog').showModal();
}

function openLink(id) {
  const item = state.resultados.find(r => r._id === id);
  if (!item) return;
  state.resultadoVinculo = item;
  byId('linkTitle').textContent = `Vincular ${item.nomeImportado}`;
  byId('linkSearch').value = item.nomeImportado;
  byId('linkCandidates').innerHTML = '';
  byId('linkDialog').showModal();
  searchCandidates();
}

async function searchCandidates() {
  if (!state.resultadoVinculo) return;
  const q = byId('linkSearch').value.trim();
  const turma = state.resultadoVinculo.turmaImportada || '';
  let payload = await fetchJson(`/api/alamar/alunos/buscar?q=${encodeURIComponent(q)}&turma=${encodeURIComponent(turma)}`);
  if (!(payload.alunos || []).length && turma) {
    payload = await fetchJson(`/api/alamar/alunos/buscar?q=${encodeURIComponent(q)}`);
  }
  const container = byId('linkCandidates');
  if (!(payload.alunos || []).length) {
    container.innerHTML = '<div class="empty">Nenhum aluno encontrado. Tente usar apenas parte do nome.</div>';
    return;
  }
  container.innerHTML = payload.alunos.map(a => `
    <article class="candidate"><div><strong>${escapeHtml(a.nome)}</strong><small>${escapeHtml(a.turma || 'Sem turma')} · comportamento atual ${formatNumber(a.comportamento)}</small></div><button class="btn primary" data-candidate="${a._id}" type="button">Selecionar</button></article>
  `).join('');
  container.querySelectorAll('[data-candidate]').forEach(btn => btn.addEventListener('click', () => linkCandidate(btn.dataset.candidate, btn)));
}

async function linkCandidate(alunoId, button) {
  setBusy(button, true, 'Vinculando…');
  try {
    await fetchJson(`/api/alamar/processos/${state.processo._id}/resultados/${state.resultadoVinculo._id}/vincular`, {
      method: 'PATCH', body: JSON.stringify({ alunoId }),
    });
    byId('linkDialog').close();
    toast('Aluno vinculado e resultado recalculado.');
    await selectProcess(state.processo._id);
    await loadProcesses(false);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function importFile(event) {
  event.preventDefault();
  const button = byId('btnImport');
  const files = [...byId('arquivo').files];
  if (!files.length) return toast('Selecione o arquivo de notas.', 'error');
  const form = new FormData();
  files.forEach(file => form.append('arquivos', file));
  form.append('anoLetivo', byId('anoLetivo').value);
  form.append('semestre', byId('semestre').value);
  form.append('dataReferencia', byId('dataReferencia').value);
  setBusy(button, true, 'Importando e calculando…');
  try {
    const payload = await fetchJson('/api/alamar/importar', { method: 'POST', body: form });
    toast(payload.mensagem || 'Apuração concluída.');
    byId('importForm').reset();
    initializeDates();
    await loadProcesses(false);
    await selectProcess(payload.processo._id);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function reprocess() {
  if (!state.processo) return;
  const button = byId('btnReprocess');
  setBusy(button, true, 'Reprocessando…');
  try {
    await fetchJson(`/api/alamar/processos/${state.processo._id}/reprocessar`, { method: 'POST', body: '{}' });
    toast('Apuração reprocessada com a habilitação disciplinar mínima de 7,0.');
    await loadProcesses(false);
    await selectProcess(state.processo._id);
  } catch (error) {
    toast(error.message, 'error');
  } finally { setBusy(button, false); }
}

async function homologate() {
  if (!state.processo) return;
  if (!confirm('Homologar esta apuração? Após a homologação, o processo não poderá ser alterado.')) return;
  const button = byId('btnHomologate');
  setBusy(button, true, 'Homologando…');
  try {
    await fetchJson(`/api/alamar/processos/${state.processo._id}/homologar`, { method: 'POST', body: '{}' });
    toast('Resultado homologado.');
    await loadProcesses(false);
    await selectProcess(state.processo._id);
  } catch (error) {
    toast(error.message, 'error');
  } finally { setBusy(button, false); }
}

function initializeDates() {
  const year = new Date().getFullYear();
  byId('anoLetivo').value = year;
  byId('semestre').value = new Date().getMonth() < 6 ? '1' : '2';
  byId('dataReferencia').value = defaultDate(Number(byId('semestre').value), year);
  updateTemplateLink();
}

function updateTemplateLink() {
  const semester = Number(byId('semestre').value) === 2 ? 2 : 1;
  byId('downloadTemplate').href = api(`/api/alamar/modelo.xlsx?semestre=${semester}`);
}

function bindEvents() {
  byId('backLink').href = withTenant('/painel.html');
  byId('importForm').addEventListener('submit', importFile);
  byId('btnReload').addEventListener('click', () => loadProcesses(false).catch(e => toast(e.message, 'error')));
  byId('semestre').addEventListener('change', () => {
    byId('dataReferencia').value = defaultDate(Number(byId('semestre').value), byId('anoLetivo').value);
    updateTemplateLink();
  });
  byId('anoLetivo').addEventListener('change', () => {
    byId('dataReferencia').value = defaultDate(Number(byId('semestre').value), byId('anoLetivo').value);
  });
  byId('arquivo').addEventListener('change', () => {
    const files = [...byId('arquivo').files];
    if (!files.length) {
      byId('fileLabel').textContent = 'Escolher CSV, XLSX ou PDFs';
    } else if (files.length === 1) {
      byId('fileLabel').textContent = files[0].name;
    } else {
      byId('fileLabel').textContent = `${files.length} arquivos selecionados: ${files.map(file => file.name).join(' + ')}`;
    }
  });
  ['filterSearch', 'filterStatus', 'filterTurma'].forEach(id => byId(id).addEventListener(id === 'filterSearch' ? 'input' : 'change', renderResults));
  byId('btnReprocess').addEventListener('click', reprocess);
  byId('btnSaveComponents').addEventListener('click', saveComponents);
  byId('btnSelectAllComponents').addEventListener('click', () => {
    document.querySelectorAll('#componentList input[data-component-key]:not(:disabled)').forEach(input => {
      input.checked = true;
      input.dispatchEvent(new Event('change'));
    });
  });
  byId('btnClearAllComponents').addEventListener('click', () => {
    document.querySelectorAll('#componentList input[data-component-key]:not(:disabled)').forEach(input => {
      input.checked = false;
      input.dispatchEvent(new Event('change'));
    });
  });
  byId('btnHomologate').addEventListener('click', homologate);
  byId('btnPrint').addEventListener('click', () => window.print());
  byId('btnHelp').addEventListener('click', () => byId('criteriaDialog').showModal());
  byId('btnLinkSearch').addEventListener('click', () => searchCandidates().catch(e => toast(e.message, 'error')));
  byId('linkSearch').addEventListener('keydown', event => { if (event.key === 'Enter') searchCandidates().catch(e => toast(e.message, 'error')); });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => byId(button.dataset.closeDialog).close()));
}

(async function init() {
  bindEvents();
  initializeDates();
  try {
    await loadUser();
    await loadProcesses(false);
    const requested = new URLSearchParams(location.search).get('processo');
    if (requested) await selectProcess(requested);
    else if (state.processos[0]) await selectProcess(state.processos[0]._id);
  } catch (error) {
    toast(error.message, 'error');
  }
})();
