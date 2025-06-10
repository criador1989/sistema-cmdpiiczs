// public/editar-notificacao.js
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    alert('ID da notificação não informado.');
    window.location.href = 'painel.html';
    return;
  }

  const form = document.getElementById('form-editar');

  // Buscar dados da notificação
  try {
    const res = await fetch(`/api/notificacoes/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Erro ao buscar notificação');
    const dados = await res.json();

    document.getElementById('notificacaoId').value = dados._id;
    document.getElementById('alunoNome').value = dados.aluno.nome;
    document.getElementById('alunoTurma').value = dados.aluno.turma;
    document.getElementById('tipo').value = dados.tipo;
    document.getElementById('motivo').value = dados.motivo;
    document.getElementById('justificativa').value = dados.justificativa || '';
    document.getElementById('observacoes').value = dados.observacoes || '';
  } catch (err) {
    console.error(err);
    alert('Erro ao carregar dados.');
  }

  // Submeter edição
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const atualizados = {
      tipo: document.getElementById('tipo').value,
      motivo: document.getElementById('motivo').value,
      justificativa: document.getElementById('justificativa').value,
      observacoes: document.getElementById('observacoes').value,
    };

    try {
      const res = await fetch(`/api/notificacoes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(atualizados),
      });

      if (!res.ok) throw new Error('Erro ao atualizar');

      alert('Notificação atualizada com sucesso!');
      window.location.href = 'painel.html';
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar alterações.');
    }
  });
});
