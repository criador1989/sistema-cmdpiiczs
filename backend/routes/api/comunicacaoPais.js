// backend/routes/api/comunicacaoPais.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const ComunicacaoPais = require('../../models/ComunicacaoPais'); // ajuste se o nome do model for diferente

// Fallback de e-mail
const { safeSendMail, MAIL_ENABLED } = require('../../utils/mailer');

/* =========================
   HELPERS
   ========================= */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

function normalizarListaEmails(emails) {
  if (!emails) return [];
  if (Array.isArray(emails)) {
    return emails
      .flatMap(e => String(e || '').split(/[;, ]+/))
      .map(s => s.trim())
      .filter(Boolean);
  }
  return String(emails)
    .split(/[;, ]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/* =========================
   ROTAS FIXAS (primeiro!)
   ========================= */

// Status protegido (usa sessão/jwt)
router.get('/status', autenticar, (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus ? m.getStatus() : {
      nodeEnv: process.env.NODE_ENV || '(unset)',
      MAIL_ENABLED: Boolean(MAIL_ENABLED),
      TG_ENABLED: false,
      hasTransporter: false,
      hasTelegramBot: false,
      transportMode: MAIL_ENABLED ? 'MAIL_ONLY' : 'NONE',
    };
    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('Erro GET /api/comunicacao/status:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

// (Opcional) Status público para diagnóstico rápido
// REMOVA depois de testar em produção, se quiser.
router.get('/status-public', async (req, res) => {
  try {
    const m = getMensageria(req);
    const st = m?.getStatus ? m.getStatus() : {
      nodeEnv: process.env.NODE_ENV || '(unset)',
      MAIL_ENABLED: Boolean(MAIL_ENABLED),
      TG_ENABLED: false,
      hasTransporter: false,
      hasTelegramBot: false,
      transportMode: MAIL_ENABLED ? 'MAIL_ONLY' : 'NONE',
    };
    return res.json({ ok: true, mensageria: st });
  } catch (e) {
    console.error('Erro GET /api/comunicacao/status-public:', e);
    return res.status(500).json({ mensagem: 'Erro ao buscar comunicação.' });
  }
});

/* ======================================================
   ENVIO DE COMUNICADO (resposta rápida + background)
   ====================================================== */

/**
 * POST /api/comunicacao/enviar
 * Body esperado (flexível / tolerante):
 * {
 *   "titulo": "Assunto do comunicado",
 *   "texto": "Corpo em texto",
 *   "html": "<p>Corpo em HTML</p>",         // opcional
 *   "alunoId": "6655...",                   // opcional: envia via mensageria para responsáveis
 *   "preferenciaCanais": ["email","telegram","whatsapp"], // opcional
 *   "emails": ["resp@ex.com","outro@ex.com"] // opcional: fallback/uso direto por e-mail
 *   "notificacao": "66aa..."                // opcional: referência a Notificação
 * }
 */
router.post('/enviar', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ ok: false, erro: 'Não autenticado.' });

    const {
      titulo,
      texto,
      html,
      alunoId,
      preferenciaCanais = ['email', 'telegram', 'whatsapp'],
      emails,
      notificacao,
      meta = {},
    } = req.body || {};

    if (!titulo || !(texto || html)) {
      return res.status(400).json({ ok: false, erro: 'Informe ao menos "titulo" e "texto" ou "html".' });
    }

    // Tenta registrar o comunicado (se o model existir e o schema permitir)
    let registro = null;
    try {
      const docPayload = {
        instituicao: inst,
        titulo: String(titulo),
        texto: texto ? String(texto) : '',
        html: html ? String(html) : '',
        preferenciaCanais: Array.isArray(preferenciaCanais) ? preferenciaCanais : ['email'],
        notificacao: (notificacao && mongoose.isValidObjectId(notificacao)) ? new mongoose.Types.ObjectId(notificacao) : undefined,
        alunoId: (alunoId && mongoose.isValidObjectId(alunoId)) ? new mongoose.Types.ObjectId(alunoId) : undefined,
        canais: undefined,                 // opcional no seu schema
        destinatarios: undefined,          // opcional no seu schema
        criadoPor: req.usuario?._id,       // se seu schema tiver
        criadoEm: new Date(),
        meta: { origem: 'manual', ...meta }
      };
      // remove undefineds
      Object.keys(docPayload).forEach(k => docPayload[k] === undefined && delete docPayload[k]);

      registro = await ComunicacaoPais.create(docPayload);
    } catch (e) {
      console.warn('[COMUNICACAO] Falha ao registrar documento (seguirá envio mesmo assim):', e?.message || e);
    }

    // Resposta imediata (front não trava)
    res.json({ ok: true, queued: true, id: registro?._id });

    // Disparo em background
    Promise.resolve().then(async () => {
      try {
        const mensageria = getMensageria(req);

        // 1) Se veio alunoId E houver mensageria → enfileirar para responsáveis
        if (alunoId && mongoose.isValidObjectId(alunoId) && mensageria?.enfileirarParaResponsaveis) {
          const payload = {
            alunoId: String(alunoId),
            instituicao: String(inst),
            preferenciaCanais: Array.isArray(preferenciaCanais) ? preferenciaCanais : ['email'],
            titulo: String(titulo),
            texto: texto ? String(texto) : '',
            html: html ? String(html) : `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${String(texto || '')}</pre>`,
            meta: { tipo: 'comunicado_manual', comunicacaoId: String(registro?._id || ''), ...meta }
          };

          const resp = await mensageria.enfileirarParaResponsaveis(payload);
          if (!resp?.ok) {
            console.warn('[COMUNICACAO] Mensageria retornou falha:', resp);
          }
          return; // priorizamos a mensageria neste caso
        }

        // 2) Se foram passados e-mails (envio direto por SMTP como fallback/uso direto)
        const listaEmails = normalizarListaEmails(emails);
        if (listaEmails.length && MAIL_ENABLED) {
          const mailRes = await safeSendMail({
            bcc: listaEmails.join(','),
            subject: String(titulo),
            text: texto ? String(texto) : '',
            html: html ? String(html) : `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${String(texto || '')}</pre>`,
          });
          if (!mailRes.ok && !mailRes.skipped) {
            console.error('[COMUNICACAO] Envio por e-mail falhou:', mailRes.error);
          }
          return;
        }

        // 3) Se houver uma mensageria genérica, tente um método genérico (se existir)
        if (mensageria?.enfileirar) {
          const gen = await mensageria.enfileirar({
            instituicao: String(inst),
            preferenciaCanais: Array.isArray(preferenciaCanais) ? preferenciaCanais : ['email'],
            titulo: String(titulo),
            texto: texto ? String(texto) : '',
            html: html ? String(html) : `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${String(texto || '')}</pre>`,
            meta: { tipo: 'comunicado_manual_generico', comunicacaoId: String(registro?._id || ''), ...meta }
          });
          if (!gen?.ok) {
            console.warn('[COMUNICACAO] Mensageria genérica falhou:', gen);
          }
          return;
        }

        // 4) Sem mensageria e sem e-mails → nada a fazer
        console.warn('[COMUNICACAO] Nenhuma rota de envio disponível (mensageria ausente e/e ou MAIL_ENABLED=false, emails vazios).');

      } catch (bgErr) {
        console.error('[COMUNICACAO] Erro no envio em background:', bgErr && bgErr.stack ? bgErr.stack : bgErr);
      }
    });

  } catch (e) {
    console.error('Erro POST /api/comunicacao/enviar:', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao preparar envio.' });
  }
});

/* ======================================================
   ROTAS DINÂMICAS / CONSULTAS (deixe por último)
   ====================================================== */

// Exemplo de consulta por notificacao (evita colisão com /status)
router.get('/por-notificacao/:notificacao', autenticar, async (req, res) => {
  try {
    const { notificacao } = req.params;
    if (!mongoose.isValidObjectId(notificacao)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "notificacao" inválido.' });
    }

    const doc = await ComunicacaoPais
      .findOne({ notificacao: new mongoose.Types.ObjectId(notificacao) })
      .lean();

    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('Erro GET comunicacao por-notificacao:', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

// (Se você realmente precisar manter uma rota genérica, deixe-a por último
// e valide o ObjectId para não colidir com caminhos fixos)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetro "id" inválido.' });
    }
    const doc = await ComunicacaoPais.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });
    return res.json({ ok: true, data: doc });
  } catch (e) {
    console.error('Erro GET comunicacao :id', e);
    return res.status(500).json({ ok: false, erro: 'Falha ao buscar registro.' });
  }
});

module.exports = router;
