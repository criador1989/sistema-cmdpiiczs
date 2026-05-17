'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Questao = require('../../models/Questao');
const QuestionarioTentativa = require('../../models/QuestionarioTentativa');
const { autenticar } = require('../../middleware/autenticacao');

const router = express.Router();

/* =========================
   HELPERS
========================= */

function calcularPerfilAdaptativo(tentativas) {
  const perfil = {
    totalTentativas: tentativas.length,
    mediaGeral: 0,
    ultimaNota: null,
    habilidadeMaisFraca: '',
    areaMaisFraca: '',
    dificuldadeAlvo: 'medio',
    recomendacao: ''
  };

  if (!tentativas.length) return perfil;

  const finalizadas = tentativas.filter(t => t.status === 'finalizado');

  const soma = finalizadas.reduce((s, t) => s + (Number(t.nota) || 0), 0);
  perfil.mediaGeral = finalizadas.length ? Math.round(soma / finalizadas.length) : 0;
  perfil.ultimaNota = finalizadas[0]?.nota || 0;

  if (perfil.mediaGeral >= 80) perfil.dificuldadeAlvo = 'dificil';
  else if (perfil.mediaGeral < 60) perfil.dificuldadeAlvo = 'facil';

  return perfil;
}

function toObjectIdSeValido(valor) {
  if (!valor) return valor;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  if (mongoose.Types.ObjectId.isValid(valor)) return new mongoose.Types.ObjectId(valor);
  return valor;
}

function normalizarTexto(v) {
  return String(v || '').trim();
}

function getUsuarioReq(req) {
  return req.usuario || null;
}

function getAlunoId(req) {
  const u = getUsuarioReq(req);
  return u?.alunoId || u?._id || u?.id || null;
}

function getUsuarioId(req) {
  const u = getUsuarioReq(req);
  return u?._id || u?.id || null;
}

function getTurmaId(req) {
  const u = getUsuarioReq(req);
  return u?.turma || u?.turmaId || null;
}

function getInstituicaoRaw(req) {
  const u = getUsuarioReq(req);

  return (
    req.instituicaoId ||
    req.tenantId ||
    u?.instituicao ||
    u?.instituicaoId ||
    req.tenantSlug ||
    req.query?.t ||
    req.query?.tenant ||
    null
  );
}

function getInstituicaoRawValue(v) {
  if (!v) return null;
  if (typeof v === 'object') {
    if (v._id) return v._id;
    if (v.id) return v.id;
    if (v.slug) return v.slug;
  }
  return v;
}

function buildInstituicaoMatch(instituicaoRaw) {
  const valor = getInstituicaoRawValue(instituicaoRaw);
  if (!valor) return null;

  const candidatos = [];
  const texto = String(valor).trim();

  if (texto) candidatos.push(texto);

  if (mongoose.Types.ObjectId.isValid(texto)) {
    candidatos.push(new mongoose.Types.ObjectId(texto));
  }

  return {
    $or: [
      { escopo: 'global' },
      { instituicao: { $in: candidatos } }
    ]
  };
}

function buildTentativaInstituicaoMatch(instituicaoRaw) {
  const valor = getInstituicaoRawValue(instituicaoRaw);
  if (!valor) return null;

  const candidatos = [];
  const texto = String(valor).trim();

  if (texto) candidatos.push(texto);

  if (mongoose.Types.ObjectId.isValid(texto)) {
    candidatos.push(new mongoose.Types.ObjectId(texto));
  }

  return { instituicao: { $in: candidatos } };
}

function isAdminLike(req) {
  const u = getUsuarioReq(req) || {};
  const role = String(u.tipo || u.perfil || u.role || u.cargo || '').toLowerCase();
  return role.includes('admin') || role.includes('coord') || role.includes('dire');
}

function respostaErro(res, status, erro, extra = {}) {
  return res.status(status).json({ ok: false, erro, ...extra });
}

function embaralhar(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function limitarNumero(v, padrao, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function montarTituloQuestionario({ tipo, area, disciplina, habilidadeFoco }) {
  if (tipo === 'diagnostico') return 'Diagnóstico inicial';
  if (tipo === 'revisao') {
    if (habilidadeFoco) return `Revisão inteligente: ${habilidadeFoco}`;
    return 'Revisão inteligente';
  }
  if (tipo === 'pre_simulado') return 'Pré-simulado';
  if (area && disciplina) return `Treino de ${disciplina}`;
  if (area) return `Treino de ${area}`;
  return 'Treino rápido';
}

function melhorEPior(obj) {
  const entries = Object.entries(obj).map(([nome, dados]) => ({
    nome,
    total: dados.total || 0,
    acertos: dados.acertos || 0,
    erros: dados.erros || 0,
    pctAcerto: dados.total ? dados.acertos / dados.total : 0,
    pctErro: dados.total ? dados.erros / dados.total : 0
  }));

  if (!entries.length) return { melhor: '', pior: '' };

  entries.sort((a, b) => b.pctAcerto - a.pctAcerto);

  return {
    melhor: entries[0]?.nome || '',
    pior: entries[entries.length - 1]?.nome || ''
  };
}

function montarListaErros(obj, chave) {
  return Object.entries(obj)
    .map(([nome, dados]) => ({
      [chave]: nome,
      quantidade: dados.erros || 0,
      total: dados.total || 0,
      percentualErro: dados.total ? Math.round((dados.erros / dados.total) * 100) : 0
    }))
    .filter((item) => item.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade || b.percentualErro - a.percentualErro)
    .slice(0, 8);
}

function calcularResumoDesempenho(questoesRespondidas) {
  const totalQuestoes = questoesRespondidas.length;
  const acertos = questoesRespondidas.filter(q => q.correta).length;
  const erros = totalQuestoes - acertos;
  const percentualAcerto = totalQuestoes ? Math.round((acertos / totalQuestoes) * 100) : 0;

  const porArea = {};
  const porHabilidade = {};

  for (const q of questoesRespondidas) {
    const area = q.area || 'Geral';
    const habilidade = q.habilidade || 'Geral';

    if (!porArea[area]) porArea[area] = { total: 0, acertos: 0, erros: 0 };
    porArea[area].total += 1;
    if (q.correta) porArea[area].acertos += 1;
    else porArea[area].erros += 1;

    if (!porHabilidade[habilidade]) porHabilidade[habilidade] = { total: 0, acertos: 0, erros: 0 };
    porHabilidade[habilidade].total += 1;
    if (q.correta) porHabilidade[habilidade].acertos += 1;
    else porHabilidade[habilidade].erros += 1;
  }

  const areas = melhorEPior(porArea);
  const habilidades = melhorEPior(porHabilidade);

  const errosPorHabilidade = montarListaErros(porHabilidade, 'habilidade');
  const errosPorArea = montarListaErros(porArea, 'area');

  const questoesParaReforco = questoesRespondidas
    .filter(q => !q.correta && q.questaoId)
    .map(q => ({
      questaoId: q.questaoId,
      habilidade: q.habilidade || '',
      area: q.area || '',
      tema: q.tema || '',
      motivo: 'erro_recente',
      respondidaCorretamenteDepois: false
    }))
    .slice(0, 10);

  let focoRecomendado = '';

  if (errosPorHabilidade[0]?.habilidade && errosPorHabilidade[0].habilidade !== 'Geral') {
    focoRecomendado = `Reforce a habilidade: ${errosPorHabilidade[0].habilidade}`;
  } else if (errosPorArea[0]?.area && errosPorArea[0].area !== 'Geral') {
    focoRecomendado = `Reforce a área: ${errosPorArea[0].area}`;
  } else if (percentualAcerto < 60) {
    focoRecomendado = 'Reforce os conteúdos básicos antes de avançar.';
  } else {
    focoRecomendado = 'Mantenha a rotina de treino e avance para questões mais desafiadoras.';
  }

  return {
    totalQuestoes,
    acertos,
    erros,
    percentualAcerto,
    areaMaisForte: areas.melhor,
    areaMaisFraca: areas.pior,
    habilidadeMaisForte: habilidades.melhor,
    habilidadeMaisFraca: habilidades.pior,
    focoRecomendado,
    errosPorHabilidade,
    errosPorArea,
    questoesParaReforco
  };
}

function limparQuestaoParaAluno(q) {
  return {
    _id: q._id,
    area: q.area,
    disciplina: q.disciplina,
    competencia: q.competencia,
    habilidade: q.habilidade,
    tema: q.tema,
    dificuldade: q.dificuldade,
    enunciado: q.enunciado,
    apoioTexto: q.apoioTexto || '',
    imagemUrl: q.imagemUrl || '',
    reforcoAplicado: Boolean(q.__reforcoAplicado),
    alternativas: Array.isArray(q.alternativas)
      ? q.alternativas.map(a => ({
          letra: a.letra,
          texto: a.texto
        }))
      : []
  };
}

function snapshotQuestao(q, ordem) {
  return {
    questaoId: q._id,
    area: q.area || '',
    disciplina: q.disciplina || '',
    competencia: q.competencia || '',
    habilidade: q.habilidade || '',
    tema: q.tema || '',
    dificuldade: q.dificuldade || 'medio',
    enunciadoSnapshot: q.enunciado || '',
    alternativasSnapshot: Array.isArray(q.alternativas)
      ? q.alternativas.map(a => ({
          letra: a.letra,
          texto: a.texto
        }))
      : [],
    gabarito: q.gabarito || '',
    respostaAluno: '',
    correta: false,
    tempoRespostaSegundos: 0,
    ordem,
    explicacaoSnapshot: q.explicacao || '',
    reforcoAplicado: Boolean(q.__reforcoAplicado)
  };
}

function extrairHabilidadeMaisFraca(tentativas) {
  const mapa = {};

  for (const tentativa of tentativas || []) {
    const lista = tentativa?.resumoDesempenho?.errosPorHabilidade || [];

    for (const item of lista) {
      const habilidade = item?.habilidade;
      if (!habilidade || habilidade === 'Geral') continue;

      if (!mapa[habilidade]) {
        mapa[habilidade] = { habilidade, quantidade: 0, total: 0, percentualErro: 0 };
      }

      mapa[habilidade].quantidade += Number(item.quantidade) || 0;
      mapa[habilidade].total += Number(item.total) || 0;
    }
  }

  const ordenadas = Object.values(mapa)
    .map(item => ({
      ...item,
      percentualErro: item.total ? Math.round((item.quantidade / item.total) * 100) : 0
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.percentualErro - a.percentualErro);

  return ordenadas[0]?.habilidade || '';
}

function extrairQuestoesErradasParaReforco(tentativas) {
  const mapa = new Map();

  const tentativasElegiveis = (tentativas || []).slice(1);

  for (const tentativa of tentativasElegiveis) {
    const questoes = tentativa.questoes || [];

    for (const q of questoes) {
      if (!q.questaoId) continue;

      const id = String(q.questaoId);

      if (!q.correta) {
        if (!mapa.has(id)) {
          mapa.set(id, {
            questaoId: q.questaoId,
            erros: 0,
            acertosDepois: 0
          });
        }

        mapa.get(id).erros += 1;
      } else if (mapa.has(id)) {
        mapa.get(id).acertosDepois += 1;
      }
    }
  }

  return Array.from(mapa.values())
    .filter(q => q.erros > q.acertosDepois)
    .sort((a, b) => b.erros - a.erros)
    .slice(0, 20);
}

/* =========================
   AUTH
========================= */

router.use(autenticar);

/* =========================
   GET /api/questionarios/resumo
========================= */

router.get('/resumo', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);

    if (!instituicaoRaw) return respostaErro(res, 400, 'Instituição não identificada.');
    if (!alunoId) return respostaErro(res, 400, 'Aluno não identificado.');

    const matchInstituicao = buildTentativaInstituicaoMatch(instituicaoRaw);
    if (!matchInstituicao) return respostaErro(res, 400, 'Instituição inválida.');

    const tentativas = await QuestionarioTentativa.find({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId),
      status: 'finalizado'
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const total = tentativas.length;
    const ultimo = tentativas[0] || null;

    let acertos = 0;
    let questoes = 0;

    const areas = {};
    const habilidades = {};

    for (const t of tentativas) {
      acertos += Number(t.acertos) || 0;
      questoes += Number(t.totalQuestoes) || 0;

      const areaFraca = t?.resumoDesempenho?.areaMaisFraca;
      if (areaFraca) areas[areaFraca] = (areas[areaFraca] || 0) + 1;

      const habilidadeFraca = t?.resumoDesempenho?.habilidadeMaisFraca;
      if (habilidadeFraca) habilidades[habilidadeFraca] = (habilidades[habilidadeFraca] || 0) + 1;
    }

    const mediaGeral = questoes ? Math.round((acertos / questoes) * 100) : 0;

    const areaMaisFraca = Object.entries(areas).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const habilidadeMaisFraca = Object.entries(habilidades).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    return res.json({
      ok: true,
      resumo: {
        totalQuestionarios: total,
        mediaGeral,
        ultimoDesempenho: ultimo?.resumoDesempenho?.percentualAcerto ?? null,
        ultimaNota: ultimo?.nota ?? null,
        areaMaisFraca: areaMaisFraca || ultimo?.resumoDesempenho?.areaMaisFraca || '',
        habilidadeMaisFraca: habilidadeMaisFraca || ultimo?.resumoDesempenho?.habilidadeMaisFraca || '',
        focoRecomendado: ultimo?.resumoDesempenho?.focoRecomendado || '',
        ultimoQuestionario: ultimo
          ? {
              _id: ultimo._id,
              titulo: ultimo.titulo,
              tipo: ultimo.tipo,
              area: ultimo.area,
              nota: ultimo.nota,
              percentualAcerto: ultimo?.resumoDesempenho?.percentualAcerto || 0,
              createdAt: ultimo.createdAt
            }
          : null
      }
    });
  } catch (error) {
    console.error('GET /api/questionarios/resumo:', error);
    return respostaErro(res, 500, 'Erro ao carregar resumo dos questionários.');
  }
});

/* =========================
   GET /api/questionarios/gerar
   Monta questionário dinâmico com reforço adaptativo
========================= */

router.get('/gerar', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const usuarioAlunoId = getUsuarioId(req);
    const turmaId = getTurmaId(req);

    if (!instituicaoRaw) return respostaErro(res, 400, 'Instituição não identificada.');
    if (!alunoId) return respostaErro(res, 400, 'Aluno não identificado.');

    const tipo = normalizarTexto(req.query.tipo) || 'treino';
    const area = normalizarTexto(req.query.area);
    const disciplina = normalizarTexto(req.query.disciplina);
    const habilidade = normalizarTexto(req.query.habilidade);
    const tema = normalizarTexto(req.query.tema);
    const dificuldade = normalizarTexto(req.query.dificuldade);
    const quantidade = limitarNumero(req.query.quantidade, tipo === 'diagnostico' ? 12 : 5, 3, 30);

    const matchQuestoesInstituicao = buildInstituicaoMatch(instituicaoRaw);
    const matchTentativaInstituicao = buildTentativaInstituicaoMatch(instituicaoRaw);

    if (!matchQuestoesInstituicao || !matchTentativaInstituicao) {
      return respostaErro(res, 400, 'Instituição inválida.');
    }

    const tentativasRecentes = await QuestionarioTentativa.find({
      ...matchTentativaInstituicao,
      aluno: toObjectIdSeValido(alunoId),
      status: 'finalizado'
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .catch(() => []);

    const perfil = calcularPerfilAdaptativo(tentativasRecentes);

    const habilidadeFocoAutomatica =
    habilidade ||
    perfil.habilidadeMaisFraca ||
    extrairHabilidadeMaisFraca(tentativasRecentes);
    const questoesErradasParaReforco = extrairQuestoesErradasParaReforco(tentativasRecentes);

    const filtroBase = {
      ...matchQuestoesInstituicao,
      ativa: true,
      publicada: true
    };

    if (area) filtroBase.area = area;
    if (disciplina) filtroBase.disciplina = disciplina;
    if (tema) filtroBase.tema = tema;
    const dificuldadeFinal =
  ['facil', 'medio', 'dificil'].includes(dificuldade)
    ? dificuldade
    : perfil.dificuldadeAlvo;

    const questoesRecentesIds = new Set();

    for (const tentativa of tentativasRecentes.slice(0, 3)) {
      for (const q of tentativa.questoes || []) {
        if (q.questaoId) questoesRecentesIds.add(String(q.questaoId));
      }
    }

    const idsReforco = questoesErradasParaReforco
      .map(item => item.questaoId)
      .filter(Boolean)
      .slice(0, Math.ceil(quantidade * 0.4));

    let questoesReforco = [];

    if (idsReforco.length) {
      questoesReforco = await Questao.find({
        ...filtroBase,
        _id: { $in: idsReforco }
      })
        .limit(Math.ceil(quantidade * 0.4))
        .lean();

      questoesReforco = questoesReforco.map(q => ({
        ...q,
        __reforcoAplicado: true
      }));
    }

    let questoesFoco = [];

    if (habilidadeFocoAutomatica) {
      questoesFoco = await Questao.find({
        ...filtroBase,
        habilidade: habilidadeFocoAutomatica,
        _id: { $nin: questoesReforco.map(q => q._id) }
      })
        .limit(200)
        .lean();

      questoesFoco = questoesFoco
        .filter(q => !questoesRecentesIds.has(String(q._id)))
        .map(q => ({
          ...q,
          __reforcoAplicado: tipo === 'revisao'
        }));
    }

    let questoesGerais = await Questao.find({
      ...filtroBase,
      ...(habilidade ? { habilidade } : {}),
      _id: {
        $nin: [
          ...questoesReforco.map(q => q._id),
          ...questoesFoco.map(q => q._id)
        ]
      }
    })
      .limit(300)
      .lean();

    questoesGerais = questoesGerais.filter(q => !questoesRecentesIds.has(String(q._id)));

    let selecionadas = [];

    if (tipo === 'diagnostico') {
      selecionadas = embaralhar([...questoesFoco, ...questoesGerais, ...questoesReforco]).slice(0, quantidade);
    } else if (tipo === 'revisao') {
      selecionadas = [
        ...embaralhar(questoesReforco).slice(0, Math.ceil(quantidade * 0.4)),
        ...embaralhar(questoesFoco).slice(0, Math.ceil(quantidade * 0.4))
      ];

      const faltam = quantidade - selecionadas.length;
      if (faltam > 0) {
        selecionadas = [
          ...selecionadas,
          ...embaralhar(questoesGerais).slice(0, faltam)
        ];
      }
    } else {
      selecionadas = [
        ...embaralhar(questoesReforco).slice(0, Math.ceil(quantidade * 0.25)),
        ...embaralhar(questoesFoco).slice(0, Math.ceil(quantidade * 0.35))
      ];

      const faltam = quantidade - selecionadas.length;
      if (faltam > 0) {
        selecionadas = [
          ...selecionadas,
          ...embaralhar(questoesGerais).slice(0, faltam)
        ];
      }
    }

    const idsUnicos = new Set();
    selecionadas = selecionadas.filter(q => {
      const id = String(q._id);
      if (idsUnicos.has(id)) return false;
      idsUnicos.add(id);
      return true;
    });

    if (selecionadas.length < quantidade) {
      const adicionais = await Questao.find({
        ...filtroBase,
        _id: { $nin: selecionadas.map(q => q._id) }
      })
        .limit(300)
        .lean();

      selecionadas = [
        ...selecionadas,
        ...embaralhar(adicionais).slice(0, quantidade - selecionadas.length)
      ];
    }

    if (!selecionadas.length) {
      return respostaErro(res, 404, 'Nenhuma questão disponível para esse filtro.');
    }

    selecionadas = selecionadas.slice(0, quantidade);

    const snapshots = selecionadas.map((q, index) => snapshotQuestao(q, index + 1));

    const titulo = montarTituloQuestionario({
      tipo,
      area,
      disciplina,
      habilidadeFoco: habilidadeFocoAutomatica
    });

    const tentativa = await QuestionarioTentativa.create({
      instituicao: getInstituicaoRawValue(instituicaoRaw),
      aluno: toObjectIdSeValido(alunoId),
      usuarioAluno: usuarioAlunoId ? toObjectIdSeValido(usuarioAlunoId) : null,
      turma: turmaId ? toObjectIdSeValido(turmaId) : null,
      tipo: ['diagnostico', 'treino', 'revisao', 'pre_simulado', 'personalizado'].includes(tipo) ? tipo : 'treino',
      titulo,
      descricao: habilidadeFocoAutomatica
        ? `Questionário montado com reforço na habilidade: ${habilidadeFocoAutomatica}.`
        : 'Questionário montado automaticamente pelo Axoriin.',
      area,
      disciplina,
      dificuldadePredominante: dificuldadeFinal || 'misto',
      origemMontagem: habilidadeFocoAutomatica || questoesReforco.length ? 'reforco_adaptativo' : 'banco',
      focoMontagem: habilidadeFocoAutomatica
        ? `Reforço adaptativo em ${habilidadeFocoAutomatica}`
        : '',
      habilidadeFoco: habilidadeFocoAutomatica || '',
      questoes: snapshots,
      totalQuestoes: snapshots.length,
      status: 'em_andamento',
      criadoPorMotor: true
    });

    return res.status(201).json({
      ok: true,
      tentativa: {
        _id: tentativa._id,
        titulo: tentativa.titulo,
        tipo: tentativa.tipo,
        area: tentativa.area,
        disciplina: tentativa.disciplina,
        totalQuestoes: tentativa.totalQuestoes,
        status: tentativa.status,
        origemMontagem: tentativa.origemMontagem,
        focoMontagem: tentativa.focoMontagem,
        habilidadeFoco: tentativa.habilidadeFoco,
        createdAt: tentativa.createdAt,
        questoes: selecionadas.map(limparQuestaoParaAluno),
        perfilAdaptativo: perfil
      }
    });
  } catch (error) {
    console.error('GET /api/questionarios/gerar:', error);
    return respostaErro(res, 500, 'Erro ao gerar questionário.');
  }
});

/* =========================
   POST /api/questionarios/:id/finalizar
========================= */

router.post('/:id/finalizar', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const tentativaId = req.params.id;

    if (!instituicaoRaw) return respostaErro(res, 400, 'Instituição não identificada.');
    if (!alunoId) return respostaErro(res, 400, 'Aluno não identificado.');
    if (!mongoose.Types.ObjectId.isValid(tentativaId)) return respostaErro(res, 400, 'ID inválido.');

    const respostas = Array.isArray(req.body?.respostas) ? req.body.respostas : [];
    const tempoTotalSegundos = Math.max(0, Number(req.body?.tempoTotalSegundos) || 0);

    const matchInstituicao = buildTentativaInstituicaoMatch(instituicaoRaw);

    const tentativa = await QuestionarioTentativa.findOne({
      _id: new mongoose.Types.ObjectId(tentativaId),
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    });

    if (!tentativa) {
      return respostaErro(res, 404, 'Questionário não encontrado.');
    }

    if (tentativa.status === 'finalizado') {
      return respostaErro(res, 400, 'Este questionário já foi finalizado.');
    }

    const mapaRespostas = new Map();

    for (const r of respostas) {
      if (!r?.questaoId) continue;
      mapaRespostas.set(String(r.questaoId), {
        respostaAluno: normalizarTexto(r.respostaAluno).toUpperCase(),
        tempoRespostaSegundos: Math.max(0, Number(r.tempoRespostaSegundos) || 0)
      });
    }

    const questoesAtualizadas = tentativa.questoes.map((q) => {
      const qObj = typeof q.toObject === 'function' ? q.toObject() : q;
      const resp = mapaRespostas.get(String(q.questaoId));
      const respostaAluno = resp?.respostaAluno || '';
      const correta = respostaAluno && respostaAluno === String(q.gabarito || '').toUpperCase();

      return {
        ...qObj,
        respostaAluno,
        correta: Boolean(correta),
        tempoRespostaSegundos: resp?.tempoRespostaSegundos || 0
      };
    });

    const resumo = calcularResumoDesempenho(questoesAtualizadas);
    const nota = resumo.totalQuestoes ? Math.round((resumo.acertos / resumo.totalQuestoes) * 100) : 0;

    tentativa.questoes = questoesAtualizadas;
    tentativa.totalQuestoes = resumo.totalQuestoes;
    tentativa.acertos = resumo.acertos;
    tentativa.erros = resumo.erros;
    tentativa.nota = nota;
    tentativa.tempoTotalSegundos = tempoTotalSegundos;
    tentativa.status = 'finalizado';
    tentativa.resumoDesempenho = resumo;
    tentativa.proximaSugestao = resumo.focoRecomendado;

    await tentativa.save();

    for (const q of questoesAtualizadas) {
      if (!q.questaoId) continue;

      await Questao.updateOne(
        { _id: q.questaoId },
        {
          $inc: {
            usoContador: 1,
            acertosContador: q.correta ? 1 : 0,
            errosContador: q.correta ? 0 : 1
          }
        }
      ).catch(() => null);
    }

    const tentativaFinal = await QuestionarioTentativa.findById(tentativa._id).lean();

    return res.json({
      ok: true,
      mensagem: 'Questionário finalizado com sucesso.',
      tentativa: tentativaFinal
    });
  } catch (error) {
    console.error('POST /api/questionarios/:id/finalizar:', error);
    return respostaErro(res, 500, 'Erro ao finalizar questionário.');
  }
});

/* =========================
   GET /api/questionarios/historico
========================= */

router.get('/historico', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);

    if (!instituicaoRaw) return respostaErro(res, 400, 'Instituição não identificada.');
    if (!alunoId) return respostaErro(res, 400, 'Aluno não identificado.');

    const matchInstituicao = buildTentativaInstituicaoMatch(instituicaoRaw);

    const historico = await QuestionarioTentativa.find({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select({
        titulo: 1,
        tipo: 1,
        area: 1,
        disciplina: 1,
        totalQuestoes: 1,
        acertos: 1,
        erros: 1,
        nota: 1,
        status: 1,
        resumoDesempenho: 1,
        tempoTotalSegundos: 1,
        origemMontagem: 1,
        focoMontagem: 1,
        habilidadeFoco: 1,
        createdAt: 1
      })
      .lean();

    return res.json({
      ok: true,
      historico: historico || []
    });
  } catch (error) {
    console.error('GET /api/questionarios/historico:', error);
    return respostaErro(res, 500, 'Erro ao carregar histórico de questionários.');
  }
});

/* =========================
   GET /api/questionarios/:id
========================= */

router.get('/:id', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const tentativaId = req.params.id;

    if (!instituicaoRaw) return respostaErro(res, 400, 'Instituição não identificada.');
    if (!alunoId) return respostaErro(res, 400, 'Aluno não identificado.');
    if (!mongoose.Types.ObjectId.isValid(tentativaId)) return respostaErro(res, 400, 'ID inválido.');

    const matchInstituicao = buildTentativaInstituicaoMatch(instituicaoRaw);

    const tentativa = await QuestionarioTentativa.findOne({
      _id: new mongoose.Types.ObjectId(tentativaId),
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    }).lean();

    if (!tentativa) {
      return respostaErro(res, 404, 'Questionário não encontrado.');
    }

    return res.json({
      ok: true,
      tentativa
    });
  } catch (error) {
    console.error('GET /api/questionarios/:id:', error);
    return respostaErro(res, 500, 'Erro ao carregar questionário.');
  }
});

/* =========================
   POST /api/questionarios/questoes
   Cadastro simples de questão admin/coord
========================= */

router.post('/questoes', async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    const usuario = getUsuarioReq(req);

    const {
      escopo = 'instituicao',
      area,
      disciplina,
      competencia,
      habilidade,
      tema,
      subtema,
      dificuldade,
      estilo,
      origem,
      anoReferencia,
      codigoOrigem,
      enunciado,
      apoioTexto,
      imagemUrl,
      alternativas,
      gabarito,
      explicacao,
      comentarioPedagogico,
      tags
    } = req.body || {};

    if (!normalizarTexto(area)) return respostaErro(res, 400, 'Área é obrigatória.');
    if (!normalizarTexto(enunciado)) return respostaErro(res, 400, 'Enunciado é obrigatório.');
    if (!Array.isArray(alternativas) || alternativas.length < 2) {
      return respostaErro(res, 400, 'Informe pelo menos 2 alternativas.');
    }
    if (!normalizarTexto(gabarito)) return respostaErro(res, 400, 'Gabarito é obrigatório.');

    const escopoFinal = escopo === 'global' ? 'global' : 'instituicao';

    if (escopoFinal === 'instituicao' && !instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    const questao = await Questao.create({
      instituicao: escopoFinal === 'global' ? null : getInstituicaoRawValue(instituicaoRaw),
      escopo: escopoFinal,
      area: normalizarTexto(area),
      disciplina: normalizarTexto(disciplina),
      competencia: normalizarTexto(competencia),
      habilidade: normalizarTexto(habilidade),
      tema: normalizarTexto(tema),
      subtema: normalizarTexto(subtema),
      dificuldade: ['facil', 'medio', 'dificil'].includes(dificuldade) ? dificuldade : 'medio',
      estilo: ['enem', 'enem_adaptado', 'autor', 'ia'].includes(estilo) ? estilo : 'enem',
      origem: ['enem', 'ia', 'autor'].includes(origem) ? origem : 'autor',
      anoReferencia: anoReferencia ? Number(anoReferencia) : null,
      codigoOrigem: normalizarTexto(codigoOrigem),
      enunciado: normalizarTexto(enunciado),
      apoioTexto: normalizarTexto(apoioTexto),
      imagemUrl: normalizarTexto(imagemUrl),
      alternativas: alternativas.map((a) => ({
        letra: normalizarTexto(a.letra).toUpperCase(),
        texto: normalizarTexto(a.texto)
      })),
      gabarito: normalizarTexto(gabarito).toUpperCase(),
      explicacao: normalizarTexto(explicacao),
      comentarioPedagogico: normalizarTexto(comentarioPedagogico),
      tags: Array.isArray(tags) ? tags.map(normalizarTexto).filter(Boolean) : [],
      criadoPor: usuario?._id || usuario?.id || null
    });

    return res.status(201).json({
      ok: true,
      mensagem: 'Questão cadastrada com sucesso.',
      questao
    });
  } catch (error) {
    console.error('POST /api/questionarios/questoes:', error);
    return respostaErro(res, 500, 'Erro ao cadastrar questão.');
  }
});

/* =========================
   GET /api/questionarios/questoes/listar
   Lista administrativa
========================= */

router.get('/questoes/listar', async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    if (!matchInstituicao) return respostaErro(res, 400, 'Instituição não identificada.');

    const filtro = {
      ...matchInstituicao
    };

    if (req.query.area) filtro.area = normalizarTexto(req.query.area);
    if (req.query.disciplina) filtro.disciplina = normalizarTexto(req.query.disciplina);
    if (req.query.dificuldade) filtro.dificuldade = normalizarTexto(req.query.dificuldade);
    if (req.query.origem) filtro.origem = normalizarTexto(req.query.origem);

    const questoes = await Questao.find(filtro)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      ok: true,
      questoes
    });
  } catch (error) {
    console.error('GET /api/questionarios/questoes/listar:', error);
    return respostaErro(res, 500, 'Erro ao listar questões.');
  }
});

module.exports = router;