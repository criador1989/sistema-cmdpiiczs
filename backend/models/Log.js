// backend/models/Log.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  instituicao: { type: String, required: true, index: true },

  // Quem fez a ação
  usuario:       { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  usuarioNome:   { type: String },  // denormalizado (pra listar rápido)
  usuarioTipo:   { type: String },  // 'admin', 'professor', ...
  usuarioEmail:  { type: String },  // opcional, útil no filtro

  // O que aconteceu
  acao:       { type: String, required: true, index: true }, // 'NOTIFICACAO_CRIADA', ...
  entidade:   { type: String, required: true },              // 'Notificacao'
  entidadeId: { type: String, required: true, index: true },
  entidadeNome: { type: String },                            // ex.: nome do aluno (quando fizer sentido)

  // Extras pra filtro rápido
  aluno:     { type: mongoose.Schema.Types.ObjectId, ref: 'Aluno', index: true },
  alunoNome: { type: String },

  // Payload livre (antes/depois, etc.)
  detalhes: { type: Object, default: {} },

  // (opcional) rastros
  ip:        { type: String },
  userAgent: { type: String },

}, { timestamps: true });

logSchema.index({ instituicao: 1, createdAt: -1 });

module.exports = mongoose.model('Log', logSchema);
