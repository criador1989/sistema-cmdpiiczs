'use strict';

const express = require('express');
const router = express.Router();

const { listarTodosMotivos } = require('../../utils/regulamento');

// MULTI-TENANT
const { requireTenant } = require('../../middleware/tenantScope');
const { autenticar } = require('../../middleware/autenticacao');

// MODEL NOVO
let ConfiguracaoDisciplinar = null;
try {
  ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
} catch (_) {
  ConfiguracaoDisciplinar = null;
}

/* =========================================================
   ===== HELPERS ===========================================
   ========================================================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function normalizarClassificacao(categoria) {
  const map = {
    leve: 'Leve',
    medio: 'Médio',
    grave: 'Grave',
    gravissimo: 'Gravíssimo',
    elogio: 'Elogio'
  };

  return map[(categoria || '').toLowerCase()] || categoria || '';
}

/* =========================================================
   ===== ROTA PRINCIPAL ====================================
   ========================================================= */

router.get('/', autenticar, requireTenant, async (req, res) => {
  try {
    const inst = getTenantId(req);

    // 🔥 TENTA BUSCAR DA CONFIGURAÇÃO DISCIPLINAR
    if (ConfiguracaoDisciplinar && inst) {
      const config = await ConfiguracaoDisciplinar.findOne({
        instituicao: inst
      }).lean();

      if (config && config.regulamento && Array.isArray(config.regulamento.artigos)) {

        const lista = [];

        for (const artigo of config.regulamento.artigos) {
          for (const inciso of (artigo.incisos || [])) {

            lista.push({
              motivo: inciso.texto,
              artigo: artigo.numero,
              paragrafo: artigo.titulo || '',
              inciso: inciso.codigo || String(inciso._id),
              classificacao: normalizarClassificacao(inciso.categoria)
            });

          }
        }

        // 👉 Se encontrou dados, já retorna
        if (lista.length > 0) {
          return res.json(lista);
        }
      }
    }

    // 🟡 FALLBACK (não quebra sistema antigo)
    console.warn('[MOTIVOS] Usando fallback do regulamento antigo');

    const motivosAntigos = listarTodosMotivos();

    return res.json(motivosAntigos);

  } catch (err) {
    console.error('Erro ao listar motivos:', err);
    return res.status(500).json({ error: 'Erro ao listar motivos' });
  }
});

module.exports = router;