const express = require('express');
const router = express.Router();

const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/cloudfront-signer');

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');

const { autenticar, apenasLeitura, apenasMonitorOuAdmin } = require('../../middleware/autenticacao');
const { requireTenant, tenantFilter } = require('../../middleware/tenantScope');
const calcularNotaTSMD = require('../../utils/calculoNota');
const { getConfigDisciplinar } = require('../../utils/configuracaoDisciplinar');
const { enviarTelegram } = require('../../services/mensageria');
const { logAction, attachActor } = require('../../utils/audit');

// ======================================================
// ☁️ AWS S3 / CloudFront
// ======================================================
const AWS_REGION = process.env.AWS_REGION || 'sa-east-1';
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME;

const AWS_CDN_URL = String(process.env.AWS_CDN_URL || '').trim().replace(/\/+$/, '');
const AWS_S3_BASE_URL_ENV = String(process.env.AWS_S3_BASE_URL || '').trim().replace(/\/+$/, '');
const AWS_S3_DIRECT_BASE_URL = AWS_BUCKET_NAME
  ? `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`
  : '';

const AWS_STORAGE_BASE_URL =
  AWS_S3_BASE_URL_ENV ||
  AWS_S3_DIRECT_BASE_URL ||
  '';

const CLOUDFRONT_KEY_PAIR_ID = String(process.env.AWS_CLOUDFRONT_KEY_PAIR_ID || '').trim();
const CLOUDFRONT_PRIVATE_KEY = String(process.env.AWS_CLOUDFRONT_PRIVATE_KEY || '')
  .replace(/\\n/g, '\n')
  .trim();

const CLOUDFRONT_SIGNED_URL_TTL_SEC = Math.max(
  parseInt(process.env.AWS_CLOUDFRONT_SIGNED_URL_TTL_SEC || '300', 10) || 300,
  60
);

const s3Enabled =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!AWS_BUCKET_NAME;

const cloudFrontSignedEnabled =
  !!AWS_CDN_URL &&
  !!CLOUDFRONT_KEY_PAIR_ID &&
  !!CLOUDFRONT_PRIVATE_KEY;

const s3Client = s3Enabled
  ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    })
  : null;

// ======================================================
// 📤 Upload de foto (multer em memória)
// ======================================================
const fileFilter = (req, file, cb) => {
  if (!file?.mimetype?.startsWith('image/')) {
    return cb(new Error('Envie um arquivo de imagem.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }
});

// ---------- Helpers ----------
const BASE_SELECT_LISTA = 'nome turma foto fotoThumb fotoOriginal comportamento';

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function tenantLegacyMatch(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    $or: [
      { tenantId },
      { instituicao: tenantId }
    ]
  };
}

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit][alunos] falha ao gravar log:', e?.message || e);
  }
}

function parsePtBrDateToDate(d) {
  if (typeof d === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(d.trim())) {
    const [dd, mm, yyyy] = d.trim().split('/');
    const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0);
    if (!isNaN(dt.getTime())) return dt;
  }
  return d;
}

function normalizaTurma(t) {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºº°]/g, 'º')
    .replace(/[ª]/g, 'ª')
    .trim();
}

function sanitizeUpdate(payload = {}) {
  const dados = { ...payload };
  delete dados._id;
  delete dados.id;
  delete dados.instituicao;
  delete dados.tenantId;
  delete dados.createdAt;
  delete dados.updatedAt;
  return dados;
}

function normalizeChatId(id) {
  if (id === null || id === undefined) return '';
  return String(id).trim();
}

function limpaString(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function limpaSomenteDigitos(v) {
  return limpaString(v).replace(/\D+/g, '');
}

function stripQueryHash(url) {
  return String(url || '').split('#')[0].split('?')[0];
}

function extrairAssetKey(url) {
  if (!url) return null;

  const clean = stripQueryHash(String(url).trim());

  const bases = [
    AWS_CDN_URL,
    AWS_STORAGE_BASE_URL,
    AWS_S3_DIRECT_BASE_URL
  ].filter(Boolean);

  for (const base of bases) {
    if (clean.startsWith(base + '/')) {
      return decodeURIComponent(clean.slice(base.length + 1).replace(/^\/+/, ''));
    }
  }

  try {
    const u = new URL(clean);
    return decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

function isManagedAssetUrl(url) {
  return !!extrairAssetKey(url);
}

function montarStorageUrlPorKey(key) {
  if (!key) return null;
  if (!AWS_STORAGE_BASE_URL) return null;
  return `${AWS_STORAGE_BASE_URL}/${key}`;
}

function montarAssinadaCloudFrontPorKey(key) {
  if (!key || !cloudFrontSignedEnabled) return null;

  const url = `${AWS_CDN_URL}/${key}`;
  const dateLessThan = new Date(Date.now() + (CLOUDFRONT_SIGNED_URL_TTL_SEC * 1000)).toISOString();

  return getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    dateLessThan,
    privateKey: CLOUDFRONT_PRIVATE_KEY
  });
}

function montarFotoUrlPublica(urlArmazenada) {
  if (!urlArmazenada) return null;

  const key = extrairAssetKey(urlArmazenada);
  if (!key) return urlArmazenada;

  if (cloudFrontSignedEnabled) {
    return montarAssinadaCloudFrontPorKey(key);
  }

  if (AWS_CDN_URL) {
    return `${AWS_CDN_URL}/${key}`;
  }

  return montarStorageUrlPorKey(key) || urlArmazenada;
}

function normalizarFotoParaPersistencia(valorFoto) {
  const fotoLimpa = String(valorFoto || '').trim();
  if (!fotoLimpa) return '';

  const key = extrairAssetKey(fotoLimpa);
  if (key && AWS_STORAGE_BASE_URL) {
    return montarStorageUrlPorKey(key);
  }

  return fotoLimpa;
}

function anexarThumbNaPlain(a) {
  const fotoStorage = a?.fotoOriginal || a?.foto || null;
  const fotoThumbStorage = a?.fotoThumb || null;

  const fotoUrl = montarFotoUrlPublica(fotoStorage);
  const fotoThumbUrlPublica = montarFotoUrlPublica(fotoThumbStorage);

  return {
    ...a,
    foto: fotoStorage,
    fotoUrl,
    fotoOriginal: fotoStorage,
    fotoThumb: fotoThumbStorage,
    fotoThumbUrl: fotoThumbUrlPublica || `/api/imagens/thumb/${a._id}`
  };
}

function anexarThumb(alunoDoc) {
  const obj = alunoDoc?.toObject ? alunoDoc.toObject() : alunoDoc;
  return anexarThumbNaPlain(obj);
}

async function apagarFotoAntigaSeForS3(url) {
  if (!s3Enabled || !url || !isManagedAssetUrl(url)) return;

  const key = extrairAssetKey(url);
  if (!key) return;

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key
    }));
  } catch (err) {
    console.warn('Falha ao apagar foto antiga do S3:', err?.message || err);
  }
}

async function apagarFotosAntigasDoAluno(aluno) {
  if (!aluno) return;

  const urls = [
    aluno.foto,
    aluno.fotoOriginal,
    aluno.fotoMedium,
    aluno.fotoThumb
  ].filter(Boolean);

  const unicas = Array.from(new Set(urls));

  for (const url of unicas) {
    await apagarFotoAntigaSeForS3(url);
  }
}

async function obterMetadadosImagem(buffer) {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta?.width || null,
    height: meta?.height || null,
    format: meta?.format || null
  };
}

async function processarFotoAlunoBuffers(bufferOriginal) {
  const originalMeta = await obterMetadadosImagem(bufferOriginal);

  const originalBuffer = await sharp(bufferOriginal)
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 84 })
    .toBuffer();

  const mediumBuffer = await sharp(bufferOriginal)
    .rotate()
    .resize({
      width: 700,
      height: 700,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toBuffer();

  const thumbBuffer = await sharp(bufferOriginal)
    .rotate()
    .resize(150, 150, {
      fit: 'cover',
      position: 'centre'
    })
    .webp({ quality: 80 })
    .toBuffer();

  return {
    originalBuffer,
    mediumBuffer,
    thumbBuffer,
    originalMeta
  };
}

async function enviarBufferParaS3({ key, buffer, contentType }) {
  const up = new Upload({
    client: s3Client,
    params: {
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }
  });

  await up.done();

  const urlStorage = montarStorageUrlPorKey(key);
  if (!urlStorage) {
    throw new Error('Não foi possível montar a URL persistente do S3.');
  }

  return urlStorage;
}

async function enviarFotoAlunoParaS3({ alunoId, fileBuffer }) {
  if (!s3Enabled) {
    throw new Error('AWS S3 não configurado no ambiente.');
  }

  const { originalBuffer, mediumBuffer, thumbBuffer, originalMeta } =
    await processarFotoAlunoBuffers(fileBuffer);

  const rand = crypto.randomBytes(6).toString('hex');
  const baseKey = `alunos/${alunoId}-${Date.now()}-${rand}`;

  const originalKey = `${baseKey}-original.webp`;
  const mediumKey = `${baseKey}-medium.webp`;
  const thumbKey = `${baseKey}-thumb.webp`;

  const [fotoOriginal, fotoMedium, fotoThumb] = await Promise.all([
    enviarBufferParaS3({
      key: originalKey,
      buffer: originalBuffer,
      contentType: 'image/webp'
    }),
    enviarBufferParaS3({
      key: mediumKey,
      buffer: mediumBuffer,
      contentType: 'image/webp'
    }),
    enviarBufferParaS3({
      key: thumbKey,
      buffer: thumbBuffer,
      contentType: 'image/webp'
    })
  ]);

  return {
    foto: fotoOriginal,
    fotoOriginal,
    fotoMedium,
    fotoThumb,
    fotoMeta: {
      formato: 'webp',
      storage: 's3',
      originalName: null,
      mimeType: 'image/webp',
      sizeBytes: Buffer.byteLength(originalBuffer),
      width: originalMeta?.width || null,
      height: originalMeta?.height || null,
      thumbWidth: 150,
      thumbHeight: 150,
      uploadedAt: new Date()
    }
  };
}

/* ===================== CACHE LEVE PARA /:id/detalhes ===================== */
const detalhesCache = new Map();
const DETALHES_TTL_MS = 30 * 1000;

function cacheKey(inst, id) { return `${inst}|${id}`; }

function getCached(inst, id) {
  const k = cacheKey(inst, id);
  const item = detalhesCache.get(k);
  if (item && item.exp > Date.now()) return item.payload;
  detalhesCache.delete(k);
  return null;
}

function setCached(inst, id, payload) {
  const k = cacheKey(inst, id);
  detalhesCache.set(k, { exp: Date.now() + DETALHES_TTL_MS, payload });
}

/* ===================== ROTAS ===================== */

/* ===================== ROTAS ===================== */

// GET - Listar turmas
router.get('/turmas', autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const turmas = await Aluno.distinct('turma', tenantFilter(req));
    turmas.sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      })
    );

    res.set('Cache-Control', 'private, max-age=120');
    res.json({ turmas });
  } catch (e) {
    console.error('Erro GET /api/alunos/turmas:', e);
    res.status(500).json({ message: 'Erro ao listar turmas' });
  }
});

// GET - Listar alunos por turma
router.get('/turma/:turma', autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const termo = String(req.query.q || '').trim();
    const turmaRaw = String(req.params.turma || '').trim();

    if (!turmaRaw) {
      return res.status(400).json({ message: 'Turma não informada.' });
    }

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const fotoEhBase64Grande = (valor) => {
      if (!valor) return false;
      const s = String(valor).trim();
      return /^data:image\//i.test(s) && s.length > 300000;
    };

    const resumirAlunoLista = (a) => {
      const fotoOriginal = a?.fotoOriginal || a?.foto || null;
      const fotoThumb = a?.fotoThumb || null;

      let foto = fotoOriginal;
      let thumb = fotoThumb;

      if (fotoEhBase64Grande(foto)) foto = '';
      if (fotoEhBase64Grande(thumb)) thumb = '';

      const fotoUrl = montarFotoUrlPublica(foto);
      const fotoThumbUrlPublica = montarFotoUrlPublica(thumb);

      let nota = null;
      if (typeof a?.comportamento === 'number') nota = a.comportamento;
      else if (typeof a?.notaComportamento === 'number') nota = a.notaComportamento;

      return {
        _id: a._id,
        nome: a.nome || '',
        turma: a.turma || '',
        foto: foto || '',
        fotoOriginal: foto || '',
        fotoThumb: thumb || '',
        fotoUrl: fotoUrl || '',
        fotoThumbUrl: fotoThumbUrlPublica || (a?._id ? `/api/imagens/thumb/${a._id}` : ''),
        comportamento: Number.isFinite(nota) ? nota : 8.0
      };
    };

    const filtro = tenantFilter(req, {
      turma: { $regex: `^${escapeRegex(turmaRaw)}$`, $options: 'i' }
    });

    if (termo) {
      filtro.nome = { $regex: escapeRegex(termo), $options: 'i' };
    }

    const alunos = await Aluno.find(filtro)
      .select('_id nome turma foto fotoThumb fotoOriginal comportamento notaComportamento')
      .sort({ nome: 1 })
      .limit(120)
      .lean();

    const lista = alunos.map(resumirAlunoLista);

    res.set('Cache-Control', 'private, max-age=30');
    return res.json(lista);
  } catch (error) {
    console.error('Erro GET /api/alunos/turma/:turma:', error);
    return res.status(500).json({
      message: 'Erro ao listar alunos da turma',
      error: error?.message || error
    });
  }
});

// GET - Contagem
router.get(['/contagem', '/count'], autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const filtro = tenantFilter(req);
    if (req.query.turma) {
      filtro.turma = normalizaTurma(req.query.turma);
    }

    const count = await Aluno.countDocuments(filtro);
    res.json({ count, total: count });
  } catch (e) {
    console.error('Erro GET /api/alunos/contagem:', e);
    res.status(500).json({ message: 'Erro ao contar alunos' });
  }
});

// GET - Listar alunos
router.get('/', autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const semNota = ['1', 'true'].includes(String(req.query.semNota || '').toLowerCase());
    const painel = ['1', 'true'].includes(String(req.query.painel || '').toLowerCase());

    const filtro = tenantFilter(req);
    const turma = req.query.turma;
    if (turma) filtro.turma = normalizaTurma(turma);

    if (semNota) {
      const alunos = await Aluno.find(filtro)
        .select('nome turma foto fotoThumb fotoOriginal')
        .lean();
      return res.json(alunos.map(anexarThumbNaPlain));
    }

    if (painel) {
      const alunos = await Aluno.find(filtro)
        .select('nome turma foto fotoThumb fotoOriginal instituicao tenantId comportamento notaComportamento')
        .lean();

      const alunosComNota = alunos.map((aluno) => {
        let nota = null;
        if (typeof aluno.comportamento === 'number') nota = aluno.comportamento;
        else if (typeof aluno.notaComportamento === 'number') nota = aluno.notaComportamento;

        return {
          ...anexarThumbNaPlain(aluno),
          comportamento: Number.isFinite(nota) ? nota : 8.0,
        };
      });

      return res.json(alunosComNota);
    }

    const alunos = await Aluno.find(filtro)
      .select('nome turma foto fotoThumb fotoOriginal instituicao tenantId comportamento notaComportamento')
      .lean();

    const alunosComNota = alunos.map((aluno) => {
      let nota = null;
      if (typeof aluno.comportamento === 'number') nota = aluno.comportamento;
      else if (typeof aluno.notaComportamento === 'number') nota = aluno.notaComportamento;

      return {
        ...anexarThumbNaPlain(aluno),
        comportamento: Number.isFinite(nota) ? nota : 8.0
      };
    });

    res.json(alunosComNota);
  } catch (error) {
    console.error('Erro GET /api/alunos:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos', error });
  }
});

// POST - Criar aluno
router.post(
  '/',
  autenticar,
  requireTenant,
  attachActor,
  apenasMonitorOuAdmin,
  upload.single('foto'),
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) return res.status(400).json({ mensagem: 'Tenant não identificado.' });

      let { nome, turma, dataEntrada, telefone } = req.body;
      nome = String(nome || '').trim();
      turma = normalizaTurma(turma);

      if (!nome || !turma) {
        return res.status(400).json({ message: 'Nome e turma são obrigatórios.' });
      }

      let dtEntrada;
      if (dataEntrada) {
        const iso = String(dataEntrada).trim();
        const dt = new Date(iso + 'T00:00:00');
        if (!isNaN(dt.getTime())) dtEntrada = dt;
      }

      const novoAluno = await Aluno.create(tenantData(req, {
        nome,
        turma,
        dataEntrada: dtEntrada,
        telefone: String(telefone || '').trim(),
        ativo: true
      }));

      console.log('[ALUNOS][CRIAR] actor=', req.actor);
      console.log('[ALUNOS][CRIAR] usuario=', req.usuario);
      console.log('[ALUNOS][CRIAR] tenant=', getTenantId(req));
      
    await safeAudit({
        req: {
    ...req,
    actor: req.actor || {
      id: req.usuario?.id || req.user?.id || req.usuario?._id || req.user?._id,
      nome: req.usuario?.nome || req.user?.nome || null,
      tipo: req.usuario?.tipo || req.user?.tipo || null,
      email: req.usuario?.email || req.user?.email || null,
      instituicao: req.usuario?.instituicao || req.user?.instituicao || getTenantId(req)
    }
  },
        event: 'ALUNO_CRIADO',
        targetType: 'Aluno',
        targetId: novoAluno._id,
        entidadeNome: novoAluno.nome,
        alunoNome: novoAluno.nome,
        meta: {
          turma: novoAluno.turma
        }
      });

      res.status(201).json(anexarThumb(novoAluno));
    } catch (error) {
      console.error('Erro POST /api/alunos:', error);
      res.status(500).json({ message: 'Erro ao criar aluno', error: error?.message || error });
    }
  }
);

// GET - Detalhes do aluno
router.get('/:id/detalhes', autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const inst = getTenantId(req);
    const id = String(req.params.id);
    const hit = getCached(inst, id);

    if (hit) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.json(hit);
    }

    const alunoRaw = await Aluno.findOne(tenantFilter(req, { _id: id }))
      .select('nome turma dataEntrada nomePai nomeMae telefone nascimento endereco foto fotoOriginal fotoMedium fotoThumb fotoMeta instituicao tenantId updatedAt createdAt codigoAcesso comportamento')
      .lean();

    if (!alunoRaw) {
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    const aluno = anexarThumbNaPlain(alunoRaw);

    const notificacoes = await Notificacao.find(tenantFilter(req, { aluno: id }))
      .select('data tipo tipoMedida motivo valorNumerico valorTotal artigo inciso classificacaoRegulamento quantidadeDias observacoes createdAt natureza')
      .sort({ data: 1, createdAt: 1 })
      .lean();

    const config = await getConfigDisciplinar(alunoRaw.instituicao || alunoRaw.tenantId);

    const notaAtual = calcularNotaTSMD(
      alunoRaw.dataEntrada,
      new Date(),
      notificacoes,
      config
    );

    const payload = { aluno, notaAtual, notificacoes };
    setCached(inst, id, payload);

    res.set('Cache-Control', 'private, max-age=15');
    return res.json(payload);
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/detalhes:', error);
    return res.status(500).json({ message: 'Erro ao obter detalhes', error });
  }
});

// PUT - Atualizar foto
router.put('/:id/foto', autenticar, requireTenant, apenasMonitorOuAdmin, upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Envie a imagem no campo "foto".' });
    }

    if (!s3Enabled) {
      return res.status(500).json({
        message: 'AWS S3 não está configurado no ambiente. Verifique AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION e AWS_BUCKET_NAME.'
      });
    }

    const aluno = await Aluno.findOne(tenantFilter(req, { _id: id }));
    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    const fotosAntigas = {
      foto: aluno.foto || null,
      fotoOriginal: aluno.fotoOriginal || null,
      fotoMedium: aluno.fotoMedium || null,
      fotoThumb: aluno.fotoThumb || null
    };

    const payloadFoto = await enviarFotoAlunoParaS3({
      alunoId: id,
      fileBuffer: req.file.buffer
    });

    payloadFoto.fotoMeta = {
      ...payloadFoto.fotoMeta,
      originalName: req.file.originalname || null
    };

    if (typeof aluno.setFotoUrls === 'function') {
      aluno.setFotoUrls({
        original: payloadFoto.fotoOriginal,
        thumb: payloadFoto.fotoThumb,
        medium: payloadFoto.fotoMedium,
        publicId: null,
        meta: payloadFoto.fotoMeta
      });
    } else {
      aluno.foto = payloadFoto.foto;
      aluno.fotoOriginal = payloadFoto.fotoOriginal;
      aluno.fotoMedium = payloadFoto.fotoMedium;
      aluno.fotoThumb = payloadFoto.fotoThumb;
      aluno.fotoMeta = payloadFoto.fotoMeta;
      aluno.fotoPublicId = null;
    }

    await aluno.save();

    const urlsAntigas = Array.from(new Set([
      fotosAntigas.foto,
      fotosAntigas.fotoOriginal,
      fotosAntigas.fotoMedium,
      fotosAntigas.fotoThumb
    ].filter(Boolean)));

    const urlsNovas = new Set([
      aluno.foto,
      aluno.fotoOriginal,
      aluno.fotoMedium,
      aluno.fotoThumb
    ].filter(Boolean));

    for (const antiga of urlsAntigas) {
      if (!urlsNovas.has(antiga)) {
        await apagarFotoAntigaSeForS3(antiga);
      }
    }

    try {
      detalhesCache.delete(cacheKey(getTenantId(req), String(aluno._id)));
    } catch {}

    return res.json({
      ok: true,
      message: 'Foto atualizada com sucesso.',
      foto: montarFotoUrlPublica(aluno.foto),
      fotoUrl: montarFotoUrlPublica(aluno.foto),
      fotoOriginal: montarFotoUrlPublica(aluno.fotoOriginal),
      fotoMedium: montarFotoUrlPublica(aluno.fotoMedium),
      fotoThumb: montarFotoUrlPublica(aluno.fotoThumb),
      fotoThumbUrl: montarFotoUrlPublica(aluno.fotoThumb),
      fotoStorage: aluno.foto,
      fotoMeta: aluno.fotoMeta || null
    });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err);
    return res.status(500).json({ message: 'Erro ao atualizar a foto do aluno' });
  }
});

// GET - Buscar aluno por ID
router.get('/:id', autenticar, requireTenant, apenasLeitura, async (req, res) => {
  try {
    const aluno = await Aluno.findOne(tenantFilter(req, { _id: req.params.id }));

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    res.json(anexarThumb(aluno));
  } catch (error) {
    console.error('Erro GET /api/alunos/:id:', error);
    res.status(500).json({ message: 'Erro ao buscar aluno', error });
  }
});

// PUT - Transferir alunos selecionados
router.put(
  '/transferir',
  autenticar,
  requireTenant,
  attachActor,
  apenasMonitorOuAdmin,
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) {
        return res.status(400).json({ mensagem: 'Tenant não identificado.' });
      }

      const { alunosIds, novaTurma } = req.body;

      if (!Array.isArray(alunosIds) || !alunosIds.length || !novaTurma) {
        return res.status(400).json({ mensagem: 'Dados inválidos.' });
      }

      const result = await Aluno.updateMany(
        tenantFilter(req, { _id: { $in: alunosIds } }),
        { $set: { turma: normalizaTurma(novaTurma) } }
      );

      await safeAudit({
        req,
        event: 'ALUNO_TRANSFERIDO_LOTE',
        targetType: 'Aluno',
        targetId: null,
        meta: {
          novaTurma,
          quantidade: result.modifiedCount
        }
      });

      return res.json({
        mensagem: 'Transferência realizada com sucesso.',
        quantidade: result.modifiedCount
      });
    } catch (erro) {
      console.error('Erro ao transferir alunos:', erro);
      return res.status(500).json({ mensagem: 'Erro ao transferir alunos.' });
    }
  }
);

// PUT - Editar aluno
router.put('/:id', autenticar, requireTenant, attachActor, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const instituicao = getTenantId(req);
    const alunoId = req.params.id;

    const alunoAntes = await Aluno.findOne(tenantFilter(req, { _id: alunoId }));

    if (!alunoAntes) {
      return res.status(404).json({ message: 'Aluno não encontrado' });
    }

    const dadosAtualizados = sanitizeUpdate(req.body);

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'foto')) {
      const fotoPersistente = normalizarFotoParaPersistencia(dadosAtualizados.foto);
      if (!fotoPersistente) delete dadosAtualizados.foto;
      else dadosAtualizados.foto = fotoPersistente;
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoOriginal')) {
      const fotoOriginalPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoOriginal);
      if (!fotoOriginalPersistente) delete dadosAtualizados.fotoOriginal;
      else dadosAtualizados.fotoOriginal = fotoOriginalPersistente;
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoThumb')) {
      const fotoThumbPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoThumb);
      if (!fotoThumbPersistente) delete dadosAtualizados.fotoThumb;
      else dadosAtualizados.fotoThumb = fotoThumbPersistente;
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoMedium')) {
      const fotoMediumPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoMedium);
      if (!fotoMediumPersistente) delete dadosAtualizados.fotoMedium;
      else dadosAtualizados.fotoMedium = fotoMediumPersistente;
    }

    if (dadosAtualizados.turma !== undefined) {
      dadosAtualizados.turma = normalizaTurma(dadosAtualizados.turma);
    }

    if (dadosAtualizados.dataEntrada !== undefined) {
      dadosAtualizados.dataEntrada = parsePtBrDateToDate(dadosAtualizados.dataEntrada);
    }

    if (dadosAtualizados.nascimento !== undefined) {
      dadosAtualizados.nascimento = parsePtBrDateToDate(dadosAtualizados.nascimento);
    }

    const contatosPayload = dadosAtualizados.contatos && typeof dadosAtualizados.contatos === 'object'
      ? dadosAtualizados.contatos
      : {};

    const emailResponsavel = limpaString(contatosPayload.emailResponsavel);
    const whatsapp = limpaSomenteDigitos(contatosPayload.whatsapp);
    const telegramChatId = limpaString(contatosPayload.telegramChatId);

    delete dadosAtualizados.contatos;

    const updateDoc = {
      ...dadosAtualizados,
      'contatos.emailResponsavel': emailResponsavel || null,
      'contatos.whatsapp': whatsapp || null,
      'contatos.telegramChatId': telegramChatId || null
    };

    const antesEntradaMs = alunoAntes.dataEntrada ? new Date(alunoAntes.dataEntrada).getTime() : null;
    const depoisEntradaMs = updateDoc.dataEntrada !== undefined && updateDoc.dataEntrada !== null
      ? new Date(updateDoc.dataEntrada).getTime()
      : antesEntradaMs;

    const mudouDataEntrada = updateDoc.dataEntrada !== undefined &&
      String(depoisEntradaMs) !== String(antesEntradaMs);

    const force = String(req.query.recalcular || '').toLowerCase();
    const forcarRecalculo = force === '1' || force === 'true';

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      tenantFilter(req, { _id: alunoId }),
      { $set: updateDoc },
      { new: true, runValidators: true }
    );

    if (mudouDataEntrada || forcarRecalculo) {
      const [notificacoes, config] = await Promise.all([
        Notificacao.find(tenantFilter(req, { aluno: alunoAtualizado._id }))
          .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza')
          .sort({ data: 1, createdAt: 1 })
          .lean(),
        getConfigDisciplinar(alunoAtualizado.instituicao || alunoAtualizado.tenantId)
      ]);

      const nota = calcularNotaTSMD(
        alunoAtualizado.dataEntrada,
        new Date(),
        notificacoes,
        config
      );

      alunoAtualizado.comportamento = nota;
      await alunoAtualizado.save();
    }

    await safeAudit({
      req,
      event: 'ALUNO_EDITADO',
      targetType: 'Aluno',
      targetId: alunoAtualizado._id,
      entidadeNome: alunoAtualizado.nome,
      alunoNome: alunoAtualizado.nome,
      meta: {
        turma: alunoAtualizado.turma
      }
    });

    try { detalhesCache.delete(cacheKey(instituicao, String(alunoAtualizado._id))); } catch {}

    res.json(anexarThumb(alunoAtualizado));
  } catch (error) {
    console.error('Erro PUT /api/alunos/:id:', error);
    res.status(400).json({ message: 'Erro ao atualizar aluno', error: error?.message || error });
  }
});

// DELETE - Excluir aluno
router.delete('/:id', autenticar, requireTenant, attachActor, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const aluno = await Aluno.findOne(tenantFilter(req, { _id: req.params.id }));

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    const nomeAluno = aluno.nome;
    const turmaAluno = aluno.turma;

    await apagarFotosAntigasDoAluno(aluno);

    await Promise.all([
      Notificacao.deleteMany(tenantFilter(req, { aluno: aluno._id })),
      Observacao.deleteMany(tenantFilter(req, { aluno: aluno._id })),
      Aluno.deleteOne(tenantFilter(req, { _id: aluno._id }))
    ]);

    console.log('[ALUNOS][EXCLUIR] actor=', req.actor);
    console.log('[ALUNOS][EXCLUIR] usuario=', req.usuario);
    console.log('[ALUNOS][EXCLUIR] tenant=', getTenantId(req));

    await safeAudit({
      req: {
    ...req,
    actor: req.actor || {
      id: req.usuario?.id || req.user?.id || req.usuario?._id || req.user?._id,
      nome: req.usuario?.nome || req.user?.nome || null,
      tipo: req.usuario?.tipo || req.user?.tipo || null,
      email: req.usuario?.email || req.user?.email || null,
      instituicao: req.usuario?.instituicao || req.user?.instituicao || getTenantId(req)
    }
  },
      event: 'ALUNO_EXCLUIDO',
      targetType: 'Aluno',
      targetId: aluno._id,
      entidadeNome: nomeAluno,
      alunoNome: nomeAluno,
      meta: {
        turma: turmaAluno
      }
    });

    try { detalhesCache.delete(cacheKey(getTenantId(req), String(aluno._id))); } catch {}

    res.json({ message: 'Aluno e dados relacionados deletados com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aluno:', error);
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

// POST - Transferir alunos de turma
router.post(
  '/transferir-turma',
  autenticar,
  requireTenant,
  attachActor,
  apenasMonitorOuAdmin,
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) return res.status(400).json({ mensagem: 'Tenant não identificado.' });

      const { turmaOrigem, novaTurma } = req.body;

      if (!turmaOrigem || !novaTurma) {
        return res.status(400).json({ mensagem: 'Dados inválidos.' });
      }

      const result = await Aluno.updateMany(
        tenantFilter(req, { turma: normalizaTurma(turmaOrigem) }),
        { turma: normalizaTurma(novaTurma) }
      );

      // 🔥 LOG CORRIGIDO
      await safeAudit({
        req,
        event: 'ALUNO_TRANSFERIDO',
        targetType: 'Aluno',
        targetId: null,
        entidadeNome: `Turma ${turmaOrigem}`,
        meta: {
          novaTurma,
          quantidade: result.modifiedCount
        }
      });

      res.json({
        mensagem: 'Transferência realizada com sucesso.',
        quantidade: result.modifiedCount
      });
    } catch (erro) {
      console.error('Erro ao transferir turma:', erro);
      res.status(500).json({ mensagem: 'Erro ao transferir turma.' });
    }
  }
);

// POST - Enviar Telegram
router.post(
  '/telegram',
  autenticar,
  requireTenant,
  attachActor,
  apenasMonitorOuAdmin,
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) return res.status(400).json({ mensagem: 'Tenant não identificado.' });

      const { alunoId, mensagem } = req.body;

      if (!alunoId || !mensagem) {
        return res.status(400).json({ mensagem: 'Dados inválidos.' });
      }

      const aluno = await Aluno.findOne(
        tenantLegacyMatch(req, { _id: alunoId })
      );

      if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado.' });

      const chatId = normalizeChatId(aluno.telegramChatId);

      if (!chatId) {
        return res.status(400).json({ mensagem: 'Aluno não possui Telegram vinculado.' });
      }

      await enviarTelegram(chatId, mensagem);

      // 🔥 LOG CORRIGIDO
      await safeAudit({
        req,
        event: 'ALUNO_TELEGRAM_ENVIADO',
        targetType: 'Aluno',
        targetId: aluno._id,
        entidadeNome: aluno.nome,
        alunoNome: aluno.nome,
        meta: {
          turma: aluno.turma
        }
      });

      res.json({ mensagem: 'Mensagem enviada com sucesso.' });
    } catch (erro) {
      console.error('Erro ao enviar Telegram:', erro);
      res.status(500).json({ mensagem: 'Erro ao enviar Telegram.' });
    }
  }
);

// GET - Detalhes do aluno (com cache leve)
router.get(
  '/:id/detalhes',
  autenticar,
  requireTenant,
  apenasLeitura,
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) return res.status(400).json({ mensagem: 'Tenant não identificado.' });

      const cached = getCached(inst, req.params.id);
      if (cached) return res.json(cached);

      const aluno = await Aluno.findOne(
        tenantLegacyMatch(req, { _id: req.params.id })
      );

      if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado.' });

      const notificacoes = await Notificacao.find(
        tenantFilter(req, { aluno: aluno._id })
      ).lean();

      const observacoes = await Observacao.find(
        tenantFilter(req, { aluno: aluno._id })
      ).lean();

      const config = await getConfigDisciplinar(inst);

      const nota = calcularNotaTSMD(notificacoes, config);

      const payload = {
        aluno: anexarThumb(aluno),
        notificacoes,
        observacoes,
        nota
      };

      setCached(inst, req.params.id, payload);

      res.json(payload);
    } catch (erro) {
      console.error('Erro ao buscar detalhes do aluno:', erro);
      res.status(500).json({ mensagem: 'Erro ao buscar detalhes do aluno.' });
    }
  }
);
// ===============================
// 🚀 NOVA ROTA - TRANSFERÊNCIA POR IDS
// ===============================
router.put(
  '/transferir',
  autenticar,
  requireTenant,
  attachActor,
  apenasMonitorOuAdmin,
  async (req, res) => {
    try {
      const inst = getTenantId(req);
      if (!inst) {
        return res.status(400).json({ mensagem: 'Tenant não identificado.' });
      }

      const { alunosIds, novaTurma } = req.body;

      if (!Array.isArray(alunosIds) || !alunosIds.length || !novaTurma) {
        return res.status(400).json({ mensagem: 'Dados inválidos.' });
      }

      const result = await Aluno.updateMany(
        tenantFilter(req, { _id: { $in: alunosIds } }),
        { turma: normalizaTurma(novaTurma) }
      );

      await safeAudit({
        req,
        event: 'ALUNO_TRANSFERIDO_LOTE',
        targetType: 'Aluno',
        targetId: null,
        meta: {
          novaTurma,
          quantidade: result.modifiedCount
        }
      });

      res.json({
        mensagem: 'Transferência realizada com sucesso.',
        quantidade: result.modifiedCount
      });

    } catch (erro) {
      console.error('Erro ao transferir alunos:', erro);
      res.status(500).json({ mensagem: 'Erro ao transferir alunos.' });
    }
  }
);

module.exports = router;