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

/**
 * POST /api/fix-recalculo-comportamento/recalcular
 *
 * Recalcula a nota de comportamento de TODOS os alunos da instituição do usuário logado,
 * usando a regra oficial do utils/calculoNota.js:
 * - nota inicial 8.0
 * - TSMD por dias úteis
 * - multi-dia zerando sequência
 * - desconto apenas no dia do registro
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
      .select('_id nome turma dataEntrada comportamento')
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
      .select('aluno data createdAt valorNumerico quantidadeDias tipoMedida natureza')
      .sort({ data: 1, createdAt: 1 })
      .lean();

    const mapaNotificacoes = new Map();
    for (const n of notificacoes) {
      const key = String(n.aluno);
      if (!mapaNotificacoes.has(key)) mapaNotificacoes.set(key, []);
      mapaNotificacoes.get(key).push({
        data: n.data || null,
        createdAt: n.createdAt || null,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
        quantidadeDias: n.quantidadeDias ?? 1,
        tipoMedida: n.tipoMedida || '',
        natureza: n.natureza || ''
      });
    }

    const bulkOps = [];
    const detalhamento = [];

    for (const aluno of alunos) {
      const eventos = mapaNotificacoes.get(String(aluno._id)) || [];
      const notaAnterior = typeof aluno.comportamento === 'number'
        ? Number(aluno.comportamento.toFixed(2))
        : null;

      let notaNova = 8.0;
      try {
        notaNova = calcularNotaTSMD(
          aluno.dataEntrada ? new Date(aluno.dataEntrada) : null,
          new Date(),
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

      bulkOps.push({
        updateOne: {
          filter: { _id: aluno._id },
          update: { $set: { comportamento: notaNova } }
        }
      });

      detalhamento.push({
        alunoId: aluno._id,
        nome: aluno.nome || 'Sem nome',
        turma: aluno.turma || '—',
        notaAnterior,
        notaNova,
        alterou: notaAnterior !== notaNova
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