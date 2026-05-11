'use strict';

const mongoose = require('mongoose');

/* =========================
   HELPERS
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
    throw new Error('Inconsistência entre instituicao e tenantId no procedimento disciplinar.');
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
    throw new Error('Inconsistência entre instituicao e tenantId no update do procedimento disciplinar.');
  }

  if (i && !t) {
    if (update.$set) update.$set.tenantId = i;
    else update.tenantId = i;
  } else if (!i && t) {
    if (update.$set) update.$set.instituicao = t;
    else update.instituicao = t;
  }
}

function trimStr(s) {
  return typeof s === 'string' ? s.trim() : s;
}

function calcularDataPrazo(dataBase, dias = 30) {
  const base = dataBase ? new Date(dataBase) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const prazo = new Date(base);
  prazo.setDate(prazo.getDate() + Number(dias || 30));
  prazo.setHours(23, 59, 59, 999);
  return prazo;
}

/* =========================
   SUBSCHEMAS
========================= */

const testemunhaSchema = new mongoose.Schema({
  nome: {
    type: String,
    trim: true
  },
  funcao: {
    type: String,
    trim: true
  },
  contato: {
    type: String,
    trim: true
  },
  observacao: {
    type: String,
    trim: true
  }
}, { _id: false });

const envolvidoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    default: null
  },
  nome: {
    type: String,
    trim: true
  },
  tipo: {
    type: String,
    enum: ['autor', 'vitima', 'testemunha', 'outro'],
    default: 'outro'
  },
  observacao: {
    type: String,
    trim: true
  }
}, { _id: false });

const responsavelCienciaSchema = new mongoose.Schema({
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
    default: false
  },
  notificadoEm: {
    type: Date,
    default: null
  },

  visualizou: {
    type: Boolean,
    default: false
  },
  visualizouEm: {
    type: Date,
    default: null
  },

  confirmouCiencia: {
    type: Boolean,
    default: false
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

  compareceu: {
    type: Boolean,
    default: false
  },
  compareceuEm: {
    type: Date,
    default: null
  },

  resposta: {
    type: String,
    trim: true
  }
}, { _id: false });

const timelineSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: [
      'processo_aberto',
      'responsavel_notificado',
      'responsavel_visualizou',
      'responsavel_compareceu',
      'ciencia_confirmada',
      'declaracao_registrada',
      'acompanhamento_registrado',
      'documento_gerado',
      'encaminhamento_realizado',
      'processo_arquivado',
      'processo_reaberto',
      'observacao'
    ],
    default: 'observacao',
    index: true
  },
  titulo: {
    type: String,
    trim: true
  },
  descricao: {
    type: String,
    trim: true
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  metadados: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: true });

const documentoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: [
      'capa',
      'portaria_instauracao',
      'termo_ciencia',
      'termo_comparecimento',
      'termo_compromisso',
      'termo_acompanhamento',
      'arquivamento',
      'remessa_conselho_tutelar',
      'oficio_conselho_tutelar',
      'oficio_delegacia',
      'oficio_ministerio_publico',
      'oficio_judiciario',
      'relatorio_final',
      'dossie_pdf',
      'outro'
    ],
    default: 'outro',
    index: true
  },
  titulo: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    trim: true
  },
  caminhoLocal: {
    type: String,
    trim: true
  },
  hash: {
  type: String,
  trim: true,
  index: true
},
  geradoEm: {
    type: Date,
    default: Date.now
  },
  geradoPor: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  ordem: {
    type: Number,
    default: 0
  },

  obrigatorio: {
    type: Boolean,
    default: false
  },

  categoria: {
    type: String,
    enum: [
      'abertura',
      'acompanhamento',
      'responsavel',
      'encaminhamento',
      'encerramento',
      'dossie_final',
      'outro'
    ],
    default: 'outro'
  }
}, { _id: true });

/* =========================
   SCHEMA PRINCIPAL
========================= */

const processoDisciplinarSchema = new mongoose.Schema({
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

  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true,
    index: true
  },

  notificacao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notificacao',
    default: null,
    index: true
  },

  numeroProcesso: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  natureza: {
    type: String,
    enum: ['indisciplina', 'ato_infracional'],
    default: 'indisciplina',
    index: true
  },

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

  gravidade: {
    type: String,
    enum: ['leve', 'media', 'grave', 'gravissima'],
    default: 'leve',
    index: true
  },

  status: {
    type: String,
    enum: [
      'aberto',
      'em_apuracao',
      'aguardando_responsavel',
      'em_acompanhamento',
      'resolvido',
      'encaminhado',
      'arquivado',
      'cancelado'
    ],
    default: 'aberto',
    index: true
  },

  dataFato: {
    type: Date,
    required: true,
    index: true
  },

  horaFato: {
    type: String,
    trim: true
  },

  localFato: {
    type: String,
    trim: true
  },

  descricaoFato: {
    type: String,
    required: true,
    trim: true
  },

  providenciasImediatas: {
    type: String,
    trim: true
  },

  possuiViolencia: {
    type: Boolean,
    default: false,
    index: true
  },

  possuiLesao: {
    type: Boolean,
    default: false,
    index: true
  },

  possuiDanoPatrimonial: {
    type: Boolean,
    default: false,
    index: true
  },

  possuiSubstanciaIlicita: {
    type: Boolean,
    default: false,
    index: true
  },

  possuiArmaOuObjetoPerigoso: {
    type: Boolean,
    default: false,
    index: true
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
    default: null,
    index: true
  },

  encaminhadoEm: {
    type: Date,
    default: null
  },

  encaminhadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  motivoEncaminhamento: {
    type: String,
    trim: true
  },

  envolvidos: {
    type: [envolvidoSchema],
    default: []
  },

  testemunhas: {
    type: [testemunhaSchema],
    default: []
  },

  responsavel: {
    type: responsavelCienciaSchema,
    default: {}
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

  dataAbertura: {
    type: Date,
    default: Date.now,
    index: true
  },

  abertoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null,
    index: true
  },

  prazoAcompanhamentoDias: {
    type: Number,
    default: 30
  },

  prazoAcompanhamentoAte: {
    type: Date,
    default: null,
    index: true
  },

  acompanhamentoFinalizadoEm: {
    type: Date,
    default: null
  },

  resultadoAcompanhamento: {
    type: String,
    enum: [null, 'reintegrado', 'reincidiu', 'sem_solucao', 'encaminhado'],
    default: null
  },

  parecerFinal: {
    type: String,
    trim: true
  },

  arquivadoEm: {
    type: Date,
    default: null
  },

  arquivadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  motivoArquivamento: {
    type: String,
    trim: true
  },

  timeline: {
    type: [timelineSchema],
    default: []
  },

  documentos: {
    type: [documentoSchema],
    default: []
  },

  ativo: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

/* =========================
   ÍNDICES
========================= */

processoDisciplinarSchema.index(
  { instituicao: 1, numeroProcesso: 1 },
  { unique: true, name: 'uq_processo_disciplinar_instituicao_numero' }
);

processoDisciplinarSchema.index(
  { tenantId: 1, numeroProcesso: 1 },
  { name: 'idx_processo_disciplinar_tenant_numero' }
);

processoDisciplinarSchema.index(
  { instituicao: 1, aluno: 1, status: 1, dataAbertura: -1 },
  { name: 'idx_processo_disciplinar_instituicao_aluno_status_abertura' }
);

processoDisciplinarSchema.index(
  { tenantId: 1, aluno: 1, status: 1, dataAbertura: -1 },
  { name: 'idx_processo_disciplinar_tenant_aluno_status_abertura' }
);

processoDisciplinarSchema.index(
  { instituicao: 1, status: 1, prazoAcompanhamentoAte: 1 },
  { name: 'idx_processo_disciplinar_instituicao_status_prazo' }
);

processoDisciplinarSchema.index(
  { tenantId: 1, status: 1, prazoAcompanhamentoAte: 1 },
  { name: 'idx_processo_disciplinar_tenant_status_prazo' }
);

processoDisciplinarSchema.index(
  { instituicao: 1, exigeEncaminhamentoExterno: 1, status: 1, dataAbertura: -1 },
  { name: 'idx_processo_disciplinar_instituicao_encaminhamento_status' }
);

processoDisciplinarSchema.index(
  { tokenResponsavel: 1, tokenResponsavelExpiraEm: 1 },
  { name: 'idx_processo_disciplinar_token_responsavel' }
);

/* =========================
   MÉTODOS
========================= */

processoDisciplinarSchema.methods.adicionarTimeline = function ({
  tipo = 'observacao',
  titulo = '',
  descricao = '',
  usuario = null,
  metadados = {}
} = {}) {
  this.timeline.push({
    tipo,
    titulo,
    descricao,
    usuario,
    metadados,
    criadoEm: new Date()
  });

  return this;
};

/* =========================
   HOOKS
========================= */

processoDisciplinarSchema.pre('validate', function () {
  sincronizarTenant(this);

  this.numeroProcesso = trimStr(this.numeroProcesso);
  this.horaFato = trimStr(this.horaFato);
  this.localFato = trimStr(this.localFato);
  this.descricaoFato = trimStr(this.descricaoFato);
  this.providenciasImediatas = trimStr(this.providenciasImediatas);
  this.motivoEncaminhamento = trimStr(this.motivoEncaminhamento);
  this.parecerFinal = trimStr(this.parecerFinal);
  this.motivoArquivamento = trimStr(this.motivoArquivamento);
  this.tokenResponsavel = trimStr(this.tokenResponsavel);

  if (!this.prazoAcompanhamentoAte) {
    this.prazoAcompanhamentoAte = calcularDataPrazo(
      this.dataAbertura || new Date(),
      this.prazoAcompanhamentoDias || 30
    );
  }

  if (this.classificacaoOcorrencia === 'ato_infracional') {
    this.natureza = 'ato_infracional';
    this.exigeEncaminhamentoExterno = true;
    if (this.gravidade === 'leve') this.gravidade = 'grave';
  }

  if (
    this.possuiLesao ||
    this.possuiDanoPatrimonial ||
    this.possuiSubstanciaIlicita ||
    this.possuiArmaOuObjetoPerigoso
  ) {
    this.exigeEncaminhamentoExterno = true;
  }

  if (this.exigeEncaminhamentoExterno && !this.orgaoEncaminhamento) {
    if (this.classificacaoOcorrencia === 'ato_infracional') {
      this.orgaoEncaminhamento = 'delegacia';
    }
  }

  if (this.status === 'arquivado' && !this.arquivadoEm) {
    this.arquivadoEm = new Date();
  }

  if (this.status === 'encaminhado' && !this.encaminhadoEm) {
    this.encaminhadoEm = new Date();
  }
});

processoDisciplinarSchema.pre('save', function (next) {
  try {
    sincronizarTenant(this);

    if (this.isNew && (!this.timeline || this.timeline.length === 0)) {
      this.timeline.push({
        tipo: 'processo_aberto',
        titulo: 'Procedimento disciplinar aberto',
        descricao: 'Procedimento instaurado no Axoriin para acompanhamento da ocorrência.',
        usuario: this.abertoPor || null,
        criadoEm: new Date(),
        metadados: {}
      });
    }

    next();
  } catch (err) {
    next(err);
  }
});

processoDisciplinarSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);
    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('ProcessoDisciplinar', processoDisciplinarSchema);