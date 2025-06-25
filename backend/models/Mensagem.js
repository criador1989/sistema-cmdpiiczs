// models/Mensagem.js
const mongoose = require('mongoose');

const mensagemSchema = new mongoose.Schema({
  remetente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  destinatario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  conteudo: {
    type: String,
    required: true
  },
  lida: {
    type: Boolean,
    default: false
  },
  data: {
    type: Date,
    default: Date.now
  },
  instituicao: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('Mensagem', mensagemSchema);
