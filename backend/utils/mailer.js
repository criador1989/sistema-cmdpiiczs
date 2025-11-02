'use strict';

const nodemailer = require('nodemailer');

/* =========================
   ENV / CONFIG
   ========================= */
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const MAIL_HOST   = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT   = Number(process.env.MAIL_PORT || 587);
const MAIL_SECURE = String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true';
const MAIL_USER   = process.env.MAIL_USER || '';
const MAIL_PASS   = process.env.MAIL_PASS || '';

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

/* =========================
   ESTADO
   ========================= */
let transporter  = null;
let lastError    = null;
let lastProvider = null; // "SMTP", "SENDGRID", "RESEND"

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

/* =========================
   SMTP (Gmail) — para @gmail.com
   ========================= */
async function makeTransport() {
  if (!MAIL_USER || !MAIL_PASS) {
    lastError = 'MAIL_USER/MAIL_PASS ausentes.';
    return null;
  }
  const tx = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: MAIL_SECURE,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    pool: MAIL_POOL,
    connectionTimeout: MAIL_CONNECTION_TIMEOUT_MS,
    socketTimeout: MAIL_SOCKET_TIMEOUT_MS,
    tls: { servername: MAIL_HOST, rejectUnauthorized: true },
    debug: MAIL_DEBUG,
  });
  await tx.verify();
  return tx;
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
   SENDGRID (HTTP API) — text/plain antes de text/html
   ========================= */
async function sendViaSendGrid({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY ausente');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromEmail = SENDGRID_FROM || MAIL_FROM_ADDR || MAIL_USER;
  if (!fromEmail) throw new Error('Remetente inválido para SendGrid');

  let plain = (text && String(text).trim()) || '';
  if (!plain && html) plain = stripHtmlToText(html);

  const content = [];
  if (plain) content.push({ type: 'text/plain', value: plain });
  if (html)  content.push({ type: 'text/html',  value: html  });
  if (!content.length) content.push({ type: 'text/plain', value: '(sem conteúdo)' });

  const body = {
    from: { email: fromEmail, name: MAIL_FROM_NAME || 'Sistema Escolar' },
    personalizations: [{ to: toList.map(e => ({ email: e })) }],
    subject: subject || '(sem assunto)',
    content,
    ...(MAIL_REPLY_TO ? { reply_to: { email: MAIL_REPLY_TO, name: MAIL_FROM_NAME || 'Sistema Escolar' } } : {})
  };

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
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

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromAddr = MAIL_FROM_ADDR || RESEND_FROM;
  const body = {
    from: `${MAIL_FROM_NAME || 'Sistema Escolar'} <${fromAddr}>`,
    to: toList,
    subject: subject || '(sem assunto)',
    html: html || undefined,
    text: text || undefined,
    ...(MAIL_REPLY_TO ? { reply_to: MAIL_REPLY_TO } : {})
  };

  const resp = await fetch('https://api.resend.com/emails', {
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
   API PÚBLICA — split por domínio
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');

  const all = normalizeToList(to);
  if (!all.length) throw new Error('Destinatário ausente');

  const { gmail, others } = splitByDomain(all);

  // 1) Gmail por SMTP (se possível)
  if (gmail.length) {
    const tx = await ensureTransport();
    if (!tx) {
      if (MAIL_DEBUG) console.warn('[MAIL] SMTP indisponível; Gmail cairá em SendGrid (pode não entregar).');
    } else {
      const info = await tx.sendMail({
        from: buildFrom(),
        to: gmail.join(','),
        subject: subject || '(sem assunto)',
        html,
        text,
        ...(MAIL_REPLY_TO ? { replyTo: MAIL_REPLY_TO } : {})
      });
      if (MAIL_DEBUG) console.log(`[MAIL] Gmail via SMTP → ${gmail.join(', ')}`);
      lastProvider = `SMTP-${MAIL_PORT}`;
    }
  }

  // 2) Demais domínios via SendGrid
  if (others.length) {
    if (!SENDGRID_API_KEY) {
      // fallback opcional Resend
      if (RESEND_API_KEY) {
        const info = await sendViaResend({ to: others, subject, html, text });
        if (MAIL_DEBUG) console.log(`[MAIL] Outros via RESEND → ${others.join(', ')}`);
        return { ok: true, info, provider: 'RESEND' };
      }
      throw new Error('SENDGRID_API_KEY ausente para domínios não-Gmail');
    }
    const info = await sendViaSendGrid({ to: others, subject, html, text });
    if (MAIL_DEBUG) console.log(`[MAIL] Outros via SENDGRID → ${others.join(', ')}`);
    return { ok: true, info, provider: 'SENDGRID' };
  }

  // 3) Se só havia Gmail e foi via SMTP, retorna ok
  if (gmail.length) return { ok: true, provider: lastProvider || `SMTP-${MAIL_PORT}` };

  // 4) Nada para enviar
  throw new Error('Nenhum destinatário válido após normalização');
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

/* =========================
   EXPORTS
   ========================= */
module.exports = {
  sendMail,
  verify,
  MAIL_ENABLED,
  MAIL_USER,
  MAIL_FROM: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDR || MAIL_USER || SENDGRID_FROM || RESEND_FROM}>`,
  SMTP_HOST: MAIL_HOST,
  SMTP_PORT: MAIL_PORT,
  getLastMailError: () => lastError,
  getLastProvider: () => lastProvider,
};
