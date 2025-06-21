// models/Log.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  acao: {
    type: String,
    required: true
  },
  entidade: {
    type: String,
    required: true
  },
  entidadeId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  data: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Log', logSchema);
