const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');

// Usa HTTP direto na API do Telegram (evita instanciar 2 bots)
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TG_ENABLED   = String(process.env.TG_ENABLED || 'false').toLowerCase() === 'true';

function ensureTelegramReady(res) {
  if (!TG_ENABLED) return res.status(400).json({ ok:false, erro:'TG_ENABLED=false' });
  if (!TG_BOT_TOKEN) return res.status(400).json({ ok:false, erro:'TG_BOT_TOKEN ausente' });
  return null;
}

async function tgram(method, payload) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload || {})
  });
  const j = await r.json().catch(()=> ({}));
  if (!j.ok) throw new Error(j.description || `Telegram error ${r.status}`);
  return j.result;
}

/* =========================
   STATUS / DIAGNÓSTICO
   ========================= */
router.get('/status', autenticar, async (req, res) => {
  try {
    const err = ensureTelegramReady(res); if (err) return;
    const me = await tgram('getMe', {});
    const wh = await tgram('getWebhookInfo', {});
    res.json({
      ok: true,
      bot: { id: me.id, username: me.username },
      webhook: {
        url: wh.url,
        hasCustomCertificate: wh.has_custom_certificate,
        pending_update_count: wh.pending_update_count,
        last_error_date: wh.last_error_date,
        last_error_message: wh.last_error_message
      }
    });
  } catch (e) {
    res.status(500).json({ ok:false, erro: e.message });
  }
});

/* =========================
   TESTE DE ENVIO
   ========================= */
router.post('/test-send', autenticar, async (req, res) => {
  try {
    const err = ensureTelegramReady(res); if (err) return;
    const { chatId, text } = req.body || {};
    if (!chatId) return res.status(400).json({ ok:false, erro:'chatId obrigatório' });
    const result = await tgram('sendMessage', { chat_id: String(chatId), text: text || 'Teste CMDPII/CZS' });
    res.json({ ok:true, result });
  } catch (e) {
    res.status(500).json({ ok:false, erro:e.message });
  }
});

/* =========================
   VINCULAR MANUALMENTE (admin)
   ========================= */
router.post('/bind', autenticar, async (req, res) => {
  try {
    const err = ensureTelegramReady(res); if (err) return;
    const { alunoId, chatId } = req.body || {};
    if (!alunoId || !chatId) return res.status(400).json({ ok:false, erro:'alunoId e chatId obrigatórios' });

    const aluno = await Aluno.findById(alunoId);
    if (!aluno) return res.status(404).json({ ok:false, erro:'Aluno não encontrado' });

    // Guarda nível aluno (contatos.telegramChatId)
    aluno.contatos = aluno.contatos || {};
    aluno.contatos.telegramChatId = String(chatId);

    // Opcional: também salva no primeiro responsável (se existir)
    if (Array.isArray(aluno.responsaveis) && aluno.responsaveis.length) {
      aluno.responsaveis[0] = aluno.responsaveis[0] || {};
      aluno.responsaveis[0].telegramChatId = String(chatId);
    }
    await aluno.save();

    // Mensagem de boas-vindas
    try {
      await tgram('sendMessage', {
        chat_id: String(chatId),
        text: `Vínculo realizado com sucesso para o aluno ${aluno.nome} (${aluno.turma}). Agora você receberá comunicados da escola.`
      });
    } catch {}

    res.json({ ok:true, aluno:{ _id: aluno._id, nome: aluno.nome, turma: aluno.turma }, chatId: String(chatId) });
  } catch (e) {
    res.status(500).json({ ok:false, erro:e.message });
  }
});

/* =========================
   WEBHOOK DO TELEGRAM
   Configure:
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://SEU-DOMINIO/api/telegram/webhook
   ========================= */
router.post('/webhook', async (req, res) => {
  try {
    const err = ensureTelegramReady(res); if (err) return;
    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat) return res.json({ ok:true, ignored:true });

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Responsável';

    // Fluxo simples:
    // 1) /start → envia instrução de vínculo
    if (/^\/start\b/i.test(text)) {
      await tgram('sendMessage', {
        chat_id: chatId,
        text:
`Olá, ${name}! Este é o canal de comunicados do Colégio Militar Dom Pedro II - Cruzeiro do Sul.

Para vincular ao aluno, envie:
VINCULAR <ID_DO_ALUNO>

Exemplo:
VINCULAR 652f1c3e0d9a12a5c8f3b012

(Se não tiver o ID, peça à coordenação que faça o vínculo manual.)`
      });
      return res.json({ ok:true });
    }

    // 2) VINCULAR <ObjectId> → grava chatId no aluno
    const m = text.match(/^VINCULAR\s+([a-f0-9]{24})$/i);
    if (m) {
      const alunoId = m[1];
      if (!mongoose.isValidObjectId(alunoId)) {
        await tgram('sendMessage', { chat_id: chatId, text: 'ID inválido.' });
        return res.json({ ok:false, erro:'invalid id' });
      }
      const aluno = await Aluno.findById(alunoId);
      if (!aluno) {
        await tgram('sendMessage', { chat_id: chatId, text: 'Aluno não encontrado.' });
        return res.json({ ok:false, erro:'aluno not found' });
      }

      aluno.contatos = aluno.contatos || {};
      aluno.contatos.telegramChatId = chatId;

      if (Array.isArray(aluno.responsaveis) && aluno.responsaveis.length) {
        aluno.responsaveis[0] = aluno.responsaveis[0] || {};
        aluno.responsaveis[0].telegramChatId = chatId;
      }
      await aluno.save();

      await tgram('sendMessage', {
        chat_id: chatId,
        text: `✅ Vinculado ao aluno ${aluno.nome} (${aluno.turma}). Você passará a receber comunicados.`
      });
      return res.json({ ok:true, vinculado: aluno._id });
    }

    // 3) Qualquer outra mensagem
    await tgram('sendMessage', {
      chat_id: chatId,
      text: 'Não entendi. Envie /start para instruções.'
    });
    res.json({ ok:true });
  } catch (e) {
    console.error('[telegram webhook] erro:', e.message);
    res.status(200).json({ ok:false }); // Telegram considera 200 OK mesmo em falha
  }
});

module.exports = router;
