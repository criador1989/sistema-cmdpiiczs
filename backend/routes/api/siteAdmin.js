'use strict';

const express = require('express');
const path = require('path');
const multer = require('multer');

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const SitePagina = require('../../models/SitePagina');
const SiteBloco = require('../../models/SiteBloco');
const SiteMidia = require('../../models/SiteMidia');
const SiteConfig = require('../../models/SiteConfig');
const SiteNoticia = require('../../models/SiteNoticia');
const SitePatrocinador = require('../../models/SitePatrocinador');

const router = express.Router();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024
  }
});

function getTenant(req) {
  return req.tenantSlug || req.headers['x-tenant-slug'] || 'cmdpii-czs';
}

function getUserId(req) {
  return req.usuario?._id || req.usuario?.id || null;
}

function detectarTipo(mime = '') {
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('powerpoint') ||
    mime.includes('officedocument')
  ) return 'documento';

  return 'outro';
}


/* =========================
   CONFIGURAÇÕES DO SITE
   ========================= */

router.get('/config', async (req, res) => {
  try {
    const tenant = getTenant(req);

    let config = await SiteConfig.findOne({ tenant }).lean();

    if (!config) {
      config = await SiteConfig.create({ tenant });
    }

    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const config = await SiteConfig.findOneAndUpdate(
      { tenant },
      {
        ...req.body,
        tenant,
        atualizadoPor: getUserId(req)
      },
      {
        new: true,
        upsert: true
      }
    );

    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   PÁGINAS
   ========================= */

router.get('/paginas', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const paginas = await SitePagina
      .find({ tenant })
      .sort({ ordem: 1, titulo: 1 })
      .lean();

    res.json({ ok: true, paginas });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/paginas', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const pagina = await SitePagina.create({
      tenant,
      titulo: req.body.titulo,
      slug: req.body.slug,
      descricao: req.body.descricao || '',
      tipo: req.body.tipo || 'pagina',
      status: req.body.status || 'publicada',
      ordem: Number(req.body.ordem || 0),
      criadaPor: getUserId(req),
      atualizadaPor: getUserId(req)
    });

    res.status(201).json({ ok: true, pagina });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.put('/paginas/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const pagina = await SitePagina.findOneAndUpdate(
      { _id: req.params.id, tenant },
      {
        ...req.body,
        tenant,
        atualizadaPor: getUserId(req)
      },
      { new: true }
    );

    if (!pagina) {
      return res.status(404).json({ ok: false, erro: 'Página não encontrada.' });
    }

    res.json({ ok: true, pagina });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.delete('/paginas/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    await SiteBloco.deleteMany({ pagina: req.params.id, tenant });
    const pagina = await SitePagina.findOneAndDelete({ _id: req.params.id, tenant });

    if (!pagina) {
      return res.status(404).json({ ok: false, erro: 'Página não encontrada.' });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   BLOCOS
   ========================= */

router.get('/paginas/:paginaId/blocos', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const blocos = await SiteBloco
      .find({ tenant, pagina: req.params.paginaId })
      .sort({ ordem: 1, createdAt: 1 })
      .lean();

    res.json({ ok: true, blocos });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/paginas/:paginaId/blocos', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const bloco = await SiteBloco.create({
      tenant,
      pagina: req.params.paginaId,
      tipo: req.body.tipo,
      titulo: req.body.titulo || '',
      subtitulo: req.body.subtitulo || '',
      texto: req.body.texto || '',
      imagemUrl: req.body.imagemUrl || '',
      videoUrl: req.body.videoUrl || '',
      arquivoUrl: req.body.arquivoUrl || '',
      link: req.body.link || {},
      itens: req.body.itens || [],
      configuracao: req.body.configuracao || {},
      ordem: Number(req.body.ordem || 0),
      ativo: req.body.ativo !== false,
      criadoPor: getUserId(req),
      atualizadoPor: getUserId(req)
    });

    res.status(201).json({ ok: true, bloco });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.put('/blocos/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const bloco = await SiteBloco.findOneAndUpdate(
      { _id: req.params.id, tenant },
      {
        ...req.body,
        tenant,
        atualizadoPor: getUserId(req)
      },
      { new: true }
    );

    if (!bloco) {
      return res.status(404).json({ ok: false, erro: 'Bloco não encontrado.' });
    }

    res.json({ ok: true, bloco });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.delete('/blocos/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const bloco = await SiteBloco.findOneAndDelete({ _id: req.params.id, tenant });

    if (!bloco) {
      return res.status(404).json({ ok: false, erro: 'Bloco não encontrado.' });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/blocos/reordenar', async (req, res) => {
  try {
    const tenant = getTenant(req);
    const itens = Array.isArray(req.body.itens) ? req.body.itens : [];

    await Promise.all(
      itens.map((item, index) =>
        SiteBloco.updateOne(
          { _id: item.id, tenant },
          { ordem: Number(item.ordem ?? index) }
        )
      )
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   MÍDIAS / UPLOADS
   ========================= */

router.get('/midias', async (req, res) => {
  try {
    const tenant = getTenant(req);
    const tipo = req.query.tipo ? { tipo: req.query.tipo } : {};

    const midias = await SiteMidia
      .find({ tenant, ...tipo })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ ok: true, midias });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/midias/upload', upload.single('arquivo'), async (req, res) => {
  try {
    const tenant = getTenant(req);

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        erro: 'Nenhum arquivo enviado.'
      });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();

    const safe = String(req.file.originalname || 'arquivo')
      .replace(ext, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);

    const nomeArquivo = `${Date.now()}-${safe}${ext}`;

    const key = `site/${tenant}/${nomeArquivo}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        CacheControl: 'public, max-age=31536000'
      })
    );

    const baseUrl =
      process.env.AWS_CDN_URL ||
      process.env.AWS_S3_BASE_URL ||
      `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;

    const url =
      `${baseUrl.replace(/\/$/, '')}/${key}`;

    const midia = await SiteMidia.create({
      tenant,
      nomeOriginal: req.file.originalname,
      nomeArquivo,
      url,
      mimeType: req.file.mimetype,
      tipo: detectarTipo(req.file.mimetype),
      tamanho: req.file.size,
      descricao: req.body.descricao || '',
      alt: req.body.alt || '',
      usadoEm: [key],
      criadoPor: getUserId(req)
    });

    res.status(201).json({
      ok: true,
      midia
    });

  } catch (err) {
    console.error('Erro upload S3:', err);

    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

router.delete('/midias/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const midia = await SiteMidia.findOneAndDelete({ _id: req.params.id, tenant });

    if (!midia) {
      return res.status(404).json({ ok: false, erro: 'Mídia não encontrada.' });
    }

    const filePath = path.join(uploadDir, midia.nomeArquivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   NOTÍCIAS
   ========================= */

router.get('/noticias', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const noticias = await SiteNoticia
      .find({ tenant })
      .sort({ destaque: -1, dataPublicacao: -1 })
      .lean();

    res.json({ ok: true, noticias });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

router.post('/noticias', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const titulo = String(req.body.titulo || '').trim();

    if (!titulo) {
      return res.status(400).json({
        ok: false,
        erro: 'Título obrigatório.'
      });
    }

    const slug =
      String(req.body.slug || titulo)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const noticia = await SiteNoticia.create({
      tenant,

      titulo,

      slug,

      resumo: req.body.resumo || '',
      conteudo: req.body.conteudo || '',
      categoria: req.body.categoria || 'Comunicado',
      autor: req.body.autor || 'Comunicação CMDPII',
      imagem: req.body.imagem || '',

      status: req.body.status || 'rascunho',

      destaque: req.body.destaque === true,

      seoTitulo: req.body.seoTitulo || '',
      seoDescricao: req.body.seoDescricao || '',

      criadaPor: getUserId(req),
      atualizadaPor: getUserId(req)
    });

    res.status(201).json({
      ok: true,
      noticia
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

router.put('/noticias/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const noticia = await SiteNoticia.findOneAndUpdate(
      {
        _id: req.params.id,
        tenant
      },
      {
        ...req.body,
        tenant,
        atualizadaPor: getUserId(req)
      },
      {
        new: true
      }
    );

    if (!noticia) {
      return res.status(404).json({
        ok: false,
        erro: 'Notícia não encontrada.'
      });
    }

    res.json({
      ok: true,
      noticia
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

router.delete('/noticias/:id', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const noticia = await SiteNoticia.findOneAndDelete({
      _id: req.params.id,
      tenant
    });

    if (!noticia) {
      return res.status(404).json({
        ok: false,
        erro: 'Notícia não encontrada.'
      });
    }

    res.json({
      ok: true
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

/* =========================
   PATROCINADORES
   ========================= */

/* LISTAR */

router.get('/patrocinadores', async (req, res) => {
  try {

    const tenant = getTenant(req);

    const patrocinadores = await SitePatrocinador
      .find({ tenant })
      .sort({
        destaque: -1,
        ordem: 1,
        createdAt: -1
      })
      .lean();

    res.json({
      ok: true,
      patrocinadores
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

/* CRIAR */

router.post('/patrocinadores', async (req, res) => {
  try {

    const tenant = getTenant(req);

    const patrocinador =
      await SitePatrocinador.create({

        tenant,

        nome:
          req.body.nome || 'Patrocinador',

        descricao:
          req.body.descricao || '',

        imagem:
          req.body.imagem || '',

        url:
          req.body.url || '',

        tipo:
          req.body.tipo || 'patrocinador',

        status:
          req.body.status || 'ativo',

        destaque:
          !!req.body.destaque,

        ordem:
          Number(req.body.ordem || 0),

        criadoPor:
          req.usuario?._id || null
      });

    res.json({
      ok: true,
      patrocinador
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

/* ATUALIZAR */

router.put('/patrocinadores/:id', async (req, res) => {
  try {

    const tenant = getTenant(req);

    const patrocinador =
      await SitePatrocinador.findOneAndUpdate(
        {
          _id: req.params.id,
          tenant
        },
        {
          nome:
            req.body.nome || 'Patrocinador',

          descricao:
            req.body.descricao || '',

          imagem:
            req.body.imagem || '',

          url:
            req.body.url || '',

          tipo:
            req.body.tipo || 'patrocinador',

          status:
            req.body.status || 'ativo',

          destaque:
            !!req.body.destaque,

          ordem:
            Number(req.body.ordem || 0),

          atualizadoPor:
            req.usuario?._id || null
        },
        {
          new: true
        }
      );

    if (!patrocinador) {
      return res.status(404).json({
        ok: false,
        erro: 'Patrocinador não encontrado.'
      });
    }

    res.json({
      ok: true,
      patrocinador
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

/* EXCLUIR */

router.delete('/patrocinadores/:id', async (req, res) => {
  try {

    const tenant = getTenant(req);

    const patrocinador =
      await SitePatrocinador.findOneAndDelete({
        _id: req.params.id,
        tenant
      });

    if (!patrocinador) {
      return res.status(404).json({
        ok: false,
        erro: 'Patrocinador não encontrado.'
      });
    }

    res.json({
      ok: true
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      erro: err.message
    });
  }
});

module.exports = router;