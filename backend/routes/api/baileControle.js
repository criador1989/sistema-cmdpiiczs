'use strict';

const express = require('express');

const BaileControle = require('../../models/BaileControle');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');

const router = express.Router();

const CAPACIDADE_BASE_PADRAO = 700;

function getInstituicaoId(req) {
  return (
    req.instituicao?._id ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.usuario?.instituicao ||
    req.user?.instituicao
  );
}

function getUsuarioId(req) {
  return req.usuario?._id || req.user?._id || null;
}

function getUsuarioNome(req) {
  return req.usuario?.nome || req.user?.nome || req.usuario?.email || req.user?.email || '';
}

function inteiroSeguro(valor, padrao = 0, minimo = 0, maximo = 99999) {
  const n = Number(valor);

  if (!Number.isFinite(n)) return padrao;

  return Math.max(minimo, Math.min(Math.floor(n), maximo));
}

function resumoControle(controle) {
  if (!controle) return null;
  return controle.resumo ? controle.resumo() : controle.toObject();
}

async function obterOuCriarControle({
  instituicao,
  anoLetivo,
  usuarioId = null,
  usuarioNome = '',
}) {
  const ano = Number(anoLetivo || new Date().getFullYear());

  let controle = await BaileControle.findOne({
    instituicao,
    anoLetivo: ano,
  });

  if (!controle) {
    controle = await BaileControle.create({
      instituicao,
      anoLetivo: ano,
      capacidadeBase: CAPACIDADE_BASE_PADRAO,
      cadeirasExtrasConvidados: 0,
      criadoPor: usuarioId,
      criadoPorNome: usuarioNome,
      atualizadoPor: usuarioId,
      atualizadoPorNome: usuarioNome,
    });
  }

  return controle;
}

router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const anoLetivo = Number(req.query.anoLetivo || new Date().getFullYear());

    const controle = await obterOuCriarControle({
      instituicao,
      anoLetivo,
      usuarioId: getUsuarioId(req),
      usuarioNome: getUsuarioNome(req),
    });

    res.json({
      ok: true,
      controle: resumoControle(controle),
    });
  } catch (err) {
    console.error('[BAILE_CONTROLE][OBTER]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao carregar controle anual do baile.',
    });
  }
});

router.put('/', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      anoLetivo = new Date().getFullYear(),
      evento,
      capacidadeBase,
      cadeirasExtrasConvidados,
      observacoes,
    } = req.body;

    const controle = await obterOuCriarControle({
      instituicao,
      anoLetivo,
      usuarioId,
      usuarioNome,
    });

    if (evento !== undefined) {
      controle.evento = String(evento || '').trim() || controle.evento;
    }

    if (capacidadeBase !== undefined) {
      controle.capacidadeBase = inteiroSeguro(
        capacidadeBase,
        CAPACIDADE_BASE_PADRAO,
        0,
        99999
      );
    }

    if (cadeirasExtrasConvidados !== undefined) {
      controle.cadeirasExtrasConvidados = inteiroSeguro(
        cadeirasExtrasConvidados,
        0,
        0,
        99999
      );
    }

    if (observacoes !== undefined) {
      controle.observacoes = String(observacoes || '').trim();
    }

    controle.atualizadoPor = usuarioId;
    controle.atualizadoPorNome = usuarioNome;

    await controle.save();

    res.json({
      ok: true,
      message: 'Controle anual do baile atualizado com sucesso.',
      controle: resumoControle(controle),
    });
  } catch (err) {
    console.error('[BAILE_CONTROLE][ATUALIZAR]', err);
    res.status(500).json({
      ok: false,
      message: 'Erro ao atualizar controle anual do baile.',
    });
  }
});

router.post('/novo-ano', autenticar, requireTenant, async (req, res) => {
  try {
    const instituicao = getInstituicaoId(req);
    const usuarioId = getUsuarioId(req);
    const usuarioNome = getUsuarioNome(req);

    const {
      anoLetivo,
      evento = 'Baile de Formatura 3ª Série do Ensino Médio',
      capacidadeBase = CAPACIDADE_BASE_PADRAO,
      cadeirasExtrasConvidados = 0,
      observacoes = '',
    } = req.body;

    const ano = Number(anoLetivo);

    if (!Number.isFinite(ano) || ano < 2020 || ano > 2100) {
      return res.status(400).json({
        ok: false,
        message: 'Informe um ano letivo válido.',
      });
    }

    const existente = await BaileControle.findOne({
      instituicao,
      anoLetivo: ano,
    });

    if (existente) {
      return res.status(409).json({
        ok: false,
        message: 'Já existe controle de baile para este ano letivo.',
      });
    }

    const controle = await BaileControle.create({
      instituicao,
      anoLetivo: ano,
      evento,
      capacidadeBase: inteiroSeguro(capacidadeBase, CAPACIDADE_BASE_PADRAO, 0, 99999),
      cadeirasExtrasConvidados: inteiroSeguro(cadeirasExtrasConvidados, 0, 0, 99999),
      observacoes,
      criadoPor: usuarioId,
      criadoPorNome: usuarioNome,
      atualizadoPor: usuarioId,
      atualizadoPorNome: usuarioNome,
    });

    res.status(201).json({
      ok: true,
      message: `Controle do baile ${ano} criado com sucesso.`,
      controle: resumoControle(controle),
    });
  } catch (err) {
    console.error('[BAILE_CONTROLE][NOVO_ANO]', err);

    if (err.code === 11000) {
      return res.status(409).json({
        ok: false,
        message: 'Já existe controle de baile para este ano letivo.',
      });
    }

    res.status(500).json({
      ok: false,
      message: 'Erro ao criar novo controle anual do baile.',
    });
  }
});

module.exports = router;