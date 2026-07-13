'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const ComportamentoSnapshot = require('../../models/ComportamentoSnapshot');

function toObjectId(id) {
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
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

function classificarMedia(media) {
  if (media >= 9.5) return 'Excepcional';
  if (media >= 8.5) return 'Ótimo';
  if (media >= 7) return 'Bom';
  if (media >= 5) return 'Regular';
  if (media >= 3) return 'Insuficiente';
  return 'Incompatível';
}

function tendenciaTexto(variacao) {
  if (variacao >= 0.3) return 'evolução positiva';
  if (variacao <= -0.3) return 'queda de desempenho comportamental';
  return 'estabilidade';
}

function arred(n) {
  return Number(Number(n || 0).toFixed(2));
}

router.get('/parecer', async (req, res) => {
  try {
    const instituicaoId = toObjectId(getInstituicaoId(req));

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        erro: 'Instituição não identificada.'
      });
    }

    const hoje = new Date();
    const inicioPadrao = new Date(hoje);
    inicioPadrao.setFullYear(inicioPadrao.getFullYear() - 1);

    const inicio = parseData(req.query.inicio, inicioPadrao, false);
    const fim = parseData(req.query.fim, hoje, true);

    const filtro = {
      instituicao: instituicaoId,
      dataReferencia: { $gte: inicio, $lte: fim }
    };

    const mensal = await ComportamentoSnapshot.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: {
            ano: '$anoReferencia',
            mes: '$mesReferencia'
          },
          mediaNota: { $avg: '$notaComportamento' },
          totalAlunos: { $addToSet: '$aluno' },
          positivas: { $sum: '$totalOcorrenciasPositivas' },
          negativas: { $sum: '$totalOcorrenciasNegativas' },
          saldo: { $sum: '$saldoOcorrencias' }
        }
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
                  { $toString: '$_id.mes' }
                ]
              }
            ]
          },
          mediaNota: { $round: ['$mediaNota', 2] },
          totalAlunos: { $size: '$totalAlunos' },
          positivas: 1,
          negativas: 1,
          saldo: 1
        }
      },
      { $sort: { ano: 1, mes: 1 } }
    ]);

    if (!mensal.length) {
      return res.json({
        ok: true,
        semDados: true,
        parecer:
          'Não há dados suficientes no período selecionado para gerar uma análise comportamental consistente.',
        pontosFortes: [],
        pontosAtencao: [],
        recomendacoes: []
      });
    }

    const primeira = mensal[0];
    const ultima = mensal[mensal.length - 1];

    const variacao = arred(ultima.mediaNota - primeira.mediaNota);
    const mediaGeral = arred(
      mensal.reduce((s, m) => s + Number(m.mediaNota || 0), 0) / mensal.length
    );

    const melhorMes = [...mensal].sort((a, b) => b.mediaNota - a.mediaNota)[0];
    const piorMes = [...mensal].sort((a, b) => a.mediaNota - b.mediaNota)[0];

    const totalPositivas = mensal.reduce((s, m) => s + Number(m.positivas || 0), 0);
    const totalNegativas = mensal.reduce((s, m) => s + Number(m.negativas || 0), 0);
    const saldo = totalPositivas - totalNegativas;

    const nivel = classificarMedia(mediaGeral);
    const tendencia = tendenciaTexto(variacao);

    const snapshots = await ComportamentoSnapshot.find(filtro)
      .sort({ aluno: 1, dataReferencia: 1 })
      .select('aluno alunoNome turmaNome notaComportamento dataReferencia')
      .lean();

    const porAluno = new Map();

    for (const s of snapshots) {
      const key = String(s.aluno);

      if (!porAluno.has(key)) {
        porAluno.set(key, {
          aluno: s.aluno,
          alunoNome: s.alunoNome || 'Aluno',
          turmaNome: s.turmaNome || '',
          primeiraNota: Number(s.notaComportamento || 0),
          ultimaNota: Number(s.notaComportamento || 0),
          pontos: 1
        });
      } else {
        const item = porAluno.get(key);
        item.ultimaNota = Number(s.notaComportamento || 0);
        item.pontos += 1;
      }
    }

    const ranking = Array.from(porAluno.values())
      .filter(a => a.pontos >= 2)
      .map(a => ({
        ...a,
        variacao: arred(a.ultimaNota - a.primeiraNota)
      }));

    const melhores = ranking
      .filter(a => a.variacao > 0)
      .sort((a, b) => b.variacao - a.variacao)
      .slice(0, 5);

    const quedas = ranking
      .filter(a => a.variacao < 0)
      .sort((a, b) => a.variacao - b.variacao)
      .slice(0, 5);

    const pontosFortes = [];
    const pontosAtencao = [];
    const recomendacoes = [];

    if (mediaGeral >= 8.5) {
      pontosFortes.push(
        `A média geral do período foi ${mediaGeral}, classificada como ${nivel}, indicando bom padrão comportamental institucional.`
      );
    } else if (mediaGeral >= 7) {
      pontosFortes.push(
        `A média geral do período foi ${mediaGeral}, classificada como ${nivel}, demonstrando desempenho aceitável, com margem para fortalecimento das ações preventivas.`
      );
    } else {
      pontosAtencao.push(
        `A média geral do período foi ${mediaGeral}, classificada como ${nivel}, exigindo atenção institucional e ações corretivas planejadas.`
      );
    }

    if (variacao > 0) {
      pontosFortes.push(
        `Houve crescimento de ${variacao} ponto(s) entre ${primeira.periodo} e ${ultima.periodo}, indicando tendência positiva.`
      );
    } else if (variacao < 0) {
      pontosAtencao.push(
        `Houve redução de ${Math.abs(variacao)} ponto(s) entre ${primeira.periodo} e ${ultima.periodo}, indicando necessidade de intervenção preventiva.`
      );
    } else {
      pontosFortes.push(
        'A média comportamental permaneceu estável no período analisado.'
      );
    }

    if (saldo > 0) {
      pontosFortes.push(
        `O saldo entre registros positivos e negativos foi favorável (${saldo}), sugerindo presença relevante de condutas positivas registradas.`
      );
    } else if (saldo < 0) {
      pontosAtencao.push(
        `O saldo entre registros positivos e negativos foi desfavorável (${saldo}), indicando necessidade de ampliar ações de reconhecimento e prevenção.`
      );
    }

    if (quedas.length) {
      pontosAtencao.push(
        `${quedas.length} estudante(s) aparecem com queda comportamental relevante no período, recomendando acompanhamento individualizado.`
      );
    }

    recomendacoes.push(
      'Manter o acompanhamento mensal dos indicadores de comportamento, observando tendências por turma e por estudante.'
    );

    recomendacoes.push(
      'Fortalecer o registro de elogios e boas condutas, para equilibrar medidas corretivas com reforço positivo.'
    );

    if (quedas.length) {
      recomendacoes.push(
        'Realizar escuta orientadora com os estudantes que apresentaram queda, envolvendo coordenação, responsáveis e equipe pedagógica quando necessário.'
      );
    }

    if (mediaGeral < 8.5) {
      recomendacoes.push(
        'Planejar ações formativas por turma, com foco em disciplina consciente, convivência, rotina escolar e responsabilidade.'
      );
    }

    const parecer =
      `No período analisado, a escola apresentou média geral de comportamento de ${mediaGeral}, classificada como ${nivel}. ` +
      `A tendência geral observada foi de ${tendencia}, considerando a variação de ${variacao} ponto(s) entre ${primeira.periodo} e ${ultima.periodo}. ` +
      `O melhor resultado mensal ocorreu em ${melhorMes.periodo}, com média ${arred(melhorMes.mediaNota)}, enquanto o menor resultado foi observado em ${piorMes.periodo}, com média ${arred(piorMes.mediaNota)}. ` +
      `Foram contabilizados ${totalPositivas} registros positivos e ${totalNegativas} registros negativos no período, resultando em saldo ${saldo}. ` +
      `De forma geral, os dados indicam que a instituição se encontra em nível ${nivel}, devendo manter acompanhamento contínuo e ações preventivas para consolidar a melhoria comportamental.`;

    return res.json({
      ok: true,
      periodo: { inicio, fim },
      resumo: {
        mediaGeral,
        nivel,
        tendencia,
        variacao,
        primeiroPeriodo: primeira.periodo,
        ultimoPeriodo: ultima.periodo,
        melhorMes: melhorMes.periodo,
        piorMes: piorMes.periodo,
        totalPositivas,
        totalNegativas,
        saldo
      },
      parecer,
      pontosFortes,
      pontosAtencao,
      recomendacoes,
      melhores,
      quedas
    });
  } catch (err) {
    console.error('[relatorio-comportamento] erro:', err);
    return res.status(500).json({
      ok: false,
      erro: err.message || 'Erro ao gerar relatório interpretativo.'
    });
  }
});

module.exports = router;