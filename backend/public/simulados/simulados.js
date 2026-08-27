'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  bootstrap: null,
  simulados: [],
  current: null,
  importacao: null,
  substituicao: null,
  importacoesPendentes: [],
  dashboard: null,
  comparacao: null,
  currentTotalResults: 0,
  resultPage: 1,
  resultPages: 1,
  searchTimer: null,
  omrSaveQueue: Promise.resolve(),
  omrSavesPending: 0,
  processedLanguageResults: [],
  processedParticipationResults: [],
  processamentosOmr: [],
  omrPollId: null,
  omrPollPromise: null,
  dashboardRequestKey: null,
  dashboardRequestPromise: null,
  dashboardRequestSeq: 0,
  dashboardLastSuccessKey: null,
};

function aplicarImportacao(payload) {
  state.importacao = payload?.importacao || null;
  state.substituicao = payload?.substituicao || null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function fmt(value, casas = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '0,0';
}

function pct(value) { return `${fmt(value, 1)}%`; }
function text(value) { return String(value ?? '').trim(); }
function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '—';
}
function storageKey(suffix) {
  const tenant = new URLSearchParams(location.search).get('t') || 'padrao';
  return `axoriin.simulados.${tenant}.${suffix}`;
}
function remember(suffix, value) {
  try {
    if (value) localStorage.setItem(storageKey(suffix), String(value));
    else localStorage.removeItem(storageKey(suffix));
  } catch {}
}
function recalled(suffix) {
  try { return localStorage.getItem(storageKey(suffix)) || ''; } catch { return ''; }
}
function safeDataImage(value) {
  const source = text(value);
  return /^data:image\/jpeg;base64,[a-z0-9+/=\r\n]+$/i.test(source) ? source : '';
}

function roleLabel(value) {
  const role = text(value).toLowerCase();
  if (role === 'professor') return 'Professor';
  if (['admin', 'master', 'superadmin'].includes(role)) return 'Gestão pedagógica';
  return role || 'Usuário';
}

function statusLabel(value) {
  return ({ rascunho: 'Rascunho', matriz_pronta: 'Matriz pronta', com_resultados: 'Com resultados', finalizado: 'Finalizado', arquivado: 'Arquivado' })[value] || value;
}

function levelLabel(value) {
  return ({ critico: 'Crítico', prioridade_alta: 'Prioridade alta', em_atencao: 'Em atenção', consolidado: 'Consolidado', em_desenvolvimento: 'Em desenvolvimento', prioritario: 'Prioritário', participacao_parcial: 'Participação parcial', evidencia_insuficiente: 'Base incompleta' })[value] || '—';
}

function enemAreaShort(value) {
  return ({ LINGUAGENS: 'LC', MATEMATICA: 'MAT', NATUREZA: 'CN', HUMANAS: 'CH' })[text(value).toUpperCase()] || text(value).toUpperCase();
}

function enemMetricLabel(item) {
  if (!item) return '';
  const codigo = text(item.codigo || item.habilidadeCodigo);
  const descricao = text(item.descricao || item.habilidadeDescricao || item.rotulo);
  const prefixo = item.areaCodigo && codigo ? `${enemAreaShort(item.areaCodigo)}-${codigo}` : codigo;
  return prefixo ? `${prefixo} - ${descricao}` : descricao;
}

function languageLabel(value) {
  return ({ INGLES: 'Inglês', ESPANHOL: 'Espanhol', NAO_APLICAVEL: 'Não aplicável', NAO_MARCADO: 'Não marcou a língua', NAO_INFORMADO: 'Pendente' })[value] || 'Pendente';
}

function currentHasLanguage() {
  if (typeof state.current?.possuiIdioma === 'boolean') return state.current.possuiIdioma;
  return (state.current?.questoes || []).some((question) =>
    (question.variantes || []).some((variant) => ['INGLES', 'ESPANHOL'].includes(variant.codigo)));
}

function rowHasLanguage(row) {
  if (!row?.dia) return currentHasLanguage();
  return (state.current?.questoes || []).some((question) =>
    Number(question.dia || 1) === Number(row.dia)
    && (question.variantes || []).some((variant) => ['INGLES', 'ESPANHOL'].includes(variant.codigo)));
}

function linkWithTenant(path) {
  const tenant = new URLSearchParams(location.search).get('t');
  if (!tenant) return path;
  const url = new URL(path, location.origin);
  url.searchParams.set('t', tenant);
  return `${url.pathname}${url.search}`;
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.mensagem || 'Não foi possível concluir a operação.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function setLoading(active, message = 'Processando…') {
  $('#loadingText').textContent = message;
  $('#loadingOverlay').hidden = !active;
}


function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function omrProgressMessage(importacao) {
  const progresso = importacao?.progressoOmr || {};
  const etapa = text(progresso.etapa).toLowerCase();
  const feitas = Number(progresso.paginasProcessadas || 0);
  const total = Number(progresso.paginasTotal || 0);
  const percentual = Number(progresso.percentual || 0);
  if (etapa === 'fila') return 'PDF recebido. Aguardando a vez da leitura óptica…';
  if (etapa === 'preparando') return total ? `Preparando ${total} página(s) para leitura…` : 'Preparando o PDF para leitura óptica…';
  if (etapa === 'finalizando') return `Finalizando a conferência OMR${total ? ` — ${total} de ${total} páginas` : ''}…`;
  if (total) return `Lendo cartões: ${feitas} de ${total} páginas (${fmt(percentual, 0)}%)…`;
  return 'Lendo a imagem de cada cartão-resposta…';
}

async function monitorOmrProcess(importacaoId) {
  if (!state.current || !importacaoId) return null;
  if (state.omrPollId === String(importacaoId) && state.omrPollPromise) return state.omrPollPromise;

  state.omrPollId = String(importacaoId);
  const executar = async () => {
    let falhasConsecutivas = 0;
    setLoading(true, 'Acompanhando a leitura óptica…');
    try {
      while (state.current && state.omrPollId === String(importacaoId)) {
        try {
          const response = await api(`/api/simulados/${state.current._id}/importacoes/${importacaoId}`);
          falhasConsecutivas = 0;
          const item = response.importacao;
          if (!item) throw new Error('O processamento OMR não pôde ser localizado.');

          if (item.status === 'analisando') {
            setLoading(true, omrProgressMessage(item));
            await sleep(2200);
            continue;
          }

          if (item.status === 'erro') {
            const finalError = new Error(item.erro || 'A leitura óptica não pôde ser concluída.');
            finalError.omrFinal = true;
            throw finalError;
          }
          if (item.status === 'cancelada') {
            const finalError = new Error('A leitura óptica foi cancelada.');
            finalError.omrFinal = true;
            throw finalError;
          }
          if (item.status !== 'analisada') {
            const finalError = new Error(`A leitura óptica terminou em um estado inesperado: ${item.status}.`);
            finalError.omrFinal = true;
            throw finalError;
          }

          aplicarImportacao(response);
          remember('ultimaImportacao', item._id);
          renderImport(false);
          await loadPendingImports({ restoreLatest: false, monitorActive: false });
          await loadSimulados();
          toast(`${item.linhas?.length || item.totais?.linhas || 0} cartão(ões) lido(s). Agora confira alunos e marcações sinalizadas.`);
          return response;
        } catch (error) {
          if (error?.omrFinal || (error?.status && error.status < 500)) throw error;
          falhasConsecutivas += 1;
          if (falhasConsecutivas >= 5) throw error;
          setLoading(true, `Leitura em andamento. Reconectando ao servidor (${falhasConsecutivas}/5)…`);
          await sleep(3000);
        }
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  state.omrPollPromise = executar().finally(() => {
    if (state.omrPollId === String(importacaoId)) state.omrPollId = null;
    state.omrPollPromise = null;
  });
  return state.omrPollPromise;
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('#toastStack').appendChild(item);
  setTimeout(() => item.remove(), 4500);
}

function showConnection(message) {
  $('#connectionBanner').textContent = message;
  $('#connectionBanner').hidden = false;
}

function hideConnection() { $('#connectionBanner').hidden = true; }

function setView(name) {
  if (name !== 'lista' && !state.current) {
    toast('Selecione um simulado primeiro.', 'warning');
    name = 'lista';
  }
  $$('.view').forEach((item) => item.classList.toggle('active', item.id === `view-${name}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  const titles = {
    lista: 'Simulados que orientam a intervenção.',
    matriz: 'Questões transformadas em evidência pedagógica.',
    importacao: 'Conferência antes do diagnóstico.',
    diagnostico: 'Do resultado à ação direcionada.',
  };
  $('#pageTitle').textContent = titles[name] || titles.lista;
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'matriz') renderMatrix();
  if (name === 'diagnostico') loadDashboard();
}

async function loadBootstrap() {
  const payload = await api('/api/simulados/bootstrap');
  state.bootstrap = payload;
  $('#userName').textContent = payload.usuario.nome || 'Usuário';
  $('#userRole').textContent = roleLabel(payload.usuario.tipo);
  $('#userAvatar').textContent = (payload.usuario.nome || 'A').slice(0, 1).toUpperCase();
  $$('.gestao-only').forEach((item) => { item.hidden = !payload.permissoes.gestao; });
  $('#createYear').value = payload.anoAtual;
  $('#createClasses').innerHTML = payload.turmas.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  populateDashboardClasses();
}

function populateYears() {
  const select = $('#filterYear');
  const current = select.value;
  const years = [...new Set(state.simulados.map((item) => item.anoLetivo))].sort((a, b) => b - a);
  select.innerHTML = '<option value="">Todos</option>' + years.map((item) => `<option value="${item}">${item}</option>`).join('');
  if (years.includes(Number(current))) select.value = current;
}

async function loadSimulados() {
  try {
    const year = $('#filterYear')?.value || '';
    const payload = await api(`/api/simulados${year ? `?anoLetivo=${encodeURIComponent(year)}` : ''}`);
    state.simulados = payload.simulados || [];
    populateYears();
    renderSimulados();
    hideConnection();
  } catch (error) {
    showConnection(error.message);
    throw error;
  }
}

function renderSimulados() {
  const list = $('#simuladosList');
  const items = state.simulados;
  $('#metricSimulados').textContent = items.length;
  $('#metricComResultados').textContent = items.filter((item) => item.resultados > 0).length;
  $('#metricParticipacoes').textContent = items.reduce((total, item) => total + Number(item.resultados || 0), 0).toLocaleString('pt-BR');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><b>Nenhum simulado neste filtro.</b>${state.bootstrap?.permissoes?.gestao ? 'Crie o primeiro simulado para começar.' : 'A gestão ainda não disponibilizou resultados para suas turmas.'}</div>`;
    return;
  }
  list.innerHTML = items.map((item) => {
    const ready = item.resultados > 0;
    const selected = String(state.current?._id || '') === String(item._id);
    return `<article class="simulado-card ${selected ? 'active' : ''}" data-simulado-id="${escapeHtml(item._id)}" tabindex="0" role="button">
      <div class="card-top"><span class="code">${escapeHtml(item.codigo)}</span><span class="mini-pill ${ready ? 'status-ready' : 'status-draft'}">${escapeHtml(statusLabel(item.status))}</span></div>
      <h4>${escapeHtml(item.titulo)}</h4>
      <p>${escapeHtml(item.anoLetivo)} · ${escapeHtml(item.etapa || 'Etapa não informada')}</p>
      <div class="simulado-meta"><span class="mini-pill">${item.totalQuestoes} questões</span><span class="mini-pill">${item.resultados || 0} resultados</span>${item.importacoesPendentes ? `<span class="mini-pill status-draft">${item.importacoesPendentes} conferência(s) salva(s)</span>` : ''}${item.possuiIdioma ? '<span class="mini-pill">2 idiomas</span>' : ''}</div>
    </article>`;
  }).join('');
  $$('.simulado-card', list).forEach((card) => {
    const open = () => selectSimulado(card.dataset.simuladoId, 'diagnostico');
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
}

async function selectSimulado(id, preferredView = 'diagnostico') {
  setLoading(true, 'Carregando simulado…');
  try {
    const payload = await api(`/api/simulados/${encodeURIComponent(id)}`);
    const mesmoSimulado = String(state.current?._id || '') === String(payload.simulado?._id || '');
    const dashboardAnterior = mesmoSimulado ? state.dashboard : null;
    const comparacaoAnterior = mesmoSimulado ? state.comparacao : null;
    state.current = payload.simulado;
    state.currentTotalResults = Number(payload.totalResultados || 0);
    state.importacao = null;
    state.substituicao = null;
    state.importacoesPendentes = [];
    state.dashboard = dashboardAnterior;
    state.comparacao = comparacaoAnterior;
    if (!mesmoSimulado) {
      state.dashboardLastSuccessKey = null;
      state.dashboardRequestKey = null;
      state.dashboardRequestPromise = null;
      state.dashboardRequestSeq += 1;
    }
    state.resultPage = 1;
    $('#currentSimuladoName').textContent = state.current.titulo;
    $('#currentSimuladoChip').hidden = false;
    remember('ultimoSimulado', state.current._id);
    populateDashboardClasses();
    renderSimulados();
    const retomada = state.bootstrap.permissoes.gestao
      ? await loadPendingImports({ restoreLatest: true })
      : false;
    let target = preferredView;
    if (retomada && preferredView === 'diagnostico') {
      target = 'importacao';
    } else if (!payload.totalResultados && preferredView === 'diagnostico') {
      target = state.current.questoes?.length
        ? (state.bootstrap.permissoes.gestao ? 'importacao' : 'diagnostico')
        : 'matriz';
    }
    setView(target);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderPendingImports() {
  const panel = $('#pendingImportsPanel');
  const list = $('#pendingImportsList');
  if (!panel || !list) return;
  const items = state.importacoesPendentes || [];
  panel.hidden = !items.length;
  if (!items.length) { list.innerHTML = ''; return; }
  list.innerHTML = items.map((item) => {
    const totals = item.totais || {};
    const tipo = item.arquivo?.formato === 'pdf'
      ? `${item.arquivo?.turma || 'Turma'} · ${item.arquivo?.dia || '—'}º dia`
      : 'Planilha de respostas';
    if (item.status === 'analisando') {
      return `<div class="saved-work-item"><div><b>${escapeHtml(item.arquivo?.nomeOriginal || 'Leitura óptica em andamento')}</b><p>${escapeHtml(tipo)} · ${escapeHtml(omrProgressMessage(item))}<br>O processamento continua no servidor mesmo sem manter a requisição de upload aberta.</p></div><div class="saved-work-actions"><button class="btn btn-secondary btn-small" data-watch-omr="${escapeHtml(item._id)}" type="button">Acompanhar leitura</button></div></div>`;
    }
    const bloqueios = Number(totals.ambiguas || 0) + Number(totals.naoLocalizadas || 0)
      + Number(totals.duplicadas || 0) + Number(totals.idiomasPendentes || 0) + Number(totals.omrPendentes || 0);
    return `<div class="saved-work-item"><div><b>${escapeHtml(item.arquivo?.nomeOriginal || 'Importação em andamento')}</b><p>${escapeHtml(tipo)} · ${totals.prontas || 0} de ${totals.linhas || 0} vínculo(s) prontos · ${bloqueios} pendência(s)<br>Salvo em ${escapeHtml(dateTime(item.updatedAt))}</p></div><div class="saved-work-actions"><button class="btn btn-secondary btn-small" data-resume-import="${escapeHtml(item._id)}" type="button">Continuar conferência</button><button class="btn btn-danger btn-small" data-discard-import="${escapeHtml(item._id)}" type="button">Excluir</button></div></div>`;
  }).join('');
  $$('[data-resume-import]', list).forEach((button) => button.addEventListener('click', () => resumeImport(button.dataset.resumeImport)));
  $$('[data-discard-import]', list).forEach((button) => button.addEventListener('click', () => discardPendingImport(button.dataset.discardImport)));
  $$('[data-watch-omr]', list).forEach((button) => button.addEventListener('click', async () => {
    try { await monitorOmrProcess(button.dataset.watchOmr); } catch (error) { toast(error.message, 'error'); }
  }));
}

async function loadPendingImports({ restoreLatest = false, monitorActive = true } = {}) {
  if (!state.current || !state.bootstrap?.permissoes?.gestao) return false;
  // V1.12.5: uma unica consulta substitui duas chamadas paralelas no carregamento inicial.
  const pendentes = await api(`/api/simulados/${state.current._id}/importacoes?status=pendentes&limite=30`);
  const itens = pendentes.importacoes || [];
  const analisadas = itens.filter((item) => item.status === 'analisada');
  const ativas = itens.filter((item) => item.status === 'analisando');
  state.processamentosOmr = ativas;
  state.importacoesPendentes = [...ativas, ...analisadas];
  renderPendingImports();

  if (monitorActive && ativas.length) {
    const remembered = recalled('ultimaImportacao');
    const ativa = ativas.find((item) => String(item._id) === remembered) || ativas[0];
    remember('ultimaImportacao', ativa._id);
    setTimeout(() => monitorOmrProcess(ativa._id).catch((error) => toast(error.message, 'error')), 0);
    return true;
  }

  if (!restoreLatest || !analisadas.length) return false;
  const remembered = recalled('ultimaImportacao');
  const chosen = analisadas.find((item) => String(item._id) === remembered) || analisadas[0];
  const full = await api(`/api/simulados/${state.current._id}/importacoes/${chosen._id}`);
  aplicarImportacao(full);
  remember('ultimaImportacao', chosen._id);
  renderImport(false);
  return true;
}

async function resumeImport(importacaoId) {
  if (!state.current || !importacaoId) return;
  setLoading(true, 'Recuperando a conferência salva…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${importacaoId}`);
    aplicarImportacao(response);
    remember('ultimaImportacao', importacaoId);
    renderImport(false);
    setView('importacao');
    $('#importPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Progresso recuperado. Você pode continuar de onde parou.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function discardPendingImport(importacaoId) {
  if (!state.current || !importacaoId) return;
  const saved = state.importacoesPendentes.find((item) => String(item._id) === String(importacaoId));
  const fileName = saved?.arquivo?.nomeOriginal || 'esta conferência';
  const confirmed = window.confirm(`Excluir a conferência “${fileName}”?\n\nO progresso ainda não processado será descartado. Resultados já confirmados não serão afetados.`);
  if (!confirmed) return;

  setLoading(true, 'Excluindo a conferência interrompida…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${importacaoId}`, { method: 'DELETE' });
    if (String(state.importacao?._id || '') === String(importacaoId)) {
      state.importacao = null;
      state.substituicao = null;
      remember('ultimaImportacao', '');
      $('#importPreview').hidden = true;
    }
    await loadPendingImports();
    await loadSimulados();
    toast(response.mensagem);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function recoverPreviousLinks() {
  if (!state.current || !state.importacao || !state.substituicao) return;
  setLoading(true, 'Recuperando os vínculos já conferidos…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/recuperar-vinculos`, {
      method: 'POST',
      body: '{}',
    });
    aplicarImportacao(response);
    renderImport(false);
    await loadPendingImports();
    toast(response.mensagem);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function populateDashboardClasses() {
  const select = $('#dashboardClass');
  if (!select || !state.bootstrap) return;
  let classes = state.current?.turmas?.length ? state.current.turmas : state.bootstrap.turmas;
  if (state.bootstrap.usuario.tipo === 'professor') {
    const allowed = new Set(state.bootstrap.turmas);
    classes = classes.filter((item) => allowed.has(item));
  }
  const selected = select.value;
  select.innerHTML = '<option value="">Todas permitidas</option>' + classes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (classes.includes(selected)) select.value = selected;
  populateScanOptions();
}

function populateScanOptions() {
  const classSelect = $('#scanClass');
  const daySelect = $('#scanDay');
  if (!classSelect || !daySelect || !state.bootstrap) return;
  let classes = state.current?.turmas?.length ? state.current.turmas : state.bootstrap.turmas;
  if (state.bootstrap.usuario.tipo === 'professor') {
    const allowed = new Set(state.bootstrap.turmas);
    classes = classes.filter((item) => allowed.has(item));
  }
  const selectedClass = classSelect.value;
  classSelect.innerHTML = '<option value="">Selecione</option>' + classes
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (classes.includes(selectedClass)) classSelect.value = selectedClass;

  const availableDays = new Set((state.current?.questoes || []).map((item) => Number(item.dia || 1)));
  const selectedDay = daySelect.value;
  daySelect.innerHTML = '<option value="">Selecione</option>' + [1, 2]
    .filter((day) => !state.current || !availableDays.size || availableDays.has(day))
    .map((day) => `<option value="${day}">${day}º dia</option>`).join('');
  if ([...daySelect.options].some((option) => option.value === selectedDay)) daySelect.value = selectedDay;
}

function openCreateDialog() {
  $('#createForm').reset();
  $('#createYear').value = state.bootstrap.anoAtual;
  $('#createStage').value = 'Ensino Médio';
  $('#createDialog').showModal();
}

async function createSimulado(event) {
  event.preventDefault();
  const classes = [...$('#createClasses').selectedOptions].map((item) => item.value);
  const payload = {
    titulo: $('#createTitle').value,
    codigo: $('#createCode').value,
    anoLetivo: Number($('#createYear').value),
    tipo: $('#createType').value,
    etapa: $('#createStage').value,
    turmas: classes,
    descricao: $('#createDescription').value,
  };
  setLoading(true, 'Criando simulado…');
  try {
    const response = await api('/api/simulados', { method: 'POST', body: JSON.stringify(payload) });
    $('#createDialog').close();
    toast(response.mensagem);
    await loadSimulados();
    await selectSimulado(response.simulado._id, 'matriz');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderMatrix() {
  if (!state.current) return;
  const questions = state.current.questoes || [];
  const variants = questions.reduce((total, item) => total + (item.variantes?.length || 0), 0);
  const language = questions.filter((item) => (item.variantes || []).some((variant) => ['INGLES', 'ESPANHOL'].includes(variant.codigo))).length;
  const areas = new Set(questions.map((item) => text(item.area)).filter(Boolean));
  const contents = new Set(questions.flatMap((item) => (item.variantes || []).map((variant) => text(variant.conteudo))).filter(Boolean));
  const enemVariants = questions.flatMap((item) => (item.variantes || []).map((variant) => ({ question: item, variant })));
  const enemMapped = enemVariants.filter(({ variant }) => /^H(?:[1-9]|[12]\d|30)$/i.test(text(variant.habilidadeEnem))).length;
  const isEnem = text(state.current.tipo).toLowerCase() === 'enem';
  const pareceEnem = /\benem\b/i.test(`${text(state.current.titulo)} ${text(state.current.codigo)} ${text(state.current.descricao)}`);
  const activationPanel = $('#enemActivationPanel');
  if (activationPanel) activationPanel.hidden = isEnem || !pareceEnem;
  const enemPanel = $('#enemMappingPanel');
  if (enemPanel) {
    enemPanel.hidden = !isEnem;
    $('#enemMappingStatus').textContent = `${enemMapped} de ${enemVariants.length} variante(s) mapeada(s)`;
    $('#enemMappingStatus').className = `status-pill ${enemMapped === enemVariants.length && enemVariants.length ? 'status-ready' : 'status-draft'}`;
  }
  $('#matrixCount').textContent = `${questions.length} questão(ões) cadastrada(s)`;
  $('#matrixVersion').textContent = `Versão ${state.current.versaoMatriz || 1}`;
  $('#matrixStatus').textContent = questions.length ? 'Matriz pronta' : 'Sem matriz';
  $('#matrixStatus').className = `status-pill ${questions.length ? 'status-ready' : 'status-draft'}`;
  $('#matrixSummary').innerHTML = [
    ['Questões', questions.length], ['Variantes', variants], ['Questões de idioma', language], ['Áreas', areas.size], ['Conteúdos mapeados', contents.size], ...(isEnem ? [['Habilidades ENEM', `${enemMapped}/${enemVariants.length}`]] : []), ['Dias de aplicação', state.current.dias?.length || 1],
  ].map(([label, value]) => `<div class="info-tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
  const reference = $('#settingReference');
  if (reference && state.bootstrap) {
    const currentReference = text(state.current.simuladoReferencia?._id || state.current.simuladoReferencia);
    reference.innerHTML = '<option value="">Sem comparação</option>' + (state.bootstrap.referencias || [])
      .filter((item) => String(item._id) !== String(state.current._id))
      .map((item) => `<option value="${escapeHtml(item._id)}">${escapeHtml(item.titulo)} · ${item.anoLetivo}</option>`).join('');
    reference.value = currentReference;
  }
  const cfg = state.current.configuracaoAnalise || {};
  $('#settingConsolidated').value = cfg.percentualConsolidado ?? 70;
  $('#settingAttention').value = cfg.percentualAtencao ?? 50;
  $('#settingMinQuestions').value = cfg.minimoQuestoesIndicador ?? 2;
  $('#settingMinRespondents').value = cfg.minimoRespondentesQuestao ?? 5;
  $('#settingMinGroup').value = cfg.minimoAlunosGrupo ?? 2;
  $('#settingMinCoverage').value = cfg.minimoCoberturaIndividual ?? 80;
  const locked = state.currentTotalResults > 0;
  ['settingConsolidated', 'settingAttention', 'settingMinQuestions', 'settingMinRespondents', 'settingMinGroup', 'settingMinCoverage']
    .forEach((id) => { $(`#${id}`).disabled = locked; });
  $('#settingsLock').hidden = !locked;
}

async function saveSettings() {
  if (!state.current) return;
  const body = { simuladoReferencia: $('#settingReference').value || '' };
  if (!state.currentTotalResults) {
    body.configuracaoAnalise = {
      percentualConsolidado: Number($('#settingConsolidated').value),
      percentualAtencao: Number($('#settingAttention').value),
      minimoQuestoesIndicador: Number($('#settingMinQuestions').value),
      minimoRespondentesQuestao: Number($('#settingMinRespondents').value),
      minimoAlunosGrupo: Number($('#settingMinGroup').value),
      minimoCoberturaIndividual: Number($('#settingMinCoverage').value),
    };
    if (body.configuracaoAnalise.percentualAtencao >= body.configuracaoAnalise.percentualConsolidado) {
      toast('O limite prioritário precisa ser menor que o consolidado.', 'warning');
      return;
    }
  }
  setLoading(true, 'Salvando configuração…');
  try {
    const response = await api(`/api/simulados/${state.current._id}`, { method: 'PATCH', body: JSON.stringify(body) });
    toast(response.mensagem);
    await selectSimulado(state.current._id, 'matriz');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function chooseFile(input, button) {
  const file = input.files?.[0];
  const label = input.closest('.file-drop')?.querySelector('span');
  if (label) label.textContent = file ? file.name : 'Selecionar arquivo';
  button.disabled = !file;
}

async function uploadMatrix() {
  const file = $('#matrixFile').files?.[0];
  if (!file || !state.current) return;
  const form = new FormData();
  form.append('arquivo', file);
  setLoading(true, 'Validando a matriz completa…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/matriz/importar`, { method: 'POST', body: form });
    toast(response.mensagem);
    (response.avisos || []).slice(0, 2).forEach((item) => toast(item, 'warning'));
    await selectSimulado(state.current._id, 'matriz');
  } catch (error) {
    const details = error.payload?.erros?.slice(0, 4).join(' ') || '';
    toast(`${error.message}${details ? ` ${details}` : ''}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function activateEnemMapping() {
  if (!state.current) return;
  const confirmou = window.confirm('Ativar a Matriz de Referência ENEM para este simulado? Respostas, gabarito e resultados já armazenados serão preservados.');
  if (!confirmou) return;
  setLoading(true, 'Ativando Matriz de Referência ENEM…');
  try {
    const response = await api(`/api/simulados/${state.current._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tipo: 'enem' }),
    });
    toast(response.mensagem || 'Matriz ENEM ativada.');
    await selectSimulado(state.current._id, 'matriz');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function uploadEnemMapping() {
  const file = $('#enemMappingFile').files?.[0];
  if (!file || !state.current) return;
  const form = new FormData();
  form.append('arquivo', file);
  setLoading(true, 'Validando habilidades da Matriz ENEM…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/mapeamento-enem/importar`, { method: 'POST', body: form });
    toast(response.mensagem);
    (response.avisos || []).slice(0, 3).forEach((item) => toast(item, 'warning'));
    await selectSimulado(state.current._id, 'matriz');
  } catch (error) {
    const details = error.payload?.erros?.slice(0, 4).join(' ') || '';
    toast(`${error.message}${details ? ` ${details}` : ''}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function analyzeAnswers() {
  const file = $('#answersFile').files?.[0];
  if (!file || !state.current) return;
  const form = new FormData();
  form.append('arquivo', file);
  setLoading(true, 'Conferindo alunos, respostas e idiomas…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/importacoes/analisar`, { method: 'POST', body: form });
    aplicarImportacao(response);
    remember('ultimaImportacao', state.importacao._id);
    renderImport();
    await loadPendingImports();
    toast(response.mensagem);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function syncScanButton() {
  const button = $('#analyzeScans');
  if (!button) return;
  button.disabled = !$('#scansFile').files?.[0] || !$('#scanClass').value || !$('#scanDay').value;
}

async function analyzeScans() {
  const file = $('#scansFile').files?.[0];
  const turma = $('#scanClass').value;
  const dia = $('#scanDay').value;
  if (!file || !turma || !dia || !state.current) return;
  const form = new FormData();
  form.append('cartoes', file);
  form.append('turma', turma);
  form.append('dia', dia);
  setLoading(true, 'Enviando o PDF para a fila de leitura óptica…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/cartoes/analisar`, { method: 'POST', body: form });
    aplicarImportacao(response);
    const importacaoId = response.importacao?._id;
    if (importacaoId) remember('ultimaImportacao', importacaoId);

    if (response.importacao?.status === 'analisando' || response.processamentoAssincrono || response.retomadaProcessamento) {
      toast(response.mensagem);
      await loadPendingImports({ restoreLatest: false, monitorActive: false });
      if (importacaoId) await monitorOmrProcess(importacaoId);
      return;
    }

    renderImport();
    await loadPendingImports();
    toast(response.mensagem);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    if (!state.omrPollId) setLoading(false);
  }
}

function statusImport(status) {
  return ({ automatico: ['Vinculado', 'text-good'], manual: ['Conferido', 'text-good'], ambiguo: ['Ambíguo', 'text-mid'], nao_localizado: ['Não localizado', 'text-bad'], duplicado: ['Duplicado', 'text-bad'] })[status] || [status, ''];
}

function renderImport(scroll = true) {
  const item = state.importacao;
  if (!item) { $('#importPreview').hidden = true; return; }
  $('#importPreview').hidden = false;
  $('#importSaveState').textContent = `Progresso salvo em ${dateTime(item.updatedAt)}`;
  $('#importSaveState').className = 'save-state';
  const totals = item.totais || {};
  const pdf = item.arquivo?.formato === 'pdf';
  const metrics = [
    ['Linhas', totals.linhas, ''], ['Prontas', totals.prontas, ''], ['Ambíguas', totals.ambiguas, totals.ambiguas ? 'warn' : ''],
    ['Não localizadas', totals.naoLocalizadas, totals.naoLocalizadas ? 'bad' : ''], ['Duplicadas', totals.duplicadas, totals.duplicadas ? 'bad' : ''],
    ['Idioma pendente', totals.idiomasPendentes, totals.idiomasPendentes ? 'warn' : ''],
    ['Língua não marcada', totals.idiomasNaoMarcados, totals.idiomasNaoMarcados ? 'warn' : ''],
    ['Ausentes', totals.ausentes, totals.ausentes ? 'warn' : ''],
    ['Páginas descartadas', totals.descartadas, ''],
  ];
  if (pdf) metrics.push(
    ['OMR pronta', totals.omrProntas, ''],
    ['OMR a revisar', totals.omrPendentes, totals.omrPendentes ? 'warn' : ''],
  );
  $('#importMetrics').innerHTML = metrics.map(([label, value, cls]) => `<div class="mini-metric ${cls}"><span>${escapeHtml(label)}</span><b>${Number(value || 0)}</b></div>`).join('');
  const replacement = state.substituicao;
  const replacementNotice = $('#replacementNotice');
  const recoverButton = $('#recoverPreviousLinks');
  replacementNotice.hidden = !replacement;
  if (replacement) {
    const scope = [replacement.turma, replacement.dia ? `${replacement.dia}º dia` : ''].filter(Boolean).join(' · ');
    const recovered = Number(item.vinculosRecuperados || 0);
    $('#replacementTitle').textContent = `Diagnóstico anterior encontrado${scope ? ` — ${scope}` : ''}`;
    $('#replacementText').textContent = `${replacement.resultados || 0} resultado(s) foram processados em ${dateTime(replacement.processadoEm)}. ${recovered ? `${recovered} vínculo(s) já foram recuperados. ` : ''}Ao finalizar, o novo diagnóstico substituirá o anterior e o aluno continuará com apenas um resultado.`;
    recoverButton.hidden = !Number(replacement.vinculosDisponiveis || 0) || !Number(totals.naoLocalizadas || 0);
    recoverButton.disabled = item.status !== 'analisada';
    $('#confirmImport').textContent = 'Substituir diagnóstico anterior';
  } else {
    recoverButton.hidden = true;
    $('#confirmImport').textContent = 'Confirmar e processar';
  }
  $('#importWarnings').innerHTML = (item.avisos || []).map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`).join('');
  $('#importRows').innerHTML = (item.linhas || []).map((row) => {
    const situacaoAplicacao = ['ausente', 'descartada'].includes(text(row.situacaoAplicacao).toLowerCase())
      ? text(row.situacaoAplicacao).toLowerCase()
      : 'presente';
    const [labelBase, clsBase] = statusImport(row.vinculoStatus);
    const label = situacaoAplicacao === 'ausente' ? 'Ausente' : (situacaoAplicacao === 'descartada' ? 'Descartada' : labelBase);
    const cls = situacaoAplicacao === 'ausente' ? 'text-mid' : (situacaoAplicacao === 'descartada' ? '' : clsBase);
    const pendingLanguage = situacaoAplicacao === 'presente' && rowHasLanguage(row) && row.idiomaEstrangeiro === 'NAO_INFORMADO';
    const needsAction = situacaoAplicacao === 'presente' && (!['automatico', 'manual'].includes(row.vinculoStatus) || pendingLanguage);
    const omrPending = situacaoAplicacao === 'presente' && Boolean(row.omr?.revisaoObrigatoria);
    const preview = safeDataImage(row.omr?.previewCabecalho);
    const omrLabel = situacaoAplicacao === 'ausente'
      ? 'Não aplicável — ausência'
      : (situacaoAplicacao === 'descartada'
        ? 'Página ignorada'
        : (row.fonte === 'cartao_pdf'
          ? (omrPending
            ? `${Number(row.omr?.ambiguidades || 0)} a revisar`
            : `${Number(row.omr?.respostasReconhecidas || 0)} marcadas · ${Number(row.omr?.brancosReconhecidos || 0)} brancos`)
          : 'Arquivo estruturado'));
    let actions = '';
    if (situacaoAplicacao === 'presente') {
      actions += `<button class="row-action" data-resolve-line="${row.numeroLinha}" type="button">${needsAction ? 'Aluno/idioma' : 'Rever vínculo'}</button>`;
      if (row.fonte === 'cartao_pdf') {
        actions += `<button class="row-action" data-omr-line="${row.numeroLinha}" type="button">${omrPending ? 'Revisar respostas' : 'Ver respostas'}</button>`;
        actions += `<button class="row-action" data-absence-line="${row.numeroLinha}" type="button">Marcar ausência</button>`;
        actions += `<button class="row-action" data-discard-line="${row.numeroLinha}" type="button">Descartar página</button>`;
      }
    } else {
      actions += `<button class="row-action" data-restore-line="${row.numeroLinha}" type="button">Restaurar</button>`;
      if (situacaoAplicacao === 'ausente') actions += `<button class="row-action" data-absence-line="${row.numeroLinha}" type="button">Rever aluno</button>`;
    }
    return `<tr class="${situacaoAplicacao !== 'presente' ? 'row-muted' : ''}">
      <td>${row.pagina ? `Página ${row.pagina}` : row.numeroLinha}${row.dia ? `<br><small>${row.dia}º dia</small>` : ''}</td>
      <td>${preview ? `<img class="scan-thumb" src="${preview}" alt="Cabeçalho da página ${row.pagina || row.numeroLinha}">` : '—'}</td>
      <td><b>${escapeHtml(row.nomeInformado || '—')}</b><br><small>${escapeHtml(row.codigoInformado || '')}</small></td>
      <td>${escapeHtml(row.turmaInformada || '—')}</td><td><span class="status-text ${cls}">${escapeHtml(label)}</span></td>
      <td class="${pendingLanguage ? 'text-mid' : ''}">${situacaoAplicacao === 'presente' ? escapeHtml(languageLabel(row.idiomaEstrangeiro)) : 'Não aplicável'}</td>
      <td><span class="omr-status ${omrPending ? 'pending' : 'ready'}">${escapeHtml(omrLabel)}</span></td>
      <td>${escapeHtml((row.avisos || []).join(' · ') || '—')}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
  }).join('');
  $$('[data-resolve-line]').forEach((button) => button.addEventListener('click', () => openResolution(Number(button.dataset.resolveLine))));
  $$('[data-omr-line]').forEach((button) => button.addEventListener('click', () => openOmrReview(Number(button.dataset.omrLine))));
  $$('[data-absence-line]').forEach((button) => button.addEventListener('click', () => openResolution(Number(button.dataset.absenceLine), { absence: true })));
  $$('[data-discard-line]').forEach((button) => button.addEventListener('click', () => discardImportLine(Number(button.dataset.discardLine))));
  $$('[data-restore-line]').forEach((button) => button.addEventListener('click', () => restoreImportLine(Number(button.dataset.restoreLine))));
  const blocked = Number(totals.ambiguas || 0) + Number(totals.naoLocalizadas || 0) + Number(totals.duplicadas || 0)
    + Number(totals.omrPendentes || 0) + Number(totals.idiomasPendentes || 0) > 0;
  $('#confirmImport').disabled = blocked || item.status !== 'analisada';
  if (scroll) $('#importPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addStudentOption(student, selected = false) {
  if (!student?.aluno && !student?._id) return;
  const id = String(student.aluno || student._id);
  if ([...$('#resolveStudent').options].some((option) => option.value === id)) return;
  const option = document.createElement('option');
  option.value = id;
  option.textContent = `${student.nome || 'Aluno'} — ${student.turma || 'sem turma'}${student.codigoAcesso ? ` · ${student.codigoAcesso}` : ''}`;
  option.selected = selected;
  $('#resolveStudent').appendChild(option);
}

function openResolution(lineNumber, { absence = false } = {}) {
  const row = state.importacao?.linhas?.find((item) => item.numeroLinha === lineNumber);
  if (!row) return;
  $('#resolveLine').value = lineNumber;
  $('#resolveMode').value = absence ? 'ausente' : 'presente';
  $('#resolveTitle').textContent = absence ? `Registrar ausência · página ${row.pagina || lineNumber}` : (row.nomeInformado || `Linha ${lineNumber}`);
  $('#resolveAbsenceNotice').hidden = !absence;
  $('#saveResolution').textContent = absence ? 'Confirmar ausência' : 'Salvar correção';
  $('#resolveSearch').value = row.fonte === 'cartao_pdf' && /^Cartão da página/.test(row.nomeInformado || '') ? '' : (row.nomeInformado || '');
  const headerImage = safeDataImage(row.omr?.previewCabecalho);
  $('#resolveHeaderPreview').hidden = !headerImage;
  if (headerImage) $('#resolveHeaderImage').src = headerImage;
  else $('#resolveHeaderImage').removeAttribute('src');
  $('#resolveStudent').innerHTML = '<option value="">Selecione</option>';
  (row.candidatos || []).forEach((student) => addStudentOption(student, String(student.aluno) === String(row.aluno)));
  if (row.aluno) addStudentOption({ aluno: row.aluno, nome: row.nomeInformado, turma: row.turmaInformada, codigoAcesso: row.codigoInformado }, true);
  $('#resolveLanguage').value = row.idiomaEstrangeiro || 'NAO_INFORMADO';
  $('#resolveOrigin').value = ['manual', 'lista', 'cartao', 'prova'].includes(row.idiomaOrigem) ? row.idiomaOrigem : (row.fonte === 'cartao_pdf' ? 'cartao' : 'manual');
  const languageApplicable = rowHasLanguage(row) && !absence;
  $('#resolveLanguageField').hidden = !languageApplicable;
  $('#resolveOriginField').hidden = !languageApplicable;
  $('#resolveDialog').showModal();
}

async function searchStudents() {
  const query = $('#resolveSearch').value.trim();
  if (!query) return;
  try {
    const line = Number($('#resolveLine').value);
    const row = state.importacao?.linhas?.find((item) => item.numeroLinha === line);
    const params = new URLSearchParams({ q: query });
    if (row?.turmaInformada) params.set('turma', row.turmaInformada);
    const response = await api(`/api/simulados/alunos/buscar?${params}`);
    const current = $('#resolveStudent').value;
    $('#resolveStudent').innerHTML = '<option value="">Selecione</option>';
    (response.alunos || []).forEach((student) => addStudentOption(student, String(student._id) === current));
    if (!response.alunos?.length) toast('Nenhum aluno encontrado nessa busca.', 'warning');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function saveResolution(event) {
  event.preventDefault();
  const line = Number($('#resolveLine').value);
  const student = $('#resolveStudent').value;
  const currentRow = state.importacao.linhas.find((item) => item.numeroLinha === line);
  const mode = $('#resolveMode').value === 'ausente' ? 'ausente' : 'presente';
  if (!student && !currentRow?.aluno) { toast('Selecione o aluno correto.', 'warning'); return; }
  const body = {
    alunoId: student || currentRow.aluno,
    situacaoAplicacao: mode,
  };
  if (mode === 'presente' && rowHasLanguage(currentRow)) {
    body.idiomaEstrangeiro = $('#resolveLanguage').value;
    body.idiomaOrigem = $('#resolveOrigin').value;
  }
  setLoading(true, 'Salvando conferência…');
  try {
    await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/linhas/${line}`, { method: 'PATCH', body: JSON.stringify(body) });
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}`);
    aplicarImportacao(response);
    $('#resolveDialog').close();
    renderImport();
    await loadPendingImports();
    toast(mode === 'ausente' ? 'Ausência salva. Este dia não será contabilizado no diagnóstico do aluno.' : 'Vínculo salvo. Ele permanecerá disponível após sair do sistema.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function discardImportLine(lineNumber) {
  const row = state.importacao?.linhas?.find((item) => item.numeroLinha === lineNumber);
  if (!row) return;
  const page = row.pagina || lineNumber;
  const confirmed = window.confirm(`Descartar a página ${page} desta conferência?\n\nEla será ignorada no processamento, mas os dados lidos permanecerão salvos até a confirmação para que você possa restaurá-la se necessário.`);
  if (!confirmed) return;
  setLoading(true, 'Descartando página da conferência…');
  try {
    await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/linhas/${lineNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ situacaoAplicacao: 'descartada', situacaoAplicacaoMotivo: 'Página descartada manualmente na conferência.' }),
    });
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}`);
    aplicarImportacao(response);
    renderImport(false);
    await loadPendingImports();
    toast(`Página ${page} descartada sem apagar o progresso salvo.`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function restoreImportLine(lineNumber) {
  const row = state.importacao?.linhas?.find((item) => item.numeroLinha === lineNumber);
  if (!row) return;
  setLoading(true, 'Restaurando página…');
  try {
    await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/linhas/${lineNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ situacaoAplicacao: 'presente', situacaoAplicacaoMotivo: '' }),
    });
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}`);
    aplicarImportacao(response);
    renderImport(false);
    await loadPendingImports();
    toast('Página restaurada. As leituras e correções anteriores foram preservadas.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function openOmrReview(lineNumber) {
  const row = state.importacao?.linhas?.find((item) => item.numeroLinha === lineNumber);
  if (!row?.omr) return;
  $('#omrLine').value = lineNumber;
  $('#omrTitle').textContent = `Página ${row.pagina || lineNumber} · ${row.turmaInformada || 'turma não informada'}`;
  const image = safeDataImage(row.omr.previewGrade);
  if (image) $('#omrGradeImage').src = image;
  else $('#omrGradeImage').removeAttribute('src');
  const responses = row.respostas || {};
  const markings = [...(row.omr.marcacoes || [])].sort((a, b) => Number(a.numero) - Number(b.numero));
  $('#omrAnswerGrid').innerHTML = markings.map((marking) => {
    const code = text(marking.codigoQuestao).toUpperCase();
    const value = text(responses[code] ?? marking.resposta).toUpperCase();
    const pending = ['multipla', 'incerta'].includes(marking.status) || !value;
    const options = [
      ['', 'Selecione'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'], ['BRANCO', 'Branco'],
    ].map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('');
    return `<label class="omr-answer ${pending ? 'pending' : ''}"><span>${Number(marking.numero)}</span><select data-omr-code="${escapeHtml(code)}" aria-label="Questão ${Number(marking.numero)}">${options}</select></label>`;
  }).join('');
  state.omrSaveQueue = Promise.resolve();
  state.omrSavesPending = 0;
  setOmrSaveState('Todos os ajustes salvos');
  $$('[data-omr-code]', $('#omrAnswerGrid')).forEach((select) => {
    select.addEventListener('change', () => queueOmrAutosave(select));
  });
  $('#omrDialog').showModal();
}

function setOmrSaveState(message, type = '') {
  const target = $('#omrSaveState');
  if (!target) return;
  target.textContent = message;
  target.className = `save-state ${type}`.trim();
}

function queueOmrAutosave(select) {
  const line = Number($('#omrLine').value);
  const code = text(select.dataset.omrCode).toUpperCase();
  const value = text(select.value).toUpperCase();
  if (!line || !code || !value || !state.importacao) return;
  const row = state.importacao.linhas.find((item) => item.numeroLinha === line);
  if (row) {
    row.respostas = { ...(row.respostas || {}), [code]: value };
    select.closest('.omr-answer')?.classList.remove('pending');
  }
  state.omrSavesPending += 1;
  setOmrSaveState('Salvando ajuste…', 'saving');
  const executar = async () => {
    try {
      const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/linhas/${line}`, {
        method: 'PATCH',
        keepalive: true,
        body: JSON.stringify({ respostas: { [code]: value } }),
      });
      const index = state.importacao.linhas.findIndex((item) => item.numeroLinha === line);
      if (index >= 0 && response.linha) state.importacao.linhas[index] = response.linha;
      state.importacao.totais = response.totais || state.importacao.totais;
      state.importacao.updatedAt = response.salvoEm || new Date().toISOString();
      state.omrSavesPending -= 1;
      if (!state.omrSavesPending) setOmrSaveState(`Salvo em ${dateTime(state.importacao.updatedAt)}`);
    } catch (error) {
      state.omrSavesPending = Math.max(0, state.omrSavesPending - 1);
      setOmrSaveState('Falha ao salvar este ajuste. Use “Salvar conferência” para tentar novamente.', 'error');
      toast(error.message, 'error');
    }
  };
  state.omrSaveQueue = state.omrSaveQueue.then(executar, executar);
}

async function saveOmrReview(event) {
  event.preventDefault();
  const line = Number($('#omrLine').value);
  const selects = $$('[data-omr-code]', $('#omrAnswerGrid'));
  const missing = selects.filter((select) => !select.value);
  if (missing.length) {
    missing[0].focus();
    toast(`Ainda faltam ${missing.length} questão(ões). Se não houve marcação, escolha Branco.`, 'warning');
    return;
  }
  const respostas = Object.fromEntries(selects.map((select) => [select.dataset.omrCode, select.value]));
  setLoading(true, 'Salvando a conferência do cartão…');
  try {
    await state.omrSaveQueue;
    await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/linhas/${line}`, {
      method: 'PATCH',
      body: JSON.stringify({ respostas, confirmarOmr: true }),
    });
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}`);
    aplicarImportacao(response);
    $('#omrDialog').close();
    renderImport();
    await loadPendingImports();
    toast('As 80 respostas foram conferidas.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function confirmImport() {
  const pending = Number(state.importacao?.totais?.idiomasPendentes || 0);
  if (pending) {
    toast(`${pending} aluno(s) ainda estão com idioma pendente. Confirme Inglês, Espanhol ou “Não marcou nenhuma língua”; nunca escolha aleatoriamente.`, 'warning');
    return;
  }
  const replacing = Boolean(state.substituicao?.importacaoId);
  if (replacing) {
    const scope = [state.substituicao.turma, state.substituicao.dia ? `${state.substituicao.dia}º dia` : ''].filter(Boolean).join(' · ');
    const confirmed = window.confirm(`Substituir o diagnóstico anterior${scope ? ` de ${scope}` : ''}?\n\nOs resultados deste dia serão recalculados com a conferência atual. O registro anterior ficará apenas na auditoria e nenhum aluno será duplicado.`);
    if (!confirmed) return;
  }
  setLoading(true, 'Calculando diagnósticos por aluno, área e habilidade…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/importacoes/${state.importacao._id}/confirmar`, {
      method: 'POST',
      body: JSON.stringify({ substituirAnterior: replacing }),
    });
    toast(response.mensagem);
    await selectSimulado(state.current._id, 'diagnostico');
  } catch (error) {
    if (error.payload?.requerSubstituicao && error.payload?.substituicao) {
      state.substituicao = error.payload.substituicao;
      renderImport(false);
      toast('Foi localizado um diagnóstico anterior. Confira o aviso de substituição e confirme novamente.', 'warning');
      return;
    }
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function dashboardRequestUrl({ force = false } = {}) {
  if (!state.current) return '';
  const turma = $('#dashboardClass')?.value || '';
  const params = new URLSearchParams();
  if (turma) params.set('turma', turma);
  if (force) params.set('fresh', '1');
  const query = params.toString();
  return `/api/simulados/${state.current._id}/dashboard${query ? `?${query}` : ''}`;
}

function dashboardKey() {
  if (!state.current) return '';
  const turma = $('#dashboardClass')?.value || '';
  return `${state.current._id}::${turma || '*'}`;
}

function renderDashboardUnavailable(message = 'O diagnóstico está temporariamente indisponível.') {
  if (state.dashboard && state.dashboardLastSuccessKey === dashboardKey()) return;
  $('#dParticipants').textContent = '—';
  $('#dClasses').textContent = 'Não carregado';
  $('#dAccuracy').textContent = '—';
  $('#dScore').textContent = '—';
  $('#dCoverage').textContent = '—';
  $('#dLanguage').textContent = '—';
  $('#dNoLanguage').textContent = '—';
  const aviso = `<div class="visual-empty"><b>Diagnóstico preservado no banco.</b><br>${escapeHtml(message)} Tente novamente em alguns instantes.</div>`;
  ['#visualAreaChart', '#visualBandDistribution', '#visualHistogram', '#visualClassChart', '#visualParticipation', '#visualSkillsHeatmap', '#visualQuestionBands', '#visualEvolutionChart']
    .forEach((selector) => { const node = $(selector); if (node) node.innerHTML = aviso; });
}

async function loadDashboard({ force = false } = {}) {
  if (!state.current) return null;
  const enemSkillsButton = $('#exportEnemSkillsPdf');
  if (enemSkillsButton) enemSkillsButton.hidden = String(state.current?.tipo || '').toLowerCase() !== 'enem';
  const reviewLanguagesButton = $('#reviewProcessedLanguages');
  if (reviewLanguagesButton) reviewLanguagesButton.hidden = !(state.bootstrap?.permissoes?.gestao && currentHasLanguage() && state.currentTotalResults > 0);
  const reviewParticipationButton = $('#reviewProcessedParticipation');
  if (reviewParticipationButton) reviewParticipationButton.hidden = !(state.bootstrap?.permissoes?.gestao && state.currentTotalResults > 0);

  const key = dashboardKey();
  if (!force && state.dashboardRequestKey === key && state.dashboardRequestPromise) {
    return state.dashboardRequestPromise;
  }

  // Um token impede que uma resposta antiga sobrescreva a turma/simulado escolhido depois.
  const requestSeq = ++state.dashboardRequestSeq;
  const executar = async () => {
    setLoading(true, 'Montando o diagnóstico…');
    try {
      let response;
      try {
        response = await api(dashboardRequestUrl({ force }));
      } catch (error) {
        // 429 e um bloqueio temporario de excesso de requisicoes. Repetimos somente UMA vez,
        // depois de uma espera, e apenas para esta leitura GET do dashboard.
        if (error?.status !== 429) throw error;
        setLoading(true, 'O servidor pediu uma breve pausa. Tentando o diagnóstico novamente…');
        await sleep(2400);
        response = await api(dashboardRequestUrl({ force }));
      }

      if (requestSeq !== state.dashboardRequestSeq || key !== dashboardKey()) return null;
      state.dashboard = response.dashboard;
      state.comparacao = response.comparacao;
      state.dashboardLastSuccessKey = key;
      renderDashboard();
      state.resultPage = 1;
      await loadResults();
      return response;
    } catch (error) {
      if (requestSeq === state.dashboardRequestSeq && key === dashboardKey()) {
        renderDashboardUnavailable(error.message);
        if (state.dashboard && state.dashboardLastSuccessKey === key) {
          toast('O servidor não conseguiu atualizar o diagnóstico agora. O último painel carregado foi mantido.', 'warning');
        } else {
          toast(error.message, 'error');
        }
      }
      return null;
    } finally {
      if (requestSeq === state.dashboardRequestSeq) setLoading(false);
    }
  };

  let promise;
  promise = executar().finally(() => {
    if (state.dashboardRequestKey === key && state.dashboardRequestPromise === promise) {
      state.dashboardRequestKey = null;
      state.dashboardRequestPromise = null;
    }
  });
  state.dashboardRequestKey = key;
  state.dashboardRequestPromise = promise;
  return promise;
}

async function recalculateDashboard() {
  if (!state.current || !state.bootstrap?.permissoes?.gestao) return;
  setLoading(true, 'Recalculando resultados com a metodologia explicada…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados/recalcular`, { method: 'POST', body: '{}' });
    toast(response.mensagem);
    await loadDashboard({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function emptyRank(message) { return `<div class="empty-state"><b>Sem indicação ainda.</b>${escapeHtml(message)}</div>`; }

function renderRank(selector, items, render) {
  const target = $(selector);
  target.innerHTML = items?.length ? items.slice(0, 12).map((item, index) => render(item, index)).join('') : emptyRank('São necessárias evidências suficientes para classificar.');
}

function diagnosticValue(item) {
  return Number(item?.percentualPontuacao) || 0;
}


function visualColorByLevel(level) {
  const colors = {
    consolidado: '#43cfa0',
    em_desenvolvimento: '#d1b653',
    prioritario: '#e06f7b',
    evidencia_insuficiente: '#60788c',
  };
  return colors[level] || '#49cdec';
}

function heatColor(value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  if (v < 25) return '#8b2f46';
  if (v < 50) return '#c35f55';
  if (v < 70) return '#b29c47';
  if (v < 85) return '#3b9d7b';
  return '#2f9fc1';
}

function emptyVisual(message) {
  return `<div class="visual-empty">${escapeHtml(message)}</div>`;
}

function renderAreaVisual(items = []) {
  if (!items.length) return emptyVisual('Sem áreas com evidência para representar.');
  const width = 720; const height = 230; const left = 150; const right = 36; const top = 18; const row = 42;
  const usable = width - left - right;
  const grid = [0, 25, 50, 70, 100].map((v) => {
    const x = left + usable * v / 100;
    return `<line x1="${x}" y1="8" x2="${x}" y2="${height - 26}" class="${[50,70].includes(v) ? 'visual-threshold' : 'visual-grid-line'}"/><text x="${x}" y="${height - 8}" text-anchor="middle" class="visual-axis-label">${v}%</text>`;
  }).join('');
  const bars = items.map((item, index) => {
    const y = top + index * row;
    const value = Math.max(0, Math.min(100, diagnosticValue(item)));
    const w = usable * value / 100;
    return `<g><text x="0" y="${y + 17}" class="visual-axis-title">${escapeHtml(item.rotulo)}</text><rect x="${left}" y="${y}" width="${usable}" height="20" rx="7" fill="rgba(255,255,255,.035)"/><rect class="visual-bar" x="${left}" y="${y}" width="${w}" height="20" fill="${visualColorByLevel(item.nivel)}"><title>${escapeHtml(item.rotulo)}: ${pct(value)} · cobertura ${pct(item.coberturaPercentual)} · ${item.estudantesComEvidencia || item.estudantes || 0} estudante(s)</title></rect><text x="${Math.min(width - 28, left + w + 8)}" y="${y + 15}" class="visual-value">${pct(value)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Desempenho por área">${grid}${bars}</svg>`;
}

function renderBandVisual(items = []) {
  if (!items.length) return emptyVisual('Sem estudantes classificados ainda.');
  const total = items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0) || 1;
  const color = (nivel) => ({ critico:'#9f3651', prioridade_alta:'#d05b64', em_atencao:'#dc9a4b', em_desenvolvimento:'#b4aa4b', consolidado:'#42c89c', participacao_parcial:'#4f8fb8', evidencia_insuficiente:'#5f7488' }[nivel] || '#60788c');
  const stack = `<div class="band-stack">${items.map((item) => `<span style="width:${Math.max(0.8, Number(item.percentual || (Number(item.quantidade || 0) / total * 100)))}%;background:${color(item.nivel)}" title="${escapeHtml(levelLabel(item.nivel))}: ${item.quantidade || 0} aluno(s)"></span>`).join('')}</div>`;
  const legend = `<div class="band-legend">${items.map((item) => `<div class="band-legend-item"><span><i class="band-swatch" style="background:${color(item.nivel)}"></i>${escapeHtml(levelLabel(item.nivel))}</span><b>${item.quantidade || 0} · ${pct(item.percentual || (Number(item.quantidade || 0) / total * 100))}</b></div>`).join('')}</div>`;
  return stack + legend;
}

function renderHistogram(items = [], total = 0) {
  if (!items.length || !total) return emptyVisual('O histograma aparecerá quando houver estudantes com base individual adequada e participação completa.');
  const width = 520; const height = 215; const left = 34; const bottom = 38; const top = 18; const usableH = height - bottom - top; const usableW = width - left - 12;
  const max = Math.max(1, ...items.map((x) => Number(x.alunos || 0)));
  const gap = 5; const bw = usableW / items.length - gap;
  const bars = items.map((item, index) => {
    const count = Number(item.alunos || 0); const h = usableH * count / max; const x = left + index * (bw + gap); const y = top + usableH - h;
    return `<g><rect x="${x}" y="${y}" width="${Math.max(1,bw)}" height="${h}" rx="5" fill="${heatColor(item.inicio + 5)}"><title>${escapeHtml(item.rotulo)}: ${count} aluno(s)</title></rect><text x="${x + bw/2}" y="${height - 18}" text-anchor="middle" class="visual-axis-label">${item.inicio}</text>${count ? `<text x="${x + bw/2}" y="${Math.max(12,y-4)}" text-anchor="middle" class="visual-value">${count}</text>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribuição do desempenho"><line x1="${left}" y1="${top+usableH}" x2="${width-4}" y2="${top+usableH}" class="visual-grid-line"/>${bars}<text x="${width-10}" y="${height-18}" text-anchor="end" class="visual-axis-label">100</text></svg><div class="visual-summary-row"><span class="visual-summary-chip"><b>${total}</b> estudante(s) no histograma</span></div>`;
}

function renderClassVisual(items = [], general = 0) {
  if (!items.length) return emptyVisual('Sem turmas para comparar.');
  const width = 700; const height = 250; const left = 44; const bottom = 48; const top = 20; const usableH = height - bottom - top; const usableW = width - left - 18;
  const groupW = usableW / items.length; const barW = Math.min(44, groupW * .28);
  const lines = [0,25,50,70,100].map((v) => { const y=top+usableH*(1-v/100); return `<line x1="${left}" y1="${y}" x2="${width-12}" y2="${y}" class="${[50,70].includes(v)?'visual-threshold':'visual-grid-line'}"/><text x="${left-7}" y="${y+4}" text-anchor="end" class="visual-axis-label">${v}</text>`; }).join('');
  const avgY = top + usableH * (1 - Math.max(0,Math.min(100,general))/100);
  const bars = items.map((item,index) => { const cx=left+groupW*(index+.5); const score=Math.max(0,Math.min(100,diagnosticValue(item))); const coverage=Math.max(0,Math.min(100,Number(item.coberturaPercentual||0))); const sh=usableH*score/100; const ch=usableH*coverage/100; return `<g><rect x="${cx-barW-2}" y="${top+usableH-sh}" width="${barW}" height="${sh}" rx="5" fill="${visualColorByLevel(item.nivel)}"><title>${escapeHtml(item.turma)} · desempenho ${pct(score)}</title></rect><rect x="${cx+2}" y="${top+usableH-ch}" width="${barW}" height="${ch}" rx="5" fill="rgba(73,205,236,.5)"><title>${escapeHtml(item.turma)} · cobertura ${pct(coverage)}</title></rect><text x="${cx}" y="${height-20}" text-anchor="middle" class="visual-axis-title">${escapeHtml(item.turma)}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparação entre turmas">${lines}<line x1="${left}" y1="${avgY}" x2="${width-12}" y2="${avgY}" stroke="#f6fbff" stroke-width="1.2" stroke-dasharray="3 5"><title>Média geral ${pct(general)}</title></line>${bars}<text x="${width-14}" y="${avgY-5}" text-anchor="end" class="visual-axis-label">média ${pct(general)}</text></svg><div class="visual-summary-row"><span class="visual-summary-chip"><i class="band-swatch" style="background:#43cfa0"></i> desempenho</span><span class="visual-summary-chip"><i class="band-swatch" style="background:rgba(73,205,236,.7)"></i> cobertura</span></div>`;
}

function renderParticipation(items = []) {
  if (!items.length) return emptyVisual('Sem dias de aplicação cadastrados.');
  return items.map((item) => { const total=Math.max(1,Number(item.previstos||0)); const present=Number(item.presentes||0); const absent=Number(item.ausentes||0); return `<div class="visual-participation-row"><span>${item.dia}º dia</span><div class="visual-participation-track"><i class="visual-participation-present" style="width:${present/total*100}%" title="${present} presente(s)"></i><i class="visual-participation-absent" style="width:${absent/total*100}%" title="${absent} ausência(s) confirmada(s)"></i></div><b>${present}/${total}</b></div>`; }).join('') + '<div class="visual-summary-row"><span class="visual-summary-chip">verde = realizado</span><span class="visual-summary-chip">rosa = ausência confirmada</span></div>';
}

function renderSkillsHeatmap(items = []) {
  if (!items.length) return emptyVisual('As habilidades ENEM aparecerão quando o simulado estiver mapeado e houver resultados.');
  const areas = new Map();
  for (const item of items) { const key=item.areaCodigo||item.areaNome||'OUTRA'; if(!areas.has(key)) areas.set(key,{name:item.areaNome||key,items:[]}); areas.get(key).items.push(item); }
  return [...areas.values()].map((area) => `<div class="heat-area"><div class="heat-area-label">${escapeHtml(area.name)}</div><div class="heat-cells">${area.items.map((item) => { const label=(item.areaCodigo?`${item.areaCodigo}-`:'')+(item.codigo||'H?'); const title=`${label} · ${item.descricao}\nDesempenho: ${pct(item.percentualPontuacao)}\nCobertura: ${pct(item.coberturaPercentual)}\nQuestões: ${item.questoes}\nEstudantes: ${item.estudantes}\nEvidência: ${item.evidenciaSuficiente?'sustentada':'indicativa'}`; return `<span class="heat-cell ${item.evidenciaSuficiente?'':'indicative'}" style="background:${heatColor(item.percentualPontuacao)}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`; }).join('')}</div></div>`).join('');
}

function renderQuestionBands(items = []) {
  const total = items.reduce((sum,item)=>sum+Number(item.quantidade||0),0);
  if (!total) return emptyVisual('Sem questões classificadas por faixa de acerto.');
  const width=510,height=215,left=45,bottom=54,top=20,usableH=height-bottom-top,usableW=width-left-10; const max=Math.max(1,...items.map(x=>Number(x.quantidade||0))); const bw=usableW/items.length*.68; const step=usableW/items.length;
  const colors=['#9f3651','#cf685c','#b69d4a','#4aa780','#35a9c7','#60788c'];
  const bars=items.map((item,index)=>{const count=Number(item.quantidade||0),h=usableH*count/max,x=left+index*step+(step-bw)/2,y=top+usableH-h;return `<g><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="5" fill="${colors[index%colors.length]}"><title>${escapeHtml(item.rotulo)}: ${count} questão(ões)</title></rect><text x="${x+bw/2}" y="${height-32}" text-anchor="middle" class="visual-axis-label">${escapeHtml(item.rotulo.split(' ')[0])}</text><text x="${x+bw/2}" y="${Math.max(12,y-5)}" text-anchor="middle" class="visual-value">${count}</text></g>`}).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Questões por faixa de acerto"><line x1="${left}" y1="${top+usableH}" x2="${width-10}" y2="${top+usableH}" class="visual-grid-line"/>${bars}</svg>`;
}

function renderEvolutionVisual(comparison) {
  if (!comparison?.alunosComparados) return emptyVisual('Selecione um simulado de referência na configuração para visualizar a evolução dos mesmos estudantes.');
  const areas = comparison.porArea || [];
  if (!areas.length) return `<div class="visual-empty"><b>${comparison.mediaVariacao>0?'+':''}${pct(comparison.mediaVariacao)}</b><br>${comparison.alunosComparados} estudante(s) comparado(s) · ${comparison.melhoraram} melhoraram · ${comparison.reduziram} reduziram</div>`;
  const width=700,height=250,left=120,right=50,top=24,row=42,usable=width-left-right;
  const grid=[0,25,50,70,100].map(v=>{const x=left+usable*v/100;return `<line x1="${x}" y1="8" x2="${x}" y2="${height-30}" class="${[50,70].includes(v)?'visual-threshold':'visual-grid-line'}"/><text x="${x}" y="${height-10}" text-anchor="middle" class="visual-axis-label">${v}%</text>`}).join('');
  const rows=areas.map((item,index)=>{const y=top+index*row;const x1=left+usable*Math.max(0,Math.min(100,item.anterior))/100;const x2=left+usable*Math.max(0,Math.min(100,item.atual))/100;const delta=Number(item.variacao||0);return `<g><text x="0" y="${y+5}" class="visual-axis-title">${escapeHtml(item.rotulo)}</text><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="visual-line" stroke="${delta>=0?'#43cfa0':'#e06f7b'}"/><circle cx="${x1}" cy="${y}" r="5" fill="#71899b"><title>Referência ${pct(item.anterior)}</title></circle><circle cx="${x2}" cy="${y}" r="6" fill="${delta>=0?'#43cfa0':'#e06f7b'}"><title>Atual ${pct(item.atual)} · ${delta>0?'+':''}${pct(delta)}</title></circle><text x="${Math.min(width-30,Math.max(x1,x2)+10)}" y="${y+4}" class="visual-value">${delta>0?'+':''}${pct(delta)}</text></g>`}).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução por área">${grid}${rows}</svg><div class="visual-summary-row"><span class="visual-summary-chip"><b>${comparison.alunosComparados}</b> aluno(s) comparado(s)</span><span class="visual-summary-chip visual-delta-positive">↑ ${comparison.melhoraram}</span><span class="visual-summary-chip">→ ${comparison.mantiveram}</span><span class="visual-summary-chip visual-delta-negative">↓ ${comparison.reduziram}</span></div>`;
}

function renderVisualDashboard() {
  const data = state.dashboard || {};
  const visual = data.analiseVisual || {};
  const summary = data.resumo || {};
  $('#visualAreaChart').innerHTML = renderAreaVisual(visual.porArea || data.porArea || []);
  $('#visualBandDistribution').innerHTML = renderBandVisual(visual.distribuicaoFaixas || data.distribuicaoAlunos || []);
  $('#visualHistogram').innerHTML = renderHistogram(visual.histogramaDesempenho || [], Number(visual.resumo?.alunosValidosHistograma || 0));
  $('#visualClassChart').innerHTML = renderClassVisual(visual.porTurma || data.porTurma || [], Number(summary.percentualPontuacao || 0));
  $('#visualParticipation').innerHTML = renderParticipation(visual.participacaoPorDia || data.participacaoPorDia || []);
  $('#visualSkillsHeatmap').innerHTML = renderSkillsHeatmap(visual.habilidadesEnem || []);
  $('#visualQuestionBands').innerHTML = renderQuestionBands(visual.faixasQuestoes || []);
  $('#visualEvolutionChart').innerHTML = renderEvolutionVisual(state.comparacao);
}

function renderDashboard() {
  const data = state.dashboard || {};
  const summary = data.resumo || {};
  $('#dParticipants').textContent = Number(summary.participantes || 0).toLocaleString('pt-BR');
  $('#dClasses').textContent = `${summary.turmas || 0} turma(s)`;
  $('#dAccuracy').textContent = pct(summary.percentualAcerto);
  $('#dScore').textContent = pct(summary.percentualPontuacao);
  $('#dCoverage').textContent = pct(summary.coberturaPercentual);
  $('#dLanguage').textContent = summary.alunosIdiomaPendente || 0;
  $('#dNoLanguage').textContent = summary.alunosSemOpcaoIdioma || 0;
  renderVisualDashboard();

  const recalculo = Number(data.recalculoNecessario || 0);
  $('#diagnosticVersionWarning').hidden = !recalculo;
  $('#recalculateDashboard').hidden = !recalculo || !state.bootstrap?.permissoes?.gestao;
  $('#recalculateDashboard').textContent = recalculo ? `Atualizar ${recalculo} resultado(s)` : 'Cálculos atualizados';

  const leitura = data.leituraExecutiva || {};
  $('#dataStatus').textContent = leitura.statusDados === 'completo' ? 'Dados completos' : 'Resultado parcial';
  $('#dataStatus').className = `status-pill ${leitura.statusDados === 'completo' ? 'status-ready' : 'status-draft'}`;
  const distribuicao = (data.distribuicaoAlunos || []).map((item) => `<span class="group-chip"><span>${escapeHtml(levelLabel(item.nivel))}</span><b>${item.quantidade || 0}</b></span>`).join('');
  $('#executiveSummary').innerHTML = `<p class="executive-lead">${escapeHtml(leitura.sintese || 'Importe resultados para gerar a leitura executiva.')}</p><p class="executive-criterion">${escapeHtml(leitura.criterio || '')}</p><div class="group-summary">${distribuicao}</div>`;
  const metodologia = data.metodologia || {};
  $('#methodologySummary').innerHTML = `${(metodologia.indicadores || []).map((item) => `<div class="method-item"><b>${escapeHtml(item.nome)}</b><span>${escapeHtml(item.formula)}</span><span><strong>Uso:</strong> ${escapeHtml(item.uso)}</span></div>`).join('')}<p class="method-note">${escapeHtml(metodologia.observacao || '')}</p>`;

  const alertas = data.alertasIntegridade || [];
  $('#integrityAlerts').innerHTML = alertas.length
    ? alertas.map((item) => `<article class="action-priority"><span>!</span><b>${escapeHtml(item.titulo)}</b><p>${escapeHtml(item.mensagem)}</p><small><strong>Ação:</strong> ${escapeHtml(item.acaoSugerida)}</small><small><strong>Base:</strong> ${escapeHtml(item.evidencia)}</small></article>`).join('')
    : emptyRank('A base não apresenta alerta de integridade relevante neste recorte.');

  const prioridadesPedagogicas = data.prioridadesPedagogicas || data.acoesGestao || [];
  $('#managementActions').innerHTML = prioridadesPedagogicas.length
    ? prioridadesPedagogicas.map((item) => `<article class="action-priority"><span>${item.prioridade}</span><b>${escapeHtml(item.titulo)}</b><p>${escapeHtml(item.porQue)}</p><small><strong>Nível:</strong> ${escapeHtml(item.nivelIntervencao || 'pedagógico')}</small><small><strong>Ação:</strong> ${escapeHtml(item.acaoSugerida)}</small><small><strong>Base:</strong> ${escapeHtml(item.evidencia)}</small></article>`).join('')
    : emptyRank('Ainda não há prioridade pedagógica sustentada pela evidência disponível.');

  const areas = data.porArea || [];
  $('#areaBars').innerHTML = areas.length ? areas.map((item) => `<div class="bar-row" title="${escapeHtml(`${levelLabel(item.nivel)} · ${item.evidencias || 0} respostas observadas`)}"><span class="label">${escapeHtml(item.rotulo)}</span><div class="bar-track"><div class="bar-fill ${escapeHtml(item.nivel)}" style="width:${Math.max(0, Math.min(100, diagnosticValue(item)))}%"></div></div><span class="bar-value">${pct(diagnosticValue(item))}</span></div>`).join('') : emptyRank('Importe resultados para visualizar as áreas.');
  $('#seriesSummary').innerHTML = (data.porSerie || []).map((item) => `<span class="group-chip"><span>${escapeHtml(item.serie)} · ${item.alunos} aluno(s)</span><b>${pct(diagnosticValue(item))}</b></span>`).join('');

  const days = data.porDia || [];
  $('#dayPerformance').innerHTML = days.length ? days.map((item) => `<div class="bar-row" title="${escapeHtml(`${item.evidencias || 0} respostas observadas`)}"><span class="label">${escapeHtml(item.rotulo)}</span><div class="bar-track"><div class="bar-fill ${escapeHtml(item.nivel)}" style="width:${Math.max(0, Math.min(100, diagnosticValue(item)))}%"></div></div><span class="bar-value">${pct(diagnosticValue(item))}</span></div>`).join('') : emptyRank('Sem desempenho por dia.');
  const classes = data.porTurma || [];
  $('#classComparison').innerHTML = classes.length ? `<table><thead><tr><th>Turma</th><th>Alunos</th><th>Desempenho</th><th>Cobertura</th><th>Diferença geral</th><th>Situação</th></tr></thead><tbody>${classes.map((item) => {
    const delta = Number(item.diferencaGeral || 0);
    return `<tr><td><b>${escapeHtml(item.turma)}</b></td><td>${item.alunos || 0}</td><td>${pct(diagnosticValue(item))}</td><td>${pct(item.coberturaPercentual)}</td><td class="${delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : ''}">${delta > 0 ? '+' : ''}${pct(delta)}</td><td>${escapeHtml(levelLabel(item.nivel))}</td></tr>`;
  }).join('')}</tbody></table>` : emptyRank('Sem turmas para comparar.');

  const metricRank = (item, index) => `<div class="rank-item"><span class="rank-index">${index + 1}</span><div><b>${escapeHtml(item.rotulo)}</b><small>${item.evidencias || 0} resposta(s) observada(s) · ${item.questoes || item.totalQuestoes || 0} questão(ões) · ${item.estudantesComEvidencia || item.estudantes || 0} aluno(s)</small></div><span class="rank-value">${pct(diagnosticValue(item))}</span></div>`;
  const enemRank = (item, index) => `<div class="rank-item"><span class="rank-index">${index + 1}</span><div><b>${escapeHtml(enemMetricLabel(item))}</b><small>${item.evidencias || 0} resposta(s) observada(s) · ${item.questoes || 0} questão(ões) · ${item.estudantesComEvidencia || item.estudantes || 0} aluno(s)${item.questoesAproximadas ? ` · ${item.questoesAproximadas} mapeamento(s) aproximado(s)` : ''}</small></div><span class="rank-value">${pct(diagnosticValue(item))}</span></div>`;
  renderRank('#priorityAxes', data.prioridadesEixo, metricRank);
  renderRank('#priorityContents', data.prioridadesConteudo, metricRank);
  renderRank('#prioritySkills', data.prioridadesHabilidadeEnem?.length ? data.prioridadesHabilidadeEnem : data.prioridadesHabilidade, data.prioridadesHabilidadeEnem?.length ? enemRank : metricRank);
  renderRank('#priorityQuestions', data.questoesPrioritarias, (item, index) => `<div class="rank-item"><span class="rank-index">${index + 1}</span><div><b>${escapeHtml(item.codigoQuestao)} · ${escapeHtml(item.variante)}</b><small>${escapeHtml(item.conteudo || item.eixoPedagogico || item.area || 'Sem classificação')} · ${escapeHtml(String(item.leituraQuestao || '').replaceAll('_', ' '))} · ${item.observadas || 0} observada(s)${item.distratorDominante ? ` · distrator ${escapeHtml(item.distratorDominante)} em ${pct(item.concentracaoDistrator)} dos erros` : ''}${item.discriminacao?.disponivel ? ` · discriminação ${item.discriminacao.indice > 0 ? '+' : ''}${item.discriminacao.indice.toFixed(1)} p.p.` : ''}</small></div><span class="rank-value">${pct(diagnosticValue(item))}</span></div>`);
  renderRank('#interventionGroups', data.gruposIntervencao, (item, index) => `<div class="rank-item"><span class="rank-index">${index + 1}</span><div><b>${escapeHtml(item.rotulo)}</b><small>${item.alunos.slice(0, 4).map((student) => `${student.nome} (${student.turma})`).join(' · ')}${item.alunos.length > 4 ? ` +${item.alunos.length - 4}` : ''}</small></div><span class="rank-value">${item.alunos.length}</span></div>`);
  const strengthsEnem = data.pontosFortesHabilidadeEnem || [];
  const strengths = (strengthsEnem.length ? [...strengthsEnem, ...(data.pontosFortesConteudo || [])] : [...(data.pontosFortesHabilidade || []), ...(data.pontosFortesConteudo || [])])
    .sort((a, b) => diagnosticValue(b) - diagnosticValue(a));
  renderRank('#strengths', strengths, strengthsEnem.length ? ((item, index) => item.areaCodigo ? enemRank(item, index) : metricRank(item, index)) : metricRank);
  renderRank('#priorityStudents', data.alunosPrioritarios, (item, index) => `<div class="rank-item"><span class="rank-index">${index + 1}</span><div><b>${escapeHtml(item.nome)} · ${escapeHtml(item.turma)}</b><small>${escapeHtml(levelLabel(item.faixaOperacional))} · ${(item.necessidades || []).map((need) => escapeHtml(need.rotulo)).join(' · ') || 'sem alvo específico sustentado por múltiplos itens'} · cobertura ${pct(item.coberturaPercentual)}</small></div><span class="rank-value">${pct(item.percentualPontuacao)}</span></div>`);

  const comparison = state.comparacao;
  if (!comparison?.alunosComparados) {
    $('#evolutionBox').innerHTML = '<p>Vincule um simulado de referência na configuração para comparar os mesmos alunos ao longo do tempo.</p>';
  } else {
    const variation = Number(comparison.mediaVariacao || 0);
    $('#evolutionBox').innerHTML = `<strong class="${variation > 0 ? 'positive' : variation < 0 ? 'negative' : ''}">${variation > 0 ? '+' : ''}${pct(variation)}</strong><p>variação média na pontuação de ${comparison.alunosComparados} aluno(s)</p><div class="evolution-stats"><span>↑ ${comparison.melhoraram}</span><span>→ ${comparison.mantiveram}</span><span>↓ ${comparison.reduziram}</span></div>`;
  }
}

function studentSituation(item) {
  const cfg = state.dashboard?.configuracao || { percentualConsolidado: 70, percentualAtencao: 50, minimoCoberturaIndividual: 80 };
  const coverage = Number(item.resumoGeral?.coberturaPercentual || 0);
  if ((item.diasAusentes || []).length) return ['Participação parcial', 'text-mid'];
  if (Number(item.resumoGeral?.pendentesIdioma) > 0) return ['Idioma pendente', 'text-mid'];
  if (coverage < Number(cfg.minimoCoberturaIndividual || 80)) return ['Base incompleta', 'text-mid'];
  if (Number(item.resumoGeral?.semOpcaoIdioma) > 0) return ['Língua não marcada', 'text-mid'];
  const score = Number(item.resumoGeral?.percentualPontuacao || 0);
  if (score >= cfg.percentualConsolidado) return ['Consolidado', 'text-good'];
  if (score >= cfg.percentualAtencao) return ['Em desenvolvimento', 'text-mid'];
  if (score < cfg.percentualAtencao * 0.5) return ['Crítico', 'text-bad'];
  if (score < cfg.percentualAtencao * 0.8) return ['Prioridade alta', 'text-bad'];
  return ['Em atenção', 'text-mid'];
}

async function loadResults() {
  if (!state.current) return;
  const params = new URLSearchParams({ pagina: state.resultPage, limite: 50 });
  const turma = $('#dashboardClass').value;
  const search = $('#studentSearch').value.trim();
  if (turma) params.set('turma', turma);
  if (search) params.set('busca', search);
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados?${params}`);
    state.resultPages = Math.max(1, response.paginacao.paginas || 1);
    $('#studentRows').innerHTML = response.resultados?.length ? response.resultados.map((item) => {
      const [situation, cls] = studentSituation(item);
      const idiomaEfetivo = resultLanguageValue(item);
      return `<tr data-result-id="${escapeHtml(item._id)}" tabindex="0" role="button"><td><b>${escapeHtml(item.alunoNomeSnapshot)}</b></td><td>${escapeHtml(item.alunoTurmaSnapshot)}</td><td class="${idiomaEfetivo === 'NAO_INFORMADO' ? 'text-mid' : ''}">${escapeHtml(resultLanguageLabel(item))}</td><td>${pct(item.resumoGeral?.percentualAcerto)}</td><td>${pct(item.resumoGeral?.percentualPontuacao)}</td><td>${pct(item.resumoGeral?.coberturaPercentual)}</td><td><span class="status-text ${cls}">${situation}</span></td></tr>`;
    }).join('') : '<tr><td colspan="7">Nenhum resultado neste filtro.</td></tr>';
    $('#studentPage').textContent = `Página ${response.paginacao.pagina} de ${state.resultPages}`;
    $('#prevStudents').disabled = state.resultPage <= 1;
    $('#nextStudents').disabled = state.resultPage >= state.resultPages;
    $$('[data-result-id]').forEach((row) => {
      const open = () => openStudent(row.dataset.resultId);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function metricLines(items) {
  if (!items?.length) return '<p class="muted">Sem classificação disponível.</p>';
  return `<div class="metric-table">${items.map((item) => `<div class="metric-line"><span>${escapeHtml(item.rotulo)}<small>${item.acertos || 0} acerto(s) em ${item.observadas ?? ((item.respondidas || 0) + (item.brancos || 0))} resposta(s) observada(s)</small></span><b>${pct(diagnosticValue(item))}</b><span class="${item.nivel === 'prioritario' ? 'text-bad' : item.nivel === 'consolidado' ? 'text-good' : 'text-mid'}">${escapeHtml(levelLabel(item.nivel))}</span></div>`).join('')}</div>`;
}

function studentDiagnosticGroup(items, nivel, limit = 6) {
  return (items || []).filter((item) => item.nivel === nivel && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO')
    .sort((a, b) => nivel === 'consolidado' ? diagnosticValue(b) - diagnosticValue(a) : diagnosticValue(a) - diagnosticValue(b))
    .slice(0, limit);
}

function individualPlan(item) {
  const r = item.resumoGeral || {};
  const cfg = state.dashboard?.configuracao || { minimoCoberturaIndividual: 80 };
  const coverage = Number(r.coberturaPercentual || 0);
  const minCoverage = Number(cfg.minimoCoberturaIndividual || 80);
  const idiomaPendente = Number(r.pendentesIdioma || 0) > 0;

  const diasAusentes = (item.diasAusentes || []).map(Number).filter(Boolean);
  if (idiomaPendente || coverage < minCoverage) {
    return [{
      title: 'Concluir a base antes da decisão individual',
      detail: idiomaPendente
        ? 'A língua estrangeira ainda está pendente. Resolva essa conferência antes de concluir necessidades individuais.'
        : `A cobertura está em ${pct(coverage)}, abaixo do mínimo individual de ${pct(minCoverage)}. Complete ou justifique a base ausente antes de indicar intervenção individual.`,
    }];
  }

  const priorities = studentDiagnosticGroup([...(item.porHabilidadeEnem || []), ...(item.porHabilidade || []), ...(item.porConteudo || [])], 'prioritario', 3);
  const actions = priorities.map((metric) => ({
    title: `Retomar ${metric.rotulo}`,
    detail: `Desempenho de ${pct(diagnosticValue(metric))} em ${metric.observadas || metric.totalQuestoes || 0} evidência(s). Aplicar retomada e nova verificação equivalente.`,
  }));
  if (diasAusentes.length) actions.unshift({
    title: 'Participação parcial — interpretar somente o que foi realizado',
    detail: `Ausência confirmada em ${diasAusentes.map((dia) => `${dia}º dia`).join(', ')}. O desempenho global não deve ser comparado como se o estudante tivesse realizado o simulado completo; use as áreas e habilidades dos dias presentes.`,
  });
  if (coverage < 100) actions.unshift({
    title: 'Resultado ainda parcialmente coberto',
    detail: `A cobertura está em ${pct(coverage)}. O plano pode ser usado como hipótese de trabalho, mas a base ainda não está completa.`,
  });
  if (Number(r.semOpcaoIdioma || 0) > 0) actions.unshift({
    title: 'Orientar o preenchimento da língua estrangeira',
    detail: 'O aluno não marcou Inglês nem Espanhol; as questões 1–4 receberam zero sem atribuição a uma língua fictícia. Esta ocorrência é procedimental e não é alvo curricular.',
  });
  return actions.slice(0, 4);
}

function applicationDays() {
  return [...new Set((state.current?.questoes || [])
    .map((question) => Number(question.dia || 1))
    .filter((day) => Number.isInteger(day) && day > 0))]
    .sort((a, b) => a - b);
}

function participationControlHtml(item) {
  if (!state.bootstrap?.permissoes?.gestao) return '';
  const absent = new Set((item.diasAusentes || []).map(Number));
  const days = applicationDays();
  if (!days.length) return '';
  return `<div class="callout"><b>Participação por dia</b><p>Corrija aqui uma ausência confirmada mesmo depois do processamento. As respostas daquele dia não são apagadas; ficam preservadas para restauração.</p><div class="inline-search" style="margin-top:10px;flex-wrap:wrap">${days.map((day) => `<label class="field" style="min-width:180px"><span>${day}º dia</span><select class="detail-participation-day" data-day="${day}" data-original="${absent.has(day) ? 'ausente' : 'presente'}"><option value="presente" ${absent.has(day) ? '' : 'selected'}>Realizado / aplicável</option><option value="ausente" ${absent.has(day) ? 'selected' : ''}>Ausência confirmada</option></select></label>`).join('')}<button class="btn btn-secondary btn-small" id="saveDetailParticipation" type="button">Salvar participação</button></div></div>`;
}

async function openStudent(id) {
  setLoading(true, 'Abrindo diagnóstico individual…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados/${id}`);
    const item = response.resultado;
    $('#studentDetailTitle').textContent = item.alunoNomeSnapshot;
    const diasAusentes = (item.diasAusentes || []).map(Number).filter(Boolean).sort((a, b) => a - b);
    const textoAusencia = diasAusentes.length ? ` · Ausente: ${diasAusentes.map((dia) => `${dia}º dia`).join(', ')}` : '';
    $('#studentDetailMeta').textContent = `${item.alunoTurmaSnapshot} · ${resultLanguageLabel(item)}${textoAusencia}`;
    const r = item.resumoGeral || {};
    const diasComIdioma = new Set((state.current?.questoes || []).filter((questao) => (questao.variantes || []).some((variante) => ['INGLES', 'ESPANHOL'].includes(text(variante.codigo).toUpperCase()))).map((questao) => Number(questao.dia || 1)));
    const ausenteNoDiaDeIdioma = resultAbsentOnLanguageDay(item) || diasAusentes.some((dia) => diasComIdioma.has(dia));
    const idiomaPreservado = text(item.idiomaEstrangeiroPreservado || item.idiomaEstrangeiro).toUpperCase();
    const idiomaOrigemPreservada = text(item.idiomaOrigemPreservada || item.idiomaOrigem) || 'nao_informado';
    const idiomaPreservadoConfirmado = ['INGLES', 'ESPANHOL', 'NAO_MARCADO'].includes(idiomaPreservado);
    const languageAbsenceNotice = ausenteNoDiaDeIdioma && currentHasLanguage() ? `<div class="callout"><b>Língua estrangeira não aplicável</b><p>O estudante esteve ausente em todo o dia que contém Inglês/Espanhol. Por isso, não existe pendência de língua para este resultado. ${idiomaPreservadoConfirmado ? `A conferência anterior (${escapeHtml(languageLabel(idiomaPreservado))}, origem ${escapeHtml(idiomaOrigemPreservada)}) permanece preservada e será reutilizada se a ausência for desfeita.` : 'O registro anterior permanece preservado para restauração, sem exigir escolha de idioma durante a ausência.'}</p></div>` : '';
    const languageControl = state.bootstrap.permissoes.gestao && currentHasLanguage() && !ausenteNoDiaDeIdioma ? `<div class="callout"><b>Conferência de língua estrangeira</b><p>${item.idiomaEstrangeiro === 'NAO_INFORMADO' ? 'As questões de idioma estão pendentes.' : item.idiomaEstrangeiro === 'NAO_MARCADO' ? 'O aluno não marcou nenhuma opção; as questões 1–4 receberam zero.' : `Registrado como ${languageLabel(item.idiomaEstrangeiro)} a partir de ${escapeHtml(item.idiomaOrigem)}.`}</p><div class="inline-search" style="margin-top:10px"><select id="detailLanguage"><option value="NAO_MARCADO" ${item.idiomaEstrangeiro === 'NAO_MARCADO' ? 'selected' : ''}>Não marcou nenhuma língua — zerar questões 1–4</option><option value="INGLES" ${item.idiomaEstrangeiro === 'INGLES' ? 'selected' : ''}>Inglês</option><option value="ESPANHOL" ${item.idiomaEstrangeiro === 'ESPANHOL' ? 'selected' : ''}>Espanhol</option></select><button class="btn btn-secondary btn-small" id="saveDetailLanguage" type="button">Confirmar e recalcular</button></div></div>` : '';
    const observadas = Number(r.observadas ?? ((Number(r.respondidas) || 0) + (Number(r.brancos) || 0))) || 0;
    const diagnosticTargets = [...(item.porHabilidadeEnem || []), ...(item.porHabilidade || []), ...(item.porConteudo || [])];
    const priorities = studentDiagnosticGroup(diagnosticTargets, 'prioritario');
    const strengths = studentDiagnosticGroup(diagnosticTargets, 'consolidado');
    const development = studentDiagnosticGroup(diagnosticTargets, 'em_desenvolvimento');
    const plan = individualPlan(item);
    $('#studentDetail').innerHTML = `
      <div class="detail-metrics">${[['Acertos', `${r.acertos || 0} de ${observadas}`], ['Desempenho confirmado', pct(r.percentualPontuacao)], ['Taxa de acerto nas marcadas', pct(r.percentualAcerto)], ['Cobertura dos dados', pct(r.coberturaPercentual)]].map(([label, value]) => `<div class="info-tile"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
      <div class="callout"><b>Como ler este resultado</b><p>O desempenho confirmado considera somente ${observadas} resposta(s) efetivamente conferida(s), incluindo ${r.brancos || 0} branco(s) como zero. As ${r.naoInformadas || 0} resposta(s) não importada(s) aparecem na cobertura e não são tratadas como erro. Este percentual é diagnóstico por acertos brutos, não nota TRI do ENEM.</p></div>
      ${participationControlHtml(item)}
      ${diasAusentes.length ? `<div class="callout"><b>Ausência confirmada</b><p>O estudante não participou de ${diasAusentes.map((dia) => `${dia}º dia`).join(', ')}. As questões desses dias foram excluídas do denominador, da cobertura e das inferências pedagógicas. O diagnóstico abaixo considera somente os dias efetivamente realizados.</p></div>` : ''}
      ${languageAbsenceNotice}
      ${languageControl}
      ${(item.avisos || []).length ? `<div class="warning-list">${item.avisos.map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`).join('')}</div>` : ''}
      <div class="detail-section"><h3>Plano de ação sugerido</h3>${plan.length ? `<div class="action-priority-list">${plan.map((action, index) => `<article class="action-priority"><span>${index + 1}</span><b>${escapeHtml(action.title)}</b><p>${escapeHtml(action.detail)}</p></article>`).join('')}</div>` : '<p class="muted">Não há prioridade sustentada por evidência suficiente.</p>'}</div>
      <div class="detail-section"><h3>Prioridades reais</h3>${metricLines(priorities)}</div>
      <div class="detail-section"><h3>Pontos consolidados</h3>${metricLines(strengths)}</div>
      <div class="detail-section"><h3>Em desenvolvimento</h3>${metricLines(development)}</div>
      <div class="detail-section"><h3>Desempenho por dia</h3>${metricLines(item.porDia)}</div>
      <div class="detail-section"><h3>Áreas do conhecimento</h3>${metricLines(item.porArea)}</div>
      <div class="detail-section"><h3>Conteúdos</h3>${metricLines(item.porConteudo)}</div>
      <div class="detail-section"><h3>Habilidades ENEM</h3>${metricLines(item.porHabilidadeEnem)}</div><div class="detail-section"><h3>Habilidades pedagógicas</h3>${metricLines(item.porHabilidade)}</div>
      <div class="detail-section"><h3>Descritores</h3>${metricLines(item.porDescritor)}</div>
      <div class="detail-section"><h3>Questões</h3><div class="question-chips">${(item.respostas || []).map((answer) => `<span class="question-chip ${escapeHtml(answer.situacao.toLowerCase())}" title="${escapeHtml(answer.conteudo || answer.area || 'Sem classificação')} · Resposta: ${escapeHtml(answer.resposta || '—')} · Gabarito: ${escapeHtml(answer.gabarito || '—')}">${escapeHtml(answer.codigoQuestao)} · ${escapeHtml(answer.situacao.replaceAll('_', ' '))}</span>`).join('')}</div></div>`;
    if ($('#saveDetailLanguage')) $('#saveDetailLanguage').addEventListener('click', () => updateStudentLanguage(id));
    if ($('#saveDetailParticipation')) $('#saveDetailParticipation').addEventListener('click', () => updateStudentParticipation(id));
    $('#studentDialog').showModal();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function updateStudentLanguage(resultId) {
  const language = $('#detailLanguage').value;
  setLoading(true, 'Recalculando questões de idioma…');
  try {
    await api(`/api/simulados/${state.current._id}/resultados/${resultId}/idioma`, { method: 'PATCH', body: JSON.stringify({ idiomaEstrangeiro: language, idiomaOrigem: 'manual' }) });
    $('#studentDialog').close();
    toast('Língua confirmada e resultado recalculado.');
    await loadDashboard({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}


async function updateStudentParticipation(resultId) {
  const selects = $$('.detail-participation-day', $('#studentDetail'));
  const diasAusentes = selects.filter((select) => select.value === 'ausente').map((select) => Number(select.dataset.day));
  const changed = selects.some((select) => select.value !== select.dataset.original);
  if (!changed) return toast('Nenhuma mudança de participação foi selecionada.', 'warning');

  const ok = window.confirm('Confirmar a participação por dia? Ao marcar ausência, as respostas daquele dia deixam de contar no diagnóstico, mas ficam preservadas para restauração. Nenhum vínculo será perdido.');
  if (!ok) return;

  setLoading(true, 'Preservando respostas e recalculando participação…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados/participacao`, {
      method: 'PATCH',
      body: JSON.stringify({ alteracoes: [{ resultadoId: resultId, diasAusentes }] }),
    });
    $('#studentDialog').close();
    toast(response.mensagem || 'Participação atualizada e diagnóstico recalculado.');
    await loadDashboard({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}


function languageDays() {
  return new Set((state.current?.questoes || [])
    .filter((question) => (question.variantes || []).some((variant) => ['INGLES', 'ESPANHOL'].includes(text(variant.codigo).toUpperCase())))
    .map((question) => Number(question.dia || 1)));
}

function resultAbsentOnLanguageDay(item) {
  if (item?.idiomaNaoAplicavelPorAusencia === true) return true;
  const days = languageDays();
  if (!days.size) return false;
  const absent = new Set((item?.diasAusentes || []).map(Number));
  return [...days].every((day) => absent.has(day));
}

function resultLanguageValue(item) {
  if (item?.idiomaNaoAplicavelPorAusencia === true || resultAbsentOnLanguageDay(item)) return 'NAO_APLICAVEL';
  return text(item?.idiomaEstrangeiroEfetivo || item?.idiomaEstrangeiro).toUpperCase() || 'NAO_INFORMADO';
}

function resultLanguageLabel(item) {
  return resultLanguageValue(item) === 'NAO_APLICAVEL' && (item?.idiomaNaoAplicavelPorAusencia === true || resultAbsentOnLanguageDay(item))
    ? 'Não aplicável — ausência confirmada'
    : languageLabel(resultLanguageValue(item));
}

async function fetchAllProcessedResults(turma = '') {
  const all = [];
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams({ pagina: page, limite: 100 });
    if (turma) params.set('turma', turma);
    const response = await api(`/api/simulados/${state.current._id}/resultados?${params}`);
    all.push(...(response.resultados || []));
    pages = Math.max(1, Number(response.paginacao?.paginas || 1));
    page += 1;
  } while (page <= pages);
  return all;
}


function processedParticipationRowsVisible() {
  const filter = $('#processedParticipationFilter')?.value || 'parciais';
  const items = state.processedParticipationResults || [];
  if (filter === 'todos') return items;
  return items.filter((item) => Number(item.resumoGeral?.coberturaPercentual || 0) < 100 || (item.diasAusentes || []).length > 0);
}

function participationDaySelect(item, day) {
  const absent = (item.diasAusentes || []).map(Number).includes(Number(day));
  return `<select class="processed-participation-day" data-result-id="${escapeHtml(item._id)}" data-day="${day}" data-original="${absent ? 'ausente' : 'presente'}">
    <option value="presente" ${absent ? '' : 'selected'}>Realizado</option>
    <option value="ausente" ${absent ? 'selected' : ''}>Ausente</option>
  </select>`;
}

function renderProcessedParticipationReview() {
  const items = processedParticipationRowsVisible();
  const days = applicationDays();
  const head = $('#processedParticipationHead');
  const tbody = $('#processedParticipationRows');
  if (!head || !tbody) return;

  head.innerHTML = `<tr><th>Aluno</th><th>Turma</th><th>Cobertura atual</th>${days.map((day) => `<th>${day}º dia</th>`).join('')}<th>Situação atual</th></tr>`;
  tbody.innerHTML = items.length ? items.map((item) => {
    const absent = (item.diasAusentes || []).map(Number).sort((a, b) => a - b);
    const situacao = absent.length
      ? `Ausente: ${absent.map((day) => `${day}º`).join(', ')}`
      : (Number(item.resumoGeral?.coberturaPercentual || 0) < 100 ? 'Base parcial — confira se houve ausência' : 'Participação completa');
    return `<tr>
      <td><b>${escapeHtml(item.alunoNomeSnapshot)}</b></td>
      <td>${escapeHtml(item.alunoTurmaSnapshot)}</td>
      <td>${pct(item.resumoGeral?.coberturaPercentual)}</td>
      ${days.map((day) => `<td>${participationDaySelect(item, day)}</td>`).join('')}
      <td><span class="status-text ${absent.length || Number(item.resumoGeral?.coberturaPercentual || 0) < 100 ? 'text-mid' : 'text-good'}">${escapeHtml(situacao)}</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="${5 + days.length}">Nenhum aluno neste filtro.</td></tr>`;

  $$('.processed-participation-day', tbody).forEach((select) => select.addEventListener('change', updateProcessedParticipationSummary));
  updateProcessedParticipationSummary();
}

function processedParticipationChanges() {
  const rows = new Map();
  $$('.processed-participation-day', $('#processedParticipationRows')).forEach((select) => {
    const id = select.dataset.resultId;
    if (!rows.has(id)) rows.set(id, { resultadoId: id, diasAusentes: [], mudou: false });
    const row = rows.get(id);
    if (select.value === 'ausente') row.diasAusentes.push(Number(select.dataset.day));
    if (select.value !== select.dataset.original) row.mudou = true;
  });
  return [...rows.values()].filter((item) => item.mudou).map(({ resultadoId, diasAusentes }) => ({ resultadoId, diasAusentes }));
}

function updateProcessedParticipationSummary() {
  const visible = processedParticipationRowsVisible();
  const changes = processedParticipationChanges();
  const partial = visible.filter((item) => Number(item.resumoGeral?.coberturaPercentual || 0) < 100).length;
  const absent = visible.filter((item) => (item.diasAusentes || []).length > 0).length;
  const summary = $('#processedParticipationSummary');
  if (summary) summary.textContent = `${visible.length} aluno(s) exibido(s) · ${partial} com cobertura abaixo de 100% · ${absent} com ausência já confirmada · ${changes.length} alteração(ões) preparada(s).`;
  const save = $('#saveProcessedParticipation');
  if (save) save.disabled = changes.length === 0;
}

async function loadProcessedParticipationReview() {
  const turma = $('#processedParticipationClass')?.value || '';
  setLoading(true, 'Carregando participação dos resultados processados…');
  try {
    state.processedParticipationResults = await fetchAllProcessedResults(turma);
    renderProcessedParticipationReview();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function openProcessedParticipationReview() {
  if (!state.current || !state.bootstrap?.permissoes?.gestao) return;
  const classSelect = $('#processedParticipationClass');
  const dashboardClass = $('#dashboardClass');
  const options = [...(dashboardClass?.options || [])].map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</option>`).join('');
  classSelect.innerHTML = options || '<option value="">Todas permitidas</option>';
  classSelect.value = dashboardClass?.value || '';
  $('#processedParticipationFilter').value = 'parciais';
  $('#processedParticipationDialog').showModal();
  await loadProcessedParticipationReview();
}

async function saveProcessedParticipation() {
  const changes = processedParticipationChanges();
  if (!changes.length) return toast('Nenhuma alteração de participação foi selecionada.', 'warning');

  const marcadasAusentes = changes.reduce((total, item) => total + item.diasAusentes.length, 0);
  const ok = window.confirm(`Confirmar ${changes.length} revisão(ões) de participação? Há ${marcadasAusentes} marcação(ões) de dia ausente no estado final. As respostas A-E não serão apagadas; ficarão preservadas para restauração.`);
  if (!ok) return;

  setLoading(true, 'Preservando respostas e recalculando participação…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados/participacao`, {
      method: 'PATCH',
      body: JSON.stringify({ alteracoes: changes }),
    });
    $('#processedParticipationDialog').close();
    toast(response.mensagem || 'Participação atualizada e diagnóstico recalculado.');
    await loadDashboard({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function processedLanguageRowsVisible() {
  const filter = $('#processedLanguageFilter')?.value || 'pendentes';
  const items = state.processedLanguageResults || [];
  if (filter === 'todos') return items;
  return items.filter((item) => !resultAbsentOnLanguageDay(item) && ['NAO_MARCADO', 'NAO_INFORMADO'].includes(resultLanguageValue(item)));
}

function processedLanguageSelect(item) {
  const current = text(item.idiomaEstrangeiro).toUpperCase() || 'NAO_INFORMADO';
  const absent = resultAbsentOnLanguageDay(item);
  if (absent) return '<span class="status-text text-mid">Não aplicável — ausência confirmada</span>';
  return `<select class="processed-language-select" data-result-id="${escapeHtml(item._id)}" data-original="${escapeHtml(current)}">
    <option value="NAO_INFORMADO" ${current === 'NAO_INFORMADO' ? 'selected' : ''} disabled>Pendente — escolha após conferência</option>
    <option value="NAO_MARCADO" ${current === 'NAO_MARCADO' ? 'selected' : ''}>Não marcou nenhuma língua</option>
    <option value="INGLES" ${current === 'INGLES' ? 'selected' : ''}>Inglês</option>
    <option value="ESPANHOL" ${current === 'ESPANHOL' ? 'selected' : ''}>Espanhol</option>
  </select>`;
}

function renderProcessedLanguageReview() {
  const items = processedLanguageRowsVisible();
  const tbody = $('#processedLanguageRows');
  if (!tbody) return;
  tbody.innerHTML = items.length ? items.map((item) => {
    const absent = resultAbsentOnLanguageDay(item);
    const source = text(item.idiomaOrigem) || 'nao_informado';
    const stored = text(item.idiomaEstrangeiroPreservado || item.idiomaEstrangeiro).toUpperCase() || 'NAO_INFORMADO';
    const storedNote = absent && ['INGLES', 'ESPANHOL', 'NAO_MARCADO'].includes(stored)
      ? `Registro preservado: ${languageLabel(stored)} · origem ${source}`
      : absent ? 'Sem conferência necessária enquanto houver ausência confirmada' : `Origem: ${source}`;
    return `<tr>
      <td><b>${escapeHtml(item.alunoNomeSnapshot)}</b></td>
      <td>${escapeHtml(item.alunoTurmaSnapshot)}</td>
      <td><span class="status-text ${resultLanguageValue(item) === 'NAO_INFORMADO' ? 'text-mid' : ''}">${escapeHtml(resultLanguageLabel(item))}</span><small class="muted" style="display:block;margin-top:3px">${escapeHtml(storedNote)}</small></td>
      <td>${processedLanguageSelect(item)}</td>
      <td>${absent ? '—' : `<select class="processed-language-origin" data-result-id="${escapeHtml(item._id)}"><option value="prova" selected>Prova conferida</option><option value="lista">Lista aluno × língua</option><option value="cartao">Cartão-resposta</option><option value="manual">Conferência manual</option></select>`}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5">Nenhum aluno neste filtro.</td></tr>';

  $$('.processed-language-select', tbody).forEach((select) => select.addEventListener('change', updateProcessedLanguageSummary));
  updateProcessedLanguageSummary();
}

function processedLanguageChanges() {
  return $$('.processed-language-select', $('#processedLanguageRows')).map((select) => {
    const original = text(select.dataset.original).toUpperCase();
    const value = text(select.value).toUpperCase();
    if (!value || value === original || value === 'NAO_INFORMADO') return null;
    const origin = $(`.processed-language-origin[data-result-id="${CSS.escape(select.dataset.resultId)}"]`, $('#processedLanguageRows'))?.value || 'prova';
    return { resultadoId: select.dataset.resultId, idiomaEstrangeiro: value, idiomaOrigem: origin };
  }).filter(Boolean);
}

function updateProcessedLanguageSummary() {
  const visible = processedLanguageRowsVisible();
  const changes = processedLanguageChanges();
  const pending = visible.filter((item) => !resultAbsentOnLanguageDay(item) && ['NAO_MARCADO', 'NAO_INFORMADO'].includes(resultLanguageValue(item))).length;
  const nonApplicable = visible.filter((item) => resultAbsentOnLanguageDay(item)).length;
  const summary = $('#processedLanguageSummary');
  if (summary) summary.textContent = `${visible.length} aluno(s) exibido(s) · ${pending} com língua pendente/não marcada · ${nonApplicable} não aplicável(is) por ausência · ${changes.length} alteração(ões) preparada(s).`;
  const save = $('#saveProcessedLanguages');
  if (save) save.disabled = changes.length === 0;
}

async function loadProcessedLanguageReview() {
  const turma = $('#processedLanguageClass')?.value || '';
  setLoading(true, 'Carregando resultados já processados…');
  try {
    state.processedLanguageResults = await fetchAllProcessedResults(turma);
    renderProcessedLanguageReview();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function openProcessedLanguageReview() {
  if (!state.current || !state.bootstrap?.permissoes?.gestao || !currentHasLanguage()) return;
  const classSelect = $('#processedLanguageClass');
  const dashboardClass = $('#dashboardClass');
  const options = [...(dashboardClass?.options || [])].map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</option>`).join('');
  classSelect.innerHTML = options || '<option value="">Todas permitidas</option>';
  classSelect.value = dashboardClass?.value || '';
  $('#processedLanguageFilter').value = 'pendentes';
  $('#processedLanguageDialog').showModal();
  await loadProcessedLanguageReview();
}

async function saveProcessedLanguages() {
  const changes = processedLanguageChanges();
  if (!changes.length) return toast('Nenhuma alteração de língua foi selecionada.', 'warning');
  const ok = window.confirm(`Confirmar ${changes.length} correção(ões) de língua? Os vínculos dos alunos e todas as respostas já marcadas serão preservados. O Axoriin apenas recalculará as questões de língua e os diagnósticos derivados.`);
  if (!ok) return;
  setLoading(true, 'Preservando respostas e recalculando idiomas…');
  try {
    const response = await api(`/api/simulados/${state.current._id}/resultados/idiomas`, {
      method: 'PATCH',
      body: JSON.stringify({ alteracoes: changes }),
    });
    $('#processedLanguageDialog').close();
    toast(response.mensagem || 'Idiomas atualizados e diagnóstico recalculado.');
    await loadDashboard({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));
  $('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#currentSimuladoChip').addEventListener('click', () => setView('lista'));
  $('#newSimulado').addEventListener('click', openCreateDialog);
  $('#refreshList').addEventListener('click', () => loadSimulados().catch(() => null));
  $('#filterYear').addEventListener('change', () => loadSimulados().catch(() => null));
  $('#createForm').addEventListener('submit', createSimulado);
  $('#closeCreateDialog').addEventListener('click', () => $('#createDialog').close());
  $('#cancelCreateDialog').addEventListener('click', () => $('#createDialog').close());
  $('#downloadMatrix').addEventListener('click', () => { if (state.current) location.href = linkWithTenant(`/api/simulados/${state.current._id}/modelo-matriz.xlsx`); });
  $('#downloadEnemMapping').addEventListener('click', () => { if (state.current) location.href = linkWithTenant(`/api/simulados/${state.current._id}/modelo-mapeamento-enem.xlsx`); });
  $('#activateEnemMapping').addEventListener('click', activateEnemMapping);
  $('#downloadAnswers').addEventListener('click', () => { if (state.current) location.href = linkWithTenant(`/api/simulados/${state.current._id}/modelo-respostas.xlsx`); });
  $('#matrixFile').addEventListener('change', () => chooseFile($('#matrixFile'), $('#uploadMatrix')));
  $('#enemMappingFile').addEventListener('change', () => chooseFile($('#enemMappingFile'), $('#uploadEnemMapping')));
  $('#answersFile').addEventListener('change', () => chooseFile($('#answersFile'), $('#analyzeAnswers')));
  $('#scansFile').addEventListener('change', () => { chooseFile($('#scansFile'), $('#analyzeScans')); syncScanButton(); });
  $('#scanClass').addEventListener('change', syncScanButton);
  $('#scanDay').addEventListener('change', syncScanButton);
  $('#uploadMatrix').addEventListener('click', uploadMatrix);
  $('#uploadEnemMapping').addEventListener('click', uploadEnemMapping);
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#analyzeAnswers').addEventListener('click', analyzeAnswers);
  $('#analyzeScans').addEventListener('click', analyzeScans);
  $('#confirmImport').addEventListener('click', confirmImport);
  $('#recoverPreviousLinks').addEventListener('click', recoverPreviousLinks);
  $('#doStudentSearch').addEventListener('click', searchStudents);
  $('#resolveSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchStudents(); } });
  $('#resolveForm').addEventListener('submit', saveResolution);
  $('#closeResolveDialog').addEventListener('click', () => $('#resolveDialog').close());
  $('#cancelResolveDialog').addEventListener('click', () => $('#resolveDialog').close());
  $('#omrForm').addEventListener('submit', saveOmrReview);
  $('#closeOmrDialog').addEventListener('click', () => $('#omrDialog').close());
  $('#cancelOmrDialog').addEventListener('click', () => $('#omrDialog').close());
  $('#dashboardClass').addEventListener('change', loadDashboard);
  $('#recalculateDashboard').addEventListener('click', recalculateDashboard);
  $('#reviewProcessedParticipation').addEventListener('click', openProcessedParticipationReview);
  $('#closeProcessedParticipationDialog').addEventListener('click', () => $('#processedParticipationDialog').close());
  $('#cancelProcessedParticipationDialog').addEventListener('click', () => $('#processedParticipationDialog').close());
  $('#processedParticipationClass').addEventListener('change', loadProcessedParticipationReview);
  $('#processedParticipationFilter').addEventListener('change', renderProcessedParticipationReview);
  $('#saveProcessedParticipation').addEventListener('click', saveProcessedParticipation);
  $('#reviewProcessedLanguages').addEventListener('click', openProcessedLanguageReview);
  $('#closeProcessedLanguageDialog').addEventListener('click', () => $('#processedLanguageDialog').close());
  $('#cancelProcessedLanguageDialog').addEventListener('click', () => $('#processedLanguageDialog').close());
  $('#processedLanguageClass').addEventListener('change', loadProcessedLanguageReview);
  $('#processedLanguageFilter').addEventListener('change', renderProcessedLanguageReview);
  $('#saveProcessedLanguages').addEventListener('click', saveProcessedLanguages);
  $('#exportDashboard').addEventListener('click', () => {
    if (!state.current) return;
    const turma = $('#dashboardClass').value;
    location.href = linkWithTenant(`/api/simulados/${state.current._id}/exportar.xlsx${turma ? `?turma=${encodeURIComponent(turma)}` : ''}`);
  });
  $('#exportDashboardPdf').addEventListener('click', () => {
    if (!state.current) return;
    const turma = $('#dashboardClass').value;
    location.href = linkWithTenant(`/api/simulados/${state.current._id}/exportar.pdf${turma ? `?turma=${encodeURIComponent(turma)}` : ''}`);
  });
  $('#exportVisualPdf').addEventListener('click', () => {
    if (!state.current) return;
    const turma = $('#dashboardClass').value;
    location.href = linkWithTenant(`/api/simulados/${state.current._id}/exportar-visual.pdf${turma ? `?turma=${encodeURIComponent(turma)}` : ''}`);
  });
  $('#exportEnemSkillsPdf').addEventListener('click', () => {
    if (!state.current) return;
    const turma = $('#dashboardClass').value;
    location.href = linkWithTenant(`/api/simulados/${state.current._id}/exportar-habilidades-enem.pdf${turma ? `?turma=${encodeURIComponent(turma)}` : ''}`);
  });
  $('#studentSearch').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => { state.resultPage = 1; loadResults(); }, 350);
  });
  $('#prevStudents').addEventListener('click', () => { if (state.resultPage > 1) { state.resultPage -= 1; loadResults(); } });
  $('#nextStudents').addEventListener('click', () => { if (state.resultPage < state.resultPages) { state.resultPage += 1; loadResults(); } });
  $('#closeStudentDialog').addEventListener('click', () => $('#studentDialog').close());
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('#sidebar').classList.remove('open'); });
}

async function init() {
  bindEvents();
  document.querySelector('.back-link').href = linkWithTenant('/painel.html');
  setLoading(true, 'Preparando o módulo…');
  try {
    await loadBootstrap();
    await loadSimulados();
    const ultimoSimulado = recalled('ultimoSimulado');
    if (ultimoSimulado && state.simulados.some((item) => String(item._id) === ultimoSimulado)) {
      await selectSimulado(ultimoSimulado, 'diagnostico');
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', init);
