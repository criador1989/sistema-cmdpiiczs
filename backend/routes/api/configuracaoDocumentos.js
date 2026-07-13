const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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

function normalizarInstituicaoId(instituicaoId) {
  return String(instituicaoId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function garantirPastaBrasoes(instituicaoId) {
  const inst = normalizarInstituicaoId(instituicaoId);

  const pasta = path.join(
    __dirname,
    '../../uploads/brasoes',
    inst
  );

  fs.mkdirSync(pasta, { recursive: true });

  return pasta;
}

function extensaoSegura(file) {
  const original = String(file?.originalname || '').toLowerCase();

  if (original.endsWith('.jpg') || original.endsWith('.jpeg')) return '.jpg';
  if (original.endsWith('.webp')) return '.webp';
  if (original.endsWith('.png')) return '.png';

  return '.png';
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const instituicaoId = obterInstituicaoId(req);

      if (!instituicaoId) {
        return cb(new Error('Instituição não identificada para upload.'));
      }

      const pasta = garantirPastaBrasoes(instituicaoId);
      return cb(null, pasta);
    } catch (err) {
      return cb(err);
    }
  },

  filename(req, file, cb) {
    const tipo = String(req.body.tipo || req.query.tipo || 'brasao')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');

    const ext = extensaoSegura(file);
    const nome = `${tipo}-${Date.now()}${ext}`;

    cb(null, nome);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter(req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();

    const permitido = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];

    if (!permitido.includes(mime)) {
      return cb(new Error('Formato inválido. Envie PNG, JPG, JPEG ou WEBP.'));
    }

    cb(null, true);
  },
});

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

router.post('/upload', upload.single('arquivo'), async (req, res) => {
  try {
    const instituicaoId = obterInstituicaoId(req);

    if (!instituicaoId) {
      return res.status(400).json({
        ok: false,
        message: 'Instituição não identificada para upload.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: 'Nenhum arquivo enviado.',
      });
    }

    const tipo = String(req.body.tipo || req.query.tipo || '').trim();

    const camposPermitidos = {
      brasaoEsquerdo: 'brasaoEsquerdoUrl',
      brasaoDireito: 'brasaoDireitoUrl',
      logoCentral: 'logoCentralUrl',
    };

    const campo = camposPermitidos[tipo];

    if (!campo) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo de imagem inválido.',
      });
    }

    const inst = normalizarInstituicaoId(instituicaoId);

    const url = `/uploads/brasoes/${inst}/${req.file.filename}`;

    const usuarioId = obterUsuarioId(req);

    const update = {
      [campo]: url,
      atualizadoPor: usuarioId,
    };

    if (tipo === 'brasaoEsquerdo') update.mostrarBrasaoEsquerdo = true;
    if (tipo === 'brasaoDireito') update.mostrarBrasaoDireito = true;
    if (tipo === 'logoCentral') update.mostrarLogoCentral = true;

    const existente = await ConfiguracaoDocumentos.findOne({
      instituicao: instituicaoId,
    });

    if (!existente) {
      update.instituicao = instituicaoId;
      update.criadoPor = usuarioId;
      update.ativo = true;
    }

    const config = await ConfiguracaoDocumentos.findOneAndUpdate(
      { instituicao: instituicaoId },
      { $set: update },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({
      ok: true,
      message: 'Imagem enviada com sucesso.',
      campo,
      url,
      config,
    });
  } catch (error) {
    console.error('[CONFIG-DOCUMENTOS][UPLOAD][ERRO]', error);

    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao enviar imagem.',
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