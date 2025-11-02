// backend/utils/mailer.js
'use strict';

const nodemailer = require('nodemailer');

// ---------------------------------------------------
// fetch para Node < 18 (fallback)
// ---------------------------------------------------
let _fetch = global.fetch;
if (typeof _fetch !== 'function') {
  try {
    _fetch = require('node-fetch');
  } catch {
    _fetch = null;
  }
}

// -------------------- ENV HELPERS --------------------
function asBool(v, def = false) {
  if (v === undefined || v === null) return def;
  return String(v).trim().toLowerCase() === 'true';
}
function asNum(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function asStr(v, def = '') {
  return (v === undefined || v === null) ? def : String(v);
}

// -------------------- ENV --------------------
const MAIL_ENABLED   = asBool(process.env.MAIL_ENABLED, false);
const MAIL_HOST      = asStr(process.env.MAIL_HOST, 'smtp.gmail.com');
const MAIL_PORT      = asNum(process.env.MAIL_PORT, NaN);           // se NaN, vamos tentar 587/465
const MAIL_SECURE    = (process.env.MAIL_SECURE !== undefined)
  ? asBool(process.env.MAIL_SECURE, false)
  : undefined; // undefined = não forçar (permite tentar 587 e 465)

const MAIL_USER      = asStr(process.env.MAIL_USER);
const MAIL_PASS      = asStr(process.env.MAIL_PASS);

const MAIL_FROM_NAME = asStr(process.env.MAIL_FROM_NAME, 'Sistema Escolar');
const MAIL_FROM_ADDR = asStr(process.env.MAIL_FROM_ADDR, MAIL_USER);

const MAIL_POOL      = asBool(process.env.MAIL_POOL, true);
const MAIL_DEBUG     = asBool(process.env.MAIL_DEBUG, false);

const CONN_TIMEOUT   = asNum(process.env.MAIL_CONNECTION_TIMEOUT_MS, 10000);
const SOCK_TIMEOUT   = asNum(process.env.MAIL_SOCKET_TIMEOUT_MS, 15000);

// Fallback via API HTTP (sem SMTP)
const RESEND_API_KEY = asStr(process.env.RESEND_API_KEY);
const RESEND_FROM    = asStr(process.env.RESEND_FROM, 'onboarding@resend.dev');

let lastError     = null;
let lastProvider  = null; // "SMTP:host:port(secure=...)" | "RESEND"

// -------------------- Build candidate transports --------------------
/**
 * Retorna uma lista de configurações de transporte que vamos tentar em ordem.
 * Se PORT/SECURE vierem no .env, respeitamos e tentamos apenas esse.
 * Senão: tentamos 587(STARTTLS) e depois 465(SSL).
 */
function transportCandidates() {
  const base = {
    host: MAIL_HOST,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    pool: MAIL_POOL,
    maxConnections: MAIL_POOL ? 3 : 1,
    maxMessages: MAIL_POOL ? 100 : undefined,
    connectionTimeout: CONN_TIMEOUT,
    socketTimeout:     SOCK_TIMEOUT,
    logger: MAIL_DEBUG,
    debug:  MAIL_DEBUG,
    requireTLS: false, // em 587 o STARTTLS será negociado
    tls: {
      // Força SNI, ajuda em alguns provedores
      servername: MAIL_HOST,
      rejectUnauthorized: true,
    },
  };

  // Se usuário fixou porta/secure, tentar só essa combinação
  if (!Number.isNaN(MAIL_PORT) && MAIL_SECURE !== undefined) {
    return [{
      ...base,
      port: MAIL_PORT,
      secure: MAIL_SECURE,
      __label: `SMTP:${MAIL_HOST}:${MAIL_PORT}(secure=${MAIL_SECURE})`
    }];
  }

  // Caso contrário, preparar tentativa dupla padrão Gmail
  const p587 = {
    ...base,
    port: 587,
    secure: false,
    __label: `SMTP:${MAIL_HOST}:587(secure=false)`
  };
  const p465 = {
    ...base,
    port: 465,
    secure: true,
    __label: `SMTP:${MAIL_HOST}:465(secure=true)`
  };

  // Se o host não for gmail, ainda vale tentar nas duas portas padrão
  return [p587, p465];
}

// -------------------- Criar e verificar transport --------------------
async function createAndVerifyTransport(cfg) {
  const tx = nodemailer.createTransport(cfg);
  // `verify` pode travar em redes ruins; proteja com timeout próprio
  const verifyWithGuard = new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('verify timeout'));
      }
    }, Math.max(3000, Math.min(CONN_TIMEOUT + 2000, 20000)));

    tx.verify().then(
      (ok) => { if (!done) { done = true; clearTimeout(t); resolve(ok); } },
      (err) => { if (!done) { done = true; clearTimeout(t); reject(err); } }
    );
  });

  await verifyWithGuard;
  return tx;
}

// -------------------- Resolvedor de transport (com cache) --------------------
let cachedTransport = null;

async function ensureTransport() {
  if (!MAIL_ENABLED) {
    lastError = 'MAIL_ENABLED=false';
    return null;
  }
  if (!MAIL_USER || !MAIL_PASS) {
    lastError = 'MAIL_USER/MAIL_PASS ausentes';
    return null;
  }
  if (cachedTransport) return cachedTransport;

  const candidates = transportCandidates();

  for (const cfg of candidates) {
    try {
      const tx = await createAndVerifyTransport(cfg);
      cachedTransport = tx;
      lastProvider = cfg.__label;
      console.info(`[MAIL] Conectado: ${cfg.__label}`);
      lastError = null;
      return cachedTransport;
    } catch (err) {
      console.error(`[MAIL] Falha ao verificar ${cfg.__label}: ${err && err.message}`);
      lastError = err?.message || String(err);
      // tenta o próximo candidato
    }
  }

  // nenhum SMTP conectou
  return null;
}

// -------------------- RESEND (HTTP API) --------------------
async function sendViaResend({ to, subject, html, text }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ausente');
  if (!_fetch) throw new Error('fetch indisponível e RESEND exige HTTP');

  const toList = Array.isArray(to)
    ? to.filter(Boolean)
    : asStr(to).split(',').map(s => s.trim()).filter(Boolean);

  if (!toList.length) throw new Error('Destinatário ausente');

  const from = `${MAIL_FROM_NAME} <${MAIL_FROM_ADDR || RESEND_FROM}>`;
  const body = { from, to: toList, subject: subject || '(sem assunto)' };
  if (html) body.html = html;
  if (text) body.text = text;

  const resp = await _fetch('https://api.resend.com/emails', {
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
  console.info(`[MAIL] Enviado via RESEND para ${toList.join(', ')}`);
  return { id: data?.id || null, provider: 'RESEND' };
}

// -------------------- Envio com retry/backoff --------------------
async function trySendWithTransport(tx, mailOpts, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const info = await tx.sendMail(mailOpts);
      return info;
    } catch (e) {
      last = e;
      const msg = (e && e.message) || String(e);
      const isTimeout = /timed?out|ETIMEDOUT|socket|ESOCKET/i.test(msg);
      const isConnRef = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH/i.test(msg);
      const retryable = isTimeout || isConnRef;

      console.error(`[MAIL] Tentativa ${i}/${attempts} falhou: ${msg}`);
      if (!retryable || i === attempts) break;

      // backoff: 1s, 3s, 7s...
      const waitMs = i === 1 ? 1000 : i === 2 ? 3000 : 7000;
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw last || new Error('Falha desconhecida no envio SMTP');
}

// -------------------- API pública --------------------
async function sendMail({ to, subject, html, text }) {
  // 1) SMTP (se disponível)
  const tx = await ensureTransport();
  if (tx) {
    const toList = Array.isArray(to)
      ? to.filter(Boolean).join(',')
      : asStr(to).split(',').map(s => s.trim()).filter(Boolean).join(',');

    if (!toList) throw new Error('Destinatário ausente');

    const from = { name: MAIL_FROM_NAME, address: MAIL_FROM_ADDR || MAIL_USER };
    const mailOpts = { from, to: toList, subject: subject || '(sem assunto)', html, text };

    const info = await trySendWithTransport(tx, mailOpts, 3);
    console.info(`[MAIL] Enviado via ${lastProvider} para ${toList}: ${subject || '(sem assunto)'}`);
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
      // verify extra para deixar claro no log
      await tx.verify();
      return { ok: true, provider: lastProvider };
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

// Verifica todos os candidatos — útil no boot da app
async function verifyAll() {
  if (!MAIL_ENABLED) {
    console.warn('[MAIL] MAIL_ENABLED=false — verificação suprimida.');
    return;
  }
  if (!MAIL_USER || !MAIL_PASS) {
    console.error('[MAIL] MAIL_USER/MAIL_PASS ausentes.');
    return;
  }
  const candidates = transportCandidates();
  for (const cfg of candidates) {
    try {
      console.info(`[MAIL] Verificando ${cfg.__label}...`);
      const tx = await createAndVerifyTransport(cfg);
      console.info(`[MAIL] OK: ${cfg.__label}`);
      // manter apenas o primeiro OK como cache
      if (!cachedTransport) {
        cachedTransport = tx;
        lastProvider = cfg.__label;
      } else {
        try { tx.close && tx.close(); } catch {}
      }
    } catch (e) {
      console.error(`[MAIL] Indisponível ${cfg.__label}: ${e && e.message}`);
    }
  }
}

module.exports = {
  sendMail,
  verify,
  verifyAll,
  MAIL_ENABLED,
  MAIL_USER,
  MAIL_FROM: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDR || MAIL_USER}>`,
  SMTP_HOST: MAIL_HOST,
  SMTP_PORT: Number.isNaN(MAIL_PORT) ? undefined : MAIL_PORT,
  getLastMailError: () => lastError,
  getLastProvider: () => lastProvider,
};
