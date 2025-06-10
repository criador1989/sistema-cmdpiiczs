// services/comportamentoService.js

function atualizarGrauComportamento(aluno, notificacoes) {
  const grauBase = 8.00;
  const somaValores = notificacoes.reduce((acc, n) => acc + n.valorNumerico, 0);
  let novoGrau = grauBase + somaValores;

  if (novoGrau > 10) novoGrau = 10;
  else if (novoGrau < 0) novoGrau = 0;

  let classificacao = '';
  if (novoGrau >= 9.01) classificacao = 'Excepcional';
  else if (novoGrau >= 8.01) classificacao = 'Ótimo';
  else if (novoGrau >= 7.00) classificacao = 'Bom';
  else if (novoGrau >= 5.00) classificacao = 'Regular';
  else if (novoGrau >= 3.00) classificacao = 'Insuficiente';
  else classificacao = 'Incompatível';

  aluno.grauComportamento = novoGrau;
  aluno.statusComportamento = classificacao;

  return aluno;
}

module.exports = { atualizarGrauComportamento };
