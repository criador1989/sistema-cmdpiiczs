const express = require('express');
const router = express.Router();

const ConfiguracaoDocumentos = require('../../models/ConfiguracaoDocumentos');

function obterInstituicaoId(req) {
  return (
    req?.tenant?._id ||
    req?.tenant ||
    req?.usuario?.instituicao ||
    req?.user?.instituicao ||
    req?.body?.instituicao ||
    req?.query?.instituicao ||
    null
  );
}

function obterUsuarioId(req) {
  return req?.usuario?._id || req?.user?._id || null;
}

router.get('/', async (req, res) => {
  try {
    const instituicaoId = obterInstituicaoId(req);

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        message: 'Instituição não identificada para carregar a configuração de documentos.',
      });
    }

    let config = await ConfiguracaoDocumentos.findOne({
      instituicao: instituicaoId,
    }).lean();

    if (!config) {
      config = {
        instituicao: instituicaoId,
        ativo: true,
        nomeInstituicao: '',
        orgaoSuperior: '',
        subtitulo: '',
        endereco: '',
        telefone: '',
        email: '',
        cidadeUf: '',
        rodapePadrao: '',
        brasaoEsquerdoUrl: '',
        brasaoDireitoUrl: '',
        logoCentralUrl: '',
        mostrarBrasaoEsquerdo: true,
        mostrarBrasaoDireito: true,
        mostrarLogoCentral: false,
        mostrarRodape: true,
      };
    }

    return res.json({
      ok: true,
      config,
    });
  } catch (error) {
    console.error('[CONFIG-DOCUMENTOS][GET][ERRO]', error);

    return res.status(500).json({
      ok: false,
      message: 'Erro ao carregar configuração de documentos.',
      error: error.message,
    });
  }
});

router.put('/', async (req, res) => {
  try {
    const instituicaoId = obterInstituicaoId(req);

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        message: 'Instituição não identificada para salvar a configuração de documentos.',
      });
    }

    const usuarioId = obterUsuarioId(req);

    const payload = {
      ativo: req.body.ativo !== false,

      nomeInstituicao: req.body.nomeInstituicao || '',
      orgaoSuperior: req.body.orgaoSuperior || '',
      subtitulo: req.body.subtitulo || '',
      endereco: req.body.endereco || '',
      telefone: req.body.telefone || '',
      email: req.body.email || '',
      cidadeUf: req.body.cidadeUf || '',
      rodapePadrao: req.body.rodapePadrao || '',

      brasaoEsquerdoUrl: req.body.brasaoEsquerdoUrl || '',
      brasaoDireitoUrl: req.body.brasaoDireitoUrl || '',
      logoCentralUrl: req.body.logoCentralUrl || '',

      mostrarBrasaoEsquerdo: req.body.mostrarBrasaoEsquerdo !== false,
      mostrarBrasaoDireito: req.body.mostrarBrasaoDireito !== false,
      mostrarLogoCentral: req.body.mostrarLogoCentral === true,
      mostrarRodape: req.body.mostrarRodape !== false,

      atualizadoPor: usuarioId,
    };

    const existente = await ConfiguracaoDocumentos.findOne({
      instituicao: instituicaoId,
    });

    if (!existente) {
      payload.instituicao = instituicaoId;
      payload.criadoPor = usuarioId;
    }

    const config = await ConfiguracaoDocumentos.findOneAndUpdate(
      { instituicao: instituicaoId },
      { $set: payload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      message: 'Configuração de documentos salva com sucesso.',
      config,
    });
  } catch (error) {
    console.error('[CONFIG-DOCUMENTOS][PUT][ERRO]', error);

    return res.status(500).json({
      ok: false,
      message: 'Erro ao salvar configuração de documentos.',
      error: error.message,
    });
  }
});

module.exports = router;