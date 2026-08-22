'use strict';

(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const tenantSlug = new URLSearchParams(location.search).get('t') || '';
  const state = {
    bootstrap: null,
    view: 'visao-geral',
    voucherPage: 1,
    voucherPages: 1,
    modalSaveHandler: null,
    modalContext: null,
    deliveryStudent: null,
    deliveryVouchers: [],
    deliveryList: [],
    deliveryListPage: 1,
    deliveryListPages: 1,
    importFile: null,
    currentImport: null,
    importHistory: [],
  };

  const viewMeta = {
    'visao-geral': ['GESTÃO OPERACIONAL', 'Visão Geral'],
    campanhas: ['CICLOS', 'Campanhas'],
    fornecedores: ['CADASTRO', 'Fornecedores'],
    itens: ['CATÁLOGO', 'Itens e Kits'],
    vouchers: ['DIREITOS DO ALUNO', 'Vouchers'],
    importar: ['IMPORTAÇÃO INTELIGENTE', 'Importar PDF'],
    entregas: ['CONFERÊNCIA', 'Entregas'],
    agenda: ['PLANEJAMENTO', 'Agenda de Entrega'],
    pendencias: ['EXCEÇÕES', 'Pendências'],
    relatorios: ['DOCUMENTOS', 'Relatórios'],
  };

  const statusLabels = {
    cadastrado: 'Cadastrado', validado: 'Validado', aguardando_fornecedor: 'Aguardando fornecedor',
    disponivel_entrega: 'Disponível', agendado: 'Agendado', entregue: 'Entregue', divergencia: 'Divergência', cancelado: 'Cancelado',
    rascunho: 'Rascunho', ativa: 'Ativa', encerrada: 'Encerrada', arquivada: 'Arquivada',
    planejada: 'Planejada', confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada',
    aberta: 'Aberta', em_tratamento: 'Em tratamento', resolvida: 'Resolvida',
    analisado: 'Analisado', importado: 'Importado', parcial: 'Parcial', completo: 'Completo', pendente: 'Pendente',
    pronto: 'Pronto', novo_fornecedor: 'Fornecedor novo', novo_item: 'Item novo', revisar_aluno: 'Revisar aluno', duplicado: 'Duplicado', incompleto: 'Incompleto', erro: 'Erro', ignorado: 'Ignorado',
  };

  const divergenceLabels = {
    item_nao_veio: 'Item não veio', tamanho_incorreto: 'Tamanho incorreto', modelo_incorreto: 'Modelo incorreto',
    quantidade_divergente: 'Quantidade divergente', voucher_nao_localizado: 'Voucher não localizado', aluno_nao_localizado: 'Aluno não localizado',
    fornecedor_incorreto: 'Fornecedor incorreto', sem_documento: 'Sem documento', recusa: 'Recusa do item', defeito: 'Item com defeito', outro: 'Outro',
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function initials(name) {
    return String(name || 'AX').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
  }

  function fmtDate(value, withTime = false) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d);
  }

  function formatRange(a, b) {
    const start = fmtDate(a); const end = fmtDate(b);
    return start === end ? start : `${start} a ${end}`;
  }

  function statusBadge(status) {
    return `<span class="status ${esc(status)}">${esc(statusLabels[status] || status || '-')}</span>`;
  }

  function apiUrl(path, params = {}) {
    const url = new URL(`/api/uniformes${path.startsWith('/') ? path : `/${path}`}`, location.origin);
    if (tenantSlug) url.searchParams.set('t', tenantSlug);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
    });
    return `${url.pathname}${url.search}`;
  }

  async function request(path, options = {}, params = null) {
    const url = path.startsWith('/auth/') ? withTenantPath(path) : apiUrl(path, params || {});
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    if (!response.ok) throw new Error(data?.mensagem || data?.message || `Erro HTTP ${response.status}`);
    return data;
  }

  function withTenantPath(path) {
    if (!tenantSlug) return path;
    const u = new URL(path, location.origin);
    u.searchParams.set('t', tenantSlug);
    return `${u.pathname}${u.search}`;
  }

  function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('#toastStack').append(el);
    setTimeout(() => el.remove(), 4300);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('axoriin_uniformes_theme', theme);
    $('#themeToggle').textContent = theme === 'dark' ? '☀' : '◐';
    $('#themeToggle').title = theme === 'dark' ? 'Usar modo claro' : 'Usar modo noturno';
  }

  function initTheme() {
    const saved = localStorage.getItem('axoriin_uniformes_theme');
    const preferred = matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(saved === 'dark' || saved === 'light' ? saved : preferred);
  }

  async function checkAccess() {
    let user = null;
    for (const endpoint of ['/auth/usuario-logado', '/auth/me']) {
      try {
        const r = await fetch(withTenantPath(endpoint), { credentials: 'include', cache: 'no-store' });
        if (r.ok) { user = await r.json(); break; }
      } catch {}
    }
    const role = String(user?.tipo || '').toLowerCase();
    if (!['admin', 'monitor'].includes(role)) {
      location.href = withTenantPath('/403.html');
      throw new Error('Sem permissão para acessar o módulo.');
    }
    $('#userName').textContent = user?.nome || 'Usuário';
    $('#userRole').textContent = role === 'monitor' ? 'Monitor' : 'Administrador';
    $('#userAvatar').textContent = initials(user?.nome || 'AD');
    return user;
  }

  function fillSelect(select, items, { value = '_id', label = 'nome', first = null } = {}) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = first ? `<option value="${esc(first.value ?? '')}">${esc(first.label)}</option>` : '';
    (items || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item[value] ?? '';
      option.textContent = typeof label === 'function' ? label(item) : item[label];
      select.append(option);
    });
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function syncStaticSelects() {
    const b = state.bootstrap || {};
    const campaigns = b.campanhas || [];
    const suppliers = b.fornecedores || [];
    const items = b.itens || [];
    const classes = b.turmas || [];
    const campaignTargets = ['globalCampaign','itemCampaignFilter','voucherCampaignFilter','deliveryCampaignFilter','reportCampaign','importCampaign'];
    campaignTargets.forEach(id => fillSelect($(`#${id}`), campaigns, { label: c => `${c.nome} • ${c.anoLetivo}`, first: { value: '', label: id === 'globalCampaign' ? 'Todas' : 'Todas as campanhas' } }));
    const supplierTargets = ['itemSupplierFilter','voucherSupplierFilter','deliverySupplierFilter','divSupplierFilter','reportSupplier'];
    supplierTargets.forEach(id => fillSelect($(`#${id}`), suppliers, { first: { value: '', label: 'Todos os fornecedores' } }));
    const classTargets = ['voucherClassFilter','deliveryClassFilter','reportClass'];
    classTargets.forEach(id => fillSelect($(`#${id}`), classes.map(nome => ({ _id: nome, nome })), { first: { value: '', label: 'Todas as turmas' } }));
    fillSelect($('#reportItem'), items, { label: i => i.codigoExterno ? `${i.codigoExterno} • ${i.nome}` : i.nome, first: { value: '', label: 'Todos os itens/kits' } });
  }

  async function loadBootstrap() {
    const campaign = $('#globalCampaign')?.value || '';
    const data = await request('/bootstrap', {}, campaign ? { campanha: campaign } : {});
    state.bootstrap = data;
    syncStaticSelects();
    renderDashboard(data.dashboard);
    renderSchedules(data.agendas || []);
    renderCampaigns(data.campanhas || []);
    renderSuppliers(data.fornecedores || []);
    renderItems(data.itens || []);
    $('#pendingBadge').hidden = !(data.dashboard?.pendenciasAbertas > 0);
    $('#pendingBadge').textContent = data.dashboard?.pendenciasAbertas || 0;
    await loadRecentVouchers();
  }

  function renderDashboard(d = {}) {
    $('#mStudents').textContent = d.alunosContemplados || 0;
    $('#mVouchers').textContent = d.vouchers || 0;
    $('#mDelivered').textContent = d.entregues || 0;
    $('#mPending').textContent = d.pendentes || 0;
    $('#mDivergence').textContent = d.divergencias || 0;
    $('#mPercent').textContent = `${d.percentualEntregue || 0}% concluído`;
  }

  function renderSchedules(list) {
    const box = $('#nextSchedules');
    if (!list?.length) { box.innerHTML = '<div class="empty-state">Nenhuma entrega futura cadastrada.</div>'; return; }
    box.innerHTML = list.map(a => {
      const supplier = a.fornecedor?.nome || 'Fornecedor';
      const turmas = (a.turmas || []).slice(0, 3);
      return `<article class="schedule-card">
        <div class="schedule-top"><span class="supplier-mark">${esc(initials(supplier))}</span><b>${esc(supplier)}</b></div>
        <div class="date">${esc(formatRange(a.inicio, a.fim))}</div>
        <small>${esc([a.horarioInicio && a.horarioFim ? `${a.horarioInicio}–${a.horarioFim}` : '', a.local].filter(Boolean).join(' • '))}</small>
        <div class="schedule-tags">${turmas.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${(a.turmas || []).length > 3 ? `<span class="tag">+${a.turmas.length - 3}</span>` : ''}</div>
      </article>`;
    }).join('');
  }

  async function loadRecentVouchers() {
    const campaign = $('#globalCampaign')?.value || '';
    const data = await request('/vouchers', {}, { campanha: campaign, page: 1, limit: 8 });
    const rows = $('#recentVoucherRows');
    if (!data.vouchers?.length) { rows.innerHTML = '<tr><td colspan="5" class="empty-cell">Nenhum voucher cadastrado.</td></tr>'; return; }
    rows.innerHTML = data.vouchers.map(v => `<tr><td><b>${esc(v.alunoNomeSnapshot)}</b></td><td>${esc(v.turmaSnapshot)}</td><td>${esc(v.fornecedor?.nome || '-')}</td><td>${esc(v.itemNomeSnapshot || v.item?.nome || '-')}</td><td>${statusBadge(v.status)}</td></tr>`).join('');
  }

  function renderCampaigns(list) {
    const box = $('#campaignList');
    if (!box) return;
    if (!list?.length) { box.innerHTML = '<div class="empty-state panel">Nenhuma campanha cadastrada.</div>'; return; }
    box.innerHTML = list.map(c => `<article class="entity-card">
      <div class="entity-card-head"><div><p class="eyebrow">${esc(c.anoLetivo)}</p><h3>${esc(c.nome)}</h3><p>${esc(c.descricao || 'Campanha de uniformes')}</p></div>${statusBadge(c.status)}</div>
      <div class="entity-card-meta"><div class="meta-box"><small>Período</small><b>${esc(c.dataInicio ? formatRange(c.dataInicio, c.dataFim || c.dataInicio) : 'Não definido')}</b></div><div class="meta-box"><small>Fornecedores</small><b>${(c.fornecedores || []).length}</b></div></div>
      <div class="card-actions"><button class="tiny-btn" data-edit-campaign="${c._id}">Editar</button></div>
    </article>`).join('');
  }

  function renderSuppliers(list) {
    const q = ($('#supplierSearch')?.value || '').trim().toLowerCase();
    const filtered = (list || []).filter(s => !q || `${s.nome} ${s.razaoSocial} ${s.nomeFantasia} ${s.documento}`.toLowerCase().includes(q));
    const rows = $('#supplierRows');
    if (!rows) return;
    if (!filtered.length) { rows.innerHTML = '<tr><td colspan="6" class="empty-cell">Nenhum fornecedor encontrado.</td></tr>'; return; }
    rows.innerHTML = filtered.map(s => `<tr><td><b>${esc(s.nome)}</b><small style="display:block;color:var(--muted)">${esc(s.razaoSocial || s.nomeFantasia || '')}</small></td><td>${esc(s.documento || '-')}</td><td>${esc(s.whatsapp || s.telefone || s.email || '-')}</td><td>${esc(s.responsavel || '-')}</td><td>${statusBadge(s.ativo ? 'ativa' : 'arquivada')}</td><td><button class="tiny-btn" data-edit-supplier="${s._id}">Editar</button></td></tr>`).join('');
  }

  function filteredItems() {
    const c = $('#itemCampaignFilter')?.value || '';
    const f = $('#itemSupplierFilter')?.value || '';
    return (state.bootstrap?.itens || []).filter(i => (!c || String(i.campanha?._id || i.campanha) === c) && (!f || String(i.fornecedor?._id || i.fornecedor) === f));
  }

  function renderItems() {
    const list = filteredItems();
    const rows = $('#itemRows');
    if (!rows) return;
    if (!list.length) { rows.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhum item/kit encontrado.</td></tr>'; return; }
    rows.innerHTML = list.map(i => `<tr><td>${esc(i.codigoExterno || '-')}</td><td><b>${esc(i.nome)}</b><small style="display:block;color:var(--muted)">${esc(i.categoria || '')}</small></td><td>${esc(i.campanha?.nome || '-')}</td><td>${esc(i.fornecedor?.nome || 'Não vinculado')}</td><td>${esc(i.quantidadePecas || 1)}</td><td>${statusBadge(i.ativo ? 'ativa' : 'arquivada')}</td><td><button class="tiny-btn" data-edit-item="${i._id}">Editar</button></td></tr>`).join('');
  }

  async function loadVouchers() {
    const params = {
      page: state.voucherPage, limit: 25,
      q: $('#voucherSearch').value, campanha: $('#voucherCampaignFilter').value,
      fornecedor: $('#voucherSupplierFilter').value, status: $('#voucherStatusFilter').value,
      turma: $('#voucherClassFilter').value,
    };
    const data = await request('/vouchers', {}, params);
    state.voucherPages = data.pages || 1;
    $('#voucherPage').textContent = `${data.page} / ${data.pages}`;
    $('#voucherPagerInfo').textContent = `${data.total} registro${data.total === 1 ? '' : 's'}`;
    const rows = $('#voucherRows');
    if (!data.vouchers?.length) { rows.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhum voucher encontrado.</td></tr>'; return; }
    rows.innerHTML = data.vouchers.map(v => `<tr><td><b>${esc(v.alunoNomeSnapshot)}</b></td><td>${esc(v.turmaSnapshot)}</td><td><code>${esc(v.codigo)}</code></td><td>${esc(v.fornecedor?.nome || '-')}</td><td>${esc(v.itemNomeSnapshot || v.item?.nome || '-')}</td><td>${statusBadge(v.status)}</td><td>${esc(v.entregueEm ? fmtDate(v.entregueEm, true) : '-')}</td></tr>`).join('');
  }

  function deliveryListParams(extra = {}) {
    return {
      q: $('#deliveryListSearch')?.value || '',
      campanha: $('#deliveryCampaignFilter')?.value || '',
      fornecedor: $('#deliverySupplierFilter')?.value || '',
      turma: $('#deliveryClassFilter')?.value || '',
      situacao: $('#deliverySituationFilter')?.value || 'todos',
      page: state.deliveryListPage,
      limit: 40,
      ...extra,
    };
  }

  function deliveryGroupBadge(status) {
    const label = statusLabels[status] || status || '-';
    return `<span class="delivery-group-status ${esc(status)}">${esc(label)}</span>`;
  }

  function deliveryItemState(v) {
    if (v.status === 'entregue') return `<span class="delivery-item-state done">✓ Recebido</span>`;
    if (v.status === 'divergencia') return `<span class="delivery-item-state divergence">! Divergência</span>`;
    return `<span class="delivery-item-state pending">○ Pendente</span>`;
  }

  function deliveryProgress(g) {
    const received = Number(g?.progresso?.recebidos || 0);
    const total = Number(g?.progresso?.total || g?.vouchers?.length || 0);
    return `${received} de ${total} ${total === 1 ? 'item recebido' : 'itens recebidos'}`;
  }

  function deliveryLastMeta(g) {
    const d = g?.ultimaEntregaDetalhe || {};
    if (!g?.ultimaEntrega) return '<span class="delivery-last-empty">Sem recebimento registrado</span>';
    return `<div class="delivery-last-meta">
      <b>${esc(fmtDate(g.ultimaEntrega, true))}</b>
      <small><strong>Responsável:</strong> ${esc(d.responsavel || '-')} ${d.documento ? `• ${esc(d.tipoDocumento || 'Doc.')}: ${esc(d.documento)}` : ''}</small>
      <small><strong>Protocolo:</strong> ${esc(d.protocolo || '-')} • <strong>Conferido por:</strong> ${esc(d.atendente || '-')}</small>
    </div>`;
  }

  async function loadDeliveryList() {
    const data = await request('/lista-entrega', {}, deliveryListParams());
    state.deliveryList = data.grupos || [];
    state.deliveryListPages = data.pages || 1;
    const r = data.resumo || {};
    $('#deliveryStudents').textContent = r.alunos || 0;
    $('#deliveryCompleteStudents').textContent = r.alunosCompletos || 0;
    $('#deliveryMissingStudents').textContent = r.alunosFaltam || 0;
    $('#deliveryItemsDone').textContent = `${r.itensEntregues || 0}/${r.itens || 0}`;
    $('#deliveryItemsProgress').textContent = `${r.percentualItensEntregues || 0}% concluído`;
    $('#deliveryListPage').textContent = `${data.page || 1} / ${data.pages || 1}`;
    $('#deliveryListPagerInfo').textContent = `${data.total || 0} atendimento${data.total === 1 ? '' : 's'} • ${r.faltamAtendimentos || 0} ainda não concluído${r.faltamAtendimentos === 1 ? '' : 's'}`;

    const rows = $('#deliveryListRows');
    if (!data.grupos?.length) {
      rows.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhum aluno encontrado para os filtros selecionados.</td></tr>';
      return;
    }

    rows.innerHTML = data.grupos.map(g => {
      const items = (g.vouchers || []).map(v => `<div class="delivery-item-line"><div><b>${esc(v.itemNome)}</b><small>${esc(v.itemCodigo ? `Item ${v.itemCodigo} • ` : '')}${esc(v.codigo)}${v.protocolo ? ` • Prot. ${esc(v.protocolo)}` : ''}</small></div>${deliveryItemState(v)}</div>`).join('');
      const action = g.situacao === 'completo'
        ? `<button class="tiny-btn" data-delivery-list-view="${esc(g.chave)}">Ver detalhes</button>`
        : `<button class="btn primary compact" data-delivery-list-ok="${esc(g.chave)}">${g.situacao === 'parcial' ? 'Concluir pendência' : 'Conferir / dar OK'}</button>`;
      return `<tr class="delivery-group-row ${esc(g.situacao)}">
        <td><b>${esc(g.aluno?.nome || '-')}</b></td>
        <td>${esc(g.aluno?.turma || '-')}</td>
        <td><b>${esc(g.fornecedor?.nome || '-')}</b></td>
        <td><div class="delivery-items-stack">${items}</div></td>
        <td>${deliveryGroupBadge(g.situacao)}<small class="delivery-progress-label">${esc(deliveryProgress(g))}</small></td>
        <td>${deliveryLastMeta(g)}</td>
        <td>${action}</td>
      </tr>`;
    }).join('');
  }

  function deliveryGroupForm(group, readOnly = false) {
    if (!group) return;
    const pending = (group.vouchers || []).filter(v => !['entregue','cancelado','divergencia'].includes(v.status));
    const list = (group.vouchers || []).map(v => {
      const delivered = v.status === 'entregue';
      const blocked = delivered || v.status === 'divergencia' || readOnly;
      const checkedAttr = delivered || (!readOnly && !blocked) ? 'checked' : '';
      const statusText = v.status === 'entregue' ? 'Já recebido' : (v.status === 'divergencia' ? 'Com divergência' : 'Receber agora');
      const audit = delivered && (v.protocolo || v.responsavel || v.atendente)
        ? `<small class="delivery-item-audit">${v.protocolo ? `Protocolo ${esc(v.protocolo)}` : ''}${v.responsavel ? ` • Responsável: ${esc(v.responsavel)}` : ''}${v.documento ? ` • Doc.: ${esc(v.documento)}` : ''}${v.atendente ? ` • Por: ${esc(v.atendente)}` : ''}</small>`
        : '';
      return `<label class="voucher-choice delivery-confirm-item ${delivered ? 'already-done' : ''}">
        <input type="checkbox" name="deliveryGroupVoucher" value="${esc(v._id)}" ${checkedAttr} ${blocked ? 'disabled' : ''}/>
        <div><strong>${esc(v.itemNome || 'Item')}</strong><small>${esc(v.itemCodigo ? `Item ${v.itemCodigo} • ` : '')}${esc(v.codigo)} • ${esc(statusText)}</small>${audit}</div>
        ${deliveryItemState(v)}
      </label>`;
    }).join('');

    openModal({
      title: readOnly ? 'Detalhes do recebimento' : (group.situacao === 'parcial' ? 'Concluir pendência' : 'Conferir e dar OK'),
      eyebrow: 'LISTA DE ENTREGA',
      saveLabel: readOnly ? 'Fechar' : 'Confirmar recebimento',
      body: `<div class="modal-form">
        <div class="delivery-student-summary full"><div><span>Aluno</span><b>${esc(group.aluno?.nome || '-')}</b><small>${esc(group.aluno?.turma || '-')}</small></div><div><span>Fornecedor</span><b>${esc(group.fornecedor?.nome || '-')}</b><small>${esc(group.situacaoLabel || '')} • ${esc(deliveryProgress(group))}</small></div></div>
        ${group.ultimaEntregaDetalhe ? `<div class="delivery-audit-card full"><div><span>Último responsável</span><b>${esc(group.ultimaEntregaDetalhe.responsavel || '-')}</b><small>${esc(group.ultimaEntregaDetalhe.tipoDocumento || 'Documento')}: ${esc(group.ultimaEntregaDetalhe.documento || '-')}</small></div><div><span>Protocolo</span><b>${esc(group.ultimaEntregaDetalhe.protocolo || '-')}</b><small>${esc(fmtDate(group.ultimaEntregaDetalhe.data, true))}</small></div><div><span>Conferido por</span><b>${esc(group.ultimaEntregaDetalhe.atendente || '-')}</b><small>${esc(group.ultimaEntregaDetalhe.atendenteTipo || '')}</small></div></div>` : ''}
        <div class="modal-note full">${readOnly ? 'Consulte os itens e os dados de auditoria registrados para este atendimento.' : 'Marque somente os itens efetivamente entregues. Os itens não marcados continuarão pendentes, e o aluno aparecerá como <b>Parcial</b> até receber tudo.'}</div>
        <div class="voucher-choice-list full">${list || '<div class="empty-state">Nenhum item disponível.</div>'}</div>
        ${readOnly ? '' : `<label><span>Nome do responsável *</span><input id="fGroupRespName" value="${esc(group.ultimaEntregaDetalhe?.responsavel || '')}" /></label>
        <label><span>Documento *</span><input id="fGroupRespDoc" value="${esc(group.ultimaEntregaDetalhe?.documento || '')}" /></label>
        <label><span>Tipo do documento</span><input id="fGroupRespDocType" value="${esc(group.ultimaEntregaDetalhe?.tipoDocumento || 'RG/CPF')}" /></label>
        <label><span>Parentesco</span><input id="fGroupRelation" value="${esc(group.ultimaEntregaDetalhe?.parentesco || '')}" placeholder="Ex.: mãe, pai, responsável legal" /></label>
        <div class="check-grid full">
          <label class="check-card"><input id="groupCheckDoc" type="checkbox" /><span>Documento conferido</span></label>
          <label class="check-card"><input id="groupCheckVoucher" type="checkbox" /><span>Voucher(s) conferido(s)</span></label>
          <label class="check-card"><input id="groupCheckItems" type="checkbox" /><span>Item(ns) físico(s) conferido(s)</span></label>
          <label class="check-card"><input id="groupCheckSignature" type="checkbox" /><span>Termo assinado</span></label>
        </div>
        <label class="full"><span>Observações</span><textarea id="fGroupNotes" placeholder="Opcional"></textarea></label>`}
      </div>`,
      onSave: readOnly ? async () => closeModal() : async () => {
        const vouchers = $$('input[name="deliveryGroupVoucher"]:checked:not(:disabled)').map(x => x.value);
        if (!vouchers.length) throw new Error('Marque ao menos um item que foi recebido agora.');
        const body = {
          aluno: group.aluno?._id,
          fornecedor: group.fornecedor?._id,
          vouchers,
          responsavel: { nome: val('fGroupRespName'), documento: val('fGroupRespDoc'), tipoDocumento: val('fGroupRespDocType'), parentesco: val('fGroupRelation') },
          checklist: { documentoConferido: checked('groupCheckDoc'), vouchersConferidos: checked('groupCheckVoucher'), itensConferidos: checked('groupCheckItems'), assinaturaColetada: checked('groupCheckSignature') },
          observacoes: val('fGroupNotes'),
        };
        if (!body.responsavel.nome.trim() || !body.responsavel.documento.trim()) throw new Error('Informe nome e documento do responsável.');
        if (!Object.values(body.checklist).every(Boolean)) throw new Error('Conclua as quatro conferências obrigatórias.');
        const result = await request('/entregas', { method: 'POST', body });
        closeModal();
        toast(`Recebimento confirmado. Protocolo ${result.entrega?.protocolo || ''}`);
        await loadBootstrap();
        await Promise.all([loadDeliveryList(), loadDeliveries()]);
      },
    });
    if (readOnly) {
      const save = $('#modalSave');
      if (save) save.textContent = 'Fechar';
    }
  }

  async function loadDeliveries() {
    const data = await request('/entregas', {}, {
      q: $('#deliveryListSearch')?.value || '', fornecedor: $('#deliverySupplierFilter').value,
      turma: $('#deliveryClassFilter').value, page: 1, limit: 100,
    });
    const rows = $('#deliveryRows');
    if (!data.entregas?.length) { rows.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhuma entrega registrada.</td></tr>'; return; }
    rows.innerHTML = data.entregas.map(e => `<tr><td><code>${esc(e.protocolo)}</code></td><td><b>${esc(e.alunoNomeSnapshot)}</b></td><td>${esc(e.turmaSnapshot)}</td><td>${esc(e.fornecedor?.nome || '-')}</td><td>${e.vouchers?.length || 0}</td><td>${esc(e.responsavel?.nome || '-')}</td><td>${esc(e.responsavel?.documento || '-')}</td><td>${esc(e.atendente?.nome || '-')}</td><td>${esc(fmtDate(e.entregueEm, true))}</td></tr>`).join('');
  }

  async function loadAgenda() {
    const data = await request('/agendas');
    const box = $('#agendaList');
    if (!data.agendas?.length) { box.innerHTML = '<div class="empty-state panel">Nenhum agendamento cadastrado.</div>'; return; }
    box.innerHTML = data.agendas.map(a => `<article class="agenda-card">
      <div class="agenda-card-head"><div><p class="eyebrow">${esc(a.campanha?.nome || 'CAMPANHA')}</p><h3>${esc(a.titulo || a.fornecedor?.nome || 'Entrega')}</h3><p>${esc(a.fornecedor?.nome || '-')}</p></div>${statusBadge(a.status)}</div>
      <div class="agenda-meta"><div class="meta-box"><small>Período</small><b>${esc(formatRange(a.inicio, a.fim))}</b></div><div class="meta-box"><small>Horário</small><b>${esc(a.horarioInicio && a.horarioFim ? `${a.horarioInicio}–${a.horarioFim}` : 'Livre')}</b></div><div class="meta-box"><small>Turmas</small><b>${esc((a.turmas || []).length ? a.turmas.join(', ') : 'Todas')}</b></div><div class="meta-box"><small>Local</small><b>${esc(a.local || 'Escola')}</b></div></div>
      <div class="card-actions"><button class="tiny-btn" data-edit-schedule="${a._id}">Editar</button></div>
    </article>`).join('');
    state.currentAgendas = data.agendas;
  }

  async function loadDivergences() {
    const data = await request('/divergencias', {}, { status: $('#divStatusFilter').value, fornecedor: $('#divSupplierFilter').value });
    state.currentDivergences = data.divergencias || [];
    const rows = $('#divergenceRows');
    if (!data.divergencias?.length) { rows.innerHTML = '<tr><td colspan="7" class="empty-cell">Nenhuma divergência encontrada.</td></tr>'; return; }
    rows.innerHTML = data.divergencias.map(d => `<tr><td><b>${esc(d.alunoNomeSnapshot)}</b></td><td>${esc(d.turmaSnapshot)}</td><td>${esc(d.fornecedor?.nome || '-')}</td><td>${esc(divergenceLabels[d.tipo] || d.tipo)}</td><td>${esc(d.descricao)}</td><td>${statusBadge(d.status)}</td><td>${d.status === 'resolvida' || d.status === 'cancelada' ? '' : `<button class="tiny-btn" data-resolve-div="${d._id}">Tratar</button>`}</td></tr>`).join('');
  }

  function setImportFile(file) {
    state.importFile = file || null;
    const name = $('#voucherPdfName');
    if (name) name.textContent = file ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Nenhum arquivo selecionado';
    $('#voucherDropZone')?.classList.toggle('has-file', Boolean(file));
  }

  function clearImportSelection({ keepAnalysis = false } = {}) {
    setImportFile(null);
    if ($('#voucherPdfFile')) $('#voucherPdfFile').value = '';
    if (!keepAnalysis) {
      state.currentImport = null;
      $('#importAnalysisPanel').hidden = true;
    }
  }

  function importSituationText(r) {
    if (r.situacao === 'novo_fornecedor' && (r.flags || []).includes('item_novo')) return 'Fornecedor e item novos';
    return statusLabels[r.situacao] || r.situacao || '-';
  }

  function renderImportAnalysis() {
    const imp = state.currentImport;
    const panel = $('#importAnalysisPanel');
    if (!imp) { panel.hidden = true; return; }
    panel.hidden = false;
    const t = imp.totais || {};
    $('#importAnalysisFile').textContent = `${imp.arquivo?.nome || 'PDF'} • ${imp.arquivo?.paginas || 0} página(s) • SHA-256 ${String(imp.arquivo?.sha256 || '').slice(0, 12)}…`;
    $('#imDetected').textContent = t.detectados || 0;
    $('#imStudents').textContent = t.alunos || 0;
    $('#imReady').textContent = t.prontos || 0;
    $('#imPending').textContent = t.pendentes || 0;
    $('#imDuplicates').textContent = t.duplicados || 0;
    renderImportRows();
  }

  function renderImportRows() {
    const imp = state.currentImport;
    const rows = $('#importRows');
    if (!rows) return;
    if (!imp?.registros?.length) { rows.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhum registro disponível.</td></tr>'; return; }
    const filtro = $('#importStatusFilter')?.value || 'todos';
    const list = imp.registros.filter(r => filtro === 'todos' || r.situacao === filtro);
    if (!list.length) { rows.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhum registro neste filtro.</td></tr>'; return; }
    rows.innerHTML = list.map(r => {
      const needsStudent = r.situacao === 'revisar_aluno';
      const notes = [...(r.erros || []), ...(r.avisos || [])];
      return `<tr class="import-row ${esc(r.situacao || '')}">
        <td>${esc(r.pagina || '-')}</td>
        <td><b>${esc(r.alunoImportado || '-')}</b>${r.alunoNomeSistema ? `<small class="match-note">↳ ${esc(r.alunoNomeSistema)}</small>` : ''}${notes.length ? `<small class="row-note" title="${esc(notes.join(' | '))}">${esc(notes[0])}</small>` : ''}</td>
        <td>${esc(r.turmaImportada || '-')} ${r.turmaSistema && r.turmaSistema !== r.turmaImportada ? `<small class="match-note">↳ ${esc(r.turmaSistema)}</small>` : ''}</td>
        <td><code>${esc(r.codigo || '-')}</code></td>
        <td>${esc(r.fornecedorImportado || '-')}</td>
        <td><b>${esc(r.itemCodigo || '-')}</b><small class="match-note">${esc(r.itemNomeSugerido || '')}</small></td>
        <td>${statusBadge(r.situacao)}${(r.flags || []).length > 1 ? `<small class="match-note">${esc(importSituationText(r))}</small>` : ''}</td>
        <td>${needsStudent ? `<button class="tiny-btn" data-link-import-student="${esc(r._id)}">Vincular aluno</button>` : ''}</td>
      </tr>`;
    }).join('');
  }

  async function loadImportHistory() {
    const data = await request('/importacoes', {}, { campanha: $('#globalCampaign')?.value || '', limit: 30 });
    state.importHistory = data.importacoes || [];
    const rows = $('#importHistoryRows');
    if (!state.importHistory.length) { rows.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhuma importação realizada.</td></tr>'; return; }
    rows.innerHTML = state.importHistory.map(i => `<tr>
      <td><b>${esc(i.arquivo?.nome || '-')}</b><small class="match-note">${i.arquivo?.paginas || 0} página(s)</small></td>
      <td>${esc(i.campanha?.nome || '-')}</td>
      <td>${esc(fmtDate(i.createdAt, true))}</td>
      <td>${esc(i.totais?.detectados || 0)}</td>
      <td>${esc(i.totais?.importados || 0)}</td>
      <td>${esc(i.totais?.pendentes || 0)}</td>
      <td>${statusBadge(i.status)}</td>
      <td><button class="tiny-btn" data-open-import="${i._id}">Abrir</button></td>
    </tr>`).join('');
  }

  async function analyzeImportPdf() {
    const campanha = $('#importCampaign').value;
    const file = state.importFile;
    if (!campanha) throw new Error('Selecione a campanha de destino.');
    if (!file) throw new Error('Selecione o PDF de vouchers.');
    const btn = $('#analyzePdfBtn');
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Analisando PDF...';
    try {
      const form = new FormData();
      form.append('campanha', campanha);
      form.append('arquivo', file, file.name);
      const data = await request('/importacoes/analisar-pdf', { method: 'POST', body: form });
      state.currentImport = data.importacao;
      renderImportAnalysis();
      toast(data.mensagem || 'PDF analisado.');
      await loadImportHistory();
      $('#importAnalysisPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  async function openImportAnalysis(id) {
    const data = await request(`/importacoes/${id}`);
    state.currentImport = data.importacao;
    if (data.importacao?.campanha?._id && $('#importCampaign')) $('#importCampaign').value = data.importacao.campanha._id;
    renderImportAnalysis();
    $('#importAnalysisPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function confirmCurrentImport() {
    const imp = state.currentImport;
    if (!imp?._id) throw new Error('Analise um PDF antes de confirmar.');
    const pendAlunos = (imp.registros || []).filter(r => r.situacao === 'revisar_aluno').length;
    const msg = pendAlunos
      ? `Há ${pendAlunos} registro(s) sem aluno confirmado. Eles permanecerão pendentes. Deseja importar os demais?`
      : 'Confirmar a gravação dos vouchers analisados no Axoriin?';
    if (!window.confirm(msg)) return;
    const btn = $('#confirmImportBtn'); const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Importando...';
    try {
      const data = await request(`/importacoes/${imp._id}/confirmar`, {
        method: 'POST',
        body: { criarFornecedores: $('#autoCreateSuppliers').checked, criarItens: $('#autoCreateItems').checked },
      });
      state.currentImport = data.importacao;
      renderImportAnalysis();
      toast(data.mensagem || 'Importação concluída.');
      await loadBootstrap();
      await loadImportHistory();
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  function linkImportStudent(registro) {
    const imp = state.currentImport;
    if (!imp?._id || !registro?._id) return;
    openModal({
      title: 'Vincular aluno', eyebrow: 'REVISÃO DA IMPORTAÇÃO', saveLabel: 'Confirmar vínculo',
      body: `<div class="modal-form"><div class="modal-note"><b>PDF:</b> ${esc(registro.alunoImportado)} • ${esc(registro.turmaImportada)}<br>Localize abaixo o aluno correto já cadastrado no Axoriin.</div>
        <label class="full"><span>Buscar aluno</span><input id="fImportStudentSearch" placeholder="Digite o nome do aluno..." value="${esc(registro.alunoImportado || '')}" /></label>
        <label class="full"><span>Aluno selecionado *</span><select id="fImportStudent"><option value="">Aguardando busca...</option></select></label></div>`,
      onSave: async () => {
        const aluno = val('fImportStudent');
        if (!aluno) throw new Error('Selecione o aluno correto.');
        await request(`/importacoes/${imp._id}/registros/${registro._id}/aluno`, { method: 'PATCH', body: { aluno } });
        closeModal();
        await openImportAnalysis(imp._id);
        toast('Aluno vinculado à importação.');
      },
    });
    setupStudentSearch('fImportStudentSearch', 'fImportStudent');
    $('#fImportStudentSearch').dispatchEvent(new Event('input'));
  }

  function deliveryQuickReportParams(type) {
    return {
      ...deliveryListParams({ page: 1, limit: 500000 }),
      situacao: 'todos',
      relatorio: type,
    };
  }

  function openDeliveryQuickReport(type, format) {
    const safeFormat = format === 'docx' ? 'docx' : 'pdf';
    location.href = apiUrl(`/lista-entrega/${safeFormat}`, deliveryQuickReportParams(type));
  }

  function reportParams() {
    return {
      campanha: $('#reportCampaign').value, turma: $('#reportClass').value, fornecedor: $('#reportSupplier').value,
      item: $('#reportItem').value, status: $('#reportStatus').value, periodoCampo: $('#reportPeriodField').value,
      dataInicio: $('#reportStart').value, dataFim: $('#reportEnd').value, q: $('#reportSearch').value,
    };
  }

  async function previewReport() {
    const data = await request('/relatorios/dados', {}, reportParams());
    const s = data.summary || {};
    $('#reportTotal').textContent = s.total || 0;
    $('#reportStudents').textContent = s.alunos || 0;
    $('#reportDelivered').textContent = s.entregues || 0;
    $('#reportPending').textContent = s.pendentes || 0;
    $('#reportDivergences').textContent = s.divergencias || 0;
    const max = Math.max(1, ...(s.porTurma || []).map(x => x.quantidade));
    $('#reportByClass').innerHTML = (s.porTurma || []).slice(0, 10).map(x => `<div class="bar-row"><span>${esc(x.nome)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((x.quantidade / max) * 100)}%"></div></div><b>${x.quantidade}</b></div>`).join('') || '<div class="empty-state">Sem dados para exibir.</div>';
  }

  async function openView(view) {
    state.view = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    const [eyebrow, title] = viewMeta[view] || ['', 'Uniformes e Vouchers'];
    $('#viewEyebrow').textContent = eyebrow; $('#viewTitle').textContent = title;
    closeSidebar();
    try {
      if (view === 'vouchers') await loadVouchers();
      if (view === 'importar') await loadImportHistory();
      if (view === 'entregas') await Promise.all([loadDeliveryList(), loadDeliveries()]);
      if (view === 'agenda') await loadAgenda();
      if (view === 'pendencias') await loadDivergences();
      if (view === 'relatorios') await previewReport();
    } catch (e) { toast(e.message, 'err'); }
  }

  function openModal({ title, eyebrow = 'CADASTRO', body = '', saveLabel = 'Salvar', onSave, context = null }) {
    $('#modalTitle').textContent = title;
    $('#modalEyebrow').textContent = eyebrow;
    $('#modalBody').innerHTML = body;
    $('#modalSave').textContent = saveLabel;
    state.modalSaveHandler = onSave;
    state.modalContext = context;
    $('#modalBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#modalBody input, #modalBody select')?.focus(), 40);
  }

  function closeModal() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    state.modalSaveHandler = null;
    state.modalContext = null;
    state.deliveryStudent = null;
    state.deliveryVouchers = [];
  }

  function val(id) { return $(`#${id}`)?.value ?? ''; }
  function checked(id) { return !!$(`#${id}`)?.checked; }

  function supplierForm(s = {}) {
    openModal({
      title: s._id ? 'Editar fornecedor' : 'Novo fornecedor', eyebrow: 'FORNECEDORES',
      body: `<div class="modal-form">
        <label class="full"><span>Nome para exibição *</span><input id="fSupplierName" value="${esc(s.nome || '')}" placeholder="Ex.: Malharia Juruá Ltda" /></label>
        <label><span>Razão social</span><input id="fSupplierLegal" value="${esc(s.razaoSocial || '')}" /></label>
        <label><span>Nome fantasia</span><input id="fSupplierTrade" value="${esc(s.nomeFantasia || '')}" /></label>
        <label><span>CNPJ/CPF</span><input id="fSupplierDoc" value="${esc(s.documento || '')}" /></label>
        <label><span>Responsável</span><input id="fSupplierManager" value="${esc(s.responsavel || '')}" /></label>
        <label><span>WhatsApp</span><input id="fSupplierWhats" value="${esc(s.whatsapp || '')}" /></label>
        <label><span>E-mail</span><input id="fSupplierEmail" type="email" value="${esc(s.email || '')}" /></label>
        <label class="full"><span>Observações</span><textarea id="fSupplierNotes">${esc(s.observacoes || '')}</textarea></label>
        <label class="check-card full"><input id="fSupplierActive" type="checkbox" ${s.ativo === false ? '' : 'checked'} /><span>Fornecedor ativo</span></label>
      </div>`,
      onSave: async () => {
        const body = { nome: val('fSupplierName'), razaoSocial: val('fSupplierLegal'), nomeFantasia: val('fSupplierTrade'), documento: val('fSupplierDoc'), responsavel: val('fSupplierManager'), whatsapp: val('fSupplierWhats'), email: val('fSupplierEmail'), observacoes: val('fSupplierNotes'), ativo: checked('fSupplierActive') };
        if (!body.nome.trim()) throw new Error('Informe o nome do fornecedor.');
        await request(s._id ? `/fornecedores/${s._id}` : '/fornecedores', { method: s._id ? 'PUT' : 'POST', body });
        closeModal(); toast('Fornecedor salvo com sucesso.'); await loadBootstrap();
      },
    });
  }

  function campaignForm(c = {}) {
    const suppliers = state.bootstrap?.fornecedores || [];
    const selected = new Set((c.fornecedores || []).map(x => String(x._id || x)));
    openModal({
      title: c._id ? 'Editar campanha' : 'Nova campanha', eyebrow: 'CAMPANHAS',
      body: `<div class="modal-form">
        <label class="full"><span>Nome da campanha *</span><input id="fCampaignName" value="${esc(c.nome || `Uniformes Escolares ${new Date().getFullYear()}`)}" /></label>
        <label><span>Ano letivo *</span><input id="fCampaignYear" type="number" min="2000" max="2200" value="${esc(c.anoLetivo || new Date().getFullYear())}" /></label>
        <label><span>Status</span><select id="fCampaignStatus"><option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option><option value="arquivada">Arquivada</option></select></label>
        <label><span>Data inicial</span><input id="fCampaignStart" type="date" value="${c.dataInicio ? new Date(c.dataInicio).toISOString().slice(0,10) : ''}" /></label>
        <label><span>Data final</span><input id="fCampaignEnd" type="date" value="${c.dataFim ? new Date(c.dataFim).toISOString().slice(0,10) : ''}" /></label>
        <label class="full"><span>Fornecedores participantes</span><select id="fCampaignSuppliers" multiple size="${Math.min(6, Math.max(3, suppliers.length))}">${suppliers.map(s => `<option value="${s._id}" ${selected.has(String(s._id)) ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
        <label class="full"><span>Descrição</span><textarea id="fCampaignDescription">${esc(c.descricao || '')}</textarea></label>
      </div>`,
      onSave: async () => {
        const body = { nome: val('fCampaignName'), anoLetivo: Number(val('fCampaignYear')), status: val('fCampaignStatus'), dataInicio: val('fCampaignStart') || null, dataFim: val('fCampaignEnd') || null, descricao: val('fCampaignDescription'), fornecedores: [...$('#fCampaignSuppliers').selectedOptions].map(o => o.value) };
        if (!body.nome.trim()) throw new Error('Informe o nome da campanha.');
        await request(c._id ? `/campanhas/${c._id}` : '/campanhas', { method: c._id ? 'PUT' : 'POST', body });
        closeModal(); toast('Campanha salva com sucesso.'); await loadBootstrap();
      },
    });
    $('#fCampaignStatus').value = c.status || 'rascunho';
  }

  function itemForm(item = {}) {
    const campaigns = state.bootstrap?.campanhas || [];
    const suppliers = state.bootstrap?.fornecedores || [];
    openModal({
      title: item._id ? 'Editar item/kit' : 'Novo item/kit', eyebrow: 'ITENS E KITS',
      body: `<div class="modal-form">
        <label><span>Campanha *</span><select id="fItemCampaign"><option value="">Selecione</option>${campaigns.map(c => `<option value="${c._id}">${esc(c.nome)} • ${c.anoLetivo}</option>`).join('')}</select></label>
        <label><span>Fornecedor</span><select id="fItemSupplier"><option value="">Sem vínculo específico</option>${suppliers.map(s => `<option value="${s._id}">${esc(s.nome)}</option>`).join('')}</select></label>
        <label><span>Código externo</span><input id="fItemCode" value="${esc(item.codigoExterno || '')}" placeholder="Ex.: 08" /></label>
        <label><span>Quantidade de peças</span><input id="fItemQty" type="number" min="1" max="100" value="${esc(item.quantidadePecas || 1)}" /></label>
        <label class="full"><span>Nome do item/kit *</span><input id="fItemName" value="${esc(item.nome || '')}" placeholder="Ex.: Kit Ensino Médio - Unissex" /></label>
        <label><span>Categoria</span><input id="fItemCategory" value="${esc(item.categoria || 'uniforme')}" /></label>
        <label><span>Gênero</span><select id="fItemGender"><option value="nao_aplicavel">Não aplicável</option><option value="unissex">Unissex</option><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select></label>
        <label><span>Etapa</span><input id="fItemStage" value="${esc(item.etapa || '')}" placeholder="Ex.: Ensino Médio" /></label>
        <label class="check-card"><input id="fItemActive" type="checkbox" ${item.ativo === false ? '' : 'checked'} /><span>Item ativo</span></label>
        <label class="full"><span>Descrição/composição</span><textarea id="fItemDescription">${esc(item.descricao || '')}</textarea></label>
      </div>`,
      onSave: async () => {
        const body = { campanha: val('fItemCampaign'), fornecedor: val('fItemSupplier') || null, codigoExterno: val('fItemCode'), quantidadePecas: Number(val('fItemQty') || 1), nome: val('fItemName'), categoria: val('fItemCategory'), genero: val('fItemGender'), etapa: val('fItemStage'), descricao: val('fItemDescription'), ativo: checked('fItemActive') };
        if (!body.campanha || !body.nome.trim()) throw new Error('Informe campanha e nome do item/kit.');
        await request(item._id ? `/itens/${item._id}` : '/itens', { method: item._id ? 'PUT' : 'POST', body });
        closeModal(); toast('Item/kit salvo com sucesso.'); await loadBootstrap();
      },
    });
    $('#fItemCampaign').value = String(item.campanha?._id || item.campanha || campaigns.find(c => c.status === 'ativa')?._id || '');
    $('#fItemSupplier').value = String(item.fornecedor?._id || item.fornecedor || '');
    $('#fItemGender').value = item.genero || 'nao_aplicavel';
  }

  async function setupStudentSearch(inputId, selectId, onSelect = null) {
    const input = $(`#${inputId}`); const select = $(`#${selectId}`);
    let timer;
    async function run() {
      const q = input.value.trim();
      if (q.length < 2) { select.innerHTML = '<option value="">Digite ao menos 2 caracteres...</option>'; return; }
      try {
        const data = await request('/alunos', {}, { q });
        select.innerHTML = '<option value="">Selecione o aluno...</option>' + (data.alunos || []).map(a => `<option value="${a._id}">${esc(a.nome)} • ${esc(a.turma)}</option>`).join('');
      } catch (e) { toast(e.message, 'err'); }
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 260); });
    select.addEventListener('change', () => onSelect?.(select.value));
  }

  function voucherForm() {
    const campaigns = state.bootstrap?.campanhas || [];
    const suppliers = state.bootstrap?.fornecedores || [];
    const items = state.bootstrap?.itens || [];
    openModal({
      title: 'Novo voucher', eyebrow: 'VOUCHERS',
      body: `<div class="modal-form">
        <label class="full"><span>Buscar aluno *</span><input id="fVoucherStudentSearch" placeholder="Digite o nome, turma ou código..." /><select id="fVoucherStudent"><option value="">Aguardando busca...</option></select></label>
        <label><span>Campanha *</span><select id="fVoucherCampaign"><option value="">Selecione</option>${campaigns.map(c => `<option value="${c._id}">${esc(c.nome)} • ${c.anoLetivo}</option>`).join('')}</select></label>
        <label><span>Fornecedor *</span><select id="fVoucherSupplier"><option value="">Selecione</option>${suppliers.map(s => `<option value="${s._id}">${esc(s.nome)}</option>`).join('')}</select></label>
        <label><span>Item/Kit *</span><select id="fVoucherItem"><option value="">Selecione</option>${items.map(i => `<option value="${i._id}" data-campaign="${i.campanha?._id || i.campanha}" data-supplier="${i.fornecedor?._id || i.fornecedor || ''}">${esc(i.codigoExterno ? `${i.codigoExterno} • ` : '')}${esc(i.nome)}</option>`).join('')}</select></label>
        <label><span>Código do voucher *</span><input id="fVoucherCode" placeholder="Código único" /></label>
        <label><span>Quantidade</span><input id="fVoucherQty" type="number" min="1" value="1" /></label>
        <label><span>Validade</span><input id="fVoucherExpiry" type="date" /></label>
        <label><span>Lote</span><input id="fVoucherLot" placeholder="Ex.: Cruzeiro do Sul" /></label>
        <label><span>Status inicial</span><select id="fVoucherStatus"><option value="cadastrado">Cadastrado</option><option value="validado">Validado</option><option value="aguardando_fornecedor">Aguardando fornecedor</option><option value="disponivel_entrega">Disponível para entrega</option><option value="agendado">Agendado</option></select></label>
        <label class="full"><span>Observações</span><textarea id="fVoucherNotes"></textarea></label>
      </div>`,
      onSave: async () => {
        const body = { aluno: val('fVoucherStudent'), campanha: val('fVoucherCampaign'), fornecedor: val('fVoucherSupplier'), item: val('fVoucherItem'), codigo: val('fVoucherCode'), quantidade: Number(val('fVoucherQty') || 1), validade: val('fVoucherExpiry') || null, lote: val('fVoucherLot'), status: val('fVoucherStatus'), observacoes: val('fVoucherNotes') };
        if (!body.aluno || !body.campanha || !body.fornecedor || !body.item || !body.codigo.trim()) throw new Error('Preencha aluno, campanha, fornecedor, item e código do voucher.');
        await request('/vouchers', { method: 'POST', body });
        closeModal(); toast('Voucher cadastrado com sucesso.'); await loadBootstrap(); if (state.view === 'vouchers') await loadVouchers();
      },
    });
    $('#fVoucherCampaign').value = campaigns.find(c => c.status === 'ativa')?._id || '';
    setupStudentSearch('fVoucherStudentSearch', 'fVoucherStudent');
    const filterItems = () => {
      const camp = val('fVoucherCampaign'); const supplier = val('fVoucherSupplier');
      $$('#fVoucherItem option[data-campaign]').forEach(o => {
        const matches = (!camp || o.dataset.campaign === camp) && (!supplier || !o.dataset.supplier || o.dataset.supplier === supplier);
        o.hidden = !matches;
      });
      if ($('#fVoucherItem').selectedOptions[0]?.hidden) $('#fVoucherItem').value = '';
    };
    $('#fVoucherCampaign').addEventListener('change', filterItems); $('#fVoucherSupplier').addEventListener('change', filterItems); filterItems();
  }

  function scheduleForm(a = {}) {
    const campaigns = state.bootstrap?.campanhas || [];
    const suppliers = state.bootstrap?.fornecedores || [];
    openModal({
      title: a._id ? 'Editar agendamento' : 'Novo agendamento', eyebrow: 'AGENDA',
      body: `<div class="modal-form">
        <label><span>Campanha *</span><select id="fScheduleCampaign"><option value="">Selecione</option>${campaigns.map(c => `<option value="${c._id}">${esc(c.nome)} • ${c.anoLetivo}</option>`).join('')}</select></label>
        <label><span>Fornecedor *</span><select id="fScheduleSupplier"><option value="">Selecione</option>${suppliers.map(s => `<option value="${s._id}">${esc(s.nome)}</option>`).join('')}</select></label>
        <label class="full"><span>Título</span><input id="fScheduleTitle" value="${esc(a.titulo || '')}" placeholder="Ex.: Semana de entrega — Malharia X" /></label>
        <label><span>Data inicial *</span><input id="fScheduleStart" type="date" value="${a.inicio ? new Date(a.inicio).toISOString().slice(0,10) : ''}" /></label>
        <label><span>Data final *</span><input id="fScheduleEnd" type="date" value="${a.fim ? new Date(a.fim).toISOString().slice(0,10) : ''}" /></label>
        <label><span>Horário inicial</span><input id="fScheduleTimeStart" type="time" value="${esc(a.horarioInicio || '')}" /></label>
        <label><span>Horário final</span><input id="fScheduleTimeEnd" type="time" value="${esc(a.horarioFim || '')}" /></label>
        <label><span>Local</span><input id="fSchedulePlace" value="${esc(a.local || 'Escola')}" /></label>
        <label><span>Status</span><select id="fScheduleStatus"><option value="planejada">Planejada</option><option value="confirmada">Confirmada</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label>
        <label class="full"><span>Turmas (separadas por vírgula; vazio = todas)</span><input id="fScheduleClasses" value="${esc((a.turmas || []).join(', '))}" placeholder="Ex.: 2ª SÉRIE A, 2ª SÉRIE B" /></label>
        <label class="full"><span>Orientações aos responsáveis</span><textarea id="fScheduleInstructions">${esc(a.instrucoes || '')}</textarea></label>
      </div>`,
      onSave: async () => {
        const body = { campanha: val('fScheduleCampaign'), fornecedor: val('fScheduleSupplier'), titulo: val('fScheduleTitle'), inicio: val('fScheduleStart'), fim: val('fScheduleEnd'), horarioInicio: val('fScheduleTimeStart'), horarioFim: val('fScheduleTimeEnd'), local: val('fSchedulePlace'), status: val('fScheduleStatus'), turmas: val('fScheduleClasses').split(',').map(x => x.trim()).filter(Boolean), instrucoes: val('fScheduleInstructions') };
        if (!body.campanha || !body.fornecedor || !body.inicio || !body.fim) throw new Error('Informe campanha, fornecedor e período.');
        await request(a._id ? `/agendas/${a._id}` : '/agendas', { method: a._id ? 'PUT' : 'POST', body });
        closeModal(); toast('Agendamento salvo com sucesso.'); await loadBootstrap(); if (state.view === 'agenda') await loadAgenda();
      },
    });
    $('#fScheduleCampaign').value = String(a.campanha?._id || a.campanha || campaigns.find(c => c.status === 'ativa')?._id || '');
    $('#fScheduleSupplier').value = String(a.fornecedor?._id || a.fornecedor || '');
    $('#fScheduleStatus').value = a.status || 'planejada';
  }

  function renderDeliveryVoucherChoices() {
    const box = $('#deliveryVoucherChoices');
    if (!box) return;
    const supplier = val('fDeliverySupplier');
    const eligible = (state.deliveryVouchers || []).filter(v => String(v.fornecedor?._id || v.fornecedor) === supplier && !['entregue','cancelado'].includes(v.status));
    if (!eligible.length) { box.innerHTML = '<div class="empty-state">Nenhum voucher pendente deste fornecedor para o aluno.</div>'; return; }
    box.innerHTML = eligible.map(v => `<label class="voucher-choice"><input type="checkbox" name="deliveryVoucher" value="${v._id}" ${v.status === 'divergencia' ? 'disabled' : ''}/><div><strong>${esc(v.itemNomeSnapshot || v.item?.nome || 'Item')}</strong><small>${esc(v.codigo)} • ${esc(statusLabels[v.status] || v.status)}</small></div><span class="tag">${esc(v.fornecedor?.nome || '')}</span></label>`).join('');
  }

  async function deliveryForm() {
    const suppliers = state.bootstrap?.fornecedores || [];
    openModal({
      title: 'Conferir e registrar entrega', eyebrow: 'ENTREGA ASSISTIDA', saveLabel: 'Finalizar entrega',
      body: `<div class="modal-form">
        <div class="modal-note">O Axoriin só permitirá concluir vouchers do <b>mesmo aluno e do mesmo fornecedor</b>. Itens de outra malharia permanecem pendentes para a data correspondente.</div>
        <label class="full"><span>Buscar aluno *</span><input id="fDeliveryStudentSearch" placeholder="Digite o nome, turma ou código..." /><select id="fDeliveryStudent"><option value="">Aguardando busca...</option></select></label>
        <label class="full"><span>Fornecedor da entrega *</span><select id="fDeliverySupplier"><option value="">Selecione</option>${suppliers.map(s => `<option value="${s._id}">${esc(s.nome)}</option>`).join('')}</select></label>
        <div id="deliveryVoucherChoices" class="voucher-choice-list"><div class="empty-state">Selecione aluno e fornecedor para visualizar os vouchers.</div></div>
        <label><span>Nome do responsável *</span><input id="fDeliveryRespName" /></label>
        <label><span>Documento *</span><input id="fDeliveryRespDoc" /></label>
        <label><span>Tipo do documento</span><input id="fDeliveryRespDocType" value="RG/CPF" /></label>
        <label><span>Parentesco</span><input id="fDeliveryRelation" placeholder="Ex.: mãe, pai, responsável legal" /></label>
        <div class="check-grid">
          <label class="check-card"><input id="checkDoc" type="checkbox" /><span>Documento conferido</span></label>
          <label class="check-card"><input id="checkVoucher" type="checkbox" /><span>Voucher(s) conferido(s)</span></label>
          <label class="check-card"><input id="checkItems" type="checkbox" /><span>Item(ns) físico(s) conferido(s)</span></label>
          <label class="check-card"><input id="checkSignature" type="checkbox" /><span>Assinatura coletada no termo</span></label>
        </div>
        <label class="full"><span>Observações</span><textarea id="fDeliveryNotes"></textarea></label>
      </div>`,
      onSave: async () => {
        const vouchers = $$('input[name="deliveryVoucher"]:checked').map(x => x.value);
        const body = { aluno: val('fDeliveryStudent'), fornecedor: val('fDeliverySupplier'), vouchers, responsavel: { nome: val('fDeliveryRespName'), documento: val('fDeliveryRespDoc'), tipoDocumento: val('fDeliveryRespDocType'), parentesco: val('fDeliveryRelation') }, checklist: { documentoConferido: checked('checkDoc'), vouchersConferidos: checked('checkVoucher'), itensConferidos: checked('checkItems'), assinaturaColetada: checked('checkSignature') }, observacoes: val('fDeliveryNotes') };
        if (!body.aluno || !body.fornecedor || !vouchers.length) throw new Error('Selecione aluno, fornecedor e ao menos um voucher.');
        if (!body.responsavel.nome.trim() || !body.responsavel.documento.trim()) throw new Error('Informe nome e documento do responsável.');
        if (!Object.values(body.checklist).every(Boolean)) throw new Error('Conclua todas as conferências obrigatórias.');
        const data = await request('/entregas', { method: 'POST', body });
        closeModal(); toast(`Entrega concluída. Protocolo ${data.entrega?.protocolo || ''}`); await loadBootstrap(); if (state.view === 'entregas') await Promise.all([loadDeliveryList(), loadDeliveries()]);
      },
    });
    setupStudentSearch('fDeliveryStudentSearch', 'fDeliveryStudent', async id => {
      if (!id) { state.deliveryVouchers = []; renderDeliveryVoucherChoices(); return; }
      try {
        const data = await request(`/alunos/${id}/resumo`);
        state.deliveryStudent = data.aluno; state.deliveryVouchers = data.vouchers || [];
        const supplierIds = [...new Set(state.deliveryVouchers.filter(v => !['entregue','cancelado'].includes(v.status)).map(v => String(v.fornecedor?._id || v.fornecedor)))];
        if (supplierIds.length === 1) $('#fDeliverySupplier').value = supplierIds[0];
        renderDeliveryVoucherChoices();
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#fDeliverySupplier').addEventListener('change', renderDeliveryVoucherChoices);
  }

  async function divergenceForm() {
    const campaigns = state.bootstrap?.campanhas || [];
    const suppliers = state.bootstrap?.fornecedores || [];
    openModal({
      title: 'Registrar divergência', eyebrow: 'PENDÊNCIAS', saveLabel: 'Registrar pendência',
      body: `<div class="modal-form">
        <label class="full"><span>Buscar aluno *</span><input id="fDivStudentSearch" placeholder="Digite o nome, turma ou código..." /><select id="fDivStudent"><option value="">Aguardando busca...</option></select></label>
        <label><span>Campanha *</span><select id="fDivCampaign"><option value="">Selecione</option>${campaigns.map(c => `<option value="${c._id}">${esc(c.nome)} • ${c.anoLetivo}</option>`).join('')}</select></label>
        <label><span>Fornecedor *</span><select id="fDivSupplier"><option value="">Selecione</option>${suppliers.map(s => `<option value="${s._id}">${esc(s.nome)}</option>`).join('')}</select></label>
        <label><span>Tipo *</span><select id="fDivType">${Object.entries(divergenceLabels).map(([k,v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label><span>Voucher (opcional)</span><select id="fDivVoucher"><option value="">Sem voucher específico</option></select></label>
        <label class="full"><span>Descrição *</span><textarea id="fDivDescription" placeholder="Descreva o problema encontrado..."></textarea></label>
      </div>`,
      onSave: async () => {
        const body = { aluno: val('fDivStudent'), campanha: val('fDivCampaign'), fornecedor: val('fDivSupplier'), voucher: val('fDivVoucher') || null, tipo: val('fDivType'), descricao: val('fDivDescription') };
        if (!body.aluno || !body.campanha || !body.fornecedor || !body.descricao.trim()) throw new Error('Preencha aluno, campanha, fornecedor e descrição.');
        await request('/divergencias', { method: 'POST', body });
        closeModal(); toast('Divergência registrada.'); await loadBootstrap(); if (state.view === 'pendencias') await loadDivergences();
      },
    });
    $('#fDivCampaign').value = campaigns.find(c => c.status === 'ativa')?._id || '';
    let studentVouchers = [];
    const updateDivVouchers = () => {
      const supplier = val('fDivSupplier'); const campaign = val('fDivCampaign');
      const matches = studentVouchers.filter(v => (!supplier || String(v.fornecedor?._id || v.fornecedor) === supplier) && (!campaign || String(v.campanha?._id || v.campanha) === campaign));
      $('#fDivVoucher').innerHTML = '<option value="">Sem voucher específico</option>' + matches.map(v => `<option value="${v._id}">${esc(v.codigo)} • ${esc(v.itemNomeSnapshot || v.item?.nome || '')}</option>`).join('');
    };
    setupStudentSearch('fDivStudentSearch', 'fDivStudent', async id => {
      if (!id) { studentVouchers = []; updateDivVouchers(); return; }
      try { const data = await request(`/alunos/${id}/resumo`); studentVouchers = data.vouchers || []; updateDivVouchers(); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('#fDivSupplier').addEventListener('change', updateDivVouchers); $('#fDivCampaign').addEventListener('change', updateDivVouchers);
  }

  function resolveDivergence(d) {
    openModal({
      title: 'Tratar divergência', eyebrow: 'PENDÊNCIA', saveLabel: 'Atualizar',
      body: `<div class="modal-form"><div class="modal-note danger-note"><b>${esc(d.alunoNomeSnapshot)}</b> • ${esc(d.turmaSnapshot)}<br>${esc(divergenceLabels[d.tipo] || d.tipo)} — ${esc(d.descricao)}</div>
        <label><span>Novo status</span><select id="fResolveStatus"><option value="em_tratamento">Em tratamento</option><option value="resolvida">Resolvida</option><option value="cancelada">Cancelada</option></select></label>
        <label class="full"><span>Resolução / observação</span><textarea id="fResolution">${esc(d.resolucao || '')}</textarea></label></div>`,
      onSave: async () => {
        await request(`/divergencias/${d._id}`, { method: 'PATCH', body: { status: val('fResolveStatus'), resolucao: val('fResolution') } });
        closeModal(); toast('Pendência atualizada.'); await loadBootstrap(); await loadDivergences();
      },
    });
    $('#fResolveStatus').value = d.status === 'aberta' ? 'em_tratamento' : d.status;
  }

  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }

  function bindEvents() {
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => openView(btn.dataset.view)));
    $$('[data-open-view]').forEach(btn => btn.addEventListener('click', () => openView(btn.dataset.openView)));
    $('#menuBtn').addEventListener('click', openSidebar); $('#sidebarBackdrop').addEventListener('click', closeSidebar);
    $('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    $('#modalClose').addEventListener('click', closeModal); $('#modalCancel').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeModal(); });
    $('#modalSave').addEventListener('click', async () => {
      if (!state.modalSaveHandler) return;
      const btn = $('#modalSave'); const old = btn.textContent; btn.disabled = true; btn.textContent = 'Salvando...';
      try { await state.modalSaveHandler(); } catch (e) { toast(e.message, 'err'); }
      finally { btn.disabled = false; if (!$('#modalBackdrop').hidden) btn.textContent = old; }
    });

    $('#globalCampaign').addEventListener('change', async () => {
      try {
        const data = await request('/dashboard', {}, { campanha: $('#globalCampaign').value });
        renderDashboard(data.dashboard); await loadRecentVouchers();
      } catch (e) { toast(e.message, 'err'); }
    });

    $('#supplierSearch').addEventListener('input', () => renderSuppliers(state.bootstrap?.fornecedores || []));
    $('#itemCampaignFilter').addEventListener('change', renderItems); $('#itemSupplierFilter').addEventListener('change', renderItems);
    $('#newSupplierBtn').addEventListener('click', () => supplierForm()); $('#qaSupplier').addEventListener('click', () => supplierForm());
    $('#newCampaignBtn').addEventListener('click', () => campaignForm());
    $('#newItemBtn').addEventListener('click', () => itemForm());
    $('#newVoucherBtn').addEventListener('click', voucherForm); $('#qaVoucher').addEventListener('click', voucherForm);
    $('#qaImport').addEventListener('click', () => openView('importar'));
    $('#newScheduleBtn').addEventListener('click', () => scheduleForm()); $('#qaSchedule').addEventListener('click', () => scheduleForm());
    $('#newDeliveryBtn').addEventListener('click', deliveryForm); $('#quickDeliveryBtn').addEventListener('click', deliveryForm);
    $('#newDivergenceBtn').addEventListener('click', divergenceForm);

    const dropZone = $('#voucherDropZone');
    const fileInput = $('#voucherPdfFile');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => setImportFile(fileInput.files?.[0] || null));
    ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.add('dragging'); }));
    ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.remove('dragging'); }));
    dropZone.addEventListener('drop', e => {
      const file = [...(e.dataTransfer?.files || [])].find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      if (!file) return toast('Selecione um arquivo PDF.', 'err');
      setImportFile(file);
    });
    $('#clearImportBtn').addEventListener('click', () => clearImportSelection());
    $('#analyzePdfBtn').addEventListener('click', () => analyzeImportPdf().catch(e => toast(e.message, 'err')));
    $('#confirmImportBtn').addEventListener('click', () => confirmCurrentImport().catch(e => toast(e.message, 'err')));
    $('#reloadImportBtn').addEventListener('click', () => state.currentImport?._id && openImportAnalysis(state.currentImport._id).catch(e => toast(e.message, 'err')));
    $('#refreshImportHistoryBtn').addEventListener('click', () => loadImportHistory().catch(e => toast(e.message, 'err')));
    $('#importStatusFilter').addEventListener('change', renderImportRows);

    $('#refreshVouchersBtn').addEventListener('click', () => { state.voucherPage = 1; loadVouchers().catch(e => toast(e.message, 'err')); });
    $('#voucherPrev').addEventListener('click', () => { if (state.voucherPage > 1) { state.voucherPage--; loadVouchers().catch(e => toast(e.message, 'err')); } });
    $('#voucherNext').addEventListener('click', () => { if (state.voucherPage < state.voucherPages) { state.voucherPage++; loadVouchers().catch(e => toast(e.message, 'err')); } });
    $('#refreshDeliveriesBtn').addEventListener('click', () => loadDeliveries().catch(e => toast(e.message, 'err')));
    $('#refreshDeliveryListBtn').addEventListener('click', () => { state.deliveryListPage = 1; loadDeliveryList().catch(e => toast(e.message, 'err')); });
    $('#deliveryListPrev').addEventListener('click', () => { if (state.deliveryListPage > 1) { state.deliveryListPage--; loadDeliveryList().catch(e => toast(e.message, 'err')); } });
    $('#deliveryListNext').addEventListener('click', () => { if (state.deliveryListPage < state.deliveryListPages) { state.deliveryListPage++; loadDeliveryList().catch(e => toast(e.message, 'err')); } });
    $('#deliveryExportPdfBtn').addEventListener('click', () => { location.href = apiUrl('/lista-entrega/pdf', deliveryListParams({ page: 1, limit: 500000 })); });
    $('#deliveryExportDocxBtn').addEventListener('click', () => { location.href = apiUrl('/lista-entrega/docx', deliveryListParams({ page: 1, limit: 500000 })); });
    $('#refreshDivergencesBtn').addEventListener('click', () => loadDivergences().catch(e => toast(e.message, 'err')));
    $('#previewReportBtn').addEventListener('click', () => previewReport().catch(e => toast(e.message, 'err')));
    $('#exportPdfBtn').addEventListener('click', () => { location.href = apiUrl('/relatorios/pdf', reportParams()); });
    $('#exportDocxBtn').addEventListener('click', () => { location.href = apiUrl('/relatorios/docx', reportParams()); });

    document.addEventListener('click', e => {
      const quickReportBtn = e.target.closest('[data-delivery-quick-report]');
      if (quickReportBtn) { openDeliveryQuickReport(quickReportBtn.dataset.deliveryQuickReport, quickReportBtn.dataset.format || 'pdf'); return; }
      const supplierBtn = e.target.closest('[data-edit-supplier]');
      if (supplierBtn) { const s = state.bootstrap?.fornecedores?.find(x => String(x._id) === supplierBtn.dataset.editSupplier); if (s) supplierForm(s); }
      const campaignBtn = e.target.closest('[data-edit-campaign]');
      if (campaignBtn) { const c = state.bootstrap?.campanhas?.find(x => String(x._id) === campaignBtn.dataset.editCampaign); if (c) campaignForm(c); }
      const itemBtn = e.target.closest('[data-edit-item]');
      if (itemBtn) { const i = state.bootstrap?.itens?.find(x => String(x._id) === itemBtn.dataset.editItem); if (i) itemForm(i); }
      const scheduleBtn = e.target.closest('[data-edit-schedule]');
      if (scheduleBtn) { const a = state.currentAgendas?.find(x => String(x._id) === scheduleBtn.dataset.editSchedule); if (a) scheduleForm(a); }
      const divBtn = e.target.closest('[data-resolve-div]');
      if (divBtn) { const d = state.currentDivergences?.find(x => String(x._id) === divBtn.dataset.resolveDiv); if (d) resolveDivergence(d); }
      const deliveryOkBtn = e.target.closest('[data-delivery-list-ok]');
      if (deliveryOkBtn) { const g = state.deliveryList?.find(x => String(x.chave) === deliveryOkBtn.dataset.deliveryListOk); if (g) deliveryGroupForm(g, false); }
      const deliveryViewBtn = e.target.closest('[data-delivery-list-view]');
      if (deliveryViewBtn) { const g = state.deliveryList?.find(x => String(x.chave) === deliveryViewBtn.dataset.deliveryListView); if (g) deliveryGroupForm(g, true); }
      const importBtn = e.target.closest('[data-open-import]');
      if (importBtn) { openView('importar'); openImportAnalysis(importBtn.dataset.openImport).catch(err => toast(err.message, 'err')); }
      const linkStudentBtn = e.target.closest('[data-link-import-student]');
      if (linkStudentBtn) { const r = state.currentImport?.registros?.find(x => String(x._id) === linkStudentBtn.dataset.linkImportStudent); if (r) linkImportStudent(r); }
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal(); });
  }

  async function init() {
    initTheme();
    $('#backPanel').href = withTenantPath('/painel.html');
    bindEvents();
    try {
      await checkAccess();
      await loadBootstrap();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Não foi possível carregar o módulo.', 'err');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
