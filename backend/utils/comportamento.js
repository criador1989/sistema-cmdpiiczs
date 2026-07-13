// utils/comportamento.js
/**
 * Classificação por faixas (Regulamento):
 * - Regular: 5.00 a 6.99  -> encaminhar ao Núcleo Psicossocial (NP) + registro em histórico
 * - Insuficiente: 3.00 a 4.99 -> informar pais sobre possibilidade de não renovação se migrar p/ incompatível
 * - (mantemos faixas já usadas no painel para <3 e >=7, se existirem)
 */
function classificarComportamento(nota) {
  if (typeof nota !== 'number' || Number.isNaN(nota)) return { faixa: 'indefinido', codigo: null };

  if (nota >= 5.00 && nota <= 6.99) return { faixa: 'regular', codigo: 'REGULAR' };
  if (nota >= 3.00 && nota <= 4.99) return { faixa: 'insuficiente', codigo: 'INSUFICIENTE' };

  // suportar outras faixas existentes no sistema, sem mudar regra atual
  if (nota < 3.00) return { faixa: 'incompativel', codigo: 'INCOMPATIVEL' }; // se vocês já usam isso
  if (nota >= 7.00) return { faixa: 'adequado', codigo: 'ADEQUADO' };

  // 0–2.99, 5–6.99 e 3–4.99 já cobertos; 7–10 como adequado
  return { faixa: 'outros', codigo: 'OUTROS' };
}

module.exports = { classificarComportamento };
