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
const Log = require('../../models/Log');

const { autenticar, apenasLeitura, apenasMonitorOuAdmin } = require('../../middleware/autenticacao');
const calcularNotaTSMD = require('../../utils/calculoNota');
const { enviarTelegram } = require('../../services/mensageria');

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
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// ---------- Helpers ----------
const BASE_SELECT_LISTA = 'nome turma foto fotoThumb fotoOriginal comportamento';

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
const detalhesCache = new Map(); // key: inst|id  -> { exp, payload }
const DETALHES_TTL_MS = 30 * 1000; // 30s

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

/* ===================== NOVAS ROTAS TELEGRAM & ADESÃO ===================== */

// GET /api/alunos/adesao/por-turma  (SENSÍVEL -> monitor/admin)
router.get('/adesao/por-turma', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const inst = req.usuario.instituicao;

    const agreg = await Aluno.aggregate([
      { $match: { instituicao: inst } },
      {
        $group: {
          _id: '$turma',
          totalAlunos: { $sum: 1 },
          comTelegram: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $gt: [{ $strLenCP: { $ifNull: ['$chatIdResponsavel', ''] } }, 0] },
                    { $gt: [{ $size: { $ifNull: ['$chatIdsResponsaveis', []] } }, 0] },
                    { $gt: [{ $strLenCP: { $ifNull: ['$contatos.telegramChatId', ''] } }, 0] }
                  ]
                },
                1, 0
              ]
            }
          }
        }
      },
      { $project: { turma: '$_id', _id: 0, totalAlunos: 1, comTelegram: 1 } }
    ]);

    const resList = agreg.map(it => ({
      turma: it.turma,
      totalAlunos: it.totalAlunos,
      comTelegram: it.comTelegram,
      percentual: it.totalAlunos ? Math.round((it.comTelegram / it.totalAlunos) * 100) : 0
    })).sort((a, b) => String(a.turma).localeCompare(String(b.turma), 'pt-BR', { numeric: true, sensitivity: 'base' }));

    res.set('Cache-Control', 'private, max-age=60');
    res.json({ adesao: resList });
  } catch (e) {
    console.error('Erro GET /api/alunos/adesao/por-turma:', e);
    res.status(500).json({ message: 'Erro ao calcular adesão' });
  }
});

// GET /api/alunos/:id/telegram  (leitura -> professor/monitor/admin)
router.get('/:id/telegram', autenticar, apenasLeitura, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst })
      .select('nome turma chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId')
      .lean();

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const set = new Set([
      ...(aluno.chatIdsResponsaveis || []),
      aluno.chatIdResponsavel || '',
      aluno.contatos?.telegramChatId || ''
    ].map(s => String(s || '').trim()).filter(Boolean));

    res.json({
      nome: aluno.nome,
      turma: aluno.turma,
      chatIdResponsavel: aluno.chatIdResponsavel || '',
      chatIdsResponsaveis: Array.from(set)
    });
  } catch (e) {
    console.error('Erro GET /api/alunos/:id/telegram:', e);
    res.status(500).json({ message: 'Erro ao obter dados de Telegram' });
  }
});

// POST /api/alunos/:id/telegram/vincular  (SENSÍVEL -> monitor/admin)
router.post('/:id/telegram/vincular', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const chatId = normalizeChatId(req.body?.chatId);
    if (!chatId) return res.status(400).json({ message: 'chatId é obrigatório.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    aluno.addChatId(chatId);
    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Vincular Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `chatId=${chatId}`
    });

    res.json({ ok: true, message: 'Vinculado com sucesso.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/vincular:', e);
    res.status(500).json({ message: 'Erro ao vincular chatId' });
  }
});

// DELETE /api/alunos/:id/telegram/:chatId  (SENSÍVEL -> monitor/admin)
router.delete('/:id/telegram/:chatId', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const chatId = normalizeChatId(req.params.chatId);
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    aluno.removeChatId(chatId);
    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Desvincular Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `chatId=${chatId}`
    });

    res.json({ ok: true, message: 'ChatId removido.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro DELETE /api/alunos/:id/telegram/:chatId:', e);
    res.status(500).json({ message: 'Erro ao remover chatId' });
  }
});

// POST /api/alunos/:id/telegram/optout  (SENSÍVEL -> monitor/admin)
router.post('/:id/telegram/optout', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const all = String(req.body?.all || '').toLowerCase() === 'true' || req.body?.all === true;

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    if (all) {
      aluno.chatIdsResponsaveis = [];
      aluno.chatIdResponsavel = '';
    } else {
      if (aluno.chatIdResponsavel) {
        aluno.removeChatId(aluno.chatIdResponsavel);
      }
    }

    await aluno.save();

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Opt-out Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: all ? 'all=true' : 'principal'
    });

    res.json({ ok: true, message: all ? 'Todos os chatIds removidos.' : 'ChatId principal removido.', chatIds: aluno.getAllChatIds() });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/optout:', e);
    res.status(500).json({ message: 'Erro ao processar opt-out' });
  }
});

// GET /api/alunos/:id/telegram/deeplink  (SENSÍVEL -> monitor/admin)
router.get('/:id/telegram/deeplink', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst }).select('_id nome turma').lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const botUser = process.env.TG_BOT_USERNAME || 'cmdpiiczs_bot';
    const token = String(aluno._id);
    const url = `https://t.me/${botUser}?start=${encodeURIComponent(token)}`;

    res.json({ deeplink: url, bot: botUser, token, aluno: { id: String(aluno._id), nome: aluno.nome, turma: aluno.turma } });
  } catch (e) {
    console.error('Erro GET /api/alunos/:id/telegram/deeplink:', e);
    res.status(500).json({ message: 'Erro ao gerar deeplink' });
  }
});

// POST /api/alunos/:id/telegram/teste  (SENSÍVEL -> monitor/admin)
router.post('/:id/telegram/teste', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ message: 'Informe "texto" no corpo da requisição.' });

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: inst });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const chatIds = aluno.getAllChatIds();
    if (!chatIds.length) return res.status(400).json({ message: 'Aluno sem chatId cadastrado.' });

    const enviados = [];
    const falhas = [];

    for (const cid of chatIds) {
      try {
        const ok = await enviarTelegram(
          { nome: aluno.nome, turma: aluno.turma },
          'Teste',
          cid,
          texto
        );

        if (ok?.ok) enviados.push(cid);
        else falhas.push({ cid, motivo: ok?.motivo || ok?.erro || 'desconhecido' });
      } catch (err) {
        falhas.push({ cid, motivo: err?.message || 'erro' });
      }
    }

    await Log.create({
      usuario: req.usuario.id,
      instituicao: inst,
      acao: 'Envio Teste Telegram',
      entidade: 'Aluno',
      entidadeId: aluno._id,
      detalhe: `enviados=${enviados.length}; falhas=${falhas.length}`
    });

    res.json({ ok: true, enviados, falhas });
  } catch (e) {
    console.error('Erro POST /api/alunos/:id/telegram/teste:', e);
    res.status(500).json({ message: 'Erro ao enviar teste' });
  }
});

/* ===================== ROTAS RÁPIDAS (LEITURA) ===================== */

// ✅ Professor/Monitor/Admin: turmas
router.get('/turmas', autenticar, apenasLeitura, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const turmas = await Aluno.distinct('turma', { instituicao: req.usuario.instituicao });
    turmas.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }));

    res.set('Cache-Control', 'private, max-age=120');
    res.json({ turmas });
  } catch (e) {
    console.error('Erro GET /api/alunos/turmas:', e);
    res.status(500).json({ message: 'Erro ao listar turmas' });
  }
});

// ✅ Professor/Monitor/Admin: alunos por turma
router.get('/turma/:turma', autenticar, apenasLeitura, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const termo = String(req.query.q || '').trim();
    const turmaRaw = String(req.params.turma || '').trim();

    if (!turmaRaw) {
      return res.status(400).json({ message: 'Turma não informada.' });
    }

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const filtro = {
      instituicao: req.usuario.instituicao,
      turma: { $regex: `^${escapeRegex(turmaRaw)}$`, $options: 'i' }
    };

    if (termo) {
      filtro.nome = { $regex: escapeRegex(termo), $options: 'i' };
    }

    const alunos = await Aluno.find(filtro)
      .select('_id nome turma foto fotoThumb fotoOriginal comportamento notaComportamento')
      .sort({ nome: 1 })
      .lean();

    const lista = alunos.map((aluno) => {
      let nota = null;
      if (typeof aluno.comportamento === 'number') nota = aluno.comportamento;
      else if (typeof aluno.notaComportamento === 'number') nota = aluno.notaComportamento;

      return {
        ...anexarThumbNaPlain(aluno),
        comportamento: Number.isFinite(nota) ? nota : 8.0
      };
    });

    res.set('Cache-Control', 'private, max-age=30');
    return res.json(lista);
  } catch (error) {
    console.error('Erro GET /api/alunos/turma/:turma:', error);
    return res.status(500).json({ message: 'Erro ao listar alunos da turma', error: error?.message || error });
  }
});

/* ============================================================
   ✅ TRANSFERÊNCIA EM LOTE DE TURMA
============================================================ */
router.put('/transferir', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    let novaTurma = req.body?.novaTurma;

    novaTurma = normalizaTurma(novaTurma);
    const idsLimpos = ids.map(String).map(s => s.trim()).filter(Boolean);

    if (!idsLimpos.length) {
      return res.status(400).json({ message: 'Informe "ids" (array) com pelo menos 1 aluno.' });
    }
    if (!novaTurma) {
      return res.status(400).json({ message: 'Informe "novaTurma".' });
    }

    const result = await Aluno.updateMany(
      { _id: { $in: idsLimpos }, instituicao: inst },
      { $set: { turma: novaTurma } }
    );

    try {
      for (const id of idsLimpos) {
        detalhesCache.delete(cacheKey(inst, String(id)));
      }
    } catch {}

    try {
      await Log.create({
        usuario: req.usuario.id,
        instituicao: inst,
        acao: 'Transferência de Turma (lote)',
        entidade: 'Aluno',
        entidadeId: null,
        detalhe: `qtde=${result?.modifiedCount ?? result?.nModified ?? 0}; novaTurma=${novaTurma}`
      });
    } catch {}

    const alterados = result?.modifiedCount ?? result?.nModified ?? 0;
    res.json({
      ok: true,
      mensagem: `Transferência concluída. ${alterados} aluno(s) atualizado(s) para a turma ${novaTurma}.`,
      alterados
    });
  } catch (error) {
    console.error('Erro PUT /api/alunos/transferir:', error);
    res.status(500).json({ message: 'Erro ao transferir alunos', error: error?.message || error });
  }
});

/* ===================== ROTAS ORIGINAIS ===================== */

// GET /api/alunos/contagem  (leitura)
router.get(['/contagem', '/count'], autenticar, apenasLeitura, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const filtro = { instituicao: req.usuario.instituicao };
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

// GET /api/alunos  (leitura)
router.get('/', autenticar, apenasLeitura, async (req, res) => {
  try {
    const semNota = ['1', 'true'].includes(String(req.query.semNota || '').toLowerCase());
    const painel = ['1', 'true'].includes(String(req.query.painel || '').toLowerCase());

    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const filtro = { instituicao: req.usuario.instituicao };
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
        .select('nome turma foto fotoThumb fotoOriginal instituicao comportamento notaComportamento')
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

    // ✅ IMPORTANTE:
    // Nada de recalcular nota aluno por aluno aqui.
    // A listagem deve usar a nota já persistida em "comportamento".
    const alunos = await Aluno.find(filtro)
      .select('nome turma foto fotoThumb fotoOriginal instituicao comportamento notaComportamento')
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

/* === CRIAÇÃO DE NOVO ALUNO === (SENSÍVEL -> monitor/admin) */
router.post('/', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

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

    const novoAluno = await Aluno.create({
      nome,
      turma,
      dataEntrada: dtEntrada,
      telefone: String(telefone || '').trim(),
      instituicao: req.usuario.instituicao,
      ativo: true
    });

    await Log.create({
      usuario: req.usuario.id,
      instituicao: req.usuario.instituicao,
      acao: 'Criação de Aluno',
      entidade: 'Aluno',
      entidadeId: novoAluno._id
    });

    res.status(201).json(anexarThumb(novoAluno));
  } catch (error) {
    console.error('Erro POST /api/alunos:', error);
    res.status(500).json({ message: 'Erro ao criar aluno', error: error?.message || error });
  }
});

/* === DETALHES OTIMIZADO COM CACHE === (leitura) */
router.get('/:id/detalhes', autenticar, apenasLeitura, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const id = String(req.params.id);
    const hit = getCached(inst, id);

    if (hit) {
      res.set('Cache-Control', 'private, max-age=15');
      return res.json(hit);
    }

    const alunoRaw = await Aluno.findOne({ _id: id, instituicao: inst })
      .select('nome turma dataEntrada nomePai nomeMae telefone nascimento endereco foto fotoOriginal fotoMedium fotoThumb fotoMeta instituicao updatedAt createdAt codigoAcesso comportamento')
      .lean();

    if (!alunoRaw) {
      return res.status(404).json({ message: 'Aluno não encontrado.' });
    }

    const aluno = anexarThumbNaPlain(alunoRaw);

    const notificacoes = await Notificacao.find({ aluno: id, instituicao: inst })
      .select('data tipo tipoMedida motivo valorNumerico valorTotal artigo inciso classificacaoRegulamento quantidadeDias observacoes createdAt natureza')
      .sort({ data: 1, createdAt: 1 })
      .lean();

    const notaAtual = calcularNotaTSMD(alunoRaw.dataEntrada, new Date(), notificacoes);

    const payload = { aluno, notaAtual, notificacoes };
    setCached(inst, id, payload);

    res.set('Cache-Control', 'private, max-age=15');
    return res.json(payload);
  } catch (error) {
    console.error('Erro GET /api/alunos/:id/detalhes:', error);
    return res.status(500).json({ message: 'Erro ao obter detalhes', error });
  }
});

// ===== Upload de foto do aluno (SENSÍVEL -> monitor/admin) =====
router.put('/:id/foto', autenticar, apenasMonitorOuAdmin, upload.single('foto'), async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Envie a imagem no campo "foto".' });
    }

    if (!s3Enabled) {
      return res.status(500).json({
        message: 'AWS S3 não está configurado no ambiente. Verifique AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION e AWS_BUCKET_NAME.'
      });
    }

    const aluno = await Aluno.findOne({ _id: id, instituicao: req.usuario.instituicao });
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
      detalhesCache.delete(cacheKey(req.usuario.instituicao, String(aluno._id)));
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

// GET /api/alunos/:id  (leitura)
router.get('/:id', autenticar, apenasLeitura, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    res.json(anexarThumb(aluno));
  } catch (error) {
    console.error('Erro GET /api/alunos/:id:', error);
    res.status(500).json({ message: 'Erro ao buscar aluno', error });
  }
});

// PUT /api/alunos/:id  (SENSÍVEL -> monitor/admin)
router.put('/:id', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const instituicao = req.usuario.instituicao;
    const alunoId = req.params.id;

    const alunoAntes = await Aluno.findOne({
      _id: alunoId,
      instituicao
    });

    if (!alunoAntes) {
      return res.status(404).json({ message: 'Aluno não encontrado' });
    }

    const dadosAtualizados = sanitizeUpdate(req.body);

    // ✅ BLINDAGEM DA FOTO
    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'foto')) {
      const fotoPersistente = normalizarFotoParaPersistencia(dadosAtualizados.foto);
      if (!fotoPersistente) {
        delete dadosAtualizados.foto;
      } else {
        dadosAtualizados.foto = fotoPersistente;
      }
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoOriginal')) {
      const fotoOriginalPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoOriginal);
      if (!fotoOriginalPersistente) {
        delete dadosAtualizados.fotoOriginal;
      } else {
        dadosAtualizados.fotoOriginal = fotoOriginalPersistente;
      }
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoThumb')) {
      const fotoThumbPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoThumb);
      if (!fotoThumbPersistente) {
        delete dadosAtualizados.fotoThumb;
      } else {
        dadosAtualizados.fotoThumb = fotoThumbPersistente;
      }
    }

    if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'fotoMedium')) {
      const fotoMediumPersistente = normalizarFotoParaPersistencia(dadosAtualizados.fotoMedium);
      if (!fotoMediumPersistente) {
        delete dadosAtualizados.fotoMedium;
      } else {
        dadosAtualizados.fotoMedium = fotoMediumPersistente;
      }
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

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: alunoId, instituicao },
      { $set: updateDoc },
      { new: true, runValidators: true }
    );

    const force = String(req.query.recalcular || '').toLowerCase();
    const forcarRecalculo = force === '1' || force === 'true';

    if (mudouDataEntrada || forcarRecalculo) {
      const notificacoes = await Notificacao.find({ aluno: alunoAtualizado._id, instituicao })
        .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza')
        .sort({ data: 1, createdAt: 1 })
        .lean();

      const nota = calcularNotaTSMD(alunoAtualizado.dataEntrada, new Date(), notificacoes);
      alunoAtualizado.comportamento = nota;
      await alunoAtualizado.save();
    }

    await Log.create({
      usuario: req.usuario.id,
      instituicao,
      acao: 'Edição de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoAtualizado._id
    });

    try { detalhesCache.delete(cacheKey(instituicao, String(alunoAtualizado._id))); } catch {}

    res.json(anexarThumb(alunoAtualizado));
  } catch (error) {
    console.error('Erro PUT /api/alunos/:id:', error);
    res.status(400).json({ message: 'Erro ao atualizar aluno', error: error?.message || error });
  }
});

// DELETE /api/alunos/:id  (SENSÍVEL -> monitor/admin)
router.delete('/:id', autenticar, apenasMonitorOuAdmin, async (req, res) => {
  try {
    if (!req.usuario?.instituicao) return res.status(401).json({ message: 'Não autenticado.' });

    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    await apagarFotosAntigasDoAluno(aluno);

    await Promise.all([
      Notificacao.deleteMany({ aluno: aluno._id, instituicao: req.usuario.instituicao }),
      Observacao.deleteMany({ aluno: aluno._id, instituicao: String(req.usuario.instituicao) }),
      Aluno.deleteOne({ _id: aluno._id })
    ]);

    await Log.create({
      usuario: req.usuario.id,
      instituicao: req.usuario.instituicao,
      acao: 'Exclusão de Aluno',
      entidade: 'Aluno',
      entidadeId: aluno._id
    });

    try { detalhesCache.delete(cacheKey(req.usuario.instituicao, String(aluno._id))); } catch {}

    res.json({ message: 'Aluno e dados relacionados deletados com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aluno:', error);
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

module.exports = router;