'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const Questao = require('../../models/Questao');
const QuestionarioTentativa = require('../../models/QuestionarioTentativa');
const { autenticar } = require('../../middleware/autenticacao');
const { extrairSerie } = require('../../services/portalAlunoService');
const { selecionarQuestoesAdaptativas } = require('../../services/questionarioAdaptativoService');

const router = express.Router();

const LIMITE_DIARIO = 10;
const LIMITE_POR_LOCAL = 3;
const ANO_INICIAL = 6;
const LOCAIS_VALIDOS = new Set([
  'laboratorio',
  'biblioteca',
  'zoologico',
  'prefeitura',
  'museu',
  'praca',
  'escola-militar',
  'floresta'
]);

const DISCIPLINAS_POR_LOCAL = Object.freeze({
  laboratorio: ['Matemática', 'Ciências'],
  biblioteca: ['Língua Portuguesa', 'Língua Inglesa', 'Língua Espanhola'],
  zoologico: ['Ciências'],
  prefeitura: ['História', 'Geografia'],
  museu: ['História', 'Arte'],
  praca: [],
  'escola-militar': ['Educação Física', 'Ensino Religioso'],
  floresta: ['Ciências', 'Geografia']
});

const NOMES_LOCAIS = Object.freeze({
  laboratorio: 'Laboratório',
  biblioteca: 'Biblioteca',
  zoologico: 'Zoológico',
  prefeitura: 'Prefeitura',
  museu: 'Museu',
  praca: 'Praça Central',
  'escola-militar': 'Escola Militar',
  floresta: 'Floresta'
});

router.use(autenticar);

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function usuario(req) {
  return req.usuario || {};
}

function alunoId(req) {
  const u = usuario(req);
  return u.alunoId || u._id || u.id || null;
}

function usuarioId(req) {
  const u = usuario(req);
  return u._id || u.id || null;
}

function instituicaoRaw(req) {
  const u = usuario(req);
  return (
    req.instituicaoId ||
    req.tenantId ||
    u.instituicao ||
    u.instituicaoId ||
    u.tenantId ||
    req.tenantSlug ||
    req.query?.t ||
    req.query?.tenant ||
    null
  );
}

function valorMisto(valor) {
  if (!valor) return null;
  if (typeof valor === 'object') return valor._id || valor.id || valor.slug || null;
  return valor;
}

function candidatosMistos(valor) {
  const bruto = valorMisto(valor);
  const texto = normalizarTexto(bruto);
  if (!texto) return [];
  const candidatos = [texto];
  if (mongoose.Types.ObjectId.isValid(texto)) candidatos.push(new mongoose.Types.ObjectId(texto));
  return candidatos;
}

function primeiroValorPersistivel(valor) {
  const candidatos = candidatosMistos(valor);
  return candidatos.find((item) => item instanceof mongoose.Types.ObjectId) || candidatos[0] || null;
}

function filtroInstituicaoTentativa(req) {
  const candidatos = candidatosMistos(instituicaoRaw(req));
  return candidatos.length ? { instituicao: { $in: candidatos } } : null;
}

function filtroInstituicaoQuestao(req) {
  const candidatos = candidatosMistos(instituicaoRaw(req));
  if (!candidatos.length) return null;
  return {
    $or: [
      { escopo: 'global' },
      { instituicao: { $in: candidatos } }
    ]
  };
}

function filtroAluno(req) {
  const candidatos = candidatosMistos(alunoId(req));
  return candidatos.length ? { aluno: { $in: candidatos } } : null;
}

function idPersistivel(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  return mongoose.Types.ObjectId.isValid(texto)
    ? new mongoose.Types.ObjectId(texto)
    : texto;
}

function diaReferenciaAcre(data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Rio_Branco',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(data);
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function responderErro(res, status, mensagem, extra = {}) {
  return res.status(status).json({ ok: false, mensagem, erro: mensagem, ...extra });
}

function questaoPublica(snapshot) {
  return {
    _id: snapshot.questaoId,
    area: snapshot.area || '',
    disciplina: snapshot.disciplina || '',
    habilidade: snapshot.habilidade || '',
    tema: snapshot.tema || '',
    dificuldade: snapshot.dificuldade || 'medio',
    enunciado: snapshot.enunciadoSnapshot || '',
    apoioTexto: snapshot.apoioTextoSnapshot || '',
    imagemUrl: snapshot.imagemUrlSnapshot || '',
    reforcoAplicado: Boolean(snapshot.reforcoAplicado),
    alternativas: (snapshot.alternativasSnapshot || []).map((a) => ({
      letra: a.letra,
      texto: a.texto
    }))
  };
}

function snapshotQuestao(q, ordem) {
  const alternativasOriginais = (q.alternativas || []).map((a) => ({ letra: a.letra, texto: a.texto }));
  const textoCorreto = alternativasOriginais.find((a) => a.letra === q.gabarito)?.texto || '';
  const alternativasEmbaralhadas = [...alternativasOriginais];
  for (let i = alternativasEmbaralhadas.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [alternativasEmbaralhadas[i], alternativasEmbaralhadas[j]] = [alternativasEmbaralhadas[j], alternativasEmbaralhadas[i]];
  }
  const alternativasSnapshot = alternativasEmbaralhadas.map((a, index) => ({
    letra: String.fromCharCode(65 + index),
    texto: a.texto
  }));
  const gabarito = alternativasSnapshot.find((a) => a.texto === textoCorreto)?.letra || q.gabarito || '';

  return {
    questaoId: q._id,
    area: q.area || '',
    disciplina: q.disciplina || '',
    competencia: q.competencia || '',
    habilidade: q.habilidade || '',
    tema: q.tema || '',
    dificuldade: q.dificuldade || 'medio',
    enunciadoSnapshot: q.enunciado || '',
    apoioTextoSnapshot: q.apoioTexto || '',
    imagemUrlSnapshot: q.imagemUrl || '',
    alternativasSnapshot,
    gabarito,
    respostaAluno: '',
    correta: false,
    tempoRespostaSegundos: 0,
    ordem,
    explicacaoSnapshot: q.explicacao || '',
    reforcoAplicado: Boolean(q.__reforcoAplicado),
    respondidaEm: null
  };
}

function melhorEPior(mapa) {
  const itens = Object.entries(mapa)
    .map(([nome, dados]) => ({ nome, ...dados, taxa: dados.total ? dados.acertos / dados.total : 0 }))
    .sort((a, b) => b.taxa - a.taxa);
  return { melhor: itens[0]?.nome || '', pior: itens.at(-1)?.nome || '' };
}

function resumoDesempenho(questoes) {
  const respondidas = (questoes || []).filter((q) => Boolean(q.respostaAluno));
  const totalQuestoes = respondidas.length;
  const acertos = respondidas.filter((q) => q.correta).length;
  const erros = totalQuestoes - acertos;
  const porArea = {};
  const porHabilidade = {};

  for (const q of respondidas) {
    const area = q.area || 'Geral';
    const habilidade = q.habilidade || 'Geral';
    if (!porArea[area]) porArea[area] = { total: 0, acertos: 0, erros: 0 };
    if (!porHabilidade[habilidade]) porHabilidade[habilidade] = { total: 0, acertos: 0, erros: 0 };
    for (const alvo of [porArea[area], porHabilidade[habilidade]]) {
      alvo.total += 1;
      if (q.correta) alvo.acertos += 1;
      else alvo.erros += 1;
    }
  }

  const areas = melhorEPior(porArea);
  const habilidades = melhorEPior(porHabilidade);
  const errosPorArea = Object.entries(porArea)
    .filter(([, d]) => d.erros > 0)
    .map(([area, d]) => ({ area, quantidade: d.erros, total: d.total, percentualErro: Math.round((d.erros / d.total) * 100) }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);
  const errosPorHabilidade = Object.entries(porHabilidade)
    .filter(([, d]) => d.erros > 0)
    .map(([habilidade, d]) => ({ habilidade, quantidade: d.erros, total: d.total, percentualErro: Math.round((d.erros / d.total) * 100) }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  const focoRecomendado = errosPorHabilidade[0]?.habilidade
    ? `Reforce a habilidade: ${errosPorHabilidade[0].habilidade}`
    : errosPorArea[0]?.area
      ? `Reforce a área: ${errosPorArea[0].area}`
      : 'Continue praticando diariamente para consolidar a aprendizagem.';

  return {
    totalQuestoes,
    acertos,
    erros,
    percentualAcerto: totalQuestoes ? Math.round((acertos / totalQuestoes) * 100) : 0,
    areaMaisForte: areas.melhor,
    areaMaisFraca: areas.pior,
    habilidadeMaisForte: habilidades.melhor,
    habilidadeMaisFraca: habilidades.pior,
    focoRecomendado,
    errosPorHabilidade,
    errosPorArea,
    questoesParaReforco: respondidas
      .filter((q) => !q.correta && q.questaoId)
      .map((q) => ({
        questaoId: q.questaoId,
        habilidade: q.habilidade || '',
        area: q.area || '',
        tema: q.tema || '',
        motivo: 'erro_recente',
        respondidaCorretamenteDepois: false
      }))
      .slice(0, 10)
  };
}

function recompensas(resumo) {
  const total = resumo.totalQuestoes;
  const acertos = resumo.acertos;
  return {
    pontos: acertos * 100,
    xpGanho: acertos * 40 + total * 10,
    moedasGanhas: acertos * 10 + (total > 0 && acertos === total ? 20 : 0)
  };
}

function respostaResultado(tentativa) {
  return {
    tentativaId: tentativa._id,
    missaoId: String(tentativa._id),
    missaoTitulo: tentativa.titulo,
    localId: tentativa.localId,
    localNome: NOMES_LOCAIS[tentativa.localId] || 'Arena',
    medalha: tentativa.medalha || 'Explorador Curioso',
    acertos: tentativa.acertos || 0,
    total: tentativa.totalQuestoes || 0,
    pontos: tentativa.pontosGanhos || 0,
    xpGanho: tentativa.xpGanho || 0,
    moedasGanhas: tentativa.moedasGanhas || 0,
    nota: tentativa.nota || 0,
    focoRecomendado: tentativa.proximaSugestao || ''
  };
}

async function obterAluno(req) {
  const id = alunoId(req);
  if (!id) return null;
  const candidatos = candidatosMistos(id);
  if (!candidatos.length) return null;
  const inst = candidatosMistos(instituicaoRaw(req));
  const filtro = { _id: { $in: candidatos } };
  if (inst.length) filtro.$or = [{ instituicao: { $in: inst } }, { tenantId: { $in: inst } }];
  return Aluno.findOne(filtro).select('_id nome turma instituicao tenantId ativo').lean();
}

async function tentativasDoDia(req, dia) {
  const inst = filtroInstituicaoTentativa(req);
  const aluno = filtroAluno(req);
  if (!inst || !aluno) return [];
  return QuestionarioTentativa.find({
    ...inst,
    ...aluno,
    origemExperiencia: 'arena_diaria',
    diaReferencia: dia,
    status: { $in: ['em_andamento', 'finalizado'] }
  }).sort({ createdAt: 1 });
}

function contarRespondidas(tentativas) {
  return (tentativas || []).reduce(
    (total, tentativa) => total + (tentativa.questoes || []).filter((q) => Boolean(q.respostaAluno)).length,
    0
  );
}

async function progressoCompleto(req) {
  const dia = diaReferenciaAcre();
  const tentativas = await tentativasDoDia(req, dia);
  const respondidasHoje = Math.min(LIMITE_DIARIO, contarRespondidas(tentativas));
  const finalizadas = tentativas.filter((t) => t.status === 'finalizado');
  const xpHoje = finalizadas.reduce((s, t) => s + (Number(t.xpGanho) || 0), 0);
  const moedasHoje = finalizadas.reduce((s, t) => s + (Number(t.moedasGanhas) || 0), 0);

  const inst = filtroInstituicaoTentativa(req);
  const aluno = filtroAluno(req);
  const geral = inst && aluno
    ? await QuestionarioTentativa.aggregate([
        { $match: { ...inst, ...aluno, origemExperiencia: 'arena_diaria', status: 'finalizado' } },
        { $group: { _id: null, xp: { $sum: '$xpGanho' }, moedas: { $sum: '$moedasGanhas' }, missoes: { $sum: 1 } } }
      ]).then((r) => r[0] || {}).catch(() => ({}))
    : {};

  return {
    data: dia,
    respondidasHoje,
    limite: LIMITE_DIARIO,
    restantesHoje: Math.max(0, LIMITE_DIARIO - respondidasHoje),
    xpHoje,
    moedasHoje,
    locais: tentativas.map((t) => ({
      tentativaId: t._id,
      localId: t.localId,
      status: t.status,
      respondidas: (t.questoes || []).filter((q) => Boolean(q.respostaAluno)).length,
      total: t.totalQuestoes
    })),
    jogador: {
      nivel: 1 + Math.floor((Number(geral.xp) || 0) / 1000),
      xp: (Number(geral.xp) || 0) % 1000,
      xpTotal: Number(geral.xp) || 0,
      xpProximoNivel: 1000,
      moedas: Number(geral.moedas) || 0,
      missoesConcluidas: Number(geral.missoes) || 0
    }
  };
}

async function finalizarTentativa(tentativa) {
  if (tentativa.status === 'finalizado') return tentativa;
  const naoRespondidas = (tentativa.questoes || []).filter((q) => !q.respostaAluno);
  if (naoRespondidas.length) return null;

  const resumo = resumoDesempenho(tentativa.questoes);
  const premios = recompensas(resumo);
  tentativa.totalQuestoes = resumo.totalQuestoes;
  tentativa.acertos = resumo.acertos;
  tentativa.erros = resumo.erros;
  tentativa.nota = resumo.percentualAcerto;
  tentativa.status = 'finalizado';
  tentativa.resumoDesempenho = resumo;
  tentativa.proximaSugestao = resumo.focoRecomendado;
  tentativa.pontosGanhos = premios.pontos;
  tentativa.xpGanho = premios.xpGanho;
  tentativa.moedasGanhas = premios.moedasGanhas;
  tentativa.tempoTotalSegundos = (tentativa.questoes || []).reduce(
    (s, q) => s + (Number(q.tempoRespostaSegundos) || 0),
    0
  );
  await tentativa.save();
  return tentativa;
}

router.get('/progresso', async (req, res) => {
  try {
    if (!instituicaoRaw(req) || !alunoId(req)) {
      return responderErro(res, 400, 'Instituição ou aluno não identificado.');
    }
    const progresso = await progressoCompleto(req);
    return res.json({ ok: true, progressoDiario: progresso, jogador: progresso.jogador });
  } catch (error) {
    console.error('GET /api/questionarios/arena/progresso:', error);
    return responderErro(res, 500, 'Não foi possível carregar o progresso diário da Arena.');
  }
});

router.get('/gerar', async (req, res) => {
  try {
    const localId = normalizarTexto(req.query.localId).toLowerCase();
    if (!LOCAIS_VALIDOS.has(localId)) return responderErro(res, 400, 'Local da Arena inválido.');
    if (!instituicaoRaw(req) || !alunoId(req)) return responderErro(res, 400, 'Instituição ou aluno não identificado.');

    const aluno = await obterAluno(req);
    if (!aluno || aluno.ativo === false) return responderErro(res, 404, 'Aluno não encontrado ou inativo.');
    const anoEscolar = extrairSerie(aluno.turma);
    if (anoEscolar !== ANO_INICIAL) {
      return responderErro(res, 403, 'Nesta primeira versão, as missões com questões estão liberadas somente para o 6º ano.', { anoEscolar });
    }

    const dia = diaReferenciaAcre();
    let tentativasHoje = await tentativasDoDia(req, dia);
    let existente = tentativasHoje.find((t) => t.localId === localId && t.status === 'em_andamento');

    if (existente) {
      const pendentes = existente.questoes.filter((q) => !q.respostaAluno).map(questaoPublica);
      if (pendentes.length) {
        const progresso = await progressoCompleto(req);
        return res.json({
          ok: true,
          retomada: true,
          tentativa: {
            _id: existente._id,
            titulo: existente.titulo,
            localId,
            totalQuestoes: existente.totalQuestoes,
            questoes: pendentes
          },
          progressoDiario: progresso
        });
      }
      existente = await finalizarTentativa(existente);
      tentativasHoje = await tentativasDoDia(req, dia);
    }

    const respondidasHoje = contarRespondidas(tentativasHoje);
    const restantesHoje = Math.max(0, LIMITE_DIARIO - respondidasHoje);
    if (restantesHoje <= 0) {
      return responderErro(res, 409, 'Você já concluiu as 10 questões liberadas para hoje.', {
        progressoDiario: { data: dia, respondidasHoje: LIMITE_DIARIO, limite: LIMITE_DIARIO, restantesHoje: 0 }
      });
    }

    const quantidade = Math.min(LIMITE_POR_LOCAL, restantesHoje);
    const instQuestoes = filtroInstituicaoQuestao(req);
    const filtro = {
      ...instQuestoes,
      ativa: true,
      publicada: true,
      anoEscolar: ANO_INICIAL
    };
    const disciplinas = DISCIPLINAS_POR_LOCAL[localId] || [];
    if (localId === 'praca') {
      // A praça funciona como desafio misto para completar a meta diária.
    } else {
      filtro.$and = [
        { $or: [{ localId }, { disciplina: { $in: disciplinas } }] },
        { disciplina: { $in: disciplinas } }
      ];
    }

    const candidatas = await Questao.find(filtro).limit(2500).lean();
    if (!candidatas.length) {
      return responderErro(res, 404, 'Ainda não há questões publicadas para este local. Importe o banco inicial do 6º ano.');
    }

    const instTentativa = filtroInstituicaoTentativa(req);
    const alunoFiltro = filtroAluno(req);
    const recentes = await QuestionarioTentativa.find({
      ...instTentativa,
      ...alunoFiltro,
      origemExperiencia: 'arena_diaria',
      status: 'finalizado'
    }).sort({ createdAt: -1 }).limit(20).lean();

    const idsRecentes = recentes.flatMap((t) => (t.questoes || []).map((q) => String(q.questaoId || '')).filter(Boolean));
    const idsReforco = recentes
      .flatMap((t) => t.questoes || [])
      .filter((q) => q.questaoId && q.respostaAluno && !q.correta)
      .map((q) => q.questaoId);

    const montagem = selecionarQuestoesAdaptativas({
      questoes: candidatas,
      tentativasRecentes: recentes,
      quantidade,
      tipo: 'treino',
      idsReforco,
      idsRecentes
    });

    if (!montagem.selecionadas.length) return responderErro(res, 404, 'Não foi possível montar a missão com as questões disponíveis.');

    const snapshots = montagem.selecionadas.map((q, index) => snapshotQuestao(q, index + 1));
    const tentativa = await QuestionarioTentativa.create({
      instituicao: primeiroValorPersistivel(instituicaoRaw(req)),
      aluno: idPersistivel(aluno._id || alunoId(req)),
      usuarioAluno: idPersistivel(usuarioId(req)),
      turma: aluno.turma || null,
      tipo: 'treino',
      titulo: `Missão diária — ${NOMES_LOCAIS[localId]}`,
      descricao: `Questões do ${ANO_INICIAL}º ano selecionadas para o cenário ${NOMES_LOCAIS[localId]}.`,
      area: localId === 'praca' ? 'Desafio misto' : disciplinas.join(', '),
      disciplina: disciplinas.join(', '),
      dificuldadePredominante: montagem.dificuldadeAlvo || 'misto',
      origemMontagem: idsReforco.length ? 'reforco_adaptativo' : 'banco',
      focoMontagem: 'Arena do Conhecimento — prática diária',
      questoes: snapshots,
      totalQuestoes: snapshots.length,
      status: 'em_andamento',
      criadoPorMotor: true,
      origemExperiencia: 'arena_diaria',
      diaReferencia: dia,
      localId,
      anoEscolar: ANO_INICIAL,
      medalha: 'Explorador Curioso'
    });

    const progresso = await progressoCompleto(req);
    return res.status(201).json({
      ok: true,
      retomada: false,
      tentativa: {
        _id: tentativa._id,
        titulo: tentativa.titulo,
        localId,
        totalQuestoes: tentativa.totalQuestoes,
        questoes: snapshots.map(questaoPublica),
        dificuldadePredominante: tentativa.dificuldadePredominante
      },
      progressoDiario: progresso
    });
  } catch (error) {
    console.error('GET /api/questionarios/arena/gerar:', error);
    return responderErro(res, 500, 'Não foi possível gerar a missão diária da Arena.');
  }
});

router.post('/:id/responder', async (req, res) => {
  try {
    const tentativaId = normalizarTexto(req.params.id);
    const questaoId = normalizarTexto(req.body?.questaoId);
    const respostaAluno = normalizarTexto(req.body?.respostaAluno).toUpperCase();
    const tempoRespostaSegundos = Math.max(0, Math.min(900, Number(req.body?.tempoRespostaSegundos) || 0));

    if (!mongoose.Types.ObjectId.isValid(tentativaId) || !mongoose.Types.ObjectId.isValid(questaoId)) {
      return responderErro(res, 400, 'Identificador da tentativa ou da questão inválido.');
    }
    if (!['A', 'B', 'C', 'D', 'E'].includes(respostaAluno)) return responderErro(res, 400, 'Alternativa inválida.');

    const inst = filtroInstituicaoTentativa(req);
    const aluno = filtroAluno(req);
    if (!inst || !aluno) return responderErro(res, 400, 'Instituição ou aluno não identificado.');

    const tentativa = await QuestionarioTentativa.findOne({
      _id: new mongoose.Types.ObjectId(tentativaId),
      ...inst,
      ...aluno,
      origemExperiencia: 'arena_diaria',
      status: { $in: ['em_andamento', 'finalizado'] }
    });
    if (!tentativa) return responderErro(res, 404, 'Missão não encontrada.');

    const questao = tentativa.questoes.find((q) => String(q.questaoId) === questaoId);
    if (!questao) return responderErro(res, 404, 'Questão não pertence a esta missão.');

    if (questao.respostaAluno) {
      const progresso = await progressoCompleto(req);
      return res.json({
        ok: true,
        repetida: true,
        correta: Boolean(questao.correta),
        respostaCorreta: questao.gabarito,
        explicacao: questao.explicacaoSnapshot || '',
        progressoDiario: progresso,
        concluida: tentativa.status === 'finalizado',
        resultado: tentativa.status === 'finalizado' ? respostaResultado(tentativa) : null
      });
    }

    const letrasValidas = new Set((questao.alternativasSnapshot || []).map((a) => a.letra));
    if (!letrasValidas.has(respostaAluno)) return responderErro(res, 400, 'A alternativa informada não existe nesta questão.');

    questao.respostaAluno = respostaAluno;
    questao.correta = respostaAluno === String(questao.gabarito || '').toUpperCase();
    questao.tempoRespostaSegundos = tempoRespostaSegundos;
    questao.respondidaEm = new Date();
    await tentativa.save();

    await Questao.updateOne(
      { _id: questao.questaoId },
      {
        $inc: {
          usoContador: 1,
          acertosContador: questao.correta ? 1 : 0,
          errosContador: questao.correta ? 0 : 1
        }
      }
    ).catch(() => null);

    const todasRespondidas = tentativa.questoes.every((q) => Boolean(q.respostaAluno));
    const tentativaFinal = todasRespondidas ? await finalizarTentativa(tentativa) : tentativa;
    const progresso = await progressoCompleto(req);

    return res.json({
      ok: true,
      correta: Boolean(questao.correta),
      respostaCorreta: questao.gabarito,
      explicacao: questao.explicacaoSnapshot || '',
      respondidasNaMissao: tentativa.questoes.filter((q) => Boolean(q.respostaAluno)).length,
      totalNaMissao: tentativa.totalQuestoes,
      progressoDiario: progresso,
      concluida: Boolean(tentativaFinal && tentativaFinal.status === 'finalizado'),
      resultado: tentativaFinal && tentativaFinal.status === 'finalizado' ? respostaResultado(tentativaFinal) : null
    });
  } catch (error) {
    console.error('POST /api/questionarios/arena/:id/responder:', error);
    return responderErro(res, 500, 'Não foi possível registrar a resposta.');
  }
});

router.post('/:id/finalizar', async (req, res) => {
  try {
    const tentativaId = normalizarTexto(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(tentativaId)) return responderErro(res, 400, 'Identificador da missão inválido.');
    const inst = filtroInstituicaoTentativa(req);
    const aluno = filtroAluno(req);
    if (!inst || !aluno) return responderErro(res, 400, 'Instituição ou aluno não identificado.');

    const tentativa = await QuestionarioTentativa.findOne({
      _id: new mongoose.Types.ObjectId(tentativaId),
      ...inst,
      ...aluno,
      origemExperiencia: 'arena_diaria'
    });
    if (!tentativa) return responderErro(res, 404, 'Missão não encontrada.');

    const finalizada = await finalizarTentativa(tentativa);
    if (!finalizada) return responderErro(res, 409, 'Responda todas as questões antes de concluir a missão.');
    const progresso = await progressoCompleto(req);
    return res.json({ ok: true, resultado: respostaResultado(finalizada), progressoDiario: progresso });
  } catch (error) {
    console.error('POST /api/questionarios/arena/:id/finalizar:', error);
    return responderErro(res, 500, 'Não foi possível concluir a missão.');
  }
});

module.exports = router;
