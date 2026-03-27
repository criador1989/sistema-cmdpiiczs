const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
let Observacao;
try { Observacao = require('../../models/Observacao'); } catch { Observacao = null; }

const calcularNotaTSMD = require('../../utils/calculoNota');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant, tenantFilter } = require('../../middleware/tenantScope');

function montarFotoUrl(valor) {
  if (!valor) return null;
  const s = String(valor).trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('/uploads/')) {
    return s;
  }
  return `/uploads/${s.replace(/^\/+/, '')}`;
}

function toObjectIdSafe(value) {
  return String(value || '').trim();
}

async function calcularNotaComportamento(req, alunoId) {
  const aluno = await Aluno.findOne(
    tenantFilter(req, { _id: alunoId })
  ).select('dataEntrada').lean();

  if (!aluno) return 8.0;

  const notificacoes = await Notificacao.find(
    tenantFilter(req, { aluno: alunoId })
  )
    .select('data valorNumerico createdAt quantidadeDias tipoMedida tipo natureza')
    .sort({ data: 1, createdAt: 1 })
    .lean();

  return calcularNotaTSMD(aluno.dataEntrada || null, new Date(), notificacoes || []);
}

router.get('/dados/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const alunoId = toObjectIdSafe(req.params.id);
    if (!alunoId) {
      return res.status(400).json({ erro: 'ID do aluno inválido.' });
    }

    const aluno = await Aluno.findOne(
      tenantFilter(req, { _id: alunoId })
    ).lean();

    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    const fotoBase = aluno.fotoOriginal || aluno.foto || aluno.fotoThumb || aluno.fotoArquivo || aluno.avatar || null;
    const fotoUrl = montarFotoUrl(fotoBase);

    const notificacoes = await Notificacao.find(
      tenantFilter(req, { aluno: alunoId })
    )
      .sort({ data: -1, createdAt: -1 })
      .lean();

    let observacoes = [];
    if (Observacao) {
      observacoes = await Observacao.find(
        tenantFilter(req, { aluno: alunoId })
      )
        .sort({ createdAt: -1, criadoEm: -1 })
        .lean();
    }

    let nota = typeof aluno.comportamento === 'number' ? aluno.comportamento : 8.0;
    try {
      nota = await calcularNotaComportamento(req, alunoId);
    } catch (e) {
      console.error(`Erro ao calcular nota para aluno ${alunoId}:`, e?.message || e);
    }

    nota = Number((Number(nota) || 0).toFixed(2));

    return res.json({
      aluno: {
        ...aluno,
        fotoUrl,
        comportamento: nota,
        notaComportamental: nota
      },
      comportamento: nota,
      notificacoes,
      observacoes
    });
  } catch (err) {
    console.error('Erro ao buscar ficha do aluno:', err);
    return res.status(500).json({ erro: 'Erro ao carregar dados da ficha.' });
  }
});

router.post('/salvar/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const alunoId = toObjectIdSafe(req.params.id);
    const texto = String(req.body?.texto || '').trim();

    if (!alunoId) {
      return res.status(400).json({ erro: 'ID do aluno inválido.' });
    }

    if (!texto) {
      return res.status(400).json({ erro: 'Texto da observação é obrigatório.' });
    }

    const aluno = await Aluno.findOne(
      tenantFilter(req, { _id: alunoId })
    )
      .select('_id nome turma')
      .lean();

    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    if (!Observacao) {
      return res.json({ mensagem: 'Observação recebida com sucesso (model Observacao não disponível neste ambiente).' });
    }

    const autor = req.usuario?.nome || req.usuario?.email || 'Sistema';

    const novaObs = await Observacao.create({
      aluno: aluno._id,
      instituicao: req.instituicaoId,
      texto,
      autor,
      criadoEm: new Date()
    });

    return res.json({
      mensagem: 'Observação salva com sucesso.',
      observacao: {
        _id: novaObs._id,
        texto: novaObs.texto,
        autor: novaObs.autor,
        criadoEm: novaObs.criadoEm || novaObs.createdAt || new Date()
      }
    });
  } catch (err) {
    console.error('Erro ao salvar observação da ficha:', err);
    return res.status(500).json({ erro: 'Erro ao salvar observação.' });
  }
});

module.exports = router;
