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

const MAIL_CONNECTION_TIMEOUT_MS = Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000);
const MAIL_SOCKET_TIMEOUT_MS     = Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 15000);

// HTTP providers (gratuitos)
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
function normalizeToList(to) {
  if (Array.isArray(to)) return to.filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  return String(to || '').split(',').map(s => s.trim()).filter(Boolean);
}
function buildFrom() {
  const address = MAIL_FROM_ADDR || MAIL_USER || SENDGRID_FROM || RESEND_FROM;
  return { name: MAIL_FROM_NAME || 'Sistema Escolar', address };
}
function isGmailAddress(addr = '') {
  return /@gmail\.com$/i.test(String(addr).trim());
}
function hasAnyGmail(recipients = []) {
  return recipients.some(isGmailAddress);
}

/* =========================
   SMTP (Nodemailer) — para @gmail.com
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
   SENDGRID (HTTP API) — text/plain antes do html
   ========================= */
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
    personalizations: [{
      to: toList.map(e => ({ email: e })),
      ...(MAIL_REPLY_TO ? { headers: { 'Reply-To': MAIL_REPLY_TO } } : {})
    }],
    subject: subject || '(sem assunto)',
    content
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
   API PÚBLICA — lógica híbrida
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  // 1) Se houver qualquer destinatário @gmail.com, tenta SMTP (Gmail) primeiro
  if (hasAnyGmail(toList)) {
    const tx = await ensureTransport();
    if (tx) {
      const info = await tx.sendMail({
        from: buildFrom(),
        to: toList.join(','),
        subject: subject || '(sem assunto)',
        html,
        text,
        ...(MAIL_REPLY_TO ? { replyTo: MAIL_REPLY_TO } : {})
      });
      lastProvider = `SMTP-${MAIL_PORT}`;
      if (MAIL_DEBUG) console.log(`[MAIL] Enviado via ${lastProvider} → ${toList.join(', ')}`);
      return { ok: true, info, provider: lastProvider };
    }
    // se SMTP falhar, cai para SendGrid (pode não entregar no Gmail, mas tentamos)
    if (MAIL_DEBUG) console.warn('[MAIL] SMTP indisponível; fallback SendGrid para @gmail.com');
  }

  // 2) Demais domínios (ou fallback)
  if (SENDGRID_API_KEY) {
    const info = await sendViaSendGrid({ to: toList, subject, html, text });
    if (MAIL_DEBUG) console.log(`[MAIL] Enviado via SENDGRID → ${toList.join(', ')}`);
    return { ok: true, info, provider: 'SENDGRID' };
  }

  // 3) Último fallback: Resend (se configurado)
  if (RESEND_API_KEY) {
    const info = await sendViaResend({ to: toList, subject, html, text });
    if (MAIL_DEBUG) console.log(`[MAIL] Enviado via RESEND → ${toList.join(', ')}`);
    return { ok: true, info, provider: 'RESEND' };
  }

  const msg = lastError || 'Nenhum provedor de e-mail configurado (SMTP / SendGrid / Resend)';
  throw new Error(msg);
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
