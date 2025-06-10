// Função utilitária para calcular T.S.M.D.
const { addDays, isBefore, parseISO, eachDayOfInterval } = require('date-fns');

/**
 * Calcula a nota atual do aluno com base em T.S.M.D.
 * @param {Date} dataEntrada - Data de ingresso no colégio
 * @param {Date} dataAtual - Data atual (geralmente data da notificação)
 * @param {Date[]} datasInfracoes - Lista de datas de notificações anteriores
 * @returns {Number} notaFinal - Nota de comportamento (máximo 10)
 */
function calcularNotaTSMD(dataEntrada, dataAtual, datasInfracoes = []) {
  let notaBase = 8.0;

  const diasUteis = eachDayOfInterval({
    start: dataEntrada,
    end: dataAtual,
  }).filter(d => [1, 2, 3, 4, 5].includes(d.getDay())); // dias úteis = seg a sex

  // Ordena e filtra datas de infrações antes da data atual
  datasInfracoes = datasInfracoes
    .map(d => (typeof d === 'string' ? parseISO(d) : d))
    .filter(d => isBefore(d, dataAtual))
    .sort((a, b) => a - b);

  let inicioContagem = dataEntrada;
  let bonusDias = 0;

  for (const infracao of datasInfracoes) {
    const trecho = diasUteis.filter(d => d >= inicioContagem && d < infracao);
    if (trecho.length > 60) {
      bonusDias += trecho.length - 60;
    }
    inicioContagem = addDays(infracao, 1); // reinicia contagem após infração
  }

  // Trecho final até a data atual
  const trechoFinal = diasUteis.filter(d => d >= inicioContagem && d <= dataAtual);
  if (trechoFinal.length > 60) {
    bonusDias += trechoFinal.length - 60;
  }

  const notaFinal = Math.min(10.0, notaBase + bonusDias * 0.01);
  return parseFloat(notaFinal.toFixed(2));
}

module.exports = calcularNotaTSMD;
