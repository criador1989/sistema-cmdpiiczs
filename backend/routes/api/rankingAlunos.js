const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// =========================================
// MAPA DE PRIORIDADE POR SÉRIE
// =========================================
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

  // desempates
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

// =========================================
// GET /api/ranking-alunos
// =========================================
router.get('/', async (req, res) => {
  try {
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
      rebaixarNegativas = 'true'
    } = req.query;

    // =========================================
    // AJUSTE 1:
    // Se no seu model houver outro campo para "ativo",
    // troque aqui.
    // =========================================
    const filtroAlunos = {
      ativo: { $ne: false }
    };

    if (serie) {
      filtroAlunos.serie = serie;
    }

    if (turma) {
      filtroAlunos.turma = new RegExp(turma, 'i');
    }

    if (busca) {
      filtroAlunos.nome = new RegExp(busca, 'i');
    }

    // =========================================
    // AJUSTE 2:
    // Se quiser trazer foto, garanta que esses campos existem.
    // Se não existirem, pode remover do select.
    // =========================================
    const alunos = await Aluno.find(filtroAlunos)
      .select('nome serie turma fotoUrl foto comportamento notaComportamental')
      .lean();

    if (!alunos.length) {
      return res.json({ ok: true, alunos: [] });
    }

    const alunoIds = alunos.map(a => a._id);

    // =========================================
    // AJUSTE 3 MUITO IMPORTANTE:
    // Aqui estou assumindo que Notificacao possui:
    // - aluno
    // - tipo
    // - categoria
    // - natureza
    // - classificacao
    //
    // Como eu ainda não vi teu model, a lógica abaixo
    // tenta reconhecer elogio / ato / negativa de forma ampla.
    // =========================================
    const notificacoes = await Notificacao.find({
      aluno: { $in: alunoIds }
    })
      .select('aluno tipo categoria natureza classificacao')
      .lean();

    const mapa = new Map();

    for (const aluno of alunos) {
      const notaBase =
        aluno.notaComportamental ??
        aluno.comportamento ??
        0;

      mapa.set(String(aluno._id), {
        _id: aluno._id,
        nome: aluno.nome || 'Aluno sem nome',
        serie: aluno.serie || '',
        turma: aluno.turma || '',
        fotoUrl: aluno.fotoUrl || aluno.foto || '',
        notaComportamental: toNumber(notaBase, 0),
        elogios: 0,
        atosIndisciplina: 0,
        notificacoesNegativas: 0,
        seriePrioridade: getSeriePrioridade(aluno.serie || ''),
        faixa: faixaPorNota(notaBase),
        scoreFinal: 0
      });
    }

    for (const n of notificacoes) {
      const alunoId = String(n.aluno || '');
      const item = mapa.get(alunoId);
      if (!item) continue;

      const tipo = normalizeText(n.tipo);
      const categoria = normalizeText(n.categoria);
      const natureza = normalizeText(n.natureza);
      const classificacao = normalizeText(n.classificacao);

      const texto = [tipo, categoria, natureza, classificacao].join(' ');

      const ehElogio =
        texto.includes('elogio') ||
        texto.includes('positivo') ||
        texto.includes('merito') ||
        texto.includes('mérito');

      const ehAtoIndisciplina =
        texto.includes('ato de indisciplina') ||
        texto.includes('indisciplina');

      const ehNegativa =
        texto.includes('negativa') ||
        texto.includes('negativo') ||
        texto.includes('disciplinar') ||
        texto.includes('ocorrencia') ||
        texto.includes('ocorrência');

      if (ehElogio) {
        item.elogios += 1;
      }

      if (ehAtoIndisciplina) {
        item.atosIndisciplina += 1;
      }

      // evita contar elogio como negativa
      if (ehNegativa && !ehElogio) {
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

    return res.json({
      ok: true,
      total: resultado.length,
      alunos: resultado
    });
  } catch (error) {
    console.error('Erro ao gerar ranking de alunos:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao gerar ranking de alunos.'
    });
  }
});

module.exports = router;