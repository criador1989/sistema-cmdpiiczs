'use strict';

const state = {
  tenant: '',
  context: null,
  dashboard: null,
  insights: null,
  options: { pessoas: [], contas: [], categorias: [], projetos: [], turmas: [] },
  people: [], movements: [], contributions: [], projects: [], assets: [], documents: [],
  templates: [], campaigns: [], accounts: [], categories: [], users: [], audit: [],
  reminderConfig: null, reminderStats: null, reminderHistory: [], reminderAvailability: {},
  activeView: 'dashboard',
};

const viewMeta = {
  dashboard: ['Gestão integrada', 'Painel geral'],
  people: ['Cadastros e vínculos', 'Pessoas'],
  finance: ['Controle financeiro', 'Movimentações'],
  contributions: ['Acompanhamento individual', 'Contribuições'],
  insights: ['Inteligência financeira', 'Inadimplência e previsão'],
  reminders: ['Cobranças e comunicação', 'Lembretes automáticos'],
  projects: ['Projetos, campanhas e eventos', 'Ações da associação'],
  assets: ['Inventário', 'Patrimônio'],
  documents: ['Governança documental', 'Documentos'],
  relationship: ['Proximidade com as famílias', 'Relacionamento'],
  settings: ['Configuração do tenant', 'Configurações'],
  audit: ['Rastreabilidade', 'Auditoria'],
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function qs(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function idOf(value) { return String(value?._id || value?.id || value || ''); }
function today() { return new Date().toISOString().slice(0, 10); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function formatDate(value) { return value ? dateFmt.format(new Date(value)) : '—'; }
function formatDateTime(value) { return value ? dateTimeFmt.format(new Date(value)) : '—'; }
function initials(name) {
  return String(name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'A';
}
function statusClass(status) {
  const value = normalize(status);
  if (['em dia', 'pago', 'ativo', 'vigente', 'enviado', 'concluido', 'em uso', 'bom', 'novo'].some(v => value.includes(v))) return 'ok';
  if (['pendente', 'parcial', 'planejamento', 'aguardando', 'vence'].some(v => value.includes(v))) return 'warn';
  if (['atrasado', 'cancelado', 'vencido', 'inativo', 'erro', 'baixado', 'ruim', 'inservivel'].some(v => value.includes(v))) return 'bad';
  return 'info';
}
function statusPill(status) { return `<span class="status ${statusClass(status)}">${escapeHtml(status || '—')}</span>`; }
function emptyRow(cols, message) { return `<tr><td colspan="${cols}" class="empty">${escapeHtml(message)}</td></tr>`; }
function emptyBlock(message) { return `<div class="empty">${escapeHtml(message)}</div>`; }

function resolveTenant() {
  const params = new URLSearchParams(location.search);
  const query = params.get('t') || params.get('tenant');
  if (query) localStorage.setItem('axoriinTenantSlug', query);
  const cookie = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('tenant='))?.split('=').slice(1).join('=');
  return query || (cookie ? decodeURIComponent(cookie) : '') || localStorage.getItem('axoriinTenantSlug') || '';
}

function withTenant(path) {
  const url = new URL(path, location.origin);
  if (state.tenant) url.searchParams.set('t', state.tenant);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function api(path, options = {}) {
  const url = new URL(`/api/associacao${path}`, location.origin);
  if (state.tenant) url.searchParams.set('t', state.tenant);
  const headers = { ...(options.headers || {}) };
  if (state.tenant) headers['x-tenant-slug'] = state.tenant;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'include', ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (response.status === 401) {
    location.href = withTenant(`/login.html?next=${encodeURIComponent(withTenant('/associacao.html'))}`);
    throw new Error('Sessão expirada.');
  }
  if (!response.ok) throw new Error(data?.mensagem || data?.error || data || `Erro HTTP ${response.status}`);
  return data;
}

async function authApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/auth${path}`, { credentials: 'include', ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.mensagem || data?.error || data || `Erro HTTP ${response.status}`);
  return data;
}

async function switchEnvironment(tenant) {
  if (!tenant || tenant === state.tenant) return;
  const data = await authApi('/trocar-ambiente', {
    method: 'POST',
    body: JSON.stringify({ tenant }),
  });
  const target = new URL(data.redirecionar || '/painel.html', location.origin);
  target.searchParams.set('t', data.tenant || tenant);
  location.href = `${target.pathname}${target.search}`;
}

async function loadEnvironments() {
  const data = await authApi('/ambientes');
  state.environments = data.ambientes || [];
  const select = qs('environmentSwitcher');
  if (select) {
    select.innerHTML = state.environments.map(item =>
      `<option value="${escapeHtml(item.tenant)}" ${item.tenant === state.tenant || item.instituicaoId === data.ambienteAtual ? 'selected' : ''}>${escapeHtml(item.sigla || item.nome)}</option>`
    ).join('');
    select.disabled = state.environments.length < 2;
  }

  const back = qs('backToAxoriin');
  if (back) {
    const other = state.environments.find(item => item.tenant !== state.tenant && item.categoria !== 'associacao')
      || state.environments.find(item => item.tenant !== state.tenant);
    back.classList.toggle('hidden', !other);
    back.dataset.targetTenant = other?.tenant || '';
    back.textContent = other ? `← Ir para ${other.sigla || other.nome}` : '← Trocar de ambiente';
  }
}

let toastTimer;
function toast(message, type = 'success') {
  const el = qs('toast');
  el.textContent = message;
  el.className = `toast show${type === 'error' ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

function can(permission) {
  const list = state.context?.usuario?.permissoes || [];
  return list.includes('*') || list.includes(permission);
}

function navigate(view) {
  if (!viewMeta[view]) return;
  state.activeView = view;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  qs('pageKicker').textContent = viewMeta[view][0];
  qs('pageTitle').textContent = viewMeta[view][1];
  qs('sidebar').classList.remove('open');
  qs('mobileBackdrop').classList.add('hidden');
  loadView(view).catch(error => toast(error.message, 'error'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadView(view) {
  const loaders = {
    dashboard: loadDashboard,
    people: loadPeople,
    finance: loadMovements,
    contributions: loadContributions,
    insights: loadInsights,
    reminders: loadReminders,
    projects: loadProjects,
    assets: loadAssets,
    documents: loadDocuments,
    relationship: loadRelationship,
    settings: loadSettings,
    audit: loadAudit,
  };
  if (loaders[view]) await loaders[view]();
}

function openModal(name, preset = {}) {
  const template = qs(`${name}Template`);
  if (!template) return toast(`Janela ${name} não encontrada.`, 'error');
  qs('modalRoot').innerHTML = '';
  qs('modalRoot').appendChild(template.content.cloneNode(true));
  document.body.style.overflow = 'hidden';
  const overlay = qs('modalRoot').querySelector('[data-modal]');
  const form = overlay?.querySelector('form');
  hydrateModalSelects(overlay);
  if (form) {
    Object.entries(preset).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (!field) return;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value ?? '';
    });
    if (form.elements.namedItem('dataMovimentacao') && !form.elements.namedItem('dataMovimentacao').value) form.elements.namedItem('dataMovimentacao').value = today();
    if (form.elements.namedItem('dataPagamento') && !form.elements.namedItem('dataPagamento').value) form.elements.namedItem('dataPagamento').value = today();
    if (form.elements.namedItem('referencia') && !form.elements.namedItem('referencia').value) form.elements.namedItem('referencia').value = currentMonth();
    bindModalForm(form);
    setTimeout(() => form.querySelector('input:not([type="hidden"]),select,textarea')?.focus(), 20);
  }
}

function closeModal() {
  qs('modalRoot').innerHTML = '';
  document.body.style.overflow = '';
}

function fillSelect(select, items, placeholder, labelFn = item => item.nome) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items.map(item => `<option value="${escapeHtml(idOf(item))}">${escapeHtml(labelFn(item))}</option>`).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function hydrateModalSelects(root = document) {
  root.querySelectorAll('[data-select="people"]').forEach(el => fillSelect(el, state.options.pessoas || [], 'Selecione', p => `${p.nome}${p.alunoNome ? ` — ${p.alunoNome}${p.alunoTurma ? ` (${p.alunoTurma})` : ''}` : ''}`));
  root.querySelectorAll('[data-select="accounts"]').forEach(el => fillSelect(el, state.options.contas || [], 'Selecione', a => `${a.nome} — ${a.tipo}`));
  root.querySelectorAll('[data-select="categories"]').forEach(el => fillSelect(el, state.options.categorias || [], 'Selecione', c => `${c.nome} — ${c.tipoMovimentacao}`));
  root.querySelectorAll('[data-select="projects"]').forEach(el => fillSelect(el, state.options.projetos || [], 'Sem vínculo', p => `${p.nome} — ${p.status}`));
}

function formObject(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [key, value] of fd.entries()) out[key] = value;
  form.querySelectorAll('input[type="checkbox"]').forEach(input => { out[input.name] = input.checked; });
  return out;
}

function bindModalForm(form) {
  const handlers = {
    personForm: submitPerson,
    movementForm: submitMovement,
    contributionForm: submitContribution,
    paymentForm: submitPayment,
    projectForm: submitProject,
    assetForm: submitAsset,
    documentForm: submitDocument,
    attachmentForm: submitAttachment,
    templateForm: submitTemplate,
    campaignForm: submitCampaign,
    accountForm: submitAccount,
    categoryForm: submitCategory,
    userForm: submitUser,
  };
  const handler = handlers[form.id];
  if (handler) form.addEventListener('submit', handler);
}

async function loadContext() {
  state.context = await api('/contexto');
  state.tenant = state.context.associacao.slug || state.tenant;
  localStorage.setItem('axoriinTenantSlug', state.tenant);
  const a = state.context.associacao;
  const u = state.context.usuario;
  qs('associationShortName').textContent = a.sigla || a.nome;
  qs('associationPlan').textContent = `Plano ${a.plano || 'piloto'}`;
  qs('tenantSlug').textContent = a.slug;
  qs('associationLogo').src = a.logoUrl || '/assets/associacao/logo-apacmdpii-czs.png';
  qs('associationLogo').onerror = () => { qs('associationLogo').src = '/assets/associacao/logo-apacmdpii-czs.png'; };
  qs('userName').textContent = u.nome;
  qs('userRole').textContent = String(u.perfilAssociacao || '').replaceAll('_', ' ');
  qs('userInitials').textContent = initials(u.nome);
  qs('heroGreeting').textContent = `Bem-vindo, ${u.nome.split(' ')[0]}.`;
  document.title = `${a.sigla || a.nome} | Axoriin Associações`;
  if (!can('usuarios:gerenciar')) qs('usersPanel')?.classList.add('hidden');
  if (!can('auditoria:ler')) document.querySelector('[data-view="audit"]')?.classList.add('hidden');
  if (!can('lembretes:ler')) document.querySelector('[data-view="reminders"]')?.classList.add('hidden');
  if (!can('relatorios:ler')) document.querySelector('[data-view="insights"]')?.classList.add('hidden');
  if (!can('lembretes:gerenciar')) {
    qs('processRemindersNow')?.classList.add('hidden');
    qs('reminderConfigForm')?.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => { el.disabled = true; });
  }
  applyWritePermissions();
}

function applyWritePermissions() {
  const map = [
    ['personModal', 'pessoas:escrever'], ['movementModal', 'financeiro:escrever'],
    ['contributionModal', 'contribuicoes:escrever'], ['projectModal', 'projetos:escrever'],
    ['assetModal', 'patrimonio:escrever'], ['documentModal', 'documentos:escrever'],
    ['templateModal', 'mensagens:escrever'], ['campaignModal', 'mensagens:escrever'],
    ['accountModal', 'financeiro:escrever'], ['categoryModal', 'financeiro:escrever'],
    ['userModal', 'usuarios:gerenciar'],
  ];
  for (const [modal, permission] of map) {
    document.querySelectorAll(`[data-open="${modal}"]`).forEach(button => button.classList.toggle('hidden', !can(permission)));
  }
}

async function loadOptions() {
  state.options = await api('/opcoes');
  document.querySelectorAll('#peopleClass,#contributionClass,#insightClass').forEach(el => {
    const current = el.value;
    el.innerHTML = '<option value="">Todas</option>' + (state.options.turmas || []).map(t => `<option>${escapeHtml(t)}</option>`).join('');
    el.value = current;
  });
  fillSelect(qs('movementAccount'), state.options.contas || [], 'Todas', a => a.nome);
}

async function loadDashboard() {
  state.dashboard = await api('/dashboard');
  const d = state.dashboard;
  qs('metricBalance').textContent = money.format(d.saldo || 0);
  qs('metricIncome').textContent = money.format(d.receitasMes || 0);
  qs('metricIncomeCount').textContent = `${d.receitasQuantidade || 0} entrada(s)`;
  qs('metricExpense').textContent = money.format(d.despesasMes || 0);
  qs('metricExpenseCount').textContent = `${d.despesasQuantidade || 0} saída(s)`;
  qs('metricPending').textContent = money.format(d.pendente || 0);
  qs('metricPendingCount').textContent = `${d.pendenciasQuantidade || 0} pendência(s)`;
  qs('accountBalanceCards').innerHTML = d.contas?.length ? d.contas.map(a => `<div class="mini-card"><span>${escapeHtml(a.tipo)}</span><strong>${escapeHtml(a.nome)}</strong><b class="${a.saldo < 0 ? 'amount-out' : 'amount-in'}">${money.format(a.saldo || 0)}</b></div>`).join('') : emptyBlock('Nenhuma conta ativa.');
  qs('birthdayList').innerHTML = d.aniversariantes?.length ? d.aniversariantes.map(p => `<div class="list-item"><div><strong>${escapeHtml(p.nome)}</strong><small>${escapeHtml(p.alunoNome || 'Sem aluno vinculado')}${p.alunoTurma ? ` • ${escapeHtml(p.alunoTurma)}` : ''}</small></div><span class="status info">${p.dias === 0 ? 'Hoje' : `${p.dias} dia(s)`}</span></div>`).join('') : emptyBlock('Nenhum aniversário nos próximos 30 dias.');
  qs('recentMovementsBody').innerHTML = d.movimentacoesRecentes?.length ? d.movimentacoesRecentes.map(m => `<tr><td>${formatDate(m.dataMovimentacao)}</td><td><strong>${escapeHtml(m.descricao)}</strong></td><td>${escapeHtml(m.pessoaNome || '—')}</td><td>${escapeHtml(m.contaNome || '—')}</td><td>${statusPill(m.status)}</td><td class="right ${m.tipo === 'Entrada' ? 'amount-in' : 'amount-out'}">${m.tipo === 'Entrada' ? '+' : '-'} ${money.format(m.valor || 0)}</td></tr>`).join('') : emptyRow(6, 'Nenhuma movimentação cadastrada.');
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function periodEndInclusive(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function renderMonthlyInsights(rows = []) {
  const root = qs('insightMonthlyChart');
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = emptyBlock('Nenhuma contribuição encontrada no período.');
    return;
  }
  const maxValue = Math.max(...rows.flatMap(row => [Number(row.previsto || 0), Number(row.pago || 0), Number(row.vencido || 0)]), 1);
  root.innerHTML = rows.map(row => {
    const bar = (value, kind) => `<div class="comparison-line"><span>${kind === 'expected' ? 'Previsto' : kind === 'paid' ? 'Pago' : 'Vencido'}</span><div class="comparison-track"><i class="${kind}" style="width:${Math.max((Number(value || 0) / maxValue) * 100, value > 0 ? 1.5 : 0)}%"></i></div><b>${money.format(value || 0)}</b></div>`;
    return `<article class="monthly-row"><div class="monthly-label"><strong>${escapeHtml(row.rotulo)}</strong><small>${formatPercent(row.taxaArrecadacao)} recebido</small></div><div class="comparison-bars">${bar(row.previsto, 'expected')}${bar(row.pago, 'paid')}${bar(row.vencido, 'overdue')}</div></article>`;
  }).join('');
}

function renderForecastInsights(rows = [], base = {}) {
  const root = qs('insightForecastCards');
  if (!root) return;
  root.innerHTML = rows.length ? rows.map(row => `<article class="forecast-card"><div class="forecast-card-head"><span>ATÉ ${Number(row.dias || 0)} DIAS</span><strong>${formatDate(row.ate)}</strong></div><dl><div><dt>Receitas previstas</dt><dd>${money.format(row.receitasPrevistasBrutas || 0)}</dd></div><div><dt>Arrecadação provável</dt><dd>${money.format(row.arrecadacaoProvavel || 0)}</dd></div><div><dt>Despesas previstas</dt><dd>${money.format(row.despesasPrevistas || 0)}</dd></div></dl><div class="forecast-result ${Number(row.saldoProjetado || 0) < 0 ? 'negative' : 'positive'}"><span>Saldo projetado</span><strong>${money.format(row.saldoProjetado || 0)}</strong></div></article>`).join('') : emptyBlock('Cadastre lançamentos futuros para formar a previsão.');
  const note = qs('insightMethodology');
  if (note) note.textContent = `${base.metodologia || ''} Taxa histórica aplicada: ${formatPercent(base.taxaArrecadacao || 0)}.`;
}

function renderAgingInsights(rows = []) {
  const root = qs('insightAging');
  if (!root) return;
  const maxValue = Math.max(...rows.map(row => Number(row.valor || 0)), 1);
  root.innerHTML = rows.length ? rows.map(row => `<div class="aging-row"><div><strong>${escapeHtml(row.rotulo)}</strong><small>${Number(row.quantidade || 0)} contribuição(ões)</small></div><div class="aging-track"><i style="width:${Math.max((Number(row.valor || 0) / maxValue) * 100, row.valor > 0 ? 2 : 0)}%"></i></div><div class="aging-value"><strong>${money.format(row.valor || 0)}</strong><small>${formatPercent(row.percentual || 0)}</small></div></div>`).join('') : emptyBlock('Não há valores em atraso.');
}

function renderInsightAlerts(rows = []) {
  const root = qs('insightAlerts');
  if (!root) return;
  root.innerHTML = rows.length ? rows.map(row => `<article class="insight-alert ${escapeHtml(row.tipo || 'info')}"><span>${row.tipo === 'critico' ? '!' : row.tipo === 'atencao' ? '△' : row.tipo === 'positivo' ? '✓' : 'i'}</span><div><strong>${escapeHtml(row.titulo)}</strong><p>${escapeHtml(row.mensagem)}</p></div></article>`).join('') : emptyBlock('Nenhum alerta para o período.');
}

async function loadInsights() {
  if (!can('relatorios:ler')) return;
  const params = new URLSearchParams();
  params.set('meses', qs('insightMonths')?.value || '12');
  if (qs('insightClass')?.value) params.set('turma', qs('insightClass').value);
  state.insights = await api(`/indicadores/financeiro?${params}`);
  const data = state.insights;
  const indicators = data.indicadores || {};
  qs('insightCollectionRate').textContent = formatPercent(indicators.taxaArrecadacao);
  qs('insightCollectionDetail').textContent = `${money.format(indicators.valorPago || 0)} recebidos de ${money.format(indicators.valorPrevisto || 0)}`;
  qs('insightDefaultRate').textContent = formatPercent(indicators.inadimplenciaPercentual);
  qs('insightOverdueValue').textContent = money.format(indicators.valorInadimplente || 0);
  qs('insightOverdueCount').textContent = `${Number(indicators.contribuicoesEmAtraso || 0)} contribuição(ões)`;
  qs('insightOverduePeople').textContent = String(indicators.contribuintesInadimplentes || 0);
  qs('insightAverageLate').textContent = `${Number(indicators.mediaDiasAtraso || 0)} dia(s)`;
  const start = data.filtros?.inicio ? new Date(data.filtros.inicio) : null;
  const end = periodEndInclusive(data.filtros?.fimExclusivo);
  qs('insightPeriodLabel').textContent = start && end ? `${formatDate(start)} a ${formatDate(end)}` : 'Período indisponível';
  renderMonthlyInsights(data.serieMensal || []);
  renderForecastInsights(data.previsao || [], data.basePrevisao || {});
  renderAgingInsights(data.envelhecimento || []);
  renderInsightAlerts(data.alertas || []);
  qs('insightClassesBody').innerHTML = data.turmas?.length ? data.turmas.map(row => `<tr><td><strong>${escapeHtml(row.turma)}</strong><br><small>${Number(row.quantidade || 0)} contribuição(ões)</small></td><td class="right">${money.format(row.previsto || 0)}</td><td class="right amount-in">${money.format(row.pago || 0)}</td><td class="right amount-out">${money.format(row.valorInadimplente || 0)}</td><td class="right">${formatPercent(row.taxaArrecadacao || 0)}</td><td class="right">${Number(row.emAtraso || 0)}</td></tr>`).join('') : emptyRow(6, 'Nenhuma turma com contribuições no período.');
  qs('insightOverdueBody').innerHTML = data.maioresPendencias?.length ? data.maioresPendencias.map(row => `<tr><td><strong>${escapeHtml(row.responsavelNome)}</strong></td><td>${escapeHtml(row.alunoNome || '—')}${row.alunoTurma ? `<br><small>${escapeHtml(row.alunoTurma)}</small>` : ''}</td><td>${escapeHtml(row.referencia || '—')}</td><td>${formatDate(row.vencimento)}</td><td class="right"><span class="status bad">${Number(row.diasAtraso || 0)} dias</span></td><td class="right amount-out">${money.format(row.valorPendente || 0)}</td></tr>`).join('') : emptyRow(6, 'Nenhuma contribuição vencida e pendente.');
}

function exportFinancialInsights() {
  const data = state.insights;
  if (!data) return toast('Atualize os indicadores antes de exportar.', 'error');
  const indicators = data.indicadores || {};
  const rows = [
    ['INDICADORES FINANCEIROS DA ASSOCIAÇÃO'],
    ['Gerado em', formatDateTime(data.geradoEm)],
    ['Período', qs('insightPeriodLabel')?.textContent || ''],
    ['Turma', data.filtros?.turma || 'Todas'],
    [],
    ['RESUMO'],
    ['Valor previsto', indicators.valorPrevisto],
    ['Valor pago', indicators.valorPago],
    ['Valor pendente no período', indicators.valorPendente],
    ['Valor inadimplente', indicators.valorInadimplente],
    ['Taxa de arrecadação', `${indicators.taxaArrecadacao || 0}%`],
    ['Taxa de inadimplência', `${indicators.inadimplenciaPercentual || 0}%`],
    ['Contribuintes em atraso', indicators.contribuintesInadimplentes],
    ['Atraso médio ponderado em dias', indicators.mediaDiasAtraso],
    [],
    ['EVOLUÇÃO MENSAL'],
    ['Mês', 'Previsto', 'Pago', 'Pendente', 'Vencido', 'Taxa de arrecadação'],
    ...(data.serieMensal || []).map(row => [row.referencia, row.previsto, row.pago, row.pendente, row.vencido, `${row.taxaArrecadacao}%`]),
    [],
    ['PREVISÃO'],
    ['Janela', 'Receitas previstas', 'Arrecadação provável', 'Despesas previstas', 'Saldo projetado'],
    ...(data.previsao || []).map(row => [`${row.dias} dias`, row.receitasPrevistasBrutas, row.arrecadacaoProvavel, row.despesasPrevistas, row.saldoProjetado]),
    [],
    ['POR TURMA'],
    ['Turma', 'Previsto', 'Pago', 'Vencido pendente', 'Taxa de arrecadação', 'Quantidade em atraso'],
    ...(data.turmas || []).map(row => [row.turma, row.previsto, row.pago, row.valorInadimplente, `${row.taxaArrecadacao}%`, row.emAtraso]),
    [],
    ['PENDÊNCIAS MAIS ANTIGAS'],
    ['Responsável', 'Aluno', 'Turma', 'Referência', 'Vencimento', 'Dias em atraso', 'Valor pendente'],
    ...(data.maioresPendencias || []).map(row => [row.responsavelNome, row.alunoNome, row.alunoTurma, row.referencia, formatDate(row.vencimento), row.diasAtraso, row.valorPendente]),
  ];
  downloadCsv(`indicadores-financeiros-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

async function loadPeople() {
  const params = new URLSearchParams();
  const fields = [['q', 'peopleSearch'], ['tipo', 'peopleType'], ['turma', 'peopleClass'], ['status', 'peopleStatus']];
  fields.forEach(([key, id]) => { const value = qs(id)?.value?.trim(); if (value) params.set(key, value); });
  const data = await api(`/pessoas?${params}`);
  state.people = data.pessoas || [];
  qs('peopleBody').innerHTML = state.people.length ? state.people.map(p => `<tr><td><strong>${escapeHtml(p.nome)}</strong><br><small>${escapeHtml(p.cpfCnpj || 'Documento não informado')}</small></td><td>${escapeHtml(p.tipo)}</td><td>${escapeHtml(p.alunoNome || '—')}<br><small>${escapeHtml(p.alunoTurma || '')}</small></td><td>${escapeHtml(p.whatsapp || p.telefone || '—')}<br><small>${escapeHtml(p.email || '')}</small></td><td>${p.autorizacaoComunicacao ? statusPill('Autorizada') : statusPill('Não autorizada')}</td><td>${statusPill(p.status)}</td><td class="right"><div class="row-actions">${can('pessoas:escrever') ? `<button title="Editar" data-edit-person="${p._id}">✎</button><button title="Excluir ou inativar" data-delete-person="${p._id}">⊘</button>` : ''}<button title="Anexar" data-attach="pessoa" data-id="${p._id}" data-name="${escapeHtml(p.nome)}">↥</button></div></td></tr>`).join('') : emptyRow(7, 'Nenhuma pessoa encontrada.');
}

function movementParams() {
  const params = new URLSearchParams();
  [['q','movementSearch'],['tipo','movementType'],['status','movementStatus'],['conta','movementAccount']].forEach(([key,id]) => { const value = qs(id)?.value?.trim(); if (value) params.set(key,value); });
  return params;
}

async function loadMovements() {
  const data = await api(`/movimentacoes?${movementParams()}`);
  state.movements = data.movimentacoes || [];
  let income = 0, expense = 0, pending = 0;
  state.movements.forEach(m => {
    if (m.status === 'Pago') m.tipo === 'Entrada' ? income += Number(m.valor || 0) : expense += Number(m.valor || 0);
    else if (m.status !== 'Cancelado') pending += Number(m.valor || 0);
  });
  qs('financeIncome').textContent = money.format(income);
  qs('financeExpense').textContent = money.format(expense);
  qs('financePending').textContent = money.format(pending);
  qs('financeResult').textContent = money.format(income - expense);
  qs('movementsBody').innerHTML = state.movements.length ? state.movements.map(m => `<tr><td>${formatDate(m.dataMovimentacao)}</td><td><strong>${escapeHtml(m.descricao)}</strong>${m.projetoNome ? `<br><small>${escapeHtml(m.projetoNome)}</small>` : ''}</td><td>${escapeHtml(m.pessoaNome || '—')}<br><small>${escapeHtml([m.alunoNome,m.alunoTurma].filter(Boolean).join(' • '))}</small></td><td>${escapeHtml(m.categoriaNome || '—')}</td><td>${escapeHtml(m.contaNome || '—')}</td><td>${statusPill(m.status)}</td><td class="right ${m.tipo === 'Entrada' ? 'amount-in' : 'amount-out'}">${m.tipo === 'Entrada' ? '+' : '-'} ${money.format(m.valor || 0)}</td><td class="right"><div class="row-actions"><button title="Anexar" data-attach="movimentacao" data-id="${m._id}" data-name="${escapeHtml(m.descricao)}">↥</button>${can('financeiro:cancelar') && m.status !== 'Cancelado' ? `<button title="Cancelar" data-cancel-movement="${m._id}">⊘</button>` : ''}</div></td></tr>`).join('') : emptyRow(8, 'Nenhuma movimentação encontrada.');
}

async function loadContributions() {
  const params = new URLSearchParams();
  [['q','contributionSearch'],['turma','contributionClass'],['referencia','contributionReference'],['status','contributionStatus']].forEach(([key,id]) => { const value=qs(id)?.value?.trim(); if(value) params.set(key,value); });
  const data = await api(`/contribuicoes?${params}`);
  state.contributions = data.contribuicoes || [];
  const summary = data.resumo || {};
  qs('contributionExpected').textContent = money.format(summary.previsto || 0);
  qs('contributionPaid').textContent = money.format(summary.pago || 0);
  qs('contributionPending').textContent = money.format(summary.pendente || 0);
  qs('contributionPendingCount').textContent = String(summary.comPendencia || 0);

  qs('contributionCards').innerHTML = state.contributions.length ? state.contributions.map(contribution => {
    const expected = Number(contribution.valorPrevisto || 0);
    const paid = Number(contribution.valorPago || 0);
    const percent = expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : 0;
    const pending = Math.max(expected - paid, 0);
    const last = contribution.ultimoLembrete;
    const lastDate = last?.enviadoEm || last?.createdAt;
    const reminderMeta = last
      ? `<div class="reminder-meta"><span>Último lembrete:</span>${statusPill(last.status)}<span>${escapeHtml(last.canal || '')}${lastDate ? ` • ${formatDateTime(lastDate)}` : ''}</span>${last.erro ? `<span class="reminder-error">${escapeHtml(last.erro)}</span>` : ''}</div>`
      : '<div class="reminder-meta"><span>Nenhum lembrete registrado.</span></div>';
    const reminderActions = can('lembretes:gerenciar') && pending > 0
      ? `<button data-send-reminder="${contribution._id}">Enviar lembrete</button>${contribution.lembretesSuspensos ? `<button class="success-lite" data-toggle-reminders="${contribution._id}" data-suspended="true">Reativar lembretes</button>` : `<button class="danger-lite" data-toggle-reminders="${contribution._id}" data-suspended="false">Suspender lembretes</button>`}`
      : '';

    return `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(contribution.responsavelNome)}</h3><p>${escapeHtml(contribution.alunoNome || 'Sem aluno')} ${contribution.alunoTurma ? `• ${escapeHtml(contribution.alunoTurma)}` : ''}</p></div>${contribution.lembretesSuspensos ? statusPill('Lembretes suspensos') : statusPill(contribution.status)}</div><div class="data-card-values"><div><span>Previsto</span><strong>${money.format(expected)}</strong></div><div><span>Pendente</span><strong class="${pending > 0 ? 'amount-out' : 'amount-in'}">${money.format(pending)}</strong></div></div><div class="progress"><span style="width:${percent}%"></span></div>${reminderMeta}<div class="card-actions">${can('contribuicoes:escrever') && pending > 0 ? `<button data-pay-contribution="${contribution._id}" data-pending="${pending}">Registrar pagamento</button>` : ''}<button data-history-person="${escapeHtml(contribution.responsavelNome)}">Ver histórico</button>${reminderActions}</div></article>`;
  }).join('') : emptyBlock('Nenhuma contribuição encontrada.');
}

async function loadProjects() {
  const data = await api('/projetos');
  state.projects = data.projetos || [];
  qs('projectCards').innerHTML = state.projects.length ? state.projects.map(p => {
    const percent = p.metaArrecadacao > 0 ? Math.min(100, Math.round((Number(p.arrecadado || 0)/Number(p.metaArrecadacao))*100)) : 0;
    return `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(p.nome)}</h3><p>${escapeHtml(p.tipo)} • ${escapeHtml(p.responsavelNome || 'Sem responsável')}</p></div>${statusPill(p.status)}</div><div class="data-card-values"><div><span>Arrecadado</span><strong class="amount-in">${money.format(p.arrecadado || 0)}</strong></div><div><span>Saldo</span><strong class="${p.saldo < 0 ? 'amount-out' : 'amount-in'}">${money.format(p.saldo || 0)}</strong></div></div><div class="progress"><span style="width:${percent}%"></span></div><div class="card-actions"><button data-filter-project="${p._id}">Movimentações</button><button data-attach="projeto" data-id="${p._id}" data-name="${escapeHtml(p.nome)}">Anexar</button></div></article>`;
  }).join('') : emptyBlock('Nenhum projeto, campanha ou evento cadastrado.');
}

async function loadAssets() {
  const data = await api('/patrimonios');
  state.assets = data.patrimonios || [];
  qs('assetsBody').innerHTML = state.assets.length ? state.assets.map(a => `<tr><td><strong>${escapeHtml(a.codigo)}</strong></td><td>${escapeHtml(a.nome)}<br><small>${escapeHtml(a.descricao || '')}</small></td><td>${escapeHtml(a.categoria || '—')}</td><td>${escapeHtml(a.localizacao || '—')}</td><td>${statusPill(a.estadoConservacao)}</td><td>${statusPill(a.status)}</td><td class="right">${money.format(a.valorAquisicao || 0)}</td><td class="right"><div class="row-actions"><button data-attach="patrimonio" data-id="${a._id}" data-name="${escapeHtml(a.nome)}" title="Anexar">↥</button></div></td></tr>`).join('') : emptyRow(8, 'Nenhum bem patrimonial cadastrado.');
}

async function loadDocuments() {
  const data = await api('/documentos');
  state.documents = data.documentos || [];
  qs('documentsBody').innerHTML = state.documents.length ? state.documents.map(d => `<tr><td><strong>${escapeHtml(d.titulo)}</strong><br><small>${escapeHtml(d.responsavelNome || '')}</small></td><td>${escapeHtml(d.tipo)}</td><td>${escapeHtml(d.numeroReferencia || '—')}</td><td>${formatDate(d.dataEmissao)}</td><td>${formatDate(d.dataValidade)}</td><td>${statusPill(d.statusCalculado || d.status)}</td><td class="right"><div class="row-actions"><button data-attach="documento" data-id="${d._id}" data-name="${escapeHtml(d.titulo)}" title="Anexar">↥</button></div></td></tr>`).join('') : emptyRow(7, 'Nenhum documento cadastrado.');
}

async function loadRelationship() {
  const [models, campaigns] = await Promise.all([api('/mensagens/modelos'), api('/mensagens/campanhas')]);
  state.templates = models.modelos || [];
  state.campaigns = campaigns.campanhas || [];
  qs('templateList').innerHTML = state.templates.length ? state.templates.map(m => `<div class="list-item"><div><strong>${escapeHtml(m.nome)}</strong><small>${escapeHtml(m.evento)} • ${escapeHtml(m.canal)}${m.assunto ? ` • ${escapeHtml(m.assunto)}` : ''}</small></div>${statusPill(m.status)}</div>`).join('') : emptyBlock('Nenhum modelo cadastrado.');
  qs('campaignList').innerHTML = state.campaigns.length ? state.campaigns.map(c => `<div class="list-item"><div><strong>${escapeHtml(c.titulo)}</strong><small>${escapeHtml(c.evento)} • ${escapeHtml(c.canal)} • ${escapeHtml(c.status)}</small></div><div class="list-actions">${can('mensagens:escrever') ? `<button data-prepare-campaign="${c._id}">Preparar</button><button data-process-campaign="${c._id}">Enviar fila</button>` : ''}</div></div>`).join('') : emptyBlock('Nenhuma campanha criada.');
}


function reminderTimingLabel(stage) {
  const offset = Number(stage.deslocamentoDias || 0);
  if (offset === 0) return 'No dia do vencimento';
  return offset < 0 ? `${Math.abs(offset)} dia(s) antes` : `${offset} dia(s) depois`;
}

function renderReminderStages(stages = []) {
  const root = qs('reminderStagesEditor');
  if (!root) return;
  root.innerHTML = stages.map(stage => `<article class="reminder-stage" data-reminder-stage="${escapeHtml(stage.codigo)}"><div class="reminder-stage-head"><label class="switch-control"><input data-stage-field="ativo" type="checkbox" ${stage.ativo !== false ? 'checked' : ''} /><span></span></label><div><strong>${escapeHtml(stage.nome)}</strong><small>${escapeHtml(reminderTimingLabel(stage))}</small></div><label><span>Deslocamento em dias</span><input data-stage-field="deslocamentoDias" type="number" min="-365" max="365" value="${Number(stage.deslocamentoDias || 0)}" /></label></div><div class="reminder-stage-body"><label><span>Assunto</span><input data-stage-field="assunto" maxlength="250" value="${escapeHtml(stage.assunto || '')}" /></label><label><span>Mensagem</span><textarea data-stage-field="mensagem" maxlength="5000">${escapeHtml(stage.mensagem || '')}</textarea></label></div></article>`).join('');
}

function fillReminderConfig(config, stats = {}, availability = {}) {
  state.reminderConfig = config;
  state.reminderStats = stats;
  state.reminderAvailability = availability;
  qs('reminderActive').checked = config.ativo === true;
  qs('reminderOnlyAuthorized').checked = config.somenteAutorizados !== false;
  qs('reminderEmailChannel').checked = config.canais?.email !== false;
  const whatsappInput = qs('reminderWhatsappChannel');
  whatsappInput.checked = availability.whatsappAutomatico === true && config.canais?.whatsapp === true;
  whatsappInput.disabled = availability.whatsappAutomatico !== true;
  whatsappInput.title = availability.whatsappAutomatico ? '' : 'Conecte um provedor sendWhatsApp ao backend para habilitar este canal.';
  qs('reminderBatchLimit').value = config.limitePorExecucao || 200;
  qs('reminderMaxAttempts').value = config.maxTentativas || 3;
  qs('reminderRetryHours').value = String(config.intervaloTentativasHoras || 6);
  qs('reminderTime').value = `${String(config.horaEnvio ?? 8).padStart(2, '0')}:${String(config.minutoEnvio ?? 0).padStart(2, '0')}`;
  const allowed = new Set((config.diasSemana || []).map(Number));
  qs('reminderWeekdays').querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = allowed.has(Number(input.value)); });
  renderReminderStages(config.etapas || []);

  qs('reminderAutomationStatus').textContent = config.ativo ? 'Ativada' : 'Desativada';
  qs('reminderScheduleSummary').textContent = `Envio após ${qs('reminderTime').value} nos dias selecionados`;
  qs('reminderPendingContributions').textContent = String(stats.contribuicoesPendentes || 0);
  qs('reminderSent30Days').textContent = String(stats.enviados30Dias || 0);
  qs('reminderOpenErrors').textContent = String(stats.errosAbertos || 0);
  qs('reminderLastRun').textContent = stats.ultimaExecucaoEm ? formatDateTime(stats.ultimaExecucaoEm) : 'Ainda não executada';
  const last = stats.ultimaExecucaoResumo || {};
  qs('reminderLastRunSummary').textContent = stats.ultimaExecucaoEm ? `${last.enviados || 0} enviado(s), ${last.erros || 0} erro(s), ${last.ignorados || 0} ignorado(s)` : 'Sem dados';
  const whatsappStatus = qs('reminderWhatsappAvailability');
  whatsappStatus.textContent = availability.whatsappAutomatico ? 'Disponível' : 'Não configurado';
  whatsappStatus.className = `status ${availability.whatsappAutomatico ? 'ok' : 'warn'}`;
}

async function loadReminderHistory() {
  const params = new URLSearchParams();
  const status = qs('reminderHistoryStatus')?.value;
  const channel = qs('reminderHistoryChannel')?.value;
  if (status) params.set('status', status);
  if (channel) params.set('canal', channel);
  const data = await api(`/lembretes/historico?${params}`);
  state.reminderHistory = data.envios || [];
  qs('reminderHistoryBody').innerHTML = state.reminderHistory.length ? state.reminderHistory.map(item => {
    const contribution = item.contribuicao || {};
    const result = item.status === 'Erro'
      ? `<span class="reminder-error">${escapeHtml(item.erro || 'Falha não detalhada')}</span>`
      : item.enviadoEm ? `Enviado em ${formatDateTime(item.enviadoEm)}` : `${item.tentativas || 0} tentativa(s)`;
    return `<tr><td>${formatDateTime(item.createdAt)}</td><td><strong>${escapeHtml(item.destinatarioNome)}</strong><br><small>${escapeHtml(item.destino)}</small></td><td>${escapeHtml(contribution.referencia || item.referencia || '—')}<br><small>${escapeHtml([contribution.alunoNome, contribution.alunoTurma].filter(Boolean).join(' • '))}</small></td><td>${escapeHtml(item.etapaNome || item.etapa)}</td><td>${escapeHtml(item.canal)}</td><td>${statusPill(item.status)}</td><td>${result}</td></tr>`;
  }).join('') : emptyRow(7, 'Nenhum lembrete registrado.');
}

async function loadReminders() {
  if (!can('lembretes:ler')) return;
  const [configData] = await Promise.all([api('/lembretes/configuracao'), loadReminderHistory()]);
  fillReminderConfig(configData.configuracao, configData.estatisticas, configData.canaisDisponiveis);
}

function collectReminderConfig() {
  const [hourText, minuteText] = String(qs('reminderTime').value || '08:00').split(':');
  const days = [...qs('reminderWeekdays').querySelectorAll('input[type="checkbox"]:checked')].map(input => Number(input.value));
  const stages = [...document.querySelectorAll('[data-reminder-stage]')].map(card => ({
    codigo: card.dataset.reminderStage,
    ativo: card.querySelector('[data-stage-field="ativo"]').checked,
    deslocamentoDias: Number(card.querySelector('[data-stage-field="deslocamentoDias"]').value),
    assunto: card.querySelector('[data-stage-field="assunto"]').value.trim(),
    mensagem: card.querySelector('[data-stage-field="mensagem"]').value.trim(),
  }));
  return {
    ativo: qs('reminderActive').checked,
    somenteAutorizados: qs('reminderOnlyAuthorized').checked,
    horaEnvio: Number(hourText),
    minutoEnvio: Number(minuteText),
    diasSemana: days,
    canais: {
      email: qs('reminderEmailChannel').checked,
      whatsapp: qs('reminderWhatsappChannel').checked,
    },
    limitePorExecucao: Number(qs('reminderBatchLimit').value),
    maxTentativas: Number(qs('reminderMaxAttempts').value),
    intervaloTentativasHoras: Number(qs('reminderRetryHours').value),
    etapas: stages,
  };
}

async function saveReminderConfig(event) {
  event.preventDefault();
  try {
    const data = await api('/lembretes/configuracao', { method: 'PUT', body: JSON.stringify(collectReminderConfig()) });
    await loadReminders();
    toast(data.aviso ? `${data.mensagem} ${data.aviso}` : data.mensagem, data.aviso ? 'error' : 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function processRemindersNow() {
  if (!confirm('Processar agora as contribuições elegíveis? O controle de duplicidade impedirá o reenvio de etapas já concluídas.')) return;
  const button = qs('processRemindersNow');
  button.disabled = true;
  try {
    const data = await api('/lembretes/processar', { method: 'POST', body: '{}' });
    await Promise.all([loadReminders(), loadContributions()]);
    toast(data.mensagem, data.summary?.errors ? 'error' : 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function sendContributionReminder(contributionId) {
  const choice = prompt('Digite 1 para enviar por E-mail ou 2 para enviar por WhatsApp:', '1');
  if (choice === null) return;
  const normalizedChoice = String(choice).trim();
  if (!['1', '2'].includes(normalizedChoice)) return toast('Opção inválida. Digite 1 para E-mail ou 2 para WhatsApp.', 'error');
  const channel = normalizedChoice === '2' ? 'WhatsApp' : 'E-mail';
  if (channel === 'WhatsApp' && !state.reminderAvailability.whatsappAutomatico) return toast('O WhatsApp automático ainda não está configurado. Use e-mail ou conclua a integração do provedor.', 'error');
  if (!confirm(`Confirmar o envio manual por ${channel}?`)) return;
  try {
    const data = await api(`/contribuicoes/${contributionId}/lembrete`, { method: 'POST', body: JSON.stringify({ canal: channel }) });
    await Promise.all([loadContributions(), loadReminderHistory()]);
    toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}

async function toggleContributionReminders(contributionId, currentlySuspended) {
  let reason = null;
  if (!currentlySuspended) {
    reason = prompt('Informe o motivo da suspensão dos lembretes desta contribuição:');
    if (!reason) return;
  }
  try {
    const data = await api(`/contribuicoes/${contributionId}/lembretes`, {
      method: 'PATCH',
      body: JSON.stringify({ suspender: !currentlySuspended, motivo: reason }),
    });
    await Promise.all([loadContributions(), loadReminders()]);
    toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}

async function loadSettings() {
  const tasks = [api('/contas'), api('/categorias')];
  if (can('usuarios:gerenciar')) tasks.push(api('/usuarios'));
  const [accounts, categories, users] = await Promise.all(tasks);
  state.accounts = accounts.contas || [];
  state.categories = categories.categorias || [];
  state.users = users?.usuarios || [];
  qs('accountsList').innerHTML = state.accounts.length ? state.accounts.map(a => `<div class="list-item"><div><strong>${escapeHtml(a.nome)}</strong><small>${escapeHtml(a.tipo)} • ${escapeHtml(a.status)}</small></div><b class="${a.saldo < 0 ? 'amount-out' : 'amount-in'}">${money.format(a.saldo || 0)}</b></div>`).join('') : emptyBlock('Nenhuma conta cadastrada.');
  qs('categoriesList').innerHTML = state.categories.length ? state.categories.map(c => `<div class="list-item"><div><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.tipoMovimentacao)} • ${escapeHtml(c.status)}</small></div></div>`).join('') : emptyBlock('Nenhuma categoria cadastrada.');
  if (can('usuarios:gerenciar')) qs('usersList').innerHTML = state.users.length ? state.users.map(u => `<div class="list-item user-access-item"><div><strong>${escapeHtml(u.nome)}</strong><small>${escapeHtml(u.email)}${u.identidadeReutilizada ? ' • identidade Axoriin reutilizada' : ''}</small></div><div class="list-actions"><span class="status ${u.ativo ? 'ok' : 'bad'}">${escapeHtml(String(u.perfil || 'sem perfil').replaceAll('_',' '))}</span>${u.vinculoId ? `<button data-edit-user-access="${u.vinculoId}" data-current-profile="${escapeHtml(u.perfil || '')}" title="Alterar perfil">✎</button><button data-remove-user-access="${u.vinculoId}" title="Remover acesso">⊘</button>` : '<small>legado</small>'}</div></div>`).join('') : emptyBlock('Nenhum usuário do módulo.');
}

async function loadAudit() {
  if (!can('auditoria:ler')) return;
  const data = await api('/auditoria');
  state.audit = data.logs || [];
  qs('auditBody').innerHTML = state.audit.length ? state.audit.map(l => `<tr><td>${formatDateTime(l.createdAt)}</td><td>${escapeHtml(l.usuarioNome || 'Sistema')}</td><td><strong>${escapeHtml(l.acao)}</strong></td><td>${escapeHtml(l.entidade || '—')}</td><td>${escapeHtml(l.entidadeNome || l.entidadeId || '—')}</td><td>${escapeHtml(l.motivo || summarizeDetails(l.detalhes || l.depois || ''))}</td></tr>`).join('') : emptyRow(6, 'Nenhuma ação registrada.');
}

function summarizeDetails(value) {
  if (!value) return '—';
  if (typeof value === 'string') return value.slice(0, 160);
  try { return JSON.stringify(value).slice(0, 160); } catch { return '—'; }
}

async function refreshCore() {
  await loadOptions();
  await Promise.all([loadDashboard(), loadView(state.activeView)]);
}

async function submitPerson(event) {
  event.preventDefault();
  try {
    const body = formObject(event.currentTarget);
    const id = event.currentTarget.dataset.editId;
    const data = await api(id ? `/pessoas/${id}` : '/pessoas', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    closeModal(); await loadOptions(); await loadPeople(); await loadDashboard(); toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}
async function submitMovement(event) {
  event.preventDefault();
  try {
    const body = formObject(event.currentTarget);
    const data = await api('/movimentacoes', { method: 'POST', body: JSON.stringify(body) });
    closeModal(); await loadOptions(); await Promise.all([loadMovements(), loadDashboard()]); toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}
async function submitContribution(event) {
  event.preventDefault();
  try {
    const data = await api('/contribuicoes', { method: 'POST', body: JSON.stringify(formObject(event.currentTarget)) });
    closeModal(); await Promise.all([loadContributions(), loadDashboard()]); toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}
async function submitPayment(event) {
  event.preventDefault();
  try {
    const body = formObject(event.currentTarget); const id = body.contributionId; delete body.contributionId;
    const data = await api(`/contribuicoes/${id}/pagamentos`, { method: 'POST', body: JSON.stringify(body) });
    closeModal(); await loadOptions(); await Promise.all([loadContributions(), loadMovements(), loadDashboard()]); toast(`${data.mensagem}${data.recibo?.numero ? ` Recibo ${data.recibo.numero}.` : ''}`);
  } catch (error) { toast(error.message, 'error'); }
}
async function submitProject(event) { event.preventDefault(); try { const data=await api('/projetos',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadOptions(); await loadProjects(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitAsset(event) { event.preventDefault(); try { const data=await api('/patrimonios',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadAssets(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitDocument(event) { event.preventDefault(); try { const data=await api('/documentos',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadDocuments(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitAttachment(event) {
  event.preventDefault();
  try { const data=await api('/anexos',{method:'POST',body:new FormData(event.currentTarget)}); closeModal(); toast(data.mensagem); }
  catch(error){toast(error.message,'error');}
}
async function submitTemplate(event) { event.preventDefault(); try { const data=await api('/mensagens/modelos',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadRelationship(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitCampaign(event) { event.preventDefault(); try { const data=await api('/mensagens/campanhas',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadRelationship(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitAccount(event) { event.preventDefault(); try { const data=await api('/contas',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadOptions(); await Promise.all([loadSettings(),loadDashboard()]); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitCategory(event) { event.preventDefault(); try { const data=await api('/categorias',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadOptions(); await loadSettings(); toast(data.mensagem); } catch(error){toast(error.message,'error');} }
async function submitUser(event) {
  event.preventDefault();
  try {
    const data=await api('/usuarios',{method:'POST',body:JSON.stringify(formObject(event.currentTarget))}); closeModal(); await loadSettings();
    const temp = data.senhaTemporaria ? ` Senha temporária: ${data.senhaTemporaria}` : '';
    toast(`${data.mensagem}${temp}`);
  } catch(error){toast(error.message,'error');}
}

async function editUserAccess(vinculoId, currentProfile) {
  const perfis = ['presidente','vice_presidente','tesoureiro','secretario','conselho_fiscal','operador','consulta'];
  const perfil = prompt(`Informe o novo perfil:\n${perfis.join(', ')}`, currentProfile || 'consulta');
  if (!perfil) return;
  if (!perfis.includes(perfil.trim().toLowerCase())) return toast('Perfil inválido.', 'error');
  try {
    const data = await api(`/usuarios/${vinculoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ perfil: perfil.trim().toLowerCase(), ativo: true }),
    });
    await loadSettings();
    toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}

async function removeUserAccess(vinculoId) {
  const motivo = prompt('Informe o motivo da remoção do acesso:');
  if (!motivo) return;
  if (!confirm('Remover somente o acesso desta pessoa à associação? A identidade Axoriin e os demais acessos serão preservados.')) return;
  try {
    const data = await api(`/usuarios/${vinculoId}`, {
      method: 'DELETE',
      body: JSON.stringify({ motivo }),
    });
    await loadSettings();
    toast(data.mensagem);
  } catch (error) { toast(error.message, 'error'); }
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"','""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function editPerson(id) {
  const p = state.people.find(item => item._id === id); if (!p) return;
  openModal('personModal', {
    nome:p.nome,tipo:p.tipo,cpfCnpj:p.cpfCnpj,telefone:p.telefone,whatsapp:p.whatsapp,email:p.email,
    dataNascimento:p.dataNascimento ? String(p.dataNascimento).slice(0,10) : '', alunoNome:p.alunoNome,alunoTurma:p.alunoTurma,
    autorizacaoComunicacao:p.autorizacaoComunicacao,autorizaAniversario:p.autorizaAniversario,observacoes:p.observacoes,
  });
  const form = qs('modalRoot').querySelector('#personForm'); form.dataset.editId = id;
}


async function deletePerson(id) {
  const person = state.people.find(item => String(item._id) === String(id));
  if (!person) return toast('Cadastro não encontrado na lista atual.', 'error');

  const confirmed = confirm(
    `Excluir o cadastro de ${person.nome}?

` +
    'Se houver contribuições, pagamentos, movimentações, recibos ou comunicações vinculadas, ' +
    'o sistema preservará o histórico e apenas inativará a pessoa.'
  );
  if (!confirmed) return;

  try {
    const data = await api(`/pessoas/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ motivo: 'Exclusão solicitada na tela de pessoas.' }),
    });
    await loadOptions();
    await Promise.all([loadPeople(), loadDashboard()]);
    toast(data.mensagem);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function cancelMovement(id) {
  const motivo = prompt('Informe a justificativa do cancelamento:');
  if (!motivo) return;
  try { const data=await api(`/movimentacoes/${id}/cancelar`,{method:'POST',body:JSON.stringify({motivo})}); await Promise.all([loadMovements(),loadDashboard()]); toast(data.mensagem); }
  catch(error){toast(error.message,'error');}
}

async function prepareCampaign(id) {
  try { const data=await api(`/mensagens/campanhas/${id}/preparar`,{method:'POST',body:'{}'}); await loadRelationship(); toast(data.mensagem); }
  catch(error){toast(error.message,'error');}
}
async function processCampaign(id) {
  if (!confirm('Processar agora a fila desta campanha usando a mensageria do Axoriin?')) return;
  try { const data=await api(`/mensagens/campanhas/${id}/processar`,{method:'POST',body:JSON.stringify({limite:50})}); await loadRelationship(); toast(`${data.mensagem} Enviadas: ${data.enviadas || 0}; erros: ${data.erros || 0}.`); }
  catch(error){toast(error.message,'error');}
}

async function logout() {
  try { await fetch(withTenant('/auth/logout'), { method:'POST', credentials:'include' }); } catch {}
  location.href = withTenant('/login.html');
}

function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]'); if (nav) return navigate(nav.dataset.view);
    const target = event.target.closest('[data-view-target]'); if (target) return navigate(target.dataset.viewTarget);
    const open = event.target.closest('[data-open]'); if (open) return openModal(open.dataset.open);
    if (event.target.closest('[data-close]') || (event.target.classList.contains('modal-overlay'))) return closeModal();
    const edit = event.target.closest('[data-edit-person]'); if (edit) return editPerson(edit.dataset.editPerson);
    const removePerson = event.target.closest('[data-delete-person]'); if (removePerson) return deletePerson(removePerson.dataset.deletePerson);
    const cancel = event.target.closest('[data-cancel-movement]'); if (cancel) return cancelMovement(cancel.dataset.cancelMovement);
    const pay = event.target.closest('[data-pay-contribution]'); if (pay) return openModal('paymentModal',{contributionId:pay.dataset.payContribution,valor:pay.dataset.pending,dataPagamento:today()});
    const history = event.target.closest('[data-history-person]'); if (history) { qs('movementSearch').value=history.dataset.historyPerson; navigate('finance'); return; }
    const attach = event.target.closest('[data-attach]'); if (attach) return openModal('attachmentModal',{entidadeTipo:attach.dataset.attach,entidadeId:attach.dataset.id,entidadeNome:attach.dataset.name});
    const filterProject = event.target.closest('[data-filter-project]'); if (filterProject) { navigate('finance'); toast('Use a busca ou o relatório financeiro para conferir as movimentações da ação.'); return; }
    const prepare = event.target.closest('[data-prepare-campaign]'); if (prepare) return prepareCampaign(prepare.dataset.prepareCampaign);
    const process = event.target.closest('[data-process-campaign]'); if (process) return processCampaign(process.dataset.processCampaign);
    const editAccess = event.target.closest('[data-edit-user-access]'); if (editAccess) return editUserAccess(editAccess.dataset.editUserAccess, editAccess.dataset.currentProfile);
    const removeAccess = event.target.closest('[data-remove-user-access]'); if (removeAccess) return removeUserAccess(removeAccess.dataset.removeUserAccess);
    const sendReminder = event.target.closest('[data-send-reminder]'); if (sendReminder) return sendContributionReminder(sendReminder.dataset.sendReminder);
    const toggleReminders = event.target.closest('[data-toggle-reminders]'); if (toggleReminders) return toggleContributionReminders(toggleReminders.dataset.toggleReminders, toggleReminders.dataset.suspended === 'true');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  document.querySelectorAll('#peopleSearch,#peopleType,#peopleClass,#peopleStatus').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', debounce(loadPeople)));
  document.querySelectorAll('#movementSearch,#movementType,#movementStatus,#movementAccount').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', debounce(loadMovements)));
  document.querySelectorAll('#contributionSearch,#contributionClass,#contributionReference,#contributionStatus').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', debounce(loadContributions)));
  document.querySelectorAll('#insightMonths,#insightClass').forEach(el => el?.addEventListener('change', debounce(loadInsights)));
  qs('refreshInsights')?.addEventListener('click', () => loadInsights().catch(error => toast(error.message, 'error')));
  qs('exportInsights')?.addEventListener('click', exportFinancialInsights);
  qs('reminderConfigForm')?.addEventListener('submit', saveReminderConfig);
  qs('processRemindersNow')?.addEventListener('click', processRemindersNow);
  qs('refreshReminderHistory')?.addEventListener('click', () => loadReminderHistory().catch(error => toast(error.message, 'error')));
  qs('reminderHistoryStatus')?.addEventListener('change', () => loadReminderHistory().catch(error => toast(error.message, 'error')));
  qs('reminderHistoryChannel')?.addEventListener('change', () => loadReminderHistory().catch(error => toast(error.message, 'error')));
  qs('exportMovements').addEventListener('click', () => downloadCsv('movimentacoes-associacao.csv', [['Data','Descrição','Pessoa','Aluno','Turma','Categoria','Conta','Tipo','Status','Valor'],...state.movements.map(m=>[formatDate(m.dataMovimentacao),m.descricao,m.pessoaNome,m.alunoNome,m.alunoTurma,m.categoriaNome,m.contaNome,m.tipo,m.status,Number(m.valor||0).toFixed(2).replace('.',',')])]));
  qs('mobileMenuButton').addEventListener('click',()=>{qs('sidebar').classList.toggle('open');qs('mobileBackdrop').classList.toggle('hidden');});
  qs('mobileBackdrop').addEventListener('click',()=>{qs('sidebar').classList.remove('open');qs('mobileBackdrop').classList.add('hidden');});
  qs('logoutButton').addEventListener('click',logout);
  qs('environmentSwitcher')?.addEventListener('change', event => switchEnvironment(event.target.value).catch(error => toast(error.message, 'error')));
  qs('backToAxoriin')?.addEventListener('click', event => { event.preventDefault(); const tenant = event.currentTarget.dataset.targetTenant; if (tenant) switchEnvironment(tenant).catch(error => toast(error.message, 'error')); });
}

function debounce(fn, wait=250) { let timer; return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args).catch(error=>toast(error.message,'error')),wait); }; }

async function bootstrap() {
  state.tenant = resolveTenant();
  bindGlobalEvents();
  try {
    await loadContext();
    await loadEnvironments();
    await loadOptions();
    await loadDashboard();
  } catch (error) {
    toast(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
