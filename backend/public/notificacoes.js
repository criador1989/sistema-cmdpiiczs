
document.addEventListener('DOMContentLoaded', async () => {
  const corpo = document.getElementById('tabelaNotificacoes');
  const filtroTurma = document.getElementById('filtroTurma');

  async function carregarNotificacoes() {
    try {
      const resposta = await fetch('/api/notificacoes', { credentials: 'include' });
      if (!resposta.ok) {
        window.location.href = '/login.html';
        return;
      }

      const lista = await resposta.json();
      const turmas = new Set();
      corpo.innerHTML = '';

      lista.forEach(n => {
        if (!n.aluno) return;
        turmas.add(n.aluno.turma);

        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><img src="/uploads/\${n.aluno.foto || 'sem-foto.png'}" alt="Foto" height="50" style="border-radius: 6px;"></td>
          <td>\${n.aluno.nome}</td>
          <td>\${n.aluno.turma}</td>
          <td>\${n.tipo}</td>
          <td>\${n.motivo}</td>
          <td>\${n.tipoMedida}</td>
          <td>\${n.valorNumerico}</td>
          <td>\${new Date(n.data).toLocaleDateString()}</td>
          <td>\${n.observacao || ''}</td>
          <td class="actions">
            <button class="delete-btn" onclick="excluirNotificacao(this, '\${n._id}')">Excluir</button>
            <a class="pdf-btn" href="/api/pdf/\${n._id}" target="_blank">PDF</a>
            <a class="edit-btn" href="editar-notificacao.html?id=\${n._id}">Editar</a>
          </td>
        \`;
        corpo.appendChild(tr);
      });

      filtroTurma.innerHTML = '<option value="">Todas</option>';
      Array.from(turmas).sort().forEach(turma => {
        const opt = document.createElement('option');
        opt.value = turma;
        opt.textContent = turma;
        filtroTurma.appendChild(opt);
      });

      filtroTurma.addEventListener('change', () => {
        const turmaSelecionada = filtroTurma.value;
        Array.from(corpo.children).forEach(row => {
          const turma = row.children[2].textContent;
          row.style.display = turmaSelecionada === '' || turmaSelecionada === turma ? '' : 'none';
        });
      });
    } catch (err) {
      alert('Erro ao carregar notificações.');
    }
  }

  window.excluirNotificacao = async function (btn, id) {
    if (!confirm('Deseja excluir esta notificação?')) return;
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Excluindo...';

    try {
      const res = await fetch(\`/api/notificacoes/\${id}\`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        alert('Notificação excluída com sucesso!');
        carregarNotificacoes();
      } else {
        alert('Erro ao excluir a notificação.');
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
      }
    } catch (err) {
      alert('Erro ao conectar com o servidor.');
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
    }
  };

  carregarNotificacoes();
});

/* Estilo do Spinner */
const estilo = document.createElement('style');
estilo.innerHTML = \`
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  border-top-color: #000;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
\`;
document.head.appendChild(estilo);
