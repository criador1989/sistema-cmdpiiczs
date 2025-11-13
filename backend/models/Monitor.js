const mongoose = require('mongoose');

const MonitorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  matricula: { type: String, default: '', trim: true },
  telefone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  turno: { type: String, enum: ['manhã','tarde','noite','integral'], default: 'tarde' },
  ativo: { type: Boolean, default: true },
  dataAdmissao: { type: Date, default: Date.now },
  dataDesligamento: { type: Date, default: null },
  score: { type: Number, default: 0 }, // acumulado a partir das notas/observações
  observacaoGeral: { type: String, default: '' },

  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },

  publicView: {
    token: { type: String, index: true, sparse: true },
  }
}, { timestamps: true });

module.exports = mongoose.model('Monitor', MonitorSchema);
