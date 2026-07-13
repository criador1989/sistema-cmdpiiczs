'use strict';

const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');

function toPublicUrl(p) {
  if (!p) return null;
  let s = String(p).trim().replace(/\\/g, '/');
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
  if (!/^\/?uploads\//i.test(s)) s = 'uploads/' + s.replace(/^\/+/, '');
  return '/' + s.replace(/^\/+/, '');
}

router.get('/', autenticar, async (req, res) => {
  try {
    const usuario = req.usuario || {};
    const instituicao = usuario.instituicao;
    const alunoId = usuario.alunoId;

    if (usuario.tipo !== 'responsavel') {
      return res.status(403).json({
        mensagem: 'Acesso permitido apenas ao responsável.'
      });
    }

    if (!instituicao || !alunoId) {
      return res.status(401).json({
        mensagem: 'Sessão inválida para acesso do responsável.'
      });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao
    })
      .select('nome turma comportamento dataEntrada nascimento foto fotoOriginal fotoThumb codigoAcesso instituicao')
      .lean();

    if (!aluno) {
      return res.status(404).json({
        mensagem: 'Aluno vinculado não encontrado nesta instituição.'
      });
    }

    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao,
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select('data natureza tipo tipoMedida motivo valorNumerico numeroSequencial status createdAt')
      .sort({ data: -1, createdAt: -1 })
      .lean();

    const observacoes = await Observacao.find({
      aluno: aluno._id,
      instituicao: String(instituicao)
    })
      .select('texto autor criadoEm createdAt')
      .sort({ criadoEm: -1, createdAt: -1 })
      .lean()
      .catch(() => []);

    res.set('Cache-Control', 'no-store');

    return res.json({
      aluno: {
        _id: aluno._id,
        nome: aluno.nome || null,
        turma: aluno.turma || null,
        comportamento: aluno.comportamento ?? 8.0,
        dataEntrada: aluno.dataEntrada || null,
        nascimento: aluno.nascimento || null,

        fotoUrl: toPublicUrl(aluno.fotoOriginal || aluno.foto || aluno.fotoThumb || null),
        fotoThumbUrl: toPublicUrl(aluno.fotoThumb || aluno.fotoOriginal || aluno.foto || null)
      },
      notificacoes,
      observacoes
    });
  } catch (erro) {
    console.error('[fichaResponsavel] erro:', erro);
    return res.status(500).json({
      mensagem: 'Erro ao carregar ficha do responsável.'
    });
  }
});

module.exports = router;