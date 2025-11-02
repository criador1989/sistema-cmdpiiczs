// backend/routes/api/mail-health.js
'use strict';

const express = require('express');
const router = express.Router();

const {
  sendMail,
  verify,
  getLastProvider,
  getLastMailError,
  MAIL_USER,
  MAIL_FROM,
  MAIL_ENABLED,
} = require('../../utils/mailer');

/**
 * GET /api/_mail/health
 * Envia um e-mail de teste para o MAIL_USER e retorna o status.
 * Aceita query params opcionais:
 *   ?to=alguem@dominio.com
 *   ?subject=Assunto%20teste
 *   ?mode=text|html   (default: text)
 *   ?msg=Corpo%20da%20mensagem
 */
router.get('/_mail/health', async (req, res) => {
  if (!MAIL_ENABLED) {
    return res.status(200).json({ ok: false, reason: 'MAIL_DISABLED' });
  }

  const to = (req.query.to && String(req.query.to).trim()) || MAIL_USER || '';
  const subject = (req.query.subject && String(req.query.subject)) || 'Healthcheck SMTP – CMDPII/CZS';
  const mode = (req.query.mode && String(req.query.mode).toLowerCase()) || 'text';
  const now = new Date().toISOString();
  const baseMsg = `Se você recebeu isto, o SMTP está OK.\n\nFROM: ${MAIL_FROM}\nTO: ${to}\nQuando: ${now}\nProvider atual: ${getLastProvider && getLastProvider() || '(desconhecido)'}\n`;

  const text = (req.query.msg && String(req.query.msg)) || baseMsg;
  const html = `<pre>${(req.query.msg && String(req.query.msg)) || baseMsg}</pre>`;

  try {
    // Verifica rapidamente se dá para enviar
    const v = await verify(); // não falha se houver fallback HTTP configurado
    const result = await sendMail({
      to,
      subject,
      text: mode === 'html' ? undefined : text,
      html: mode === 'html' ? html : undefined,
    });

    return res.status(200).json({
      ok: true,
      verify: v,
      send: {
        provider: result.provider,
        messageId: result.info?.messageId || result.info?.id || null,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
      provider: getLastProvider && getLastProvider(),
      lastError: getLastMailError && getLastMailError(),
    });
  }
});

/**
 * POST /api/_mail/test
 * Envia um e-mail de teste com corpo customizável.
 * Body JSON: { to?: string|string[], subject?: string, text?: string, html?: string }
 * - Se "to" não vier, usa MAIL_USER.
 */
router.post('/_mail/test', async (req, res) => {
  if (!MAIL_ENABLED) {
    return res.status(200).json({ ok: false, reason: 'MAIL_DISABLED' });
  }

  const body = req.body || {};
  const to = body.to || MAIL_USER || '';
  const subject = body.subject || 'Teste de envio – CMDPII/CZS';
  const text = body.text;
  const html = body.html;

  if (!to) {
    return res.status(400).json({ ok: false, error: 'Destinatário não informado e MAIL_USER vazio' });
  }

  try {
    const result = await sendMail({ to, subject, text, html });
    return res.status(200).json({
      ok: true,
      provider: result.provider,
      messageId: result.info?.messageId || result.info?.id || null,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
      provider: getLastProvider && getLastProvider(),
      lastError: getLastMailError && getLastMailError(),
    });
  }
});

module.exports = router;
