// backend/routes/api/comunicacao.js
const express = require('express');
const router = express.Router();

const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// >>> usa o util robusto com fallback 465→587
const mailer = require('../../utils/mailer');

/* ---------------------------------------------
   Util – pegar mensageria (não quebra se faltar)
---------------------------------------------- */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/* ---------------------------------------------
   Util – extrair contatos (email)
   (removido WhatsApp/Telegram para evitar fallback)
---------------------------------------------- */
function extractContatos(aluno) {
  const c = aluno?.contatos || {};
  const rs = Array.isArray(aluno?.responsaveis) ? aluno.responsaveis : [];

  const emails = new Set();

  // contatos do aluno
  if (c.email) emails.add(String(c.email).trim());
  if (c.emailResponsavel) emails.add(String(c.emailResponsavel).trim());

  // legado direto no aluno
  if (aluno?.email) emails.add(String(aluno.email).trim());

  // responsáveis
  for (const r of rs) {
    if (r?.email) emails.add(String(r.email).trim());
    if (r?.emailResponsavel) emails.add(String(r.emailResponsavel).trim());
  }

  return { emails: [...emails].filter(Boolean) };
}

/* ---------------------------------------------
   Templates
---------------------------------------------- */
function tplNotaComportamental({ aluno, faixa, nota }) {
  const titulo = `Aviso de comportamento — ${faixa || 'Informação'}`;
  const texto =
`Prezados responsáveis de ${aluno?.nome || 'seu(a) filho(a)'} (${aluno?.turma || '—'}),

Informamos que a nota comportamental atual é ${Number(nota || 0).toFixed(2)}${faixa ? ` (${faixa})` : ''}.
Solicitamos acompanhamento e alinhamento com a coordenação para as devidas providências.

Atenciosamente,
Coordenação CMDPII/CZS`;

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#111">
      <p>Prezados responsáveis de <strong>${aluno?.nome || 'seu(a) filho(a)'}</strong> (${aluno?.turma || '—'}),</p>
      <p>Informamos que a nota comportamental atual é <strong>${Number(nota || 0).toFixed(2)}</strong>${faixa ? ` (<strong>${faixa}</strong>)` : ''}.</p>
      <p>Solicitamos acompanhamento e alinhamento com a coordenação para as devidas providências.</p>
      <p>Atenciosamente,<br/>Coordenação CMDPII/CZS</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0" />
      <p style="font-size:12px;color:#555">Mensagem automática do Sistema Escolar CMDPII/CZS.</p>
    </div>
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
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#111">
      <p>Prezados responsáveis de <strong>${aluno?.nome || 'seu(a) filho(a)'}</strong> (${aluno?.turma || '—'}),</p>
      <p>Comunicamos que a notificação registrada foi <strong>deferida</strong> pela coordenação.</p>
      ${resumo ? `<pre style="background:#f6f6f6;border:1px solid #e5e7eb;border-radius:6px;padding:10px">${resumo}</pre>` : ''}
      <p>Em caso de dúvidas, entrem em contato com a escola.</p>
      <p>Atenciosamente,<br/>Coordenação CMDPII/CZS</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0" />
      <p style="font-size:12px;color:#555">Mensagem automática do Sistema Escolar CMDPII/CZS.</p>
    </div>
  `;
  return { titulo, texto, html };
}

/* ---------------------------------------------
   GET /api/comunicacao/status  (diagnóstico)
---------------------------------------------- */
router.get('/status', autenticar, (req, res) => {
  const m = getMensageria(req);
  const st = m?.getStatus ? m.getStatus() : null;
  // status básico do mailer util
  const mailStatus = {
    MAIL_ENABLED: !!mailer?.MAIL_ENABLED,
    SMTP_HOST: mailer?.SMTP_HOST,
    SMTP_PORT: mailer?.SMTP_PORT,
    MAIL_USER: mailer?.MAIL_USER ? '(definido)' : '(vazio)'
  };
  res.json({ ok: true, mensageria: st, mailer: mailStatus });
});

/* ---------------------------------------------
   POST /api/comunicacao/nota-comportamental/:alunoId
   -> SOMENTE E-MAIL (sem WhatsApp/Telegram)
---------------------------------------------- */
router.post('/nota-comportamental/:alunoId', autenticar, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { nota, faixa } = req.body || {};

    const aluno = await Aluno.findById(alunoId)
      .select('nome turma instituicao responsaveis contatos email')
      .lean();

    if (!aluno) return res.status(404).json({ ok:false, erro: 'Aluno não encontrado' });

    const { titulo, texto, html } = tplNotaComportamental({ aluno, faixa, nota });
    const mensageria = getMensageria(req);
    const { emails } = extractContatos(aluno);

    if (!emails.length) {
      return res.status(400).json({ ok:false, erro: 'Nenhum e-mail de responsável cadastrado para este aluno.' });
    }

    // 1) tentar pela mensageria (se existir)
    let tentou = false;
    let resultados = null;
    let emailEnviado = false;

    if (mensageria?.enfileirarParaResponsaveis) {
      tentou = true;
      try {
        resultados = await mensageria.enfileirarParaResponsaveis({
          alunoId,
          instituicao: String(aluno.instituicao || req.usuario?.instituicao || ''),
          preferenciaCanais: ['email'], // força e-mail
          titulo,
          texto,
          html,
          meta: { tipo: 'nota_comportamental', faixa, nota }
        });
        emailEnviado = Boolean(resultados?.ok || resultados?.email?.ok);
      } catch (e) {
        console.warn('[COMUNICACAO] mensageria falhou, tentando SMTP direto:', e?.message || e);
      }
    }

    // 2) fallback: SMTP direto via util mailer
    if (!emailEnviado) {
      try {
        await mailer.sendMail({
          to: emails.join(','),
          subject: titulo,
          html,
          text: texto
        });
        emailEnviado = true;
      } catch (e) {
        const detalhe = e?.message || 'SMTP indisponível';
        return res.status(502).json({
          ok: false,
          erro: 'Envio por e-mail indisponível (mensageria e SMTP falharam).',
          detalhe
        });
      }
    }

    return res.json({
      ok: true,
      comunicacao: { emailEnviado, to: emails },
      tentou,
      statusMensageria: mensageria?.getStatus ? mensageria.getStatus() : null,
      contatos: { emails },
      resultados
    });
  } catch (err) {
    console.error('[COMUNICACAO] nota-comportamental erro:', err);
    return res.status(500).json({ ok:false, erro: 'Falha ao enviar e-mail.' });
  }
});

/* ---------------------------------------------
   POST /api/comunicacao/notificacao/:notifId
   -> SOMENTE E-MAIL (sem WhatsApp/Telegram)
---------------------------------------------- */
router.post('/notificacao/:notifId', autenticar, async (req, res) => {
  try {
    const { notifId } = req.params;

    const n = await Notificacao.findById(notifId)
      .populate('aluno', 'nome turma instituicao responsaveis contatos email')
      .lean();

    if (!n) return res.status(404).json({ ok:false, erro: 'Notificação não encontrada' });

    const aluno = n.aluno || {};
    const { titulo, texto, html } = tplNotificacaoDeferida({ aluno, n });
    const mensageria = getMensageria(req);
    const { emails } = extractContatos(aluno);

    if (!emails.length) {
      return res.status(400).json({ ok:false, erro: 'Nenhum e-mail de responsável cadastrado para este aluno.' });
    }

    // 1) mensageria
    let tentou = false;
    let resultados = null;
    let emailEnviado = false;

    if (mensageria?.enfileirarParaResponsaveis) {
      tentou = true;
      try {
        resultados = await mensageria.enfileirarParaResponsaveis({
          alunoId: String(aluno._id || ''),
          instituicao: String(aluno.instituicao || req.usuario?.instituicao || ''),
          preferenciaCanais: ['email'], // força e-mail
          titulo,
          texto,
          html,
          meta: { tipo: 'notificacao_deferida', notificacaoId: String(n._id) }
        });
        emailEnviado = Boolean(resultados?.ok || resultados?.email?.ok);
      } catch (e) {
        console.warn('[COMUNICACAO] mensageria falhou, tentando SMTP direto:', e?.message || e);
      }
    }

    // 2) fallback SMTP via util mailer
    if (!emailEnviado) {
      try {
        await mailer.sendMail({
          to: emails.join(','),
          subject: titulo,
          html,
          text: texto
        });
        emailEnviado = true;
      } catch (e) {
        const detalhe = e?.message || 'SMTP indisponível';
        return res.status(502).json({
          ok: false,
          erro: 'Envio por e-mail indisponível (mensageria e SMTP falharam).',
          detalhe
        });
      }
    }

    return res.json({
      ok: true,
      comunicacao: { emailEnviado, to: emails },
      tentou,
      statusMensageria: mensageria?.getStatus ? mensageria.getStatus() : null,
      contatos: { emails },
      resultados
    });
  } catch (err) {
    console.error('[COMUNICACAO] notificacao erro:', err);
    return res.status(500).json({ ok:false, erro: 'Falha ao enviar e-mail.' });
  }
});

/* --------------------------------------------- */
router.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
module.exports = router;
