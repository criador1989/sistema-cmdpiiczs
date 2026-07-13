'use strict';

const OpenAI = require('openai');
const { PROMPT_VERSAO, NOTAS_VALIDAS, CORRECAO_SCHEMA, montarPrompt } = require('./prompts/redacaoEnemPrompt');

function limparTexto(texto = '') { return String(texto || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function contarPalavras(texto = '') { const t = limparTexto(texto); return t ? t.split(/\s+/).filter(Boolean).length : 0; }
function texto(v) { return String(v || '').trim(); }
function lista(v, max = 8) { return Array.isArray(v) ? v.map(texto).filter(Boolean).slice(0, max) : []; }
function notaValida(v) {
  const n = Number(v); if (NOTAS_VALIDAS.includes(n)) return n;
  return NOTAS_VALIDAS.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a, 0);
}
function normalizarFeedback(f = {}) { return { nivel: texto(f.nivel), diagnostico: texto(f.diagnostico), evidencias: lista(f.evidencias, 3), comoMelhorar: lista(f.comoMelhorar, 3) }; }
function normalizarResultado(raw = {}, auditoria = {}) {
  const comps = raw.competencias || {};
  const competencias = { c1: notaValida(comps.c1), c2: notaValida(comps.c2), c3: notaValida(comps.c3), c4: notaValida(comps.c4), c5: notaValida(comps.c5) };
  const notaTotal = Object.values(competencias).reduce((s, n) => s + n, 0);
  const fb = raw.feedbackCompetencias || {};
  return {
    notaTotal, competencias,
    feedbackCompetencias: { c1: normalizarFeedback(fb.c1), c2: normalizarFeedback(fb.c2), c3: normalizarFeedback(fb.c3), c4: normalizarFeedback(fb.c4), c5: normalizarFeedback(fb.c5) },
    resumoAvaliacao: texto(raw.resumoAvaliacao), focoPrincipal: texto(raw.focoPrincipal),
    pontosFortes: lista(raw.pontosFortes, 5), pontosMelhorar: lista(raw.pontosMelhorar, 5), recomendacoes: lista(raw.recomendacoes, 6),
    propostaIntervencaoIdentificada: texto(
      raw.propostaIntervencaoIdentificada || raw.propostaIntervencao
    ),
    sugestaoAprimoramentoIntervencao: texto(
      raw.sugestaoAprimoramentoIntervencao
    ),
    // Compatibilidade com correções V3.0 e telas antigas.
    propostaIntervencao: texto(
      raw.propostaIntervencaoIdentificada || raw.propostaIntervencao
    ),
    elementosIntervencao: {
      agente: texto(raw.elementosIntervencao?.agente), acao: texto(raw.elementosIntervencao?.acao), meio: texto(raw.elementosIntervencao?.meio),
      finalidade: texto(raw.elementosIntervencao?.finalidade), detalhamento: texto(raw.elementosIntervencao?.detalhamento),
      respeitaDireitosHumanos: raw.elementosIntervencao?.respeitaDireitosHumanos !== false
    },
    observacoesTecnicas: texto(raw.observacoesTecnicas), planoEstudoSugerido: lista(raw.planoEstudoSugerido, 6),
    atividadesPraticas: (Array.isArray(raw.atividadesPraticas) ? raw.atividadesPraticas : []).slice(0,5).map((a,i) => ({
      prioridade: Math.max(1, Math.min(5, Number(a.prioridade) || i + 1)),
      competencia: ['C1','C2','C3','C4','C5','GERAL'].includes(a.competencia) ? a.competencia : 'GERAL',
      atividade: texto(a.atividade), objetivo: texto(a.objetivo), prazoSugerido: texto(a.prazoSugerido)
    })),
    alertaTema: { fugaAoTema: Boolean(raw.alertaTema?.fugaAoTema), justificativa: texto(raw.alertaTema?.justificativa) },
    alertaCopiaMotivadores: { suspeita: Boolean(raw.alertaCopiaMotivadores?.suspeita), justificativa: texto(raw.alertaCopiaMotivadores?.justificativa) },
    disclaimer: 'Estimativa pedagógica automatizada. Não substitui a correção oficial do Inep nem a avaliação do professor.',
    modelo: auditoria.modelo || '', corrigidoEm: new Date(), auditoria
  };
}

async function corrigirRedacaoEnem({ temaTitulo, proposta, textosMotivadores = [], redacaoAluno }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada no backend.');
  const redacao = limparTexto(redacaoAluno);
  if (contarPalavras(redacao) < 50) throw new Error('Texto insuficiente para correção pedagógica.');
  const model = process.env.OPENAI_REDACAO_MODEL || 'gpt-4.1-mini';
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.OPENAI_REDACAO_TIMEOUT_MS) || 90000,
    maxRetries: Number(process.env.OPENAI_REDACAO_MAX_RETRIES) || 2
  });
  const { system, user } = montarPrompt({ temaTitulo, proposta, textosMotivadores, redacaoAluno: redacao });
  const inicio = Date.now();
  const response = await client.responses.create({
    model,
    input: [{ role: 'system', content: system }, { role: 'user', content: user }],
    text: { format: { type: 'json_schema', name: 'correcao_redacao_enem', strict: true, schema: CORRECAO_SCHEMA } },
    max_output_tokens: Number(process.env.OPENAI_REDACAO_MAX_OUTPUT_TOKENS) || 5000
  });
  const output = texto(response.output_text);
  if (!output) throw new Error('A OpenAI retornou uma resposta vazia.');
  let raw; try { raw = JSON.parse(output); } catch { throw new Error('A resposta estruturada da OpenAI não pôde ser interpretada.'); }
  const usage = response.usage || {};
  const auditoria = {
    modelo: model, promptVersao: PROMPT_VERSAO, responseId: texto(response.id), requestId: texto(response._request_id),
    inputTokens: Number(usage.input_tokens) || 0, outputTokens: Number(usage.output_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || (Number(usage.input_tokens)||0) + (Number(usage.output_tokens)||0),
    duracaoMs: Date.now() - inicio, corrigidoEm: new Date()
  };
  return normalizarResultado(raw, auditoria);
}

module.exports = { limparTexto, contarPalavras, corrigirRedacaoEnem, normalizarResultado };
