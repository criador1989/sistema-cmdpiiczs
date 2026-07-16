'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const ComportamentoSnapshot = require('../../models/ComportamentoSnapshot');
const Aluno = require('../../models/Aluno');

function parseData(valor, fallback, fimDoDia = false) {
  if (!valor) return fallback;

  const s = String(valor).trim();
  let d;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [ano, mes, dia] = s.split('-').map(Number);
    d = new Date(ano, mes - 1, dia);
  } else {
    d = new Date(s);
  }

  if (Number.isNaN(d.getTime())) return fallback;

  if (fimDoDia) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);

  return d;
}

function getInstituicaoId(req) {
  return (
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    req.instituicao?._id ||
    req.tenant?._id ||
    req.query.instituicao ||
    null
  );
}

function toObjectId(id) {
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

function escapeRegex(texto) {
  return String(texto || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function arredondar(n, casas = 2) {
  const valor = Number(n || 0);
  return Number(valor.toFixed(casas));
}

function montarFiltroBase(req) {
  const instituicaoId = toObjectId(getInstituicaoId(req));

  if (!instituicaoId) {
    const erro = new Error('Instituição não identificada.');
    erro.status = 400;
    throw erro;
  }

  const hoje = new Date();
  const inicioPadrao = new Date(hoje);
  inicioPadrao.setFullYear(inicioPadrao.getFullYear() - 1);

  const inicio = parseData(req.query.inicio, inicioPadrao, false);
  const fim = parseData(req.query.fim, hoje, true);

  const filtro = {
    instituicao: instituicaoId,
    dataReferencia: {
      $gte: inicio,
      $lte: fim,
    },
  };

  const turmaRaw = String(req.query.turma || '').trim();
  const turma = toObjectId(turmaRaw);
  if (turma) {
    filtro.turma = turma;
  } else if (turmaRaw && turmaRaw.toLowerCase() !== 'todas') {
    filtro.turmaNome = new RegExp(`^${escapeRegex(turmaRaw)}$`, 'i');
  }

  return { filtro, inicio, fim, instituicaoId };
}

/**
 * GET /api/estatisticas-comportamento/evolucao-geral
 */
router.get('/evolucao-geral', async (req, res) => {
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);

    const dados = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            ano: '$anoReferencia',
            mes: '$mesReferencia',
          },
          mediaNota: { $avg: '$notaComportamento' },
          totalAlunos: { $addToSet: '$aluno' },
          positivas: { $sum: '$totalOcorrenciasPositivas' },
          negativas: { $sum: '$totalOcorrenciasNegativas' },
          saldo: { $sum: '$saldoOcorrencias' },
        },
      },
      {
        $project: {
          _id: 0,
          ano: '$_id.ano',
          mes: '$_id.mes',
          periodo: {
            $concat: [
              { $toString: '$_id.ano' },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.mes', 10] },
                  { $concat: ['0', { $toString: '$_id.mes' }] },
                  { $toString: '$_id.mes' },
                ],
              },
            ],
          },
          mediaNota: { $round: ['$mediaNota', 2] },
          totalAlunos: { $size: '$totalAlunos' },
          positivas: 1,
          negativas: 1,
          saldo: 1,
        },
      },
      { $sort: { ano: 1, mes: 1 } },
    ]);

    return res.json({
      ok: true,
      inicio,
      fim,
      dados,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar evolução geral.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/evolucao-turmas
 */
router.get('/evolucao-turmas', async (req, res) => {
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);

    const dados = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            turma: '$turma',
            turmaNome: '$turmaNome',
            ano: '$anoReferencia',
            mes: '$mesReferencia',
          },
          mediaNota: { $avg: '$notaComportamento' },
          totalAlunos: { $addToSet: '$aluno' },
          positivas: { $sum: '$totalOcorrenciasPositivas' },
          negativas: { $sum: '$totalOcorrenciasNegativas' },
          saldo: { $sum: '$saldoOcorrencias' },
        },
      },
      {
        $project: {
          _id: 0,
          turma: '$_id.turma',
          turmaNome: {
            $ifNull: ['$_id.turmaNome', 'Sem turma'],
          },
          ano: '$_id.ano',
          mes: '$_id.mes',
          periodo: {
            $concat: [
              { $toString: '$_id.ano' },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.mes', 10] },
                  { $concat: ['0', { $toString: '$_id.mes' }] },
                  { $toString: '$_id.mes' },
                ],
              },
            ],
          },
          mediaNota: { $round: ['$mediaNota', 2] },
          totalAlunos: { $size: '$totalAlunos' },
          positivas: 1,
          negativas: 1,
          saldo: 1,
        },
      },
      { $sort: { turmaNome: 1, ano: 1, mes: 1 } },
    ]);

    return res.json({
      ok: true,
      inicio,
      fim,
      dados,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar evolução por turmas.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/aluno/:id
 */
router.get('/aluno/:id', async (req, res) => {
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);

    const alunoId = toObjectId(req.params.id);
    if (!alunoId) {
      return res.status(400).json({
        ok: false,
        erro: 'ID de aluno inválido.',
      });
    }

    filtro.aluno = alunoId;

    const snapshots = await ComportamentoSnapshot.find(filtro)
      .sort({ dataReferencia: 1 })
      .select(
        'dataReferencia anoReferencia mesReferencia diaReferencia aluno alunoNome turma turmaNome notaComportamento faixaComportamento totalOcorrenciasPositivas totalOcorrenciasNegativas saldoOcorrencias totalNotificacoes totalNotificacoesDeferidas'
      )
      .lean();

    const dados = snapshots.map((s) => ({
      data: s.dataReferencia,
      periodo: `${s.anoReferencia}-${String(s.mesReferencia).padStart(2, '0')}-${String(s.diaReferencia).padStart(2, '0')}`,
      aluno: s.aluno,
      alunoNome: s.alunoNome,
      turma: s.turma,
      turmaNome: s.turmaNome,
      notaComportamento: arredondar(s.notaComportamento),
      faixaComportamento: s.faixaComportamento,
      positivas: s.totalOcorrenciasPositivas || 0,
      negativas: s.totalOcorrenciasNegativas || 0,
      saldo: s.saldoOcorrencias || 0,
      totalNotificacoes: s.totalNotificacoes || 0,
      totalNotificacoesDeferidas: s.totalNotificacoesDeferidas || 0,
    }));

    const primeiro = dados[0] || null;
    const ultimo = dados[dados.length - 1] || null;

    return res.json({
      ok: true,
      inicio,
      fim,
      aluno: alunoId,
      resumo: {
        primeiraNota: primeiro?.notaComportamento ?? null,
        ultimaNota: ultimo?.notaComportamento ?? null,
        variacao:
          primeiro && ultimo
            ? arredondar(ultimo.notaComportamento - primeiro.notaComportamento)
            : null,
        totalPontosSerie: dados.length,
      },
      dados,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar evolução do aluno.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/ranking-evolucao
 */
router.get('/ranking-evolucao', async (req, res) => {
  const _t0 = Date.now();
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);

    const limite = Math.min(Number(req.query.limite || 20), 100);
    const tipo = String(req.query.tipo || 'melhores').toLowerCase();

    console.log('[ranking-evolucao] tipo:', tipo, '| limite:', limite);

    // Agrega primeiro/último snapshot por aluno no servidor (sem find sem limit)
    const ordemSort = (tipo === 'piores' || tipo === 'queda') ? 1 : -1;

    const rankingAgg = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      { $sort: { aluno: 1, dataReferencia: 1 } },
      {
        $group: {
          _id: '$aluno',
          alunoNome: { $first: '$alunoNome' },
          turma: { $first: '$turma' },
          turmaNome: { $first: '$turmaNome' },
          primeiraNota: { $first: '$notaComportamento' },
          ultimaNota: { $last: '$notaComportamento' },
          faixaAtual: { $last: '$faixaComportamento' },
          pontos: { $sum: 1 },
        },
      },
      { $match: { pontos: { $gte: 2 } } },
      {
        $addFields: {
          variacao: { $subtract: ['$ultimaNota', '$primeiraNota'] },
        },
      },
      { $sort: { variacao: ordemSort } },
      { $limit: limite },
    ], { allowDiskUse: true });

    console.log('[ranking-evolucao] alunos retornados:', rankingAgg.length, '| ms:', Date.now() - _t0);

    const dados = rankingAgg.map(item => ({
      aluno: item._id,
      alunoNome: item.alunoNome || 'Aluno',
      turma: item.turma || null,
      turmaNome: item.turmaNome || '',
      primeiraNota: arredondar(item.primeiraNota),
      ultimaNota: arredondar(item.ultimaNota),
      faixaAtual: item.faixaAtual || '',
      pontos: item.pontos,
      variacao: arredondar(item.variacao),
    }));

    return res.json({
      ok: true,
      inicio,
      fim,
      tipo,
      limite,
      dados,
    });
  } catch (err) {
    console.error('[ranking-evolucao] erro — ms:', Date.now() - _t0, '| msg:', err.message);
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar ranking de evolução.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/ranking-evolucao-resumo
 * Rota combinada: uma única aggregation retorna melhores e piores.
 */
router.get('/ranking-evolucao-resumo', async (req, res) => {
  const _t0 = Date.now();
  console.log('[ranking-evolucao-resumo] início');
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);
    const limite = Math.min(Number(req.query.limite || 10), 50);

    // Uma única aggregation: sort por aluno+data usa o índice composto
    const todos = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      { $sort: { aluno: 1, dataReferencia: 1 } },
      {
        $group: {
          _id: '$aluno',
          alunoNome: { $first: '$alunoNome' },
          turma: { $first: '$turma' },
          turmaNome: { $first: '$turmaNome' },
          primeiraNota: { $first: '$notaComportamento' },
          ultimaNota: { $last: '$notaComportamento' },
          faixaAtual: { $last: '$faixaComportamento' },
          pontos: { $sum: 1 },
        },
      },
      { $match: { pontos: { $gte: 2 } } },
      {
        $addFields: {
          variacao: { $subtract: ['$ultimaNota', '$primeiraNota'] },
        },
      },
    ], { allowDiskUse: true });

    console.log('[ranking-evolucao-resumo] alunos:', todos.length, '| ms:', Date.now() - _t0);

    const mapear = item => ({
      aluno: item._id,
      alunoNome: item.alunoNome || 'Aluno',
      turma: item.turma || null,
      turmaNome: item.turmaNome || '',
      primeiraNota: arredondar(item.primeiraNota),
      ultimaNota: arredondar(item.ultimaNota),
      faixaAtual: item.faixaAtual || '',
      pontos: item.pontos,
      variacao: arredondar(item.variacao),
    });

    const melhores = [...todos]
      .sort((a, b) => b.variacao - a.variacao)
      .slice(0, limite)
      .map(mapear);

    const piores = [...todos]
      .sort((a, b) => a.variacao - b.variacao)
      .slice(0, limite)
      .map(mapear);

    console.log('[ranking-evolucao-resumo] melhores:', melhores.length, '| piores:', piores.length, '| ms:', Date.now() - _t0);

    return res.json({
      ok: true,
      inicio,
      fim,
      melhores,
      piores,
    });
  } catch (err) {
    console.error('[ranking-evolucao-resumo] erro — ms:', Date.now() - _t0, '| msg:', err.message);
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar ranking resumido.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/distribuicao-faixas
 */
router.get('/distribuicao-faixas', async (req, res) => {
  try {
    const { filtro, inicio, fim } = montarFiltroBase(req);

    const dataMaisRecente = await ComportamentoSnapshot.findOne(filtro)
      .sort({ dataReferencia: -1 })
      .select('dataReferencia')
      .lean();

    if (!dataMaisRecente) {
      return res.json({
        ok: true,
        inicio,
        fim,
        dataReferencia: null,
        dados: [],
      });
    }

    const filtroUltimo = {
      ...filtro,
      dataReferencia: dataMaisRecente.dataReferencia,
    };

    const dados = await ComportamentoSnapshot.aggregate([
      { $match: filtroUltimo },
      {
        $group: {
          _id: '$faixaComportamento',
          total: { $sum: 1 },
          mediaNota: { $avg: '$notaComportamento' },
        },
      },
      {
        $project: {
          _id: 0,
          faixa: {
            $ifNull: ['$_id', 'Não classificado'],
          },
          total: 1,
          mediaNota: { $round: ['$mediaNota', 2] },
        },
      },
      { $sort: { mediaNota: -1 } },
    ]);

    return res.json({
      ok: true,
      inicio,
      fim,
      dataReferencia: dataMaisRecente.dataReferencia,
      dados,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao buscar distribuição por faixas.',
    });
  }
});

/**
 * GET /api/estatisticas-comportamento/parecer
 */
router.get('/parecer', async (req, res) => {
  const _t0 = Date.now();
  console.log('[parecer] início — id:', req.usuario?.id, '| tipo:', req.usuario?.tipo);
  try {
    const rawInstituicao = req.usuario?.instituicao || req.user?.instituicao || req.query.instituicao || null;
    if (!rawInstituicao) {
      console.error('[parecer] instituição ausente — id:', req.usuario?.id, '| raw:', rawInstituicao);
      return res.status(400).json({ ok: false, erro: 'Instituição não identificada para geração do parecer comportamental.' });
    }

    const { filtro, inicio, fim } = montarFiltroBase(req);
    console.log('[parecer] filtro — inicio:', inicio.toISOString(), '| fim:', fim.toISOString(), '| turma:', req.query.turma || 'todas');

    const dados = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            ano: '$anoReferencia',
            mes: '$mesReferencia',
          },
          mediaNota: { $avg: '$notaComportamento' },
        },
      },
      {
        $project: {
          _id: 0,
          periodo: {
            $concat: [
              { $toString: '$_id.ano' },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.mes', 10] },
                  { $concat: ['0', { $toString: '$_id.mes' }] },
                  { $toString: '$_id.mes' },
                ],
              },
            ],
          },
          mediaNota: { $round: ['$mediaNota', 2] },
        },
      },
      { $sort: { periodo: 1 } },
    ]);

    console.log('[parecer] mensal:', dados.length, 'meses | ms:', Date.now() - _t0);

    if (!dados.length) {
      return res.json({
        ok: true,
        semDados: true,
        inicio,
        fim,
        resumo: null,
        pontosFortes: [],
        pontosAtencao: [],
        recomendacoes: [],
        alunosEmRisco: [],
        parecer: 'Não há dados suficientes para gerar análise no período selecionado.',
      });
    }

    const notas = dados.map((d) => Number(d.mediaNota || 0));

    const mediaGeral = notas.reduce((s, n) => s + n, 0) / notas.length;
    const variacao = notas[notas.length - 1] - notas[0];

    let nivel = 'Regular';
    if (mediaGeral >= 9) nivel = 'Excepcional';
    else if (mediaGeral >= 8) nivel = 'Ótimo';
    else if (mediaGeral >= 7) nivel = 'Bom';

    let tendencia = 'estável';
    if (variacao > 0.2) tendencia = 'melhora';
    if (variacao < -0.2) tendencia = 'queda';

    const pontosFortes = [];
    const pontosAtencao = [];
    const recomendacoes = [];

    const variacoes = [];
    for (let i = 1; i < notas.length; i++) {
      variacoes.push(notas[i] - notas[i - 1]);
    }

    const quedasRecentes = variacoes.filter((v) => v < -0.05).length;
    const altasRecentes = variacoes.filter((v) => v > 0.05).length;

    if (mediaGeral >= 8.5) {
      pontosFortes.push('Alto nível disciplinar consistente ao longo do período.');
    }

    if (altasRecentes >= 1) {
      pontosFortes.push('Evolução positiva observada no comportamento dos alunos.');
    }

    if (quedasRecentes >= 1) {
      pontosAtencao.push('Oscilações recentes indicam possíveis quedas pontuais no comportamento.');
    }

    if (mediaGeral < 8) {
      pontosAtencao.push('Média geral abaixo do ideal esperado para o padrão institucional.');
    }

    if (quedasRecentes > 0) {
      recomendacoes.push(
        'Acompanhamento individual: identificar alunos com regressão recente e realizar escuta ativa, orientação pedagógica e acompanhamento sistemático.'
      );

      recomendacoes.push(
        'Intervenção em sala: aplicar reforço positivo, estabelecer regras claras e manter rotina estruturada para reduzir comportamentos inadequados.'
      );

      recomendacoes.push(
        'Gestão de conflitos: priorizar mediação, diálogo e desenvolvimento da autorregulação, evitando práticas exclusivamente punitivas.'
      );

      recomendacoes.push(
        'Parceria com a família: comunicar responsáveis quando necessário, buscando alinhamento entre escola e ambiente familiar.'
      );
    }

    if (altasRecentes > 0) {
      recomendacoes.push(
        'Manutenção de boas práticas: reforçar estratégias pedagógicas que contribuíram para a melhoria do comportamento.'
      );
    }

    if (mediaGeral >= 8.5) {
      recomendacoes.push(
        'Cultura positiva: valorizar e reconhecer publicamente comportamentos adequados, fortalecendo o ambiente disciplinar.'
      );
    }

    if (pontosAtencao.length === 0) {
      recomendacoes.push(
        'Monitoramento contínuo: manter rotina atual de acompanhamento, garantindo consistência nas ações pedagógicas.'
      );
    }

    // Agrega primeiro/último snapshot por aluno no servidor (sem limit, sem viés)
    console.log('[parecer] agregando resumo por aluno...');
    const resumoAlunos = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      { $sort: { dataReferencia: 1 } },
      {
        $group: {
          _id: '$aluno',
          alunoNome: { $first: '$alunoNome' },
          turma: { $last: '$turma' },
          turmaNome: { $last: '$turmaNome' },
          primeiraNota: { $first: '$notaComportamento' },
          ultimaNota: { $last: '$notaComportamento' },
          pontos: { $sum: 1 },
        },
      },
    ]);

    console.log('[parecer] alunos agregados:', resumoAlunos.length, '| ms:', Date.now() - _t0);

    const mapaAlunos = new Map(
      resumoAlunos.map(a => [
        String(a._id),
        {
          aluno: a._id,
          alunoNome: a.alunoNome || 'Aluno',
          turma: a.turma || null,
          turmaNome: a.turmaNome || '',
          primeiraNota: Number(a.primeiraNota || 0),
          ultimaNota: Number(a.ultimaNota || 0),
          pontos: a.pontos,
        },
      ])
    );

    const idsAlunos = Array.from(mapaAlunos.keys());

const alunosAtuais = await Aluno.find({
  _id: { $in: idsAlunos }
})
.select('_id comportamento')
.lean();

const mapaAtual = new Map(
  alunosAtuais.map(a => [String(a._id), a.comportamento])
);

const alunosEmRisco = Array.from(mapaAlunos.values())
  .filter(a => a.pontos >= 2)
  .map(a => {
    const atual = mapaAtual.get(String(a.aluno)) ?? null;

    return {
      aluno: a.aluno,
      alunoNome: a.alunoNome,
      turma: a.turma,
      turmaNome: a.turmaNome,
      primeiraNota: arredondar(a.primeiraNota),
      ultimaNota: arredondar(a.ultimaNota),
      notaAtual: arredondar(atual),
      variacao: arredondar(a.ultimaNota - a.primeiraNota),
    };
  })
  .filter(a => {
    // 👇 REGRA INTELIGENTE
    return (
      a.variacao < -0.3 &&        // teve queda relevante
      a.notaAtual !== null &&
      a.notaAtual < 8.0           // ainda está abaixo do ideal
    );
  })
  .sort((a, b) => a.variacao - b.variacao)
  .slice(0, 10);

    // 👇 TOTAL DE EVOLUÇÕES E QUEDAS NO PERÍODO
const LIMIAR_VARIACAO_RELEVANTE = 0.3;

const alunosComEvolucaoRelevante = Array.from(mapaAlunos.values())
  .filter(a => a.pontos >= 2)
  .filter(a => (a.ultimaNota - a.primeiraNota) >= LIMIAR_VARIACAO_RELEVANTE);

const alunosComQuedaRelevante = Array.from(mapaAlunos.values())
  .filter(a => a.pontos >= 2)
  .filter(a => (a.ultimaNota - a.primeiraNota) <= -LIMIAR_VARIACAO_RELEVANTE);

const totalEvolucoes = alunosComEvolucaoRelevante.length;
const totalQuedas = alunosComQuedaRelevante.length;

const totalEstaveis = Array.from(mapaAlunos.values())
  .filter(a => (a.ultimaNota - a.primeiraNota) === 0).length;

if (totalEvolucoes > 0) {
  pontosFortes.push(
    `${totalEvolucoes} estudante(s) apresentaram avanço comportamental ao longo do período analisado.`
  );
}

if (totalQuedas > 0) {
  pontosAtencao.push(
    `${totalQuedas} estudante(s) apresentaram variações comportamentais ao longo do período analisado.`
  );
}

if (totalEstaveis > 0 && totalQuedas === 0) {
  pontosFortes.push(
    `${totalEstaveis} estudante(s) mantiveram estabilidade comportamental no período.`
  );
}

// 👇 ALUNOS QUE PRECISAM DE ATENÇÃO AGORA
if (alunosEmRisco.length > 0) {
  pontosAtencao.push(
    `${alunosEmRisco.length} estudante(s) requerem atenção no momento atual.`
  );

  recomendacoes.push(
    'Priorizar acompanhamento dos estudantes com maior queda ativa, realizando escuta individual, observação em sala e diálogo com responsáveis quando necessário.'
  );
}

    const parecer = `
A escola apresenta média geral de comportamento ${mediaGeral.toFixed(2)}, classificada como ${nivel}.

Observa-se uma tendência de ${tendencia} ao longo do período analisado.

Recomenda-se manter ações pedagógicas e disciplinares alinhadas ao perfil identificado.
`.trim();

    console.log('[parecer] concluído — ms:', Date.now() - _t0);
    return res.json({
      ok: true,
      inicio,
      fim,
      resumo: {
        nivel,
        mediaGeral: Number(mediaGeral.toFixed(2)),
        tendencia,
        variacao: Number(variacao.toFixed(2)),
      },
      indicadores: {
        totalAlunosMonitorados: idsAlunos.length,
        totalAlunosEmRisco: alunosEmRisco.length,
        totalEvolucoes,
        totalQuedas,
        totalEstaveis,
      },
      pontosFortes,
      pontosAtencao,
      recomendacoes,
      alunosEmRisco,
      parecer,
    });
  } catch (err) {
    console.error('[estatisticas-comportamento/parecer] erro — ms:', Date.now() - _t0, '| msg:', err.message, '| status:', err.status || 500);
    return res.status(err.status || 500).json({
      ok: false,
      erro: err.message || 'Erro ao gerar parecer.',
    });
  }
});

module.exports = router;