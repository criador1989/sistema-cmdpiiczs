const mongoose = require('mongoose');

const MonitorPresencaSchema = new mongoose.Schema({
  monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  data: { type: Date, required: true, index: true },
  status: { type: String, enum: ['P','A','FJ'], required: true }, // Presente, Ausente, Falta Justificada
  motivo: { type: String, default: '' },
  observacao: { type: String, default: '' },

  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

MonitorPresencaSchema.index({ monitor: 1, data: 1 }, { unique: true });

module.exports = mongoose.model('MonitorPresenca', MonitorPresencaSchema);
