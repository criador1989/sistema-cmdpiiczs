'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

/* =========================================
   MAPA DE PRIORIDADE POR SÉRIE
========================================= */
const SERIE_PESO_MAP = {
  '3ª Série': 7,
  '2ª Série': 6,
  '1ª Série': 5,
  '9º Ano': 4,
  '8º Ano': 3,
  '7º Ano': 2,
  '6º Ano': 1
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferSerieFromTurma(turma = '') {
  const n = normalizeText(turma);

  if (!n) return '';

  if (
    /^3[ºoªa]?[a-z]\b/.test(n) ||
    /^3[ºoªa]?\s+[a-z]\b/.test(n) ||
    /(^|\b)3\s*(serie|ser|s)\b/.test(n) ||
    /(^|\b)3\s*(em|ensino medio)\b/.test(n)
  ) return '3ª Série';

  if (
    /^2[ºoªa]?[a-z]\b/.test(n) ||
    /^2[ºoªa]?\s+[a-z]\b/.test(n) ||
    /(^|\b)2\s*(serie|ser|s)\b/.test(n) ||
    /(^|\b)2\s*(em|ensino medio)\b/.test(n)
  ) return '2ª Série';

  if (
    /^1[ºoªa]?[a-z]\b/.test(n) ||
    /^1[ºoªa]?\s+[a-z]\b/.test(n) ||
    /(^|\b)1\s*(serie|ser|s)\b/.test(n) ||
    /(^|\b)1\s*(em|ensino medio)\b/.test(n)
  ) return '1ª Série';

  if (/^9[ºo]?[a-z]\b/.test(n) || /^9[ºo]?\s+[a-z]\b/.test(n) || /(^|\b)9\s*ano\b/.test(n)) return '9º Ano';
  if (/^8[ºo]?[a-z]\b/.test(n) || /^8[ºo]?\s+[a-z]\b/.test(n) || /(^|\b)8\s*ano\b/.test(n)) return '8º Ano';
  if (/^7[ºo]?[a-z]\b/.test(n) || /^7[ºo]?\s+[a-z]\b/.test(n) || /(^|\b)7\s*ano\b/.test(n)) return '7º Ano';
  if (/^6[ºo]?[a-z]\b/.test(n) || /^6[ºo]?\s+[a-z]\b/.test(n) || /(^|\b)6\s*ano\b/.test(n)) return '6º Ano';

  return '';
}

function getSeriePrioridade(serie) {
  return SERIE_PESO_MAP[String(serie || '').trim()] || 0;
}

function getInstituicaoIdFromReq(req) {
  const raw =
    req?.usuario?.instituicao ||
    req?.usuario?.instituicaoId ||
    req?.tenant?._id ||
    req?.tenantId ||
    req?.instituicao?._id ||
    req?.instituicao ||
    null;

  if (!raw) return null;

  try {
    if (raw instanceof mongoose.Types.ObjectId) return raw;
    if (typeof raw === 'object' && raw._id) return raw._id;
    return new mongoose.Types.ObjectId(String(raw));
  } catch {
    return null;
  }
}

function getFaixa(nota) {
  const n = toNumber(nota, 0);

  if (n >= 9.5) return 'Excepcional';
  if (n >= 8.5) return 'Ótimo';
  if (n >= 7) return 'Bom';
  if (n >= 5) return 'Regular';
  if (n >= 3) return 'Insuficiente';
  return 'Incompatível';
}

function getFotoUrl(aluno) {
  return (
    aluno?.fotoThumb ||
    aluno?.fotoOriginal ||
    aluno?.foto ||
    aluno?.fotoMedium ||
    ''
  );
}

function classifyNotificacao(doc = {}) {
  const tipo = normalizeText(doc?.tipo);
  const categoria = normalizeText(doc?.categoria);
  const natureza = normalizeText(doc?.natureza);
  const classificacao = normalizeText(doc?.classificacao);
  const descricao = normalizeText(doc?.descricao);
  const titulo = normalizeText(doc?.titulo);
  const motivo = normalizeText(doc?.motivo);

  const bag = [tipo, categoria, natureza, classificacao, descricao, titulo, motivo]
    .filter(Boolean)
    .join(' ');

  const isElogio =
    /\belogio\b/.test(bag) ||
    /\bpositiv[ao]\b/.test(bag) ||
    /\bmerito\b/.test(bag) ||
    /\breconhecimento\b/.test(bag) ||
    /\bparaben/.test(bag);

  const isAto =
    /\bato\b/.test(bag) && /\bindisciplin/.test(bag);

  const isNegativa =
    /\bnegativ[ao]\b/.test(bag) ||
    /\bindisciplin/.test(bag) ||
    /\bocorrenc/.test(bag) ||
    /\badvertenc/.test(bag) ||
    /\bsuspens/.test(bag) ||
    /\bdescumpr/.test(bag) ||
    /\bfalta\b/.test(bag);

  return {
    elogio: isElogio,
    ato: isAto,
    negativa: isNegativa && !isElogio
  };
}

async function getNotificationStatsByAlunoIds(alunoIds, instituicaoId) {
  if (!Array.isArray(alunoIds) || alunoIds.length === 0) {
    return new Map();
  }

  const ids = alunoIds
    .filter(Boolean)
    .map((id) => {
      try {
        return id instanceof mongoose.Types.ObjectId
          ? id
          : new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (ids.length === 0) {
    return new Map();
  }

  const match = {
    $or: [
      { aluno: { $in: ids } },
      { alunoId: { $in: ids } }
    ]
  };

  const instituicaoObj =
    instituicaoId instanceof mongoose.Types.ObjectId
      ? instituicaoId
      : (() => {
          try {
            return new mongoose.Types.ObjectId(String(instituicaoId));
          } catch {
            return null;
          }
        })();

  if (instituicaoObj) {
    match.$and = [
      {
        $or: [
          { instituicao: instituicaoObj },
          { instituicaoId: instituicaoObj },
          { instituicao: { $exists: false }, instituicaoId: { $exists: false } }
        ]
      }
    ];
  }

  const notificacoes = await Notificacao.find(match)
    .select('aluno alunoId tipo categoria natureza classificacao descricao titulo motivo')
    .lean();

  const statsMap = new Map();

  for (const doc of notificacoes) {
    const refAluno = doc?.aluno || doc?.alunoId || '';
    const key = String(refAluno);
    if (!key) continue;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        elogios: 0,
        atosIndisciplina: 0,
        notificacoesNegativas: 0
      });
    }

    const acc = statsMap.get(key);
    const cls = classifyNotificacao(doc);

    if (cls.elogio) acc.elogios += 1;
    if (cls.ato) acc.atosIndisciplina += 1;
    if (cls.negativa) acc.notificacoesNegativas += 1;
  }

  return statsMap;
}

function buildAlunoRanking(aluno, { priorizarSerie, rebaixarNegativas }) {
  const turma = String(aluno?.turma || '').trim();
  const serie = inferSerieFromTurma(turma);
  const notaComportamental = Number(toNumber(aluno?.comportamento, 8).toFixed(2));
  const elogios = toNumber(aluno?.elogios, 0);
  const atosIndisciplina = toNumber(aluno?.atosIndisciplina, 0);
  const notificacoesNegativas = toNumber(aluno?.notificacoesNegativas, 0);
  const seriePrioridade = getSeriePrioridade(serie);
  const faixa = getFaixa(notaComportamental);

  const scoreFinal =
    (notaComportamental * 1000) +
    (elogios * 20) -
    (atosIndisciplina * 40) +
    (priorizarSerie ? (seriePrioridade * 100) : 0) -
    (rebaixarNegativas ? (notificacoesNegativas * 80) : 0);

  return {
    _id: aluno._id,
    nome: String(aluno?.nome || '').trim(),
    nomeNormalizado: normalizeText(aluno?.nome),
    serie,
    turma,
    dataEntrada: aluno?.dataEntrada || null,
    fotoUrl: getFotoUrl(aluno),
    notaComportamental,
    elogios,
    atosIndisciplina,
    notificacoesNegativas,
    seriePrioridade,
    faixa,
    scoreFinal
  };
}

function compareAlunos(a, b, ordenar = 'scoreFinal', direcao = 'desc') {
  const dir = direcao === 'asc' ? 1 : -1;

  const cmpString = (v1, v2) =>
    String(v1 || '').localeCompare(String(v2 || ''), 'pt-BR', { sensitivity: 'base' });

  const cmpNumber = (v1, v2) => (toNumber(v1, 0) - toNumber(v2, 0));

  const sorters = {
    nome: () =>
      cmpString(a.nomeNormalizado, b.nomeNormalizado) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) ||
      cmpString(String(a._id), String(b._id)),

    elogios: () =>
      cmpNumber(a.elogios, b.elogios) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id)),

    notificacoesNegativas: () =>
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id)),

    atosIndisciplina: () =>
      cmpNumber(a.atosIndisciplina, b.atosIndisciplina) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id)),

    seriePrioridade: () =>
      cmpNumber(a.seriePrioridade, b.seriePrioridade) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id)),

    notaComportamental: () =>
      cmpNumber(a.notaComportamental, b.notaComportamental) * dir ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id)),

    scoreFinal: () =>
      cmpNumber(a.scoreFinal, b.scoreFinal) * dir ||
      cmpNumber(b.notaComportamental, a.notaComportamental) ||
      cmpNumber(b.seriePrioridade, a.seriePrioridade) ||
      cmpNumber(b.elogios, a.elogios) ||
      cmpNumber(a.notificacoesNegativas, b.notificacoesNegativas) ||
      cmpString(a.nomeNormalizado, b.nomeNormalizado) ||
      cmpString(String(a._id), String(b._id))
  };

  return (sorters[ordenar] || sorters.scoreFinal)();
}

/* =========================================
   GET /api/ranking-alunos/turmas
========================================= */
router.get('/turmas', async (req, res) => {
  try {
    const instituicaoId = getInstituicaoIdFromReq(req);

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        message: 'Instituição não identificada no usuário autenticado.'
      });
    }

    const rows = await Aluno.find({
      instituicao: instituicaoId,
      turma: { $exists: true, $nin: [null, ''] }
    })
      .select('turma')
      .lean();

    const unicas = Array.from(
      new Set(
        rows
          .map((r) => String(r.turma || '').trim())
          .filter(Boolean)
      )
    );

    unicas.sort((a, b) => {
      const na = normalizeText(a);
      const nb = normalizeText(b);

      const numA = parseInt(na, 10);
      const numB = parseInt(nb, 10);

      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
        return numA - numB;
      }

      return na.localeCompare(nb, 'pt-BR');
    });

    return res.json({
      ok: true,
      turmas: unicas
    });
  } catch (error) {
    console.error('❌ Erro ao listar turmas do ranking:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao listar turmas.'
    });
  }
});

/* =========================================
   GET /api/ranking-alunos
========================================= */
router.get('/', async (req, res) => {
  try {
    const instituicaoId = getInstituicaoIdFromReq(req);

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        message: 'Instituição não identificada no usuário autenticado.'
      });
    }

    const {
      busca = '',
      turma = '',
      notaMin = '',
      notaMax = '',
      faixa = '',
      ordenar = 'scoreFinal',
      direcao = 'desc',
      comElogios = 'false',
      comAtos = 'false',
      comNegativas = 'false',
      semNegativas = 'false',
      priorizarSerie = 'true',
      rebaixarNegativas = 'true',
      page = '1',
      limit = '25'
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const matchBase = {
      instituicao: instituicaoId
    };

    if (busca) {
      matchBase.nome = { $regex: escapeRegex(busca), $options: 'i' };
    }

    if (turma) {
      matchBase.turma = { $regex: `^${escapeRegex(turma)}$`, $options: 'i' };
    }

    const rows = await Aluno.find(matchBase)
      .select([
        'nome',
        'turma',
        'dataEntrada',
        'foto',
        'fotoThumb',
        'fotoOriginal',
        'fotoMedium',
        'comportamento',
        'elogios',
        'atosIndisciplina',
        'notificacoesNegativas'
      ].join(' '))
      .lean();

    const alunoIds = rows.map((r) => r._id).filter(Boolean);
    const statsMap = await getNotificationStatsByAlunoIds(alunoIds, instituicaoId);

    let alunos = rows.map((aluno) => {
      const stats = statsMap.get(String(aluno._id)) || {
        elogios: 0,
        atosIndisciplina: 0,
        notificacoesNegativas: 0
      };

      const elogiosPersistidos = toNumber(aluno?.elogios, 0);
      const atosPersistidos = toNumber(aluno?.atosIndisciplina, 0);
      const negativasPersistidas = toNumber(aluno?.notificacoesNegativas, 0);

      const alunoEnriquecido = {
        ...aluno,
        elogios: Math.max(elogiosPersistidos, stats.elogios),
        atosIndisciplina: Math.max(atosPersistidos, stats.atosIndisciplina),
        notificacoesNegativas: Math.max(negativasPersistidas, stats.notificacoesNegativas)
      };

      return buildAlunoRanking(alunoEnriquecido, {
        priorizarSerie: priorizarSerie === 'true',
        rebaixarNegativas: rebaixarNegativas === 'true'
      });
    });

    if (notaMin !== '') {
      const min = toNumber(notaMin, 0);
      alunos = alunos.filter((a) => a.notaComportamental >= min);
    }

    if (notaMax !== '') {
      const max = toNumber(notaMax, 10);
      alunos = alunos.filter((a) => a.notaComportamental <= max);
    }

    if (faixa) {
      alunos = alunos.filter((a) => a.faixa === faixa);
    }

    if (comElogios === 'true') {
      alunos = alunos.filter((a) => a.elogios > 0);
    }

    if (comAtos === 'true') {
      alunos = alunos.filter((a) => a.atosIndisciplina > 0);
    }

    if (comNegativas === 'true') {
      alunos = alunos.filter((a) => a.notificacoesNegativas > 0);
    }

    if (semNegativas === 'true') {
      alunos = alunos.filter((a) => a.notificacoesNegativas === 0);
    }

    alunos.sort((a, b) => compareAlunos(a, b, ordenar, direcao));

    const total = alunos.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    const alunosPagina = alunos.slice(start, end);

    return res.json({
      ok: true,
      total,
      totalPages,
      page: safePage,
      limit: pageSize,
      alunos: alunosPagina
    });
  } catch (error) {
    console.error('❌ Erro ao gerar ranking de alunos:', error);
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao gerar ranking de alunos.'
    });
  }
});

module.exports = router;
