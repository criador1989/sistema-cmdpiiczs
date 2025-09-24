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

  // ---------------- Utils ----------------
  function setBtnState() {
    const algumMarcado = tbody.querySelectorAll('input.ck:checked').length > 0;
    const novaTurmaOk  = !!selNovaTurma.value;
    btnTransferir.disabled = !(algumMarcado && novaTurmaOk);
  }

  function optionList(turmas) {
    return '<option value="">Selecione...</option>' +
      turmas.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  // ---------------- API ----------------
  async function carregarTurmas() {
    try {
      const r = await fetch('/api/alunos/turmas', { credentials: 'include' });
      if (!r.ok) throw new Error('Falha ao carregar turmas');
      const data = await r.json();
      const turmas = (data.turmas || []).filter(Boolean).map(String);

      // Preenche os dois selects com a MESMA lista
      selTurmaAtual.innerHTML = optionList(turmas);
      selNovaTurma.innerHTML  = optionList(turmas);
      setBtnState();
    } catch (e) {
      console.error(e);
      selTurmaAtual.innerHTML = '<option value="">Erro ao listar turmas</option>';
      selNovaTurma.innerHTML  = '<option value="">Erro ao listar turmas</option>';
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
      const r = await fetch(`/api/alunos/turma/${encodeURIComponent(turma)}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Falha ao buscar alunos');
      const data = await r.json();
      const alunos = data.items || data.alunos || [];

      if (!alunos.length) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhum aluno nesta turma.</td></tr>';
        setBtnState();
        return;
      }

      tbody.innerHTML = alunos.map(a => `
        <tr>
          <td><input type="checkbox" class="ck" value="${a._id}"></td>
          <td>${a.nome}</td>
          <td>${a.turma || turma}</td>
        </tr>
      `).join('');

      setBtnState();
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar alunos.</td></tr>';
      setBtnState();
    }
  }

  async function transferirSelecionados() {
    const ids = Array.from(tbody.querySelectorAll('input.ck:checked')).map(el => el.value);
    const novaTurma = selNovaTurma.value;

    if (!ids.length) { alert('Selecione pelo menos um aluno.'); return; }
    if (!novaTurma)  { alert('Escolha a nova turma.'); return; }

    btnTransferir.disabled = true;
    btnTransferir.textContent = 'Transferindo...';

    try {
      const r = await fetch('/api/alunos/transferir', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, novaTurma })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.mensagem || 'Erro ao transferir');

      alert(data.mensagem || 'Transferência realizada com sucesso.');
      // Recarrega a lista da turma atual
      await carregarAlunosDaTurma(selTurmaAtual.value);
      selNovaTurma.value = '';
      setBtnState();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Falha ao transferir');
    } finally {
      btnTransferir.textContent = 'Transferir Selecionados';
      setBtnState();
    }
  }

  // ---------------- Eventos ----------------
  selTurmaAtual.addEventListener('change', () => carregarAlunosDaTurma(selTurmaAtual.value));
  selNovaTurma.addEventListener('change', setBtnState);

  tbody.addEventListener('change', (ev) => {
    if (ev.target && ev.target.classList.contains('ck')) setBtnState();
  });

  btnTransferir.addEventListener('click', transferirSelecionados);

  // ---------------- Boot ----------------
  carregarTurmas();
});
