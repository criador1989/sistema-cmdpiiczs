// backend/utils/mailer.js
'use strict';

const nodemailer = require('nodemailer');

const IS_PROD = process.env.NODE_ENV === 'production';

// Flags
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true';

// Gmail (App Password)
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_PASS = process.env.MAIL_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || (MAIL_USER ? `"CMDPII/CZS" <${MAIL_USER}>` : 'CMDPII/CZS <no-reply@localhost>');

// SMTP custom
const SMTP_HOST   = process.env.SMTP_HOST || '';
const SMTP_PORT   = Number(process.env.SMTP_PORT || (SMTP_HOST ? 587 : 0));
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER   = process.env.SMTP_USER || '';
const SMTP_PASS   = process.env.SMTP_PASS || '';

let transporter = null;
let transportMode = 'NONE';

function buildTransporter() {
  try {
    if (!MAIL_ENABLED) {
      transportMode = 'DISABLED';
      return null;
    }

    if (SMTP_HOST) {
      transportMode = 'SMTP_CUSTOM';
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT || 587,
        secure: SMTP_SECURE || Number(SMTP_PORT) === 465,
        auth: (SMTP_USER && SMTP_PASS) ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        pool: true,
        maxConnections: 4,
        maxMessages: 100,
      });
    }

    if (MAIL_USER && MAIL_PASS) {
      transportMode = 'GMAIL';
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: MAIL_USER, pass: MAIL_PASS },
        pool: true,
        maxConnections: 3,
        maxMessages: 60,
      });
    }

    transportMode = 'NONE';
    if (!IS_PROD) {
      console.warn('[mailer] MAIL_ENABLED=true porém sem credenciais válidas (SMTP_* ou MAIL_USER/MAIL_PASS).');
    }
    return null;
  } catch (e) {
    transportMode = 'ERROR';
    console.warn('[mailer] Falha ao criar transporter:', e?.message || e);
    return null;
  }
}

transporter = buildTransporter();

function canSendMail() {
  return Boolean(transporter) && MAIL_ENABLED;
}

async function verify() {
  if (!MAIL_ENABLED) return { ok: false, reason: 'MAIL_DISABLED' };
  if (!transporter) return { ok: false, reason: 'NO_TRANSPORT' };
  try {
    await transporter.verify();
    return {
      ok: true,
      mode: transportMode,
      host: SMTP_HOST || 'smtp.gmail.com',
      user: MAIL_USER ? '(definido)' : (SMTP_USER ? '(definido)' : '(vazio)'),
      from: MAIL_FROM,
    };
  } catch (e) {
    return { ok: false, reason: 'VERIFY_FAIL', error: e?.message || String(e), mode: transportMode };
  }
}

function getMailStatus() {
  return {
    MAIL_ENABLED: Boolean(MAIL_ENABLED),
    mode: transportMode,
    hasTransporter: Boolean(transporter),
    MAIL_FROM,
    // Não expor senha/usuário
    MAIL_USER: MAIL_USER ? '(definido)' : '(vazio)',
    SMTP_HOST,
    SMTP_PORT,
    nodeEnv: process.env.NODE_ENV || '(unset)',
  };
}

async function send({ to, subject, text, html }) {
  const destinatarios = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!destinatarios.length) return { ok: false, erro: 'destinatário(s) ausente(s)' };

  const subj = subject || 'Comunicado — CMDPII/CZS';
  const bodyText = text && String(text).trim() ? String(text) : (html ? '' : ' ');
  const bodyHtml = html && String(html).trim()
    ? html
    : (text ? `<pre style="white-space:pre-wrap">${String(text).replace(/</g, '&lt;')}</pre>` : '<p></p>');

  if (!canSendMail()) {
    if (!IS_PROD) {
      console.log('📧 [LOG] (simulado) send():', { to: destinatarios, subject: subj });
      return { ok: true, simulated: true, to: destinatarios };
    }
    return { ok: false, erro: 'SMTP indisponível' };
  }

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: destinatarios.join(','),
      subject: subj,
      text: bodyText,
      html: bodyHtml,
    });
    return { ok: true, id: info.messageId, to: destinatarios };
  } catch (e) {
    return { ok: false, erro: e?.message || String(e), to: destinatarios };
  }
}

module.exports = {
  transporter,
  send,
  canSendMail,
  verify,
  getMailStatus,
  // também exporta variáveis úteis (sem segredos)
  MAIL_ENABLED,
  MAIL_USER,
  MAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
};
