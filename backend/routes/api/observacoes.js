// routes/api/observacoes.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Observacao = require('../../models/Observacao');
const Aluno = require('../../models/Aluno');

const { autenticar, apenasLeitura, apenasMonitorOuAdmin } = require('../../middleware/autenticacao');

/* =========================
   ✅ TENANT HELPERS
   ========================= */
const ALLOW_LEGACY_NO_TENANT =
  String(process.env.ALLOW_LEGACY_NO_TENANT || '').toLowerCase() === 'true';

function buildInstMatch(inst) {
  const asStr = String(inst || '').trim();
  const ors = [];

  if (ALLOW_LEGACY_NO_TENANT) {
    ors.push({ instituicao: { $exists: false } }, { instituicao: null });
  }

  if (asStr) {
    ors.push({ instituicao: asStr });
    if (mongoose.isValidObjectId(asStr)) {
      ors.push({ instituicao: new mongoose.Types.ObjectId(asStr) });
    }
  }

  if (ors.length === 1) return ors[0];
  return { $or: ors };
}

function isObjectId(v) {
  return mongoose.isValidObjectId(String(v || '').trim());
}

/* =========================
   ROTAS
   ========================= */

/**
 * ✅ Criar nova observação (SENSÍVEL -> monitor/admin)
 * POST /api/observacoes/:alunoId
 */
router.post('/:alunoId', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ mensagem: 'Não autenticado.' });

    const alunoId = String(req.params.alunoId || '').trim();
    if (!isObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'alunoId inválido.' });
    }

    const texto = String(req.body?.texto || '').trim();
    if (!texto || texto.length < 2) {
      return res.status(400).json({ mensagem: 'Texto da observação é obrigatório.' });
    }

    // garante que aluno pertence ao tenant
    const aluno = await Aluno.findOne({ _id: alunoId, ...buildInstMatch(inst) })
      .select('_id nome turma instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    const novaObs = await Observacao.create({
      aluno: aluno._id,
      texto,
      autor: req.usuario.nome || '—',
      instituicao: inst
    });

    return res.status(201).json(novaObs);
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);
    return res.status(500).json({ mensagem: 'Erro ao salvar observação.' });
  }
});

/**
 * ✅ Listar observações (LEITURA -> professor/monitor/admin)
 * GET /api/observacoes/:alunoId
 */
router.get('/:alunoId', autenticar, apenasLeitura, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ mensagem: 'Não autenticado.' });

    const alunoId = String(req.params.alunoId || '').trim();
    if (!isObjectId(alunoId)) {
      return res.status(400).json({ mensagem: 'alunoId inválido.' });
    }

    // garante aluno do tenant
    const aluno = await Aluno.findOne({ _id: alunoId, ...buildInstMatch(inst) })
      .select('_id')
      .lean();

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    // ordena por criadoEm ou createdAt (fallback)
    const observacoes = await Observacao.find({
      aluno: aluno._id,
      ...buildInstMatch(inst)
    })
      .sort({ criadoEm: -1, createdAt: -1 });

    return res.json(observacoes);
  } catch (erro) {
    console.error('Erro ao buscar observações:', erro);
    return res.status(500).json({ mensagem: 'Erro ao buscar observações.' });
  }
});

/**
 * ✅ Deletar observação (SENSÍVEL -> monitor/admin)
 * DELETE /api/observacoes/:id
 */
router.delete('/:id', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ mensagem: 'Não autenticado.' });

    const id = String(req.params.id || '').trim();
    if (!isObjectId(id)) {
      return res.status(400).json({ mensagem: 'id inválido.' });
    }

    const observacao = await Observacao.findOne({ _id: id, ...buildInstMatch(inst) });
    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });
    }

    await observacao.deleteOne();
    return res.json({ mensagem: 'Observação excluída com sucesso.' });
  } catch (erro) {
    console.error('Erro ao excluir observação:', erro);
    return res.status(500).json({ mensagem: 'Erro ao excluir observação.' });
  }
});

/**
 * ✅ Atualizar observação (SENSÍVEL -> monitor/admin)
 * PUT /api/observacoes/:id
 */
router.put('/:id', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ mensagem: 'Não autenticado.' });

    const id = String(req.params.id || '').trim();
    if (!isObjectId(id)) {
      return res.status(400).json({ mensagem: 'id inválido.' });
    }

    const texto = String(req.body?.texto || '').trim();
    if (!texto || texto.length < 2) {
      return res.status(400).json({ mensagem: 'Texto da observação é obrigatório.' });
    }

    const observacao = await Observacao.findOne({ _id: id, ...buildInstMatch(inst) });
    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });
    }

    observacao.texto = texto;
    await observacao.save();

    return res.json({ mensagem: 'Observação atualizada com sucesso.' });
  } catch (erro) {
    console.error('Erro ao atualizar observação:', erro);
    return res.status(500).json({ mensagem: 'Erro ao atualizar observação.' });
  }
});

module.exports = router;
