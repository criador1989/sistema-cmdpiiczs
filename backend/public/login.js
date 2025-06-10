document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value.trim();
  const erroDiv = document.getElementById('erro');
  erroDiv.textContent = '';

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    const dados = await res.json();

    if (res.ok) {
      // Redirecionar para tela de boas-vindas
      window.location.href = dados.redirecionar || '/painel.html';
    } else {
      erroDiv.textContent = dados.mensagem || 'Erro ao fazer login.';
    }
  } catch (err) {
    erroDiv.textContent = 'Erro na conexão com o servidor.';
  }
});
