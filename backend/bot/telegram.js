// backend/bot/telegram.js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

// ====== Conexão Mongo ======
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGO_URI);

// ====== Model Aluno (exemplo) ======
const AlunoSchema = new mongoose.Schema({
  nomeCompleto: { type: String, required: true, index: true },
  turma: { type: String, required: true, index: true },
  chatIdResponsavel: { type: String, default: "" },
  // se quiser permitir múltiplos responsáveis:
  // responsaveis: [{ nome: String, chatId: String }]
});
const Aluno = mongoose.model('Aluno', AlunoSchema);

// ====== Bot ======
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Estado simples em memória (troque por Redis se quiser robustez)
const pending = new Map(); // key: chatId -> { step, nomeAluno, turma }

bot.start(async (ctx) => {
  const chatId = String(ctx.chat.id);

  // Se já está associado a alguém, pode só dar boas-vindas
  const jaVinculado = await Aluno.findOne({ chatIdResponsavel: chatId }).lean();
  if (jaVinculado) {
    return ctx.reply(`✅ Você já está ativo(a) para o(a) aluno(a): ${jaVinculado.nomeCompleto} (${jaVinculado.turma}).`);
  }

  pending.set(chatId, { step: 'nome' });
  await ctx.reply(
    '👋 Olá! Para concluirmos sua ativação, responda:\n\n1) Digite o NOME COMPLETO do(a) aluno(a).'
  );
});

bot.hears(/^\/sair$/i, async (ctx) => {
  const chatId = String(ctx.chat.id);
  const aluno = await Aluno.findOne({ chatIdResponsavel: chatId });
  if (!aluno) {
    return ctx.reply('Você não está vinculado a nenhum aluno no momento.');
  }
  aluno.chatIdResponsavel = "";
  await aluno.save();
  return ctx.reply('🔕 Você foi desvinculado(a). Para reativar, envie /start.');
});

bot.on('text', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const state = pending.get(chatId);
  const texto = (ctx.message.text || '').trim();

  // Se não está no fluxo de ativação, ignore (ou trate como ajuda)
  if (!state) return;

  try {
    if (state.step === 'nome') {
      state.nomeAluno = texto;
      state.step = 'turma';
      pending.set(chatId, state);
      return ctx.reply('2) Agora digite a TURMA (ex: 7º A, 9º C, 1º EM B).');
    }

    if (state.step === 'turma') {
      state.turma = texto;

      // Procura aluno
      const aluno = await Aluno.findOne({
        nomeCompleto: new RegExp(`^${state.nomeAluno}$`, 'i'),
        turma: new RegExp(`^${state.turma}$`, 'i')
      });

      if (!aluno) {
        // Dica: se sua base tem homônimos, aqui você poderia pedir data de nascimento ou outro dado leve
        state.step = 'nome';
        pending.set(chatId, state);
        return ctx.reply(
          '❌ Não encontramos esse aluno/turma.\nTente novamente:\n1) Digite o NOME COMPLETO do(a) aluno(a).'
        );
      }

      // Associa chatId ao aluno
      aluno.chatIdResponsavel = chatId;
      await aluno.save();
      pending.delete(chatId);

      await ctx.reply(
        `✅ Ativado(a) com sucesso para: ${aluno.nomeCompleto} (${aluno.turma}).\nVocê passará a receber mensagens da escola aqui.`
      );
      // Mensagem de boas-vindas institucional (opcional)
      await ctx.reply(
        '📣 CMDPII/CZS: este é o canal oficial de mensagens. Para sair a qualquer momento, envie /sair.'
      );
    }
  } catch (err) {
    console.error('Erro no fluxo do bot:', err);
    pending.delete(chatId);
    await ctx.reply('⚠️ Ocorreu um erro. Por favor, envie /start e tente novamente.');
  }
});

bot.launch();
console.log('🤖 Bot do Telegram iniciado.');

// Para desligar com graça (opcional)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
