// backend/utils/mailer.js
'use strict';

const nodemailer = require('nodemailer');

// -------------------- ENV --------------------
const MAIL_ENABLED  = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';
const MAIL_HOST     = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT     = Number(process.env.MAIL_PORT || 465);
const MAIL_SECURE   = String(process.env.MAIL_SECURE || 'true').toLowerCase() === 'true';
const MAIL_USER     = process.env.MAIL_USER || '';
const MAIL_PASS     = process.env.MAIL_PASS || '';

const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Sistema Escolar';
const MAIL_FROM_ADDR = process.env.MAIL_FROM_ADDR || MAIL_USER;

// Fallback via API HTTP (sem SMTP)
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';     // chave API
const RESEND_FROM      = process.env.RESEND_FROM || 'onboarding@resend.dev'; // remetente de teste

let transporter   = null;
let lastError     = null;
let lastProvider  = null; // "SMTP-465", "SMTP-587", "RESEND"

// -------------------- SMTP --------------------
async function makeTransport({ host, port, secure }) {
  const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    tls: {
      servername: host,
      rejectUnauthorized: true,
    },
  });

  await tx.verify(); // valida conexão/autenticação
  return tx;
}

async function ensureTransport() {
  if (!MAIL_ENABLED) { lastError = 'MAIL_ENABLED=false'; return null; }
  if (!MAIL_USER || !MAIL_PASS) { lastError = 'MAIL_USER/MAIL_PASS ausentes'; return null; }
  if (transporter) return transporter;

  try {
    transporter = await makeTransport({ host: MAIL_HOST, port: MAIL_PORT, secure: MAIL_SECURE });
    lastProvider = `SMTP-${MAIL_PORT}`;
    console.log(`[MAIL] Conectado: ${MAIL_HOST}:${MAIL_PORT} (secure=${MAIL_SECURE})`);
    lastError = null;
    return transporter;
  } catch (e1) {
    console.error('[MAIL] Falha no SMTP principal:', e1?.message || e1);
    lastError = e1?.message || String(e1);
  }

  // Fallback Gmail 587 STARTTLS
  if (MAIL_HOST === 'smtp.gmail.com') {
    try {
      transporter = await makeTransport({ host: 'smtp.gmail.com', port: 587, secure: false });
      lastProvider = 'SMTP-587';
      console.log('[MAIL] Conectado via fallback Gmail 587 (STARTTLS).');
      lastError = null;
      return transporter;
    } catch (e2) {
      console.error('[MAIL] Falha no fallback 587:', e2?.message || e2);
      lastError = `${lastError} | fallback: ${e2?.message || e2}`;
    }
  }

  return null; // deixa sendMail decidir se usa API
}

// -------------------- RESEND (HTTP API) --------------------
async function sendViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ausente');

  const toList = Array.isArray(to)
    ? to.filter(Boolean)
    : String(to || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!toList.length) throw new Error('Destinatário ausente');

  const from = `${MAIL_FROM_NAME} <${MAIL_FROM_ADDR || RESEND_FROM}>`;
  const body = {
    from,
    to: toList,
    subject: subject || '(sem assunto)',
    html: html || undefined,
    text: text || undefined,
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
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
  console.log(`[MAIL] Enviado via Resend para ${toList.join(', ')}`);
  return { id: data?.id || null, provider: 'RESEND' };
}

// -------------------- API pública --------------------
async function sendMail({ to, subject, html, text }) {
  // 1) SMTP (se disponível)
  const tx = await ensureTransport();
  if (tx) {
    const toList = Array.isArray(to)
      ? to.filter(Boolean).join(',')
      : String(to || '').split(',').map(s => s.trim()).filter(Boolean).join(',');

    if (!toList) throw new Error('Destinatário ausente');

    const from = { name: MAIL_FROM_NAME, address: MAIL_FROM_ADDR || MAIL_USER };
    const info = await tx.sendMail({ from, to: toList, subject: subject || '(sem assunto)', html, text });
    console.log(`[MAIL] Enviado via ${lastProvider} para ${toList}: ${subject || '(sem assunto)'}`);
    return { ok: true, info, provider: lastProvider };
  }

  // 2) Fallback HTTP (Resend)
  if (RESEND_API_KEY) {
    const info = await sendViaResend({ to, subject, html, text });
    return { ok: true, info, provider: 'RESEND' };
  }

  // 3) Sem SMTP e sem RESEND
  const msg = lastError || 'SMTP indisponível e nenhum provedor HTTP configurado';
  throw new Error(msg);
}

async function verify() {
  try {
    const tx = await ensureTransport();
    if (tx) {
      await tx.verify();
      return { ok: true, provider: lastProvider || `SMTP-${MAIL_PORT}` };
    }
    if (RESEND_API_KEY) {
      return { ok: true, provider: 'RESEND (fallback disponível)', smtp_error: lastError || null };
    }
    return { ok: false, msg: lastError || 'Sem SMTP e sem RESEND_API_KEY' };
  } catch (e) {
    lastError = e?.message || String(e);
    if (RESEND_API_KEY) {
      return { ok: true, provider: 'RESEND (SMTP falhou, mas fallback disponível)', smtp_error: lastError };
    }
    return { ok: false, msg: lastError };
  }
}

module.exports = {
  sendMail,
  verify,
  MAIL_ENABLED,
  MAIL_USER,
  MAIL_FROM: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDR || MAIL_USER}>`,
  SMTP_HOST: MAIL_HOST,
  SMTP_PORT: MAIL_PORT,
  getLastMailError: () => lastError,
  getLastProvider: () => lastProvider,
};
