// backend/routes/api/masterInstituicoes.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

function normSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

router.get('/instituicoes', async (_req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const list = await Instituicao.find({})
      .select('_id nome sigla slug ativo')
      .sort({ nome: 1 })
      .lean();

    res.json({ instituicoes: list || [] });
  } catch (e) {
    res.status(500).json({ mensagem: 'Erro ao listar instituições.', erro: String(e.message || e) });
  }
});

router.post('/instituicoes', async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');

    const nome = String(req.body?.nome || '').trim();
    const sigla = String(req.body?.sigla || '').trim();
    const slug = normSlug(req.body?.slug || sigla || nome);

    if (!nome || nome.length < 3) return res.status(400).json({ mensagem: 'Informe um nome válido.' });
    if (!slug || slug.length < 3) return res.status(400).json({ mensagem: 'Slug inválido.' });

    // evita duplicidade
    const exists = await Instituicao.findOne({ slug }).select('_id').lean().catch(() => null);
    if (exists) return res.status(409).json({ mensagem: 'Já existe uma instituição com esse slug.' });

    const inst = await Instituicao.create({
      nome,
      sigla: sigla || null,
      slug,
      ativo: true,
    });

    return res.status(201).json({
      mensagem: 'Instituição criada.',
      instituicao: { id: String(inst._id), nome: inst.nome, sigla: inst.sigla, slug: inst.slug, ativo: inst.ativo },
      links: {
        login: `/login.html?t=${encodeURIComponent(slug)}`,
        cadastro: `/cadastro-usuario.html?t=${encodeURIComponent(slug)}`
      }
    });
  } catch (e) {
    res.status(500).json({ mensagem: 'Erro ao criar instituição.', erro: String(e.message || e) });
  }
});

router.patch('/instituicoes/:id', async (req, res) => {
  try {
    const Instituicao = mongoose.models.Instituicao || mongoose.model('Instituicao');
    const id = String(req.params.id || '').trim();
    const ativo = !!req.body?.ativo;

    const up = await Instituicao.findByIdAndUpdate(id, { $set: { ativo } }, { new: true })
      .select('_id nome sigla slug ativo')
      .lean();

    if (!up) return res.status(404).json({ mensagem: 'Instituição não encontrada.' });

    res.json({ mensagem: 'Atualizado.', instituicao: up });
  } catch (e) {
    res.status(500).json({ mensagem: 'Erro ao atualizar.', erro: String(e.message || e) });
  }
});

module.exports = router;
