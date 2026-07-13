'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const Instituicao = require('../../models/Instituicao');
const { autenticar } = require('../../middleware/autenticacao');
const { montarContextoPortal } = require('../../services/portalAlunoService');

const router = express.Router();

router.use(autenticar);

function idUsuario(req) {
  return req.usuario?.id || req.usuario?._id || null;
}

function idAluno(req) {
  return req.usuario?.alunoId || null;
}

function idInstituicao(req) {
  return req.usuario?.instituicao || req.usuario?.tenantId || null;
}

function filtroInstituicao(valor) {
  if (!valor) return null;

  const candidatos = [String(valor).trim()].filter(Boolean);
  if (mongoose.Types.ObjectId.isValid(String(valor))) {
    candidatos.push(new mongoose.Types.ObjectId(String(valor)));
  }

  return {
    $or: [
      { instituicao: { $in: candidatos } },
      { tenantId: { $in: candidatos } }
    ]
  };
}

router.get('/contexto', async (req, res) => {
  try {
    const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);

    if (tipo !== 'aluno') {
      return res.status(403).json({
        ok: false,
        mensagem: 'Esta rota é exclusiva do portal do aluno.'
      });
    }

    if (!alunoId || !instituicaoId) {
      return res.status(400).json({
        ok: false,
        mensagem: 'O vínculo do aluno ou da instituição não foi identificado.'
      });
    }

    const escopo = filtroInstituicao(instituicaoId);
    const aluno = await Aluno.findOne({
      _id: alunoId,
      ...(escopo || {})
    })
      .select('_id nome turma codigoAcesso foto fotoOriginal fotoMedium fotoThumb instituicao tenantId ativo')
      .lean();

    if (!aluno || aluno.ativo === false) {
      return res.status(404).json({
        ok: false,
        mensagem: 'Aluno não encontrado ou inativo.'
      });
    }

    let instituicao = null;
    const instRef = aluno.instituicao || aluno.tenantId || instituicaoId;

    if (mongoose.Types.ObjectId.isValid(String(instRef))) {
      instituicao = await Instituicao.findById(instRef)
        .select('_id nome sigla slug')
        .lean()
        .catch(() => null);
    }

    const portal = montarContextoPortal(aluno.turma);

    return res.json({
      ok: true,
      portal,
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || null,
        foto: aluno.fotoOriginal || aluno.fotoMedium || aluno.fotoThumb || aluno.foto || null,
        fotoThumbUrl: `/api/imagens/thumb/${aluno._id}`
      },
      instituicao: instituicao
        ? {
            _id: instituicao._id,
            nome: instituicao.nome,
            sigla: instituicao.sigla || null,
            slug: instituicao.slug || null
          }
        : {
            _id: String(instituicaoId),
            nome: null,
            sigla: null,
            slug: null
          },
      sessao: {
        usuarioId: idUsuario(req),
        tipo
      }
    });
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET /contexto:', error);
    return res.status(500).json({
      ok: false,
      mensagem: 'Não foi possível carregar o contexto do portal do aluno.'
    });
  }
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, modulo: 'portal-aluno', versao: '1.0.0' });
});

module.exports = router;
