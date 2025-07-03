document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return alert('ID do aluno não fornecido.');

  const nomeSpan = document.getElementById('nome');
  const turmaSpan = document.getElementById('turma');
  const comportamentoSpan = document.getElementById('comportamento');
  const codigoSpan = document.getElementById('codigo');
  const obsContainer = document.getElementById('observacoes');
  const notifContainer = document.getElementById('notificacoes');

  async function carregarFicha() {
    try {
      const resposta = await fetch(`/ficha/dados/${id}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!resposta.ok) {
        if (resposta.status === 401) {
          alert('Sessão expirada. Faça login novamente.');
          return (window.location.href = '/login.html');
        }
        throw new Error('Erro ao buscar dados da ficha');
      }

      const dados = await resposta.json();
      const aluno = dados.aluno;

      // Preencher dados do aluno
      nomeSpan.textContent = aluno.nome || 'N/A';
      turmaSpan.textContent = aluno.turma || 'N/A';
      comportamentoSpan.textContent = aluno.comportamento?.toFixed(2) || 'N/A';
      codigoSpan.textContent = aluno.codigoAcesso || 'N/A';

      // Observações
      obsContainer.innerHTML = '';
      dados.observacoes.forEach(obs => {
        const div = document.createElement('div');
        div.className = 'observacao';
        div.innerHTML = `<p>${obs.texto}</p><p class="autor">— ${obs.autor}</p>`;
        obsContainer.appendChild(div);
      });

      // Notificações
      notifContainer.innerHTML = '';
      dados.notificacoes.forEach(n => {
        const div = document.createElement('div');
        div.className = 'notificacao';
        div.innerHTML = `<p><strong>${n.tipo}</strong> - ${n.motivo}</p>`;
        notifContainer.appendChild(div);
      });

    } catch (erro) {
      console.error('Erro ao carregar ficha:', erro);
      alert('Erro ao carregar dados do aluno.');
    }
  }

  async function salvarObservacao() {
    const texto = document.getElementById('textoObservacao').value.trim();
    if (!texto) return alert('Digite uma observação válida.');

    try {
      const resposta = await fetch(`/ficha/salvar/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ texto })
      });

      const resultado = await resposta.json();

      if (resposta.ok) {
        alert('Observação salva com sucesso.');
        document.getElementById('textoObservacao').value = '';
        carregarFicha(); // recarrega após salvar
      } else {
        throw new Error(resultado.erro || 'Erro ao salvar observação.');
      }
    } catch (erro) {
      console.error('Erro ao salvar observação:', erro);
      alert('Erro ao salvar observação.');
    }
  }

  document.getElementById('btnSalvar').addEventListener('click', salvarObservacao);
  carregarFicha();
});
