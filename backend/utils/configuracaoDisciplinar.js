const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');

const PRESET_MILITAR = {
  preset: 'militar',
  tipoRegulamento: 'militar',

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

  ocorrencias: [],

  tsmd: {
    ativo: true,
    diasParaIniciar: 60,
    incrementoPorDia: 0.01,
    limiteMaximo: 10,
  },

  regulamento: {
    nome: 'Regulamento Disciplinar Militar',
    versao: '1.0',
    textos: {
      cabecalho: 'Regulamento disciplinar militar',
      notificacao: 'Conforme previsto no regulamento disciplinar militar vigente.',
      observacaoPadrao: ''
    }
  }
};

const PRESET_PARTICULAR = {
  preset: 'particular',
  tipoRegulamento: 'adaptavel',

  // 🔥 mesma lógica base validada no militar
  comportamento: {
    notaInicial: 8.0,
    faixas: [
      { nome: 'Exemplar', min: 9.01, max: 10.0 },
      { nome: 'Muito Bom', min: 8.01, max: 9.0 },
      { nome: 'Bom', min: 7.0, max: 8.0 },
      { nome: 'Em Atenção', min: 5.0, max: 6.99 },
      { nome: 'Insatisfatório', min: 3.0, max: 4.99 },
      { nome: 'Crítico', min: 0.0, max: 2.99 },
    ],
  },

  // 🔥 mantidos por compatibilidade do motor
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

  // 🔥 catálogo pedagógico/institucional
  ocorrencias: [
    { nome: 'Conversa excessiva em sala', tipo: 'negativo', valor: -0.10, categoria: 'Convivência' },
    { nome: 'Uso inadequado do celular', tipo: 'negativo', valor: -0.15, categoria: 'Disciplina' },
    { nome: 'Não realização de atividade', tipo: 'negativo', valor: -0.15, categoria: 'Acadêmico' },
    { nome: 'Atraso recorrente', tipo: 'negativo', valor: -0.10, categoria: 'Pontualidade' },
    { nome: 'Saída sem autorização', tipo: 'negativo', valor: -0.20, categoria: 'Disciplina' },
    { nome: 'Desrespeito a orientações', tipo: 'negativo', valor: -0.25, categoria: 'Disciplina' },
    { nome: 'Desorganização recorrente', tipo: 'negativo', valor: -0.10, categoria: 'Responsabilidade' },
    { nome: 'Linguagem imprópria', tipo: 'negativo', valor: -0.20, categoria: 'Convivência' },
    { nome: 'Desrespeito a colega', tipo: 'negativo', valor: -0.30, categoria: 'Convivência' },
    { nome: 'Desrespeito a professor', tipo: 'negativo', valor: -0.40, categoria: 'Convivência' },
    { nome: 'Dano ao patrimônio', tipo: 'negativo', valor: -0.50, categoria: 'Responsabilidade' },

    { nome: 'Participação destacada', tipo: 'positivo', valor: 0.10, categoria: 'Acadêmico' },
    { nome: 'Postura respeitosa', tipo: 'positivo', valor: 0.15, categoria: 'Convivência' },
    { nome: 'Compromisso acadêmico', tipo: 'positivo', valor: 0.20, categoria: 'Acadêmico' },
    { nome: 'Cooperação exemplar', tipo: 'positivo', valor: 0.20, categoria: 'Convivência' },
    { nome: 'Liderança positiva', tipo: 'positivo', valor: 0.25, categoria: 'Protagonismo' },
    { nome: 'Evolução comportamental', tipo: 'positivo', valor: 0.30, categoria: 'Desenvolvimento' },
  ],

  // 🔥 TSMD mantido
  tsmd: {
    ativo: true,
    diasParaIniciar: 60,
    incrementoPorDia: 0.01,
    limiteMaximo: 10,
  },

  regulamento: {
    nome: 'Normas Institucionais de Convivência',
    versao: '1.0',
    textos: {
      cabecalho: 'Normas institucionais de convivência e acompanhamento escolar',
      notificacao: 'Registro realizado conforme as normas institucionais de convivência e acompanhamento disciplinar da escola.',
      observacaoPadrao: 'A escola prioriza o acompanhamento pedagógico e formativo, buscando o desenvolvimento integral do estudante.'
    }
  }
};

const CONFIG_PADRAO_CBMAC = PRESET_MILITAR;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizarNumero(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizarTexto(v, fallback = '') {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : fallback;
  }
  return fallback;
}

function normalizarTipoPreset(tipo) {
  const t = String(tipo || '').trim().toLowerCase();

  if (t === 'particular') return 'particular';
  if (t === 'personalizado') return 'personalizado';
  return 'militar';
}

function normalizarTipoRegulamento(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  return t === 'adaptavel' ? 'adaptavel' : 'militar';
}

function normalizarOcorrencias(lista = []) {
  if (!Array.isArray(lista)) return [];

  return lista
    .map((o) => ({
      nome: normalizarTexto(o?.nome, ''),
      tipo: ['positivo', 'negativo'].includes(String(o?.tipo || '').trim().toLowerCase())
        ? String(o.tipo).trim().toLowerCase()
        : 'negativo',
      valor: normalizarNumero(o?.valor, 0),
      categoria: normalizarTexto(o?.categoria, '')
    }))
    .filter((o) => o.nome);
}

function getPresetBase(tipoPreset = 'militar') {
  const tipo = normalizarTipoPreset(tipoPreset);

  if (tipo === 'particular') return clone(PRESET_PARTICULAR);

  if (tipo === 'personalizado') {
    const base = clone(PRESET_PARTICULAR);
    base.preset = 'personalizado';
    return base;
  }

  return clone(PRESET_MILITAR);
}

function mergeConfig(base, dbConfig) {
  const merged = clone(base);

  if (!dbConfig || typeof dbConfig !== 'object') return merged;

  merged.preset = normalizarTipoPreset(dbConfig.preset || merged.preset);
  merged.tipoRegulamento = normalizarTipoRegulamento(
    dbConfig.tipoRegulamento || merged.tipoRegulamento
  );

  if (dbConfig.comportamento) {
    merged.comportamento.notaInicial = normalizarNumero(
      dbConfig.comportamento.notaInicial,
      merged.comportamento.notaInicial
    );

    if (Array.isArray(dbConfig.comportamento.faixas) && dbConfig.comportamento.faixas.length) {
      merged.comportamento.faixas = dbConfig.comportamento.faixas.map((f) => ({
        nome: normalizarTexto(f?.nome, ''),
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

  if (dbConfig.ocorrencias) {
    merged.ocorrencias = normalizarOcorrencias(dbConfig.ocorrencias);
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

  if (dbConfig.regulamento && typeof dbConfig.regulamento === 'object') {
    merged.regulamento = merged.regulamento || {};
    merged.regulamento.textos = merged.regulamento.textos || {};

    merged.regulamento.nome = normalizarTexto(
      dbConfig.regulamento.nome,
      merged.regulamento.nome
    );

    merged.regulamento.versao = normalizarTexto(
      dbConfig.regulamento.versao,
      merged.regulamento.versao
    );

    const textos = dbConfig.regulamento.textos || {};
    merged.regulamento.textos.cabecalho = normalizarTexto(
      textos.cabecalho,
      merged.regulamento.textos.cabecalho
    );
    merged.regulamento.textos.notificacao = normalizarTexto(
      textos.notificacao,
      merged.regulamento.textos.notificacao
    );
    merged.regulamento.textos.observacaoPadrao = normalizarTexto(
      textos.observacaoPadrao,
      merged.regulamento.textos.observacaoPadrao
    );
  }

  return merged;
}

async function getConfigDisciplinar(instituicaoId) {
  if (!instituicaoId) {
    return clone(CONFIG_PADRAO_CBMAC);
  }

  const doc = await ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean();

  if (!doc) {
    return clone(CONFIG_PADRAO_CBMAC);
  }

  const base = getPresetBase(doc.preset || 'militar');
  const merged = mergeConfig(base, doc);

  if (!merged.tipoRegulamento) {
    merged.tipoRegulamento = merged.preset === 'militar' ? 'militar' : 'adaptavel';
  }

  return merged;
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

function normalizarChave(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getValorMedidaByTipoMedida(tipoMedida, config) {
  const cfg = config || CONFIG_PADRAO_CBMAC;
  const t = normalizarChave(tipoMedida);

  if (t === 'advertencia escrita') return cfg.medidas.advertenciaEscrita;
  if (t === 'repreensao') return cfg.medidas.repreensao;
  if (t === 'a.e.c.d.e' || t === 'aecde') return cfg.medidas.aecdePorDia;
  if (t === 'a.i.a' || t === 'aia') return cfg.medidas.aiaPorDia;

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

function getTextoRegulamento(config) {
  const cfg = config || CONFIG_PADRAO_CBMAC;
  return cfg.regulamento || clone(PRESET_MILITAR.regulamento);
}

module.exports = {
  CONFIG_PADRAO_CBMAC,
  PRESET_MILITAR,
  PRESET_PARTICULAR,
  getPresetBase,
  getConfigDisciplinar,
  getClassificacaoComportamento,
  getValorMedidaByTipoMedida,
  getValorElogioByTipoElogio,
  getTextoRegulamento,
  mergeConfig,
};