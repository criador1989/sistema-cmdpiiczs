document.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch('/api/estatisticas', { credentials: 'include' });
  const dados = await res.json();

  const turmas = Object.keys(dados.alunosPorTurma);
  const qtdeAlunos = Object.values(dados.alunosPorTurma);

  new Chart(document.getElementById('graficoAlunosTurma'), {
    type: 'bar',
    data: {
      labels: turmas,
      datasets: [{
        label: 'Quantidade de Alunos',
        data: qtdeAlunos
      }]
    }
  });

  const tipos = Object.keys(dados.tiposNotificacao);
  const qtdeNotificacoes = Object.values(dados.tiposNotificacao);

  new Chart(document.getElementById('graficoTiposNotificacao'), {
    type: 'pie',
    data: {
      labels: tipos,
      datasets: [{
        label: 'Distribuição de Notificações',
        data: qtdeNotificacoes
      }]
    }
  });

  const turmasNota = Object.keys(dados.comportamentoMedioPorTurma);
  const medias = Object.values(dados.comportamentoMedioPorTurma);

  new Chart(document.getElementById('graficoComportamentoMedio'), {
    type: 'line',
    data: {
      labels: turmasNota,
      datasets: [{
        label: 'Nota Média de Comportamento',
        data: medias,
        fill: false
      }]
    }
  });
});

document.getElementById('btnExportarPDF').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(16);
  doc.text("Relatório de Estatísticas - Sistema Escolar", 105, y, { align: 'center' });
  y += 10;

  const data = new Date().toLocaleString();
  doc.setFontSize(10);
  doc.text(`Gerado em: ${data}`, 105, y, { align: 'center' });
  y += 10;

  const charts = [
    { id: 'graficoAlunosTurma', titulo: 'Alunos por Turma' },
    { id: 'graficoTiposNotificacao', titulo: 'Tipos de Notificações' },
    { id: 'graficoComportamentoMedio', titulo: 'Comportamento Médio por Turma' }
  ];

  for (const chart of charts) {
    const canvas = document.getElementById(chart.id);
    const image = await html2canvas(canvas);
    const imgData = image.toDataURL('image/png');

    y += 10;
    doc.setFontSize(12);
    doc.text(chart.titulo, 105, y, { align: 'center' });
    y += 5;

    doc.addImage(imgData, 'PNG', 20, y, 170, 90);
    y += 95;

    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  }

  doc.save('relatorio_estatisticas.pdf');
});
