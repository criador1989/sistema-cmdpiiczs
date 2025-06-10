
async function carregarAlunos() {
  try {
    const resposta = await fetch('/api/alunos', { credentials: 'include' });
    const alunos = await resposta.json();

    const select = document.getElementById('aluno');
    alunos.forEach(a => {
      const option = document.createElement('option');
      option.value = a._id;
      option.textContent = `${a.nome} - Turma ${a.turma}`;
      select.appendChild(option);
    });
  } catch (erro) {
    console.error('Erro ao carregar alunos:', erro);
  }
}

document.getElementById('aluno').addEventListener('change', function () {
  const alunoSelecionado = this.options[this.selectedIndex].text;
  document.getElementById('motivo').value = alunoSelecionado ? '' : '';
});

document.getElementById('formNotificacao').addEventListener('submit', async function (e) {
  e.preventDefault();

  const aluno = document.getElementById('aluno').value;
  const motivo = document.getElementById('motivo').value;
  const tipo = document.getElementById('tipo').value;
  const tipoMedida = document.getElementById('tipoMedida').value;
  const valorNumerico = document.getElementById('valorNumerico').value;
  const data = document.getElementById('data').value;
  const observacao = document.getElementById('observacao').value;

  const resposta = await fetch('/api/notificacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      aluno,
      motivo,
      tipo,
      tipoMedida,
      valorNumerico,
      data,
      observacao
    })
  });

  if (resposta.ok) {
    alert('Notificação salva com sucesso!');
    window.location.href = '/painel.html';
  } else {
    alert('Erro ao salvar notificação.');
  }
});

carregarAlunos();
