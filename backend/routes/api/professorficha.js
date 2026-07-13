// backend/routes/api/professorFicha.js
'use strict';

const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');

let calcularNotaTSMD;
try {
  calcularNotaTSMD = require('../../utils/calculoNota');
} catch {
  calcularNotaTSMD = null;
}

const PROJ_ALUNO_PROFESSOR =
  '_id nome turma comportamento dataEntrada instituicao';

const PROJ_NOTIF =
  '_id data createdAt tipo tipoMedida motivo valorNumerico artigo inciso classificacaoRegulamento quantidadeDias observacoes';

const PROJ_OBS =
  '_id texto autor criadoEm createdAt';

function normalizarTurma(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

router.get('/alunos/:id/ficha', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario || {};
    const instituicao = usuario.instituicao;

    if (!instituicao) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    if (usuario.tipo !== 'professor') {
      return res.status(403).json({ erro: 'Acesso permitido apenas para professor.' });
    }

    const aluno = await Aluno.findOne({
      _id: id,
      instituicao
    })
      .select(PROJ_ALUNO_PROFESSOR)
      .lean();

    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    // ✅ trava por turma do professor, se houver vínculo cadastrado
    const turmasProfessor = Array.isArray(usuario.turmas) ? usuario.turmas : [];
    if (turmasProfessor.length) {
      const turmaAluno = normalizarTurma(aluno.turma);
      const permitidas = turmasProfessor.map(normalizarTurma);
      if (!permitidas.includes(turmaAluno)) {
        return res.status(403).json({ erro: 'Professor sem permissão para acessar aluno desta turma.' });
      }
    }

    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao
    })
      .sort({ data: -1, createdAt: -1 })
      .select(PROJ_NOTIF)
      .lean();

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: String(instituicao)
    })
      .sort({ criadoEm: -1, createdAt: -1 })
      .select(PROJ_OBS)
      .lean();

    let notaComportamento =
      typeof aluno.comportamento === 'number' ? aluno.comportamento : 8.0;

    if (calcularNotaTSMD) {
      const eventos = (notificacoes || []).map((n) => ({
        data: n.data || n.createdAt,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
      }));

      try {
        const dataEntrada = aluno.dataEntrada ? new Date(aluno.dataEntrada) : null;
        notaComportamento = calcularNotaTSMD(dataEntrada, new Date(), eventos);
      } catch (e) {
        console.warn('Erro ao recalcular nota de comportamento (professor):', e?.message || e);
      }
    }

    res.set('Cache-Control', 'no-store');

    return res.json({
      aluno: {
        _id: aluno._id,
        nome: aluno.nome || null,
        turma: aluno.turma || null,
        comportamento: Number((+notaComportamento || 0).toFixed(2))
      },
      notificacoes: (notificacoes || []).map((n) => ({
        _id: n._id,
        data: n.data || n.createdAt || null,
        createdAt: n.createdAt || null,
        tipo: n.tipo || null,
        tipoMedida: n.tipoMedida || null,
        motivo: n.motivo || null,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : null,
        artigo: n.artigo || null,
        inciso: n.inciso || null,
        classificacaoRegulamento: n.classificacaoRegulamento || null,
        quantidadeDias: n.quantidadeDias || null,
        observacoes: n.observacoes || null
      })),
      observacoes: (observacoes || []).map((o) => ({
        _id: o._id,
        texto: o.texto || '',
        autor: o.autor || 'Não informado',
        criadoEm: o.criadoEm || o.createdAt || null
      }))
    });
  } catch (erro) {
    console.error('Erro ao montar ficha reduzida do professor:', erro);
    return res.status(500).json({ erro: 'Erro ao montar ficha do aluno para professor.' });
  }
});

module.exports = router;