// backend/routes/api/publicAluno.js
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');
const { logAction, attachActor } = require('../../utils/audit');

// Base URL para montar o link público
function getBaseURL(req){
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// -------------------- ADMIN (precisa estar logado) --------------------

// Habilitar acesso público e gerar/renovar token
router.post('/alunos/:id/public/enable', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresDays } = req.body || {}; // opcional (número)
    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

    // gera token novo se não existir
    const token = aluno.publicView?.token || crypto.randomBytes(16).toString('hex');
    const now = new Date();
    let expiresAt = null;
    if (Number.isFinite(+expiresDays) && +expiresDays > 0) {
      expiresAt = new Date(now.getTime() + (+expiresDays) * 24 * 60 * 60 * 1000);
    }

    aluno.publicView = {
      enabled: true,
      token,
      createdAt: now,
      expiresAt: expiresAt || null
    };
    await aluno.save();

    const base = getBaseURL(req);
    const url = `${base}/ficha-publica.html?token=${token}`;
    const qrCode = await QRCode.toDataURL(url, { width: 300, margin: 1 });

    // LOG
    await logAction({
      req,
      acao: 'ALUNO_PUBLIC_ENABLE',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      entidadeNome: aluno.nome,
      extra: {
        alunoId: String(aluno._id),
        alunoNome: aluno.nome,
        alunoTurma: aluno.turma,
        token,
        expiresAt
      }
    });

    res.json({ url, token, qrCode, expiresAt });
  } catch (err) {
    console.error('enable public error:', err);
    res.status(500).json({ error: 'Erro ao habilitar acesso público.' });
  }
});

// Desabilitar acesso público (revoga link)
router.post('/alunos/:id/public/disable', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' });

    aluno.publicView = {
      enabled: false,
      token: null,
      createdAt: null,
      expiresAt: null
    };
    await aluno.save();

    await logAction({
      req,
      acao: 'ALUNO_PUBLIC_DISABLE',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      entidadeNome: aluno.nome,
      extra: {
        alunoId: String(aluno._id),
        alunoNome: aluno.nome,
        alunoTurma: aluno.turma
      }
    });

    res.json({ message: 'Acesso público desabilitado com sucesso.' });
  } catch (err) {
    console.error('disable public error:', err);
    res.status(500).json({ error: 'Erro ao desabilitar acesso público.' });
  }
});

// Gerar QR novamente (sem mexer no token, desde que enabled)
router.get('/alunos/:id/public/qrcode', autenticar, attachActor, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });
    if (!aluno || !aluno.publicView?.enabled || !aluno.publicView?.token) {
      return res.status(400).json({ error: 'Acesso público não está habilitado para este aluno.' });
    }
    const base = getBaseURL(req);
    const url = `${base}/ficha-publica.html?token=${aluno.publicView.token}`;
    const qrCode = await QRCode.toDataURL(url, { width: 300, margin: 1 });
    res.json({ url, token: aluno.publicView.token, qrCode, expiresAt: aluno.publicView.expiresAt || null });
  } catch (err) {
    console.error('qrcode error:', err);
    res.status(500).json({ error: 'Erro ao gerar QR Code.' });
  }
});

// -------------------- PÚBLICO (NÃO precisa login) --------------------
// Ficha pública por token (somente leitura)
router.get('/public/alunos/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token inválido.' });

    const aluno = await Aluno.findOne({ 'publicView.token': token, 'publicView.enabled': true })
      .select('nome turma comportamento dataEntrada instituicao publicView')
      .lean();

    if (!aluno) return res.status(404).json({ error: 'Link inválido ou desabilitado.' });

    if (aluno.publicView?.expiresAt && new Date(aluno.publicView.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link expirado.' });
    }

    // Notificações: apenas dados essenciais, nada editável
    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao: aluno.instituicao
    })
      .select('data natureza tipo tipoMedida motivo valorNumerico numeroSequencial status')
      .sort({ data: -1, createdAt: -1 })
      .lean();

    res.json({
      aluno: {
        nome: aluno.nome,
        turma: aluno.turma,
        comportamento: aluno.comportamento,
        dataEntrada: aluno.dataEntrada
      },
      notificacoes
    });
  } catch (err) {
    console.error('public ficha error:', err);
    res.status(500).json({ error: 'Erro ao carregar ficha pública.' });
  }
});

module.exports = router;
