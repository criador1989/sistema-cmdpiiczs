const mongoose = require('mongoose');
const { Schema } = mongoose;

const faixaSchema = new Schema({
  nome: { type: String, trim: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 0 },
  descricao: { type: String, trim: true, default: '' }
}, { _id: false });

const regulamentoTextoSchema = new Schema({
  cabecalho: { type: String, trim: true, default: '' },
  notificacao: { type: String, trim: true, default: '' },
  observacaoPadrao: { type: String, trim: true, default: '' }
}, { _id: false });

const incisoSchema = new Schema({
  codigo: { type: String, trim: true, default: '' },
  texto: { type: String, trim: true, default: '' },
  pontuacao: { type: Number, default: 0 },

  categoria: {
    type: String,
    enum: ['leve', 'medio', 'grave', 'gravissimo', 'elogio'],
    default: 'leve'
  },

  tipo: {
    type: String,
    enum: ['negativa', 'elogio'],
    default: 'negativa'
  }
}, { _id: true });

const artigoSchema = new Schema({
  numero: { type: String, trim: true, default: '' },
  titulo: { type: String, trim: true, default: '' },
  incisos: {
    type: [incisoSchema],
    default: []
  }
}, { _id: true });

const ocorrenciaSchema = new Schema({
  nome: { type: String, trim: true, required: true },
  tipo: {
    type: String,
    enum: ['positivo', 'negativo'],
    required: true
  },
  valor: { type: Number, required: true, default: 0 },
  categoria: { type: String, trim: true, default: '' }
}, { _id: true });

const configuracaoDisciplinarSchema = new Schema({
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    unique: true,
    index: true
  },

  preset: {
    type: String,
    enum: ['militar', 'particular', 'personalizado'],
    default: 'militar',
    index: true
  },

  tipoRegulamento: {
    type: String,
    enum: ['militar', 'adaptavel'],
    default: 'militar'
  },

  comportamento: {
    notaInicial: { type: Number, default: 8.0 },

    faixas: {
      type: [faixaSchema],
      default: [
        { nome: 'Excepcional', min: 9.01, max: 10, descricao: '' },
        { nome: 'Ótimo', min: 8.01, max: 9.0, descricao: '' },
        { nome: 'Bom', min: 7.0, max: 8.0, descricao: '' },
        { nome: 'Regular', min: 5.0, max: 6.99, descricao: '' },
        { nome: 'Insuficiente', min: 3.0, max: 4.99, descricao: '' },
        { nome: 'Incompatível', min: 0, max: 2.99, descricao: '' }
      ]
    }
  },

  medidas: {
    advertenciaEscrita: { type: Number, default: -0.30 },
    repreensao: { type: Number, default: -0.50 },
    aecdePorDia: { type: Number, default: -0.70 },
    aiaPorDia: { type: Number, default: -1.20 }
  },

  recompensas: {
    elogioVerbal: { type: Number, default: 0.15 },
    elogioIndividual: { type: Number, default: 0.60 },
    elogioColetivo: { type: Number, default: 0.20 },
    mediaAlta: { type: Number, default: 0.40 }
  },

  ocorrencias: {
    type: [ocorrenciaSchema],
    default: []
  },

  tsmd: {
    ativo: { type: Boolean, default: true },
    diasParaIniciar: { type: Number, default: 60 },
    incrementoPorDia: { type: Number, default: 0.01 },
    limiteMaximo: { type: Number, default: 10 },
    limiteMinimo: { type: Number, default: 0 }
  },

  regulamento: {
    nome: {
      type: String,
      trim: true,
      default: 'Regulamento Disciplinar'
    },

    versao: {
      type: String,
      trim: true,
      default: '1.0'
    },

    textoInstitucional: {
      type: String,
      trim: true,
      default: ''
    },

    textoCurto: {
      type: String,
      trim: true,
      default: ''
    },

    cidade: {
      type: String,
      trim: true,
      default: ''
    },

    estado: {
      type: String,
      trim: true,
      default: ''
    },

    textos: {
      type: regulamentoTextoSchema,
      default: () => ({})
    },

    artigos: {
      type: [artigoSchema],
      default: []
    }
  }

}, { timestamps: true });

module.exports =
  mongoose.models.ConfiguracaoDisciplinar ||
  mongoose.model('ConfiguracaoDisciplinar', configuracaoDisciplinarSchema);