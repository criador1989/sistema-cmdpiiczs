'use strict';
const mongoose = require('mongoose');

const EventoResultadoSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  inscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventoInscricao', required: true, unique: true, index: true },
  participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventoParticipante', required: true, index: true },
  numeroPeito: { type: String, required: true, index: true },
  tempoMs: { type: Number, default: null },
  tempoTexto: { type: String, default: '' },
  distanciaKm: { type: Number, default: null },
  colocacaoGeral: { type: Number, default: null },
  colocacaoCategoria: { type: Number, default: null },
  status: { type: String, enum: ['pendente', 'concluido', 'dnf', 'dns', 'desclassificado'], default: 'concluido' },
  medalha: { type: String, enum: ['ouro', 'prata', 'bronze', 'participacao', 'nenhuma'], default: 'participacao' },
  publicado: { type: Boolean, default: true },
}, { timestamps: true, collection: 'evento_resultados' });

module.exports = mongoose.models.EventoResultado || mongoose.model('EventoResultado', EventoResultadoSchema);
