// /public/transferir-turma.js
document.addEventListener('DOMContentLoaded', () => {
  const selTurmaAtual = document.getElementById('turmaAtual');
  const selNovaTurma  = document.getElementById('novaTurma');
  const tbody         = document.getElementById('tabelaAlunos');
  const btnTransferir = document.getElementById('transferirBtn');

  if (!selTurmaAtual || !selNovaTurma || !tbody || !btnTransferir) {
    console.error('❌ Elementos não encontrados no DOM.');
    return;
  }

  // ===========================
  // TURMAS (backend + localStorage)
  // ===========================
  const LS_CUSTOM  = 'cmdpii_turmas_custom_v1';
  const LS_REMOVED = 'cmdpii_turmas_removed_v1';

  function safeParseLS(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return (v ?? fallback);
    } catch (_) {
      return fallback;
    }
  }

  function guessSeg(code) {
    return /^\d+º/.test(code) && (code.startsWith('1º') || code.startsWith('2º') || code.startsWith('3º'))
      ? 'Ensino Médio'
      : 'Fundamental II';
  }

  function byCode(arr) {
    const m = new Map();
    for (const t of (Array.isArray(arr) ? arr : [])) {
      const code = String(t?.code || t?.turma || t || '').trim();
      if (!code) continue;

      m.set(code, {
        code,
        seg: String(t?.seg || t?.segmento || '').trim() || guessSeg(code)
      });
    }
    return m;
  }

  function getLocalTurmasCodes() {
    const custom = safeParseLS(LS_CUSTOM, []);
    const removed = new Set(
      (safeParseLS(LS_REMOVED, []) || []).map(s => String(s).trim()).filter(Boolean)
    );

    const m = byCode(custom);

    // remove apenas das locais/customizadas
    for (const r of removed) m.delete(r);

    return Array.from(m.keys());
  }

  function normalizarListaTurmasDoBackend(data) {
    if (Array.isArray(data)) {
      return data.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
    }

    const candidato =
      data?.turmas ||
      data?.items ||
      data?.lista ||
      data?.data ||
      [];

    return (Array.isArray(candidato) ? candidato : [])
      .filter(Boolean)
      .map(item => {
        if (typeof item === 'string') return item.trim();
        return String(item?.turma || item?.code || item?.nome || '').trim();
      })
      .filter(Boolean);
  }

  function mergeTurmas(backendTurmas) {
    const backend = (Array.isArray(backendTurmas) ? backendTurmas : [])
      .filter(Boolean)
      .map(t => String(t).trim())
      .filter(Boolean);

    const local = getLocalTurmasCodes();

    // BLINDAGEM:
    // turmas vindas do backend não podem desaparecer por causa do localStorage
    const set = new Set([...backend, ...local]);

    const list = Array.from(set);
    list.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

    return list;
  }

  // ===========================
  // Utils
  // ===========================
  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function optionList(turmas) {
    const opts = (Array.isArray(turmas) ? turmas : [])
      .filter(Boolean)
      .map(t => String(t).trim())
      .filter(t => t.length > 0);

    return '<option value="">Selecione...</option>' +
      opts.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  }

  function safeAlert(msg) {
    try {
      alert(msg);
    } catch (_) {
      console.warn(msg);
    }
  }

  function setBtnState() {
    const algumMarcado = tbody.querySelectorAll('input.ck:checked').length > 0;
    const novaTurmaOk  = !!(selNovaTurma.value && String(selNovaTurma.value).trim());
    btnTransferir.disabled = !(algumMarcado && novaTurmaOk);
  }

  async function safeReadJSON(res) {
    const ct = res.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      return res.json().catch(() => ({}));
    }

    const txt = await res.text().catch(() => '');
    return { raw: txt };
  }

  function preencherSelectsTurmas(turmas) {
    selTurmaAtual.innerHTML = optionList(turmas);
    selNovaTurma.innerHTML  = optionList(turmas);
    setBtnState();
  }

  // ===========================
  // API
  // ===========================
  async function carregarTurmas() {
    try {
      console.log('📦 Carregando turmas...');
      const r = await fetch('/api/alunos/turmas', {
        credentials: 'include',
        cache: 'no-store'
      });

      const data = await safeReadJSON(r);

      if (!r.ok) {
        console.error('❌ Resposta inválida ao listar turmas:', {
          status: r.status,
          data
        });
        throw new Error(data?.mensagem || data?.message || 'Falha ao carregar turmas');
      }

      const backendTurmas = normalizarListaTurmasDoBackend(data);
      const turmas = mergeTurmas(backendTurmas);

      console.log('✅ Turmas backend:', backendTurmas);
      console.log('✅ Turmas locais/custom:', getLocalTurmasCodes());
      console.log('✅ Turmas finais:', turmas);

      preencherSelectsTurmas(turmas);

      if (!turmas.length) {
        console.warn('⚠️ Nenhuma turma encontrada após merge.');
      }
    } catch (e) {
      console.error('❌ carregarTurmas:', e);

      selTurmaAtual.innerHTML = '<option value="">Erro ao listar turmas</option>';
      selNovaTurma.innerHTML  = '<option value="">Erro ao listar turmas</option>';
      setBtnState();

      safeAlert('Erro ao listar turmas. Veja o console (F12).');
    }
  }

  async function carregarAlunosDaTurma(turma) {
    tbody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';

    if (!turma) {
      tbody.innerHTML = '<tr><td colspan="3">Selecione uma turma.</td></tr>';
      setBtnState();
      return;
    }

    try {
      const url = `/api/alunos/turma/${encodeURIComponent(turma)}`;
      const r = await fetch(url, {
        credentials: 'include',
        cache: 'no-store'
      });

      const data = await safeReadJSON(r);

      if (!r.ok) {
        console.error('❌ API alunos/turma falhou:', {
          url,
          status: r.status,
          data
        });
        throw new Error(data?.mensagem || data?.message || 'Falha ao buscar alunos');
      }

      let alunos = [];
      if (Array.isArray(data)) alunos = data;
      else if (Array.isArray(data?.items)) alunos = data.items;
      else if (Array.isArray(data?.alunos)) alunos = data.alunos;
      else if (Array.isArray(data?.data)) alunos = data.data;

      if (!Array.isArray(alunos) || alunos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhum aluno nesta turma.</td></tr>';
        setBtnState();
        return;
      }

      tbody.innerHTML = alunos.map(a => {
        const id = a?._id || a?.id || a?.alunoId || '';
        const nome = a?.nome || a?.name || '—';
        const turmaDoAluno = a?.turma || turma;

        return `
          <tr>
            <td style="text-align:center">
              <input type="checkbox" class="ck" value="${escapeHtml(id)}" />
            </td>
            <td>${escapeHtml(nome)}</td>
            <td>${escapeHtml(turmaDoAluno)}</td>
          </tr>
        `;
      }).join('');

      setBtnState();
    } catch (e) {
      console.error('❌ carregarAlunosDaTurma:', e);
      tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar alunos.</td></tr>';
      setBtnState();
      safeAlert(e.message || 'Erro ao carregar alunos. Veja o console (F12).');
    }
  }

  async function transferirSelecionados() {
    const ids = Array.from(tbody.querySelectorAll('input.ck:checked'))
      .map(el => String(el.value || '').trim())
      .filter(Boolean);

    const turmaOrigem = String(selTurmaAtual.value || '').trim();
    const turmaDestino = String(selNovaTurma.value || '').trim();

    if (!ids.length) {
      safeAlert('Selecione pelo menos um aluno.');
      return;
    }

    if (!turmaDestino) {
      safeAlert('Escolha a nova turma.');
      return;
    }

    if (turmaOrigem && turmaOrigem === turmaDestino) {
      safeAlert('A nova turma precisa ser diferente da turma atual.');
      return;
    }

    const payload = {
      ids,
      novaTurma: turmaDestino,

      // compatibilidade defensiva com possíveis versões antigas do backend
      alunosIds: ids,
      alunoIds: ids,
      turmaDestino,
      turmaOrigem,
      turma: turmaDestino,
      turmaNova: turmaDestino,
      destino: turmaDestino,
      turmaAtual: turmaOrigem
    };

    btnTransferir.disabled = true;
    const oldText = btnTransferir.textContent;
    btnTransferir.textContent = 'Transferindo...';

    try {
      console.log('📤 Enviando transferência:', payload);

      const r = await fetch('/api/alunos/transferir', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(payload)
      });

      const data = await safeReadJSON(r);

      if (!r.ok) {
        console.error('❌ Transferência falhou:', {
          status: r.status,
          payloadEnviado: payload,
          resposta: data
        });

        const msg =
          data?.mensagem ||
          data?.message ||
          data?.erro ||
          data?.error ||
          `Erro ao transferir (${r.status})`;

        throw new Error(msg);
      }

      safeAlert(data?.mensagem || data?.message || 'Transferência realizada com sucesso.');

      await carregarAlunosDaTurma(turmaOrigem);
      await carregarTurmas();

      selTurmaAtual.value = turmaOrigem;
      selNovaTurma.value = '';
      setBtnState();
    } catch (e) {
      console.error('❌ transferirSelecionados:', e);
      safeAlert(e.message || 'Falha ao transferir. Veja o console (F12).');
    } finally {
      btnTransferir.textContent = oldText || '⇄ Transferir Selecionados';
      setBtnState();
    }
  }

  // ===========================
  // Eventos
  // ===========================
  selTurmaAtual.addEventListener('change', () => {
    carregarAlunosDaTurma(selTurmaAtual.value);
  });

  selNovaTurma.addEventListener('change', setBtnState);

  tbody.addEventListener('change', (ev) => {
    if (ev.target && ev.target.classList.contains('ck')) {
      setBtnState();
    }
  });

  btnTransferir.addEventListener('click', transferirSelecionados);

  // ===========================
  // Boot
  // ===========================
  (async function init() {
    tbody.innerHTML = '<tr><td colspan="3">Selecione uma turma.</td></tr>';
    setBtnState();
    await carregarTurmas();
  })();
});