const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');

const CONFIG_PADRAO_CBMAC = {
  comportamento: {
    notaInicial: 8.0,
    faixas: [
      { nome: 'Excepcional', min: 9.01, max: 10.0 },
      { nome: 'Ótimo', min: 8.01, max: 9.0 },
      { nome: 'Bom', min: 7.0, max: 8.0 },
      { nome: 'Regular', min: 5.0, max: 6.99 },
      { nome: 'Insuficiente', min: 3.0, max: 4.99 },
      { nome: 'Incompatível', min: 0.0, max: 2.99 },
    ],
  },

  medidas: {
    advertenciaEscrita: -0.30,
    repreensao: -0.50,
    aecdePorDia: -0.70,
    aiaPorDia: -1.20,
  },

  recompensas: {
    elogioVerbal: 0.15,
    elogioIndividual: 0.60,
    elogioColetivo: 0.20,
    mediaAlta: 0.40,
  },

  tsmd: {
    ativo: true,
    diasParaIniciar: 60,
    incrementoPorDia: 0.01,
    limiteMaximo: 10,
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizarNumero(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mergeConfig(base, dbConfig) {
  const merged = clone(base);

  if (!dbConfig || typeof dbConfig !== 'object') return merged;

  if (dbConfig.comportamento) {
    merged.comportamento.notaInicial = normalizarNumero(
      dbConfig.comportamento.notaInicial,
      merged.comportamento.notaInicial
    );

    if (Array.isArray(dbConfig.comportamento.faixas) && dbConfig.comportamento.faixas.length) {
      merged.comportamento.faixas = dbConfig.comportamento.faixas.map((f) => ({
        nome: String(f?.nome || '').trim(),
        min: normalizarNumero(f?.min, 0),
        max: normalizarNumero(f?.max, 0),
      }));
    }
  }

  if (dbConfig.medidas) {
    merged.medidas.advertenciaEscrita = normalizarNumero(
      dbConfig.medidas.advertenciaEscrita,
      merged.medidas.advertenciaEscrita
    );
    merged.medidas.repreensao = normalizarNumero(
      dbConfig.medidas.repreensao,
      merged.medidas.repreensao
    );
    merged.medidas.aecdePorDia = normalizarNumero(
      dbConfig.medidas.aecdePorDia,
      merged.medidas.aecdePorDia
    );
    merged.medidas.aiaPorDia = normalizarNumero(
      dbConfig.medidas.aiaPorDia,
      merged.medidas.aiaPorDia
    );
  }

  if (dbConfig.recompensas) {
    merged.recompensas.elogioVerbal = normalizarNumero(
      dbConfig.recompensas.elogioVerbal,
      merged.recompensas.elogioVerbal
    );
    merged.recompensas.elogioIndividual = normalizarNumero(
      dbConfig.recompensas.elogioIndividual,
      merged.recompensas.elogioIndividual
    );
    merged.recompensas.elogioColetivo = normalizarNumero(
      dbConfig.recompensas.elogioColetivo,
      merged.recompensas.elogioColetivo
    );
    merged.recompensas.mediaAlta = normalizarNumero(
      dbConfig.recompensas.mediaAlta,
      merged.recompensas.mediaAlta
    );
  }

  if (dbConfig.tsmd) {
    merged.tsmd.ativo =
      typeof dbConfig.tsmd.ativo === 'boolean'
        ? dbConfig.tsmd.ativo
        : merged.tsmd.ativo;

    merged.tsmd.diasParaIniciar = normalizarNumero(
      dbConfig.tsmd.diasParaIniciar,
      merged.tsmd.diasParaIniciar
    );
    merged.tsmd.incrementoPorDia = normalizarNumero(
      dbConfig.tsmd.incrementoPorDia,
      merged.tsmd.incrementoPorDia
    );
    merged.tsmd.limiteMaximo = normalizarNumero(
      dbConfig.tsmd.limiteMaximo,
      merged.tsmd.limiteMaximo
    );
  }

  return merged;
}

async function getConfigDisciplinar(instituicaoId) {
  if (!instituicaoId) {
    return clone(CONFIG_PADRAO_CBMAC);
  }

  const doc = await ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean();
  return mergeConfig(CONFIG_PADRAO_CBMAC, doc || {});
}

function getClassificacaoComportamento(nota, config) {
  const cfg = config || CONFIG_PADRAO_CBMAC;
  const valor = Number(nota);

  if (!Number.isFinite(valor)) return null;

  const faixa = (cfg.comportamento?.faixas || []).find(
    (f) => valor >= Number(f.min) && valor <= Number(f.max)
  );

  return faixa?.nome || null;
}

function getValorMedidaByTipoMedida(tipoMedida, config) {
  const cfg = config || CONFIG_PADRAO_CBMAC;
  const t = String(tipoMedida || '').trim().toLowerCase();

  if (t === 'advertência escrita' || t === 'advertencia escrita') {
    return cfg.medidas.advertenciaEscrita;
  }
  if (t === 'repreensão' || t === 'repreensao') {
    return cfg.medidas.repreensao;
  }
  if (t === 'a.e.c.d.e' || t === 'aecde') {
    return cfg.medidas.aecdePorDia;
  }
  if (t === 'a.i.a' || t === 'aia') {
    return cfg.medidas.aiaPorDia;
  }

  return 0;
}

function getValorElogioByTipoElogio(tipoElogio, config) {
  const cfg = config || CONFIG_PADRAO_CBMAC;
  const t = String(tipoElogio || '').trim();

  if (t === 'elogioVerbal') return cfg.recompensas.elogioVerbal;
  if (t === 'boletimInternoIndividual') return cfg.recompensas.elogioIndividual;
  if (t === 'boletimInternoColetivo') return cfg.recompensas.elogioColetivo;
  if (t === 'mediaAlta') return cfg.recompensas.mediaAlta;

  return 0;
}

module.exports = {
  CONFIG_PADRAO_CBMAC,
  getConfigDisciplinar,
  getClassificacaoComportamento,
  getValorMedidaByTipoMedida,
  getValorElogioByTipoElogio,
};