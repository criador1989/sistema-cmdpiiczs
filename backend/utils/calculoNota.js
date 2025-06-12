const { addDays, isBefore, parseISO, eachDayOfInterval } = require('date-fns');

/**
 * Calcula a nota atual do aluno com base em T.S.M.D. e valores numéricos.
 * @param {Date} dataEntrada - Data de ingresso no colégio
 * @param {Date} dataAtual - Data atual (normalmente = hoje)
 * @param {Array} notificacoes - Lista de notificações [{ data, valorNumerico }]
 * @returns {Number} notaFinal - Nota final de comportamento (máximo 10)
 */
function calcularNotaTSMD(dataEntrada, dataAtual, notificacoes = []) {
  let nota = 8.0;

  // Gerar todos os dias úteis no período
  const diasUteis = eachDayOfInterval({
    start: dataEntrada,
    end: dataAtual,
  }).filter(d => [1, 2, 3, 4, 5].includes(d.getDay()));

  // Ordenar as notificações por data
  const notificacoesOrdenadas = notificacoes
    .map(n => ({
      data: typeof n.data === 'string' ? parseISO(n.data) : n.data,
      valor: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0
    }))
    .filter(n => isBefore(n.data, dataAtual))
    .sort((a, b) => a.data - b.data);

  let inicioContagem = dataEntrada;
  let bonusDias = 0;

  for (const n of notificacoesOrdenadas) {
    // Aplica o valor da notificação (positivo ou negativo)
    nota += n.valor;

    const trecho = diasUteis.filter(d => d >= inicioContagem && d < n.data);
    if (trecho.length > 60) {
      bonusDias += trecho.length - 60;
    }

    inicioContagem = addDays(n.data, 1); // reinicia contagem após infração
  }

  // Trecho final até a data atual
  const trechoFinal = diasUteis.filter(d => d >= inicioContagem && d <= dataAtual);
  if (trechoFinal.length > 60) {
    bonusDias += trechoFinal.length - 60;
  }

  nota += bonusDias * 0.01;

  return Math.min(10.0, Math.max(0.0, parseFloat(nota.toFixed(2))));
}

module.exports = calcularNotaTSMD;
