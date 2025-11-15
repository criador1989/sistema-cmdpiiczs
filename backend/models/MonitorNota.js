const mongoose = require('mongoose');

const MonitorNotaSchema = new mongoose.Schema({
  monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  data: { type: Date, default: Date.now },
  tipo: { type: String, enum: ['elogio','advertencia','observacao'], default: 'observacao' },
  texto: { type: String, required: true },
  pontos: { type: Number, default: 0 }, // pode ser + ou -, altera o score

  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

module.exports = mongoose.model('MonitorNota', MonitorNotaSchema);
