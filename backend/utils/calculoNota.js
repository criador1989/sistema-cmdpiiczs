const { addDays, isAfter, parseISO, eachDayOfInterval, isBefore } = require('date-fns');

function calcularNotaTSMD(dataEntrada, dataAtual, notificacoes = []) {
  let nota = 8.0;

  // Se a dataEntrada estiver no futuro em relação à data atual, retorna 8 sem cálculos
  if (!dataEntrada || isAfter(dataEntrada, dataAtual)) {
    return nota;
  }

  const diasUteis = eachDayOfInterval({
    start: dataEntrada,
    end: dataAtual,
  }).filter(d => [1, 2, 3, 4, 5].includes(d.getDay()));

  const notificacoesOrdenadas = notificacoes
    .map(n => ({
      data: typeof n.data === 'string' ? parseISO(n.data) : n.data,
      valor: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0
    }))
    .filter(n => !isAfter(n.data, dataAtual)) // evita datas futuras
    .sort((a, b) => a.data - b.data);

  let inicioContagem = dataEntrada;
  let bonusDias = 0;

  for (const n of notificacoesOrdenadas) {
    nota += n.valor;

    const trecho = diasUteis.filter(d => d >= inicioContagem && d < n.data);
    if (trecho.length > 60) {
      bonusDias += trecho.length - 60;
    }

    inicioContagem = addDays(n.data, 1);
  }

  const trechoFinal = diasUteis.filter(d => d >= inicioContagem && d <= dataAtual);
  if (trechoFinal.length > 60) {
    bonusDias += trechoFinal.length - 60;
  }

  nota += bonusDias * 0.01;

  return Math.min(10.0, Math.max(0.0, parseFloat(nota.toFixed(2))));
}

module.exports = calcularNotaTSMD;
