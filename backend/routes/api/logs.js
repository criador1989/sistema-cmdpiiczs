// backend/routes/api/logs.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Log = require('../../models/Log');
const { autenticar } = require('../../middleware/autenticacao');

const ALLOW_LEGACY_NO_TENANT =
  String(process.env.ALLOW_LEGACY_NO_TENANT || '').toLowerCase() === 'true';

function buildInstMatch(inst) {
  const asStr = String(inst || '').trim();
  const ors = [];

  // opcional: mostra logs antigos que não tinham instituicao
  if (ALLOW_LEGACY_NO_TENANT) {
    ors.push({ instituicao: { $exists: false } }, { instituicao: null });
  }

  if (asStr) {
    // seu schema salva como String, então este é o principal:
    ors.push({ instituicao: asStr });

    // tolerância: se em algum lugar antigo alguém gravou ObjectId (não deveria, mas vai que)
    if (mongoose.isValidObjectId(asStr)) {
      ors.push({ instituicao: new mongoose.Types.ObjectId(asStr) });
    }
  }

  if (!ors.length) return {};
  if (ors.length === 1) return ors[0];
  return { $or: ors };
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/logs
 * Lista logs da instituição do usuário autenticado (paginado simples).
 * Query:
 *   ?limit=200&skip=0
 *   &q=texto
 *   &acao=...
 *   &entidade=...
 *   &alunoId=... (ObjectId do aluno)
 */
router.get('/', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ mensagem: 'Não autenticado.' });

    const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10), 1), 500);
    const skip = Math.max(parseInt(req.query.skip || '0', 10), 0);

    const q = String(req.query.q || '').trim();
    const acao = String(req.query.acao || '').trim();
    const entidade = String(req.query.entidade || '').trim();
    const alunoId = String(req.query.alunoId || '').trim();

    const filtro = { ...buildInstMatch(inst) };

    if (acao) filtro.acao = acao;
    if (entidade) filtro.entidade = entidade;

    // filtro por aluno
    if (alunoId) {
      const ors = [];

      // 1) campo aluno (ObjectId)
      if (mongoose.isValidObjectId(alunoId)) {
        ors.push({ aluno: new mongoose.Types.ObjectId(alunoId) });
      }

      // 2) entidadeId às vezes é o aluno (string)
      ors.push({ entidadeId: alunoId });

      // 3) detalhes pode ter alunoId
      ors.push({ 'detalhes.alunoId': alunoId });
      if (mongoose.isValidObjectId(alunoId)) {
        const oid = new mongoose.Types.ObjectId(alunoId);
        ors.push({ 'detalhes.alunoId': oid });
      }

      // combina com qualquer $or já existente
      filtro.$and = filtro.$and || [];
      filtro.$and.push({ $or: ors });
    }

    // busca textual leve
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const ors = [
        { usuarioNome: rx },
        { usuarioTipo: rx },
        { usuarioEmail: rx },
        { acao: rx },
        { entidade: rx },
        { entidadeNome: rx },
        { entidadeId: rx },
        { alunoNome: rx }
      ];

      filtro.$and = filtro.$and || [];
      filtro.$and.push({ $or: ors });
    }

    const [total, docs] = await Promise.all([
      Log.countDocuments(filtro),
      Log.find(filtro)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const data = (docs || []).map((l) => ({
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
