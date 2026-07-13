const mongoose = require('mongoose');

const { Schema } = mongoose;

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
    throw new Error('Inconsistência entre instituicao e tenantId no APH atendimento.');
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
  const $setOnInsert = update.$setOnInsert || {};

  const instituicaoDireta = update.instituicao;
  const tenantDireto = update.tenantId;

  const instituicaoSet = $set.instituicao ?? $setOnInsert.instituicao ?? instituicaoDireta;
  const tenantSet = $set.tenantId ?? $setOnInsert.tenantId ?? tenantDireto;

  const instituicao = toObjectIdOrNull(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do APH atendimento.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

/* =========================
   HELPERS GERAIS
========================= */
function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(v => String(v || '').trim()).filter(Boolean))];
}

function normalizeSimNao(value, fallback = 'Não') {
  const v = String(value || '').trim();
  if (v === 'Sim' || v === 'Não') return v;
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return fallback;
}

function trimString(value) {
  return String(value || '').trim();
}

/* =========================
   SUBSCHEMAS
========================= */
const responsavelContatoSchema = new Schema({
  nome: { type: String, trim: true, default: '' },
  vinculo: { type: String, trim: true, default: '' },
  telefonePrincipal: { type: String, trim: true, default: '' },
  telefoneSecundario: { type: String, trim: true, default: '' },
}, { _id: false });

const comunicacaoPaisSchema = new Schema({
  houveComunicacao: { type: String, enum: ['Sim', 'Não'], default: 'Não', trim: true },

  dataContato: { type: Date, default: null },
  horaContato: { type: String, trim: true, default: '' },

  meiosUtilizados: { type: [String], default: [] },

  nomePessoaContatada: { type: String, trim: true, default: '' },
  vinculoComAluno: { type: String, trim: true, default: '' },

  houveExitoContato: { type: String, enum: ['Sim', 'Não'], default: 'Sim', trim: true },

  sinteseInformacaoPrestada: { type: String, trim: true, default: '' },
  orientacoesTransmitidas: { type: [String], default: [] },
  orientacaoOutro: { type: String, trim: true, default: '' },
}, { _id: false });

const assinaturaSchema = new Schema({
  servidorResponsavelNome: { type: String, trim: true, default: '' },
  servidorResponsavelFuncao: { type: String, trim: true, default: '' },

  vistoDirecaoCoordenacaoNome: { type: String, trim: true, default: '' },
  vistoDirecaoCoordenacaoFuncao: { type: String, trim: true, default: '' },
}, { _id: false });

/* =========================
   SCHEMA PRINCIPAL
========================= */
const AphAtendimentoSchema = new Schema(
  {
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },

    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      default: null,
      index: true,
    },

    alunoId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Aluno',
    },

    /* =========================================================
       1. IDENTIFICAÇÃO DO REGISTRO
       Portaria: número, data, horário início/fim, local
    ========================================================= */
    numeroRegistro: { type: String, trim: true, default: '', index: true },

    data: { type: Date, default: Date.now, index: true },

    hora: { type: String, trim: true, default: '' }, // legado/compatibilidade
    horaInicioAtendimento: { type: String, trim: true, default: '' },
    horaEncerramentoAtendimento: { type: String, trim: true, default: '' },

    local: { type: String, trim: true, default: '' },
    localOutro: { type: String, trim: true, default: '' },

    responsavel: { type: String, trim: true, default: '' }, // legado/compatibilidade
    servidorResponsavelRegistro: { type: String, trim: true, default: '' },
    funcaoServidorResponsavel: { type: String, trim: true, default: '' },

    /* =========================================================
       2. IDENTIFICAÇÃO DO ALUNO
       Snapshot para preservar o relatório mesmo se cadastro mudar
    ========================================================= */
    alunoNomeSnapshot: { type: String, trim: true, default: '' },
    alunoTurmaSnapshot: { type: String, trim: true, default: '' },
    alunoMatriculaSnapshot: { type: String, trim: true, default: '' },
    alunoNascimentoSnapshot: { type: Date, default: null },

    /* =========================================================
       3. IDENTIFICAÇÃO DO RESPONSÁVEL
    ========================================================= */
    responsavelContato: {
      type: responsavelContatoSchema,
      default: () => ({}),
    },

    /* =========================================================
       4. CLASSIFICAÇÃO DA OCORRÊNCIA/INTERCORRÊNCIA
       tipos = legado/compatibilidade
       classificacoes = padrão oficial da portaria
    ========================================================= */
    tipos: { type: [String], default: [] },
    classificacoes: { type: [String], default: [] },
    classificacaoOutro: { type: String, trim: true, default: '' },

    /* =========================================================
       5. DESCRIÇÃO OBJETIVA DOS FATOS
    ========================================================= */
    descricaoFatos: { type: String, trim: true, default: '' },

    /* =========================================================
       6. SINAIS OBSERVADOS / QUEIXA
    ========================================================= */
    sinaisESintomas: { type: String, trim: true, default: '' },
    queixaAluno: { type: String, trim: true, default: '' },

    /* =========================================================
       7. PROVIDÊNCIAS ADOTADAS
       materiais/procedimentos permanecem por compatibilidade
    ========================================================= */
    materiais: { type: [String], default: [] },
    procedimentos: { type: String, trim: true, default: '' },

    providenciasAdotadas: { type: [String], default: [] },
    providenciaOutro: { type: String, trim: true, default: '' },
    descricaoProvidencias: { type: String, trim: true, default: '' },

    /* =========================================================
       8. TEMPO DE OBSERVAÇÃO E EVOLUÇÃO
    ========================================================= */
    tempoObservacao: { type: String, trim: true, default: '' },

    evolucaoQuadro: {
      type: String,
      trim: true,
      default: '',
      enum: ['', 'Houve melhora', 'Não houve melhora satisfatória', 'Houve agravamento', 'Situação estabilizada', 'Outro'],
    },

    evolucaoOutro: { type: String, trim: true, default: '' },
    descricaoEvolucao: { type: String, trim: true, default: '' },

    /* =========================================================
       9. COMUNICAÇÃO AOS PAIS OU RESPONSÁVEIS
    ========================================================= */
    responsaveisInformados: {
      type: String,
      enum: ['Sim', 'Não'],
      default: 'Não',
      trim: true,
    },

    meioComunicacao: { type: String, trim: true, default: '' },

    comunicacaoPais: {
      type: comunicacaoPaisSchema,
      default: () => ({}),
    },

    /* =========================================================
       10. DESFECHO
    ========================================================= */
    houveEncaminhamento: { type: Boolean, default: false },
    encaminhamento: { type: String, trim: true, default: '' },

    desfecho: {
      type: String,
      trim: true,
      default: '',
      enum: [
        '',
        'Aluno retornou à sala de aula',
        'Aluno permaneceu em observação e foi liberado ao responsável',
        'Aluno foi entregue ao responsável na escola',
        'Aluno foi encaminhado ao pronto socorro',
        'Aluno foi entregue à equipe plantonista da unidade de saúde',
        'Outro',
      ],
    },

    desfechoOutro: { type: String, trim: true, default: '' },
    descricaoDesfecho: { type: String, trim: true, default: '' },

    /* =========================================================
       11. OBSERVAÇÕES / ASSINATURAS
    ========================================================= */
    observacoes: { type: String, trim: true, default: '' },
    observacao: { type: String, trim: true, default: '' }, // legado

    assinaturas: {
      type: assinaturaSchema,
      default: () => ({}),
    },

    /* =========================================================
       CONTROLE INTERNO / AUTOMAÇÕES
    ========================================================= */
    comunicadoEmailEnviado: { type: Boolean, default: false },
    comunicadoEmailEnviadoEm: { type: Date, default: null },
    comunicadoEmailDestinatarios: { type: [String], default: [] },
    comunicadoEmailErro: { type: String, trim: true, default: '' },

    statusRegistro: {
      type: String,
      trim: true,
      enum: ['rascunho', 'finalizado', 'revisao', 'cancelado'],
      default: 'finalizado',
      index: true,
    },

    criadoPor: { type: String, trim: true, default: '' },
    atualizadoPor: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

/* =========================
   ÍNDICES
========================= */
AphAtendimentoSchema.index({ instituicao: 1, alunoId: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, alunoId: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, numeroRegistro: 1 });
AphAtendimentoSchema.index({ tenantId: 1, numeroRegistro: 1 });

AphAtendimentoSchema.index({ instituicao: 1, local: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, local: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, responsaveisInformados: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, responsaveisInformados: 1, data: -1 });

AphAtendimentoSchema.index({ instituicao: 1, statusRegistro: 1, data: -1 });
AphAtendimentoSchema.index({ tenantId: 1, statusRegistro: 1, data: -1 });

/* =========================
   NORMALIZAÇÃO
========================= */
function normalizarDoc(doc) {
  sincronizarTenant(doc);

  doc.responsavel = trimString(doc.responsavel);
  doc.local = trimString(doc.local);
  doc.hora = trimString(doc.hora);

  doc.numeroRegistro = trimString(doc.numeroRegistro);

  doc.horaInicioAtendimento = trimString(doc.horaInicioAtendimento);
  doc.horaEncerramentoAtendimento = trimString(doc.horaEncerramentoAtendimento);

  // Compatibilidade: se só vier "hora", usa como início.
  if (!doc.horaInicioAtendimento && doc.hora) {
    doc.horaInicioAtendimento = doc.hora;
  }

  // Compatibilidade: se só vier início, mantém hora legado.
  if (!doc.hora && doc.horaInicioAtendimento) {
    doc.hora = doc.horaInicioAtendimento;
  }

  doc.localOutro = trimString(doc.localOutro);
  doc.servidorResponsavelRegistro = trimString(doc.servidorResponsavelRegistro);
  doc.funcaoServidorResponsavel = trimString(doc.funcaoServidorResponsavel);

  // Compatibilidade: responsável legado
  if (!doc.responsavel && doc.servidorResponsavelRegistro) {
    doc.responsavel = doc.servidorResponsavelRegistro;
  }

  if (!doc.servidorResponsavelRegistro && doc.responsavel) {
    doc.servidorResponsavelRegistro = doc.responsavel;
  }

  doc.alunoNomeSnapshot = trimString(doc.alunoNomeSnapshot);
  doc.alunoTurmaSnapshot = trimString(doc.alunoTurmaSnapshot);
  doc.alunoMatriculaSnapshot = trimString(doc.alunoMatriculaSnapshot);

  doc.tipos = normalizeStringArray(doc.tipos);
  doc.classificacoes = normalizeStringArray(doc.classificacoes);

  // Compatibilidade: se o front antigo mandar tipos, mantém também como classificações.
  if (!doc.classificacoes.length && doc.tipos.length) {
    doc.classificacoes = doc.tipos;
  }

  // Compatibilidade: se o front novo mandar classificações, mantém também em tipos para telas antigas.
  if (!doc.tipos.length && doc.classificacoes.length) {
    doc.tipos = doc.classificacoes;
  }

  doc.classificacaoOutro = trimString(doc.classificacaoOutro);

  doc.descricaoFatos = trimString(doc.descricaoFatos);
  doc.sinaisESintomas = trimString(doc.sinaisESintomas);
  doc.queixaAluno = trimString(doc.queixaAluno);

  doc.materiais = normalizeStringArray(doc.materiais);
  doc.procedimentos = trimString(doc.procedimentos);

  doc.providenciasAdotadas = normalizeStringArray(doc.providenciasAdotadas);
  doc.providenciaOutro = trimString(doc.providenciaOutro);
  doc.descricaoProvidencias = trimString(doc.descricaoProvidencias);

  doc.tempoObservacao = trimString(doc.tempoObservacao);
  doc.evolucaoOutro = trimString(doc.evolucaoOutro);
  doc.descricaoEvolucao = trimString(doc.descricaoEvolucao);

  doc.responsaveisInformados = normalizeSimNao(doc.responsaveisInformados);
  doc.meioComunicacao = trimString(doc.meioComunicacao);

  if (!doc.comunicacaoPais) doc.comunicacaoPais = {};
  doc.comunicacaoPais.houveComunicacao = normalizeSimNao(
    doc.comunicacaoPais.houveComunicacao || doc.responsaveisInformados
  );
  doc.comunicacaoPais.horaContato = trimString(doc.comunicacaoPais.horaContato);
  doc.comunicacaoPais.meiosUtilizados = normalizeStringArray(doc.comunicacaoPais.meiosUtilizados);
  doc.comunicacaoPais.nomePessoaContatada = trimString(doc.comunicacaoPais.nomePessoaContatada);
  doc.comunicacaoPais.vinculoComAluno = trimString(doc.comunicacaoPais.vinculoComAluno);
  doc.comunicacaoPais.houveExitoContato = normalizeSimNao(doc.comunicacaoPais.houveExitoContato, 'Sim');
  doc.comunicacaoPais.sinteseInformacaoPrestada = trimString(doc.comunicacaoPais.sinteseInformacaoPrestada);
  doc.comunicacaoPais.orientacoesTransmitidas = normalizeStringArray(doc.comunicacaoPais.orientacoesTransmitidas);
  doc.comunicacaoPais.orientacaoOutro = trimString(doc.comunicacaoPais.orientacaoOutro);

  // Compatibilidade: meioComunicacao legado
  if (!doc.meioComunicacao && doc.comunicacaoPais.meiosUtilizados.length) {
    doc.meioComunicacao = doc.comunicacaoPais.meiosUtilizados.join(', ');
  }

  doc.houveEncaminhamento = Boolean(doc.houveEncaminhamento);
  doc.encaminhamento = trimString(doc.encaminhamento);

  doc.desfechoOutro = trimString(doc.desfechoOutro);
  doc.descricaoDesfecho = trimString(doc.descricaoDesfecho);

  doc.observacoes = trimString(doc.observacoes);
  doc.observacao = trimString(doc.observacao);

  // Compatibilidade entre observacoes e observacao
  if (!doc.observacoes && doc.observacao) {
    doc.observacoes = doc.observacao;
  }

  if (!doc.observacao && doc.observacoes) {
    doc.observacao = doc.observacoes;
  }

  if (!doc.assinaturas) doc.assinaturas = {};

  doc.assinaturas.servidorResponsavelNome = trimString(doc.assinaturas.servidorResponsavelNome);
  doc.assinaturas.servidorResponsavelFuncao = trimString(doc.assinaturas.servidorResponsavelFuncao);
  doc.assinaturas.vistoDirecaoCoordenacaoNome = trimString(doc.assinaturas.vistoDirecaoCoordenacaoNome);
  doc.assinaturas.vistoDirecaoCoordenacaoFuncao = trimString(doc.assinaturas.vistoDirecaoCoordenacaoFuncao);

  doc.criadoPor = trimString(doc.criadoPor);
  doc.atualizadoPor = trimString(doc.atualizadoPor);
}

/* =========================
   MIDDLEWARES
========================= */
AphAtendimentoSchema.pre('validate', function (next) {
  try {
    normalizarDoc(this);
    next();
  } catch (err) {
    next(err);
  }
});

AphAtendimentoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const alvo = update.$set || update;

    // Normalização leve no update
    if (alvo) {
      if (alvo.tipos) alvo.tipos = normalizeStringArray(alvo.tipos);
      if (alvo.classificacoes) alvo.classificacoes = normalizeStringArray(alvo.classificacoes);
      if (alvo.materiais) alvo.materiais = normalizeStringArray(alvo.materiais);
      if (alvo.providenciasAdotadas) alvo.providenciasAdotadas = normalizeStringArray(alvo.providenciasAdotadas);

      if (alvo.responsaveisInformados !== undefined) {
        alvo.responsaveisInformados = normalizeSimNao(alvo.responsaveisInformados);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   EXPORT
========================= */
module.exports = mongoose.model('AphAtendimento', AphAtendimentoSchema);