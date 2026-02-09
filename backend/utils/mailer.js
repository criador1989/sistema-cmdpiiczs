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
    // sem fetch e sem node-fetch: APIs HTTP não funcionarão
    _fetch = null;
  }
}

/* =========================
   ENV / CONFIG
   ========================= */
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const MAIL_HOST   = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT   = Number(process.env.MAIL_PORT || 587);
const MAIL_SECURE = String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true';
const MAIL_USER   = process.env.MAIL_USER || '';
const MAIL_PASS   = process.env.MAIL_PASS || '';

const MAIL_FROM_RAW  = process.env.MAIL_FROM || ''; // ex.: "CMDPII/CZS" <sistema@...>
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Sistema Escolar';
const MAIL_FROM_ADDR = process.env.MAIL_FROM_ADDR || MAIL_USER || '';
const MAIL_REPLY_TO  = process.env.MAIL_REPLY_TO || MAIL_FROM_ADDR || MAIL_USER || '';

const MAIL_POOL   = String(process.env.MAIL_POOL || 'true').toLowerCase() === 'true';
const MAIL_DEBUG  = String(process.env.MAIL_DEBUG || 'false').toLowerCase() === 'true';

const MAIL_CONNECTION_TIMEOUT_MS = Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 12000);
const MAIL_SOCKET_TIMEOUT_MS     = Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 20000);

// HTTP providers
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM    = process.env.SENDGRID_FROM || MAIL_FROM_ADDR || '';
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';
const RESEND_FROM      = process.env.RESEND_FROM || 'onboarding@resend.dev';

const NODE_ENV = process.env.NODE_ENV || '';

/* =========================
   ESTADO
   ========================= */
let transporter  = null;
let lastError    = null;
let lastProvider = null; // "SMTP-587", "SMTP-465", "SENDGRID", "RESEND"

/* =========================
   HELPERS
   ========================= */
function extractEmail(s) {
  if (!s) return '';
  const str = String(s).trim();
  const m = str.match(/<([^>]+)>/);       // "Nome <email@dominio>"
  if (m && m[1]) return m[1].trim();
  if (str.startsWith('mailto:')) return str.slice(7).trim();
  return str;
}

function parseFrom(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^\s*"?([^"]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };
  // se vier só e-mail sem nome
  if (/^[^@]+@[^@]+\.[^@]+$/.test(String(raw).trim())) {
    return { name: MAIL_FROM_NAME || 'Sistema Escolar', address: String(raw).trim() };
  }
  return null;
}

function normalizeToList(to) {
  const arr = Array.isArray(to) ? to : String(to || '').split(',');
  return arr
    .map(extractEmail)
    .map(s => s.trim())
    .filter(Boolean);
}

function isGmailAddress(addr = '') {
  const email = extractEmail(addr).toLowerCase();
  return /@gmail\.com$/.test(email);
}

function splitByDomain(list) {
  const gmail = [];
  const others = [];
  for (const r of list) (isGmailAddress(r) ? gmail : others).push(extractEmail(r));
  return { gmail, others };
}

function buildFrom() {
  const parsed = parseFrom(MAIL_FROM_RAW);
  if (parsed) return parsed;
  const address = MAIL_FROM_ADDR || MAIL_USER || SENDGRID_FROM || RESEND_FROM;
  return { name: MAIL_FROM_NAME || 'Sistema Escolar', address };
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
  } catch { return ''; }
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
    console.log('[MAIL][DEBUG] to=', toList.join(', '));
    console.log('[MAIL][DEBUG] subject=', subject || '(sem assunto)');
    if (html) console.log('[MAIL][DEBUG] html_preview=', String(html).slice(0, 300).replace(/\s+/g, ' ') + '...');
  } catch {}
}

/* =========================
   SMTP helpers
   ========================= */
async function makeTransportWith({ host, port, secure }) {
  if (!MAIL_USER || !MAIL_PASS) {
    lastError = 'MAIL_USER/MAIL_PASS ausentes.';
    return null;
  }
  const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    pool: MAIL_POOL,
    connectionTimeout: MAIL_CONNECTION_TIMEOUT_MS,
    socketTimeout: MAIL_SOCKET_TIMEOUT_MS,
    tls: { servername: host, rejectUnauthorized: true },
    debug: MAIL_DEBUG,
  });
  await tx.verify();
  return tx;
}

async function makeTransport() {
  return makeTransportWith({ host: MAIL_HOST, port: MAIL_PORT, secure: MAIL_SECURE });
}

async function ensureTransport() {
  if (!MAIL_ENABLED) { lastError = 'MAIL_ENABLED=false'; return null; }
  if (transporter) return transporter;
  try {
    const tx = await makeTransport();
    if (tx) {
      transporter = tx;
      lastProvider = `SMTP-${MAIL_PORT}`;
      if (MAIL_DEBUG) console.log(`[MAIL] SMTP OK: ${MAIL_HOST}:${MAIL_PORT}`);
      return transporter;
    }
  } catch (e) {
    lastError = e?.message || String(e);
    if (MAIL_DEBUG) console.error('[MAIL] Falha SMTP:', lastError);
  }
  return null;
}

/* =========================
   SENDGRID (HTTP API)
   ========================= */
async function sendViaSendGrid({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível (node-fetch não instalado e Node sem fetch)');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromEmail = SENDGRID_FROM || MAIL_FROM_ADDR || MAIL_USER;
  if (!fromEmail) throw new Error('Remetente inválido para SendGrid');

  const plain = ensurePlainText(text, html);
  const content = [
    { type: 'text/plain', value: plain },
    ...(html ? [{ type: 'text/html', value: html }] : [])
  ];

  const body = {
    from: { email: fromEmail, name: buildFrom().name },
    personalizations: [{ to: toList.map(e => ({ email: e })) }],
    subject: subject || '(sem assunto)',
    content,
    ...(MAIL_REPLY_TO ? { reply_to: { email: extractEmail(MAIL_REPLY_TO), name: buildFrom().name } } : {})
  };

  const resp = await _fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`SendGrid HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  lastProvider = 'SENDGRID';
  return { id: resp.headers.get('x-message-id') || null, provider: 'SENDGRID' };
}

/* =========================
   RESEND (opcional)
   ========================= */
async function sendViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível (node-fetch não instalado e Node sem fetch)');

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
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Resend HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  const data = await resp.json().catch(() => ({}));
  lastProvider = 'RESEND';
  return { id: data?.id || null, provider: 'RESEND' };
}

/* =========================
   API PÚBLICA — split + fallback
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');

  debugLogMail({ to, subject, html });

  const all = normalizeToList(to);
  if (!all.length) throw new Error('Destinatário ausente');

  const { gmail, others } = splitByDomain(all);
  const fromObj = buildFrom();
  const plain = ensurePlainText(text, html);

  const details = {
    gmail: null,
    others: null,
    errors: []
  };

  let sentAny = false;

  // ===== 1) Gmail → SMTP preferencialmente, fallback para SendGrid/Resend =====
  if (gmail.length) {
    let gmailOk = false;
    try {
      const tx = await ensureTransport();
      if (tx) {
        await tx.sendMail({
          from: fromObj,
          to: gmail.join(','),
          subject: subject || '(sem assunto)',
          html,
          text: plain,
          ...(MAIL_REPLY_TO ? { replyTo: extractEmail(MAIL_REPLY_TO) } : {})
        });
        if (MAIL_DEBUG) console.log(`[MAIL] Gmail via SMTP → ${gmail.join(', ')}`);
        lastProvider = lastProvider || `SMTP-${MAIL_PORT}`;
        gmailOk = true;
        sentAny = true;
        details.gmail = { provider: `SMTP-${MAIL_PORT}`, to: gmail.length };
      }
    } catch (e) {
      details.errors.push(`SMTP(gmail) falhou: ${e?.message || e}`);
    }

    if (!gmailOk) {
      try {
        if (SENDGRID_API_KEY) {
          await sendViaSendGrid({ to: gmail, subject, html, text: plain });
          gmailOk = true; sentAny = true;
          details.gmail = { provider: 'SENDGRID', to: gmail.length };
        } else if (RESEND_API_KEY) {
          await sendViaResend({ to: gmail, subject, html, text: plain });
          gmailOk = true; sentAny = true;
          details.gmail = { provider: 'RESEND', to: gmail.length };
        } else {
          throw new Error('Sem provedor alternativo (SENDGRID/RESEND) para Gmail');
        }
      } catch (e) {
        details.errors.push(`Fallback(gmail) falhou: ${e?.message || e}`);
      }
    }
  }

  // ===== 2) Outros domínios → SendGrid/Resend preferencialmente, fallback SMTP =====
  if (others.length) {
    let othersOk = false;

    if (SENDGRID_API_KEY || RESEND_API_KEY) {
      try {
        if (SENDGRID_API_KEY) {
          await sendViaSendGrid({ to: others, subject, html, text: plain });
          othersOk = true; sentAny = true;
          details.others = { provider: 'SENDGRID', to: others.length };
        } else {
          await sendViaResend({ to: others, subject, html, text: plain });
          othersOk = true; sentAny = true;
          details.others = { provider: 'RESEND', to: others.length };
        }
      } catch (e) {
        details.errors.push(`HTTP(others) falhou: ${e?.message || e}`);
      }
    }

    if (!othersOk) {
      try {
        const tx = await ensureTransport();
        if (!tx) throw new Error('SMTP indisponível');
        await tx.sendMail({
          from: fromObj,
          to: others.join(','),
          subject: subject || '(sem assunto)',
          html,
          text: plain,
          ...(MAIL_REPLY_TO ? { replyTo: extractEmail(MAIL_REPLY_TO) } : {})
        });
        if (MAIL_DEBUG) console.log(`[MAIL] Outros via SMTP → ${others.join(', ')}`);
        sentAny = true;
        details.others = { provider: `SMTP-${MAIL_PORT}`, to: others.length };
      } catch (e) {
        details.errors.push(`SMTP(others) falhou: ${e?.message || e}`);
      }
    }
  }

  if (!sentAny) {
    const reason = details.errors.join(' | ') || 'Nenhum provedor disponível';
    throw new Error(`Falha ao enviar: ${reason}`);
  }

  return { ok: true, provider: lastProvider, details };
}

/* =========================
   VERIFY
   ========================= */
async function verify() {
  try {
    const tx = await ensureTransport();
    if (tx) {
      await tx.verify();
      return { ok: true, provider: lastProvider || `SMTP-${MAIL_PORT}` };
    }
    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID', smtp_error: lastError || null };
    if (RESEND_API_KEY)   return { ok: true, provider: 'RESEND',  smtp_error: lastError || null };
    return { ok: false, msg: lastError || 'Sem SMTP e sem provedor HTTP configurado' };
  } catch (e) {
    lastError = e?.message || String(e);
    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID (fallback)', smtp_error: lastError };
    if (RESEND_API_KEY)   return { ok: true, provider: 'RESEND (fallback)',  smtp_error: lastError };
    return { ok: false, msg: lastError };
  }
}

/**
 * Testa SMTP 587 (STARTTLS) e 465 (SSL) e informa qual passa.
 * Não altera config padrão; apenas diagnóstico.
 */
async function verifyAll() {
  const results = {
    'SMTP-587': null,
    'SMTP-465': null
  };

  try {
    const tx587 = await makeTransportWith({ host: MAIL_HOST, port: 587, secure: false });
    results['SMTP-587'] = { ok: true };
    try { tx587.close && tx587.close(); } catch {}
  } catch (e) {
    results['SMTP-587'] = { ok: false, error: e?.message || String(e) };
  }

  try {
    const tx465 = await makeTransportWith({ host: MAIL_HOST, port: 465, secure: true });
    results['SMTP-465'] = { ok: true };
    try { tx465.close && tx465.close(); } catch {}
  } catch (e) {
    results['SMTP-465'] = { ok: false, error: e?.message || String(e) };
  }

  results['SENDGRID'] = { configured: Boolean(SENDGRID_API_KEY) };
  results['RESEND']   = { configured: Boolean(RESEND_API_KEY) };

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
  getLastProvider: () => lastProvider,
};
