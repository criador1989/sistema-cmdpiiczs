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
  // Utils
  // ===========================
  function setBtnState() {
    const algumMarcado = tbody.querySelectorAll('input.ck:checked').length > 0;
    const novaTurmaOk  = !!(selNovaTurma.value && String(selNovaTurma.value).trim());
    btnTransferir.disabled = !(algumMarcado && novaTurmaOk);
  }

  function optionList(turmas) {
    const opts = (Array.isArray(turmas) ? turmas : [])
      .filter(Boolean)
      .map(t => String(t).trim())
      .filter(t => t.length > 0);

    return '<option value="">Selecione...</option>' +
      opts.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function safeReadJSON(res) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return res.json().catch(() => ({}));
    }
    const txt = await res.text().catch(() => '');
    return { raw: txt };
  }

  // ===========================
  // API
  // ===========================
  async function carregarTurmas() {
    try {
      const r = await fetch('/api/alunos/turmas', { credentials: 'include', cache: 'no-store' });
      const data = await safeReadJSON(r);
      if (!r.ok) throw new Error(data?.mensagem || data?.message || 'Falha ao carregar turmas');

      const turmas =
        (data?.turmas || data?.items || data?.lista || [])
          .filter(Boolean)
          .map(String);

      selTurmaAtual.innerHTML = optionList(turmas);
      selNovaTurma.innerHTML  = optionList(turmas);

      setBtnState();
    } catch (e) {
      console.error('❌ carregarTurmas:', e);
      selTurmaAtual.innerHTML = '<option value="">Erro ao listar turmas</option>';
      selNovaTurma.innerHTML  = '<option value="">Erro ao listar turmas</option>';
      setBtnState();
      alert('Erro ao listar turmas. Veja o console (F12).');
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
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const data = await safeReadJSON(r);

      if (!r.ok) {
        console.error('❌ API alunos turma falhou:', { url, status: r.status, data });
        throw new Error(data?.mensagem || data?.message || 'Falha ao buscar alunos');
      }

      const alunos = data?.items || data?.alunos || data?.data || [];

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
      alert(e.message || 'Erro ao carregar alunos. Veja o console (F12).');
    }
  }

  async function transferirSelecionados() {
    const ids = Array.from(tbody.querySelectorAll('input.ck:checked'))
      .map(el => String(el.value || '').trim())
      .filter(Boolean);

    const turmaOrigem = String(selTurmaAtual.value || '').trim();
    const turmaDestino = String(selNovaTurma.value || '').trim();

    if (!ids.length) { alert('Selecione pelo menos um aluno.'); return; }
    if (!turmaDestino) { alert('Escolha a nova turma.'); return; }
    if (turmaOrigem && turmaOrigem === turmaDestino) {
      alert('A nova turma precisa ser diferente da turma atual.');
      return;
    }

    // 🔁 Payload compatível com vários backends
    // (envia várias chaves equivalentes)
    const payload = {
      // nomes comuns
      ids,
      novaTurma: turmaDestino,

      // nomes esperados por muitos backends
      alunosIds: ids,
      turmaDestino,
      turmaOrigem,

      // alternativas
      alunoIds: ids,
      turma: turmaDestino,
      turmaNova: turmaDestino,
      destino: turmaDestino,

      // às vezes o backend espera "turmaAtual"
      turmaAtual: turmaOrigem
    };

    btnTransferir.disabled = true;
    const oldText = btnTransferir.textContent;
    btnTransferir.textContent = 'Transferindo...';

    try {
      const r = await fetch('/api/alunos/transferir', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify(payload)
      });

      const data = await safeReadJSON(r);

      if (!r.ok) {
        // 🔎 Log completo para achar o campo que o backend reclama
        console.error('❌ Transferência falhou:', {
          status: r.status,
          payloadEnviado: payload,
          resposta: data
        });

        const msg = data?.mensagem || data?.message || data?.erro || data?.error || `Erro ao transferir (${r.status})`;
        throw new Error(msg);
      }

      alert(data?.mensagem || data?.message || 'Transferência realizada com sucesso.');

      // Recarrega lista
      await carregarAlunosDaTurma(turmaOrigem);
      selNovaTurma.value = '';
      setBtnState();
    } catch (e) {
      console.error('❌ transferirSelecionados:', e);
      alert(e.message || 'Falha ao transferir. Veja o console (F12).');
    } finally {
      btnTransferir.textContent = oldText || '⇄ Transferir Selecionados';
      setBtnState();
    }
  }

  // ===========================
  // Eventos
  // ===========================
  selTurmaAtual.addEventListener('change', () => carregarAlunosDaTurma(selTurmaAtual.value));
  selNovaTurma.addEventListener('change', setBtnState);

  tbody.addEventListener('change', (ev) => {
    if (ev.target && ev.target.classList.contains('ck')) setBtnState();
  });

  btnTransferir.addEventListener('click', transferirSelecionados);

  // ===========================
  // Boot
  // ===========================
  carregarTurmas();
});