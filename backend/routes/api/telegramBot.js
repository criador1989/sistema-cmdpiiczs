// backend/routes/api/telegramBot.js
// Captura telegramChatId dos responsáveis quando enviarem /start <alunoId> ao seu bot.
// Requer: TG_ENABLED=true e TG_BOT_TOKEN no .env
// Depende de: node-telegram-bot-api, models/Aluno

const express = require('express');
const router = express.Router();
const TelegramBot = require('node-telegram-bot-api');
const Aluno = require('../../models/Aluno');

const TG_ENABLED   = String(process.env.TG_ENABLED || 'false') === 'true';
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_USERNAME  = process.env.TG_BOT_USERNAME || 'seu_bot'; // sem @

let bot = null;

// Inicia o bot (polling) apenas se habilitado e com token
function ensureBot() {
  if (!TG_ENABLED) {
    console.log('[TELEGRAM] Desativado (TG_ENABLED=false)');
    return null;
  }
  if (!TG_BOT_TOKEN) {
    console.log('[TELEGRAM] Sem token (TG_BOT_TOKEN vazio)');
    return null;
  }
  if (bot) return bot;

  bot = new TelegramBot(TG_BOT_TOKEN, { polling: true });
  console.log('[TELEGRAM] Bot iniciado (polling ON)');

  // Comando /start <alunoId>
  bot.onText(/^\/start(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const payload = (match && match[1]) ? String(match[1]).trim() : '';

    if (!payload) {
      return bot.sendMessage(
        chatId,
        'Olá! Para vincular-se ao aluno, use:\n' +
        '/start C0D1G0\n\n' +
        'Dica: clicando no link/QR enviado pela escola, o vínculo acontece automático.'
      );
    }

    try {
      const aluno = await Aluno.findById(payload);
      if (!aluno) {
        return bot.sendMessage(chatId, 'Código inválido. Verifique com a escola.');
      }

      // garante subdocumento contatos e grava chatId
      const set = { 'contatos.telegramChatId': String(chatId) };
      if (!aluno.contatos) set['contatos'] = { telegramChatId: String(chatId) };

      await Aluno.updateOne({ _id: aluno._id }, { $set: set });

      const nome = aluno.nome || 'o aluno';
      await bot.sendMessage(
        chatId,
        `Vínculo concluído com ${nome}. Agora os comunicados poderão chegar por aqui também.`
      );

      console.log('[TELEGRAM] Vinculado chatId=%s ao aluno=%s', chatId, aluno._id);
    } catch (e) {
      console.warn('[TELEGRAM] Falha no /start:', e.message);
      bot.sendMessage(chatId, 'Houve um problema ao vincular. Tente novamente mais tarde.');
    }
  });

  return bot;
}

// --------- Util: instância do bot (se disponível) ----------
function getBot() {
  return ensureBot();
}

// --------- ROTAS HTTP de apoio ao front --------------------

// Gera link t.me para um aluno (front pode usar para botão/QR)
router.get('/start-link/:alunoId', (req, res) => {
  if (!TG_ENABLED || !TG_BOT_TOKEN) {
    return res.status(400).json({ ok: false, msg: 'Telegram desabilitado ou sem token.' });
  }
  const alunoId = req.params.alunoId;
  const url = `https://t.me/${TG_USERNAME}?start=${alunoId}`;
  return res.json({ ok: true, url, username: TG_USERNAME });
});

// Status geral do bot
router.get('/status', (req, res) => {
  const on = !!bot;
  res.json({ ok: true, enabled: TG_ENABLED, hasToken: !!TG_BOT_TOKEN, running: on, username: TG_USERNAME });
});

// Status do vínculo para um aluno (se já tem chatId salvo)
router.get('/status/:alunoId', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.alunoId).select('contatos.nomeResponsavel contatos.emailResponsavel contatos.telefoneResponsavel contatos.telegramChatId').lean();
    if (!aluno) return res.status(404).json({ ok: false, msg: 'Aluno não encontrado' });

    return res.json({
      ok: true,
      vinculado: !!aluno?.contatos?.telegramChatId,
      chatId: aluno?.contatos?.telegramChatId || null,
      contatos: aluno?.contatos || {}
    });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: 'Erro ao consultar status', erro: e.message });
  }
});

// Envia mensagem de teste para o responsável (se já vinculado)
router.post('/test/:alunoId', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.alunoId).select('nome turma contatos.telegramChatId').lean();
    if (!aluno) return res.status(404).json({ ok: false, msg: 'Aluno não encontrado' });

    const chatId = aluno?.contatos?.telegramChatId;
    if (!chatId) return res.status(400).json({ ok: false, msg: 'Responsável ainda não vinculou o Telegram (sem chatId).' });

    const tg = getBot();
    if (!tg) return res.status(500).json({ ok: false, msg: 'Bot do Telegram não está ativo.' });

    const texto =
      `*CMDPII/CZS* — teste de comunicação ✅\n\n` +
      `Aluno: *${aluno.nome}* (${aluno.turma || '-'})\n` +
      `_Se recebeu esta mensagem, o vínculo está funcionando._`;

    await tg.sendMessage(chatId, texto, { parse_mode: 'Markdown' });
    return res.json({ ok: true, sent: true });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: 'Falha ao enviar teste', erro: e.message });
  }
});

// Ao carregar este módulo, garante que o bot esteja ligado (se habilitado)
ensureBot();

module.exports = router;
