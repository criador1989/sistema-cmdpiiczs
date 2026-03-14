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
  const t = String(turma || '').trim();

  if (!t) return '';

  if (/3[ªa]?\s*s[ée]rie/i.test(t)) return '3ª Série';
  if (/2[ªa]?\s*s[ée]rie/i.test(t)) return '2ª Série';
  if (/1[ªa]?\s*s[ée]rie/i.test(t)) return '1ª Série';

  if (/9[ºo]?\s*ano/i.test(t)) return '9º Ano';
  if (/8[ºo]?\s*ano/i.test(t)) return '8º Ano';
  if (/7[ºo]?\s*ano/i.test(t)) return '7º Ano';
  if (/6[ºo]?\s*ano/i.test(t)) return '6º Ano';

  if (/^3\s*[a-z]/i.test(t)) return '3ª Série';
  if (/^2\s*[a-z]/i.test(t)) return '2ª Série';
  if (/^1\s*[a-z]/i.test(t)) return '1ª Série';

  return '';
}

function getSeriePrioridade(serie) {
  return SERIE_PESO_MAP[String(serie || '').trim()] || 0;
}

function faixaPorNota(nota) {
  const n = toNumber(nota, 0);
  if (n >= 9.0) return 'Excepcional';
  if (n >= 8.0) return 'Ótimo';
  if (n >= 7.0) return 'Bom';
  if (n >= 5.0) return 'Regular';
  if (n >= 3.0) return 'Insuficiente';
  return 'Incompatível';
}

function computeScoreFinal({
  notaComportamental = 0,
  elogios = 0,
  atosIndisciplina = 0,
  notificacoesNegativas = 0,
  serie = ''
}, opts = {}) {
  const usarSerie = opts.priorizarSerie !== false;
  const rebaixarNeg = opts.rebaixarNegativas !== false;

  let score =
    (toNumber(notaComportamental, 0) * 1000) +
    (toNumber(elogios, 0) * 20) -
    (toNumber(atosIndisciplina, 0) * 40);

  if (usarSerie) {
    score += getSeriePrioridade(serie) * 100;
  }

  if (rebaixarNeg) {
    score -= toNumber(notificacoesNegativas, 0) * 80;
  }

  return score;
}

function compareItems(a, b, ordenar = 'scoreFinal', direcao = 'desc') {
  const dir = direcao === 'asc' ? 1 : -1;

  let av;
  let bv;

  switch (ordenar) {
    case 'nome':
      av = normalizeText(a.nome);
      bv = normalizeText(b.nome);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      break;

    case 'elogios':
      av = a.elogios;
      bv = b.elogios;
      if (av !== bv) return (av - bv) * dir;
      break;

    case 'notificacoesNegativas':
      av = a.notificacoesNegativas;
      bv = b.notificacoesNegativas;
      if (av !== bv) return (av - bv) * dir;
      break;

    case 'atosIndisciplina':
      av = a.atosIndisciplina;
      bv = b.atosIndisciplina;
      if (av !== bv) return (av - bv) * dir;
      break;

    case 'seriePrioridade':
      av = a.seriePrioridade;
      bv = b.seriePrioridade;
      if (av !== bv) return (av - bv) * dir;
      break;

    case 'notaComportamental':
      av = a.notaComportamental;
      bv = b.notaComportamental;
      if (av !== bv) return (av - bv) * dir;
      break;

    case 'scoreFinal':
    default:
      av = a.scoreFinal;
      bv = b.scoreFinal;
      if (av !== bv) return (av - bv) * dir;
      break;
  }

  if (a.notaComportamental !== b.notaComportamental) {
    return b.notaComportamental - a.notaComportamental;
  }

  if (a.seriePrioridade !== b.seriePrioridade) {
    return b.seriePrioridade - a.seriePrioridade;
  }

  if (a.elogios !== b.elogios) {
    return b.elogios - a.elogios;
  }

  if (a.notificacoesNegativas !== b.notificacoesNegativas) {
    return a.notificacoesNegativas - b.notificacoesNegativas;
  }

  return normalizeText(a.nome).localeCompare(normalizeText(b.nome), 'pt-BR');
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

/* =========================================
   GET /api/ranking-alunos
   - paginação real no backend
   - fotos reativadas com prioridade para thumb
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
      serie = '',
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

    const filtroAlunos = {
      instituicao: instituicaoId
    };

    if (busca) {
      filtroAlunos.nome = { $regex: escapeRegex(busca), $options: 'i' };
    }

    if (turma) {
      filtroAlunos.turma = { $regex: escapeRegex(turma), $options: 'i' };
    }

    const alunos = await Aluno.find(filtroAlunos)
      .select('nome turma comportamento dataEntrada foto fotoThumb fotoOriginal fotoMedium')
      .lean();

    if (!alunos.length) {
      return res.json({
        ok: true,
        total: 0,
        totalPages: 1,
        page: currentPage,
        limit: pageSize,
        alunos: []
      });
    }

    const alunoIds = alunos.map(a => a._id);

    const notificacoes = await Notificacao.find({
      instituicao: instituicaoId,
      aluno: { $in: alunoIds },
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select('aluno natureza tipo motivo tipoMedida valorNumerico status')
      .lean();

    const mapa = new Map();

    for (const aluno of alunos) {
      const serieInferida = inferSerieFromTurma(aluno.turma || '');
      const notaBase = toNumber(aluno.comportamento, 0);

      mapa.set(String(aluno._id), {
        _id: aluno._id,
        nome: aluno.nome || 'Aluno sem nome',
        serie: serieInferida,
        turma: aluno.turma || '',
        dataEntrada: aluno.dataEntrada || null,
        fotoUrl: aluno.fotoThumb || aluno.fotoOriginal || aluno.foto || aluno.fotoMedium || '',
        notaComportamental: notaBase,
        elogios: 0,
        atosIndisciplina: 0,
        notificacoesNegativas: 0,
        seriePrioridade: getSeriePrioridade(serieInferida),
        faixa: faixaPorNota(notaBase),
        scoreFinal: 0
      });
    }

    for (const n of notificacoes) {
      const alunoId = String(n.aluno || '');
      const item = mapa.get(alunoId);
      if (!item) continue;

      const natureza = normalizeText(n.natureza);
      const tipo = normalizeText(n.tipo);
      const tipoMedida = normalizeText(n.tipoMedida);
      const motivo = normalizeText(n.motivo);
      const status = normalizeText(n.status);
      const valorNumerico = toNumber(n.valorNumerico, 0);

      const ehElogio =
        natureza === 'elogio' ||
        tipo === 'elogio' ||
        tipoMedida === 'elogio';

      const ehIndisciplina =
        natureza === 'indisciplina' ||
        (!ehElogio && valorNumerico < 0) ||
        tipo.includes('advertencia') ||
        tipo.includes('advertência') ||
        tipo.includes('repreensao') ||
        tipo.includes('repreensão') ||
        tipoMedida.includes('a.i.a') ||
        tipoMedida.includes('a.e.c.d.e') ||
        motivo.includes('indisciplina');

      if (ehElogio) {
        item.elogios += 1;
      }

      if (ehIndisciplina) {
        item.atosIndisciplina += 1;
      }

      if (ehIndisciplina && status !== 'arquivado') {
        item.notificacoesNegativas += 1;
      }
    }

    let resultado = Array.from(mapa.values()).map(item => {
      const scoreFinal = computeScoreFinal(item, {
        priorizarSerie: priorizarSerie === 'true',
        rebaixarNegativas: rebaixarNegativas === 'true'
      });

      return {
        ...item,
        scoreFinal
      };
    });

    if (serie) {
      resultado = resultado.filter(a => a.serie === serie);
    }

    if (notaMin !== '') {
      resultado = resultado.filter(a => a.notaComportamental >= toNumber(notaMin, 0));
    }

    if (notaMax !== '') {
      resultado = resultado.filter(a => a.notaComportamental <= toNumber(notaMax, 10));
    }

    if (faixa) {
      resultado = resultado.filter(a => a.faixa === faixa);
    }

    if (comElogios === 'true') {
      resultado = resultado.filter(a => a.elogios > 0);
    }

    if (comAtos === 'true') {
      resultado = resultado.filter(a => a.atosIndisciplina > 0);
    }

    if (comNegativas === 'true') {
      resultado = resultado.filter(a => a.notificacoesNegativas > 0);
    }

    if (semNegativas === 'true') {
      resultado = resultado.filter(a => a.notificacoesNegativas === 0);
    }

    resultado.sort((a, b) => compareItems(a, b, ordenar, direcao));

    const total = resultado.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const alunosPaginados = resultado.slice(start, end);

    return res.json({
      ok: true,
      total,
      totalPages,
      page: safePage,
      limit: pageSize,
      alunos: alunosPaginados
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