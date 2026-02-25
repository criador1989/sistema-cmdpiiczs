const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Observacao = require('../../models/Observacao');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');

// =====================
// Upload (multer)
// =====================
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'observacoes');

// garante pasta
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

// limites e filtro básico
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB por arquivo
    files: 8                    // até 8 arquivos por observação
  },
  fileFilter: (req, file, cb) => {
    // permite imagens, pdf, docs, xls, ppt, zip, txt
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

// helper: normaliza anexos do multer para salvar no mongo
function mapFilesToAnexos(files = []) {
  return files.map(f => ({
    nome: f.originalname,
    url: `/uploads/observacoes/${f.filename}`,
    mime: f.mimetype,
    tamanho: f.size,
    criadoEm: new Date()
  }));
}

// =====================
// Criar nova observação (com anexos)
// Aceita:
// - JSON: {texto}
// - multipart: texto + anexos/arquivos/files[]
// =====================
router.post('/:alunoId', autenticar, upload.any(), async (req, res) => {
  try {
    // quando vier multipart, o texto vem em req.body mesmo
    const { texto } = req.body;
    const { alunoId } = req.params;

    if (!texto) return res.status(400).json({ mensagem: 'Texto da observação é obrigatório.' });

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });

    const files = Array.isArray(req.files) ? req.files : [];
    const anexos = mapFilesToAnexos(files);

    const novaObs = new Observacao({
      aluno: aluno._id,
      texto,
      autor: req.usuario.nome,
      instituicao: req.usuario.instituicao,
      anexos
    });

    await novaObs.save();
    res.status(201).json(novaObs);
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);

    // se multer acusar erro:
    if (String(erro?.message || '').includes('Tipo de arquivo não permitido')) {
      return res.status(400).json({ mensagem: 'Tipo de arquivo não permitido.' });
    }
    if (String(erro?.message || '').toLowerCase().includes('file too large')) {
      return res.status(400).json({ mensagem: 'Arquivo muito grande. Máximo 10MB por arquivo.' });
    }

    res.status(500).json({ mensagem: 'Erro ao salvar observação.' });
  }
});

// Listar observações
router.get('/:alunoId', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ _id: req.params.alunoId, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado ou pertence a outra instituição.' });

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: req.usuario.instituicao
    }).sort({ criadoEm: -1 });

    res.json(observacoes);
  } catch (erro) {
    console.error('Erro ao buscar observações:', erro);
    res.status(500).json({ mensagem: 'Erro ao buscar observações.' });
  }
});

// Deletar observação (e apagar arquivos anexados)
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const observacao = await Observacao.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });
    if (!observacao) return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });

    // remove anexos do disco (best effort)
    if (Array.isArray(observacao.anexos)) {
      for (const a of observacao.anexos) {
        try {
          const url = String(a?.url || '');
          const fname = url.split('/').pop();
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

// Atualizar observação (mantém anexos antigos; pode adicionar novos)
router.put('/:id', autenticar, upload.any(), async (req, res) => {
  try {
    const { texto } = req.body;
    const observacao = await Observacao.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });

    if (!observacao) return res.status(404).json({ mensagem: 'Observação não encontrada ou pertence a outra instituição.' });

    if (typeof texto === 'string') observacao.texto = texto;

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length) {
      const anexosNovos = mapFilesToAnexos(files);
      observacao.anexos = Array.isArray(observacao.anexos) ? observacao.anexos.concat(anexosNovos) : anexosNovos;
    }

    await observacao.save();
    res.json({ mensagem: 'Observação atualizada com sucesso.', observacao });
  } catch (erro) {
    console.error('Erro ao atualizar observação:', erro);
    res.status(500).json({ mensagem: 'Erro ao atualizar observação.' });
  }
});

module.exports = router;