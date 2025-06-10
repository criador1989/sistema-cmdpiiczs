const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true
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
    required: true
  },
  notaAnterior: {
    type: Number
  },
  notaAtual: {
    type: Number
  },
  artigo: {
    type: String // Ex: "Art. 14"
  },
  paragrafo: {
    type: String // Ex: "§ 1º"
  },
  inciso: {
    type: String // Ex: "Inciso II"
  },
  classificacaoRegulamento: {
    type: String // Ex: "Grave"
  },
  instituicao: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notificacao', notificacaoSchema);
