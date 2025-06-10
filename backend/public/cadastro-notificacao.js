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

document.getElementById('tipoMedida').addEventListener('change', function () {
  const campoDias = document.getElementById('campoDias');
  const tipo = this.value;
  if (tipo === 'A.I.A' || tipo === 'A.E.C.D.E') {
    campoDias.style.display = 'block';
  } else {
    campoDias.style.display = 'none';
    document.getElementById('quantidadeDias').value = '';
  }
});

document.getElementById('formNotificacao').addEventListener('submit', async function (e) {
  e.preventDefault();

  const aluno = document.getElementById('aluno').value;
  const motivo = document.getElementById('motivo').value;
  const tipo = document.getElementById('tipo').value;
  const tipoMedida = document.getElementById('tipoMedida').value;
  const data = document.getElementById('data').value;
  const observacao = document.getElementById('observacao').value;
  const quantidadeDias = parseInt(document.getElementById('quantidadeDias').value || 1);

  // Novos campos do regulamento
  const artigo = document.getElementById('artigo').value;
  const inciso = document.getElementById('inciso').value;
  const classificacaoRegulamento = document.getElementById('classificacaoRegulamento').value;

  // Cálculo do valor numérico
  let valorNumerico = 0;
  if (tipoMedida === 'Advertência Escrita') valorNumerico = -0.3;
  else if (tipoMedida === 'Repreensão') valorNumerico = -0.5;
  else if (tipoMedida === 'A.E.C.D.E') valorNumerico = -0.7 * quantidadeDias;
  else if (tipoMedida === 'A.I.A') valorNumerico = -1.2 * quantidadeDias;
  else if (tipoMedida === 'Elogio Verbal') valorNumerico = 0.15;
  else if (tipoMedida === 'Elogio Individual') valorNumerico = 0.6;
  else if (tipoMedida === 'Elogio Coletivo') valorNumerico = 0.2;
  else if (tipoMedida === 'Média ≥ 8,5') valorNumerico = 0.4;

  const resposta = await fetch('/api/notificacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      aluno,
      motivo,
      tipo,
      tipoMedida,
      valorNumerico: parseFloat(valorNumerico.toFixed(2)),
      data,
      observacao,
      quantidadeDias,
      artigo,
      inciso,
      classificacaoRegulamento
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
