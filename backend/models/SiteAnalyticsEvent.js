const mongoose = require('mongoose');

const SiteAnalyticsEventSchema = new mongoose.Schema(
  {
    visitorKey: { type: String, index: true, required: true },
    sessionKey: { type: String, index: true, required: true },
    name: { type: String, index: true, required: true },
    label: { type: String, default: '' },
    path: { type: String, default: '/', index: true },
    title: { type: String, default: 'Axoriin' },
    deviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'], default: 'unknown', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

SiteAnalyticsEventSchema.index({ createdAt: -1 });
SiteAnalyticsEventSchema.index({ name: 1, createdAt: -1 });
SiteAnalyticsEventSchema.index({ path: 1, createdAt: -1 });

module.exports =
  mongoose.models.SiteAnalyticsEvent ||
  mongoose.model('SiteAnalyticsEvent', SiteAnalyticsEventSchema);
