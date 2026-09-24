'use strict';
const mongoose = require('mongoose');

const EventoFotoSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  mediaId: { type: String, required: true, index: true },
  storageProvider: { type: String, enum: ['gridfs','s3','static'], default: 'gridfs' },
  storageKey: { type: String, default: '' },
  storageUrl: { type: String, default: '' },
  origem: { type: String, enum: ['upload','historico'], default: 'upload', index: true },
  filename: { type: String, default: '' },
  mimeType: { type: String, default: 'image/jpeg' },
  bibNumbers: { type: [String], default: [] },
  participantIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  accountIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  categoria: { type: String, enum: ['percurso', 'chegada', 'podio', 'comunidade', 'geral'], default: 'geral' },
  visibilidade: { type: String, enum: ['privada', 'publica'], default: 'privada' },
  legenda: { type: String, default: '' },
  ativo: { type: Boolean, default: true },
}, { timestamps: true, collection: 'evento_fotos' });

module.exports = mongoose.models.EventoFoto || mongoose.model('EventoFoto', EventoFotoSchema);
