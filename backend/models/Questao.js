const mongoose = require('mongoose');

const AlternativaSchema = new mongoose.Schema(
  {
    letra: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ['A', 'B', 'C', 'D', 'E']
    },
    texto: {
      type: String,
      required: true,
      trim: true
    }
  },
  { _id: false }
);

const MetadadosIASchema = new mongoose.Schema(
  {
    modelo: { type: String, default: '', trim: true },
    promptVersao: { type: String, default: '', trim: true },
    revisadaHumano: { type: Boolean, default: false },
    observacoes: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const QuestaoSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },

    escopo: {
      type: String,
      enum: ['global', 'instituicao'],
      default: 'global',
      index: true
    },

    area: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    disciplina: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    competencia: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    habilidade: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    tema: {
      type: String,
      default: '',
      trim: true,
      index: true
    },

    subtema: {
      type: String,
      default: '',
      trim: true
    },

    dificuldade: {
      type: String,
      enum: ['facil', 'medio', 'dificil'],
      default: 'medio',
      index: true
    },

    estilo: {
      type: String,
      enum: ['enem', 'enem_adaptado', 'autor', 'ia'],
      default: 'enem',
      index: true
    },

    origem: {
      type: String,
      enum: ['enem', 'ia', 'autor'],
      default: 'enem',
      index: true
    },

    anoReferencia: {
      type: Number,
      default: null,
      min: 1998
    },

    codigoOrigem: {
      type: String,
      default: '',
      trim: true
    },

    enunciado: {
      type: String,
      required: true,
      trim: true
    },

    apoioTexto: {
      type: String,
      default: '',
      trim: true
    },

    imagemUrl: {
      type: String,
      default: '',
      trim: true
    },

    alternativas: {
      type: [AlternativaSchema],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length >= 2 && arr.length <= 5;
        },
        message: 'A questão deve ter entre 2 e 5 alternativas.'
      },
      required: true
    },

    gabarito: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ['A', 'B', 'C', 'D', 'E']
    },

    explicacao: {
      type: String,
      default: '',
      trim: true
    },

    comentarioPedagogico: {
      type: String,
      default: '',
      trim: true
    },

    tags: {
      type: [String],
      default: [],
      index: true
    },

    ativa: {
      type: Boolean,
      default: true,
      index: true
    },

    publicada: {
      type: Boolean,
      default: true,
      index: true
    },

    usoContador: {
      type: Number,
      default: 0,
      min: 0
    },

    acertosContador: {
      type: Number,
      default: 0,
      min: 0
    },

    errosContador: {
      type: Number,
      default: 0,
      min: 0
    },

    metadadosIA: {
      type: MetadadosIASchema,
      default: () => ({})
    },

    criadoPor: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'questoes'
  }
);

QuestaoSchema.index({ escopo: 1, instituicao: 1, ativa: 1, publicada: 1 });
QuestaoSchema.index({ area: 1, disciplina: 1, dificuldade: 1 });
QuestaoSchema.index({ competencia: 1, habilidade: 1 });
QuestaoSchema.index({ tema: 1, subtema: 1 });
QuestaoSchema.index({ origem: 1, estilo: 1 });
QuestaoSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Questao || mongoose.model('Questao', QuestaoSchema);