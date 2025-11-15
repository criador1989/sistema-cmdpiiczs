// backend/models/Counter.js
'use strict';

const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  // chave no formato: notificacao:<instituicao>:<ano>
  chave: { type: String, unique: true, index: true, required: true },
  seq: { type: Number, default: 0 },
  atualizadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Counter', CounterSchema, 'counters');
