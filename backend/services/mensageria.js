// backend/services/mensageria.js
// Mensageria unificada: Email (SMTP/Gmail), Telegram e link de WhatsApp.
// Usa utils/mailer para centralizar criação/verify do transporter.

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const Aluno = require('../models/Aluno');
const mailer = require('../utils/mailer'); // <<<<<< usa o objeto exportado pelo utils/mailer
const { montarEmailNP } = require('../utils/mensagens/npEncaminhamento'); // mantenha se existir

const IS_PROD = process.env.NODE_ENV === 'production';
const TG_ENABLED   = String(process.env.TG_ENABLED || '').toLowerCase() === 'true';
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';

/* =========================
   Telegram (somente envio)
   ========================= */
let tgBot = null;
try {
  if (TG_BOT_TOKEN) {
    tgBot = new TelegramBot(TG_BOT_TOKEN, { polling: false });
  } else if (!IS_PROD) {
    console.warn('[mensageria] Sem TG_BOT_TOKEN. Em dev, Telegram será simulado no LOG.');
  } else if (TG_ENABLED) {
    console.warn('[mensageria] TG_ENABLED=true, mas sem TG_BOT_TOKEN.');
  }
} catch (e) {
  console.warn('[mensageria] Falha ao iniciar TelegramBot:', e?.message || e);
}

/* =========================
   Helpers
   ========================= */
function waLink(telefoneE164, texto) {
  const tel = String(telefoneE164 || '').replace(/\D/g, '');
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto || '')}`;
}

function fallbackTexto(aluno, categoria) {
  const nome  = aluno?.nome || '';
  const turma = aluno?.turma || '';
  return [
    `COMUNICADO — ${categoria || 'Informação'}`,
    `Aluno(a): ${nome} (${turma})`,
    `Estamos à disposição. — CMDPII/CZS`
  ].join('\n');
}

function extractContatosAluno(alunoDoc) {
  const emails = new Set();
  const whatsapps = new Set();
  const telegramIds = new Set();

  const c = alunoDoc?.contatos || {};
  if (c.email) emails.add(String(c.email).trim());
  if (c.emailResponsavel) emails.add(String(c.emailResponsavel).trim());
  if (c.whatsapp) whatsapps.add(String(c.whatsapp).replace(/\D/g, ''));
  if (c.telegramChatId) telegramIds.add(String(c.telegramChatId));

  if (alunoDoc?.telefone) {
    const tel = String(alunoDoc.telefone).replace(/\D/g, '');
    if (tel) whatsapps.add(tel);
  }

  const rs = Array.isArray(alunoDoc?.responsaveis) ? alunoDoc.responsaveis : [];
  for (const r of rs) {
    if (r?.email) emails.add(String(r.email).trim());
    if (r?.emailResponsavel) emails.add(String(r.emailResponsavel).trim());
    if (r?.whatsapp) whatsapps.add(String(r.whatsapp).replace(/\D/g, ''));
    if (r?.telegramChatId) telegramIds.add(String(r.telegramChatId));
  }

  return {
    emails: [...emails].filter(Boolean),
    whatsapps: [...whatsapps].filter(Boolean),
    telegramIds: [...telegramIds].filter(Boolean),
  };
}

/* =========================
   Envios de baixo nível
   ========================= */
async function enviarEmailDireto({ to, subject, text, html }) {
  const lista = Array.isArray(to)
    ? to.filter(Boolean)
    : String(to || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!lista.length) return { ok: false, erro: 'Destinatário ausente' };

  try {
    await mailer.sendMail({
      to: lista.join(','),
      subject,
      html,
      text
    });
    return { ok: true, to: lista };
  } catch (e) {
    return { ok: false, erro: e?.message || String(e), to: lista };
  }
}

function canSendTelegram() {
  return Boolean(tgBot);
}

async function enviarTelegramDireto({ chatIds = [], text }) {
  const ids = Array.isArray(chatIds) ? chatIds.filter(Boolean) : [chatIds].filter(Boolean);
  if (!ids.length) return { ok: false, erro: 'chatId ausente' };
  const bodyText = text && String(text).trim() ? String(text) : ' ';

  if (!canSendTelegram()) {
    if (!IS_PROD) {
      console.log('📨 [LOG] (simulado) Telegram:', { chatIds: ids, text: bodyText.slice(0, 120) + '...' });
      return { ok: true, simulated: true, to: ids };
    }
    return { ok: false, erro: 'Telegram indisponível' };
  }

  const results = [];
  for (const chatId of ids) {
    try {
      const res = await tgBot.sendMessage(chatId, bodyText, { disable_web_page_preview: true, parse_mode: 'HTML' });
      results.push({ ok: true, id: res.message_id, to: String(chatId) });
    } catch (e) {
      results.push({ ok: false, erro: e?.message || String(e), to: String(chatId) });
    }
  }
  return { ok: results.some(r => r.ok), results };
}

/* =========================
   API legada (mantida)
   ========================= */
async function enviarEmail(aluno, categoria, html, destinoEmail, assunto) {
  const textoFallback = fallbackTexto(aluno, categoria);
  return enviarEmailDireto({
    to: destinoEmail,
    subject: assunto || `Comunicado — ${categoria || 'Informação'}`,
    text: textoFallback,
    html: html || `<pre style="white-space:pre-wrap">${textoFallback}</pre>`
  });
}

async function enviarTelegram(aluno, categoria, chatId, texto) {
  return enviarTelegramDireto({
    chatIds: [chatId],
    text: texto || fallbackTexto(aluno, categoria)
  });
}

function linkWhatsApp(aluno, categoria, telefoneE164, texto) {
  const msg = texto || fallbackTexto(aluno, categoria);
  return waLink(telefoneE164, msg);
}

/* =========================
   Envio unificado
   ========================= */
async function enfileirarParaResponsaveis(opts = {}) {
  const {
    alunoId,
    instituicao,
    preferenciaCanais = ['email', 'telegram'],
    titulo = 'Comunicado — CMDPII/CZS',
    texto = '',
    html  = '',
    meta  = {}
  } = opts;

  if (!alunoId) return { ok: false, erro: 'alunoId ausente' };

  const match = { _id: alunoId };
  if (instituicao) match.instituicao = instituicao;

  const aluno = await Aluno.findOne(match)
    .select('nome turma contatos responsaveis telefone instituicao')
    .lean();
  if (!aluno) return { ok: false, erro: 'Aluno não encontrado' };

  const contatos = extractContatosAluno(aluno);
  const textoFinal = String(texto || '').trim() || fallbackTexto(aluno, 'Informação');
  const htmlFinal  = String(html  || '').trim() || `<pre style="white-space:pre-wrap">${textoFinal}</pre>`;

  const resultados = { tried: [], telegram: null, email: null, whatsapp: null, meta };

  for (const canal of preferenciaCanais) {
    if (canal === 'email') {
      resultados.tried.push('email');
      if (contatos.emails.length) {
        resultados.email = await enviarEmailDireto({ to: contatos.emails, subject: titulo, text: textoFinal, html: htmlFinal });
      } else {
        resultados.email = { ok: false, erro: 'Sem e-mails' };
      }
    }
    if (canal === 'telegram') {
      resultados.tried.push('telegram');
      if (contatos.telegramIds.length) {
        resultados.telegram = await enviarTelegramDireto({ chatIds: contatos.telegramIds, text: textoFinal });
      } else {
        resultados.telegram = { ok: false, erro: 'Sem telegramChatId' };
      }
    }
    if (canal === 'whatsapp') {
      resultados.tried.push('whatsapp');
      const n = contatos.whatsapps[0] || '';
      resultados.whatsapp = {
        ok: Boolean(n),
        numero: n || null,
        link: n ? waLink(n, textoFinal) : `https://wa.me/?text=${encodeURIComponent(textoFinal)}`
      };
    }
  }

  const ok =
    (resultados.email && resultados.email.ok) ||
    (resultados.telegram && resultados.telegram.ok) ||
    (resultados.whatsapp && resultados.whatsapp.ok);

  return {
    ok: Boolean(ok),
    aluno: { _id: alunoId, nome: aluno.nome, turma: aluno.turma },
    contatos,
    resultados
  };
}

/* =========================
   Status p/ diagnóstico
   ========================= */
function getStatus() {
  return {
    nodeEnv: process.env.NODE_ENV || '(unset)',
    MAIL_ENABLED: !!mailer?.MAIL_ENABLED,
    SMTP_HOST: mailer?.SMTP_HOST,
    SMTP_PORT: mailer?.SMTP_PORT,
    MAIL_USER: mailer?.MAIL_USER ? '(definido)' : '(vazio)',
    TG_ENABLED,
    hasTelegramBot: Boolean(tgBot),
    transportMode: mailer?.MAIL_ENABLED ? 'EMAIL' : 'NONE'
  };
}

/* =========================================================
   === FACADE para app.locals.mensageria (compatível com as rotas)
   ========================================================= */
/**
 * Objeto mínimo para ser usado por getMensageria(req) nas rotas:
 * - sendEmail({ to, subject, text, html })
 * - sendTelegram({ chatId?, chatIds?, text })
 */
const mensageriaForApp = {
  async sendEmail({ to, subject, text, html }) {
    return enviarEmailDireto({ to, subject, text, html });
  },
  async sendTelegram({ chatId, chatIds, text }) {
    const ids = chatIds && Array.isArray(chatIds) ? chatIds
      : (chatId ? [chatId] : []);
    return enviarTelegramDireto({ chatIds: ids, text });
  }
};

/**
 * Chame no index.js após criar o app:
 *   const { initMensageria } = require('./services/mensageria');
 *   initMensageria(app);
 */
function initMensageria(app) {
  if (!app?.locals) return;
  app.locals.mensageria = mensageriaForApp;
}

module.exports = {
  // legado / alto nível
  enviarEmail,
  enviarTelegram,
  linkWhatsApp,
  enfileirarParaResponsaveis,

  // NP (mantém assinatura esperada)
  enviarNPEncaminhamento: async (args) => {
    const {
      alunoId,
      notaAtual,
      linkAgendamento,
      contatoEscola,
      instituicao,
      preferenciaCanais = ['email', 'telegram']
    } = args || {};

    if (!alunoId) return { ok: false, erro: 'alunoId ausente' };

    const match = { _id: alunoId };
    if (instituicao) match.instituicao = instituicao;

    const aluno = await Aluno.findOne(match).select('nome turma instituicao').lean();
    if (!aluno) return { ok: false, erro: 'Aluno não encontrado' };

    const { subject, text, html } = montarEmailNP ? montarEmailNP({
      aluno: aluno.nome,
      turma: aluno.turma,
      notaAtual,
      linkAgendamento: linkAgendamento || '',
      contatoEscola: contatoEscola || ''
    }) : {
      subject: 'Encaminhamento NP',
      text: fallbackTexto(aluno, 'NP'),
      html: `<pre style="white-space:pre-wrap">${fallbackTexto(aluno, 'NP')}</pre>`
    };

    return enfileirarParaResponsaveis({
      alunoId,
      instituicao,
      preferenciaCanais,
      titulo: subject,
      texto: text,
      html,
      meta: { tipo: 'NP_ENCAMINHAMENTO', notaAtual: Number(notaAtual) }
    });
  },

  // diagnóstico
  getStatus,

  // facade p/ app.locals
  mensageriaForApp,
  initMensageria
};
