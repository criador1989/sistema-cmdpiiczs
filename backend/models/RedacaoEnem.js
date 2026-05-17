const mongoose = require('mongoose');

const CompetenciasSchema = new mongoose.Schema(
  {
    c1: { type: Number, default: 0, min: 0, max: 200 },
    c2: { type: Number, default: 0, min: 0, max: 200 },
    c3: { type: Number, default: 0, min: 0, max: 200 },
    c4: { type: Number, default: 0, min: 0, max: 200 },
    c5: { type: Number, default: 0, min: 0, max: 200 }
  },
  { _id: false }
);

const CorrecaoIASchema = new mongoose.Schema(
  {
    notaTotal: { type: Number, default: 0, min: 0, max: 1000 },
    competencias: {
      type: CompetenciasSchema,
      default: () => ({})
    },
    resumoAvaliacao: { type: String, default: '' },
    pontosFortes: [{ type: String, default: [] }],
    pontosMelhorar: [{ type: String, default: [] }],
    recomendacoes: [{ type: String, default: [] }],
    propostaIntervencao: { type: String, default: '' },
    observacoesTecnicas: { type: String, default: '' },
    modelo: { type: String, default: '' },
    focoPrincipal: { type: String, default: '' },
    planoEstudoSugerido: [{ type: String, default: [] }],
    corrigidoEm: { type: Date, default: null }
  },
  { _id: false }
);

const ApoioProfessorSchema = new mongoose.Schema(
  {
    solicitado: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['nao_solicitado', 'solicitado', 'respondido'],
      default: 'nao_solicitado'
    },
    focoTema: { type: String, default: '', trim: true },
    observacaoProfessor: { type: String, default: '', trim: true },
    professorId: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    professorNome: { type: String, default: '', trim: true },
    respondidoEm: { type: Date, default: null }
  },
  { _id: false }
);

const RedacaoEnemSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    aluno: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    usuarioAluno: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },
    turma: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },
    temaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RedacaoTema',
      required: true,
      index: true
    },
    temaTituloSnapshot: {
      type: String,
      required: true,
      trim: true
    },
    propostaSnapshot: {
      type: String,
      required: true,
      trim: true
    },
    texto: {
      type: String,
      required: true,
      trim: true
    },
    textoNormalizado: {
      type: String,
      default: '',
      trim: true
    },
    quantidadePalavras: {
      type: Number,
      default: 0,
      min: 0
    },
    tempoGastoSegundos: {
      type: Number,
      default: 0,
      min: 0
    },
    cronometroUtilizado: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: [
        'rascunho',
        'enviada',
        'corrigindo_ia',
        'corrigida',
        'erro_correcao',
        'apoio_professor_solicitado',
        'apoio_professor_respondido'
      ],
      default: 'enviada',
      index: true
    },
    tentativa: {
      type: Number,
      default: 1,
      min: 1
    },
    mesReferencia: {
      type: String,
      default: '',
      index: true
    },
    correcaoIA: {
      type: CorrecaoIASchema,
      default: null
    },
    apoioProfessor: {
      type: ApoioProfessorSchema,
      default: () => ({})
    },
    erroCorrecao: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'redacoes_enem'
  }
);

RedacaoEnemSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
RedacaoEnemSchema.index({ instituicao: 1, temaId: 1, aluno: 1, tentativa: -1 });
RedacaoEnemSchema.index({ instituicao: 1, aluno: 1, mesReferencia: 1, createdAt: -1 });
RedacaoEnemSchema.index({ instituicao: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RedacaoEnem', RedacaoEnemSchema);