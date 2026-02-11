// backend/models/Aluno.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

const publicViewSchema = new Schema({
  enabled:   { type: Boolean, default: false },
  token:     { type: String, default: null, index: true },
  createdAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { _id: false });

// 👇 Subdocumento de contatos (retrocompatível)
const contatosSchema = new Schema({
  emailResponsavel: { type: String, trim: true, default: null },
  whatsapp:         { type: String, trim: true, default: null }, // ex: 5599999999999
  telegramChatId:   { type: String, trim: true, default: null }, // legado: será migrado para chatIdsResponsaveis
}, { _id: false });

/**
 * 👇 Subdocumento de alertas (controle de disparos)
 */
const alertasSchema = new Schema({
  npRegularEnviadoAt: { type: Date, default: null },
  npRegularUltimaNota:{ type: Number, default: null },
}, { _id: false });

const alunoSchema = new Schema({
  nome:           { type: String, required: true, trim: true },
  turma:          { type: String, required: true, trim: true },
  comportamento:  { type: Number, default: 8.00, min: 0, max: 10 },
  dataEntrada:    { type: Date, required: true },
  nascimento:     { type: Date },

  nomePai:        { type: String, trim: true },
  nomeMae:        { type: String, trim: true },
  telefone:       { type: String, trim: true },
  endereco:       { type: String, trim: true },

  codigoAcesso:   { type: String, required: true, trim: true },

  foto:           { type: String, default: null },
  fotoPublicId:   { type: String, default: null },
  fotoThumb:      { type: String, default: null },

  // 🔓 link público (somente leitura)
  publicView:     { type: publicViewSchema, default: () => ({}) },

  // 👇 Contatos (compat)
  contatos:       { type: contatosSchema, default: () => ({}) },

  // 👇 Alertas
  alertas:        { type: alertasSchema, default: () => ({}) },

  // 👇 Integração Telegram
  chatIdResponsavel:    { type: String, trim: true, default: "" },
  chatIdsResponsaveis:  { type: [String], default: [] },

  // 🔐 multi-tenant (ObjectId da Instituicao)
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },

}, { timestamps: true });

/** ============================
 *  Helpers (instância)
 *  ============================
 */
alunoSchema.methods.addChatId = function addChatId(chatId) {
  const id = String(chatId || '').trim();
  if (!id) return;
  if (!this.chatIdsResponsaveis) this.chatIdsResponsaveis = [];
  if (!this.chatIdsResponsaveis.includes(id)) {
    this.chatIdsResponsaveis.push(id);
  }
  if (!this.chatIdResponsavel) this.chatIdResponsavel = id;
};

alunoSchema.methods.removeChatId = function removeChatId(chatId) {
  const id = String(chatId || '').trim();
  if (!id) return;
  this.chatIdsResponsaveis = (this.chatIdsResponsaveis || []).filter(c => c !== id);
  if (this.chatIdResponsavel === id) {
    this.chatIdResponsavel = this.chatIdsResponsaveis[0] || "";
  }
};

alunoSchema.methods.getAllChatIds = function getAllChatIds() {
  const arr = new Set([...(this.chatIdsResponsaveis || [])]);
  if (this.chatIdResponsavel) arr.add(this.chatIdResponsavel);
  if (this.contatos?.telegramChatId) arr.add(this.contatos.telegramChatId);
  return Array.from(arr);
};

/** ============================
 *  Pré-validate
 *  ============================
 */
alunoSchema.pre('validate', function (next) {
  if (!this.codigoAcesso) {
    this.codigoAcesso = crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  if (!Array.isArray(this.chatIdsResponsaveis)) {
    this.chatIdsResponsaveis = (this.chatIdsResponsaveis ? [this.chatIdsResponsaveis] : []);
  }

  const legado = this.contatos?.telegramChatId ? String(this.contatos.telegramChatId).trim() : '';
  if (legado) {
    if (!this.chatIdsResponsaveis.includes(legado)) {
      this.chatIdsResponsaveis.push(legado);
    }
    if (!this.chatIdResponsavel) {
      this.chatIdResponsavel = legado;
    }
  }

  if (this.chatIdResponsavel) {
    const id = String(this.chatIdResponsavel).trim();
    if (id && !this.chatIdsResponsaveis.includes(id)) {
      this.chatIdsResponsaveis.push(id);
    }
  }

  this.chatIdsResponsaveis = Array.from(
    new Set((this.chatIdsResponsaveis || []).map(s => String(s || '').trim()).filter(Boolean))
  );

  next();
});

/** ============================
 *  Índices
 *  ============================
 */
alunoSchema.index({ instituicao: 1, codigoAcesso: 1 }, { unique: true, sparse: true });
alunoSchema.index({ instituicao: 1, turma: 1, nome: 1 });
alunoSchema.index({ 'publicView.token': 1 }, { unique: true, sparse: true });
alunoSchema.index({ instituicao: 1, chatIdResponsavel: 1 }, { sparse: true });
alunoSchema.index({ instituicao: 1, chatIdsResponsaveis: 1 }, { sparse: true });
alunoSchema.index({ instituicao: 1, 'alertas.npRegularEnviadoAt': 1 }, { sparse: true });

module.exports = mongoose.model('Aluno', alunoSchema);
