// backend/services/mensageria.js
// Mensageria unificada: Email (SMTP/Gmail), Telegram e link de WhatsApp.
// Usa utils/mailer para centralizar criação/verify do transporter.

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const Aluno = require('../models/Aluno');
const mailer = require('../utils/mailer');
const { montarEmailNP } = require('../utils/mensagens/npEncaminhamento');

let Instituicao = null;
let ConfiguracaoDisciplinar = null;

try {
  Instituicao = require('../models/Instituicao');
} catch (_) {
  Instituicao = null;
}

try {
  ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
} catch (_) {
  ConfiguracaoDisciplinar = null;
}

const IS_PROD = process.env.NODE_ENV === 'production';
const TG_ENABLED = String(process.env.TG_ENABLED || '').toLowerCase() === 'true';
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

function normalizarTexto(v) {
  return String(v || '').trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = normalizarTexto(v);
    if (s) return s;
  }
  return '';
}

function instituicaoMatches(instA, instB) {
  if (!instA || !instB) return false;
  return String(instA) === String(instB);
}

async function carregarContextoInstitucional(instituicaoId) {
  const fallback = {
    instituicaoLabel: 'CMDPII/CZS',
    nomeInstituicao: 'CMDPII/CZS',
    siglaInstituicao: 'CMDPII/CZS',
    setorResponsavel: 'Coordenação de Ensino',
    subtituloEmail: 'Notificação de Encaminhamento ao Núcleo Psicossocial',
    mensagemAutomatica: 'Mensagem automática do Sistema Escolar – CMDPII/CZS.',
    rodapeAviso: 'Caso já tenha ocorrido o atendimento no NP, desconsidere esta mensagem.',
    baseNormativaTitulo: 'Base normativa',
    baseNormativaTexto: 'Art. 51 — “Encaminhar ao Núcleo Psicossocial (NP) e registrar no histórico. O NP deve informar os responsáveis.”',
    observacaoFinal: 'Pedimos acompanhamento e alinhamento com a Monitoria/Coordenação. Em caso de dúvidas, estamos à disposição.',
    proximosPassos: [
      'Encaminhamento ao NP para escuta e orientação;',
      'Registro no histórico escolar;',
      'Contato do NP com os responsáveis;',
      'Acompanhamento conjunto com a monitoria.'
    ]
  };

  if (!instituicaoId) return fallback;

  let instituicaoDoc = null;
  let configDoc = null;

  try {
    if (Instituicao) {
      instituicaoDoc = await Instituicao.findById(instituicaoId).lean();
    }
  } catch (e) {
    console.warn('[mensageria] Falha ao carregar Instituicao:', e?.message || e);
  }

  try {
    if (ConfiguracaoDisciplinar) {
      configDoc = await ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean();
    }
  } catch (e) {
    console.warn('[mensageria] Falha ao carregar ConfiguracaoDisciplinar:', e?.message || e);
  }

  const nomeInstituicao = firstNonEmpty(
    instituicaoDoc?.nome,
    instituicaoDoc?.nomeExibicao,
    instituicaoDoc?.sigla,
    fallback.nomeInstituicao
  );

  const siglaInstituicao = firstNonEmpty(
    instituicaoDoc?.sigla,
    instituicaoDoc?.slug,
    nomeInstituicao,
    fallback.siglaInstituicao
  );

  const cabecalhoCfg = firstNonEmpty(
    configDoc?.regulamento?.textos?.cabecalho
  );

  const notificacaoCfg = firstNonEmpty(
    configDoc?.regulamento?.textos?.notificacao
  );

  const observacaoPadraoCfg = firstNonEmpty(
    configDoc?.regulamento?.textos?.observacaoPadrao
  );

  const textoInstitucional = firstNonEmpty(
    configDoc?.regulamento?.textoInstitucional
  );

  const artigo51 = Array.isArray(configDoc?.regulamento?.artigos)
    ? configDoc.regulamento.artigos.find((a) => String(a?.numero || '').trim() === '51')
    : null;

  const artigo51Texto = firstNonEmpty(
    artigo51?.titulo,
    ...(Array.isArray(artigo51?.incisos)
      ? artigo51.incisos.map((inc) => inc?.texto)
      : [])
  );

  const setorResponsavel = firstNonEmpty(
    cabecalhoCfg && cabecalhoCfg.includes('–') ? cabecalhoCfg.split('–').slice(1).join('–').trim() : '',
    cabecalhoCfg && cabecalhoCfg.includes('-') ? cabecalhoCfg.split('-').slice(1).join('-').trim() : '',
    fallback.setorResponsavel
  );

  // 🔥 CORREÇÃO:
  // prioriza o nome da instituição para evitar herdar sigla antiga (ex.: CZS)
  const instituicaoLabel = firstNonEmpty(
    nomeInstituicao,
    cabecalhoCfg && (cabecalhoCfg.split('–')[0] || cabecalhoCfg.split('-')[0]),
    siglaInstituicao,
    fallback.instituicaoLabel
  );

  return {
    instituicaoLabel: normalizarTexto(instituicaoLabel) || fallback.instituicaoLabel,
    nomeInstituicao,
    siglaInstituicao,
    setorResponsavel,
    subtituloEmail: fallback.subtituloEmail,

    // 🔥 CORREÇÃO:
    // mensagem automática deve priorizar o nome da instituição
    mensagemAutomatica: `Mensagem automática do Sistema Escolar – ${nomeInstituicao || siglaInstituicao || fallback.nomeInstituicao}.`,

    rodapeAviso: fallback.rodapeAviso,
    baseNormativaTitulo: fallback.baseNormativaTitulo,
    baseNormativaTexto: firstNonEmpty(
      notificacaoCfg,
      artigo51Texto,
      textoInstitucional,
      fallback.baseNormativaTexto
    ),
    observacaoFinal: firstNonEmpty(
      observacaoPadraoCfg,
      fallback.observacaoFinal
    ),
    proximosPassos: fallback.proximosPassos
  };
}

function fallbackTexto(aluno, categoria, contexto = {}) {
  const nome = aluno?.nome || '';
  const turma = aluno?.turma || '';
  const assinatura = firstNonEmpty(
    contexto?.setorResponsavel && contexto?.siglaInstituicao
      ? `${contexto.setorResponsavel} – ${contexto.siglaInstituicao}`
      : '',
    contexto?.instituicaoLabel,
    'CMDPII/CZS'
  );

  return [
    `COMUNICADO — ${categoria || 'Informação'}`,
    `Aluno(a): ${nome} (${turma})`,
    `Estamos à disposição. — ${assinatura}`
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
    : String(to || '').split(',').map((s) => s.trim()).filter(Boolean);

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
      console.log('📨 [LOG] (simulado) Telegram:', {
        chatIds: ids,
        text: bodyText.slice(0, 120) + '...'
      });
      return { ok: true, simulated: true, to: ids };
    }
    return { ok: false, erro: 'Telegram indisponível' };
  }

  const results = [];
  for (const chatId of ids) {
    try {
      const res = await tgBot.sendMessage(chatId, bodyText, {
        disable_web_page_preview: true,
        parse_mode: 'HTML'
      });
      results.push({ ok: true, id: res.message_id, to: String(chatId) });
    } catch (e) {
      results.push({ ok: false, erro: e?.message || String(e), to: String(chatId) });
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

/* =========================
   API legada (mantida)
   ========================= */
async function enviarEmail(aluno, categoria, html, destinoEmail, assunto) {
  const contexto = await carregarContextoInstitucional(aluno?.instituicao);
  const textoFallback = fallbackTexto(aluno, categoria, contexto);

  return enviarEmailDireto({
    to: destinoEmail,
    subject: assunto || `Comunicado — ${contexto.siglaInstituicao || contexto.nomeInstituicao || 'Instituição'}`,
    text: textoFallback,
    html: html || `<pre style="white-space:pre-wrap">${textoFallback}</pre>`
  });
}

async function enviarTelegram(aluno, categoria, chatId, texto) {
  const contexto = await carregarContextoInstitucional(aluno?.instituicao);
  return enviarTelegramDireto({
    chatIds: [chatId],
    text: texto || fallbackTexto(aluno, categoria, contexto)
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
    html = '',
    meta = {}
  } = opts;

  if (!alunoId) return { ok: false, erro: 'alunoId ausente' };

  const match = { _id: alunoId };
  if (instituicao) match.instituicao = instituicao;

  const aluno = await Aluno.findOne(match)
    .select('nome turma contatos responsaveis telefone instituicao')
    .lean();

  if (!aluno) return { ok: false, erro: 'Aluno não encontrado' };

  const contexto = await carregarContextoInstitucional(instituicao || aluno.instituicao);
  const contatos = extractContatosAluno(aluno);
  const textoFinal = String(texto || '').trim() || fallbackTexto(aluno, 'Informação', contexto);
  const htmlFinal = String(html || '').trim() || `<pre style="white-space:pre-wrap">${textoFinal}</pre>`;

  const resultados = {
    tried: [],
    telegram: null,
    email: null,
    whatsapp: null,
    meta
  };

  for (const canal of preferenciaCanais) {
    if (canal === 'email') {
      resultados.tried.push('email');
      if (contatos.emails.length) {
        resultados.email = await enviarEmailDireto({
          to: contatos.emails,
          subject: titulo,
          text: textoFinal,
          html: htmlFinal
        });
      } else {
        resultados.email = { ok: false, erro: 'Sem e-mails' };
      }
    }

    if (canal === 'telegram') {
      resultados.tried.push('telegram');
      if (contatos.telegramIds.length) {
        resultados.telegram = await enviarTelegramDireto({
          chatIds: contatos.telegramIds,
          text: textoFinal
        });
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
    const ids = chatIds && Array.isArray(chatIds)
      ? chatIds
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

    const instituicaoEfetiva = instituicao || aluno.instituicao;
    const contexto = await carregarContextoInstitucional(instituicaoEfetiva);

    const { subject, text, html } = montarEmailNP
      ? montarEmailNP({
          aluno: aluno.nome,
          turma: aluno.turma,
          notaAtual,
          linkAgendamento: linkAgendamento || '',
          contatoEscola: contatoEscola || '',

          siglaInstituicao: contexto.siglaInstituicao,
          nomeInstituicao: contexto.nomeInstituicao,
          setorResponsavel: contexto.setorResponsavel,
          subtituloEmail: contexto.subtituloEmail,
          mensagemAutomatica: contexto.mensagemAutomatica,
          rodapeAviso: contexto.rodapeAviso,
          baseNormativaTitulo: contexto.baseNormativaTitulo,
          baseNormativaTexto: contexto.baseNormativaTexto,
          observacaoFinal: contexto.observacaoFinal,
          proximosPassos: contexto.proximosPassos
        })
      : {
          subject: `Encaminhamento NP — ${contexto.siglaInstituicao || contexto.nomeInstituicao || 'Instituição'}`,
          text: fallbackTexto(aluno, 'NP', contexto),
          html: `<pre style="white-space:pre-wrap">${fallbackTexto(aluno, 'NP', contexto)}</pre>`
        };

    return enfileirarParaResponsaveis({
      alunoId,
      instituicao: instituicaoEfetiva,
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