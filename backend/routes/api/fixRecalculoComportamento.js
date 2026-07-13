'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');
const calcularNotaTSMD = require('../../utils/calculoNota');

function buildInstMatch(inst) {
  if (!inst) return { _id: null };

  const asStr = String(inst);
  if (mongoose.isValidObjectId(inst)) {
    return {
      $or: [
        { instituicao: asStr },
        { instituicao: new mongoose.Types.ObjectId(inst) }
      ]
    };
  }

  return { instituicao: asStr };
}

function buildAlunoMatch(inst) {
  if (!inst) return { _id: null };

  const asStr = String(inst);
  if (mongoose.isValidObjectId(inst)) {
    return {
      $or: [
        { instituicao: asStr },
        { instituicao: new mongoose.Types.ObjectId(inst) }
      ]
    };
  }

  return { instituicao: asStr };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function classifyNotificacao(doc = {}) {
  const bag = [
    doc?.tipo,
    doc?.categoria,
    doc?.tipoMedida,
    doc?.natureza,
    doc?.classificacao,
    doc?.descricao,
    doc?.titulo,
    doc?.motivo
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  const elogio =
    /\belogio\b/.test(bag) ||
    /\bpositiv[ao]\b/.test(bag) ||
    /\bmerito\b/.test(bag) ||
    /\breconhecimento\b/.test(bag) ||
    /\bparaben/.test(bag);

  const ato =
    /\bato\b/.test(bag) && /\bindisciplin/.test(bag);

  const negativa =
    (
      /\bnegativ[ao]\b/.test(bag) ||
      /\bindisciplin/.test(bag) ||
      /\bocorrenc/.test(bag) ||
      /\badvertenc/.test(bag) ||
      /\bsuspens/.test(bag) ||
      /\bdescumpr/.test(bag) ||
      /\bfalta\b/.test(bag)
    ) && !elogio;

  return { elogio, ato, negativa };
}

/**
 * POST /api/fix-recalculo-comportamento/recalcular
 *
 * Recalcula a nota de comportamento de TODOS os alunos da instituição do usuário logado,
 * usando a regra oficial do utils/calculoNota.js:
 * - nota inicial 8.0
 * - TSMD por dias úteis
 * - multi-dia zerando sequência
 * - desconto apenas no dia do registro
 *
 * Além disso, atualiza no Aluno:
 * - elogios
 * - atosIndisciplina
 * - notificacoesNegativas
 */
router.post('/recalcular', autenticar, async (req, res) => {
  try {
    const instituicao = req?.usuario?.instituicao;

    if (!instituicao) {
      return res.status(401).json({
        ok: false,
        message: 'Instituição não identificada no usuário autenticado.'
      });
    }

    const alunos = await Aluno.find(buildAlunoMatch(instituicao))
      .select('_id nome turma dataEntrada comportamento elogios atosIndisciplina notificacoesNegativas')
      .lean();

    if (!alunos.length) {
      return res.json({
        ok: true,
        totalAlunos: 0,
        atualizados: 0,
        message: 'Nenhum aluno encontrado para recalcular.'
      });
    }

    const alunoIds = alunos.map(a => a._id);

    const notificacoes = await Notificacao.find({
      aluno: { $in: alunoIds },
      ...buildInstMatch(instituicao),
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select([
        'aluno',
        'data',
        'createdAt',
        'valorNumerico',
        'quantidadeDias',
        'tipoMedida',
        'natureza',
        'tipo',
        'categoria',
        'classificacao',
        'descricao',
        'titulo',
        'motivo'
      ].join(' '))
      .sort({ data: 1, createdAt: 1 })
      .lean();

    const mapaNotificacoesTSMD = new Map();
    const mapaContagens = new Map();

    for (const n of notificacoes) {
      const key = String(n.aluno);
      if (!key) continue;

      if (!mapaNotificacoesTSMD.has(key)) mapaNotificacoesTSMD.set(key, []);
      if (!mapaContagens.has(key)) {
        mapaContagens.set(key, {
          elogios: 0,
          atosIndisciplina: 0,
          notificacoesNegativas: 0
        });
      }

      mapaNotificacoesTSMD.get(key).push({
        data: n.data || null,
        createdAt: n.createdAt || null,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
        quantidadeDias: n.quantidadeDias ?? 1,
        tipoMedida: n.tipoMedida || '',
        natureza: n.natureza || ''
      });

      const cls = classifyNotificacao(n);
      const cont = mapaContagens.get(key);

      if (cls.elogio) cont.elogios += 1;
      if (cls.ato) cont.atosIndisciplina += 1;
      if (cls.negativa) cont.notificacoesNegativas += 1;
    }

    const bulkOps = [];
    const detalhamento = [];
    const agora = new Date();

    for (const aluno of alunos) {
      const alunoKey = String(aluno._id);
      const eventos = mapaNotificacoesTSMD.get(alunoKey) || [];
      const contagens = mapaContagens.get(alunoKey) || {
        elogios: 0,
        atosIndisciplina: 0,
        notificacoesNegativas: 0
      };

      const notaAnterior =
        typeof aluno.comportamento === 'number'
          ? Number(aluno.comportamento.toFixed(2))
          : null;

      let notaNova = 8.0;

      try {
        notaNova = calcularNotaTSMD(
          aluno.dataEntrada ? new Date(aluno.dataEntrada) : null,
          agora,
          eventos
        );
      } catch (e) {
        detalhamento.push({
          alunoId: aluno._id,
          nome: aluno.nome || 'Sem nome',
          turma: aluno.turma || '—',
          erro: e?.message || 'Erro ao recalcular'
        });
        continue;
      }

      notaNova = Number((+notaNova || 0).toFixed(2));

      const elogiosAnteriores = Number(aluno?.elogios || 0);
      const atosAnteriores = Number(aluno?.atosIndisciplina || 0);
      const negativasAnteriores = Number(aluno?.notificacoesNegativas || 0);

      const alterou =
        notaAnterior === null ||
        notaAnterior !== notaNova ||
        elogiosAnteriores !== contagens.elogios ||
        atosAnteriores !== contagens.atosIndisciplina ||
        negativasAnteriores !== contagens.notificacoesNegativas;

      bulkOps.push({
        updateOne: {
          filter: { _id: aluno._id },
          update: {
            $set: {
              comportamento: notaNova,
              elogios: contagens.elogios,
              atosIndisciplina: contagens.atosIndisciplina,
              notificacoesNegativas: contagens.notificacoesNegativas,
              ultimaAtualizacaoComportamento: agora
            }
          }
        }
      });

      detalhamento.push({
        alunoId: aluno._id,
        nome: aluno.nome || 'Sem nome',
        turma: aluno.turma || '—',
        notaAnterior,
        notaNova,
        elogiosAnterior: elogiosAnteriores,
        elogiosNovo: contagens.elogios,
        atosAnterior: atosAnteriores,
        atosNovo: contagens.atosIndisciplina,
        negativasAnterior: negativasAnteriores,
        negativasNovo: contagens.notificacoesNegativas,
        alterou
      });
    }

    let modificados = 0;
    if (bulkOps.length) {
      const result = await Aluno.bulkWrite(bulkOps, { ordered: false });
      modificados = result?.modifiedCount || 0;
    }

    const alterados = detalhamento.filter(x => x.alterou).length;
    const erros = detalhamento.filter(x => x.erro).length;

    return res.json({
      ok: true,
      totalAlunos: alunos.length,
      processados: detalhamento.length,
      atualizadosNoBanco: modificados,
      alterados,
      erros,
      detalhes: detalhamento
    });
  } catch (error) {
    console.error('❌ Erro no recálculo geral de comportamento:', error);
    return res.status(500).json({
      ok: false,
      message: error?.message || 'Erro ao recalcular notas comportamentais.'
    });
  }
});

module.exports = router;