const mongoose = require('mongoose');

const SiteAnalyticsSessionSchema = new mongoose.Schema(
  {
    visitorKey: { type: String, index: true, required: true },
    sessionKey: { type: String, index: true, unique: true, required: true },
    ipHash: { type: String, index: true },
    userAgentHash: { type: String },
    deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'], default: 'unknown', index: true },
    browser: { type: String, default: 'Desconhecido' },
    os: { type: String, default: 'Desconhecido' },
    firstPath: { type: String, default: '/' },
    currentPath: { type: String, default: '/' },
    title: { type: String, default: 'Axoriin' },
    referrer: { type: String, default: '' },
    language: { type: String, default: '' },
    timezone: { type: String, default: '' },
    screen: {
      width: Number,
      height: Number
    },
    pageviews: { type: Number, default: 0 },
    lastSeenAt: { type: Date, index: true, default: Date.now }
  },
  { timestamps: true }
);

SiteAnalyticsSessionSchema.index({ createdAt: -1 });
SiteAnalyticsSessionSchema.index({ lastSeenAt: -1, currentPath: 1 });

module.exports =
  mongoose.models.SiteAnalyticsSession ||
  mongoose.model('SiteAnalyticsSession', SiteAnalyticsSessionSchema);
