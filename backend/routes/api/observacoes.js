const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');

const Observacao = require('../../models/Observacao');
const Aluno = require('../../models/Aluno');
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

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

/* =====================
   Upload (multer)
===================== */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'observacoes');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeOriginal = String(file.originalname || 'arquivo')
      .replace(/[^\w.\-() ]+/g, '_')
      .replace(/\s+/g, '_');

    const ext = path.extname(safeOriginal) || '';
    const base = path.basename(safeOriginal, ext);
    const stamp = Date.now();
    cb(null, `${base}_${stamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed'
    ];

    const mt = (file.mimetype || '').toLowerCase();
    const ok = allowed.some(a => a.endsWith('/') ? mt.startsWith(a) : mt === a);
    if (!ok) return cb(new Error('Tipo de arquivo não permitido.'));
    cb(null, true);
  }
});

function mapFilesToAnexos(files = []) {
  return files.map(f => ({
    nome: f.originalname,
    url: `/uploads/observacoes/${f.filename}`,
    mime: f.mimetype,
    tamanho: f.size,
    criadoEm: new Date()
  }));
}

/* =========================================================
   CRIAR OBSERVAÇÃO
========================================================= */
router.post('/:alunoId', autenticar, requireTenant, upload.any(), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { texto } = req.body;
    const { alunoId } = req.params;

    if (!texto) {
      return res.status(400).json({ mensagem: 'Texto da observação é obrigatório.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      ...buildTenantMatch(tenantId)
    });

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    const anexos = mapFilesToAnexos(req.files || []);

    const novaObs = new Observacao(
      tenantData(req, {
        aluno: aluno._id,
        texto,
        autor: req.usuario.nome,
        anexos
      })
    );

    await novaObs.save();
    res.status(201).json(novaObs);
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao salvar observação.' });
  }
});

/* =========================================================
   LISTAR
========================================================= */
router.get('/:alunoId', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);

    const aluno = await Aluno.findOne({
      _id: req.params.alunoId,
      ...buildTenantMatch(tenantId)
    });

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });
    }

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      ...buildTenantMatch(tenantId)
    }).sort({ criadoEm: -1 });

    res.json(observacoes);
  } catch (erro) {
    console.error('Erro ao buscar observações:', erro);
    res.status(500).json({ mensagem: 'Erro ao buscar observações.' });
  }
});

/* =========================================================
   DELETE
========================================================= */
router.delete('/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);

    const observacao = await Observacao.findOne({
      _id: req.params.id,
      ...buildTenantMatch(tenantId)
    });

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });
    }

    if (Array.isArray(observacao.anexos)) {
      for (const a of observacao.anexos) {
        try {
          const fname = String(a?.url || '').split('/').pop();
          if (!fname) continue;
          const fp = path.join(UPLOAD_DIR, fname);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (_) {}
      }
    }

    await observacao.deleteOne();
    res.json({ mensagem: 'Observação excluída com sucesso.' });
  } catch (erro) {
    console.error('Erro ao excluir observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao excluir observação.' });
  }
});

/* =========================================================
   UPDATE
========================================================= */
router.put('/:id', autenticar, requireTenant, upload.any(), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { texto } = req.body;

    const observacao = await Observacao.findOne({
      _id: req.params.id,
      ...buildTenantMatch(tenantId)
    });

    if (!observacao) {
      return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });
    }

    if (typeof texto === 'string') {
      observacao.texto = texto;
    }

    if (req.files?.length) {
      const anexosNovos = mapFilesToAnexos(req.files);
      observacao.anexos = [
        ...(observacao.anexos || []),
        ...anexosNovos
      ];
    }

    await observacao.save();
    res.json({ mensagem: 'Observação atualizada com sucesso.', observacao });
  } catch (erro) {
    console.error('Erro ao atualizar observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao atualizar observação.' });
  }
});

module.exports = router;