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

const MAIL_POOL   = String(process.env.MAIL_POOL || 'true').toLowerCase() === 'true';
const MAIL_DEBUG  = String(process.env.MAIL_DEBUG || 'false').toLowerCase() === 'true';

const MAIL_CONNECTION_TIMEOUT_MS = Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000);
const MAIL_SOCKET_TIMEOUT_MS     = Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 15000);

// Fallbacks por API (HTTPS 443)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM    = process.env.SENDGRID_FROM || MAIL_FROM_ADDR || '';
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';
const RESEND_FROM      = process.env.RESEND_FROM || 'onboarding@resend.dev';

/* =========================
   ESTADO INTERNO
   ========================= */
let transporter  = null;
let lastError    = null;
let lastProvider = null; // "SMTP-587", "SENDGRID", "RESEND"

/* =========================
   HELPERS
   ========================= */
function normalizeToList(to) {
  if (Array.isArray(to)) return to.filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  return String(to || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function buildFrom() {
  const address = MAIL_FROM_ADDR || MAIL_USER || SENDGRID_FROM || RESEND_FROM;
  return { name: MAIL_FROM_NAME || 'Sistema Escolar', address };
}

/* =========================
   SMTP (Nodemailer)
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

  await tx.verify(); // valida conexão/autenticação
  return tx;
}

async function ensureTransport() {
  if (!MAIL_ENABLED) { lastError = 'MAIL_ENABLED=false'; return null; }

  if (transporter) return transporter;

  // 1) Tenta SMTP (funciona no localhost; geralmente bloqueado no Render)
  try {
    const tx = await makeTransport();
    if (tx) {
      transporter = tx;
      lastProvider = `SMTP-${MAIL_PORT}`;
      if (MAIL_DEBUG) {
        console.log(`[MAIL] Verificado SMTP:${MAIL_HOST}:${MAIL_PORT}(secure=${MAIL_SECURE})`);
      }
      lastError = null;
      return transporter;
    }
  } catch (e) {
    lastError = e?.message || String(e);
    if (MAIL_DEBUG) console.error('[MAIL] Falha SMTP:', lastError);
  }

  // Sem transporter SMTP; deixe o sendMail decidir pelo fallback (SendGrid/Resend)
  return null;
}

/* =========================
   SENDGRID (HTTP API)
   ========================= */
async function sendViaSendGrid({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY ausente');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromEmail = SENDGRID_FROM || MAIL_FROM_ADDR || MAIL_USER;
  if (!fromEmail) throw new Error('Remetente inválido para SendGrid');

  const body = {
    from: { email: fromEmail, name: MAIL_FROM_NAME || 'Sistema Escolar' },
    personalizations: [{ to: toList.map(e => ({ email: e })) }],
    subject: subject || '(sem assunto)',
    content: [],
  };

  if (html) body.content.push({ type: 'text/html', value: html });
  if (text) body.content.push({ type: 'text/plain', value: text });
  if (!body.content.length) body.content.push({ type: 'text/plain', value: '(sem conteúdo)' });

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
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
   RESEND (HTTP API) — opcional
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
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
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
   API PÚBLICA
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');

  // 1) SMTP se disponível
  const tx = await ensureTransport();
  if (tx) {
    const toList = normalizeToList(to);
    if (!toList.length) throw new Error('Destinatário ausente');
    const from = buildFrom();

    const info = await tx.sendMail({
      from,
      to: toList.join(','),
      subject: subject || '(sem assunto)',
      html,
      text,
    });
    lastProvider = lastProvider || `SMTP-${MAIL_PORT}`;
    if (MAIL_DEBUG) console.log(`[MAIL] Enviado via ${lastProvider} para ${toList.join(', ')}`);
    return { ok: true, info, provider: lastProvider };
  }

  // 2) Fallback SendGrid (libera envio para qualquer destinatário sem domínio próprio)
  if (SENDGRID_API_KEY) {
    const info = await sendViaSendGrid({ to, subject, html, text });
    if (MAIL_DEBUG) console.log(`[MAIL] Enviado via SENDGRID para ${normalizeToList(to).join(', ')}`);
    return { ok: true, info, provider: 'SENDGRID' };
  }

  // 3) Fallback Resend (se configurado)
  if (RESEND_API_KEY) {
    const info = await sendViaResend({ to, subject, html, text });
    if (MAIL_DEBUG) console.log(`[MAIL] Enviado via RESEND para ${normalizeToList(to).join(', ')}`);
    return { ok: true, info, provider: 'RESEND' };
  }

  // 4) Nada disponível
  const msg = lastError || 'SMTP indisponível e nenhum provedor HTTP (SendGrid/Resend) configurado';
  throw new Error(msg);
}

async function verify() {
  try {
    const tx = await ensureTransport();
    if (tx) {
      await tx.verify();
      return { ok: true, provider: lastProvider || `SMTP-${MAIL_PORT}` };
    }
    // sem SMTP; mas se houver provedor HTTP configurado, considere OK (fallback pronto)
    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID (fallback disponível)', smtp_error: lastError || null };
    if (RESEND_API_KEY)   return { ok: true, provider: 'RESEND (fallback disponível)',   smtp_error: lastError || null };
    return { ok: false, msg: lastError || 'Sem SMTP e sem provedor HTTP configurado' };
  } catch (e) {
    lastError = e?.message || String(e);
    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID (SMTP falhou, fallback disponível)', smtp_error: lastError };
    if (RESEND_API_KEY)   return { ok: true, provider: 'RESEND (SMTP falhou, fallback disponível)',   smtp_error: lastError };
    return { ok: false, msg: lastError };
  }
}

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
