'use strict';

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { autenticar } = require('../../middleware/autenticacao');

const EventoConfig = require('../../models/eventos/EventoConfig');
const EventoConta = require('../../models/eventos/EventoConta');
const EventoParticipante = require('../../models/eventos/EventoParticipante');
const EventoInscricao = require('../../models/eventos/EventoInscricao');
const EventoResultado = require('../../models/eventos/EventoResultado');
const EventoFoto = require('../../models/eventos/EventoFoto');
const EventoCounter = require('../../models/eventos/EventoCounter');
const v130Extras = require('./eventosCorridaV130');
const { saveEventMedia, deleteEventMedia, streamEventMedia, publicStorageStatus } = require('../../utils/eventosMediaStorage');

const router = express.Router();
const adminUiRouter = express.Router();
const EVENT_SLUG = 'corrida-cmdpii-2026';
const COOKIE_NAME = 'ax_evento_token';
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.mimetype || '')) {
      return cb(new Error('Somente imagens JPG, PNG ou WEBP são permitidas.'));
    }
    cb(null, true);
  },
});

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPdf = String(file.mimetype || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    if (!isPdf) return cb(new Error('Somente arquivo PDF é permitido para o regulamento.'));
    cb(null, true);
  },
});

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ok = mime === 'application/pdf' || /^image\/(jpeg|png|webp)$/i.test(mime);
    if (!ok) return cb(new Error('O comprovante deve ser PDF, JPG, PNG ou WEBP.'));
    cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const ok = mime === 'video/mp4' || name.endsWith('.mp4');
    if (!ok) return cb(new Error('Somente vídeo MP4 é permitido para o percurso.'));
    cb(null, true);
  },
});

function jwtSecret() {
  const secret = process.env.EVENTOS_JWT_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('EVENTOS_JWT_SECRET/JWT_SECRET ausente em produção.');
  }
  return 'axoriin-eventos-dev-only-change-me';
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function safeText(v, max = 500) {
  return String(v || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

function isValidCpf(v) {
  const cpf = onlyDigits(v);
  if (!cpf) return true;
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base, factor) => {
    let total = 0;
    for (const d of base) total += Number(d) * factor--;
    const r = (total * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function passwordOk(v) {
  const s = String(v || '');
  return s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);
}

function tokenFromReq(req) {
  const auth = String(req.headers.authorization || '');
  return req.cookies?.[COOKIE_NAME] || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
}

function signAccount(account) {
  return jwt.sign({
    scope: 'evento-participante',
    accountId: String(account._id),
    eventSlug: account.eventSlug,
  }, jwtSecret(), { expiresIn: '7d' });
}

function setAccountCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_WEEK,
    path: '/',
  });
}

async function participantAuth(req, res, next) {
  try {
    const raw = tokenFromReq(req);
    if (!raw) return res.status(401).json({ mensagem: 'Faça login para continuar.' });
    const payload = jwt.verify(raw, jwtSecret());
    if (payload.scope !== 'evento-participante' || payload.eventSlug !== EVENT_SLUG) {
      return res.status(401).json({ mensagem: 'Sessão inválida.' });
    }
    const account = await EventoConta.findOne({ _id: payload.accountId, eventSlug: EVENT_SLUG, ativo: true }).lean();
    if (!account) return res.status(401).json({ mensagem: 'Conta não encontrada.' });
    req.eventAccount = account;
    next();
  } catch (_e) {
    return res.status(401).json({ mensagem: 'Sessão expirada. Entre novamente.' });
  }
}

function adminRole(req, res, next) {
  const u = req.usuario || {};
  const role = String(u.tipo || u.perfil || u.role || u.cargo || '').toLowerCase();
  const ok = ['admin', 'master', 'superadmin', 'coorden', 'diretor', 'direção', 'direcao'].some(k => role.includes(k));
  if (!ok) return res.status(403).json({ mensagem: 'Acesso administrativo necessário.' });
  next();
}

function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = String(req.headers.origin || '');
  if (!origin) return next();
  try {
    const o = new URL(origin);
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (o.hostname.toLowerCase() !== host && !['localhost', '127.0.0.1'].includes(o.hostname)) {
      return res.status(403).json({ mensagem: 'Origem não permitida.' });
    }
  } catch {
    return res.status(403).json({ mensagem: 'Origem inválida.' });
  }
  next();
}

const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const key = `${req.ip}:${Math.floor(Date.now() / (15 * 60 * 1000))}`;
  const n = (authAttempts.get(key) || 0) + 1;
  authAttempts.set(key, n);
  if (n > 15) return res.status(429).json({ mensagem: 'Muitas tentativas. Tente novamente em alguns minutos.' });
  if (authAttempts.size > 5000) authAttempts.clear();
  next();
}

function sha256(v) {
  return crypto.createHash('sha256').update(String(v || '')).digest('hex');
}

function maskEmail(v) {
  const email = normalizeEmail(v);
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const shown = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${shown}@${domain}`;
}

function publicBaseUrl(req) {
  const explicit = String(process.env.EVENTOS_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const requestHost = String(req.get('host') || '').trim();
  if (requestHost) return `${req.protocol}://${requestHost}`;
  const render = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (render) return render;
  return 'http://localhost:5000';
}

function mailPayload(to, confirmationUrl, name) {
  const safeName = safeText(name, 120) || 'participante';
  const subject = 'Confirme seu e-mail - Corrida CMDPII-CZS 2ª edição';
  const text = [
    `Olá, ${safeName}.`,
    '',
    'Recebemos seu cadastro na Central do Participante da Corrida CMDPII-CZS 2ª edição.',
    'Confirme seu e-mail para ativar a conta:',
    confirmationUrl,
    '',
    'Este link expira em 24 horas. Se você não solicitou este cadastro, ignore esta mensagem.',
    '',
    'Axoriin Eventos'
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#061326;font-family:Arial,sans-serif;color:#eaf6ff"><div style="max-width:620px;margin:0 auto;padding:34px 22px"><div style="background:#081d37;border:1px solid #1ecff2;border-radius:18px;padding:30px"><div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#31d7ff">AXORIIN EVENTOS</div><h1 style="font-size:26px;color:#fff">Confirme seu e-mail</h1><p>Olá, ${safeName}.</p><p>Recebemos seu cadastro na <strong>Central do Participante</strong> da Corrida CMDPII-CZS 2ª edição.</p><p>Para ativar sua conta e continuar a inscrição, confirme o endereço de e-mail:</p><p style="margin:28px 0"><a href="${confirmationUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#31d7ff;color:#02101a;text-decoration:none;font-weight:700">Confirmar meu e-mail</a></p><p style="font-size:13px;color:#a9bbd1">O link expira em 24 horas. Se você não solicitou este cadastro, ignore esta mensagem.</p></div></div></body></html>`;
  return { to, subject, text, html };
}

async function tryExistingMailer(payload) {
  let mod = null;
  try { mod = require('../../utils/mailer'); } catch {}

  const invoke = async (fn, ctx, mode = 'custom') => {
    if (mode === 'transporter') return fn.call(ctx, { from: process.env.MAIL_FROM || process.env.MAIL_USER, ...payload });
    if (fn.length >= 4) return fn.call(ctx, payload.to, payload.subject, payload.text, payload.html);
    if (fn.length === 3) return fn.call(ctx, payload.to, payload.subject, payload.html);
    return fn.call(ctx, payload);
  };

  const candidates = [];
  if (mod) {
    for (const name of ['sendEmail', 'enviarEmail', 'sendMail', 'enviar']) {
      if (typeof mod[name] === 'function') candidates.push({ fn: mod[name], ctx: mod, label: `utils/mailer.${name}` });
    }
    if (mod.transporter && typeof mod.transporter.sendMail === 'function') {
      candidates.push({ fn: mod.transporter.sendMail, ctx: mod.transporter, label: 'utils/mailer.transporter.sendMail', mode: 'transporter' });
    }
  }

  const gm = global.mensageria;
  if (gm) {
    for (const name of ['sendEmail', 'enviarEmail']) {
      if (typeof gm[name] === 'function') candidates.push({ fn: gm[name], ctx: gm, label: `mensageria.${name}` });
    }
    if (gm.email) {
      for (const name of ['send', 'enviar', 'sendEmail', 'enviarEmail']) {
        if (typeof gm.email[name] === 'function') candidates.push({ fn: gm.email[name], ctx: gm.email, label: `mensageria.email.${name}` });
      }
    }
  }

  if (!candidates.length) return { handled: false };
  const c = candidates[0];
  await invoke(c.fn, c.ctx, c.mode);
  return { handled: true, provider: c.label };
}

async function sendViaSmtpFallback(payload) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { throw new Error('Nodemailer não disponível.'); }

  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || '';
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.MAIL_PASSWORD || process.env.MAIL_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || '';
  const from = process.env.EVENTOS_EMAIL_FROM || process.env.MAIL_FROM || user;
  if (!host || !user || !pass || !from) throw new Error('Configuração SMTP incompleta.');

  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureEnv ? ['1','true','yes','sim'].includes(secureEnv) : port === 465;
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({ from, ...payload });
  return { provider: 'smtp-direto' };
}

async function sendEventEmail(payload) {
  const disabled = String(process.env.MAIL_ENABLED || '').toLowerCase();
  if (['0','false','no','nao','não'].includes(disabled)) throw new Error('Envio de e-mail está desativado no Axoriin.');
  const existing = await tryExistingMailer(payload);
  if (existing.handled) return existing;
  return sendViaSmtpFallback(payload);
}

async function createAndSendEmailConfirmation(req, account) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  account.emailConfirmTokenHash = sha256(rawToken);
  account.emailConfirmExpiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000);
  account.emailConfirmEnviadoEm = new Date();
  account.emailConfirmado = false;
  account.emailConfirmadoEm = null;
  await account.save();

  const confirmationUrl = `${publicBaseUrl(req)}/api/eventos/${EVENT_SLUG}/auth/confirmar-email?token=${encodeURIComponent(rawToken)}`;
  return sendEventEmail(mailPayload(account.email, confirmationUrl, account.nome));
}

async function sendRegistrationStatusEmail(req, account, participant, inscription, type) {
  if (!account?.email) return;
  const map = {
    comprovante: ['Comprovante recebido', `Recebemos o comprovante de ${participant.nome}. A inscrição está em análise pela organização.`],
    aprovado: ['Inscrição deferida', `Pagamento confirmado. ${participant.nome} está inscrito(a) com sucesso na Corrida CMDPII-CZS 2ª edição.`],
    recusado: ['Comprovante precisa de revisão', `O comprovante de ${participant.nome} não pôde ser validado. Acesse sua conta para consultar a observação e enviar um novo arquivo.`],
  };
  const entry = map[type]; if (!entry) return;
  const subject = `${entry[0]} - Corrida CMDPII-CZS 2ª edição`;
  const accountUrl = `${publicBaseUrl(req)}/eventos/${EVENT_SLUG}/minha-conta.html`;
  const text = `${entry[1]}\n\nAcesse: ${accountUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#081d37;color:#eaf6ff;padding:28px;border-radius:16px"><h2 style="color:#31d7ff">${entry[0]}</h2><p>${entry[1]}</p><p><b>Categoria:</b> ${safeText(inscription.categoriaNome,120)}</p><p><b>Valor:</b> ${moneyBRL(inscription.valorCentavos)}</p><p><a href="${accountUrl}" style="color:#31d7ff">Abrir Central do Participante</a></p></div>`;
  try { await sendEventEmail({ to: account.email, subject, text, html }); } catch (e) { console.warn('[eventos/email-status]', e?.message || e); }
}

const V120_CATEGORIES = [
  { key: 'fundamental-regular', nome: 'Ensino Fundamental II Regular', descricao: 'Alunos do Ensino Fundamental II • turno da manhã.', premiacao: '1º, 2º e 3º • Masculino e Feminino', ativo: true },
  { key: 'fundamental-aee', nome: 'Ensino Fundamental II AEE', descricao: 'Alunos do Ensino Fundamental II que optarem pela categoria AEE • turno da manhã.', premiacao: '1º, 2º e 3º • Masculino e Feminino', ativo: true },
  { key: 'medio-regular', nome: 'Ensino Médio Regular', descricao: 'Alunos do Ensino Médio • turno da tarde.', premiacao: '1º, 2º e 3º • Masculino e Feminino', ativo: true },
  { key: 'medio-aee', nome: 'Ensino Médio AEE', descricao: 'Alunos do Ensino Médio que optarem pela categoria AEE • turno da tarde.', premiacao: '1º, 2º e 3º • Masculino e Feminino', ativo: true },
  { key: 'servidores', nome: 'Servidores/Colaboradores', descricao: 'Servidores e colaboradores do CMDPII/CZS.', premiacao: '1º e 2º • Masculino e Feminino', ativo: true },
  { key: 'comunidade-1', nome: 'Comunidade Escolar I', descricao: 'Pais e mães de alunos e cônjuges de servidores/colaboradores.', premiacao: '1º e 2º • Masculino e Feminino', ativo: true },
  { key: 'comunidade-2', nome: 'Comunidade Escolar II', descricao: 'Egressos, filhos de Bombeiros, filhos de servidores/colaboradores e irmãos/irmãs de alunos.', premiacao: '1º e 2º • Masculino e Feminino', ativo: true },
  { key: 'pcd', nome: 'PCD', descricao: 'Atletas PCD pertencentes aos públicos autorizados no regulamento.', premiacao: '1º e 2º • Masculino e Feminino', ativo: true },
];

const HISTORICAL_PHOTOS = [
  { mediaId: 'hist-img-9293', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_9293.webp`, categoria: 'comunidade', legenda: 'Nossa comunidade • edição anterior' },
  { mediaId: 'hist-img-9121', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_9121.webp`, categoria: 'percurso', legenda: 'Atletas em ação' },
  { mediaId: 'hist-img-9206', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_9206.webp`, categoria: 'podio', legenda: 'Conquistas' },
  { mediaId: 'hist-img-8853', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/hero-banner-principal.png`, categoria: 'chegada', legenda: 'Largada e chegada' },
  { mediaId: 'hist-img-9256', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_9256.webp`, categoria: 'podio', legenda: 'Premiação' },
  { mediaId: 'hist-img-9231', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_9231.webp`, categoria: 'comunidade', legenda: 'Comunidade' },
  { mediaId: 'hist-img-8840', storageUrl: `/eventos/${EVENT_SLUG}/assets/img/evento/IMG_8840.webp`, categoria: 'geral', legenda: 'Preparação' },
];

async function ensureHistoricalPhotos(cfg) {
  if (cfg.galeriaHistoricaInicializada) return;
  for (const item of HISTORICAL_PHOTOS) {
    await EventoFoto.updateOne(
      { eventSlug: EVENT_SLUG, mediaId: item.mediaId },
      { $setOnInsert: {
        eventSlug: EVENT_SLUG, mediaId: item.mediaId, filename: item.storageUrl.split('/').pop(), mimeType: 'image/webp',
        storageProvider: 'static', storageKey: '', storageUrl: item.storageUrl, origem: 'historico',
        bibNumbers: [], participantIds: [], accountIds: [], categoria: item.categoria, visibilidade: 'publica', legenda: item.legenda, ativo: true,
      } },
      { upsert: true }
    );
  }
  cfg.galeriaHistoricaInicializada = true;
  await cfg.save();
}

function needsV131Migration(cfg) {
  return Number(cfg.schemaVersion || 0) < 137;
}

function needsV130Migration(cfg) {
  const keys = (cfg.categorias || []).map(c => c.key);
  const directFirefighter = (cfg.publicoPermitido || []).some(x => /bombeiros? militares?/i.test(String(x || '')) && !/filhos?/i.test(String(x || '')));
  return Number(cfg.schemaVersion || 0) < 130 || keys.includes('bombeiros') || directFirefighter || keys.some(k => ['infantil','juvenil','adulto','comunidade'].includes(k));
}

async function ensureConfig() {
  let cfg = await EventoConfig.findOne({ slug: EVENT_SLUG });
  if (!cfg) cfg = await EventoConfig.create({ slug: EVENT_SLUG });
  if (needsV130Migration(cfg)) {
    cfg.schemaVersion = 137;
    cfg.categorias = V120_CATEGORIES;
    if (!cfg.eventDate) cfg.eventDate = new Date('2026-11-22T22:00:00.000Z');
    cfg.categoryReferenceDate = new Date('2026-11-22T12:00:00.000Z');
    if (!cfg.dataLabel || cfg.dataLabel === 'Novembro de 2026') cfg.dataLabel = '22 de novembro de 2026 • largada às 17h';
    if (!cfg.local || cfg.local === 'Cruzeiro do Sul - AC') cfg.local = 'Colégio Militar Dom Pedro II • Cruzeiro do Sul - AC';
    cfg.resumoCategorias = 'Fundamental II, Ensino Médio, AEE, PCD, servidores e comunidade escolar';
    cfg.resumoPremiacao = 'Premiação por categoria e sexo';
    cfg.premioDescricao = 'Troféus conforme o regulamento e medalha de finisher aos concluintes.';
    cfg.publicoPermitido = ['Alunos do CMDPII/CZS','Pais e mães de alunos','Irmãos e irmãs de alunos','Ex-alunos (egressos)','Servidores e colaboradores','Cônjuges e filhos de servidores/colaboradores','Comunidade Escolar II'];
    if (!cfg.fraseLateral || cfg.fraseLateral === 'Juntos corremos mais longe.') cfg.fraseLateral = 'Correndo uma comunidade mais forte.';
    if (!cfg.subtitulo || cfg.subtitulo === 'Inscrições, regulamento, kit do atleta, pagamento, resultados e galeria em um só lugar.') cfg.subtitulo = 'Mais que uma corrida, um encontro da nossa comunidade. Esporte, educação e um futuro em movimento.';
    cfg.kitItems = ['Camiseta oficial com manga','Número de peito oficial','Estrutura pós-corrida','Medalha metálica de finisher (entregue somente no dia da corrida, após a conclusão da prova)'];
    if (!Array.isArray(cfg.lotes) || !cfg.lotes.length) cfg.lotes = [
      { key: 'promocional', nome: 'Lote Promocional', inicio: new Date('2026-09-24T05:00:00.000Z'), fim: new Date('2026-10-10T04:59:59.999Z'), valorCentavos: 7500, ativo: true },
      { key: 'normal', nome: 'Lote Normal', inicio: new Date('2026-10-10T05:00:00.000Z'), fim: null, valorCentavos: 9000, ativo: true },
    ];
    if (!Array.isArray(cfg.camisetas) || !cfg.camisetas.length) cfg.camisetas = ['PP','P','M','G','GG','XG'].map(tamanho => ({ tamanho, estoque: null, ativo: true }));
    cfg.markModified('categorias'); cfg.markModified('lotes'); cfg.markModified('camisetas'); cfg.markModified('kitItems'); cfg.markModified('publicoPermitido');
    await cfg.save();
  }
  if (needsV131Migration(cfg)) {
    cfg.schemaVersion = 137;
    if (!cfg.bannerStorageProvider && cfg.bannerMediaId) cfg.bannerStorageProvider = 'gridfs';
    await cfg.save();
  }
  await ensureHistoricalPhotos(cfg);
  return cfg;
}

function moneyBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function activeLots(cfg) {
  return (cfg.lotes || []).filter(x => x.ativo !== false).sort((a,b) => new Date(a.inicio || 0) - new Date(b.inicio || 0));
}

function lotForDate(cfg, when = new Date()) {
  const lots = activeLots(cfg);
  if (!lots.length) return null;
  const t = new Date(when).getTime();
  const matched = lots.find(l => (!l.inicio || t >= new Date(l.inicio).getTime()) && (!l.fim || t <= new Date(l.fim).getTime()));
  if (matched) return matched;
  if (lots[0]?.inicio && t < new Date(lots[0].inicio).getTime()) return lots[0];
  return lots[lots.length - 1];
}

function publicConfig(cfg) {
  const c = cfg.toObject ? cfg.toObject() : cfg;
  return {
    slug: c.slug, schemaVersion: c.schemaVersion, publicado: c.publicado, inscricoesAbertas: c.inscricoesAbertas !== false,
    titulo: c.titulo, subtitulo: c.subtitulo, destaque: c.destaque, ctaPrincipal: c.ctaPrincipal, ctaSecundario: c.ctaSecundario,
    dataLabel: c.dataLabel, eventDate: c.eventDate, categoryReferenceDate: c.categoryReferenceDate, local: c.local, percursoLabel: c.percursoLabel,
    resumoCategorias: c.resumoCategorias, resumoPremiacao: c.resumoPremiacao, premioDescricao: c.premioDescricao,
    sponsorMessage: c.sponsorMessage, sponsorSubMessage: c.sponsorSubMessage, contatoEmail: c.contatoEmail, contatoTelefone: c.contatoTelefone,
    fraseLateral: c.fraseLateral, regulamentoTexto: c.regulamentoTexto,
    regulamentoPdfDisponivel: Boolean(c.regulamentoPdfMediaId && c.regulamentoPdfPublicado),
    regulamentoPdfNome: c.regulamentoPdfNome || 'regulamento.pdf',
    regulamentoPdfUrl: c.regulamentoPdfMediaId && c.regulamentoPdfPublicado ? `/api/eventos/${EVENT_SLUG}/regulamento.pdf` : '',
    regulamentoPdfAtualizadoEm: c.regulamentoPdfAtualizadoEm || null,
    kitItems: c.kitItems || [], publicoPermitido: (c.publicoPermitido || []).filter(x => !(/bombeiros? militares?/i.test(String(x || '')) && !/filhos?/i.test(String(x || '')))), camisetas: (c.camisetas || []).filter(x => x.ativo !== false),
    categorias: (c.categorias || []).filter(x => x.ativo !== false && x.key !== 'bombeiros'),
    lotes: activeLots(c).map(l => ({ key:l.key, nome:l.nome, inicio:l.inicio, fim:l.fim, valorCentavos:l.valorCentavos, valorLabel:moneyBRL(l.valorCentavos) })),
    pagamento: { modo: c.pagamento?.modo === 'sicoob_api' && c.pagamento?.sicoobApiAtiva ? 'sicoob_api' : 'manual', modoConfigurado: c.pagamento?.modo || 'manual', banco: c.pagamento?.banco || 'Sicoob', favorecido: c.pagamento?.favorecido || '', instrucoes: c.pagamento?.instrucoes || '', sicoobApiAtiva: Boolean(c.pagamento?.sicoobApiAtiva) },
    certificado: c.certificado, medalha: c.medalha,
    bannerUrl: c.bannerMediaId ? `/api/eventos/${EVENT_SLUG}/media/${c.bannerMediaId}?v=${new Date(c.updatedAt || Date.now()).getTime()}` : `/eventos/${EVENT_SLUG}/assets/img/evento/hero-banner-principal.png`,
    bannerInternoUrl: c.bannerInternoMediaId ? `/api/eventos/${EVENT_SLUG}/media/${c.bannerInternoMediaId}?v=${new Date(c.updatedAt || Date.now()).getTime()}` : `/eventos/${EVENT_SLUG}/assets/img/evento/hero-banner-interno.png`,
    percursoVideoUrl: c.percursoVideoMediaId ? `/api/eventos/${EVENT_SLUG}/media/${c.percursoVideoMediaId}?v=${new Date(c.percursoVideoAtualizadoEm || c.updatedAt || Date.now()).getTime()}` : `/eventos/${EVENT_SLUG}/assets/media/percurso-oficial.mp4`,
    percursoVideoCustomizado: Boolean(c.percursoVideoMediaId),
    percursoVideoNome: c.percursoVideoNome || 'percurso-oficial.mp4',
    percursoVideoAtualizadoEm: c.percursoVideoAtualizadoEm || null,
  };
}

function participantPaymentConfig(cfg) {
  const lot = lotForDate(cfg);
  return {
    modo: cfg.pagamento?.modo === 'sicoob_api' && cfg.pagamento?.sicoobApiAtiva ? 'sicoob_api' : 'manual', banco: cfg.pagamento?.banco || 'Sicoob', chavePix: cfg.pagamento?.chavePix || '',
    favorecido: cfg.pagamento?.favorecido || '', instrucoes: cfg.pagamento?.instrucoes || '', comprovanteObrigatorio: cfg.pagamento?.comprovanteObrigatorio !== false,
    sicoobApiAtiva: Boolean(cfg.pagamento?.sicoobApiAtiva), loteAtual: lot ? { key:lot.key, nome:lot.nome, valorCentavos:lot.valorCentavos, valorLabel:moneyBRL(lot.valorCentavos) } : null,
  };
}

function adminConfig(cfg) {
  const base = publicConfig(cfg);
  return {
    ...base,
    updatedAt: cfg.updatedAt || null,
    termoVersao: cfg.termoVersao || '',
    publicoPermitido: cfg.publicoPermitido || [],
    pagamento: {
      ...base.pagamento,
      chavePix: cfg.pagamento?.chavePix || '',
      comprovanteObrigatorio: cfg.pagamento?.comprovanteObrigatorio !== false,
    },
    camisetas: cfg.camisetas || [],
    lotes: (cfg.lotes || []).map(l => ({ key:l.key, nome:l.nome, inicio:l.inicio, fim:l.fim, valorCentavos:l.valorCentavos, ativo:l.ativo !== false })),
    categorias: cfg.categorias || [],
    storage: publicStorageStatus(),
  };
}

function bannerMediaRef(cfg) {
  return {
    mediaId: String(cfg?.bannerMediaId || ''),
    storageProvider: cfg?.bannerStorageProvider || (cfg?.bannerMediaId ? 'gridfs' : ''),
    storageKey: cfg?.bannerStorageKey || '',
    storageUrl: cfg?.bannerStorageUrl || '',
  };
}

function bannerInternoMediaRef(cfg) {
  return {
    mediaId: String(cfg?.bannerInternoMediaId || ''),
    storageProvider: cfg?.bannerInternoStorageProvider || (cfg?.bannerInternoMediaId ? 'gridfs' : ''),
    storageKey: cfg?.bannerInternoStorageKey || '',
    storageUrl: cfg?.bannerInternoStorageUrl || '',
  };
}

function percursoVideoMediaRef(cfg) {
  return {
    mediaId: String(cfg?.percursoVideoMediaId || ''),
    storageProvider: cfg?.percursoVideoStorageProvider || (cfg?.percursoVideoMediaId ? 'gridfs' : ''),
    storageKey: cfg?.percursoVideoStorageKey || '',
    storageUrl: cfg?.percursoVideoStorageUrl || '',
  };
}

function photoMediaRef(photo) {
  return {
    mediaId: String(photo?.mediaId || ''),
    storageProvider: photo?.storageProvider || 'gridfs',
    storageKey: photo?.storageKey || '',
    storageUrl: photo?.storageUrl || '',
  };
}

function ageOnDate(birth, ref) {
  const b = new Date(birth); const r = new Date(ref);
  let age = r.getUTCFullYear() - b.getUTCFullYear();
  const m = r.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

function categoryForParticipant(participant, cfg) {
  const sexo = participant.sexo;
  if (!['masculino','feminino'].includes(sexo)) return { error: 'Selecione Masculino ou Feminino para a categoria competitiva.' };
  let base = null;
  if (participant.enquadramento === 'pcd' || participant.pcd) base = 'pcd';
  else if (participant.vinculo === 'aluno') {
    if (!['fundamental2','medio'].includes(participant.etapaEnsino)) return { error: 'Informe a etapa de ensino do aluno.' };
    if (participant.enquadramento === 'aee' || participant.aee) base = participant.etapaEnsino === 'fundamental2' ? 'fundamental-aee' : 'medio-aee';
    else base = participant.etapaEnsino === 'fundamental2' ? 'fundamental-regular' : 'medio-regular';
  } else if (participant.vinculo === 'servidor') base = 'servidores';
  else if (['pai','mae','conjuge_servidor'].includes(participant.vinculo)) base = 'comunidade-1';
  else if (['irmao','irma','egresso','filho_servidor','filho_bombeiro'].includes(participant.vinculo)) base = 'comunidade-2';
  if (!base) return { error: 'Vínculo sem categoria competitiva configurada.' };
  const cat = (cfg.categorias || []).find(c => c.key === base && c.ativo !== false);
  if (!cat) return { error: 'Categoria indisponível no momento.' };
  const sexoLabel = sexo === 'masculino' ? 'Masculino' : 'Feminino';
  return { key: `${base}-${sexo}`, nome: `${cat.nome} — ${sexoLabel}`, baseKey: base, cat };
}

function bucket() {
  if (!mongoose.connection.db) throw new Error('MongoDB ainda não conectado.');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'evento_media' });
}

async function saveGridFile(file, metadata = {}) {
  return new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(file.originalname || `imagem-${Date.now()}`, {
      contentType: file.mimetype,
      metadata: { ...metadata, eventSlug: EVENT_SLUG },
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve(String(stream.id)));
    stream.end(file.buffer);
  });
}

async function streamGridFile(res, id, options = {}) {
  if (!mongoose.isValidObjectId(id)) return res.status(404).end();
  const oid = new mongoose.Types.ObjectId(id);
  const files = await mongoose.connection.db.collection('evento_media.files').find({ _id: oid }).limit(1).toArray();
  if (!files.length) return res.status(404).end();
  res.setHeader('Content-Type', files[0].contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', options.publicCache ? 'public, max-age=3600' : 'private, max-age=3600');
  if (options.filename) {
    const safeName = String(options.filename).replace(/[\r\n"\\]/g, '_');
    res.setHeader('Content-Disposition', `${options.download ? 'attachment' : 'inline'}; filename="${safeName}"`);
  }
  bucket().openDownloadStream(oid).on('error', () => { if (!res.headersSent) res.status(404).end(); }).pipe(res);
}

async function deleteGridFile(id) {
  if (!id || !mongoose.isValidObjectId(id)) return;
  try { await bucket().delete(new mongoose.Types.ObjectId(id)); } catch (e) { console.warn('[eventos/gridfs/delete]', e?.message || e); }
}

async function nextBib() {
  const c = await EventoCounter.findOneAndUpdate(
    { eventSlug: EVENT_SLUG, key: 'bib' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return String(c.seq).padStart(4, '0');
}

function medalFromPosition(pos, status) {
  if (status !== 'concluido') return 'nenhuma';
  if (Number(pos) === 1) return 'ouro';
  if (Number(pos) === 2) return 'prata';
  if (Number(pos) === 3) return 'bronze';
  return 'participacao';
}

function parseTimeMs(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const p = s.split(':').map(Number);
  if (p.some(n => !Number.isFinite(n))) return null;
  if (p.length === 3) return ((p[0] * 3600) + (p[1] * 60) + p[2]) * 1000;
  if (p.length === 2) return ((p[0] * 60) + p[1]) * 1000;
  return null;
}

router.use(sameOrigin);

router.get(`/${EVENT_SLUG}/public`, async (_req, res) => {
  try {
    const cfg = await ensureConfig();
    res.set('Cache-Control', 'no-store');
    res.json(publicConfig(cfg));
  } catch (e) {
    console.error('[eventos/public]', e);
    res.status(500).json({ mensagem: 'Não foi possível carregar o evento.' });
  }
});

router.get(`/${EVENT_SLUG}/resultados`, async (req, res) => {
  try {
    const query = safeText(req.query.q, 100);
    const categoria = safeText(req.query.categoria, 50);
    const filter = { eventSlug: EVENT_SLUG, publicado: true };
    const results = await EventoResultado.find(filter).sort({ colocacaoGeral: 1, tempoMs: 1 }).limit(500).lean();
    const ids = results.map(r => r.inscriptionId);
    const inscriptions = (await EventoInscricao.find({ _id: { $in: ids }, 'consent.publicResult': true }).lean()).filter(i => !String(i.categoriaKey || '').startsWith('bombeiros-'));
    const allowed = new Map(inscriptions.map(i => [String(i._id), i]));
    const participants = await EventoParticipante.find({ _id: { $in: inscriptions.map(i => i.participantId) } }).select('nome').lean();
    const pmap = new Map(participants.map(p => [String(p._id), p.nome]));

    let out = results.filter(r => allowed.has(String(r.inscriptionId))).map(r => {
      const ins = allowed.get(String(r.inscriptionId));
      return {
        numeroPeito: r.numeroPeito,
        participante: pmap.get(String(ins.participantId)) || 'Participante',
        categoria: ins.categoriaNome,
        tempo: r.tempoTexto,
        colocacaoGeral: r.colocacaoGeral,
        colocacaoCategoria: r.colocacaoCategoria,
        status: r.status,
      };
    });
    if (categoria) out = out.filter(x => x.categoria === categoria);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(x => x.participante.toLowerCase().includes(q) || x.numeroPeito.includes(q));
    }
    res.json({ total: out.length, resultados: out.slice(0, 250) });
  } catch (e) {
    console.error('[eventos/resultados]', e);
    res.status(500).json({ mensagem: 'Não foi possível consultar os resultados.' });
  }
});

router.get(`/${EVENT_SLUG}/media/:id`, async (req, res) => {
  try {
    const cfg = await ensureConfig();
    if (String(cfg.bannerMediaId || '') === req.params.id) {
      return streamEventMedia(res, bannerMediaRef(cfg), { publicCache: true });
    }
    if (String(cfg.bannerInternoMediaId || '') === req.params.id) {
      return streamEventMedia(res, bannerInternoMediaRef(cfg), { publicCache: true });
    }
    if (String(cfg.percursoVideoMediaId || '') === req.params.id) {
      return streamEventMedia(res, percursoVideoMediaRef(cfg), { publicCache: true, contentType: 'video/mp4', filename: cfg.percursoVideoNome || 'percurso.mp4', range: req.headers.range || '' });
    }
    if (cfg.regulamentoPdfPublicado && String(cfg.regulamentoPdfMediaId || '') === req.params.id) {
      return streamGridFile(res, req.params.id, { filename: cfg.regulamentoPdfNome || 'regulamento.pdf' });
    }

    const photo = await EventoFoto.findOne({ eventSlug: EVENT_SLUG, mediaId: req.params.id, ativo: true }).lean();
    if (!photo) return res.status(404).end();
    if (photo.visibilidade === 'publica') return streamEventMedia(res, photoMediaRef(photo), { publicCache: true });

    const raw = tokenFromReq(req);
    if (!raw) return res.status(401).end();
    const payload = jwt.verify(raw, jwtSecret());
    if (payload.scope !== 'evento-participante' || payload.eventSlug !== EVENT_SLUG) return res.status(403).end();
    if (!(photo.accountIds || []).some(id => String(id) === String(payload.accountId))) return res.status(403).end();
    return streamEventMedia(res, photoMediaRef(photo));
  } catch (_e) {
    return res.status(404).end();
  }
});

router.get(`/${EVENT_SLUG}/fotos/publicas`, async (req, res) => {
  try {
    await ensureConfig();
    const categoria = safeText(req.query.categoria, 30);
    const filter = { eventSlug: EVENT_SLUG, ativo: true, visibilidade: 'publica' };
    if (categoria && categoria !== 'todas') filter.categoria = categoria;
    const photos = await EventoFoto.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ fotos: photos.map(f => ({
      _id: f._id, mediaId: f.mediaId, categoria: f.categoria, legenda: f.legenda, origem: f.origem || 'upload',
      url: `/api/eventos/${EVENT_SLUG}/media/${encodeURIComponent(f.mediaId)}?v=${new Date(f.updatedAt || f.createdAt || Date.now()).getTime()}`
    })) });
  } catch (e) {
    console.error('[eventos/fotos/publicas]', e);
    res.status(500).json({ mensagem: 'Não foi possível carregar a galeria pública.' });
  }
});

router.get(`/${EVENT_SLUG}/regulamento.pdf`, async (req, res) => {
  try {
    const cfg = await ensureConfig();
    if (!cfg.regulamentoPdfPublicado || !cfg.regulamentoPdfMediaId) return res.status(404).send('Regulamento em PDF ainda não publicado.');
    const download = String(req.query.download || '') === '1';
    return streamGridFile(res, cfg.regulamentoPdfMediaId, { filename: cfg.regulamentoPdfNome || 'regulamento.pdf', download });
  } catch (e) {
    console.error('[eventos/regulamento.pdf]', e);
    return res.status(500).send('Não foi possível abrir o regulamento.');
  }
});

router.post(`/${EVENT_SLUG}/auth/cadastro`, authRateLimit, async (req, res) => {
  try {
    const nome = safeText(req.body.nome, 120);
    const email = normalizeEmail(req.body.email);
    // A conta da Corrida e independente dos cadastros internos do Axoriin.
    // CPF sera informado e validado somente no participante/inscricao.
    const telefone = onlyDigits(req.body.telefone).slice(0, 15);
    const senha = String(req.body.senha || '');

    if (nome.length < 3 || !isValidEmail(email) || !passwordOk(senha)) {
      return res.status(400).json({
        mensagem: 'Confira nome, e-mail e senha. A senha deve ter 8+ caracteres, mai\u00fascula, min\u00fascula e n\u00famero.'
      });
    }

    const exists = await EventoConta.findOne({
      eventSlug: EVENT_SLUG,
      email
    }).select('+emailConfirmTokenHash');
    if (exists) {
      if (exists.email === email && exists.emailConfirmado === false) {
        try {
          await createAndSendEmailConfirmation(req, exists);
          return res.status(200).json({ ok: true, requiresEmailConfirmation: true, email: maskEmail(email), mensagem: 'Conta já criada. Enviamos um novo link de confirmação para seu e-mail.' });
        } catch (mailErr) {
          console.error('[eventos/cadastro/reenvio-email]', mailErr);
          return res.status(503).json({ ok: false, code: 'EMAIL_SEND_FAILED', requiresEmailConfirmation: true, email: maskEmail(email), mensagem: 'A conta já existe, mas não foi possível enviar a confirmação agora. Tente reenviar em instantes.' });
        }
      }
      return res.status(409).json({
        code: 'EMAIL_ALREADY_REGISTERED',
        mensagem: 'Ja existe uma conta da Corrida com este e-mail. Entre na sua conta ou utilize a recuperacao de senha.'
      });
    }

    const account = await EventoConta.create({
      eventSlug: EVENT_SLUG,
      nome,
      email,

      telefone,
      senhaHash: await bcrypt.hash(senha, 12),
      emailConfirmado: false,
    });

    try {
      const sent = await createAndSendEmailConfirmation(req, account);
      return res.status(201).json({
        ok: true,
        requiresEmailConfirmation: true,
        email: maskEmail(email),
        emailProvider: sent?.provider || undefined,
        mensagem: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.'
      });
    } catch (mailErr) {
      console.error('[eventos/cadastro/email]', mailErr);
      return res.status(503).json({
        ok: false,
        code: 'EMAIL_SEND_FAILED',
        accountCreated: true,
        requiresEmailConfirmation: true,
        email: maskEmail(email),
        mensagem: 'Sua conta foi criada, mas o e-mail de confirmação não pôde ser enviado agora. Use “Reenviar confirmação”.'
      });
    }
  } catch (e) {
    if (e?.code === 11000) {
      const keyPattern = e?.keyPattern || {};
      const keyValue = e?.keyValue || {};

      if (
        keyPattern.email ||
        Object.prototype.hasOwnProperty.call(keyValue, 'email')
      ) {
        return res.status(409).json({
          code: 'EMAIL_ALREADY_REGISTERED',
          mensagem: 'Ja existe uma conta da Corrida com este e-mail. Entre na sua conta ou utilize a recuperacao de senha.'
        });
      }

      if (
        keyPattern.cpf ||
        Object.prototype.hasOwnProperty.call(keyValue, 'cpf')
      ) {
        console.warn(
          '[eventos/cadastro] conflito em indice legado de CPF:',
          keyValue
        );
        return res.status(409).json({
          code: 'LEGACY_ACCOUNT_CPF_CONFLICT',
          mensagem: 'Foi encontrado um conflito em um cadastro antigo da Corrida.'
        });
      }

      return res.status(409).json({
        code: 'ACCOUNT_ALREADY_REGISTERED',
        mensagem: 'Ja existe uma conta da Corrida com estes dados.'
      });
    }
    console.error('[eventos/cadastro]', e);
    res.status(500).json({ mensagem: 'Não foi possível criar a conta.' });
  }
});

router.get(`/${EVENT_SLUG}/auth/confirmar-email`, async (req, res) => {
  try {
    const rawToken = String(req.query.token || '').trim();
    if (!rawToken) return res.redirect(`/eventos/${EVENT_SLUG}/entrar.html?confirmacao=token-ausente`);
    const tokenHash = sha256(rawToken);
    const account = await EventoConta.findOne({
      eventSlug: EVENT_SLUG,
      emailConfirmTokenHash: tokenHash,
      emailConfirmExpiraEm: { $gt: new Date() },
      ativo: true,
    }).select('+emailConfirmTokenHash');
    if (!account) return res.redirect(`/eventos/${EVENT_SLUG}/entrar.html?confirmacao=invalida`);

    account.emailConfirmado = true;
    account.emailConfirmadoEm = new Date();
    account.emailConfirmTokenHash = '';
    account.emailConfirmExpiraEm = null;
    await account.save();
    return res.redirect(`/eventos/${EVENT_SLUG}/entrar.html?confirmado=1`);
  } catch (e) {
    console.error('[eventos/confirmar-email]', e);
    return res.redirect(`/eventos/${EVENT_SLUG}/entrar.html?confirmacao=erro`);
  }
});

router.post(`/${EVENT_SLUG}/auth/reenviar-confirmacao`, authRateLimit, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email || req.body.login);
    if (!isValidEmail(email)) return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
    const account = await EventoConta.findOne({ eventSlug: EVENT_SLUG, email, ativo: true }).select('+emailConfirmTokenHash');
    const generic = { ok: true, mensagem: 'Se houver uma conta pendente para este e-mail, um novo link de confirmação será enviado.' };
    if (!account || account.emailConfirmado !== false) return res.json(generic);

    const minWaitMs = 60 * 1000;
    if (account.emailConfirmEnviadoEm && (Date.now() - new Date(account.emailConfirmEnviadoEm).getTime()) < minWaitMs) {
      return res.status(429).json({ mensagem: 'Aguarde cerca de 1 minuto antes de solicitar outro e-mail.' });
    }
    await createAndSendEmailConfirmation(req, account);
    return res.json({ ok: true, email: maskEmail(email), mensagem: 'Novo link de confirmação enviado. Confira também a caixa de spam.' });
  } catch (e) {
    console.error('[eventos/reenviar-confirmacao]', e);
    return res.status(503).json({ mensagem: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' });
  }
});

router.post(`/${EVENT_SLUG}/auth/login`, authRateLimit, async (req, res) => {
  try {
    const login = String(req.body.login || '').trim();
    const senha = String(req.body.senha || '');
    const email = normalizeEmail(login);
    const cpf = onlyDigits(login);
    const account = await EventoConta.findOne({ eventSlug: EVENT_SLUG, ativo: true, $or: [{ email }, ...(cpf.length === 11 ? [{ cpf }] : [])] }).select('+senhaHash');
    if (!account || !(await bcrypt.compare(senha, account.senhaHash))) {
      return res.status(401).json({ mensagem: 'E-mail/CPF ou senha inválidos.' });
    }
    if (account.emailConfirmado === false) {
      return res.status(403).json({
        code: 'EMAIL_NOT_CONFIRMED',
        requiresEmailConfirmation: true,
        email: maskEmail(account.email),
        mensagem: 'Seu e-mail ainda não foi confirmado. Abra o link enviado para o seu e-mail ou solicite um novo.'
      });
    }
    account.ultimoLoginEm = new Date();
    await account.save();
    setAccountCookie(res, signAccount(account));
    res.json({ ok: true, conta: { id: account._id, nome: account.nome, email: account.email } });
  } catch (e) {
    console.error('[eventos/login]', e);
    res.status(500).json({ mensagem: 'Não foi possível entrar.' });
  }
});

router.post(`/${EVENT_SLUG}/auth/logout`, (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get(`/${EVENT_SLUG}/auth/me`, participantAuth, async (req, res) => {
  res.json({ conta: { id: req.eventAccount._id, nome: req.eventAccount.nome, email: req.eventAccount.email, telefone: req.eventAccount.telefone } });
});

router.get(`/${EVENT_SLUG}/minha-conta`, participantAuth, async (req, res) => {
  try {
    const accountId = req.eventAccount._id;
    const participants = await EventoParticipante.find({ eventSlug: EVENT_SLUG, accountId, ativo: true }).sort({ createdAt: 1 }).lean();
    const inscriptions = await EventoInscricao.find({ eventSlug: EVENT_SLUG, accountId, status: { $ne: 'cancelada' } }).lean();
    const results = await EventoResultado.find({ eventSlug: EVENT_SLUG, inscriptionId: { $in: inscriptions.map(i => i._id) } }).lean();
    const photosCount = await EventoFoto.countDocuments({ eventSlug: EVENT_SLUG, accountIds: accountId, ativo: true });
    const rmap = new Map(results.map(r => [String(r.inscriptionId), r]));
    const imap = new Map(inscriptions.map(i => [String(i.participantId), { ...i, resultado: rmap.get(String(i._id)) || null }]));
    const cfg = await ensureConfig();
    res.json({
      conta: { id: accountId, nome: req.eventAccount.nome, email: req.eventAccount.email, telefone: req.eventAccount.telefone },
      participantes: participants.map(p => ({ ...p, inscricao: imap.get(String(p._id)) || null })),
      indicadores: {
        solicitacoes: inscriptions.length,
        inscritos: inscriptions.filter(i => i.status === 'confirmada').length,
        emAnalise: inscriptions.filter(i => i.status === 'pagamento_em_analise').length,
        kitRetirado: inscriptions.filter(i => i.kit?.status === 'retirado').length,
        resultados: results.length,
        fotos: photosCount,
        certificados: results.filter(r => r.status === 'concluido').length,
      },
      kitItems: cfg.kitItems || [],
      pagamento: participantPaymentConfig(cfg),
    });
  } catch (e) {
    console.error('[eventos/minha-conta]', e);
    res.status(500).json({ mensagem: 'Não foi possível carregar sua conta.' });
  }
});

router.post(`/${EVENT_SLUG}/participantes`, participantAuth, async (req, res) => {
  try {
    const nome = safeText(req.body.nome, 120);
    const nascimento = new Date(req.body.nascimento);
    const cpf = onlyDigits(req.body.cpf) || undefined;
    const sexo = ['masculino', 'feminino'].includes(req.body.sexo) ? req.body.sexo : null;
    const vinculos = ['aluno','pai','mae','irmao','irma','egresso','servidor','conjuge_servidor','filho_servidor','filho_bombeiro'];
    const vinculo = vinculos.includes(req.body.vinculo) ? req.body.vinculo : null;
    const enquadramento = ['regular','aee','pcd'].includes(req.body.enquadramento) ? req.body.enquadramento : 'regular';
    const etapaEnsino = vinculo === 'aluno' && ['fundamental2','medio'].includes(req.body.etapaEnsino) ? req.body.etapaEnsino : 'nao_aplicavel';
    const turno = etapaEnsino === 'fundamental2' ? 'manha' : etapaEnsino === 'medio' ? 'tarde' : 'nao_aplicavel';
    const turma = safeText(req.body.turma, 50);
    const referenciaNome = safeText(req.body.referenciaNome, 120);
    const referenciaTurma = safeText(req.body.referenciaTurma, 50);
    const referenciaObs = safeText(req.body.referenciaObs, 200);
    if (nome.length < 3 || Number.isNaN(nascimento.getTime()) || !vinculo || !sexo || !isValidCpf(cpf)) return res.status(400).json({ mensagem: 'Confira nome, nascimento, sexo, vínculo e CPF.' });
    if (vinculo === 'aluno' && (!['fundamental2','medio'].includes(etapaEnsino) || !turma)) return res.status(400).json({ mensagem: 'Para aluno, informe etapa de ensino e turma.' });
    if (enquadramento === 'aee' && vinculo !== 'aluno') return res.status(400).json({ mensagem: 'A categoria AEE está disponível para alunos do CMDPII/CZS.' });
    const precisaReferencia = ['pai','mae','irmao','irma','conjuge_servidor','filho_servidor','filho_bombeiro'].includes(vinculo);
    if (precisaReferencia && referenciaNome.length < 3) return res.status(400).json({ mensagem: 'Informe o nome da pessoa que comprova seu vínculo com a comunidade escolar.' });

    const existingParticipant = await EventoParticipante.findOne({ eventSlug: EVENT_SLUG, accountId: req.eventAccount._id, nome, nascimento, ativo: true });
    if (existingParticipant) return res.json({ participante: existingParticipant, reutilizado: true });
    const p = await EventoParticipante.create({
      eventSlug: EVENT_SLUG, accountId: req.eventAccount._id, nome, nascimento, cpf, sexo, vinculo,
      etapaEnsino, turno, turma: vinculo === 'aluno' ? turma : '', matricula: safeText(req.body.matricula, 50),
      enquadramento, aee: enquadramento === 'aee', pcd: enquadramento === 'pcd',
      referenciaVinculo: { nome: referenciaNome, turma: referenciaTurma, observacao: referenciaObs },
      titular: Boolean(req.body.titular),
    });
    res.status(201).json({ participante: p });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ mensagem: 'Este CPF já está vinculado a outro participante.' });
    console.error('[eventos/participantes]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar o participante.' });
  }
});

router.post(`/${EVENT_SLUG}/inscricoes`, participantAuth, async (req, res) => {
  try {
    const participant = await EventoParticipante.findOne({ _id: req.body.participantId, eventSlug: EVENT_SLUG, accountId: req.eventAccount._id, ativo: true });
    if (!participant) return res.status(404).json({ mensagem: 'Participante não encontrado.' });
    if (!req.body.termsAccepted || !req.body.vinculoVerdadeiro) return res.status(400).json({ mensagem: 'É necessário aceitar o regulamento e declarar a veracidade do vínculo e das informações.' });
    const existing = await EventoInscricao.findOne({ eventSlug: EVENT_SLUG, participantId: participant._id });
    if (existing) return res.status(409).json({ mensagem: 'Este participante já possui uma solicitação de inscrição.', inscricao: existing });

    const cfg = await ensureConfig();
    if (cfg.inscricoesAbertas === false) return res.status(403).json({ mensagem: 'As inscrições estão temporariamente fechadas.' });
    const category = categoryForParticipant(participant, cfg);
    if (category.error) return res.status(400).json({ mensagem: category.error });
    const ref = cfg.categoryReferenceDate || cfg.eventDate || new Date();
    const age = ageOnDate(participant.nascimento, ref);
    const lot = lotForDate(cfg);
    if (!lot) return res.status(400).json({ mensagem: 'Nenhum lote de inscrição está configurado.' });
    const camisetaTamanho = safeText(req.body.camisetaTamanho, 10).toUpperCase();
    const tamanhoValido = (cfg.camisetas || []).some(c => c.ativo !== false && String(c.tamanho).toUpperCase() === camisetaTamanho);
    if (!tamanhoValido) return res.status(400).json({ mensagem: 'Selecione um tamanho de camiseta disponível.' });
    const numeroPeito = await nextBib();
    const paymentMode = cfg.pagamento?.modo === 'sicoob_api' && cfg.pagamento?.sicoobApiAtiva ? 'sicoob_api' : 'manual';
    const ins = await EventoInscricao.create({
      eventSlug: EVENT_SLUG, accountId: req.eventAccount._id, participantId: participant._id, numeroPeito,
      categoriaKey: category.key, categoriaNome: category.nome, idadeReferencia: age, camisetaTamanho,
      loteKey: lot.key, loteNome: lot.nome, valorCentavos: lot.valorCentavos,
      status: 'aguardando_pagamento',
      pagamento: { modo: paymentMode, status: 'aguardando', provider: paymentMode === 'sicoob_api' ? 'sicoob' : 'manual' },
      consent: {
        termsAccepted: true, vinculoVerdadeiro: true, publicResult: Boolean(req.body.publicResult), photos: Boolean(req.body.photos),
        versaoTermo: cfg.termoVersao || '2026-v1', acceptedAt: new Date(), acceptedIp: String(req.ip || '').slice(0, 80),
      },
    });
    res.status(201).json({ inscricao: ins, pagamento: participantPaymentConfig(cfg), mensagem: 'Solicitação criada. Conclua o pagamento para que a inscrição seja analisada.' });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ mensagem: 'Inscrição já existente.' });
    console.error('[eventos/inscricoes]', e);
    res.status(500).json({ mensagem: 'Não foi possível concluir a solicitação de inscrição.' });
  }
});

router.post(`/${EVENT_SLUG}/inscricoes/:id/comprovante`, participantAuth, receiptUpload.single('comprovante'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Selecione o comprovante em PDF, JPG, PNG ou WEBP.' });
    const ins = await EventoInscricao.findOne({ _id: req.params.id, eventSlug: EVENT_SLUG, accountId: req.eventAccount._id, status: { $ne: 'cancelada' } });
    if (!ins) return res.status(404).json({ mensagem: 'Inscrição não encontrada.' });
    if (ins.status === 'confirmada') return res.status(409).json({ mensagem: 'Esta inscrição já está deferida.' });
    const old = ins.pagamento?.comprovanteMediaId;
    const mediaId = await saveGridFile(req.file, { tipo: 'comprovante_pagamento', inscriptionId: String(ins._id), accountId: String(req.eventAccount._id) });
    ins.pagamento = { ...(ins.pagamento?.toObject ? ins.pagamento.toObject() : ins.pagamento || {}), modo: 'manual', status: 'em_analise', comprovanteMediaId: mediaId, comprovanteNome: safeText(req.file.originalname, 180), comprovanteMime: req.file.mimetype, comprovanteEnviadoEm: new Date(), analisadoEm: null, analisadoPorId: null, analisadoPorNome: '', pagoEm: null, observacao: '' };
    ins.status = 'pagamento_em_analise';
    await ins.save();
    if (old) await deleteGridFile(old);
    const participant = await EventoParticipante.findById(ins.participantId).lean();
    await sendRegistrationStatusEmail(req, req.eventAccount, participant || { nome: 'Participante' }, ins, 'comprovante');
    res.json({ ok: true, inscricao: ins, mensagem: 'Comprovante enviado. A organização fará a conferência do pagamento.' });
  } catch (e) {
    console.error('[eventos/comprovante]', e);
    res.status(500).json({ mensagem: e?.message || 'Não foi possível enviar o comprovante.' });
  }
});

router.get(`/${EVENT_SLUG}/inscricoes/:id/comprovante`, participantAuth, async (req, res) => {
  try {
    const ins = await EventoInscricao.findOne({ _id: req.params.id, eventSlug: EVENT_SLUG, accountId: req.eventAccount._id }).lean();
    if (!ins?.pagamento?.comprovanteMediaId) return res.status(404).end();
    return streamGridFile(res, ins.pagamento.comprovanteMediaId, { filename: ins.pagamento.comprovanteNome || 'comprovante', download: false });
  } catch (_e) { return res.status(404).end(); }
});

router.get(`/${EVENT_SLUG}/fotos/minhas`, participantAuth, async (req, res) => {
  try {
    const photos = await EventoFoto.find({ eventSlug: EVENT_SLUG, accountIds: req.eventAccount._id, ativo: true }).sort({ createdAt: -1 }).lean();
    res.json({ fotos: photos.map(f => ({ ...f, url: `/api/eventos/${EVENT_SLUG}/media/${f.mediaId}` })) });
  } catch (e) {
    res.status(500).json({ mensagem: 'Não foi possível carregar as fotos.' });
  }
});

router.get(`/${EVENT_SLUG}/certificado/:inscricaoId.pdf`, participantAuth, async (req, res) => {
  try {
    const ins = await EventoInscricao.findOne({ _id: req.params.inscricaoId, eventSlug: EVENT_SLUG, accountId: req.eventAccount._id }).lean();
    if (!ins) return res.status(404).json({ mensagem: 'Inscrição não encontrada.' });
    const result = await EventoResultado.findOne({ inscriptionId: ins._id, eventSlug: EVENT_SLUG, status: 'concluido' }).lean();
    if (!result) return res.status(404).json({ mensagem: 'Certificado disponível após a conclusão da prova.' });
    const p = await EventoParticipante.findById(ins.participantId).lean();
    const cfg = await ensureConfig();
    if (cfg.certificado?.publicado === false) return res.status(404).json({ mensagem: 'Certificado ainda não publicado.' });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-${ins.numeroPeito}.pdf"`);
    doc.pipe(res);
    doc.rect(20, 20, 802, 555).lineWidth(3).stroke('#16cfea');
    doc.fontSize(13).fillColor('#0b4a68').text('AXORIIN EVENTOS', { align: 'center' });
    doc.moveDown(1.2).fontSize(28).fillColor('#071c2e').text(cfg.certificado?.titulo || 'Certificado de Participação', { align: 'center' });
    doc.moveDown(1.3).fontSize(14).fillColor('#405466').text('Certificamos que', { align: 'center' });
    doc.moveDown(.4).fontSize(30).fillColor('#081f35').text(p?.nome || 'Participante', { align: 'center' });
    const texto = String(cfg.certificado?.textoBase || '').replace(/\{\{NOME\}\}/g, p?.nome || 'Participante');
    doc.moveDown(.8).fontSize(15).fillColor('#334b60').text(texto, 120, doc.y, { width: 620, align: 'center', lineGap: 4 });
    doc.moveDown(1.4).fontSize(12).text(`${cfg.local} • ${cfg.dataLabel}`, { align: 'center' });
    doc.moveDown(1.6).fontSize(12).fillColor('#0b4a68').text(cfg.certificado?.assinatura || 'Organização do Evento', { align: 'center' });
    doc.end();
  } catch (e) {
    console.error('[eventos/certificado]', e);
    if (!res.headersSent) res.status(500).json({ mensagem: 'Não foi possível gerar o certificado.' });
  }
});

// ---------------- ADMIN ----------------
const admin = express.Router();
admin.use(autenticar, adminRole);

admin.get('/dashboard', async (_req, res) => {
  const [contas, participantes, inscricoes, resultados, fotos] = await Promise.all([
    EventoConta.countDocuments({ eventSlug: EVENT_SLUG, ativo: true }),
    EventoParticipante.countDocuments({ eventSlug: EVENT_SLUG, ativo: true }),
    EventoInscricao.countDocuments({ eventSlug: EVENT_SLUG, status: { $ne: 'cancelada' } }),
    EventoResultado.countDocuments({ eventSlug: EVENT_SLUG }),
    EventoFoto.countDocuments({ eventSlug: EVENT_SLUG, ativo: true }),
  ]);
  res.json({ contas, participantes, inscricoes, resultados, fotos });
});

admin.get('/config', async (_req, res) => {
  const cfg = await ensureConfig();
  res.json(adminConfig(cfg));
});

admin.put('/config', async (req, res) => {
  try {
    const cfg = await ensureConfig();
    const fields = ['titulo','subtitulo','destaque','ctaPrincipal','ctaSecundario','dataLabel','local','percursoLabel','resumoCategorias','resumoPremiacao','premioDescricao','sponsorMessage','sponsorSubMessage','contatoEmail','contatoTelefone','fraseLateral','regulamentoTexto','bannerAlt','termoVersao'];
    for (const f of fields) if (req.body[f] !== undefined) cfg[f] = safeText(req.body[f], f === 'regulamentoTexto' ? 20000 : 1000);
    if (req.body.publicado !== undefined) cfg.publicado = Boolean(req.body.publicado);
    if (req.body.inscricoesAbertas !== undefined) cfg.inscricoesAbertas = Boolean(req.body.inscricoesAbertas);
    if (req.body.eventDate !== undefined) cfg.eventDate = req.body.eventDate ? new Date(req.body.eventDate) : null;
    if (req.body.categoryReferenceDate) cfg.categoryReferenceDate = new Date(req.body.categoryReferenceDate);
    if (Array.isArray(req.body.publicoPermitido)) cfg.publicoPermitido = req.body.publicoPermitido.map(x => safeText(x, 160)).filter(Boolean).filter(x => !(/bombeiros? militares?/i.test(x) && !/filhos?/i.test(x))).slice(0, 30);
    if (Array.isArray(req.body.kitItems)) cfg.kitItems = req.body.kitItems.map(x => safeText(x, 160)).filter(Boolean).slice(0, 30);
    if (Array.isArray(req.body.camisetas)) cfg.camisetas = req.body.camisetas.map(c => ({ tamanho: safeText(c.tamanho, 10).toUpperCase(), estoque: c.estoque === '' || c.estoque === null || c.estoque === undefined ? null : Math.max(0, Number(c.estoque) || 0), ativo: c.ativo !== false })).filter(c => c.tamanho).slice(0, 20);
    if (Array.isArray(req.body.lotes)) cfg.lotes = req.body.lotes.map((l,idx) => ({ key: safeText(l.key || `lote-${idx+1}`,50).toLowerCase().replace(/[^a-z0-9-]/g,'-'), nome: safeText(l.nome,80), inicio: l.inicio ? new Date(l.inicio) : null, fim: l.fim ? new Date(l.fim) : null, valorCentavos: Math.max(0, Number(l.valorCentavos)||0), ativo: l.ativo !== false })).filter(l => l.nome && l.valorCentavos > 0).slice(0,10);
    if (Array.isArray(req.body.categorias)) cfg.categorias = req.body.categorias.map((c, idx) => ({ key: safeText(c.key || `categoria-${idx+1}`, 50).toLowerCase().replace(/[^a-z0-9-]/g, '-'), nome: safeText(c.nome, 100), descricao: safeText(c.descricao, 250), premiacao: safeText(c.premiacao, 120), ativo: c.ativo !== false })).filter(c => c.nome && c.key !== 'bombeiros' && !/bombeiros? militares?/i.test(c.nome));
    if (req.body.pagamento) {
      const modo = req.body.pagamento.modo === 'sicoob_api' ? 'sicoob_api' : 'manual';
      cfg.pagamento = {
        modo,
        banco: safeText(req.body.pagamento.banco || 'Sicoob', 80),
        chavePix: safeText(req.body.pagamento.chavePix, 180),
        favorecido: safeText(req.body.pagamento.favorecido, 180),
        instrucoes: safeText(req.body.pagamento.instrucoes, 1000),
        comprovanteObrigatorio: req.body.pagamento.comprovanteObrigatorio !== false,
        sicoobApiAtiva: false,
      };
    }
    if (req.body.certificado) cfg.certificado = { titulo: safeText(req.body.certificado.titulo,100), textoBase: safeText(req.body.certificado.textoBase,1500), assinatura: safeText(req.body.certificado.assinatura,150), publicado: req.body.certificado.publicado !== false };
    if (req.body.medalha) cfg.medalha = { titulo: safeText(req.body.medalha.titulo,100), edicao: safeText(req.body.medalha.edicao,50), ano: safeText(req.body.medalha.ano,10), mensagem: safeText(req.body.medalha.mensagem,300), publicado: req.body.medalha.publicado !== false };
    cfg.schemaVersion = 137;
    cfg.markModified('categorias'); cfg.markModified('lotes'); cfg.markModified('camisetas'); cfg.markModified('pagamento'); cfg.markModified('kitItems'); cfg.markModified('publicoPermitido');
    await cfg.save();
    res.json({ ok: true, config: adminConfig(cfg) });
  } catch (e) {
    console.error('[eventos/admin/config]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar a configuração.' });
  }
});



admin.post('/banner', upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Selecione uma imagem.' });
    const cfg = await ensureConfig();
    const oldRef = bannerMediaRef(cfg);
    const stored = await saveEventMedia(req.file, { eventSlug: EVENT_SLUG, tipo: 'banner', metadata: { tipo: 'banner' } });
    cfg.bannerMediaId = stored.mediaId;
    cfg.bannerStorageProvider = stored.storageProvider;
    cfg.bannerStorageKey = stored.storageKey || '';
    cfg.bannerStorageUrl = stored.storageUrl || '';
    await cfg.save();
    if (oldRef.mediaId && oldRef.mediaId !== stored.mediaId) {
      try { await deleteEventMedia(oldRef); } catch (e) { console.warn('[eventos/banner/delete-old]', e?.message || e); }
    }
    res.json({
      ok: true,
      bannerUrl: `/api/eventos/${EVENT_SLUG}/media/${stored.mediaId}?v=${Date.now()}`,
      storage: publicStorageStatus(),
    });
  } catch (e) {
    console.error('[eventos/admin/banner]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar o banner.' });
  }
});


admin.post('/banner-interno', upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Selecione uma imagem.' });
    const cfg = await ensureConfig();
    const oldRef = bannerInternoMediaRef(cfg);
    const stored = await saveEventMedia(req.file, { eventSlug: EVENT_SLUG, tipo: 'banner-interno', metadata: { tipo: 'banner-interno' } });
    cfg.bannerInternoMediaId = stored.mediaId;
    cfg.bannerInternoStorageProvider = stored.storageProvider;
    cfg.bannerInternoStorageKey = stored.storageKey || '';
    cfg.bannerInternoStorageUrl = stored.storageUrl || '';
    await cfg.save();
    if (oldRef.mediaId && oldRef.mediaId !== stored.mediaId) {
      try { await deleteEventMedia(oldRef); } catch (e) { console.warn('[eventos/banner-interno/delete-old]', e?.message || e); }
    }
    return res.json({
      ok: true,
      bannerInternoUrl: `/api/eventos/${EVENT_SLUG}/media/${stored.mediaId}?v=${Date.now()}`,
      storage: publicStorageStatus(),
    });
  } catch (e) {
    console.error('[eventos/admin/banner-interno]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar o banner interno.' });
  }
});

admin.post('/percurso-video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Selecione um vídeo MP4.' });
    const cfg = await ensureConfig();
    const oldRef = percursoVideoMediaRef(cfg);
    const stored = await saveEventMedia(req.file, { eventSlug: EVENT_SLUG, tipo: 'percurso-video', metadata: { tipo: 'percurso-video' } });
    cfg.percursoVideoMediaId = stored.mediaId;
    cfg.percursoVideoStorageProvider = stored.storageProvider;
    cfg.percursoVideoStorageKey = stored.storageKey || '';
    cfg.percursoVideoStorageUrl = stored.storageUrl || '';
    cfg.percursoVideoNome = safeText(req.file.originalname || 'percurso.mp4', 180).replace(/[^a-zA-Z0-9._() -]/g, '_');
    cfg.percursoVideoAtualizadoEm = new Date();
    cfg.schemaVersion = 137;
    await cfg.save();
    if (oldRef.mediaId && oldRef.mediaId !== stored.mediaId) {
      try { await deleteEventMedia(oldRef); } catch (e) { console.warn('[eventos/percurso-video/delete-old]', e?.message || e); }
    }
    return res.json({
      ok: true,
      percursoVideoUrl: `/api/eventos/${EVENT_SLUG}/media/${stored.mediaId}?v=${Date.now()}`,
      percursoVideoCustomizado: true,
      percursoVideoNome: cfg.percursoVideoNome,
      percursoVideoAtualizadoEm: cfg.percursoVideoAtualizadoEm,
      storage: publicStorageStatus(),
    });
  } catch (e) {
    console.error('[eventos/admin/percurso-video]', e);
    const msg = /File too large/i.test(String(e?.message || '')) ? 'O vídeo ultrapassa o limite de 100 MB.' : 'Não foi possível salvar o vídeo do percurso.';
    res.status(500).json({ mensagem: msg });
  }
});

admin.delete('/percurso-video', async (_req, res) => {
  try {
    const cfg = await ensureConfig();
    const oldRef = percursoVideoMediaRef(cfg);
    cfg.percursoVideoMediaId = '';
    cfg.percursoVideoStorageProvider = '';
    cfg.percursoVideoStorageKey = '';
    cfg.percursoVideoStorageUrl = '';
    cfg.percursoVideoNome = '';
    cfg.percursoVideoAtualizadoEm = null;
    cfg.schemaVersion = 137;
    await cfg.save();
    if (oldRef.mediaId) {
      try { await deleteEventMedia(oldRef); } catch (e) { console.warn('[eventos/percurso-video/delete]', e?.message || e); }
    }
    return res.json({
      ok: true,
      percursoVideoUrl: `/eventos/${EVENT_SLUG}/assets/media/percurso-oficial.mp4`,
      percursoVideoCustomizado: false,
      percursoVideoNome: 'percurso-oficial.mp4',
    });
  } catch (e) {
    console.error('[eventos/admin/percurso-video/delete]', e);
    res.status(500).json({ mensagem: 'Não foi possível restaurar o vídeo original.' });
  }
});

admin.post('/regulamento-pdf', pdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Selecione o regulamento em PDF.' });
    const cfg = await ensureConfig();
    const oldId = cfg.regulamentoPdfMediaId;
    const id = await saveGridFile(req.file, { tipo: 'regulamento-pdf' });
    cfg.regulamentoPdfMediaId = id;
    cfg.regulamentoPdfNome = safeText(req.file.originalname || 'regulamento.pdf', 180).replace(/[^a-zA-Z0-9._() -]/g, '_');
    cfg.regulamentoPdfPublicado = true;
    cfg.regulamentoPdfAtualizadoEm = new Date();
    await cfg.save();
    if (oldId && oldId !== id) await deleteGridFile(oldId);
    res.json({
      ok: true,
      regulamentoPdfDisponivel: true,
      regulamentoPdfNome: cfg.regulamentoPdfNome,
      regulamentoPdfUrl: `/api/eventos/${EVENT_SLUG}/regulamento.pdf`,
      regulamentoPdfAtualizadoEm: cfg.regulamentoPdfAtualizadoEm,
    });
  } catch (e) {
    console.error('[eventos/admin/regulamento-pdf]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar o regulamento em PDF.' });
  }
});

admin.patch('/regulamento-pdf', async (req, res) => {
  try {
    const cfg = await ensureConfig();
    cfg.regulamentoPdfPublicado = req.body.publicado !== false;
    await cfg.save();
    res.json({ ok: true, regulamentoPdfPublicado: cfg.regulamentoPdfPublicado });
  } catch (e) {
    res.status(500).json({ mensagem: 'Não foi possível alterar a publicação do regulamento.' });
  }
});

admin.delete('/regulamento-pdf', async (_req, res) => {
  try {
    const cfg = await ensureConfig();
    const oldId = cfg.regulamentoPdfMediaId;
    cfg.regulamentoPdfMediaId = '';
    cfg.regulamentoPdfNome = '';
    cfg.regulamentoPdfPublicado = false;
    cfg.regulamentoPdfAtualizadoEm = null;
    await cfg.save();
    if (oldId) await deleteGridFile(oldId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[eventos/admin/regulamento-pdf/delete]', e);
    res.status(500).json({ mensagem: 'Não foi possível remover o regulamento em PDF.' });
  }
});

function participantReportStatusLabel(status) {
  const labels = {
    rascunho: 'Rascunho',
    aguardando_pagamento: 'Aguardando pagamento',
    pagamento_em_analise: 'Pagamento em análise',
    pagamento_recusado: 'Pagamento recusado',
    confirmada: 'Inscrição deferida',
    cancelada: 'Cancelada',
  };
  return labels[String(status || '')] || String(status || '');
}

function participantReportVinculoLabel(vinculo) {
  const labels = {
    aluno: 'Aluno(a)', pai: 'Pai', mae: 'Mãe', irmao: 'Irmão', irma: 'Irmã',
    egresso: 'Egresso(a)', servidor: 'Servidor/Colaborador',
    conjuge_servidor: 'Cônjuge de servidor', filho_servidor: 'Filho(a) de servidor',
    filho_bombeiro: 'Filho(a) de Bombeiro Militar',
  };
  return labels[String(vinculo || '')] || String(vinculo || '').replace(/_/g, ' ');
}

function participantReportKitLabel(status) {
  const labels = { aguardando: 'Aguardando', disponivel: 'Disponível', retirado: 'Retirado', nao_disponivel: 'N/D' };
  return labels[String(status || '')] || 'Aguardando';
}

function reportCategoryRank(key) {
  const order = [
    'fundamental-regular-masculino','fundamental-regular-feminino',
    'fundamental-aee-masculino','fundamental-aee-feminino',
    'medio-regular-masculino','medio-regular-feminino',
    'medio-aee-masculino','medio-aee-feminino',
    'servidores-masculino','servidores-feminino',
    'comunidade-1-masculino','comunidade-1-feminino',
    'comunidade-2-masculino','comunidade-2-feminino',
    'pcd-masculino','pcd-feminino',
  ];
  const idx = order.indexOf(String(key || ''));
  return idx < 0 ? 9999 : idx;
}

admin.get('/relatorios/participantes.pdf', async (req, res) => {
  try {
    const escopo = String(req.query.escopo || 'deferidos').toLowerCase() === 'todos' ? 'todos' : 'deferidos';
    const cfg = await ensureConfig();
    const filter = { eventSlug: EVENT_SLUG, status: { $ne: 'cancelada' } };
    if (escopo === 'deferidos') filter.status = 'confirmada';

    const inscriptions = await EventoInscricao.find(filter).lean();
    const participantIds = inscriptions.map(i => i.participantId).filter(Boolean);
    const participants = participantIds.length
      ? await EventoParticipante.find({ _id: { $in: participantIds }, eventSlug: EVENT_SLUG, ativo: true }).lean()
      : [];
    const pmap = new Map(participants.map(p => [String(p._id), p]));

    const rows = inscriptions
      .filter(i => !String(i.categoriaKey || '').startsWith('bombeiros-'))
      .map(i => ({ ins: i, participante: pmap.get(String(i.participantId)) || null }))
      .filter(x => x.participante)
      .sort((a, b) => {
        const cr = reportCategoryRank(a.ins.categoriaKey) - reportCategoryRank(b.ins.categoriaKey);
        if (cr) return cr;
        const an = String(a.participante.nome || '').localeCompare(String(b.participante.nome || ''), 'pt-BR', { sensitivity: 'base' });
        if (an) return an;
        return Number(a.ins.numeroPeito || 0) - Number(b.ins.numeroPeito || 0);
      });

    const groups = [];
    const byKey = new Map();
    for (const row of rows) {
      const key = String(row.ins.categoriaKey || row.ins.categoriaNome || 'sem-categoria');
      if (!byKey.has(key)) {
        const g = { key, nome: row.ins.categoriaNome || 'Sem categoria', items: [] };
        byKey.set(key, g); groups.push(g);
      }
      byKey.get(key).items.push(row);
    }

    const generatedAt = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Rio_Branco', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const filename = escopo === 'todos' ? 'lista-geral-participantes-todos.pdf' : 'lista-oficial-participantes.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 34, bufferPages: true });
    doc.pipe(res);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 34;
    const usableWidth = pageWidth - 68;
    const bodyBottom = pageHeight - 42;
    const brandRoot = path.join(__dirname, '../../public/eventos/corrida-cmdpii-2026/assets/img/brand');
    const logoCb = path.join(brandRoot, 'brasao-cbmac-cmdpii.png');
    const logoSchool = path.join(brandRoot, 'brasao-colegio.png');

    function pageHeader() {
      doc.rect(0, 0, pageWidth, 82).fill('#061426');
      try { if (require('fs').existsSync(logoCb)) doc.image(logoCb, left, 13, { fit: [52,52] }); } catch {}
      try { if (require('fs').existsSync(logoSchool)) doc.image(logoSchool, pageWidth - left - 52, 13, { fit: [52,52] }); } catch {}
      doc.fillColor('#2fd7ff').font('Helvetica-Bold').fontSize(8).text('AXORIIN EVENTOS', left + 62, 17, { width: usableWidth - 124, align: 'center' });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('2ª CORRIDA CMDPII-CZS', left + 62, 31, { width: usableWidth - 124, align: 'center' });
      doc.fillColor('#b9cadb').font('Helvetica').fontSize(8.5).text('LISTA DE PARTICIPANTES POR CATEGORIA', left + 62, 55, { width: usableWidth - 124, align: 'center' });
      doc.y = 96;
    }
    function pageFooter() {
      // aplicado após gerar todas as páginas, usando bufferPages
    }
    function ensureSpace(heightNeeded) {
      if (doc.y + heightNeeded > bodyBottom) doc.addPage();
    }
    function textFit(value, max=50) {
      const t = String(value ?? '').trim();
      return t.length > max ? `${t.slice(0, max - 1)}…` : t;
    }
    function drawGroupTitle(name, count) {
      ensureSpace(72);
      const y = doc.y;
      doc.roundedRect(left, y, usableWidth, 31, 6).fill('#0c3557');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(name, left + 12, y + 9, { width: usableWidth - 130 });
      doc.fillColor('#82e9ff').font('Helvetica-Bold').fontSize(9).text(`${count} participante${count === 1 ? '' : 's'}`, pageWidth - left - 120, y + 10, { width: 106, align: 'right' });
      doc.y = y + 37;
    }
    function drawTableHeader(includeStatus) {
      ensureSpace(28);
      const y = doc.y;
      const cols = includeStatus
        ? [34, 58, 238, 110, 60, 70, 105, 92]
        : [34, 60, 280, 130, 64, 80, 115];
      const heads = includeStatus
        ? ['#','Peito','Participante','Vínculo / turma','Camisa','Kit','Situação','Presença']
        : ['#','Peito','Participante','Vínculo / turma','Camisa','Kit','Presença'];
      let x = left;
      doc.rect(left, y, usableWidth, 23).fill('#d9eef9');
      doc.fillColor('#0b2940').font('Helvetica-Bold').fontSize(7.5);
      heads.forEach((h, idx) => { doc.text(h, x + 5, y + 7, { width: cols[idx] - 10, ellipsis: true }); x += cols[idx]; });
      doc.y = y + 23;
      return cols;
    }
    function drawRow(row, index, cols, includeStatus) {
      ensureSpace(25);
      const p = row.participante;
      const i = row.ins;
      const y = doc.y;
      const height = 24;
      if (index % 2 === 0) doc.rect(left, y, usableWidth, height).fill('#f5f9fc');
      doc.fillColor('#17334a').font('Helvetica').fontSize(7.4);
      const ref = p.vinculo === 'aluno'
        ? [p.turma, p.turno === 'manha' ? 'Manhã' : p.turno === 'tarde' ? 'Tarde' : ''].filter(Boolean).join(' • ')
        : participantReportVinculoLabel(p.vinculo);
      const vals = includeStatus
        ? [String(index + 1), String(i.numeroPeito || '—'), textFit(p.nome, 58), textFit(ref, 28), String(i.camisetaTamanho || '—'), participantReportKitLabel(i.kit?.status), participantReportStatusLabel(i.status), '[   ]']
        : [String(index + 1), String(i.numeroPeito || '—'), textFit(p.nome, 66), textFit(ref, 32), String(i.camisetaTamanho || '—'), participantReportKitLabel(i.kit?.status), '[   ]'];
      let x = left;
      vals.forEach((v, idx) => { doc.text(v, x + 5, y + 7, { width: cols[idx] - 10, ellipsis: true }); x += cols[idx]; });
      doc.moveTo(left, y + height).lineTo(left + usableWidth, y + height).strokeColor('#dce8f0').lineWidth(.45).stroke();
      doc.y = y + height;
    }

    doc.on('pageAdded', pageHeader);
    pageHeader();
    doc.fillColor('#18364d').font('Helvetica-Bold').fontSize(10)
      .text(escopo === 'deferidos' ? 'LISTA OFICIAL • INSCRIÇÕES DEFERIDAS' : 'RELATÓRIO ADMINISTRATIVO • TODOS OS REGISTROS', left, doc.y, { width: usableWidth / 2 });
    doc.fillColor('#587287').font('Helvetica').fontSize(8)
      .text(`Gerado em ${generatedAt} • Total: ${rows.length} • Categorias: ${groups.length}`, left + usableWidth / 2, doc.y - 11, { width: usableWidth / 2, align: 'right' });
    doc.moveDown(.7);
    doc.fillColor('#587287').fontSize(7.5).text(
      escopo === 'deferidos'
        ? 'Documento de controle do evento. Contém apenas inscrições deferidas. A coluna Presença foi deixada livre para conferência manual.'
        : 'Documento administrativo. Inclui inscrições deferidas, pendentes e recusadas; consulte a coluna Situação antes de utilizar para controle do evento.',
      left, doc.y, { width: usableWidth }
    );
    doc.moveDown(1.0);

    if (!groups.length) {
      doc.fillColor('#7a8fa2').font('Helvetica').fontSize(12).text('Nenhum participante encontrado para este relatório.', left, doc.y + 20, { width: usableWidth, align: 'center' });
    } else {
      for (const group of groups) {
        drawGroupTitle(group.nome, group.items.length);
        let cols = drawTableHeader(escopo === 'todos');
        let localIndex = 0;
        for (const row of group.items) {
          if (doc.y + 25 > bodyBottom) {
            doc.addPage();
            drawGroupTitle(`${group.nome} • continuação`, group.items.length);
            cols = drawTableHeader(escopo === 'todos');
          }
          drawRow(row, localIndex, cols, escopo === 'todos');
          localIndex += 1;
        }
        doc.moveDown(.8);
      }
    }

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex++) {
      doc.switchToPage(pageIndex);
      doc.fillColor('#718496').font('Helvetica').fontSize(7)
        .text(`CMDPII-CZS • 2ª Corrida 2026 • Página ${pageIndex - range.start + 1} de ${range.count}`, left, pageHeight - 28, { width: usableWidth, align: 'center' });
    }
    doc.end();
  } catch (e) {
    console.error('[eventos/admin/relatorio-participantes]', e);
    if (!res.headersSent) res.status(500).json({ mensagem: 'Não foi possível gerar a lista de participantes em PDF.' });
  }
});

admin.get('/inscricoes', async (req, res) => {
  const q = safeText(req.query.q, 100).toLowerCase();
  const status = safeText(req.query.status, 50);
  const categoria = safeText(req.query.categoria, 80);
  const vinculo = safeText(req.query.vinculo, 50);
  const turno = safeText(req.query.turno, 30);
  const enquadramento = safeText(req.query.enquadramento, 30);
  const filter = { eventSlug: EVENT_SLUG, status: { $ne: 'cancelada' } };
  if (status) filter.status = status;
  if (categoria) filter.categoriaKey = categoria;
  const inscriptions = await EventoInscricao.find(filter).sort({ createdAt: -1 }).limit(2000).lean();
  const participants = await EventoParticipante.find({ _id: { $in: inscriptions.map(i => i.participantId) } }).lean();
  const accounts = await EventoConta.find({ _id: { $in: inscriptions.map(i => i.accountId) } }).select('nome email telefone').lean();
  const pmap = new Map(participants.map(p => [String(p._id), p]));
  const amap = new Map(accounts.map(a => [String(a._id), a]));
  let out = inscriptions.filter(i => !String(i.categoriaKey || '').startsWith('bombeiros-')).map(i => ({ ...i, participante: pmap.get(String(i.participantId)) || null, conta: amap.get(String(i.accountId)) || null, comprovanteUrl: i.pagamento?.comprovanteMediaId ? `/api/eventos/${EVENT_SLUG}/admin/inscricoes/${i._id}/comprovante` : '' }));
  if (vinculo) out = out.filter(x => x.participante?.vinculo === vinculo);
  if (turno) out = out.filter(x => x.participante?.turno === turno);
  if (enquadramento) out = out.filter(x => x.participante?.enquadramento === enquadramento);
  if (q) out = out.filter(x => (x.participante?.nome || '').toLowerCase().includes(q) || String(x.numeroPeito || '').includes(q) || (x.conta?.email || '').toLowerCase().includes(q));
  res.json({ inscricoes: out });
});

admin.get('/inscricoes/:id/comprovante', async (req, res) => {
  try {
    const ins = await EventoInscricao.findOne({ _id: req.params.id, eventSlug: EVENT_SLUG }).lean();
    if (!ins?.pagamento?.comprovanteMediaId) return res.status(404).end();
    return streamGridFile(res, ins.pagamento.comprovanteMediaId, { filename: ins.pagamento.comprovanteNome || 'comprovante', download: false });
  } catch (_e) { return res.status(404).end(); }
});

admin.patch('/inscricoes/:id/pagamento', async (req, res) => {
  try {
    const action = String(req.body.acao || '').toLowerCase();
    if (!['deferir','recusar'].includes(action)) return res.status(400).json({ mensagem: 'Ação inválida.' });
    const ins = await EventoInscricao.findOne({ _id: req.params.id, eventSlug: EVENT_SLUG });
    if (!ins) return res.status(404).json({ mensagem: 'Inscrição não encontrada.' });
    if (action === 'deferir' && !ins.pagamento?.comprovanteMediaId && ins.pagamento?.modo !== 'sicoob_api') return res.status(400).json({ mensagem: 'Não há comprovante anexado para conferência.' });
    const adminUser = req.usuario || {};
    const now = new Date();
    ins.pagamento.status = action === 'deferir' ? 'aprovado' : 'recusado';
    ins.pagamento.analisadoEm = now;
    ins.pagamento.analisadoPorId = adminUser._id || adminUser.id || null;
    ins.pagamento.analisadoPorNome = safeText(adminUser.nome || adminUser.email || 'Administrador', 140);
    ins.pagamento.observacao = safeText(req.body.observacao, 500);
    if (action === 'deferir') {
      ins.pagamento.pagoEm = req.body.pagoEm ? new Date(req.body.pagoEm) : now;
      ins.status = 'confirmada';
      ins.deferidaEm = now;
      if (ins.kit?.status === 'nao_disponivel') ins.kit.status = 'aguardando';
    } else {
      ins.status = 'pagamento_recusado';
      ins.deferidaEm = null;
    }
    await ins.save();
    const [participant, account] = await Promise.all([EventoParticipante.findById(ins.participantId).lean(), EventoConta.findById(ins.accountId).lean()]);
    await sendRegistrationStatusEmail(req, account, participant || { nome: 'Participante' }, ins, action === 'deferir' ? 'aprovado' : 'recusado');
    res.json({ ok: true, inscricao: ins });
  } catch (e) {
    console.error('[eventos/admin/pagamento]', e);
    res.status(500).json({ mensagem: 'Não foi possível atualizar o pagamento.' });
  }
});

admin.patch('/inscricoes/:id/kit', async (req, res) => {
  const status = ['nao_disponivel', 'aguardando', 'disponivel', 'retirado'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ mensagem: 'Status inválido.' });
  const ins = await EventoInscricao.findOneAndUpdate(
    { _id: req.params.id, eventSlug: EVENT_SLUG },
    { $set: { 'kit.status': status, 'kit.retiradoEm': status === 'retirado' ? new Date() : null, 'kit.observacao': safeText(req.body.observacao, 300) } },
    { new: true }
  );
  if (!ins) return res.status(404).json({ mensagem: 'Inscrição não encontrada.' });
  res.json({ ok: true, inscricao: ins });
});

admin.post('/resultados/upsert', async (req, res) => {
  try {
    const numeroPeito = String(req.body.numeroPeito || '').trim();
    const ins = await EventoInscricao.findOne({ eventSlug: EVENT_SLUG, numeroPeito, status: 'confirmada' });
    if (!ins) return res.status(404).json({ mensagem: `Número de peito ${numeroPeito} não encontrado.` });
    const status = ['pendente','concluido','dnf','dns','desclassificado'].includes(req.body.status) ? req.body.status : 'concluido';
    const colocacaoCategoria = req.body.colocacaoCategoria ? Number(req.body.colocacaoCategoria) : null;
    const data = {
      eventSlug: EVENT_SLUG,
      inscriptionId: ins._id,
      participantId: ins.participantId,
      numeroPeito,
      tempoTexto: safeText(req.body.tempo, 20),
      tempoMs: parseTimeMs(req.body.tempo),
      distanciaKm: req.body.distanciaKm ? Number(req.body.distanciaKm) : null,
      colocacaoGeral: req.body.colocacaoGeral ? Number(req.body.colocacaoGeral) : null,
      colocacaoCategoria,
      status,
      medalha: medalFromPosition(colocacaoCategoria, status),
      publicado: req.body.publicado !== false,
    };
    const result = await EventoResultado.findOneAndUpdate({ inscriptionId: ins._id }, { $set: data }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ ok: true, resultado: result });
  } catch (e) {
    console.error('[eventos/admin/resultados/upsert]', e);
    res.status(500).json({ mensagem: 'Não foi possível salvar o resultado.' });
  }
});

admin.post('/resultados/importar', async (req, res) => {
  try {
    const rows = Array.isArray(req.body.resultados) ? req.body.resultados.slice(0, 5000) : [];
    const saida = { importados: 0, erros: [] };
    for (const row of rows) {
      const numeroPeito = String(row.numeroPeito || row.numero || '').trim();
      const ins = await EventoInscricao.findOne({ eventSlug: EVENT_SLUG, numeroPeito, status: 'confirmada' });
      if (!ins) { saida.erros.push(`${numeroPeito || '?'}: inscrição não encontrada`); continue; }
      const status = ['pendente','concluido','dnf','dns','desclassificado'].includes(row.status) ? row.status : 'concluido';
      const colocacaoCategoria = row.colocacaoCategoria ? Number(row.colocacaoCategoria) : null;
      await EventoResultado.findOneAndUpdate({ inscriptionId: ins._id }, { $set: {
        eventSlug: EVENT_SLUG, inscriptionId: ins._id, participantId: ins.participantId, numeroPeito,
        tempoTexto: safeText(row.tempo, 20), tempoMs: parseTimeMs(row.tempo),
        distanciaKm: row.distanciaKm ? Number(row.distanciaKm) : null,
        colocacaoGeral: row.colocacaoGeral ? Number(row.colocacaoGeral) : null,
        colocacaoCategoria, status, medalha: medalFromPosition(colocacaoCategoria, status), publicado: row.publicado !== false,
      } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      saida.importados++;
    }
    res.json(saida);
  } catch (e) {
    console.error('[eventos/admin/resultados/importar]', e);
    res.status(500).json({ mensagem: 'Não foi possível importar os resultados.' });
  }
});

admin.get('/resultados', async (_req, res) => {
  const results = await EventoResultado.find({ eventSlug: EVENT_SLUG }).sort({ colocacaoGeral: 1, createdAt: -1 }).lean();
  const inscriptions = await EventoInscricao.find({ _id: { $in: results.map(r => r.inscriptionId) } }).lean();
  const imap = new Map(inscriptions.map(i => [String(i._id), i]));
  const participants = await EventoParticipante.find({ _id: { $in: inscriptions.map(i => i.participantId) } }).select('nome').lean();
  const pmap = new Map(participants.map(p => [String(p._id), p.nome]));
  res.json({ resultados: results.map(r => { const i = imap.get(String(r.inscriptionId)); return { ...r, categoriaNome: i?.categoriaNome, participante: pmap.get(String(i?.participantId)) || 'Participante' }; }) });
});

admin.post('/fotos', upload.array('imagens', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ mensagem: 'Selecione ao menos uma foto.' });
    const bibNumbers = String(req.body.bibNumbers || '').split(',').map(x => x.trim()).filter(Boolean);
    const inscriptions = bibNumbers.length ? await EventoInscricao.find({ eventSlug: EVENT_SLUG, numeroPeito: { $in: bibNumbers } }).lean() : [];
    const participantIds = inscriptions.map(i => i.participantId);
    const accountIds = [...new Set(inscriptions.map(i => String(i.accountId)))];
    const categoria = ['percurso','chegada','podio','comunidade','geral'].includes(req.body.categoria) ? req.body.categoria : 'geral';
    const visibilidade = ['privada','publica'].includes(req.body.visibilidade) ? req.body.visibilidade : 'privada';
    const legenda = safeText(req.body.legenda, 300);
    const docs = [];
    for (const file of files) {
      const stored = await saveEventMedia(file, { eventSlug: EVENT_SLUG, tipo: 'fotos', metadata: { tipo: 'foto', bibNumbers } });
      docs.push(await EventoFoto.create({
        eventSlug: EVENT_SLUG, mediaId: stored.mediaId, filename: file.originalname, mimeType: file.mimetype,
        storageProvider: stored.storageProvider, storageKey: stored.storageKey || '', storageUrl: stored.storageUrl || '', origem: 'upload',
        bibNumbers, participantIds, accountIds, categoria, visibilidade, legenda, ativo: true,
      }));
    }
    res.status(201).json({ ok: true, fotos: docs, storage: publicStorageStatus() });
  } catch (e) {
    console.error('[eventos/admin/fotos]', e);
    res.status(500).json({ mensagem: 'Não foi possível enviar as fotos.' });
  }
});

admin.get('/fotos', async (_req, res) => {
  await ensureConfig();
  const photos = await EventoFoto.find({ eventSlug: EVENT_SLUG, ativo: true }).sort({ createdAt: -1 }).limit(1000).lean();
  res.json({
    storage: publicStorageStatus(),
    fotos: photos.map(f => ({ ...f, url: `/api/eventos/${EVENT_SLUG}/admin/media/${encodeURIComponent(f.mediaId)}?v=${new Date(f.updatedAt || f.createdAt || Date.now()).getTime()}` }))
  });
});

admin.get('/storage-status', async (_req, res) => {
  res.json(publicStorageStatus());
});

admin.patch('/fotos/:id', async (req, res) => {
  const update = {};
  if (req.body.categoria && ['percurso','chegada','podio','comunidade','geral'].includes(req.body.categoria)) update.categoria = req.body.categoria;
  if (req.body.visibilidade && ['privada','publica'].includes(req.body.visibilidade)) update.visibilidade = req.body.visibilidade;
  if (req.body.legenda !== undefined) update.legenda = safeText(req.body.legenda, 300);
  if (req.body.bibNumbers !== undefined) {
    const bibNumbers = Array.isArray(req.body.bibNumbers) ? req.body.bibNumbers.map(String) : String(req.body.bibNumbers).split(',').map(x => x.trim()).filter(Boolean);
    const inscriptions = await EventoInscricao.find({ eventSlug: EVENT_SLUG, numeroPeito: { $in: bibNumbers } }).lean();
    update.bibNumbers = bibNumbers;
    update.participantIds = inscriptions.map(i => i.participantId);
    update.accountIds = [...new Set(inscriptions.map(i => String(i.accountId)))];
  }
  const photo = await EventoFoto.findOneAndUpdate({ _id: req.params.id, eventSlug: EVENT_SLUG }, { $set: update }, { new: true });
  if (!photo) return res.status(404).json({ mensagem: 'Foto não encontrada.' });
  res.json({ ok: true, foto: photo });
});

admin.delete('/fotos/:id', async (req, res) => {
  try {
    const photo = await EventoFoto.findOne({ _id: req.params.id, eventSlug: EVENT_SLUG });
    if (!photo) return res.status(404).json({ mensagem: 'Foto não encontrada.' });
    const ref = photoMediaRef(photo);
    if (photo.storageProvider !== 'static') await deleteEventMedia(ref);
    await EventoFoto.deleteOne({ _id: photo._id });
    res.json({ ok: true, removida: true, storageProvider: photo.storageProvider });
  } catch (e) {
    console.error('[eventos/admin/fotos/delete]', e);
    res.status(500).json({ mensagem: 'Não foi possível excluir a foto.' });
  }
});

admin.get('/media/:id', async (req, res) => {
  try {
    const photo = await EventoFoto.findOne({ eventSlug: EVENT_SLUG, mediaId: req.params.id, ativo: true }).lean();
    if (!photo) return res.status(404).end();
    return streamEventMedia(res, photoMediaRef(photo));
  } catch (_e) { return res.status(404).end(); }
});

router.use(`/${EVENT_SLUG}`, v130Extras);
router.use(`/${EVENT_SLUG}/admin`, admin);

// Shell do CMS: os arquivos não contêm dados sensíveis; toda leitura/gravação é protegida nas APIs acima.
const adminRoot = path.join(__dirname, '../../private/eventos-admin-corrida');
adminUiRouter.use(express.static(adminRoot, { index: 'index.html', maxAge: 0 }));

module.exports = { router, adminUiRouter, EVENT_SLUG };
