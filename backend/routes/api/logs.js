const express = require('express');
const router = express.Router();
const Log = require('../../models/Log');
const { autenticar } = require('../../middleware/autenticacao');

/**
 * GET /api/logs
 * Lista os logs da instituição do usuário autenticado (paginado simples).
 * Query: ?limit=200&skip=0
 */
router.get('/', autenticar, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const skip = Math.max(parseInt(req.query.skip || '0', 10), 0);

    const total = await Log.countDocuments({ instituicao });

    const docs = await Log.find({ instituicao })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const data = docs.map(l => ({
      _id: l._id,
      usuarioNome: l.usuarioNome || null,
      usuarioTipo: l.usuarioTipo || null,
      usuario: l.usuarioNome
        ? `${l.usuarioNome}${l.usuarioTipo ? ` (${l.usuarioTipo})` : ''}`
        : (l.usuario || '—'),
      acao: l.acao || '—',
      entidade: l.entidade || '—',
      entidadeNome: l.entidadeNome || null,
      entidadeId: l.entidadeId || '—',
      alunoNome: l.alunoNome || null,
      detalhes: l.detalhes || {},
      createdAt: l.createdAt
    }));

    res.json({ total, skip, limit, data });
  } catch (err) {
    console.error('Erro ao listar logs:', err);
    res.status(500).json({ mensagem: 'Erro ao listar logs.' });
  }
});

module.exports = router;
