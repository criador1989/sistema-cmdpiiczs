'use strict';
const mongoose = require('mongoose');

const EventoAnalyticsEventSchema = new mongoose.Schema({
  eventSlug: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['pageview','click','heartbeat'], required: true, index: true },
  pagina: { type: String, default: '', index: true },
  alvo: { type: String, default: '', index: true },
  device: { type: String, enum: ['desktop','mobile','tablet','outro'], default: 'outro' },
  referrer: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false, collection: 'evento_analytics_events' });

EventoAnalyticsEventSchema.index({ eventSlug: 1, createdAt: -1 });
EventoAnalyticsEventSchema.index({ eventSlug: 1, tipo: 1, createdAt: -1 });
// Mantém dados brutos por 180 dias. Os relatórios do CMS usam esse histórico.
EventoAnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.models.EventoAnalyticsEvent || mongoose.model('EventoAnalyticsEvent', EventoAnalyticsEventSchema);
