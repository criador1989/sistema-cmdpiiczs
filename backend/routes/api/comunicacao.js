// backend/routes/api/comunicacao.js
const express = require('express');
const router = express.Router();

const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// Nodemailer (fallback SMTP)
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* opcional */ }

/* ---------------------------------------------
   Util – pegar mensageria (não quebra se faltar)
---------------------------------------------- */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/* ---------------------------------------------
   Util – extrair contatos (email/whatsapp/telegram)
---------------------------------------------- */
function extractContatos(aluno) {
  const contatos = aluno?.contatos || {};
  const responsaveis = Array.isArray(aluno?.responsaveis) ? aluno.responsaveis : [];

  const emails = new Set();
  const whatsapps = new Set();
  const telegramIds = new Set();

  // contatos diretos do aluno
  if (contatos.email) emails.add(String(contatos.email).trim());
  if (contatos.whatsapp) whatsapps.add(String(contatos.whatsapp).replace(/\D/g, ''));

  // contatos dos responsáveis
  for (const r of responsaveis) {
    if (r?.email) emails.add(String(r.email).trim());
    if (r?.whatsapp) whatsapps.add(String(r.whatsapp).replace(/\D/g, ''));
    if (r?.telegramChatId) telegramIds.add(String(r.telegramChatId));
  }

  return {
    emails: [...emails].filter(Boolean),
    whatsapps: [...whatsapps].filter(Boolean),
    telegramIds: [...telegramIds].filter(Boolean),
  };
}

/* ---------------------------------------------
   Util – montar link de WhatsApp
---------------------------------------------- */
function buildWhatsappLink({ numeros = [], texto }) {
  const enc = encodeURIComponent(texto || '');
  const numero = (numeros[0] || '').replace(/\D/g, '');
  return numero ? `https://wa.me/${numero}?text=${enc}` : `https://wa.me/?text=${enc}`;
}

/* ---------------------------------------------
   Classificação da nota (faixa)
   (usa os mesmos intervalos do painel: 3–4,99 = insuficiente; 5–6,99 = regular)
---------------------------------------------- */
function classificarFaixa(nota) {
  const n = Number(nota || 0);
  if (n >= 8.5) return 'excepcional';
  if (n >= 7.0) return 'ótimo/bom';
  if (n >= 5.0) return 'regular';
  if (n >= 3.0) return 'insuficiente';
  return 'incompatível';
}

/* ---------------------------------------------
   Templates de mensagens
---------------------------------------------- */
function tplNotaComportamental({ aluno, faixa, nota }) {
  const titulo = `Aviso de comportamento — ${faixa}`;
  const texto =
`Prezados responsáveis de ${aluno?.nome || 'seu(a) filho(a)'} (${aluno?.turma || '—'}),

Informamos que a nota comportamental atual é ${Number(nota || 0).toFixed(2)} (${faixa}). 
Solicitamos acompanhamento e alinhamento com a coordenação para as devidas providências.

Atenciosamente,
Coordenação CMDPII/CZS`;
  const html = `
    <p>Prezados responsáveis de <strong>${aluno?.nome || 'seu(a) filho(a)'}</strong> (${aluno?.turma || '—'}),</p>
    <p>Informamos que a nota comportamental atual é <strong>${Number(nota || 0).toFixed(2)} (${faixa})</strong>.</p>
    <p>Solicitamos acompanhamento e alinhamento com a coordenação para as devidas providências.</p>
    <p>Atenciosamente,<br/>Coordenação CMDPII/CZS</p>
  `;
  return { titulo, texto, html };
}

function tplNotificacaoDeferida({ aluno, n }) {
  const titulo = `Notificação escolar deferida — ${aluno?.nome || ''}`;
  const resumo = [
    n?.tipoMedida && `Medida: ${n.tipoMedida}`,
    n?.tipo && `Tipo: ${n.tipo}`,
    n?.classificacaoRegulamento && `Classificação: ${n.classificacaoRegulamento}`,
    (n?.artigo || n?.paragrafo || n?.inciso) && `Base: Art. ${n.artigo || '-'} § ${n.paragrafo || '-'} Inc. ${n.inciso || '-'}`,
    n?.motivo && `Motivo: ${n.motivo}`,
  ].filter(Boolean).join('\n');

  const texto =
`Prezados responsáveis de ${aluno?.nome || 'seu(a) filho(a)'} (${aluno?.turma || '—'}),

Comunicamos que a notificação registrada foi *deferida* pela coordenação.

${resumo}

Em caso de dúvidas, entrem em contato com a escola.

Atenciosamente,
Coordenação CMDPII/CZS`;

  const html = `
    <p>Prezados responsáveis de <strong>${aluno?.nome || 'seu(a) filho(a)'}</strong> (${aluno?.turma || '—'}),</p>
    <p>Comunicamos que a notificação registrada foi <strong>deferida</strong> pela coordenação.</p>
    <pre style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace">${resumo}</pre>
    <p>Em caso de dúvidas, entrem em contato com a escola.</p>
    <p>Atenciosamente,<br/>Coordenação CMDPII/CZS</p>
  `;
  return { titulo, texto, html };
}

/* ---------------------------------------------
   Fallbacks de envio direto (SMTP / Telegram)
---------------------------------------------- */
async function enviarEmailDireto({ to, subject, text, html }) {
  if (!nodemailer) return { ok: false, erro: 'nodemailer não disponível' };
  if (String(process.env.MAIL_ENABLED || '').toLowerCase() !== 'true') {
    return { ok: false, erro: 'MAIL_ENABLED != true' };
  }
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 587);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!host || !user || !pass) return { ok: false, erro: 'SMTP envs ausentes' };

  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass }
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || `"CMDPII/CZS" <${user}>`,
      to: Array.isArray(to) ? to.join(',') : to,
      subject, text, html
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, erro: String(err && err.message || err) };
  }
}

async function enviarTelegramDireto({ chatIds=[], text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, erro: 'TELEGRAM_BOT_TOKEN ausente' };
  const results = [];
  for (const chatId of chatIds) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
      const j = await r.json();
      results.push({ chatId, ok: r.ok && j.ok, status: r.status, body: j });
    } catch (err) {
      results.push({ chatId, ok: false, erro: String(err && err.message || err) });
    }
  }
  const ok = results.some(x => x.ok);
  return { ok, results };
}

/* ---------------------------------------------
   POST /api/comunicacao/nota-comportamental/:alunoId
   → agora funciona mesmo SEM body (auto calcula nota/faixa)
---------------------------------------------- */
router.post('/nota-comportamental/:alunoId', autenticar, async (req, res) => {
  try {
    const { alunoId } = req.params;
    let { nota, faixa } = req.body || {};

    const aluno = await Aluno.findById(alunoId)
      .select('nome turma instituicao responsaveis contatos comportamento')
      .lean();

    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });

    // Se vier vazio no body (caso do painel), calcula aqui.
    if (nota == null) nota = aluno.comportamento ?? 0;
    if (!faixa) faixa = classificarFaixa(nota);

    const { titulo, texto, html } = tplNotaComportamental({ aluno, faixa, nota });
    const mensageria = getMensageria(req);
    const contatos = extractContatos(aluno);
    const whatsappLink = buildWhatsappLink({ numeros: contatos.whatsapps, texto });

    const resultados = { tried: [] };

    // 1) Tenta mensageria/queue (se existir)
    if (mensageria?.enfileirarParaResponsaveis) {
      try {
        const r = await mensageria.enfileirarParaResponsaveis({
          alunoId: String(alunoId),
          instituicao: String(aluno.instituicao || req.usuario?.instituicao || ''),
          preferenciaCanais: ['telegram', 'email'], // prioriza TG e e-mail como você pediu
          titulo,
          texto,
          html,
          meta: { tipo: 'nota_comportamental', faixa, nota }
        });
        resultados.queue = r;
        resultados.tried.push('queue');
      } catch (err) {
        resultados.queue = { ok: false, erro: String(err && err.message || err) };
      }
    }

    // 2) Fallback: envio direto por email
    if (!resultados.queue || resultados.queue.ok === false) {
      if (contatos.emails?.length) {
        const rEmail = await enviarEmailDireto({
          to: contatos.emails,
          subject: titulo,
          text: texto,
          html
        });
        resultados.email = { ...rEmail, to: contatos.emails };
        resultados.tried.push('email');
      } else {
        resultados.email = { ok: false, erro: 'Sem e-mails de responsáveis' };
      }
    }

    // 3) Fallback: envio direto Telegram (se tiver chatIds)
    if (!resultados.queue || resultados.queue.ok === false) {
      if (contatos.telegramIds?.length) {
        const rTg = await enviarTelegramDireto({ chatIds: contatos.telegramIds, text: texto });
        resultados.telegram = rTg;
        resultados.tried.push('telegram');
      } else {
        resultados.telegram = { ok: false, erro: 'Sem telegramChatId nos responsáveis' };
      }
    }

    const sucesso = Boolean(
      (resultados.queue && resultados.queue.ok) ||
      (resultados.email && resultados.email.ok) ||
      (resultados.telegram && resultados.telegram.ok)
    );

    return res.json({
      ok: sucesso,
      aluno: { _id: alunoId, nome: aluno.nome, turma: aluno.turma },
      faixa,
      nota: Number(nota || 0),
      comunicacao: { whatsappLink, resultados }
    });
  } catch (err) {
    console.error('[COMUNICACAO] nota-comportamental erro:', err);
    return res.status(500).json({ erro: 'Falha ao iniciar comunicação' });
  }
});

/* ---------------------------------------------
   POST /api/comunicacao/notificacao/:notifId
---------------------------------------------- */
router.post('/notificacao/:notifId', autenticar, async (req, res) => {
  try {
    const { notifId } = req.params;

    const n = await Notificacao.findById(notifId)
      .populate('aluno', 'nome turma instituicao responsaveis contatos')
      .lean();

    if (!n) return res.status(404).json({ erro: 'Notificação não encontrada' });
    const aluno = n.aluno || {};

    const { titulo, texto, html } = tplNotificacaoDeferida({ aluno, n });
    const mensageria = getMensageria(req);

    const contatos = extractContatos(aluno);
    const whatsappLink = buildWhatsappLink({ numeros: contatos.whatsapps, texto });

    const resultados = { tried: [] };

    // 1) Tenta mensageria/queue
    if (mensageria?.enfileirarParaResponsaveis) {
      try {
        const r = await mensageria.enfileirarParaResponsaveis({
          alunoId: String(aluno._id),
          instituicao: String(aluno.instituicao || req.usuario?.instituicao || ''),
          preferenciaCanais: ['telegram', 'email'],
          titulo,
          texto,
          html,
          meta: { tipo: 'notificacao_deferida', notificacaoId: String(n._id) }
        });
        resultados.queue = r;
        resultados.tried.push('queue');
      } catch (err) {
        resultados.queue = { ok: false, erro: String(err && err.message || err) };
      }
    }

    // 2) Fallback email
    if (!resultados.queue || resultados.queue.ok === false) {
      if (contatos.emails?.length) {
        const rEmail = await enviarEmailDireto({
          to: contatos.emails,
          subject: titulo,
          text: texto,
          html
        });
        resultados.email = { ...rEmail, to: contatos.emails };
        resultados.tried.push('email');
      } else {
        resultados.email = { ok: false, erro: 'Sem e-mails de responsáveis' };
      }
    }

    // 3) Fallback Telegram
    if (!resultados.queue || resultados.queue.ok === false) {
      if (contatos.telegramIds?.length) {
        const rTg = await enviarTelegramDireto({ chatIds: contatos.telegramIds, text: texto });
        resultados.telegram = rTg;
        resultados.tried.push('telegram');
      } else {
        resultados.telegram = { ok: false, erro: 'Sem telegramChatId nos responsáveis' };
      }
    }

    const sucesso = Boolean(
      (resultados.queue && resultados.queue.ok) ||
      (resultados.email && resultados.email.ok) ||
      (resultados.telegram && resultados.telegram.ok)
    );

    return res.json({
      ok: sucesso,
      aluno: { _id: aluno?._id, nome: aluno?.nome, turma: aluno?.turma },
      comunicacao: { whatsappLink, resultados }
    });
  } catch (err) {
    console.error('[COMUNICACAO] notificacao erro:', err);
    return res.status(500).json({ erro: 'Falha ao iniciar comunicação' });
  }
});

/* --------------------------------------------- */
router.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));
module.exports = router;
