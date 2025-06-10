document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('form-aluno');
  const mensagem = document.getElementById('mensagem');

  // 🔐 Verifica se está logado e injeta a instituição
  try {
    const res = await fetch('/api/usuario', { credentials: 'include' });
    if (!res.ok) return (window.location.href = '/login.html');
    const usuario = await res.json();

    const campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = 'instituicao';
    campo.value = usuario.instituicao;
    form.appendChild(campo);
  } catch {
    return (window.location.href = '/login.html');
  }

  // 📤 Envia o formulário
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mensagem.textContent = '';
    const formData = new FormData(form);

    try {
      const resposta = await fetch('/api/alunos', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (resposta.ok) {
        const aluno = await resposta.json();
        mensagem.style.color = 'green';
        mensagem.innerHTML = `✅ Aluno cadastrado!<br><strong>Código:</strong> ${aluno.codigoAcesso}`;
        form.reset();
      } else {
        const erro = await resposta.json();
        mensagem.style.color = 'red';
        mensagem.textContent = erro.message || 'Erro ao criar aluno';
      }
    } catch (err) {
      mensagem.style.color = 'red';
      mensagem.textContent = 'Erro ao conectar com o servidor.';
    }
  });
});