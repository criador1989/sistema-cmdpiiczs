// backend/routes/api/controleNotificacoes.js
const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

/* ============================================================
   🔹 UTILITÁRIOS
   ============================================================ */

// Monta filtro base por instituição (inclui sem instituicao p/ compatibilidade)
function filtroInstituicaoDoUsuario(usuario) {
  const inst = (usuario && usuario.instituicao) ? String(usuario.instituicao) : null;
  if (!inst)
    return { $or: [{ instituicao: { $exists: false } }, { instituicao: { $eq: null } }] };
  return {
    $or: [
      { instituicao: inst },
      { instituicao: { $exists: false } },
      { instituicao: { $eq: null } },
    ],
  };
}

/* ============================================================
   🔹 GET - Listar notificações para controle (pendentes + revisões)
   ============================================================ */
router.get('/', autenticar, async (req, res) => {
  try {
    // paginação
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const skip = (page - 1) * limit;

    // filtros
    const { q, data } = req.query;
    // status: pode vir "status=pendente" ou "status=pendente,revisao_solicitada"
    const rawStatus = (req.query.status || '').trim();
    const statuses = rawStatus
      ? rawStatus.split(',').map((s) => s.trim()).filter(Boolean)
      : ['pendente', 'revisao_solicitada'];

    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      status: { $in: statuses },
    };

    // filtro de data
    if (data) {
      const inicio = new Date(data);
      const fim = new Date(data);
      if (!isNaN(inicio.getTime())) {
        fim.setHours(23, 59, 59, 999);
        filtro.createdAt = { $gte: inicio, $lte: fim };
      }
    }

    // busca textual
    const textRegex = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // consulta principal
    const baseQuery = Notificacao.find(filtro)
      .populate('aluno', 'nome turma')
      .sort({ createdAt: -1, _id: -1 });

    const countQuery = Notificacao.countDocuments(filtro);

    let [total, docs] = await Promise.all([countQuery, baseQuery.skip(skip).limit(limit)]);

    // filtrar se houver q
    if (textRegex) {
      docs = docs.filter((n) => {
        const aluno = n.aluno || {};
        return (
          textRegex.test(n.motivo || '') ||
          textRegex.test(n.tipo || '') ||
          textRegex.test(n.tipoMedida || '') ||
          textRegex.test(n.numeroSequencial || '') ||
          textRegex.test(aluno.nome || '') ||
          textRegex.test(aluno.turma || '')
        );
      });

      // refaz count para busca textual
      const todosParaCount = await Notificacao.find(filtro)
        .populate('aluno', 'nome turma')
        .select('motivo tipo tipoMedida numeroSequencial aluno');
      total = todosParaCount.filter((n) => {
        const aluno = n.aluno || {};
        return (
          textRegex.test(n.motivo || '') ||
          textRegex.test(n.tipo || '') ||
          textRegex.test(n.tipoMedida || '') ||
          textRegex.test(n.numeroSequencial || '') ||
          textRegex.test(aluno.nome || '') ||
          textRegex.test(aluno.turma || '')
        );
      }).length;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ data: docs, page, limit, total, totalPages });
  } catch (err) {
    console.error('Erro ao buscar notificações para controle:', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

/* ============================================================
   🔹 PUT - Deferir notificação
   ============================================================ */
router.put('/:id/deferir', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      { status: 'deferido', avaliador: req.usuario._id, comentarioMonitor: '' },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao deferir notificação' });
  }
});

/* ============================================================
   🔹 PUT - Solicitar revisão
   ============================================================ */
router.put('/:id/revisar', autenticar, async (req, res) => {
  try {
    const { comentario } = req.body;
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      {
        status: 'revisao_solicitada',
        avaliador: req.usuario._id,
        comentarioMonitor: comentario || '',
      },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao solicitar revisão' });
  }
});

/* ============================================================
   🔹 PUT - Arquivar notificação
   ============================================================ */
router.put('/:id/arquivar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      { status: 'arquivado', avaliador: req.usuario._id },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao arquivar notificação' });
  }
});

/* ============================================================
   🔹 PUT - Reenviar notificação (voltar ao status pendente)
   ============================================================ */
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...filtroInstituicaoDoUsuario(req.usuario),
    });
    if (!notificacao)
      return res.status(404).json({ erro: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ mensagem: 'Notificação reenviada com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ erro: 'Erro ao reenviar notificação' });
  }
});

/* ============================================================
   🔹 DELETE - Excluir notificação
   ============================================================ */
router.delete('/:id', autenticar, async (req, res) => {
  try {
    await Notificacao.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir notificação' });
  }
});

/* ============================================================
   🔹 NOVAS ROTAS PARA O PAINEL E RELATÓRIOS
   ============================================================ */

// Contador rápido de notificações em controle (painel principal)
router.get('/contador/painel', autenticar, async (req, res) => {
  try {
    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      status: { $in: ['pendente', 'revisao_solicitada'] },
    };
    const total = await Notificacao.countDocuments(filtro);
    res.json({ total });
  } catch (err) {
    console.error('Erro ao contar notificações pendentes (painel):', err);
    res.status(500).json({ erro: 'Erro interno ao contar notificações' });
  }
});

// Dados resumidos p/ gráficos (últimos 30 dias)
router.get('/estatisticas', autenticar, async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      createdAt: { $gte: inicio, $lte: hoje },
    };

    const porStatus = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porNatureza = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$natureza', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porDia = await Notificacao.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.dia': 1 } },
    ]);

    res.json({
      intervalo: { inicio, fim: hoje },
      porStatus,
      porNatureza,
      porDia,
    });
  } catch (err) {
    console.error('Erro ao gerar estatísticas do controle:', err);
    res.status(500).json({ erro: 'Erro interno ao gerar estatísticas' });
  }
});

module.exports = router;
