const mongoose = require('mongoose');

const TextoMotivadorSchema = new mongoose.Schema(
  {
    titulo: { type: String, trim: true, default: '' },
    conteudo: { type: String, trim: true, default: '' },
    fonte: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const RedacaoTemaSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    titulo: {
      type: String,
      required: true,
      trim: true
    },
    proposta: {
      type: String,
      required: true,
      trim: true
    },
    eixoTematico: {
      type: String,
      trim: true,
      default: 'Redação ENEM'
    },
    palavrasChave: [{ type: String, trim: true }],
    textosMotivadores: {
      type: [TextoMotivadorSchema],
      default: []
    },
    tempoSugeridoMinutos: {
      type: Number,
      default: 60,
      min: 0
    },
    minimoPalavras: {
      type: Number,
      default: 7,
      min: 0
    },
    maximoPalavras: {
      type: Number,
      default: 30,
      min: 0
    },
    status: {
      type: String,
      enum: ['ativo', 'inativo', 'arquivado'],
      default: 'ativo',
      index: true
    },
    dataInicio: {
      type: Date,
      default: null
    },
    dataFim: {
      type: Date,
      default: null
    },
    criadoPor: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'redacao_temas'
  }
);

RedacaoTemaSchema.index({ instituicao: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RedacaoTema', RedacaoTemaSchema);