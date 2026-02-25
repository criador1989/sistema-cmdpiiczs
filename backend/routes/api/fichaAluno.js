// backend/routes/api/fichaAluno.js
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

function toPublicUrl(p) {
  if (!p) return null;
  let s = String(p).trim().replace(/\\/g, '/');
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
  if (!/^\/?uploads\//i.test(s)) s = 'uploads/' + s.replace(/^\/+/, '');
  return '/' + s.replace(/^\/+/, '');
}

// ✅ FIX: incluir "contatos" na projeção do aluno
const PROJ_ALUNO =
  'nome turma dataEntrada nascimento nomePai nomeMae telefone endereco foto fotoCaminho instituicao updatedAt createdAt codigoAcesso comportamento contatos';

const PROJ_NOTIF =
  'data tipo tipoMedida motivo valorNumerico artigo inciso classificacaoRegulamento quantidadeDias observacoes createdAt';

// ✅ opcional: se futuramente observação tiver anexos, já deixo preparado (não quebra nada se não existir)
const PROJ_OBS = 'texto autor criadoEm anexos attachments files';

router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const instituicao = req.usuario?.instituicao;
    if (!instituicao) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const aluno = await Aluno.findOne({ _id: id, instituicao }).select(PROJ_ALUNO).lean();
    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    const notificacoes = await Notificacao.find({ aluno: aluno._id, instituicao })
      .sort({ data: 1, createdAt: 1 })
      .select(PROJ_NOTIF)
      .lean();

    const instStr = String(instituicao);
    const observacoes = await Observacao.find({ aluno: aluno._id, instituicao: instStr })
      .sort({ criadoEm: -1 })
      .select(PROJ_OBS)
      .lean();

    let notaComportamento =
      typeof aluno.comportamento === 'number' ? aluno.comportamento : 8.0;

    if (calcularNotaTSMD) {
      const eventos = (notificacoes || []).map(n => ({
        data: n.data || n.createdAt,
        valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : 0,
      }));

      try {
        const dataEntrada = aluno.dataEntrada ? new Date(aluno.dataEntrada) : null;
        notaComportamento = calcularNotaTSMD(dataEntrada, new Date(), eventos);
      } catch (e) {
        console.warn('Erro ao recalcular nota de comportamento:', e?.message || e);
      }
    }

    const fotoUrl = toPublicUrl(aluno.foto || aluno.fotoThumb || null);

    const isProfessor = req.usuario?.tipo === 'professor';

    // ✅ FIX: evitar cache que “mascara” a atualização (era private, max-age=15)
    res.set('Cache-Control', 'no-store');

    // ✅ FIX: devolver contatos dentro do aluno (sem esconder)
    const contatos = aluno.contatos || {};

    res.json({
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        dataEntrada: aluno.dataEntrada || null,
        nascimento: aluno.nascimento || null,
        nomePai: aluno.nomePai || null,
        nomeMae: aluno.nomeMae || null,
        telefone: aluno.telefone || null,
        endereco: aluno.endereco || null,
        codigoAcesso: isProfessor ? null : (aluno.codigoAcesso || null),
        comportamento: Number((+notaComportamento || 0).toFixed(2)),
        foto: aluno.foto || null,
        fotoThumb: aluno.fotoThumb || null,
        fotoUrl,

        // ✅ NOVO: contatos (isso resolve seu editor voltar vazio)
        contatos: {
          emailResponsavel: contatos.emailResponsavel || null,
          whatsapp: contatos.whatsapp || null,
          telegramChatId: contatos.telegramChatId || null,
        },
      },
      notificacoes,
      observacoes,
    });
  } catch (erro) {
    console.error('Erro ao montar ficha do aluno:', erro);
    res.status(500).json({ erro: 'Erro ao montar ficha do aluno.' });
  }
});

router.post('/salvar/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    const instituicao = req.usuario?.instituicao;
    const autor = req.usuario?.nome || req.usuario?.email || 'Sistema';

    if (!instituicao) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    if (!texto || String(texto).trim().length === 0) {
      return res.status(400).json({ erro: 'Texto da observação é obrigatório.' });
    }

    const exists = await Aluno.exists({ _id: id, instituicao });
    if (!exists) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    const novaObs = await Observacao.create({
      aluno: id,
      instituicao: String(instituicao),
      texto: String(texto).trim(),
      autor,
    });

    res.json({
      mensagem: 'Observação salva com sucesso.',
      observacao: {
        _id: novaObs._id,
        texto: novaObs.texto,
        autor: novaObs.autor,
        criadoEm: novaObs.criadoEm,
      },
    });
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);
    res.status(500).json({ erro: 'Erro ao salvar observação.' });
  }
});

module.exports = router;