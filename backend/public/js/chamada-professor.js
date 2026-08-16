'use strict';

(() => {
  const state = { user: null, session: null, records: [], classShifts: new Map() };
  const $ = (id) => document.getElementById(id);
  const tenant = new URLSearchParams(location.search).get('t') || '';
  const withTenant = (path) => {
    if (!tenant) return path;
    const url = new URL(path, location.origin);
    url.searchParams.set('t', tenant);
    return `${url.pathname}${url.search}${url.hash}`;
  };

  function toast(message, error = false) {
    const el = $('toast'); el.textContent = message; el.className = `toast show${error ? ' err' : ''}`;
    clearTimeout(toast._timer); toast._timer = setTimeout(() => { el.className = 'toast'; }, 3800);
  }

  async function request(path, options = {}) {
    const headers = { Accept:'application/json', ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(withTenant(path), { credentials:'include', cache:'no-store', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.mensagem || data.message || `Erro HTTP ${response.status}`);
    return data;
  }

  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function dateKeyLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function shiftNow() { const h = new Date().getHours(); return h < 12 ? 'matutino' : h < 18 ? 'vespertino' : 'noturno'; }
  function timeOnly(value) { if (!value) return ''; try { return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value)); } catch { return ''; } }

  const statusLabels = {
    pendente:'Pendente', presente:'Presente', ausente:'Ausente', atrasado:'Atrasado', falta_justificada:'Falta justificada', entrou_colegio_fora_sala:'Entrou no colégio, fora da sala'
  };

  function statusOptions(current) {
    return Object.entries(statusLabels).map(([value,label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }

  function updateSummary() {
    const counts = { total:state.records.length, detected:0, pendente:0, presente:0, ausente:0, atrasado:0, falta_justificada:0, entrou_colegio_fora_sala:0 };
    state.records.forEach((r) => { if (r.gateDetected) counts.detected++; counts[r.statusProfessor] = (counts[r.statusProfessor] || 0) + 1; });
    $('summary').innerHTML = [
      `<span class="pill">${counts.total} alunos</span>`,
      `<span class="pill ok">${counts.detected} entraram no colégio</span>`,
      `<span class="pill warn">${counts.pendente} pendentes</span>`,
      `<span class="pill ok">${counts.presente} presentes</span>`,
      `<span class="pill err">${counts.ausente} ausentes</span>`,
    ].join('');
  }

  function render() {
    if (!state.session) { $('attendanceCard').hidden = true; return; }
    $('attendanceCard').hidden = false;
    const s = state.session;
    $('sessionTitle').textContent = `${s.turma} · ${s.dateKey} · ${String(s.turno || '').replace(/^./,c=>c.toUpperCase())}${s.componenteCurricular ? ` · ${s.componenteCurricular}` : ''}`;
    const finalized = s.status === 'finalizada';
    const rows = state.records.map((r) => {
      const gate = r.gateDetected
        ? `<div class="gate yes">✓ Entrou às ${esc(timeOnly(r.gateFirstEntryAt))}</div><small>${Number(r.gateDetectionCount || 1)} detecção(ões)</small>`
        : '<div class="gate no">Não detectado no portão</div>';
      return `<tr data-record="${esc(r._id)}"><td><b>${esc(r.alunoNome)}</b><br><small>${esc(r.turma || '')}</small></td><td>${gate}</td><td><select class="status-select" data-id="${esc(r._id)}" ${finalized ? 'disabled' : ''}>${statusOptions(r.statusProfessor)}</select></td></tr>`;
    }).join('');
    $('attendanceRows').innerHTML = rows || '<tr><td colspan="3" class="empty">Nenhum aluno encontrado nessa turma.</td></tr>';
    document.querySelectorAll('.status-select').forEach((select) => select.addEventListener('change', saveStatus));
    ['refreshBtn','confirmDetectedBtn','markAbsentBtn','finalizeBtn'].forEach((id) => { $(id).disabled = finalized; });
    if (finalized) $('refreshBtn').disabled = false;
    const si = s.integracaoSimaed || {};
    $('integrationState').textContent = finalized
      ? `Chamada finalizada. Integração SIMAED: ${si.status === 'nao_configurado' || !si.status ? 'ainda não configurada; os dados permaneceram salvos no Axoriin.' : si.status}.`
      : 'Chamada aberta. A entrada no colégio é apenas uma evidência para conferência.';
    updateSummary();
  }

  async function saveStatus(event) {
    const select = event.currentTarget; const id = select.dataset.id; select.disabled = true;
    try {
      const data = await request(`/api/chamada/sessoes/${encodeURIComponent(state.session._id)}/registros/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({statusProfessor:select.value}) });
      const idx = state.records.findIndex((r) => r._id === id); if (idx >= 0) state.records[idx] = data.record;
      const row = select.closest('tr'); row?.classList.add('row-saved'); setTimeout(() => row?.classList.remove('row-saved'), 750);
      updateSummary();
    } catch (err) { toast(err.message,true); render(); }
    finally { if (state.session?.status !== 'finalizada') select.disabled = false; }
  }

  async function loadSession() {
    if (!state.session?._id) return;
    const data = await request(`/api/chamada/sessoes/${encodeURIComponent(state.session._id)}`);
    state.session = data.session; state.records = data.records || []; render();
  }

  async function loadClasses() {
    const data = await request('/api/chamada/turmas');
    state.classShifts = new Map((data.detalhes || []).map((item) => [String(item.turma || ''), item.turno || null]));
    $('classSelect').innerHTML = '<option value="">Selecione</option>' + (data.turmas || []).map((t) => {
      const shift = state.classShifts.get(String(t));
      const label = shift ? ` · ${shift === 'matutino' ? 'Manhã' : shift === 'vespertino' ? 'Tarde' : 'Noite'}` : ' · turno não definido';
      return `<option value="${esc(t)}">${esc(t + label)}</option>`;
    }).join('');
  }


  $('classSelect').addEventListener('change', () => {
    const configured = state.classShifts.get(String($('classSelect').value || ''));
    if (configured && [...$('shiftSelect').options].some((o) => o.value === configured)) {
      $('shiftSelect').value = configured;
    }
  });

  $('openBtn').addEventListener('click', async () => {
    const turma = $('classSelect').value; if (!turma) return toast('Selecione uma turma.',true);
    const button = $('openBtn'); button.disabled = true;
    try {
      const data = await request('/api/chamada/sessoes/abrir', { method:'POST', body:JSON.stringify({ turma, dateKey:$('dateInput').value, turno:$('shiftSelect').value, componenteCurricular:$('componentInput').value.trim(), aulaNumero:Number($('lessonInput').value || 0) }) });
      state.session = data.session; state.records = data.records || []; render(); toast('Chamada aberta.');
    } catch (err) { toast(err.message,true); }
    finally { button.disabled = false; }
  });

  $('refreshBtn').addEventListener('click', async () => { try { await loadSession(); toast('Entradas atualizadas.'); } catch (err) { toast(err.message,true); } });
  $('confirmDetectedBtn').addEventListener('click', async () => {
    if (!state.session) return;
    try { const data = await request(`/api/chamada/sessoes/${state.session._id}/confirmar-detectados`,{method:'POST',body:'{}'}); state.records=data.records||[]; render(); toast(`${data.alterados || 0} aluno(s) detectado(s) confirmado(s).`); } catch(err){toast(err.message,true);}
  });
  $('markAbsentBtn').addEventListener('click', async () => {
    if (!state.session || !confirm('Marcar todos os alunos ainda pendentes como ausentes?')) return;
    try { const data = await request(`/api/chamada/sessoes/${state.session._id}/marcar-pendentes-ausentes`,{method:'POST',body:'{}'}); state.records=data.records||[]; render(); toast(`${data.alterados || 0} pendente(s) marcado(s) como ausente(s).`); } catch(err){toast(err.message,true);}
  });
  $('finalizeBtn').addEventListener('click', async () => {
    if (!state.session || !confirm('Finalizar esta chamada? Depois disso os registros ficarão bloqueados para edição nesta tela.')) return;
    try { const data = await request(`/api/chamada/sessoes/${state.session._id}/finalizar`,{method:'POST',body:'{}'}); state.session=data.session; state.records=data.records||[]; render(); toast('Chamada finalizada e salva no Axoriin.'); } catch(err){toast(err.message,true);}
  });

  async function start() {
    $('dateInput').value = dateKeyLocal(); $('shiftSelect').value = shiftNow();
    try {
      const user = await request('/api/usuario-logado'); state.user=user; const role=String(user.tipo||'').toLowerCase();
      if (!['professor','admin','master','superadmin'].includes(role)) { location.href=withTenant('/painel.html'); return; }
      $('userLabel').textContent = `${user.nome || 'Usuário'} · confirmação de presença em sala`;
      $('backLink').href = withTenant(role === 'professor' ? '/painel-professor.html' : '/painel.html');
      $('app').hidden=false; await loadClasses();
    } catch { location.href=withTenant('/login.html?next=%2Fchamada-professor.html'); }
  }
  start();
})();
