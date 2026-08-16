'use strict';

const twilio = require('twilio');
const { normalizarTelefoneBrasil } = require('./telefone');

const ENABLED = String(process.env.WHATSAPP_ENABLED || '').toLowerCase() === 'true';
const ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
const AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
const MESSAGING_SERVICE_SID = String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
const FROM_RAW = String(
  process.env.TWILIO_WHATSAPP_FROM ||
  process.env.WHATSAPP_OFICIAL ||
  ''
).trim();

let client = null;

function normalizarEnderecoWhatsApp(value) {
  const semPrefixo = String(value || '').replace(/^whatsapp:/i, '').trim();
  return normalizarTelefoneBrasil(semPrefixo);
}

function normalizarRemetenteWhatsApp(value) {
  const original = String(value || '')
    .replace(/^whatsapp:/i, '')
    .trim();

  const digits = original.replace(/\D+/g, '');
  const e164 = digits ? `+${digits}` : '';

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    return {
      valido: false,
      original,
      e164: null,
      whatsappAddress: null,
      motivo: 'Remetente do WhatsApp inválido.',
    };
  }

  return {
    valido: true,
    original,
    e164,
    whatsappAddress: `whatsapp:${e164}`,
    motivo: null,
  };
}

function getStatus() {
  const from = normalizarRemetenteWhatsApp(FROM_RAW);
  const hasCredentials = Boolean(ACCOUNT_SID && AUTH_TOKEN);
  const hasSender = Boolean(MESSAGING_SERVICE_SID || from.valido);

  const templates = {
    notificacao: Boolean(String(process.env.TWILIO_WHATSAPP_NOTIFICACAO_CONTENT_SID || '').trim()),
    notaComportamental: Boolean(String(process.env.TWILIO_WHATSAPP_NOTA_CONTENT_SID || '').trim()),
    np: Boolean(String(process.env.TWILIO_WHATSAPP_NP_CONTENT_SID || '').trim()),
    associacao: Boolean(String(process.env.TWILIO_WHATSAPP_ASSOCIACAO_CONTENT_SID || '').trim()),
    acessoEscolar: Boolean(String(process.env.TWILIO_WHATSAPP_ACESSO_CONTENT_SID || '').trim()),
  };

  return {
    enabled: ENABLED,
    provider: 'twilio',
    configured: Boolean(ENABLED && hasCredentials && hasSender),
    hasCredentials,
    hasMessagingServiceSid: Boolean(MESSAGING_SERVICE_SID),
    hasSender: Boolean(from.valido),
    sender: from.valido ? from.e164 : null,
    senderError: FROM_RAW && !from.valido ? from.motivo : null,
    templates,
  };
}

function getClient() {
  if (!client) client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  return client;
}

function resolverContentSid(templateKey, explicitContentSid) {
  if (explicitContentSid) return String(explicitContentSid).trim();

  const key = String(templateKey || '').trim().toUpperCase();
  const envByKey = {
    NOTIFICACAO_DEFERIDA: process.env.TWILIO_WHATSAPP_NOTIFICACAO_CONTENT_SID,
    NOTA_COMPORTAMENTAL: process.env.TWILIO_WHATSAPP_NOTA_CONTENT_SID,
    NP_ENCAMINHAMENTO: process.env.TWILIO_WHATSAPP_NP_CONTENT_SID,
    ASSOCIACAO_LEMBRETE: process.env.TWILIO_WHATSAPP_ASSOCIACAO_CONTENT_SID,
    ACESSO_ESCOLAR: process.env.TWILIO_WHATSAPP_ACESSO_CONTENT_SID,
  };

  return String(envByKey[key] || '').trim();
}

/**
 * Envia WhatsApp via Twilio.
 * CompatÃ­vel com:
 *   enviarWhatsapp('+5568999999999', 'texto')
 *   enviarWhatsapp({ to, text, contentSid, contentVariables, templateKey })
 */
async function enviarWhatsapp(toOrPayload, maybeText, maybeOptions = {}) {
  const payload = typeof toOrPayload === 'object' && toOrPayload !== null
    ? { ...toOrPayload }
    : { to: toOrPayload, text: maybeText, ...maybeOptions };

  const status = getStatus();
  if (!status.configured) {
    return {
      ok: false,
      provider: 'twilio',
      erro: !ENABLED
        ? 'WhatsApp automÃ¡tico desativado por WHATSAPP_ENABLED.'
        : 'Credenciais ou remetente do Twilio nÃ£o configurados.',
      status,
    };
  }

  const destino = normalizarEnderecoWhatsApp(payload.to);
  if (!destino.valido) {
    return { ok: false, provider: 'twilio', erro: destino.motivo, telefone: destino };
  }

  const from = normalizarRemetenteWhatsApp(FROM_RAW);
  const contentSid = resolverContentSid(payload.templateKey, payload.contentSid);
  const templateKey = String(payload.templateKey || '').trim();

  // Fluxos automÃ¡ticos iniciados pela instituiÃ§Ã£o devem usar modelo aprovado.
  // Mensagem livre fica restrita ao teste controlado ou a conversas jÃ¡ abertas.
  if (templateKey && !contentSid) {
    return {
      ok: false,
      provider: 'twilio',
      erro: `Template do WhatsApp nÃ£o configurado para ${templateKey}.`,
      templateKey,
      to: destino.e164,
    };
  }
  const contentVariables = payload.contentVariables && typeof payload.contentVariables === 'object'
    ? JSON.stringify(payload.contentVariables)
    : (typeof payload.contentVariables === 'string' ? payload.contentVariables : null);

  const messagePayload = {
    to: destino.whatsappAddress,
  };

  // Quando o sender oficial foi configurado explicitamente, ele tem prioridade.
  // Isso evita que um Messaging Service antigo/sandbox desvie o envio do número oficial.
  if (from.valido) {
    messagePayload.from = from.whatsappAddress;
  } else if (MESSAGING_SERVICE_SID) {
    messagePayload.messagingServiceSid = MESSAGING_SERVICE_SID;
  }

  if (contentSid) {
    messagePayload.contentSid = contentSid;
    if (contentVariables) messagePayload.contentVariables = contentVariables;
  } else {
    const text = String(payload.text || payload.body || '').trim();
    if (!text) {
      return { ok: false, provider: 'twilio', erro: 'Mensagem do WhatsApp vazia.' };
    }
    messagePayload.body = text;
  }

  try {
    const message = await getClient().messages.create(messagePayload);
    return {
      ok: true,
      provider: 'twilio',
      messageId: message.sid,
      id: message.sid,
      status: message.status || 'queued',
      to: destino.e164,
      from: from.valido ? from.e164 : null,
      template: Boolean(contentSid),
      contentSid: contentSid || null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'twilio',
      erro: error?.message || String(error),
      code: error?.code || null,
      moreInfo: error?.moreInfo || null,
      status: error?.status || null,
      to: destino.e164,
    };
  }
}

enviarWhatsapp.sendWhatsApp = enviarWhatsapp;
enviarWhatsapp.getStatus = getStatus;
enviarWhatsapp.normalizarEnderecoWhatsApp = normalizarEnderecoWhatsApp;

module.exports = enviarWhatsapp;
