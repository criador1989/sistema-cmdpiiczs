const mongoose = require('mongoose');

const ComunicacaoPaisSchema = new mongoose.Schema({
  instituicao: { type: String, required: true },
  aluno: { type: mongoose.Schema.Types.ObjectId, ref: 'Aluno', required: true },
  notificacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Notificacao', required: true, unique: true },

  nomeAluno: { type: String, required: true },
  turma: { type: String, required: true },
  dataNotificacao: { type: Date, required: true },
  tipoMedida: { type: String, enum: ['A.I.A', 'A.E.C.D.E'], required: true },

  observacao: { type: String, default: '' },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date, required: true },
  horaApresentacao: { type: String, required: true }, // HH:MM
  horaSaida: { type: String, required: true },        // HH:MM

  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
}, { timestamps: true });

module.exports = mongoose.model('ComunicacaoPais', ComunicacaoPaisSchema);
