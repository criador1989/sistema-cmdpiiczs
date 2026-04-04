'use strict';

const nodemailer = require('nodemailer');

/* =========================
   FETCH SAFE (Node < 18)
   ========================= */
let _fetch = global.fetch;
if (!_fetch) {
  try {
    // eslint-disable-next-line global-require
    _fetch = require('node-fetch');
  } catch {
    _fetch = null;
  }
}

/* =========================
   ENV / CONFIG
   Aceita tanto MAIL_* quanto SMTP_*
   ========================= */
const MAIL_ENABLED = String(
  process.env.MAIL_ENABLED ||
  'true'
).toLowerCase() === 'true';

const MAIL_HOST = (
  process.env.MAIL_HOST ||
  process.env.SMTP_HOST ||
  'smtp.gmail.com'
).trim();

const MAIL_PORT = Number(
  process.env.MAIL_PORT ||
  process.env.SMTP_PORT ||
  587
);

const MAIL_SECURE = String(
  process.env.MAIL_SECURE ||
  (MAIL_PORT === 465 ? 'true' : 'false')
).toLowerCase() === 'true';

const MAIL_USER = (
  process.env.MAIL_USER ||
  process.env.SMTP_USER ||
  process.env.EMAIL_ORIGEM ||
  ''
).trim();

const MAIL_PASS = (
  process.env.MAIL_PASS ||
  process.env.SMTP_PASS ||
  process.env.EMAIL_SENHA_APP ||
  ''
).trim();

const MAIL_FROM_RAW = (
  process.env.MAIL_FROM ||
  process.env.EMAIL_FROM ||
  ''
).trim();

const MAIL_FROM_NAME = (
  process.env.MAIL_FROM_NAME ||
  'Axoriin'
).trim();

const MAIL_FROM_ADDR = (
  process.env.MAIL_FROM_ADDR ||
  process.env.SMTP_USER ||
  process.env.MAIL_USER ||
  process.env.EMAIL_ORIGEM ||
  ''
).trim();

const MAIL_REPLY_TO = (
  process.env.MAIL_REPLY_TO ||
  MAIL_FROM_ADDR ||
  MAIL_USER ||
  ''
).trim();

const MAIL_POOL = String(
  process.env.MAIL_POOL || 'true'
).toLowerCase() === 'true';

const MAIL_DEBUG = String(
  process.env.MAIL_DEBUG || 'true'
).toLowerCase() === 'true';

const MAIL_CONNECTION_TIMEOUT_MS = Number(
  process.env.MAIL_CONNECTION_TIMEOUT_MS || 15000
);

const MAIL_SOCKET_TIMEOUT_MS = Number(
  process.env.MAIL_SOCKET_TIMEOUT_MS || 25000
);

// Provedores HTTP opcionais
const SENDGRID_API_KEY = (process.env.SENDGRID_API_KEY || '').trim();
const SENDGRID_FROM = (process.env.SENDGRID_FROM || MAIL_FROM_ADDR || '').trim();

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'onboarding@resend.dev').trim();

const NODE_ENV = process.env.NODE_ENV || '';

/* =========================
   ESTADO
   ========================= */
let transporter = null;
let lastError = null;
let lastProvider = null;

/* =========================
   HELPERS
   ========================= */
function extractEmail(s) {
  if (!s) return '';
  const str = String(s).trim();
  const m = str.match(/<([^>]+)>/);
  if (m && m[1]) return m[1].trim();
  if (str.startsWith('mailto:')) return str.slice(7).trim();
  return str;
}

function parseFrom(raw) {
  if (!raw) return null;

  const str = String(raw).trim();

  const m = str.match(/^\s*"?([^"]+?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    return { name: m[1].trim(), address: m[2].trim() };
  }

  if (/^[^@]+@[^@]+\.[^@]+$/.test(str)) {
    return {
      name: MAIL_FROM_NAME || 'Axoriin',
      address: str
    };
  }

  return null;
}

function buildFrom() {
  const parsed = parseFrom(MAIL_FROM_RAW);
  if (parsed) return parsed;

  const address =
    MAIL_FROM_ADDR ||
    MAIL_USER ||
    SENDGRID_FROM ||
    RESEND_FROM;

  return {
    name: MAIL_FROM_NAME || 'Axoriin',
    address
  };
}

function normalizeToList(to) {
  const arr = Array.isArray(to) ? to : String(to || '').split(',');
  return arr
    .map(extractEmail)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripHtmlToText(html = '') {
  try {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  } catch {
    return '';
  }
}

function ensurePlainText(text, html) {
  const t = String(text || '').trim();
  if (t) return t;
  const fromHtml = stripHtmlToText(html || '');
  return fromHtml || '(sem conteúdo)';
}

function debugLogMail({ to, subject, html }) {
  if (!MAIL_DEBUG && NODE_ENV !== 'development') return;

  try {
    const toList = normalizeToList(to);
    console.log('[MAIL][DEBUG] host=', MAIL_HOST);
    console.log('[MAIL][DEBUG] port=', MAIL_PORT);
    console.log('[MAIL][DEBUG] secure=', MAIL_SECURE);
    console.log('[MAIL][DEBUG] user=', MAIL_USER || '(vazio)');
    console.log('[MAIL][DEBUG] from=', `${buildFrom().name} <${buildFrom().address}>`);
    console.log('[MAIL][DEBUG] to=', toList.join(', ') || '(vazio)');
    console.log('[MAIL][DEBUG] subject=', subject || '(sem assunto)');
    if (html) {
      console.log(
        '[MAIL][DEBUG] html_preview=',
        String(html).slice(0, 300).replace(/\s+/g, ' ') + '...'
      );
    }
  } catch {}
}

/* =========================
   SMTP
   ========================= */
async function makeTransportWith({ host, port, secure }) {
  if (!MAIL_USER || !MAIL_PASS) {
    lastError = 'MAIL_USER/MAIL_PASS ausentes.';
    throw new Error(lastError);
  }

  const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS
    },
    pool: MAIL_POOL,
    connectionTimeout: MAIL_CONNECTION_TIMEOUT_MS,
    socketTimeout: MAIL_SOCKET_TIMEOUT_MS,
    requireTLS: !secure,
    tls: {
      servername: host,
      rejectUnauthorized: false
    },
    debug: MAIL_DEBUG,
    logger: MAIL_DEBUG
  });

  await tx.verify();
  return tx;
}

async function makeTransport() {
  return makeTransportWith({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: MAIL_SECURE
  });
}

async function ensureTransport() {
  if (!MAIL_ENABLED) {
    lastError = 'MAIL_ENABLED=false';
    throw new Error(lastError);
  }

  if (transporter) return transporter;

  try {
    transporter = await makeTransport();
    lastProvider = `SMTP-${MAIL_PORT}`;
    console.log(`[MAIL] SMTP OK: ${MAIL_HOST}:${MAIL_PORT} | user=${MAIL_USER}`);
    return transporter;
  } catch (e) {
    lastError = e?.message || String(e);
    console.error('[MAIL] Falha ao criar transporter:', lastError);
    throw e;
  }
}

/* =========================
   SENDGRID
   ========================= */
async function sendViaSendGrid({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromEmail = SENDGRID_FROM || MAIL_FROM_ADDR || MAIL_USER;
  if (!fromEmail) throw new Error('Remetente inválido para SendGrid');

  const plain = ensurePlainText(text, html);

  const body = {
    from: { email: fromEmail, name: buildFrom().name },
    personalizations: [{ to: toList.map((e) => ({ email: e })) }],
    subject: subject || '(sem assunto)',
    content: [
      { type: 'text/plain', value: plain },
      ...(html ? [{ type: 'text/html', value: html }] : [])
    ],
    ...(MAIL_REPLY_TO
      ? { reply_to: { email: extractEmail(MAIL_REPLY_TO), name: buildFrom().name } }
      : {})
  };

  const resp = await _fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`SendGrid HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  lastProvider = 'SENDGRID';
  return { ok: true, provider: 'SENDGRID' };
}

/* =========================
   RESEND
   ========================= */
async function sendViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromObj = buildFrom();

  const body = {
    from: `${fromObj.name} <${fromObj.address}>`,
    to: toList,
    subject: subject || '(sem assunto)',
    html: html || undefined,
    text: ensurePlainText(text, html),
    ...(MAIL_REPLY_TO ? { reply_to: extractEmail(MAIL_REPLY_TO) } : {})
  };

  const resp = await _fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Resend HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  const data = await resp.json().catch(() => ({}));
  lastProvider = 'RESEND';
  return { ok: true, provider: 'RESEND', id: data?.id || null };
}

/* =========================
   ENVIO
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) {
    throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');
  }

  debugLogMail({ to, subject, html });

  const toList = normalizeToList(to);
  if (!toList.length) {
    throw new Error('Destinatário ausente');
  }

  const fromObj = buildFrom();
  if (!fromObj.address) {
    throw new Error('Remetente inválido/ausente');
  }

  const plain = ensurePlainText(text, html);

  // 1) Tenta SMTP primeiro
  try {
    const tx = await ensureTransport();

    const info = await tx.sendMail({
      from: fromObj,
      to: toList.join(','),
      subject: subject || '(sem assunto)',
      html,
      text: plain,
      ...(MAIL_REPLY_TO ? { replyTo: extractEmail(MAIL_REPLY_TO) } : {})
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    const pending = Array.isArray(info.pending) ? info.pending : [];

    console.log('[MAIL] messageId=', info.messageId || null);
    console.log('[MAIL] accepted=', accepted);
    console.log('[MAIL] rejected=', rejected);
    console.log('[MAIL] pending=', pending);
    console.log('[MAIL] response=', info.response || null);

    if (!accepted.length) {
      throw new Error(
        `SMTP não confirmou destinatários aceitos. rejected=${JSON.stringify(rejected)} pending=${JSON.stringify(pending)}`
      );
    }

    lastProvider = `SMTP-${MAIL_PORT}`;
    return {
      ok: true,
      provider: lastProvider,
      messageId: info.messageId || null,
      accepted,
      rejected,
      pending,
      response: info.response || null
    };
  } catch (smtpError) {
    lastError = smtpError?.message || String(smtpError);
    console.error('[MAIL] Falha SMTP:', lastError);

    // 2) Fallback opcional
    if (SENDGRID_API_KEY) {
      const result = await sendViaSendGrid({ to: toList, subject, html, text: plain });
      return { ok: true, fallback: true, smtp_error: lastError, ...result };
    }

    if (RESEND_API_KEY) {
      const result = await sendViaResend({ to: toList, subject, html, text: plain });
      return { ok: true, fallback: true, smtp_error: lastError, ...result };
    }

    throw smtpError;
  }
}

/* =========================
   VERIFY
   ========================= */
async function verify() {
  try {
    const tx = await ensureTransport();
    await tx.verify();
    return {
      ok: true,
      provider: lastProvider || `SMTP-${MAIL_PORT}`,
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_SECURE,
      user: MAIL_USER,
      from: `${buildFrom().name} <${buildFrom().address}>`
    };
  } catch (e) {
    lastError = e?.message || String(e);
    return {
      ok: false,
      msg: lastError,
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_SECURE,
      user: MAIL_USER,
      from: `${buildFrom().name} <${buildFrom().address}>`
    };
  }
}

async function verifyAll() {
  const results = {
    current: null,
    'SMTP-587': null,
    'SMTP-465': null,
    SENDGRID: { configured: Boolean(SENDGRID_API_KEY) },
    RESEND: { configured: Boolean(RESEND_API_KEY) }
  };

  try {
    results.current = await verify();
  } catch (e) {
    results.current = { ok: false, error: e?.message || String(e) };
  }

  try {
    const tx587 = await makeTransportWith({
      host: MAIL_HOST,
      port: 587,
      secure: false
    });
    results['SMTP-587'] = { ok: true };
    try {
      tx587.close && tx587.close();
    } catch {}
  } catch (e) {
    results['SMTP-587'] = { ok: false, error: e?.message || String(e) };
  }

  try {
    const tx465 = await makeTransportWith({
      host: MAIL_HOST,
      port: 465,
      secure: true
    });
    results['SMTP-465'] = { ok: true };
    try {
      tx465.close && tx465.close();
    } catch {}
  } catch (e) {
    results['SMTP-465'] = { ok: false, error: e?.message || String(e) };
  }

  return results;
}

/* =========================
   EXPORTS
   ========================= */
module.exports = {
  sendMail,
  verify,
  verifyAll,
  MAIL_ENABLED,
  MAIL_USER,
  MAIL_FROM: (() => {
    const f = buildFrom();
    return `${f.name} <${f.address}>`;
  })(),
  SMTP_HOST: MAIL_HOST,
  SMTP_PORT: MAIL_PORT,
  getLastMailError: () => lastError,
  getLastProvider: () => lastProvider
};