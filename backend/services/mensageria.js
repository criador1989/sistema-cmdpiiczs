// Serviço de mensageria unificado: e-mail (SMTP/Gmail), Telegram e links de WhatsApp.
// Compatível com rotas /api/comunicacao e módulos legados do projeto.

const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const Aluno = require('../models/Aluno'); // necessário para enfileirarParaResponsaveis
const { montarEmailNP } = require('../utils/mensagens/npEncaminhamento'); // <<< NOVO

/* =========================
   Leitura de variáveis .env
   ========================= */
const MAIL_ENABLED = String(process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';
const TG_ENABLED   = String(process.env.TG_ENABLED   || 'false').toLowerCase() === 'true';

// Gmail (modo simples) OU SMTP custom (host/port)
const MAIL_USER = process.env.MAIL_USER || '';     // ex: seuemail@gmail.com
const MAIL_PASS = process.env.MAIL_PASS || '';     // App Password do Gmail
const MAIL_FROM = process.env.MAIL_FROM || (MAIL_USER ? `"CMDPII/CZS" <${MAIL_USER}>` : 'CMDPII/CZS <no-reply@localhost>');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Aceita TG_BOT_TOKEN OU TELEGRAM_BOT_TOKEN
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';

/* =========================
   SMTP (pool)
   ========================= */
let transporter = null;

if (MAIL_ENABLED) {
  try {
    if (SMTP_HOST) {
      // SMTP custom
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE || SMTP_PORT === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        pool: true,
        maxConnections: 4,
        maxMessages: 80,
      });
    } else if (MAIL_USER && MAIL_PASS) {
      // Gmail via "service" (App Password)
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: MAIL_USER, pass: MAIL_PASS },
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
      });
    } else {
      console.warn('[mensageria] MAIL_ENABLED=true, mas sem SMTP_HOST nem MAIL_USER/MAIL_PASS.');
    }
  } catch (e) {
    console.warn('[mensageria] Falha ao criar transporter SMTP:', e.message);
  }
}

/* =========================
   Telegram Bot (envio unidirecional)
   ========================= */
let tgBot = null;
if (TG_ENABLED && TG_BOT_TOKEN) {
  try {
    tgBot = new TelegramBot(TG_BOT_TOKEN, { polling: false });
  } catch (e) {
    console.warn('[mensageria] Falha ao iniciar TelegramBot:', e.message);
  }
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

// Normaliza e extrai contatos a partir do documento do aluno
function extractContatosAluno(alunoDoc) {
  const emails = new Set();
  const whatsapps = new Set();
  const telegramIds = new Set();

  const c = alunoDoc?.contatos || {};
  if (c.email) emails.add(String(c.email).trim());
  if (c.emailResponsavel) emails.add(String(c.emailResponsavel).trim());
  if (c.whatsapp) whatsapps.add(String(c.whatsapp).replace(/\D/g, ''));
  if (c.telegramChatId) telegramIds.add(String(c.telegramChatId));

  // Legado do aluno
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
   Envio direto (baixo nível)
   ========================= */
async function enviarEmailDireto({ to, subject, text, html }) {
  if (!MAIL_ENABLED)                return { ok: false, erro: 'MAIL_ENABLED=false' };
  if (!transporter)                 return { ok: false, erro: 'transporter indisponível' };
  const destinatarios = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (destinatarios.length === 0)   return { ok: false, erro: 'destinatário(s) ausente(s)' };

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: destinatarios.join(','),
      subject: subject || 'Comunicado — CMDPII/CZS',
      text: text || '',
      html: html || (text ? `<p>${String(text).replace(/\n/g,'<br/>')}</p>` : '<p></p>')
    });
    return { ok: true, id: info.messageId, to: destinatarios };
  } catch (e) {
    return { ok: false, erro: e.message, to: destinatarios };
  }
}

async function enviarTelegramDireto({ chatIds = [], text }) {
  if (!TG_ENABLED)     return { ok: false, erro: 'TG_ENABLED=false' };
  if (!tgBot)          return { ok: false, erro: 'tgBot indisponível' };
  const ids = Array.isArray(chatIds) ? chatIds.filter(Boolean) : [chatIds].filter(Boolean);
  if (ids.length === 0) return { ok: false, erro: 'chatId ausente' };

  const results = [];
  for (const chatId of ids) {
    try {
      const res = await tgBot.sendMessage(chatId, text || '', { disable_web_page_preview: true });
      results.push({ ok: true, id: res.message_id, to: String(chatId) });
    } catch (e) {
      results.push({ ok: false, erro: e.message, to: String(chatId) });
    }
  }
  return { ok: results.some(r => r.ok), results };
}

/* =========================
   API legada
   ========================= */
async function enviarEmail(aluno, categoria, html, destinoEmail, assunto) {
  return enviarEmailDireto({
    to: destinoEmail,
    subject: assunto || `Comunicado — ${categoria || 'Informação'}`,
    html: html || `<p>${fallbackTexto(aluno, categoria)}</p>`
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
   Fila simples + envio unificado
   ========================= */
async function enfileirarParaResponsaveis(opts = {}) {
  const {
    alunoId,
    instituicao,
    preferenciaCanais = ['telegram', 'email'],
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

  const resultados = {
    tried: [],
    telegram: null,
    email: null,
    whatsapp: null,
    meta,
  };

  for (const canal of preferenciaCanais) {
    if (canal === 'telegram') {
      resultados.tried.push('telegram');
      if (contatos.telegramIds.length) {
        resultados.telegram = await enviarTelegramDireto({
          chatIds: contatos.telegramIds,
          text: texto
        });
      } else {
        resultados.telegram = { ok: false, erro: 'Sem telegramChatId' };
      }
    }

    if (canal === 'email') {
      resultados.tried.push('email');
      if (contatos.emails.length) {
        resultados.email = await enviarEmailDireto({
          to: contatos.emails,
          subject: titulo,
          text: texto,
          html
        });
      } else {
        resultados.email = { ok: false, erro: 'Sem e-mails' };
      }
    }

    if (canal === 'whatsapp') {
      resultados.tried.push('whatsapp');
      const primeiroNumero = contatos.whatsapps[0] || '';
      resultados.whatsapp = {
        ok: Boolean(primeiroNumero),
        numero: primeiroNumero || null,
        link: primeiroNumero ? waLink(primeiroNumero, texto) : `https://wa.me/?text=${encodeURIComponent(texto||'')}`
      };
    }
  }

  const ok =
    (resultados.telegram && resultados.telegram.ok) ||
    (resultados.email && resultados.email.ok) ||
    (resultados.whatsapp && resultados.whatsapp.ok);

  return { ok: Boolean(ok), aluno: { _id: alunoId, nome: aluno.nome, turma: aluno.turma }, contatos, resultados };
}

/* =========================
   Encaminhamento ao NP (nota 5,00–6,99)
   ========================= */
// Gera e envia a mensagem já personalizada para os responsáveis.
async function enviarNPEncaminhamento({
  alunoId,
  notaAtual,
  linkAgendamento,
  contatoEscola,
  instituicao,
  preferenciaCanais = ['email', 'telegram'] // prioriza e-mail
}) {
  if (!alunoId) return { ok: false, erro: 'alunoId ausente' };

  // Busca aluno para montar o template
  const match = { _id: alunoId };
  if (instituicao) match.instituicao = instituicao;

  const aluno = await Aluno.findOne(match)
    .select('nome turma instituicao')
    .lean();

  if (!aluno) return { ok: false, erro: 'Aluno não encontrado' };

  // Monta mensagem
  const { subject, text, html } = montarEmailNP({
    aluno: aluno.nome,
    turma: aluno.turma,
    notaAtual,
    linkAgendamento: linkAgendamento || '',
    contatoEscola: contatoEscola || ''
  });

  // Dispara nos canais preferidos usando a fila unificada
  const envio = await enfileirarParaResponsaveis({
    alunoId,
    instituicao,
    preferenciaCanais,
    titulo: subject,
    texto: text,
    html,
    meta: {
      tipo: 'NP_ENCAMINHAMENTO',
      notaAtual: Number(notaAtual)
    }
  });

  return envio;
}

/* =========================
   Status p/ diagnóstico
   ========================= */
function getStatus() {
  return {
    MAIL_ENABLED,
    TG_ENABLED,
    MAIL_FROM,
    hasTransporter: Boolean(transporter),
    hasTelegramBot: Boolean(tgBot),
    transportMode: (SMTP_HOST ? 'SMTP_CUSTOM' : (MAIL_USER && MAIL_PASS ? 'GMAIL' : 'NONE')),
  };
}

module.exports = {
  // legado
  enviarEmail,
  enviarTelegram,
  linkWhatsApp,
  // unificado
  enfileirarParaResponsaveis,
  enviarNPEncaminhamento, // <<< NOVO
  // diagnóstico
  getStatus
};
