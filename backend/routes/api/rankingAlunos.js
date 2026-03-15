'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const calcularNotaTSMD = require('../../utils/calculoNota');

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
  const n = normalizeText(t);

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
      turma: { $exists: true, $ne: null, $ne: '' }
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

    const filtroAlunos = {
      instituicao: instituicaoId
    };

    if (busca) {
      filtroAlunos.nome = { $regex: escapeRegex(busca), $options: 'i' };
    }

    if (turma) {
      filtroAlunos.turma = { $regex: `^${escapeRegex(turma)}$`, $options: 'i' };
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

    const alunoIds = alunos.map((a) => a._id);

    const notificacoes = await Notificacao.find({
      instituicao: instituicaoId,
      aluno: { $in: alunoIds },
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select('aluno natureza tipo motivo tipoMedida valorNumerico status data createdAt quantidadeDias')
      .lean();

    const notificacoesPorAluno = new Map();
    for (const n of notificacoes) {
      const alunoId = String(n.aluno || '');
      if (!notificacoesPorAluno.has(alunoId)) {
        notificacoesPorAluno.set(alunoId, []);
      }
      notificacoesPorAluno.get(alunoId).push(n);
    }

    const mapa = new Map();

    for (const aluno of alunos) {
      const serieInferida = inferSerieFromTurma(aluno.turma || '');
      const alunoId = String(aluno._id);

      const eventos = (notificacoesPorAluno.get(alunoId) || []).map((n) => ({
        data: n.data || null,
        createdAt: n.createdAt || null,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
        quantidadeDias: n.quantidadeDias ?? 1,
        tipoMedida: n.tipoMedida || n.tipo || '',
        natureza: n.natureza || ''
      }));

      let notaBase = 8.0;

      try {
        notaBase = calcularNotaTSMD(aluno.dataEntrada || null, new Date(), eventos);
      } catch (err) {
        console.warn(
          `Falha ao calcular nota TSMD do aluno ${aluno.nome || alunoId}:`,
          err?.message || err
        );
        notaBase =
          typeof aluno.comportamento === 'number'
            ? aluno.comportamento
            : 8.0;
      }

      notaBase = Number((+notaBase || 0).toFixed(2));

      mapa.set(alunoId, {
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

      if (ehElogio) item.elogios += 1;
      if (ehIndisciplina) item.atosIndisciplina += 1;
      if (ehIndisciplina && status !== 'arquivado') item.notificacoesNegativas += 1;
    }

    let resultado = Array.from(mapa.values()).map((item) => ({
      ...item,
      scoreFinal: computeScoreFinal(item, {
        priorizarSerie: priorizarSerie === 'true',
        rebaixarNegativas: rebaixarNegativas === 'true'
      })
    }));

    if (notaMin !== '') {
      resultado = resultado.filter((a) => a.notaComportamental >= toNumber(notaMin, 0));
    }

    if (notaMax !== '') {
      resultado = resultado.filter((a) => a.notaComportamental <= toNumber(notaMax, 10));
    }

    if (faixa) {
      resultado = resultado.filter((a) => a.faixa === faixa);
    }

    if (comElogios === 'true') {
      resultado = resultado.filter((a) => a.elogios > 0);
    }

    if (comAtos === 'true') {
      resultado = resultado.filter((a) => a.atosIndisciplina > 0);
    }

    if (comNegativas === 'true') {
      resultado = resultado.filter((a) => a.notificacoesNegativas > 0);
    }

    if (semNegativas === 'true') {
      resultado = resultado.filter((a) => a.notificacoesNegativas === 0);
    }

    resultado.sort((a, b) => compareItems(a, b, ordenar, direcao));

    const total = resultado.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return res.json({
      ok: true,
      total,
      totalPages,
      page: safePage,
      limit: pageSize,
      alunos: resultado.slice(start, end)
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