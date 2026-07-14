'use strict';

function normalizar(texto = '') {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function limitar01(n) { return Math.max(0, Math.min(1, Number(n) || 0)); }
function ngrams(texto, n = 5) {
  const tokens = normalizar(texto).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i <= tokens.length - n; i++) set.add(tokens.slice(i, i + n).join(' '));
  return set;
}
function similaridade(a, b, n = 5) {
  const A = ngrams(a, n), B = ngrams(b, n);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function maiorSimilaridade(texto, candidatos = []) {
  return candidatos.reduce((m, c) => Math.max(m, similaridade(texto, c)), 0);
}
function numero(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }

function analisarIntegridade({ texto, textosMotivadores = [], redacoesAnteriores = [], telemetria = {}, fotoInformada = false }) {
  const tamanho = String(texto || '').length;
  const colagens = numero(telemetria.colagensDetectadas);
  const caracteresColados = numero(telemetria.caracteresColados);
  const maiorColagem = numero(telemetria.maiorColagem);
  const eventosDigitacao = numero(telemetria.eventosDigitacao);
  const revisoesEstimadas = numero(telemetria.revisoesEstimadas);
  const tempoEdicaoSegundos = numero(telemetria.tempoEdicaoSegundos);
  const proporcaoTextoColado = limitar01(tamanho ? caracteresColados / tamanho : 0);
  const motivadores = textosMotivadores.map(t => `${t.titulo || ''} ${t.conteudo || ''}`);
  const anteriores = redacoesAnteriores.map(r => r.texto || r.textoNormalizado || '').filter(Boolean);
  const similaridadeMotivadores = maiorSimilaridade(texto, motivadores);
  const similaridadeRedacoesAnteriores = maiorSimilaridade(texto, anteriores);
  const motivosAtencao = [];
  if (maiorColagem >= 900) motivosAtencao.push('Foi registrada uma colagem extensa durante a produção.');
  if (proporcaoTextoColado >= 0.65) motivosAtencao.push('Grande parte do texto pode ter sido inserida por colagem.');
  if (similaridadeMotivadores >= 0.42) motivosAtencao.push('Há alta proximidade textual com os textos motivadores.');
  if (similaridadeRedacoesAnteriores >= 0.72) motivosAtencao.push('Há alta proximidade com uma redação anterior do mesmo aluno.');
  if (tamanho > 1200 && eventosDigitacao < 8 && colagens > 0) motivosAtencao.push('Poucos eventos de digitação foram registrados para o tamanho do texto.');
  let nivelAtencao = 'baixo';
  if (motivosAtencao.length >= 2 || proporcaoTextoColado >= 0.85 || similaridadeMotivadores >= 0.58) nivelAtencao = 'alto';
  else if (motivosAtencao.length === 1) nivelAtencao = 'moderado';
  return {
    fotoManuscritaInformada: Boolean(fotoInformada),
    cronometroUtilizado: String(telemetria.cronometroUtilizado) === 'true' || Boolean(telemetria.cronometroUtilizado),
    colagensDetectadas: colagens, caracteresColados, maiorColagem,
    colagemGrandeDetectada: maiorColagem >= 600 || String(telemetria.colagemGrandeDetectada) === 'true',
    proporcaoTextoColado, eventosDigitacao,
    caracteresDigitadosEstimados: Math.max(0, tamanho - Math.min(tamanho, caracteresColados)),
    tempoEdicaoSegundos, revisoesEstimadas,
    similaridadeMotivadores, similaridadeRedacoesAnteriores,
    nivelAtencao, motivosAtencao,
    observacao: 'Indicadores de autoria são sinais pedagógicos e não constituem prova de fraude.'
  };
}

module.exports = { normalizar, similaridade, analisarIntegridade };
