// models/Observacao.js
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
  criadoEm: {
    type: Date,
    default: Date.now
  },
  autor: {
    type: String,
    default: 'Desconhecido'
  },
  instituicao: {
    type: String,
    required: true
  }
});

// ✅ Evita erro ao recarregar modelo
module.exports = mongoose.models.Observacao || mongoose.model('Observacao', observacaoSchema);
