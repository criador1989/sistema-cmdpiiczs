const mongoose = require('mongoose');

const observacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true
  },
  texto: {
    type: String,
    required: true
  },
  autor: {
    type: String,
    default: 'Desconhecido'
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  instituicao: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('Observacao', observacaoSchema);
