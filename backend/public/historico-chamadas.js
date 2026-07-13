(function () {
  let chamadaSelecionada = null;

  const filtroTurmaEl = document.getElementById('filtroTurma');
  const filtroDataInicioEl = document.getElementById('filtroDataInicio');
  const filtroDataFimEl = document.getElementById('filtroDataFim');
  const filtroStatusEl = document.getElementById('filtroStatus');
  const filtroSomenteFaltasEl = document.getElementById('filtroSomenteFaltas');

  const listaHistoricoEl = document.getElementById('listaHistorico');
  const detalheChamadaEl = document.getElementById('detalheChamada');
  const detResumoEl = document.getElementById('detResumo');
  const detAlunosEl = document.getElementById('detAlunos');
  const detEmailDestinoEl = document.getElementById('detEmailDestino');
  const detWhatsappDestinoEl = document.getElementById('detWhatsappDestino');
  const statusEl = document.getElementById('status');

  const btnBuscar = document.getElementById('btnBuscar');
  const btnExportar = document.getElementById('btnExportar');
  const btnSalvarEdicao = document.getElementById('btnSalvarEdicao');
  const btnEnviarEdicao = document.getElementById('btnEnviarEdicao');
  const btnExcluirChamada = document.getElementById('btnExcluirChamada');
  const btnVoltarChamada = document.getElementById('btnVoltarChamada');

  function getTenantFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    return (qs.get('t') || qs.get('tenant') || '').trim();
  }

  function withTenant(url) {
    const tenant = getTenantFromUrl();
    if (!tenant) return url;

    try {
      const isAbsolute = /^https?:\/\//i.test(url);
      const u = isAbsolute ? new URL(url) : new URL(url, window.location.origin);
      if (!u.searchParams.get('t')) u.searchParams.set('t', tenant);
      return isAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
    } catch {
      const sep = String(url).includes('?') ? '&' : '?';
      return `${url}${sep}t=${encodeURIComponent(tenant)}`;
    }
  }

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'AL';
    return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
  }

  async function fetchJSON(url, options = {}) {
    const resp = await fetch(withTenant(url), {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const contentType = resp.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await resp.json() : null;

    if (!resp.ok) {
      throw new Error(data?.erro || data?.message || `Erro HTTP ${resp.status}`);
    }

    return data;
  }

  async function carregarTurmas() {
    try {
      const data = await fetchJSON('/api/alunos/turmas');
      const turmas = Array.isArray(data?.turmas) ? data.turmas : [];

      filtroTurmaEl.innerHTML = '<option value="">Todas</option>';
      turmas.forEach((turma) => {
        const opt = document.createElement('option');
        opt.value = turma;
        opt.textContent = turma;
        filtroTurmaEl.appendChild(opt);
      });
    } catch (err) {
      console.error('Erro ao carregar turmas no histórico:', err);
    }
  }

  function montarQueryHistorico() {
    const params = new URLSearchParams();
    if (filtroTurmaEl.value) params.set('turma', filtroTurmaEl.value);
    if (filtroDataInicioEl.value) params.set('dataInicio', filtroDataInicioEl.value);
    if (filtroDataFimEl.value) params.set('dataFim', filtroDataFimEl.value);
    if (filtroStatusEl.value) params.set('status', filtroStatusEl.value);
    if (filtroSomenteFaltasEl.checked) params.set('somenteComFaltas', 'true');
    return params.toString() ? `/api/chamadas/historico?${params.toString()}` : '/api/chamadas/historico';
  }

  function renderListaHistorico(chamadas) {
    if (!Array.isArray(chamadas) || !chamadas.length) {
      listaHistoricoEl.innerHTML = '<div class="empty">Nenhuma chamada encontrada para os filtros informados.</div>';
      return;
    }

    listaHistoricoEl.innerHTML = chamadas.map((c) => `
      <div class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${c.turma} • ${c.data}</div>
            <div class="muted" style="margin-top:6px;">
              Status: ${c.status} • Total: ${c.resumo?.total || 0} • Presentes: ${c.resumo?.presentes || 0} • Faltas: ${c.resumo?.faltas || 0}
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="glass-btn btnAbrirDetalhe" data-id="${c._id}">Abrir / editar</button>
          </div>
        </div>

        <div class="chips">
          <span class="chip">Justificadas: ${c.resumo?.justificadas || 0}</span>
          <span class="chip">E-mail: ${c.envio?.emailDestino || 'não definido'}</span>
          <span class="chip">WhatsApp: ${c.envio?.whatsappDestino || 'não definido'}</span>
        </div>
      </div>
    `).join('');

    listaHistoricoEl.querySelectorAll('.btnAbrirDetalhe').forEach((btn) => {
      btn.addEventListener('click', () => abrirDetalhe(btn.dataset.id));
    });
  }

  function renderDetalhe() {
    if (!chamadaSelecionada) {
      detalheChamadaEl.style.display = 'none';
      return;
    }

    detalheChamadaEl.style.display = 'block';
    detEmailDestinoEl.value = chamadaSelecionada?.envio?.emailDestino || '';
    detWhatsappDestinoEl.value = chamadaSelecionada?.envio?.whatsappDestino || '';

    const resumo = chamadaSelecionada?.resumo || {
      total: chamadaSelecionada.alunos.length,
      presentes: chamadaSelecionada.alunos.filter(a => !!a.presente).length,
      faltas: chamadaSelecionada.alunos.filter(a => !a.presente).length,
      justificadas: chamadaSelecionada.alunos.filter(a => !a.presente && !!a.faltaJustificada).length
    };

    detResumoEl.innerHTML = `
      <span class="chip">Turma: ${chamadaSelecionada.turma}</span>
      <span class="chip">Data: ${chamadaSelecionada.data}</span>
      <span class="chip">Status: ${chamadaSelecionada.status}</span>
      <span class="chip">Total: ${resumo.total}</span>
      <span class="chip">Presentes: ${resumo.presentes}</span>
      <span class="chip">Faltas: ${resumo.faltas}</span>
      <span class="chip">Justificadas: ${resumo.justificadas}</span>
    `;

    detAlunosEl.innerHTML = (chamadaSelecionada.alunos || []).map((aluno, index) => `
      <div class="aluno-row">
        <div class="aluno-top">
          <div class="avatar">${iniciais(aluno.nome)}</div>
          <div>
            <div class="aluno-nome">${aluno.nome}</div>
            <div class="aluno-sub">Edite presença, justificativa e observação</div>
          </div>
        </div>

        <div class="aluno-actions">
          <button type="button" class="toggle-btn ${aluno.presente ? 'active-presente' : ''}" data-acao="presente" data-index="${index}">Presente</button>
          <button type="button" class="toggle-btn ${!aluno.presente ? 'active-falta' : ''}" data-acao="falta" data-index="${index}">Falta</button>
          <button type="button" class="toggle-btn ${aluno.faltaJustificada ? 'active-justificada' : ''}" data-acao="justificada" data-index="${index}">Justificada</button>
        </div>

        <div style="margin-top:10px;">
          <textarea data-acao="observacao" data-index="${index}" placeholder="Observação">${aluno.observacao || ''}</textarea>
        </div>
      </div>
    `).join('');

    detAlunosEl.querySelectorAll('button[data-acao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.index);
        const acao = btn.dataset.acao;
        const aluno = chamadaSelecionada?.alunos?.[index];
        if (!aluno) return;

        if (acao === 'presente') {
          aluno.presente = true;
          aluno.faltaJustificada = false;
        }

        if (acao === 'falta') {
          aluno.presente = false;
        }

        if (acao === 'justificada') {
          aluno.presente = false;
          aluno.faltaJustificada = !aluno.faltaJustificada;
        }

        renderDetalhe();
      });
    });

    detAlunosEl.querySelectorAll('textarea[data-acao="observacao"]').forEach((textarea) => {
      textarea.addEventListener('input', () => {
        const index = Number(textarea.dataset.index);
        const aluno = chamadaSelecionada?.alunos?.[index];
        if (!aluno) return;
        aluno.observacao = textarea.value || '';
      });
    });
  }

  async function buscarHistorico() {
    try {
      setStatus('Buscando histórico...');
      const data = await fetchJSON(montarQueryHistorico());
      const chamadas = Array.isArray(data?.chamadas) ? data.chamadas : [];
      renderListaHistorico(chamadas);
      setStatus(`${chamadas.length} chamada(s) encontrada(s).`);
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao buscar histórico: ${err.message}`);
    }
  }

  async function abrirDetalhe(id) {
    try {
      setStatus('Abrindo chamada...');
      const data = await fetchJSON(`/api/chamadas/${encodeURIComponent(id)}`);
      chamadaSelecionada = data;
      renderDetalhe();
      setStatus(`Chamada ${data.turma} • ${data.data} aberta para edição.`);
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao abrir chamada: ${err.message}`);
    }
  }

  async function salvarEdicao() {
    try {
      if (!chamadaSelecionada?._id) {
        setStatus('Nenhuma chamada aberta para edição.');
        return;
      }

      setStatus('Salvando edição...');
      const data = await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaSelecionada._id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          alunos: chamadaSelecionada.alunos || [],
          emailDestino: detEmailDestinoEl.value || '',
          whatsappDestino: detWhatsappDestinoEl.value || ''
        })
      });

      chamadaSelecionada = data?.chamada || chamadaSelecionada;
      renderDetalhe();
      setStatus('Edição salva com sucesso.');
      await buscarHistorico();
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao salvar edição: ${err.message}`);
    }
  }

  async function enviarEdicao() {
    try {
      if (!chamadaSelecionada?._id) {
        setStatus('Nenhuma chamada aberta para envio.');
        return;
      }

      await salvarEdicao();
      setStatus('Enviando chamada por e-mail...');

      await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaSelecionada._id)}/enviar`, {
        method: 'POST',
        body: JSON.stringify({
          emailDestino: detEmailDestinoEl.value || ''
        })
      });

      setStatus('Chamada enviada por e-mail com sucesso.');
      await abrirDetalhe(chamadaSelecionada._id);
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao enviar chamada: ${err.message}`);
    }
  }

  async function excluirChamada() {
    try {
      if (!chamadaSelecionada?._id) {
        setStatus('Nenhuma chamada aberta para exclusão.');
        return;
      }

      const confirmado = window.confirm(
        `Tem certeza que deseja excluir a chamada da turma ${chamadaSelecionada.turma} do dia ${chamadaSelecionada.data}? Esta ação não poderá ser desfeita.`
      );

      if (!confirmado) {
        return;
      }

      setStatus('Excluindo chamada...');

      await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaSelecionada._id)}`, {
        method: 'DELETE'
      });

      chamadaSelecionada = null;
      detalheChamadaEl.style.display = 'none';
      detResumoEl.innerHTML = '';
      detAlunosEl.innerHTML = '';

      setStatus('Chamada excluída com sucesso.');
      await buscarHistorico();
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao excluir chamada: ${err.message}`);
    }
  }

  function exportarCSV() {
    const url = withTenant(
      `/api/chamadas/exportar/csv` +
      `?turma=${encodeURIComponent(filtroTurmaEl.value || '')}` +
      `&dataInicio=${encodeURIComponent(filtroDataInicioEl.value || '')}` +
      `&dataFim=${encodeURIComponent(filtroDataFimEl.value || '')}`
    );
    window.location.href = url;
  }

  function voltarParaChamada() {
    window.location.href = withTenant('/chamadas.html');
  }

  function init() {
    btnBuscar.addEventListener('click', buscarHistorico);
    btnExportar.addEventListener('click', exportarCSV);
    btnSalvarEdicao.addEventListener('click', salvarEdicao);
    btnEnviarEdicao.addEventListener('click', enviarEdicao);
    btnExcluirChamada.addEventListener('click', excluirChamada);
    btnVoltarChamada.addEventListener('click', voltarParaChamada);

    carregarTurmas();
    buscarHistorico();
  }

  document.addEventListener('DOMContentLoaded', init);
})();