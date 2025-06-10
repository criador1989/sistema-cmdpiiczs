async function carregarPainel() {
  try {
    const resposta = await fetch('/api/usuario', { credentials: 'include' });
    if (!resposta.ok) throw new Error('Token ausente ou inválido');

    const usuario = await resposta.json();
    document.getElementById('infoUsuario').textContent = `Olá, ${usuario.nome} (${usuario.tipo})`;

    let html = '';
    if (usuario.tipo === 'admin' || usuario.tipo === 'coordenador') {
      html += `
        <a href="/cadastro-usuario.html">Cadastrar Usuário</a>
        <a href="/relatorio.html">Relatório Geral</a>
      `;
    }

    html += `
      <a href="/cadastro-aluno.html">Cadastrar Aluno</a>
      <a href="/cadastro-notificacao.html">Cadastrar Notificação</a>
      <a href="/notificacoes.html">Ver Notificações</a>
    `;

    document.getElementById('conteudo').innerHTML = html;

  } catch (erro) {
    document.getElementById('infoUsuario').textContent = 'Erro ao buscar dados';
    document.getElementById('conteudo').innerHTML = '';
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

carregarPainel();
