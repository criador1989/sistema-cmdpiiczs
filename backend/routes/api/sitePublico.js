'use strict';

const express = require('express');

const SitePagina = require('../../models/SitePagina');
const SiteBloco = require('../../models/SiteBloco');
const SiteMidia = require('../../models/SiteMidia');
const SiteConfig = require('../../models/SiteConfig');
const SiteNoticia = require('../../models/SiteNoticia');
const SitePatrocinador = require('../../models/SitePatrocinador');

const router = express.Router();

function getTenant(req) {
  return req.tenantSlug || req.headers['x-tenant-slug'] || 'cmdpii-czs';
}

/* =========================
   CONFIG PÚBLICA
   ========================= */

router.get('/config', async (req, res) => {
  try {
    const tenant = getTenant(req);

    let config = await SiteConfig.findOne({ tenant }).lean();

    if (!config) {
      config = await SiteConfig.create({ tenant });
      config = config.toObject();
    }

    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   PÁGINAS PÚBLICAS
   ========================= */

router.get('/paginas', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const paginas = await SitePagina
      .find({ tenant, status: 'publicada' })
      .sort({ ordem: 1, titulo: 1 })
      .select('titulo slug descricao tipo ordem seoTitulo seoDescricao')
      .lean();

    res.json({ ok: true, paginas });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.get('/paginas/:slug', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const pagina = await SitePagina
      .findOne({
        tenant,
        slug: String(req.params.slug || '').toLowerCase(),
        status: 'publicada'
      })
      .lean();

    if (!pagina) {
      return res.status(404).json({ ok: false, erro: 'Página não encontrada.' });
    }

    const blocos = await SiteBloco
      .find({
        tenant,
        pagina: pagina._id,
        ativo: true
      })
      .sort({ ordem: 1, createdAt: 1 })
      .lean();

    res.json({ ok: true, pagina, blocos });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   MÍDIAS PÚBLICAS
   ========================= */

router.get('/midias', async (req, res) => {
  try {
    const tenant = getTenant(req);
    const tipo = req.query.tipo ? { tipo: req.query.tipo } : {};

    const midias = await SiteMidia
      .find({ tenant, ...tipo })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('nomeOriginal url mimeType tipo descricao alt createdAt')
      .lean();

    res.json({ ok: true, midias });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   VISITAS
   ========================= */

router.post('/visita', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const hoje = new Date();
    const inicioHoje = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate()
    );

    let config = await SiteConfig.findOne({ tenant });

    if (!config) {
      config = await SiteConfig.create({ tenant });
    }

    const atualizadoEm = config.analytics?.atualizadoEm;

    const precisaResetarHoje =
      !atualizadoEm ||
      new Date(atualizadoEm) < inicioHoje;

    const update = {
      $inc: {
        'analytics.visitasTotais': 1,
        'analytics.visitasHoje': 1
      },
      $set: {
        'analytics.atualizadoEm': new Date()
      }
    };

    if (precisaResetarHoje) {
      update.$set['analytics.visitasHoje'] = 1;
      delete update.$inc['analytics.visitasHoje'];
    }

    config = await SiteConfig.findOneAndUpdate(
      { tenant },
      update,
      {
        new: true,
        upsert: true
      }
    ).lean();

    res.json({
      ok: true,
      visitasTotais: config.analytics?.visitasTotais || 0,
      visitasHoje: config.analytics?.visitasHoje || 0
    });

  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});


/* =========================
   NOTÍCIAS PÚBLICAS
   ========================= */

router.get('/noticias', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const noticias = await SiteNoticia
      .find({
        tenant,
        status: 'publicada'
      })
      .sort({
        destaque: -1,
        dataPublicacao: -1
      })
      .select('titulo slug resumo conteudo categoria autor imagem imagens destaque dataPublicacao seoTitulo seoDescricao createdAt')
      .lean();

    res.json({ ok: true, noticias });

  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.get('/noticias/:slug', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const noticia = await SiteNoticia
      .findOne({
        tenant,
        slug: String(req.params.slug || '').toLowerCase(),
        status: 'publicada'
      })
      .select('titulo slug resumo conteudo categoria autor imagem imagens destaque dataPublicacao seoTitulo seoDescricao createdAt')
      .lean();

    if (!noticia) {
      return res.status(404).json({
        ok: false,
        erro: 'Notícia não encontrada.'
      });
    }

    res.json({ ok: true, noticia });

  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

/* =========================
   PATROCINADORES PÚBLICOS
   ========================= */

router.get('/patrocinadores', async (req, res) => {
  try {
    const tenant = getTenant(req);

    const patrocinadores = await SitePatrocinador
      .find({
        tenant,
        status: 'ativo'
      })
      .sort({
        destaque: -1,
        ordem: 1,
        createdAt: -1
      })
      .select(
        'nome descricao imagem url tipo destaque ordem createdAt'
      )
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

module.exports = router;