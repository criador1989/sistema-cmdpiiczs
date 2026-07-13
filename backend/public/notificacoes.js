// public/notificacoes.js (ou o script equivalente da página de controle)
document.addEventListener('DOMContentLoaded', async () => {
  const corpo = document.getElementById('tabelaNotificacoes');
  const filtroTurma = document.getElementById('filtroTurma');

  function criarBotaoComunicacao(notif, celulaAcoes) {
    const medida = (notif.tipoMedida || notif.tipo || '').toUpperCase();
    const deferida = notif.deferido === true || notif.status === 'deferido' || notif.status === 'aprovada';

    if (!deferida) return;
    if (!['A.I.A', 'A.E.C.D.E'].includes(medida)) return;

    const btn = document.createElement('button');
    btn.textContent = 'Comunicação aos Pais';
    btn.className = 'comunicacao-btn';
    btn.style.marginLeft = '6px';

    btn.onclick = async () => {
      try {
        const resp = await fetch(`/api/comunicacao/${notif._id}`, { method: 'POST', credentials: 'include' });
        if (!resp.ok) throw new Error('Falha ao iniciar comunicação');
        const comunic = await resp.json();
        window.location.href = `/comunicacao-pais.html?comunicacao=${comunic._id}&notificacao=${notif._id}`;
      } catch (e) {
        console.warn(e);
        alert('Erro ao abrir comunicação.');
      }
    };

    celulaAcoes.appendChild(btn);
  }

  async function carregarNotificacoes() {
    try {
      const resposta = await fetch('/api/notificacoes', { credentials: 'include' });
      if (!resposta.ok) {
        window.location.href = '/login.html';
        return;
      }

      const payload = await resposta.json();
      const lista = Array.isArray(payload) ? payload : (payload.data || []);

      const turmas = new Set();
      corpo.innerHTML = '';

      lista.forEach(n => {
        if (!n.aluno) return;
        turmas.add(n.aluno.turma);

        const observacaoLimite = n.observacao
          ? n.observacao.length > 30
            ? n.observacao.substring(0, 30) + '...'
            : n.observacao
          : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><img src="/uploads/${n.aluno.foto || 'sem-foto.png'}" alt="Foto" height="50" style="border-radius: 6px;"></td>
          <td>${n.aluno.nome}</td>
          <td>${n.numeroSequencial || '-'}</td>
          <td>${n.aluno.turma}</td>
          <td>${n.tipo || '-'}</td>
          <td>${n.motivo || '-'}</td>
          <td>${n.tipoMedida || '-'}</td>
          <td>${typeof n.valorNumerico === 'number' ? n.valorNumerico : '-'}</td>
          <td>${n.data ? new Date(n.data).toLocaleDateString() : '-'}</td>
          <td title="${n.observacao || ''}">${observacaoLimite}</td>
          <td class="actions">
            <button class="delete-btn" onclick="excluirNotificacao(this, '${n._id}')">Excluir</button>
            <a class="pdf-btn" href="/api/pdf/${n._id}" target="_blank">PDF</a>
            <a class="edit-btn" href="editar-notificacao.html?id=${n._id}">Editar</a>
          </td>
        `;

        // ➕ injeta o botão "Comunicação aos Pais" quando aplicável
        const celAcoes = tr.querySelector('.actions');
        criarBotaoComunicacao(n, celAcoes);

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
          const turma = row.children[3].textContent;
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
      const res = await fetch(`/api/notificacoes/${id}`, {
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

/* Estilo do Spinner + botão */
const estilo = document.createElement('style');
estilo.innerHTML = `
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
.comunicacao-btn {
  background: #eee;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.comunicacao-btn:hover {
  filter: brightness(0.95);
}
`;
document.head.appendChild(estilo);
