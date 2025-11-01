// backend/utils/mailer.js
const nodemailer = require('nodemailer');

const MAIL_ENABLED = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';
const MAIL_HOST = process.env.MAIL_HOST || 'smtp.gmail.com';
const MAIL_PORT = Number(process.env.MAIL_PORT || 465);
const MAIL_SECURE = String(process.env.MAIL_SECURE || 'true').toLowerCase() === 'true';
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_PASS = process.env.MAIL_PASS || '';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Sistema Escolar';
const MAIL_FROM_ADDR = process.env.MAIL_FROM_ADDR || MAIL_USER;

let transporter = null;
let lastError = null;

/**
 * Cria o transporter e testa a conexão SMTP.
 */
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
      servername: host, // força SNI correto (Render às vezes precisa)
      rejectUnauthorized: true
    }
  });

  await tx.verify(); // dispara erro se não autenticar
  return tx;
}

/**
 * Garante que o transporter esteja pronto (com fallback se necessário)
 */
async function ensureTransport() {
  if (!MAIL_ENABLED) {
    lastError = 'MAIL_ENABLED=false';
    return null;
  }
  if (!MAIL_USER || !MAIL_PASS) {
    lastError = 'MAIL_USER/MAIL_PASS ausentes';
    return null;
  }

  if (transporter) return transporter;

  try {
    transporter = await makeTransport({ host: MAIL_HOST, port: MAIL_PORT, secure: MAIL_SECURE });
    console.log(`[MAIL] Conectado: ${MAIL_HOST}:${MAIL_PORT} (secure=${MAIL_SECURE})`);
    lastError = null;
    return transporter;
  } catch (e1) {
    console.error('[MAIL] Falha no SMTP principal:', e1?.message || e1);
    lastError = e1?.message || String(e1);
  }

  // Fallback automático Gmail 587 STARTTLS
  if (MAIL_HOST === 'smtp.gmail.com') {
    try {
      transporter = await makeTransport({ host: 'smtp.gmail.com', port: 587, secure: false });
      console.log('[MAIL] Conectado via fallback Gmail 587 (STARTTLS).');
      lastError = null;
      return transporter;
    } catch (e2) {
      console.error('[MAIL] Falha no fallback 587:', e2?.message || e2);
      lastError = `${lastError} | fallback: ${e2?.message || e2}`;
    }
  }

  return null;
}

/**
 * Envia e-mail com HTML/texto
 */
async function sendMail({ to, subject, html, text }) {
  const tx = await ensureTransport();
  if (!tx) throw new Error(lastError || 'SMTP indisponível');

  const from = { name: MAIL_FROM_NAME, address: MAIL_FROM_ADDR || MAIL_USER };
  const info = await tx.sendMail({ from, to, subject, html, text });
  console.log(`[MAIL] Enviado para ${to}: ${subject}`);
  return info;
}

/**
 * Teste de conexão (usado por /debug/mail/verify)
 */
async function verify() {
  try {
    const tx = await ensureTransport();
    if (!tx) return { ok: false, msg: lastError || 'transporter nulo' };
    await tx.verify();
    return { ok: true, host: MAIL_HOST, port: MAIL_PORT, secure: MAIL_SECURE };
  } catch (e) {
    lastError = e?.message || String(e);
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
  getLastMailError: () => lastError
};
