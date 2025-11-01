// services/mensageria.js
// Mensageria unificada: Email (SMTP/Gmail), Telegram e link de WhatsApp.
// Tolerante a ambiente: envia quando houver credencial; em dev sem credencial, simula envio (ok:true).

const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const Aluno = require('../models/Aluno');
const { montarEmailNP } = require('../utils/mensagens/npEncaminhamento'); // (se não existir, mantenha)

/* =========================
   Variáveis de ambiente
   ========================= */
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true';
const TG_ENABLED   = String(process.env.TG_ENABLED   || '').toLowerCase() === 'true';

const MAIL_USER = process.env.MAIL_USER || ''; // ex: gmail
const MAIL_PASS = process.env.MAIL_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || (MAIL_USER ? `"CMDPII/CZS" <${MAIL_USER}>` : 'CMDPII/CZS <no-reply@localhost>');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || (SMTP_HOST ? 587 : 0));
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';

const IS_PROD = process.env.NODE_ENV === 'production';

/* =========================
   Email transport (pool)
   ========================= */
let transporter = null;
try {
  if (SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT || 587,
      secure: SMTP_SECURE || Number(SMTP_PORT) === 465,
      auth: (SMTP_USER && SMTP_PASS) ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      pool: true, maxConnections: 4, maxMessages: 100,
    });
  } else if (MAIL_USER && MAIL_PASS) {
    // Gmail com App Password
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: MAIL_USER, pass: MAIL_PASS },
      pool: true, maxConnections: 3, maxMessages: 60,
    });
  } else if (!IS_PROD) {
    // Dev sem credencial → simula
    console.warn('[mensageria] Sem SMTP configurado. Em dev, enviaremos em modo LOG.');
  } else if (MAIL_ENABLED) {
    console.warn('[mensageria] MAIL_ENABLED=true, mas sem SMTP_HOST nem MAIL_USER/MAIL_PASS.');
  }
} catch (e) {
  console.warn('[mensageria] Falha ao criar transporter SMTP:', e?.message || e);
}

/* =========================
   Telegram (envio unidirecional)
   ========================= */
let tgBot = null;
try {
  if (TG_BOT_TOKEN) {
    // polling:false → só envio
    tgBot = new TelegramBot(TG_BOT_TOKEN, { polling: false });
  } else if (!IS_PROD) {
    console.warn('[mensageria] Sem TG_BOT_TOKEN. Em dev, enviaremos Telegram em modo LOG.');
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
function canSendEmail() {
  // envia se houver transporter, mesmo que MAIL_ENABLED esteja ausente
  return Boolean(transporter);
}
function canSendTelegram() {
  return Boolean(tgBot);
}

async function enviarEmailDireto({ to, subject, text, html }) {
  const destinatarios = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (destinatarios.length === 0)   return { ok: false, erro: 'destinatário(s) ausente(s)' };

  const subj = subject || 'Comunicado — CMDPII/CZS';
  const bodyText = text && String(text).trim() ? String(text) : (html ? '' : ' ');
  const bodyHtml = html && String(html).trim()
    ? html
    : (text ? `<pre style="white-space:pre-wrap">${String(text).replace(/</g,'&lt;')}</pre>` : '<p></p>');

  if (!canSendEmail()) {
    // Em dev sem SMTP → simula
    if (!IS_PROD) {
      console.log('📧 [LOG] (simulado) Envio de email:', { to: destinatarios, subject: subj });
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

async function enviarTelegramDireto({ chatIds = [], text }) {
  const ids = Array.isArray(chatIds) ? chatIds.filter(Boolean) : [chatIds].filter(Boolean);
  if (ids.length === 0) return { ok: false, erro: 'chatId ausente' };

  const bodyText = text && String(text).trim() ? String(text) : ' ';
  if (!canSendTelegram()) {
    if (!IS_PROD) {
      console.log('📨 [LOG] (simulado) Envio Telegram:', { chatIds: ids, text: bodyText.slice(0, 100) + '...' });
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
   Envio unificado (preferências)
   ========================= */
async function enfileirarParaResponsaveis(opts = {}) {
  const {
    alunoId,
    instituicao,
    preferenciaCanais = ['email', 'telegram'], // prioriza email
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
  const htmlFinal = String(html || '').trim() || `<pre style="white-space:pre-wrap">${textoFinal}</pre>`;

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
   Encaminhamento NP (template)
   ========================= */
async function enviarNPEncaminhamento({
  alunoId,
  notaAtual,
  linkAgendamento,
  contatoEscola,
  instituicao,
  preferenciaCanais = ['email', 'telegram']
}) {
  if (!alunoId) return { ok: false, erro: 'alunoId ausente' };

  const match = { _id: alunoId };
  if (instituicao) match.instituicao = instituicao;

  const aluno = await Aluno.findOne(match).select('nome turma instituicao').lean();
  if (!aluno) return { ok: false, erro: 'Aluno não encontrado' };

  const { subject, text, html } = montarEmailNP({
    aluno: aluno.nome,
    turma: aluno.turma,
    notaAtual,
    linkAgendamento: linkAgendamento || '',
    contatoEscola: contatoEscola || ''
  });

  const envio = await enfileirarParaResponsaveis({
    alunoId,
    instituicao,
    preferenciaCanais,
    titulo: subject,
    texto: text,
    html,
    meta: { tipo: 'NP_ENCAMINHAMENTO', notaAtual: Number(notaAtual) }
  });

  return envio;
}

/* =========================
   Status p/ diagnóstico
   ========================= */
function getStatus() {
  return {
    nodeEnv: process.env.NODE_ENV || '(unset)',
    MAIL_ENABLED,
    TG_ENABLED,
    MAIL_FROM,
    hasTransporter: Boolean(transporter),
    hasTelegramBot: Boolean(tgBot),
    transportMode: (SMTP_HOST ? 'SMTP_CUSTOM' : (MAIL_USER && MAIL_PASS ? 'GMAIL' : 'NONE')),
  };
}

module.exports = {
  enviarEmail,           // legado
  enviarTelegram,        // legado
  linkWhatsApp,          // legado
  enfileirarParaResponsaveis,
  enviarNPEncaminhamento,
  getStatus
};
