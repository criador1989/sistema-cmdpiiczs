// backend/bot/telegram-onboarding.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

// ====== Conexão Mongo ======
mongoose.set('strictQuery', false);
if (!mongoose.connection.readyState) {
  mongoose.connect(process.env.MONGO_URI);
}

// ====== Model Aluno ======
const Aluno = require('../models/Aluno'); // ajuste o caminho se preciso

// ====== Bot (RECEPÇÃO) ======
const token = process.env.TG_BOT_TOKEN;
if (!token) {
  console.error('[telegram-onboarding] TG_BOT_TOKEN ausente no .env');
  process.exit(1);
}

// Aqui usamos polling=true porque este processo só "ouve" mensagens
const bot = new TelegramBot(token, { polling: true });

/**
 * Opcional: controle simples de estado em memória.
 * (Se quiser robustez total, troque por Mongo/Redis para não perder estado em restart.)
 */
const pending = new Map(); // chatId -> { step, nomeAluno, turma }

bot.onText(/^\/start(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = String(msg.chat.id);

  // 0) Se já vinculado, avisa:
  const alunoVinculado = await Aluno.findOne({
    $or: [
      { chatIdResponsavel: chatId },
      { chatIdsResponsaveis: chatId }
    ]
  }).lean();

  if (alunoVinculado) {
    return bot.sendMessage(chatId, `✅ Você já está ativo(a) para: ${alunoVinculado.nomeCompleto} (${alunoVinculado.turma}).`);
  }

  // 1) Deep-link opcional: /start TOKEN
  const tokenParam = (match && match[1]) ? match[1].trim() : null;
  if (tokenParam) {
    try {
      // Ex.: decodifique o token e ache o aluno direto
      // Aqui é só um exemplo simples: token = _id do aluno
      const aluno = await Aluno.findById(tokenParam);
      if (aluno) {
        // Grava em 1 ou n campos
        aluno.chatIdResponsavel = chatId;
        if (!aluno.chatIdsResponsaveis.includes(chatId)) {
          aluno.chatIdsResponsaveis.push(chatId);
        }
        await aluno.save();
        return bot.sendMessage(chatId, `✅ Ativado(a) para: ${aluno.nomeCompleto} (${aluno.turma}).`);
      }
    } catch (e) {
      // segue fluxo normal caso token não seja válido
    }
  }

  // 2) Fluxo padrão (perguntas)
  pending.set(chatId, { step: 'nome' });
  bot.sendMessage(chatId, '👋 Olá! Para ativar, responda:\n\n1) Digite o NOME COMPLETO do(a) aluno(a).');
});

bot.onText(/^\/sair$/i, async (msg) => {
  const chatId = String(msg.chat.id);
  const aluno = await Aluno.findOne({
    $or: [
      { chatIdResponsavel: chatId },
      { chatIdsResponsaveis: chatId }
    ]
  });

  if (!aluno) {
    return bot.sendMessage(chatId, 'Você não está vinculado(a) a nenhum aluno.');
  }

  if (aluno.chatIdResponsavel === chatId) {
    aluno.chatIdResponsavel = "";
  }
  aluno.chatIdsResponsaveis = (aluno.chatIdsResponsaveis || []).filter(id => id !== chatId);
  await aluno.save();

  bot.sendMessage(chatId, '🔕 Você foi desvinculado(a). Para reativar, envie /start.');
});

bot.on('message', async (msg) => {
  // Ignora comandos, tratamos só texto "livre" do fluxo
  if (msg.text && msg.text.startsWith('/')) return;

  const chatId = String(msg.chat.id);
  const state = pending.get(chatId);
  const texto = (msg.text || '').trim();

  if (!state) return; // fora do fluxo de ativação

  try {
    if (state.step === 'nome') {
      state.nomeAluno = texto;
      state.step = 'turma';
      pending.set(chatId, state);
      return bot.sendMessage(chatId, '2) Agora digite a TURMA (ex: 6º B, 9º C, 1º EM B).');
    }

    if (state.step === 'turma') {
      state.turma = texto;

      const aluno = await Aluno.findOne({
        nomeCompleto: new RegExp(`^${state.nomeAluno}$`, 'i'),
        turma: new RegExp(`^${state.turma}$`, 'i')
      });

      if (!aluno) {
        state.step = 'nome';
        pending.set(chatId, state);
        return bot.sendMessage(chatId, '❌ Não encontramos esse aluno/turma.\nTente novamente:\n1) Digite o NOME COMPLETO do(a) aluno(a).');
      }

      aluno.chatIdResponsavel = chatId;
      if (!aluno.chatIdsResponsaveis.includes(chatId)) {
        aluno.chatIdsResponsaveis.push(chatId);
      }
      await aluno.save();

      pending.delete(chatId);

      await bot.sendMessage(chatId, `✅ Ativado(a) com sucesso para: ${aluno.nomeCompleto} (${aluno.turma}).`);
      await bot.sendMessage(chatId, '📣 CMDPII/CZS: este é o canal oficial de mensagens. Para sair a qualquer momento, envie /sair.');
    }
  } catch (err) {
    console.error('[telegram-onboarding] Erro:', err);
    pending.delete(chatId);
    bot.sendMessage(chatId, '⚠️ Ocorreu um erro. Por favor, envie /start e tente novamente.');
  }
});

console.log('🤖 telegram-onboarding: escutando /start...');
