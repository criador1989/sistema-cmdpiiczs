const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Log = require('../../models/Log');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

/* =========================================================
   HELPERS MULTI-TENANT
========================================================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

/**
 * GET /api/logs
 * Lista os logs da instituição do usuário autenticado (paginado simples).
 * Query: ?limit=200&skip=0
 */
router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ mensagem: 'Tenant não identificado.' });
    }

    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const skip = Math.max(parseInt(req.query.skip || '0', 10), 0);

    const filtro = buildTenantMatch(tenantId);

    const total = await Log.countDocuments(filtro);

    const docs = await Log.find(filtro)
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