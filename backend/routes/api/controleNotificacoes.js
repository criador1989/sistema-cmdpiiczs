// backend/routes/api/controleNotificacoes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

// Escape seguro p/ regex a partir de texto livre
function esc(s='') {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/controle-notificacoes
 * Query:
 *  - page (default 1)
 *  - limit (default 10, máx 50)
 *  - q (texto para busca em: aluno.nome, aluno.turma, motivo, tipo, tipoMedida, numeroSequencial)
 *  - data (YYYY-MM-DD; filtra pelo dia em createdAt)
 *  - status (default 'pendente'; pode receber 'deferido', 'revisao_solicitada', 'arquivado', etc.)
 *
 * Retorna: { data, total, totalPages, page }
 */
router.get('/', autenticar, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const status = (req.query.status || 'pendente').trim();
    const q = (req.query.q || '').trim();
    const data = (req.query.data || '').trim();

    const baseMatch = { instituicao };
    if (status) baseMatch.status = status;

    if (data) {
      const ini = new Date(data);
      const fim = new Date(data);
      fim.setHours(23, 59, 59, 999);
      baseMatch.createdAt = { $gte: ini, $lte: fim };
    }

    // pipeline com lookup (join) com 'alunos'
    const pipeline = [
      { $match: baseMatch },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: 'alunos',
          localField: 'aluno',
          foreignField: '_id',
          as: 'alunoDoc',
          pipeline: [
            { $project: { nome: 1, turma: 1, foto: 1 } }
          ]
        }
      },
      { $unwind: { path: '$alunoDoc', preserveNullAndEmptyArrays: true } }
    ];

    if (q) {
      const rx = new RegExp(esc(q), 'i');
      pipeline.push({
        $match: {
          $or: [
            { motivo: rx },
            { tipo: rx },
            { tipoMedida: rx },
            { numeroSequencial: rx },
            { 'alunoDoc.nome': rx },
            { 'alunoDoc.turma': rx }
          ]
        }
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          // projeta somente o necessário para a lista
          {
            $project: {
              _id: 1,
              aluno: '$alunoDoc', // já com nome/turma/foto
              motivo: 1,
              tipo: 1,
              tipoMedida: 1,
              numeroSequencial: 1,
              valorNumerico: 1,
              status: 1,
              observacao: 1,
              artigo: 1,
              paragrafo: 1,
              inciso: 1,
              classificacaoRegulamento: 1,
              createdAt: 1
            }
          }
        ],
        meta: [
          { $count: 'total' }
        ]
      }
    });

    const agg = await Notificacao.aggregate(pipeline).allowDiskUse(true);
    const meta = agg[0]?.meta?.[0] || { total: 0 };
    const dataOut = agg[0]?.data || [];
    const total = meta.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({ data: dataOut, total, totalPages, page });
  } catch (err) {
    console.error('Erro ao buscar notificações (controle):', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// PUT /api/controle-notificacoes/:id/deferir
router.put('/:id/deferir', autenticar, async (req, res) => {
  try {
    const { instituicao, id: avaliador } = req.usuario;
    const updated = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, instituicao },
      { $set: { status: 'deferido', avaliador, comentarioMonitor: '' } },
      { new: true, projection: { __v: 0 } }
    ).lean();

    if (!updated) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.json(updated);
  } catch (err) {
    console.error('Erro ao deferir notificação:', err);
    return res.status(500).json({ erro: 'Erro ao deferir notificação' });
  }
});

// PUT /api/controle-notificacoes/:id/revisar
router.put('/:id/revisar', autenticar, async (req, res) => {
  try {
    const { instituicao, id: avaliador } = req.usuario;
    const { comentario = '' } = req.body;

    const updated = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, instituicao },
      { $set: { status: 'revisao_solicitada', avaliador, comentarioMonitor: comentario } },
      { new: true, projection: { __v: 0 } }
    ).lean();

    if (!updated) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.json(updated);
  } catch (err) {
    console.error('Erro ao solicitar revisão:', err);
    return res.status(500).json({ erro: 'Erro ao solicitar revisão' });
  }
});

// PUT /api/controle-notificacoes/:id/arquivar
router.put('/:id/arquivar', autenticar, async (req, res) => {
  try {
    const { instituicao, id: avaliador } = req.usuario;

    const updated = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, instituicao },
      { $set: { status: 'arquivado', avaliador } },
      { new: true, projection: { __v: 0 } }
    ).lean();

    if (!updated) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.json(updated);
  } catch (err) {
    console.error('Erro ao arquivar notificação:', err);
    return res.status(500).json({ erro: 'Erro ao arquivar notificação' });
  }
});

// PUT /api/controle-notificacoes/:id/reenviar (volta para pendente)
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const { instituicao } = req.usuario;
    const updated = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, instituicao },
      { $set: { status: 'pendente' } },
      { new: true, projection: { __v: 0 } }
    ).lean();

    if (!updated) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.json({ mensagem: 'Notificação reenviada com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    return res.status(500).json({ erro: 'Erro ao reenviar notificação' });
  }
});

// DELETE /api/controle-notificacoes/:id
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const { instituicao } = req.usuario;
    const del = await Notificacao.findOneAndDelete({ _id: req.params.id, instituicao });
    if (!del) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    return res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    return res.status(500).json({ erro: 'Erro ao excluir notificação' });
  }
});

module.exports = router;
