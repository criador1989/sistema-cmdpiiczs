'use strict';
const mongoose = require('mongoose');
const {
  CONFIG_PADRAO_CBMAC,
  getValorMedidaByTipoMedida,
  getValorElogioByTipoElogio
} = require('../utils/configuracaoDisciplinar');

/* =========================
   HELPERS TENANT
========================= */
function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function objectIdToString(value) {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function sincronizarTenant(doc) {
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na notificação.');
  }

  if (instituicao && !tenantId) {
    doc.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    doc.instituicao = tenantId;
  }
}

function sincronizarTenantNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const instituicao = $set.instituicao ?? update.instituicao;
  const tenantId = $set.tenantId ?? update.tenantId;

  const i = toObjectIdOrNull(instituicao);
  const t = toObjectIdOrNull(tenantId);

  if (i && t && objectIdToString(i) !== objectIdToString(t)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update da notificação.');
  }

  if (i && !t) {
    if (update.$set) update.$set.tenantId = i;
    else update.tenantId = i;
  } else if (!i && t) {
    if (update.$set) update.$set.instituicao = t;
    else update.instituicao = t;
  }
}

/* =========================
   HELPERS GERAIS
========================= */
function fix2(n) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  return Number(n.toFixed(2));
}

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : s;
}

function lowerTrim(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/* =========================
   SCHEMA
========================= */

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: false,
    index: true
  },

  natureza: {
    type: String,
    enum: ['indisciplina', 'elogio'],
    default: 'indisciplina',
    required: true,
    index: true
  },

  tipo: {
    type: String,
    required: true
  },

  motivo: {
    type: String,
    required: true
  },

  tipoMedida: {
    type: String,
    required: true
  },

  valorNumerico: {
    type: Number,
    required: true
  },

  quantidadeDias: {
    type: Number,
    default: 1
  },

  observacao: {
    type: String
  },

  data: {
    type: Date,
    required: true,
    index: true
  },

  notaAnterior: {
    type: Number
  },

  notaAtual: {
    type: Number
  },

  classificacaoAnterior: {
    type: String,
    default: null
  },

  classificacaoAtual: {
    type: String,
    default: null
  },

  artigo: {
    type: String
  },

  paragrafo: {
    type: String
  },

  inciso: {
    type: String
  },

  classificacaoRegulamento: {
    type: String
  },

  numeroSequencial: {
    type: String,
    required: true,
    trim: true
  },

  instituicao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    default: null,
    index: true
  },

  status: {
    type: String,
    enum: ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente',
    index: true
  },

  avaliador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    index: true
  },

  comentarioMonitor: {
    type: String
  },

  comentarioRevisao: {
    type: String
  },

  deferidoEm: {
    type: Date,
    default: null
  },

  mensagemEnviada: {
    type: Boolean,
    default: false,
    index: true
  },

  mensagemEnviadaEm: {
    type: Date,
    default: null
  },

  /* =========================
     CIÊNCIA DIGITAL DO RESPONSÁVEL
     - Usado para controle de e-mail, visualização e confirmação de ciência.
  ========================= */
  responsavelCiencia: {
    nome: {
      type: String,
      trim: true
    },
    parentesco: {
      type: String,
      trim: true
    },
    telefone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },

    notificado: {
      type: Boolean,
      default: false,
      index: true
    },
    notificadoEm: {
      type: Date,
      default: null
    },

    visualizou: {
      type: Boolean,
      default: false,
      index: true
    },
    visualizouEm: {
      type: Date,
      default: null
    },

    confirmouCiencia: {
      type: Boolean,
      default: false,
      index: true
    },
    confirmouCienciaEm: {
      type: Date,
      default: null
    },

    ipCiencia: {
      type: String,
      trim: true
    },

    userAgentCiencia: {
      type: String,
      trim: true
    },

    resposta: {
      type: String,
      trim: true
    }
  },

  tokenResponsavel: {
    type: String,
    trim: true,
    default: null,
    index: true
  },

  tokenResponsavelExpiraEm: {
    type: Date,
    default: null,
    index: true
  },

  tokenResponsavelUsadoEm: {
    type: Date,
    default: null
  },

  tipoElogio: {
    type: String,
    enum: ['elogioVerbal', 'boletimInternoIndividual', 'boletimInternoColetivo', 'mediaAlta', null],
    default: null
  },

  lida: {
    type: Boolean,
    default: false,
    index: true
  },

  arquivada: {
    type: Boolean,
    default: false,
    index: true
  },

  ativo: {
    type: Boolean,
    default: true,
    index: true
  },

  /* =========================
     NOVO FLUXO DISCIPLINAR
  ========================= */

  classificacaoOcorrencia: {
    type: String,
    enum: [
      'indisciplina_leve',
      'indisciplina_media',
      'indisciplina_grave',
      'ato_infracional'
    ],
    default: 'indisciplina_leve',
    index: true
  },

  possuiViolencia: {
    type: Boolean,
    default: false
  },

  possuiLesao: {
    type: Boolean,
    default: false
  },

  possuiDanoPatrimonial: {
    type: Boolean,
    default: false
  },

  possuiSubstanciaIlicita: {
    type: Boolean,
    default: false
  },

  possuiArmaOuObjetoPerigoso: {
    type: Boolean,
    default: false
  },

  exigeEncaminhamentoExterno: {
    type: Boolean,
    default: false,
    index: true
  },

  orgaoEncaminhamento: {
    type: String,
    enum: [
      null,
      'conselho_tutelar',
      'ministerio_publico',
      'delegacia',
      'judiciario'
    ],
    default: null
  },

  processoDisciplinar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProcessoDisciplinar',
    default: null,
    index: true
  },

  processoInstaurado: {
    type: Boolean,
    default: false,
    index: true
  },

  documentoDigital: {
    tipo: String,
    hash: String,
    hashAssinatura: String,
    assinadoPorNome: String,
    assinadoEm: Date
  }

}, {
  timestamps: true
});

/* =========================
   ÍNDICES
========================= */

/**
 * IMPORTANTE:
 * O índice único correto é por instituição + número sequencial.
 * Se ainda existir no MongoDB Atlas o índice legado `numeroSequencial_1`,
 * ele precisa ser removido manualmente, senão continuará dando E11000
 * mesmo com este schema correto.
 */
notificacaoSchema.index(
  { instituicao: 1, numeroSequencial: 1 },
  { unique: true, name: 'uq_notificacao_instituicao_numeroSequencial' }
);

notificacaoSchema.index(
  { tenantId: 1, numeroSequencial: 1 },
  { name: 'idx_notificacao_tenant_numeroSequencial' }
);

notificacaoSchema.index(
  { instituicao: 1, aluno: 1, data: 1 },
  { name: 'idx_notificacao_instituicao_aluno_data' }
);

notificacaoSchema.index(
  { tenantId: 1, aluno: 1, data: 1 },
  { name: 'idx_notificacao_tenant_aluno_data' }
);

notificacaoSchema.index(
  { instituicao: 1, status: 1 },
  { name: 'idx_notificacao_instituicao_status' }
);

notificacaoSchema.index(
  { tenantId: 1, status: 1 },
  { name: 'idx_notificacao_tenant_status' }
);


notificacaoSchema.index(
  { tokenResponsavel: 1, tokenResponsavelExpiraEm: 1 },
  { name: 'idx_notificacao_token_responsavel' }
);

/* =========================
   LÓGICA PADRÃO / FALLBACK
========================= */

const MAPA_NEGATIVOS = {
  'Advertência Escrita': CONFIG_PADRAO_CBMAC.medidas.advertenciaEscrita,
  'Repreensão': CONFIG_PADRAO_CBMAC.medidas.repreensao,
  'A.E.C.D.E': CONFIG_PADRAO_CBMAC.medidas.aecdePorDia,
  'A.I.A': CONFIG_PADRAO_CBMAC.medidas.aiaPorDia
};

const MAPA_ELOGIOS = {
  elogioVerbal: CONFIG_PADRAO_CBMAC.recompensas.elogioVerbal,
  boletimInternoIndividual: CONFIG_PADRAO_CBMAC.recompensas.elogioIndividual,
  boletimInternoColetivo: CONFIG_PADRAO_CBMAC.recompensas.elogioColetivo,
  mediaAlta: CONFIG_PADRAO_CBMAC.recompensas.mediaAlta
};

const REQUER_DIAS = new Set(['A.E.C.D.E', 'A.I.A']);

/* =========================
   PRE VALIDATE
========================= */

notificacaoSchema.pre('validate', function () {
  sincronizarTenant(this);

  this.tipo = trimStr(this.tipo);
  this.motivo = trimStr(this.motivo);
  this.tipoMedida = trimStr(this.tipoMedida);
  this.observacao = trimStr(this.observacao);
  this.artigo = trimStr(this.artigo);
  this.paragrafo = trimStr(this.paragrafo);
  this.inciso = trimStr(this.inciso);
  this.classificacaoRegulamento = trimStr(this.classificacaoRegulamento);
  this.comentarioMonitor = trimStr(this.comentarioMonitor);
  this.comentarioRevisao = trimStr(this.comentarioRevisao);
  this.numeroSequencial = trimStr(this.numeroSequencial);

  if (this.arquivada === true && lowerTrim(this.status) !== 'arquivado') {
    this.status = 'arquivado';
  }

  if (lowerTrim(this.status) === 'arquivado' && this.arquivada !== true) {
    this.arquivada = true;
  }

  if (this.natureza === 'elogio') {
    this.quantidadeDias = null;

    if (this.valorNumerico === undefined || this.valorNumerico === null || this.valorNumerico === '') {
      const valorPadrao =
        getValorElogioByTipoElogio(this.tipoElogio, CONFIG_PADRAO_CBMAC) ||
        MAPA_ELOGIOS[this.tipoElogio] ||
        0;

      this.valorNumerico = fix2(valorPadrao);
    } else {
      this.valorNumerico = fix2(Math.abs(Number(this.valorNumerico) || 0));
    }

    this.tipoMedida = 'Elogio';
    return;
  }

  const titulo = this.tipoMedida;
  const precisaDias = REQUER_DIAS.has(titulo);

  this.quantidadeDias = precisaDias ? Math.max(1, this.quantidadeDias || 1) : 1;

  if (this.valorNumerico === undefined || this.valorNumerico === null || this.valorNumerico === '') {
    const valorPadrao =
      getValorMedidaByTipoMedida(titulo, CONFIG_PADRAO_CBMAC) ||
      MAPA_NEGATIVOS[titulo] ||
      0;

    this.valorNumerico = fix2(valorPadrao);
  } else {
    this.valorNumerico = fix2(-Math.abs(Number(this.valorNumerico) || 0));
  }
});

/* =========================
   PRE UPDATE
========================= */

notificacaoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || {};
    const arquivada = $set.arquivada ?? update.arquivada;
    const status = ($set.status ?? update.status);

    if (arquivada === true) {
      if (update.$set) update.$set.status = 'arquivado';
      else update.status = 'arquivado';
    }

    if (lowerTrim(status) === 'arquivado') {
      if (update.$set) update.$set.arquivada = true;
      else update.arquivada = true;
    }

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   PRE SAVE
========================= */

notificacaoSchema.pre('save', function (next) {
  try {
    sincronizarTenant(this);

    if (this.arquivada === true && lowerTrim(this.status) !== 'arquivado') {
      this.status = 'arquivado';
    }

    if (lowerTrim(this.status) === 'arquivado' && this.arquivada !== true) {
      this.arquivada = true;
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Notificacao', notificacaoSchema);
