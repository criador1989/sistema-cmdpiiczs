const express = require('express');
const crypto = require('crypto');
const SiteAnalyticsSession = require('../../models/SiteAnalyticsSession');
const SiteAnalyticsEvent = require('../../models/SiteAnalyticsEvent');

const router = express.Router();

router.use(express.json({ limit: '32kb', type: ['application/json', 'text/plain'] }));

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ACRE_OFFSET_HOURS = -5;

function analyticsSalt() {
  return process.env.SITE_ANALYTICS_SALT || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'axoriin-site-analytics';
}

function hashValue(value) {
  return crypto.createHash('sha256').update(`${analyticsSalt()}:${String(value || '')}`).digest('hex');
}

function safeString(value, max = 250) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function safePath(value) {
  let path = safeString(value || '/', 320);
  if (!path.startsWith('/')) path = '/' + path;
  return path;
}

function safeReferrer(value) {
  const raw = safeString(value, 500);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`.slice(0, 320);
  } catch (err) {
    return raw.slice(0, 320);
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function detectDevice(userAgent) {
  const ua = String(userAgent || '');
  if (/bot|crawler|spider|crawling/i.test(ua)) return 'bot';
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(ua)) return 'mobile';
  if (ua) return 'desktop';
  return 'unknown';
}

function detectBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/OPR\//.test(ua)) return 'Opera';
  return 'Desconhecido';
}

function detectOs(userAgent) {
  const ua = String(userAgent || '');
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Desconhecido';
}

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function buildKeys(req, body) {
  const ua = req.headers['user-agent'] || '';
  const ip = getClientIp(req);
  const rawVisitor = body.visitorId || `${ip}:${ua}`;
  const rawSession = body.sessionId || `${rawVisitor}:${body.path || '/'}:${new Date().toISOString().slice(0, 13)}`;

  return {
    visitorKey: hashValue(rawVisitor),
    sessionKey: hashValue(rawSession),
    ipHash: hashValue(ip),
    userAgentHash: hashValue(ua),
    userAgent: ua
  };
}

function buildSessionPayload(req, body) {
  const keys = buildKeys(req, body);
  const ua = keys.userAgent;

  return {
    ...keys,
    deviceType: detectDevice(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
    path: safePath(body.path),
    title: safeString(body.title || 'Axoriin', 160),
    referrer: safeReferrer(body.referrer),
    language: safeString(body.language, 40),
    timezone: safeString(body.timezone, 80),
    screen: {
      width: Number(body.screen?.width) || undefined,
      height: Number(body.screen?.height) || undefined
    }
  };
}

function isAuthorized(req) {
  const key = process.env.SITE_ANALYTICS_KEY;

  if (!key && process.env.NODE_ENV !== 'production') return true;
  if (!key) return false;

  const provided = req.headers['x-site-analytics-key'] || req.query.key || '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(key));

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAnalyticsAccess(req, res, next) {
  if (!isAuthorized(req)) {
    return res.status(401).json({
      ok: false,
      message: 'Acesso não autorizado ao painel de analytics.'
    });
  }

  next();
}

function getAcreTodayRange() {
  const now = new Date();
  const local = new Date(now.getTime() + ACRE_OFFSET_HOURS * 60 * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d) - ACRE_OFFSET_HOURS * 60 * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

async function registerPageView(payload) {
  await SiteAnalyticsEvent.create({
    visitorKey: payload.visitorKey,
    sessionKey: payload.sessionKey,
    name: 'page_view',
    label: payload.title,
    path: payload.path,
    title: payload.title,
    deviceType: payload.deviceType,
    metadata: {
      browser: payload.browser,
      os: payload.os,
      referrer: payload.referrer,
      language: payload.language,
      timezone: payload.timezone,
      screen: payload.screen
    }
  });
}

router.post('/visit', async (req, res) => {
  try {
    const body = getBody(req);
    const payload = buildSessionPayload(req, body);
    const now = new Date();

    await SiteAnalyticsSession.findOneAndUpdate(
      { sessionKey: payload.sessionKey },
      {
        $setOnInsert: {
          visitorKey: payload.visitorKey,
          sessionKey: payload.sessionKey,
          ipHash: payload.ipHash,
          userAgentHash: payload.userAgentHash,
          deviceType: payload.deviceType,
          browser: payload.browser,
          os: payload.os,
          firstPath: payload.path,
          referrer: payload.referrer,
          language: payload.language,
          timezone: payload.timezone,
          screen: payload.screen
        },
        $set: {
          currentPath: payload.path,
          title: payload.title,
          lastSeenAt: now
        },
        $inc: { pageviews: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await registerPageView(payload);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[site-analytics] visit error:', err);
    return res.status(500).json({ ok: false });
  }
});

router.post('/heartbeat', async (req, res) => {
  try {
    const body = getBody(req);
    const payload = buildSessionPayload(req, body);

    await SiteAnalyticsSession.findOneAndUpdate(
      { sessionKey: payload.sessionKey },
      {
        $setOnInsert: {
          visitorKey: payload.visitorKey,
          sessionKey: payload.sessionKey,
          ipHash: payload.ipHash,
          userAgentHash: payload.userAgentHash,
          deviceType: payload.deviceType,
          browser: payload.browser,
          os: payload.os,
          firstPath: payload.path,
          referrer: payload.referrer,
          language: payload.language,
          timezone: payload.timezone,
          screen: payload.screen
        },
        $set: {
          currentPath: payload.path,
          title: payload.title,
          lastSeenAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[site-analytics] heartbeat error:', err);
    return res.status(500).json({ ok: false });
  }
});

router.post('/event', async (req, res) => {
  try {
    const body = getBody(req);
    const payload = buildSessionPayload(req, body);
    const eventName = safeString(body.eventName, 80).replace(/[^a-z0-9_:-]/gi, '_').toLowerCase();

    if (!eventName) return res.status(400).json({ ok: false, message: 'Evento inválido.' });

    await SiteAnalyticsEvent.create({
      visitorKey: payload.visitorKey,
      sessionKey: payload.sessionKey,
      name: eventName,
      label: safeString(body.eventLabel, 160),
      path: payload.path,
      title: payload.title,
      deviceType: payload.deviceType,
      metadata: {
        browser: payload.browser,
        os: payload.os
      }
    });

    await SiteAnalyticsSession.updateOne(
      { sessionKey: payload.sessionKey },
      { $set: { currentPath: payload.path, title: payload.title, lastSeenAt: new Date() } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[site-analytics] event error:', err);
    return res.status(500).json({ ok: false });
  }
});

async function eventStats(match) {
  const [count, visitors, sessions] = await Promise.all([
    SiteAnalyticsEvent.countDocuments(match),
    SiteAnalyticsEvent.distinct('visitorKey', match),
    SiteAnalyticsEvent.distinct('sessionKey', match)
  ]);

  return {
    pageViews: count,
    visitors: visitors.length,
    sessions: sessions.length
  };
}

async function eventCount(nameOrRegex, since) {
  const nameMatch = nameOrRegex instanceof RegExp ? { $regex: nameOrRegex } : nameOrRegex;
  return SiteAnalyticsEvent.countDocuments({
    name: nameMatch,
    createdAt: { $gte: since }
  });
}

router.get('/summary', requireAnalyticsAccess, async (req, res) => {
  try {
    const now = new Date();
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
    const { startUtc: todayStart, endUtc: todayEnd } = getAcreTodayRange();
    const last7Start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const pageView = { name: 'page_view' };

    const [
      onlineNow,
      today,
      last7d,
      last30d,
      allTime,
      topPages,
      deviceBreakdown,
      recentEvents,
      clicksWhatsapp,
      clicksDemo,
      clicksLogin,
      clicksPortalAluno
    ] = await Promise.all([
      SiteAnalyticsSession.countDocuments({ lastSeenAt: { $gte: onlineSince } }),
      eventStats({ ...pageView, createdAt: { $gte: todayStart, $lt: todayEnd } }),
      eventStats({ ...pageView, createdAt: { $gte: last7Start } }),
      eventStats({ ...pageView, createdAt: { $gte: last30Start } }),
      eventStats(pageView),
      SiteAnalyticsEvent.aggregate([
        { $match: { name: 'page_view', createdAt: { $gte: last30Start } } },
        { $group: { _id: '$path', views: { $sum: 1 }, visitors: { $addToSet: '$visitorKey' } } },
        { $project: { path: '$_id', views: 1, visitors: { $size: '$visitors' }, _id: 0 } },
        { $sort: { views: -1 } },
        { $limit: 8 }
      ]),
      SiteAnalyticsEvent.aggregate([
        { $match: { name: 'page_view', createdAt: { $gte: last30Start } } },
        { $group: { _id: '$deviceType', views: { $sum: 1 }, visitors: { $addToSet: '$visitorKey' } } },
        { $project: { deviceType: '$_id', views: 1, visitors: { $size: '$visitors' }, _id: 0 } },
        { $sort: { views: -1 } }
      ]),
      SiteAnalyticsEvent.aggregate([
        { $match: { name: { $ne: 'page_view' }, createdAt: { $gte: last30Start } } },
        { $group: { _id: { name: '$name', label: '$label' }, count: { $sum: 1 } } },
        { $project: { name: '$_id.name', label: '$_id.label', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 12 }
      ]),
      eventCount(/^click_whatsapp_/, last30Start),
      eventCount('click_interesse_comercial', last30Start),
      eventCount('click_acessar_sistema', last30Start),
      eventCount('click_portal_aluno', last30Start)
    ]);

    return res.json({
      ok: true,
      generatedAt: now,
      timezoneReference: 'America/Rio_Branco',
      onlineWindowSeconds: ONLINE_WINDOW_MS / 1000,
      onlineNow,
      today,
      last7d,
      last30d,
      allTime,
      commercial: {
        clicksWhatsapp,
        clicksDemo,
        clicksLogin,
        clicksPortalAluno
      },
      topPages,
      deviceBreakdown,
      recentEvents
    });
  } catch (err) {
    console.error('[site-analytics] summary error:', err);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
