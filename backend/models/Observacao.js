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
observacaoSchema.index({ instituicao: 1, aluno: 1, createdAt: 1 });

module.exports = mongoose.models.Observacao || mongoose.model('Observacao', observacaoSchema);
