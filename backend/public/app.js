async function carregarDados() {
  try {
    // Verifica se usuário está logado - tenta carregar alunos (rota protegida)
    const res = await fetch('/alunos', { credentials: 'include' });

    if (res.status === 401) {
      // Não autorizado - redireciona para login
      window.location.href = '/login.html';
      return;
    }

    if (!res.ok) {
      throw new Error('Erro ao buscar dados');
    }

    const alunos = await res.json();

    const conteudo = document.getElementById('conteudo');
    conteudo.innerHTML = `
      <h2>Alunos Cadastrados</h2>
      <ul>
        ${alunos.map(a => `<li>${a.nome} - Turma: ${a.turma}</li>`).join('')}
      </ul>
    `;

  } catch (err) {
    document.getElementById('conteudo').textContent = err.message;
  }
}

carregarDados();
