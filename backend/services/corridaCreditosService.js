'use strict';

const mongoose = require('mongoose');
const Aluno = require('../models/Aluno');
const EventoInscricao = require('../models/eventos/EventoInscricao');
const EventoParticipante = require('../models/eventos/EventoParticipante');
const CorridaCredito = require('../models/eventos/CorridaCredito');
const CorridaAlunoAlias = require('../models/eventos/CorridaAlunoAlias');

const EVENT_SLUG = 'corrida-cmdpii-2026';
const PARENTESCO_ALUNO = new Set(['pai', 'mae', 'irmao', 'irma']);
const PARTICULAS_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

// Limiares deliberadamente conservadores. O algoritmo só vincula sozinho
// quando, além da semelhança, há distância suficiente para o segundo candidato.
const CONCILIACAO = Object.freeze({
  autoScoreMin: 0.92,
  autoMargemMin: 0.05,
  autoScoreComNascimentoMin: 0.86,
  autoMargemComNascimentoMin: 0.025,
  sugestaoScoreMin: 0.78,
  maxSugestoes: 5,
});

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizarTurma(valor) {
  return normalizarTexto(valor)
    .replace(/\bserie\b/g, '')
    .replace(/\bano\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokensNome(valor, { removerParticulas = false } = {}) {
  const tokens = normalizarTexto(valor).split(' ').filter(Boolean);
  return removerParticulas ? tokens.filter((t) => !PARTICULAS_NOME.has(t)) : tokens;
}

function nomeComparavel(valor) {
  return tokensNome(valor, { removerParticulas: true }).join(' ');
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  const curr = new Array(t.length + 1);

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const custo = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + custo
      );
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

function similaridadeLevenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const max = Math.max(s.length, t.length);
  if (!max) return 1;
  return clamp01(1 - (levenshtein(s, t) / max));
}

function jaroWinkler(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j += 1) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches += 1;
      break;
    }
  }

  if (!matches) return 0;

  const ms1 = [];
  const ms2 = [];
  for (let i = 0; i < s1.length; i += 1) if (s1Matches[i]) ms1.push(s1[i]);
  for (let i = 0; i < s2.length; i += 1) if (s2Matches[i]) ms2.push(s2[i]);

  let transposicoes = 0;
  for (let i = 0; i < ms1.length; i += 1) if (ms1[i] !== ms2[i]) transposicoes += 1;
  transposicoes /= 2;

  const m = matches;
  const jaro = ((m / s1.length) + (m / s2.length) + ((m - transposicoes) / m)) / 3;
  let prefixo = 0;
  const limite = Math.min(4, s1.length, s2.length);
  while (prefixo < limite && s1[prefixo] === s2[prefixo]) prefixo += 1;
  return clamp01(jaro + (prefixo * 0.1 * (1 - jaro)));
}

function similaridadeTokensFuzzy(a, b) {
  const aa = tokensNome(a, { removerParticulas: true });
  const bb = tokensNome(b, { removerParticulas: true });
  if (!aa.length && !bb.length) return 1;
  if (!aa.length || !bb.length) return 0;

  const mediaMelhores = (origem, destino) => origem.reduce((soma, token) => {
    let melhor = 0;
    for (const outro of destino) melhor = Math.max(melhor, jaroWinkler(token, outro));
    return soma + melhor;
  }, 0) / origem.length;

  return clamp01((mediaMelhores(aa, bb) + mediaMelhores(bb, aa)) / 2);
}

function similaridadeNome(a, b) {
  const ca = nomeComparavel(a);
  const cb = nomeComparavel(b);
  if (!ca || !cb) return { score: 0, exato: false, primeiroScore: 0, ultimoScore: 0 };
  if (ca === cb) return { score: 1, exato: true, primeiroScore: 1, ultimoScore: 1 };

  const ta = tokensNome(a, { removerParticulas: true });
  const tb = tokensNome(b, { removerParticulas: true });
  const primeiroScore = jaroWinkler(ta[0] || '', tb[0] || '');
  const ultimoScore = jaroWinkler(ta[ta.length - 1] || '', tb[tb.length - 1] || '');
  const jw = jaroWinkler(ca, cb);
  const lev = similaridadeLevenshtein(ca, cb);
  const tokenFuzzy = similaridadeTokensFuzzy(a, b);

  let score = (jw * 0.45) + (lev * 0.20) + (tokenFuzzy * 0.25) + (primeiroScore * 0.05) + (ultimoScore * 0.05);
  // Primeiro nome muito diferente é um forte sinal de pessoa diferente.
  if (primeiroScore < 0.78) score *= 0.88;
  return { score: clamp01(score), exato: false, primeiroScore, ultimoScore };
}

function dataYmd(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function nivelConfianca(score) {
  if (score >= 0.95) return 'alta';
  if (score >= 0.85) return 'media';
  return 'baixa';
}

function rankearCandidatos(candidatos, { nome, turma, nascimento, limit = CONCILIACAO.maxSugestoes } = {}) {
  const turmaNorm = normalizarTurma(turma);
  const nascRef = dataYmd(nascimento);
  const lista = (candidatos || []).map((aluno) => {
    const sim = similaridadeNome(nome, aluno.nome);
    const mesmaTurma = turmaNorm ? normalizarTurma(aluno.turma) === turmaNorm : false;
    const nascAluno = dataYmd(aluno.nascimento);
    const nascimentoDisponivel = Boolean(nascRef && nascAluno);
    const nascimentoCoincide = nascimentoDisponivel && nascRef === nascAluno;
    const nascimentoConflita = nascimentoDisponivel && nascRef !== nascAluno;

    let score = sim.score;
    if (nascimentoCoincide) score = clamp01(score + 0.035);
    if (nascimentoConflita) score = clamp01(score - 0.16);
    // Turma não é apenas um bônus: para auto-vínculo ela será requisito duro.
    // Aqui há leve penalização apenas para ordenar sugestões de contingência.
    if (turmaNorm && !mesmaTurma) score = clamp01(score - 0.12);

    return {
      alunoId: aluno._id,
      nome: aluno.nome,
      turma: aluno.turma,
      nascimento: aluno.nascimento || null,
      score,
      scorePercent: Math.round(score * 1000) / 10,
      nivel: nivelConfianca(score),
      mesmaTurma,
      nascimentoCoincide,
      nascimentoConflita,
      primeiroScore: sim.primeiroScore,
      ultimoScore: sim.ultimoScore,
      exato: sim.exato,
    };
  }).sort((a, b) => {
    if (a.mesmaTurma !== b.mesmaTurma) return a.mesmaTurma ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' });
  });

  const filtrada = lista.filter((x, i) => i < limit || x.score >= CONCILIACAO.sugestaoScoreMin);
  return filtrada.slice(0, Math.max(limit, 1));
}

function resumoConciliacao(metodo, candidato, margem = 0, extras = {}) {
  return {
    metodo,
    score: candidato?.score ?? 0,
    margem: Math.max(0, margem || 0),
    nivel: metodo === 'exato' || metodo === 'exato_nascimento' || metodo === 'alias_confirmado'
      ? 'exata'
      : nivelConfianca(candidato?.score || 0),
    candidatoAlunoId: candidato?.alunoId || null,
    candidatoNome: candidato?.nome || '',
    candidatoTurma: candidato?.turma || '',
    nascimentoCoincide: Boolean(candidato?.nascimentoCoincide),
    turmaCoincide: Boolean(candidato?.mesmaTurma),
    atualizadoEm: new Date(),
    ...extras,
  };
}

function actorInfo(actor) {
  return {
    usuarioId: actor?._id || actor?.id || null,
    usuarioNome: String(actor?.nome || actor?.email || '').slice(0, 140),
    usuarioTipo: String(actor?.tipo || '').slice(0, 60),
  };
}

function tenantFromActor(actor) {
  const raw = actor?.instituicao || actor?.tenantId || null;
  if (!raw) return null;
  return mongoose.Types.ObjectId.isValid(String(raw)) ? new mongoose.Types.ObjectId(String(raw)) : raw;
}

function scopeInstituicao(tenantId) {
  return { $or: [{ instituicao: tenantId }, { tenantId }] };
}

async function buscarAliasConfirmado({ tenantId, nome, turma }) {
  const aliasNomeNorm = nomeComparavel(nome);
  const aliasTurmaNorm = normalizarTurma(turma);
  if (!tenantId || !aliasNomeNorm || !aliasTurmaNorm) return null;

  const alias = await CorridaAlunoAlias.findOne({
    eventSlug: EVENT_SLUG,
    instituicao: tenantId,
    aliasNomeNorm,
    aliasTurmaNorm,
    ativo: true,
  }).lean();
  if (!alias) return null;

  const aluno = await Aluno.findOne({
    _id: alias.alunoId,
    ...scopeInstituicao(tenantId),
  }).select('_id nome turma nascimento instituicao tenantId').lean();
  if (!aluno) return null;
  if (normalizarTurma(aluno.turma) !== aliasTurmaNorm) return null;
  return { alias, aluno };
}

async function registrarAliasConfirmado({ tenantId, nome, turma, aluno, actor, creditoId }) {
  const aliasNomeNorm = nomeComparavel(nome);
  const aliasTurmaNorm = normalizarTurma(turma);
  if (!tenantId || !aliasNomeNorm || !aliasTurmaNorm || !aluno?._id) return { criado: false, ignorado: true };

  const existente = await CorridaAlunoAlias.findOne({
    eventSlug: EVENT_SLUG,
    instituicao: tenantId,
    aliasNomeNorm,
    aliasTurmaNorm,
    ativo: true,
  });

  if (existente && String(existente.alunoId) !== String(aluno._id)) {
    return { conflito: true, alias: existente };
  }

  if (existente) {
    existente.ultimaConfirmacaoEm = new Date();
    existente.confirmacoes = Number(existente.confirmacoes || 0) + 1;
    existente.alunoNome = aluno.nome;
    existente.alunoTurma = aluno.turma;
    existente.ultimoCreditoId = creditoId || existente.ultimoCreditoId || null;
    await existente.save();
    return { criado: false, alias: existente };
  }

  const novo = await CorridaAlunoAlias.create({
    eventSlug: EVENT_SLUG,
    instituicao: tenantId,
    tenantId,
    aliasNomeOriginal: String(nome || '').slice(0, 160),
    aliasTurmaOriginal: String(turma || '').slice(0, 80),
    aliasNomeNorm,
    aliasTurmaNorm,
    alunoId: aluno._id,
    alunoNome: aluno.nome,
    alunoTurma: aluno.turma,
    origem: 'confirmacao_manual',
    confirmadoPorId: actor?._id || actor?.id || null,
    confirmadoPorNome: String(actor?.nome || actor?.email || '').slice(0, 140),
    primeiraConfirmacaoEm: new Date(),
    ultimaConfirmacaoEm: new Date(),
    confirmacoes: 1,
    ultimoCreditoId: creditoId || null,
    ativo: true,
  });
  return { criado: true, alias: novo };
}

async function localizarAluno({ tenantId, nome, turma, nascimento }) {
  if (!tenantId || !nome) {
    return {
      aluno: null,
      motivo: 'Instituição ou nome do aluno de referência ausente.',
      conciliacao: resumoConciliacao('sem_candidato', null),
    };
  }

  const turmaNorm = normalizarTurma(turma);
  const aliasResolvido = await buscarAliasConfirmado({ tenantId, nome, turma });
  if (aliasResolvido) {
    const candidato = {
      alunoId: aliasResolvido.aluno._id,
      nome: aliasResolvido.aluno.nome,
      turma: aliasResolvido.aluno.turma,
      score: 1,
      mesmaTurma: true,
      nascimentoCoincide: Boolean(dataYmd(nascimento) && dataYmd(nascimento) === dataYmd(aliasResolvido.aluno.nascimento)),
    };
    return {
      aluno: aliasResolvido.aluno,
      motivo: '',
      conciliacao: resumoConciliacao('alias_confirmado', candidato, 1, { aliasId: aliasResolvido.alias._id }),
    };
  }

  const candidatos = await Aluno.find(scopeInstituicao(tenantId))
    .select('_id nome turma nascimento instituicao tenantId')
    .limit(5000)
    .lean();

  const mesmaTurma = turmaNorm
    ? candidatos.filter((a) => normalizarTurma(a.turma) === turmaNorm)
    : candidatos;
  const nomeComp = nomeComparavel(nome);
  let exatos = mesmaTurma.filter((a) => nomeComparavel(a.nome) === nomeComp);

  const nascRef = dataYmd(nascimento);
  if (nascRef && exatos.length > 1) {
    const porNascimento = exatos.filter((a) => dataYmd(a.nascimento) === nascRef);
    if (porNascimento.length === 1) {
      const a = porNascimento[0];
      const c = { alunoId: a._id, nome: a.nome, turma: a.turma, score: 1, mesmaTurma: true, nascimentoCoincide: true };
      return { aluno: a, motivo: '', conciliacao: resumoConciliacao('exato_nascimento', c, 1) };
    }
  }

  if (exatos.length === 1) {
    const a = exatos[0];
    const nascAluno = dataYmd(a.nascimento);
    if (!(nascRef && nascAluno && nascRef !== nascAluno)) {
      const c = { alunoId: a._id, nome: a.nome, turma: a.turma, score: 1, mesmaTurma: true, nascimentoCoincide: Boolean(nascRef && nascRef === nascAluno) };
      return { aluno: a, motivo: '', conciliacao: resumoConciliacao('exato', c, 1) };
    }
  }

  const ranking = rankearCandidatos(candidatos, { nome, turma, nascimento, limit: Math.max(CONCILIACAO.maxSugestoes, 10) });
  const rankingMesmaTurma = ranking.filter((x) => x.mesmaTurma);
  const top = rankingMesmaTurma[0] || null;
  const segundo = rankingMesmaTurma[1] || null;
  const margem = top ? Math.max(0, top.score - (segundo?.score || 0)) : 0;

  if (top && !top.nascimentoConflita && top.primeiroScore >= 0.82) {
    const temNascimentoConfirmado = Boolean(nascRef && top.nascimentoCoincide);
    const scoreMin = temNascimentoConfirmado ? CONCILIACAO.autoScoreComNascimentoMin : CONCILIACAO.autoScoreMin;
    const margemMin = temNascimentoConfirmado ? CONCILIACAO.autoMargemComNascimentoMin : CONCILIACAO.autoMargemMin;
    if (top.score >= scoreMin && margem >= margemMin) {
      const aluno = candidatos.find((a) => String(a._id) === String(top.alunoId));
      return {
        aluno,
        motivo: '',
        conciliacao: resumoConciliacao('fuzzy_automatico', top, margem, { segundoScore: segundo?.score || 0 }),
      };
    }
  }

  let motivo = 'Aluno de referência não localizado com confiança suficiente no cadastro oficial do Axoriin.';
  let metodo = 'sem_candidato';
  if (top) {
    metodo = top.score >= CONCILIACAO.sugestaoScoreMin ? 'fuzzy_sugerido' : 'baixa_confianca';
    if (top.score >= CONCILIACAO.sugestaoScoreMin && margem < CONCILIACAO.autoMargemMin) {
      metodo = 'ambiguo';
      motivo = 'Há candidatos muito parecidos na mesma turma. A gestão precisa confirmar o vínculo.';
    } else if (top.score >= CONCILIACAO.sugestaoScoreMin) {
      motivo = `Há uma sugestão provável (${top.scorePercent}%), mas abaixo do limiar de vínculo automático.`;
    }
  }

  return {
    aluno: null,
    motivo,
    conciliacao: resumoConciliacao(metodo, top, margem, { segundoScore: segundo?.score || 0 }),
    sugestoes: ranking.slice(0, CONCILIACAO.maxSugestoes),
  };
}

function referenciaDoParticipante(participant) {
  if (participant?.vinculo === 'aluno') {
    return {
      origem: 'inscricao_propria',
      nome: participant.nome || '',
      turma: participant.turma || '',
      nascimento: participant.nascimento || null,
    };
  }

  if (PARENTESCO_ALUNO.has(String(participant?.vinculo || ''))) {
    return {
      origem: 'inscricao_parente',
      nome: participant?.referenciaVinculo?.nome || '',
      turma: participant?.referenciaVinculo?.turma || '',
      nascimento: null,
    };
  }

  return null;
}

async function sincronizarCreditoDaInscricao(inscricao, participant, actor) {
  if (!inscricao || !participant) return { ignorado: true, motivo: 'Dados da inscrição incompletos.' };
  if (String(inscricao.eventSlug) !== EVENT_SLUG) return { ignorado: true, motivo: 'Evento diferente.' };
  if (inscricao.status !== 'confirmada' || inscricao.pagamento?.status !== 'aprovado') {
    return { ignorado: true, motivo: 'Inscrição ainda não está deferida/paga.' };
  }

  const ref = referenciaDoParticipante(participant);
  if (!ref) return { ignorado: true, motivo: 'Vínculo não gera crédito para aluno.' };

  const tenantId = tenantFromActor(actor);
  if (!tenantId) return { ignorado: true, motivo: 'Instituição não identificada no usuário que deferiu.' };

  const resolucao = await localizarAluno({ tenantId, nome: ref.nome, turma: ref.turma, nascimento: ref.nascimento });
  const agora = new Date();
  const ator = actorInfo(actor);
  const aluno = resolucao.aluno;
  const status = aluno ? 'disponivel' : 'pendente_vinculo';

  const baseSet = {
    eventSlug: EVENT_SLUG,
    instituicao: tenantId,
    tenantId,
    sourceParticipanteId: participant._id,
    sourceParticipanteNome: String(participant.nome || '').slice(0, 140),
    sourceVinculo: String(participant.vinculo || '').slice(0, 60),
    origem: ref.origem,
    deferidaEm: inscricao.deferidaEm || agora,
    referenciaAlunoNome: String(ref.nome || '').slice(0, 140),
    referenciaAlunoTurma: String(ref.turma || '').slice(0, 60),
    referenciaAlunoNascimento: ref.nascimento || null,
    beneficiarioAlunoId: aluno?._id || null,
    beneficiarioNome: aluno?.nome || '',
    beneficiarioTurma: aluno?.turma || '',
    conciliacao: resolucao.conciliacao || {},
    status,
    motivoPendencia: aluno ? '' : resolucao.motivo,
    motivoRevogacao: '',
  };

  const existente = await CorridaCredito.findOne({ eventSlug: EVENT_SLUG, sourceInscricaoId: inscricao._id });
  if (existente) {
    if (['destinado', 'processado'].includes(existente.status)) {
      return { credito: existente, existente: true, preservado: true };
    }

    // Uma decisão humana já confirmada pela Gestão é autoridade superior ao
    // reconciliador automático. Sincronizações futuras não podem mover esse
    // crédito silenciosamente para outro aluno.
    if (
      existente.status === 'disponivel' &&
      existente.beneficiarioAlunoId &&
      existente.conciliacao?.metodo === 'manual_confirmado'
    ) {
      return { credito: existente, existente: true, preservado: true };
    }

    if (existente.status === 'revogado_processado') {
      Object.assign(existente, baseSet, { status: 'processado', motivoRevogacao: '' });
      existente.auditoria.push({
        acao: 'origem_revalidada_apos_processamento',
        em: agora,
        ...ator,
        detalhes: { status: 'processado' },
      });
      await existente.save();
      return { credito: existente, existente: true, preservado: true };
    }

    Object.assign(existente, baseSet);
    existente.destino = undefined;
    existente.processamento = {};
    existente.auditoria.push({
      acao: aluno ? 'credito_reconciliado_com_vinculo' : 'credito_reconciliado_pendente',
      em: agora,
      ...ator,
      detalhes: { status, conciliacao: resolucao.conciliacao || null },
    });
    await existente.save();
    return { credito: existente, existente: true };
  }

  const credito = await CorridaCredito.create({
    ...baseSet,
    sourceInscricaoId: inscricao._id,
    auditoria: [{
      acao: aluno ? 'credito_criado_com_vinculo' : 'credito_criado_pendente_vinculo',
      em: agora,
      ...ator,
      detalhes: { status, conciliacao: resolucao.conciliacao || null },
    }],
  });

  return { credito, criado: true };
}

async function revogarCreditoDaInscricao(inscricao, actor, motivo = 'Inscrição deixou de estar deferida.') {
  const credito = await CorridaCredito.findOne({ eventSlug: EVENT_SLUG, sourceInscricaoId: inscricao?._id });
  if (!credito) return { ignorado: true };
  if (['revogado', 'revogado_processado'].includes(credito.status)) {
    return { credito, existente: true, preservado: true };
  }

  const eraProcessado = credito.status === 'processado';
  const destinoAnterior = credito.destino ? credito.destino.toObject?.() || credito.destino : null;
  credito.status = eraProcessado ? 'revogado_processado' : 'revogado';
  credito.motivoRevogacao = String(motivo || '').slice(0, 300);

  if (!eraProcessado) {
    credito.destino = undefined;
    credito.processamento = {};
  }

  credito.auditoria.push({
    acao: eraProcessado ? 'origem_revogada_apos_processamento' : 'credito_revogado',
    em: new Date(),
    ...actorInfo(actor),
    detalhes: { motivo: credito.motivoRevogacao, destinoAnterior },
  });
  await credito.save();
  return { credito };
}

async function sincronizarTodosConfirmados(actor) {
  const tenantId = tenantFromActor(actor);
  if (!tenantId) throw new Error('Instituição não identificada.');

  const inscricoes = await EventoInscricao.find({
    eventSlug: EVENT_SLUG,
    status: 'confirmada',
    'pagamento.status': 'aprovado',
  }).lean();

  const participantes = await EventoParticipante.find({
    _id: { $in: inscricoes.map((i) => i.participantId) },
    eventSlug: EVENT_SLUG,
    ativo: true,
  }).lean();
  const pmap = new Map(participantes.map((p) => [String(p._id), p]));

  const resumo = {
    total: inscricoes.length,
    criados: 0,
    existentes: 0,
    vinculadosAutomaticamente: 0,
    fuzzyAutomaticos: 0,
    porAlias: 0,
    pendentes: 0,
    ignorados: 0,
    erros: 0,
  };

  for (const ins of inscricoes) {
    const participant = pmap.get(String(ins.participantId));
    try {
      const r = await sincronizarCreditoDaInscricao(ins, participant, actor);
      if (r?.ignorado) resumo.ignorados += 1;
      else if (r?.criado) resumo.criados += 1;
      else resumo.existentes += 1;
      if (r?.credito?.status === 'pendente_vinculo') resumo.pendentes += 1;
      else if (r?.credito?.beneficiarioAlunoId) resumo.vinculadosAutomaticamente += 1;
      const metodo = r?.credito?.conciliacao?.metodo;
      if (metodo === 'fuzzy_automatico') resumo.fuzzyAutomaticos += 1;
      if (metodo === 'alias_confirmado') resumo.porAlias += 1;
    } catch (e) {
      resumo.erros += 1;
      console.error('[corrida-creditos/sync-item]', ins?._id, e?.message || e);
    }
  }
  return resumo;
}

module.exports = {
  EVENT_SLUG,
  PARENTESCO_ALUNO,
  CONCILIACAO,
  normalizarTexto,
  normalizarTurma,
  nomeComparavel,
  similaridadeNome,
  rankearCandidatos,
  scopeInstituicao,
  tenantFromActor,
  buscarAliasConfirmado,
  registrarAliasConfirmado,
  localizarAluno,
  sincronizarCreditoDaInscricao,
  revogarCreditoDaInscricao,
  sincronizarTodosConfirmados,
};
