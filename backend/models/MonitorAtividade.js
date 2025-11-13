const mongoose = require('mongoose');

const MonitorAtividadeSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descricao: { type: String, default: '' },
  tipo: { type: String, enum: ['revista','patrulha','evento','treinamento','outro'], default: 'revista' },

  inicio: { type: Date, required: true },
  fim: { type: Date, required: true },

  participantes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Monitor' }],

  resultados: { type: String, default: '' }, // ex.: “revista diária realizada em X salas; itens retidos: ...”
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true });

MonitorAtividadeSchema.index({ inicio: 1, fim: 1 });

module.exports = mongoose.model('MonitorAtividade', MonitorAtividadeSchema);
