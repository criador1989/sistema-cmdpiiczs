'use strict';
const mongoose = require('mongoose');

const EventoCounterSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { collection: 'evento_counters' });
EventoCounterSchema.index({ eventSlug: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.EventoCounter || mongoose.model('EventoCounter', EventoCounterSchema);
