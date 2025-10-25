// backend/routes/aph.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Aph = require('../models/AphAtendimento');

// Se você tiver middleware de auth, descomente e use:
// const requireAuth = require('../middlewares/requireAuth');

// Helpers
function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

/**
 * GET /api/aph/atendimentos/count/:alunoId
 * Contagem de atendimentos do aluno
 */
router.get('/atendimentos/count/:alunoId', /*requireAuth,*/ async (req, res) => {
  const alunoId = toObjectId(req.params.alunoId);
  if (!alunoId) return res.status(400).json({ error: 'alunoId inválido' });

  try {
    const count = await Aph.countDocuments({ alunoId });
    return res.json({ count });
  } catch (e) {
    console.error('APH count error:', e);
    return res.status(500).json({ error: 'Falha ao contar atendimentos' });
  }
});

/**
 * GET /api/aph/atendimentos/:alunoId?limit=&page=
 * Lista paginada (mais recente primeiro)
 */
router.get('/atendimentos/:alunoId', /*requireAuth,*/ async (req, res) => {
  const alunoId = toObjectId(req.params.alunoId);
  if (!alunoId) return res.status(400).json({ error: 'alunoId inválido' });

  const limit = clamp(parseInt(req.query.limit || '20', 10) || 20, 1, 100);
  const page = clamp(parseInt(req.query.page || '1', 10) || 1, 1, 1000000);
  const skip = (page - 1) * limit;

  try {
    const [items, total] = await Promise.all([
      Aph.find({ alunoId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Aph.countDocuments({ alunoId }),
    ]);
    return res.json({
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error('APH list error:', e);
    return res.status(500).json({ error: 'Falha ao listar atendimentos' });
  }
});

/**
 * GET /api/aph/atendimento/:id
 * Busca um atendimento
 */
router.get('/atendimento/:id', /*requireAuth,*/ async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  try {
    const item = await Aph.findById(id).lean();
    if (!item) return res.status(404).json({ error: 'Não encontrado' });
    return res.json(item);
  } catch (e) {
    console.error('APH get error:', e);
    return res.status(500).json({ error: 'Falha ao obter atendimento' });
  }
});

/**
 * POST /api/aph/atendimentos/:alunoId
 * Cria um novo atendimento
 * Body esperado (JSON):
 * {
 *   responsavel, local, hora,
 *   tipos: [string], materiais: [string],
 *   observacoes,
 *   responsaveisInformados, meioComunicacao, encaminhamento
 * }
 */
router.post('/atendimentos/:alunoId', /*requireAuth,*/ async (req, res) => {
  const alunoId = toObjectId(req.params.alunoId);
  if (!alunoId) return res.status(400).json({ error: 'alunoId inválido' });

  // Sanitização simples
  const body = req.body || {};
  const payload = {
    alunoId,
    responsavel: String(body.responsavel || '').trim().slice(0, 120),
    local: String(body.local || '').trim().slice(0, 80),
    hora: String(body.hora || '').trim().slice(0, 10),
    tipos: Array.isArray(body.tipos) ? body.tipos.map(String).slice(0, 40) : [],
    materiais: Array.isArray(body.materiais) ? body.materiais.map(String).slice(0, 80) : [],
    observacoes: String(body.observacoes || '').trim().slice(0, 8000),
    responsaveisInformados: String(body.responsaveisInformados || '').trim().slice(0, 10),
    meioComunicacao: String(body.meioComunicacao || '').trim().slice(0, 20),
    encaminhamento: String(body.encaminhamento || '').trim().slice(0, 300),
    // criadoPor: req.user?.nome || '', // se tiver auth
  };

  try {
    const created = await Aph.create(payload);
    return res.status(201).json(created);
  } catch (e) {
    console.error('APH create error:', e);
    return res.status(500).json({ error: 'Falha ao criar atendimento' });
  }
});

/**
 * PUT /api/aph/atendimento/:id
 * Atualiza campos
 */
router.put('/atendimento/:id', /*requireAuth,*/ async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  const body = req.body || {};
  const set = {};
  const assign = (k, v) => { if (v !== undefined) set[k] = v; };

  assign('responsavel', String(body.responsavel || '').trim().slice(0, 120));
  assign('local', String(body.local || '').trim().slice(0, 80));
  assign('hora', String(body.hora || '').trim().slice(0, 10));
  if (Array.isArray(body.tipos)) assign('tipos', body.tipos.map(String).slice(0, 40));
  if (Array.isArray(body.materiais)) assign('materiais', body.materiais.map(String).slice(0, 80));
  assign('observacoes', String(body.observacoes || '').trim().slice(0, 8000));
  assign('responsaveisInformados', String(body.responsaveisInformados || '').trim().slice(0, 10));
  assign('meioComunicacao', String(body.meioComunicacao || '').trim().slice(0, 20));
  assign('encaminhamento', String(body.encaminhamento || '').trim().slice(0, 300));

  try {
    const updated = await Aph.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Não encontrado' });
    return res.json(updated);
  } catch (e) {
    console.error('APH update error:', e);
    return res.status(500).json({ error: 'Falha ao atualizar atendimento' });
  }
});

/**
 * DELETE /api/aph/atendimento/:id
 */
router.delete('/atendimento/:id', /*requireAuth,*/ async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  try {
    const del = await Aph.findByIdAndDelete(id).lean();
    if (!del) return res.status(404).json({ error: 'Não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('APH delete error:', e);
    return res.status(500).json({ error: 'Falha ao remover atendimento' });
  }
});

module.exports = router;
