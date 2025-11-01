// backend/utils/mailer.js
'use strict';

const nodemailer = require('nodemailer');

// ====== Leitura de variáveis de ambiente ======
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true';
const SMTP_HOST    = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT    = Number(process.env.SMTP_PORT || 465); // 465 = TLS; 587 = STARTTLS
const MAIL_USER    = process.env.MAIL_USER || '';
const MAIL_PASS    = process.env.MAIL_PASS || '';

// Dica: use ASPAS SIMPLES no .env para evitar parsing estranho:
// MAIL_FROM='CMDPII/CZS <sistema.cmdpiiczs@gmail.com>'
const MAIL_FROM    = process.env.MAIL_FROM || MAIL_USER;

// ====== Criação do transporter (somente se habilitado) ======
let transporter = null;

if (MAIL_ENABLED) {
  if (!SMTP_HOST || !SMTP_PORT) {
    console.warn('[MAILER] MAIL_ENABLED=true, mas SMTP_HOST/SMTP_PORT não foram definidos. O envio pode falhar.');
  }
  if (!MAIL_USER || !MAIL_PASS) {
    console.warn('[MAILER] MAIL_ENABLED=true, mas MAIL_USER/MAIL_PASS não foram definidos. O envio pode falhar.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true em 465 (TLS), false em 587 (STARTTLS)
    auth: MAIL_USER && MAIL_PASS ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
    // Timeouts para evitar travamento
    connectionTimeout: 10000,  // 10s
    greetingTimeout:   10000,  // 10s
    socketTimeout:     15000,  // 15s
  });
}

/**
 * Envia e-mail sem nunca lançar erro para cima.
 * - Nunca bloqueia o fluxo da API (se você não usar await na rota).
 * - Retorna objeto com status do envio.
 */
async function safeSendMail(mailOptions) {
  if (!MAIL_ENABLED) {
    return { skipped: true, reason: 'MAIL_DISABLED' };
  }
  if (!transporter) {
    console.error('[MAILER] Transporter não inicializado');
    return { skipped: true, reason: 'NO_TRANSPORTER' };
  }

  try {
    // Garante "from" padrão se não vier no mailOptions
    const info = await transporter.sendMail({ from: MAIL_FROM, ...mailOptions });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[MAILER] Erro ao enviar e-mail:', err && err.stack ? err.stack : err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Verifica a conexão SMTP sem enviar e-mail.
 */
async function verify() {
  if (!MAIL_ENABLED || !transporter) return { ok: false, reason: 'MAIL_DISABLED_OR_NO_TRANSPORTER' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    console.error('[MAILER] Verify falhou:', err && err.stack ? err.stack : err);
    return { ok: false, error: String(err) };
  }
}

module.exports = {
  safeSendMail,
  verify,
  MAIL_ENABLED,
  SMTP_HOST,
  SMTP_PORT,
  MAIL_USER,
  MAIL_FROM,
};
