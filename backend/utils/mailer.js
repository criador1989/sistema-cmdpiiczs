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
   ========================= */
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const MAIL_HOST = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT = Number(process.env.MAIL_PORT || 587);
const MAIL_SECURE = String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true';
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_PASS = process.env.MAIL_PASS || '';

const MAIL_FROM_RAW = process.env.MAIL_FROM || '';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Sistema Escolar';
const MAIL_FROM_ADDR = process.env.MAIL_FROM_ADDR || MAIL_USER || '';
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || MAIL_FROM_ADDR || MAIL_USER || '';

const MAIL_POOL = String(process.env.MAIL_POOL || 'true').toLowerCase() === 'true';
const MAIL_DEBUG = String(process.env.MAIL_DEBUG || 'false').toLowerCase() === 'true';

const MAIL_CONNECTION_TIMEOUT_MS = Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 12000);
const MAIL_SOCKET_TIMEOUT_MS = Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 20000);

// HTTP providers
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM = process.env.SENDGRID_FROM || MAIL_FROM_ADDR || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

const NODE_ENV = process.env.NODE_ENV || '';
const IS_PRODUCTION = NODE_ENV === 'production';

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
  const m = String(raw).match(/^\s*"?([^"]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), address: m[2].trim() };

  const onlyEmail = String(raw).trim();
  if (/^[^@]+@[^@]+\.[^@]+$/.test(onlyEmail)) {
    return { name: MAIL_FROM_NAME || 'Sistema Escolar', address: onlyEmail };
  }
  return null;
}

function normalizeToList(to) {
  const arr = Array.isArray(to) ? to : String(to || '').split(',');
  return arr
    .map(extractEmail)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildSmtpFrom() {
  const parsed = parseFrom(MAIL_FROM_RAW);
  if (parsed) return parsed;

  const address = MAIL_FROM_ADDR || MAIL_USER || SENDGRID_FROM || extractEmail(RESEND_FROM);
  return { name: MAIL_FROM_NAME || 'Sistema Escolar', address };
}

function buildResendFrom() {
  const parsedResend = parseFrom(RESEND_FROM);
  if (parsedResend) return parsedResend;

  const parsedMailFrom = parseFrom(MAIL_FROM_RAW);
  if (parsedMailFrom) return parsedMailFrom;

  const resendAddr = extractEmail(RESEND_FROM);
  return {
    name: MAIL_FROM_NAME || 'Sistema Escolar',
    address: resendAddr || 'onboarding@resend.dev'
  };
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
    console.log('[MAIL][DEBUG] to=', toList.join(', '));
    console.log('[MAIL][DEBUG] subject=', subject || '(sem assunto)');
    if (html) {
      console.log(
        '[MAIL][DEBUG] html_preview=',
        String(html).slice(0, 300).replace(/\s+/g, ' ') + '...'
      );
    }
  } catch {}
}

function hasSmtpConfig() {
  return Boolean(MAIL_HOST && MAIL_PORT && MAIL_USER && MAIL_PASS);
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
  if (!MAIL_ENABLED) {
    lastError = 'MAIL_ENABLED=false';
    return null;
  }

  if (!hasSmtpConfig()) {
    lastError = 'Config SMTP incompleta';
    return null;
  }

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

  const fromName = MAIL_FROM_NAME || 'Sistema Escolar';
  const plain = ensurePlainText(text, html);

  const content = [
    { type: 'text/plain', value: plain },
    ...(html ? [{ type: 'text/html', value: html }] : []),
  ];

  const body = {
    from: { email: fromEmail, name: fromName },
    personalizations: [{ to: toList.map((e) => ({ email: e })) }],
    subject: subject || '(sem assunto)',
    content,
    ...(MAIL_REPLY_TO ? { reply_to: { email: extractEmail(MAIL_REPLY_TO), name: fromName } } : {}),
  };

  const resp = await _fetch('https://api.sendgrid.com/v3/mail/send', {
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
   RESEND
   ========================= */
async function sendViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível (node-fetch não instalado e Node sem fetch)');

  const toList = normalizeToList(to);
  if (!toList.length) throw new Error('Destinatário ausente');

  const fromObj = buildResendFrom();

  const body = {
    from: `${fromObj.name} <${fromObj.address}>`,
    to: toList,
    subject: subject || '(sem assunto)',
    html: html || undefined,
    text: ensurePlainText(text, html),
    ...(MAIL_REPLY_TO ? { reply_to: extractEmail(MAIL_REPLY_TO) } : {}),
  };

  const resp = await _fetch('https://api.resend.com/emails', {
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
   ESCOLHA DE PROVIDER
   ========================= */
function shouldPreferHttpProvider() {
  return Boolean(RESEND_API_KEY || SENDGRID_API_KEY);
}

function shouldPreferResendInThisEnv() {
  // produção no Render: Resend primeiro se existir
  if (IS_PRODUCTION && RESEND_API_KEY) return true;

  // se não há SMTP completo, vai direto para provider HTTP
  if (!hasSmtpConfig() && RESEND_API_KEY) return true;

  return false;
}

/* =========================
   API PÚBLICA
   ========================= */
async function sendMail({ to, subject, html, text }) {
  if (!MAIL_ENABLED) throw new Error('MAIL desabilitado (MAIL_ENABLED=false)');

  debugLogMail({ to, subject, html });

  const all = normalizeToList(to);
  if (!all.length) throw new Error('Destinatário ausente');

  const plain = ensurePlainText(text, html);
  const fromObj = buildSmtpFrom();

  const details = {
    providerTried: [],
    errors: [],
  };

  // =========================================
  // 1) PRODUÇÃO / RENDER → RESEND primeiro
  // =========================================
  if (shouldPreferResendInThisEnv()) {
    try {
      details.providerTried.push('RESEND');
      const result = await sendViaResend({ to: all, subject, html, text: plain });
      return {
        ok: true,
        provider: result.provider,
        details: { ...details, providerUsed: result.provider },
      };
    } catch (e) {
      lastError = e?.message || String(e);
      details.errors.push(`RESEND falhou: ${lastError}`);
    }

    // fallback opcional para SendGrid, se existir
    if (SENDGRID_API_KEY) {
      try {
        details.providerTried.push('SENDGRID');
        const result = await sendViaSendGrid({ to: all, subject, html, text: plain });
        return {
          ok: true,
          provider: result.provider,
          details: { ...details, providerUsed: result.provider },
        };
      } catch (e) {
        lastError = e?.message || String(e);
        details.errors.push(`SENDGRID falhou: ${lastError}`);
      }
    }

    // em produção, não tente SMTP depois de provider HTTP já configurado
    throw new Error(`Falha ao enviar: ${details.errors.join(' | ')}`);
  }

  // =========================================
  // 2) LOCALHOST / DEV → SMTP primeiro
  // =========================================
  try {
    details.providerTried.push(`SMTP-${MAIL_PORT}`);
    const tx = await ensureTransport();

    if (!tx) throw new Error(lastError || 'SMTP indisponível');

    await tx.sendMail({
      from: fromObj,
      to: all.join(','),
      subject: subject || '(sem assunto)',
      html,
      text: plain,
      ...(MAIL_REPLY_TO ? { replyTo: extractEmail(MAIL_REPLY_TO) } : {}),
    });

    if (MAIL_DEBUG) console.log(`[MAIL] enviado via SMTP → ${all.join(', ')}`);

    lastProvider = `SMTP-${MAIL_PORT}`;
    return {
      ok: true,
      provider: lastProvider,
      details: { ...details, providerUsed: lastProvider },
    };
  } catch (e) {
    lastError = e?.message || String(e);
    details.errors.push(`SMTP falhou: ${lastError}`);
  }

  // =========================================
  // 3) FALLBACK DEV → provider HTTP
  // =========================================
  if (shouldPreferHttpProvider()) {
    if (RESEND_API_KEY) {
      try {
        details.providerTried.push('RESEND');
        const result = await sendViaResend({ to: all, subject, html, text: plain });
        return {
          ok: true,
          provider: result.provider,
          details: { ...details, providerUsed: result.provider },
        };
      } catch (e) {
        lastError = e?.message || String(e);
        details.errors.push(`RESEND falhou: ${lastError}`);
      }
    }

    if (SENDGRID_API_KEY) {
      try {
        details.providerTried.push('SENDGRID');
        const result = await sendViaSendGrid({ to: all, subject, html, text: plain });
        return {
          ok: true,
          provider: result.provider,
          details: { ...details, providerUsed: result.provider },
        };
      } catch (e) {
        lastError = e?.message || String(e);
        details.errors.push(`SENDGRID falhou: ${lastError}`);
      }
    }
  }

  throw new Error(`Falha ao enviar: ${details.errors.join(' | ') || 'Nenhum provedor disponível'}`);
}

/* =========================
   VERIFY
   ========================= */
async function verify() {
  try {
    // em produção com Resend, não faz verify SMTP como critério principal
    if (shouldPreferResendInThisEnv()) {
      return {
        ok: true,
        provider: 'RESEND',
        smtp_error: hasSmtpConfig() ? (lastError || null) : 'SMTP ignorado neste ambiente',
        lastError: lastError || null,
      };
    }

    const tx = await ensureTransport();
    if (tx) {
      await tx.verify();
      return { ok: true, provider: lastProvider || `SMTP-${MAIL_PORT}` };
    }

    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID', smtp_error: lastError || null };
    if (RESEND_API_KEY) return { ok: true, provider: 'RESEND', smtp_error: lastError || null };

    return { ok: false, msg: lastError || 'Sem SMTP e sem provedor HTTP configurado' };
  } catch (e) {
    lastError = e?.message || String(e);

    if (SENDGRID_API_KEY) return { ok: true, provider: 'SENDGRID (fallback)', smtp_error: lastError };
    if (RESEND_API_KEY) return { ok: true, provider: 'RESEND (fallback)', smtp_error: lastError };

    return { ok: false, msg: lastError, lastError };
  }
}

/**
 * Diagnóstico bruto.
 * Em produção com Resend, ainda mostra SMTP, mas só para inspeção.
 */
async function verifyAll() {
  const results = {
    'SMTP-587': null,
    'SMTP-465': null,
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

  results.SENDGRID = { configured: Boolean(SENDGRID_API_KEY) };
  results.RESEND = {
    configured: Boolean(RESEND_API_KEY),
    from: buildResendFrom(),
  };

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
    const f = buildResendFrom();
    return `${f.name} <${f.address}>`;
  })(),
  SMTP_HOST: MAIL_HOST,
  SMTP_PORT: MAIL_PORT,
  getLastMailError: () => lastError,
  getLastProvider: () => lastProvider,
};