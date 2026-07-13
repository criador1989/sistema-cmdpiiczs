// models/Aluno.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

/* =========================
   HELPERS TENANT
========================= */
function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function objectIdToString(value) {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function sincronizarTenant(doc) {
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no aluno.');
  }

  if (instituicao && !tenantId) {
    doc.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    doc.instituicao = tenantId;
  }
}

function sincronizarTenantNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};

  const instituicaoDireta = update.instituicao;
  const tenantDireto = update.tenantId;

  const instituicaoSet = $set.instituicao ?? $setOnInsert.instituicao ?? instituicaoDireta;
  const tenantSet = $set.tenantId ?? $setOnInsert.tenantId ?? tenantDireto;

  const instituicao = toObjectIdOrNull(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do aluno.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

/* =========================
   SUBSCHEMAS
========================= */

const publicViewSchema = new Schema({
  enabled:   { type: Boolean, default: false },
  token:     { type: String, default: null, index: true },
  createdAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { _id: false });

// 👇 Subdocumento de contatos (retrocompatível)
// Mantido para compatibilidade com versões antigas do front/back
const contatosSchema = new Schema({
  emailResponsavel: { type: String, trim: true, default: null },
  whatsapp:         { type: String, trim: true, default: null }, // ex: 5599999999999 (só dígitos)
  telegramChatId:   { type: String, trim: true, default: null }, // legado: será migrado para chatIdsResponsaveis
}, { _id: false });

/**
 * 👇 Subdocumento de alertas (controle de disparos)
 * - npRegularEnviadoAt: quando foi enviado o aviso de NP (faixa 5,00–6,99)
 * - npRegularUltimaNota: última nota que gerou o alerta (para evitar resends idênticos)
 */
const alertasSchema = new Schema({
  npRegularEnviadoAt: { type: Date, default: null },
  npRegularUltimaNota:{ type: Number, default: null },
}, { _id: false });

/**
 * 👇 Metadados da foto
 * Preparado para a nova estratégia com WebP + thumbnails automáticos
 * sem quebrar compatibilidade com o fluxo atual.
 */
const fotoMetaSchema = new Schema({
  formato:       { type: String, trim: true, default: 'webp' },   // ex: webp, jpg, png
  storage:       { type: String, trim: true, default: 's3' },     // ex: s3, cloudinary, local
  originalName:  { type: String, trim: true, default: null },
  mimeType:      { type: String, trim: true, default: null },
  sizeBytes:     { type: Number, default: null },
  width:         { type: Number, default: null },
  height:        { type: Number, default: null },
  thumbWidth:    { type: Number, default: 150 },
  thumbHeight:   { type: Number, default: 150 },
  uploadedAt:    { type: Date, default: null },
}, { _id: false });

const alunoSchema = new Schema({
  nome:           { type: String, required: true, trim: true },
  turma:          { type: String, required: true, trim: true },
  comportamento:  { type: Number, default: 8.00, min: -10, max: 10 },  
  dataEntrada:    { type: Date, required: true },
  nascimento:     { type: Date },

  nomePai:        { type: String, trim: true },
  nomeMae:        { type: String, trim: true },
  telefone:       { type: String, trim: true },
  endereco:       { type: String, trim: true },

  codigoAcesso:   { type: String, required: true, trim: true },

  /**
   * ==========================================================
   * CAMPOS PRONTOS PARA PERFORMANCE DE RANKING / RELATÓRIOS
   * ==========================================================
   * Estes campos passam a guardar contadores já consolidados,
   * evitando recalcular tudo a cada carregamento de tela.
   */
  elogios:                 { type: Number, default: 0, min: 0 },
  atosIndisciplina:        { type: Number, default: 0, min: 0 },
  notificacoesNegativas:   { type: Number, default: 0, min: 0 },
  ultimaAtualizacaoComportamento: { type: Date, default: null },

  /**
   * ==========================================================
   * FOTO DO ALUNO
   * ==========================================================
   * CAMPOS LEGADOS / ATUAIS (mantidos para não quebrar nada):
   * - foto: continua sendo a principal para telas antigas
   * - fotoThumb: miniatura
   * - fotoPublicId: identificador legado (ex.: Cloudinary)
   *
   * NOVOS CAMPOS:
   * - fotoOriginal: URL da imagem original otimizada
   * - fotoMedium: versão intermediária, se quiser usar depois
   * - fotoMeta: metadados da imagem
   */

  // Campo principal legado — manteremos apontando para a foto “original”
  foto:           { type: String, default: null },

  // Legado / compatibilidade (ex.: Cloudinary public_id)
  fotoPublicId:   { type: String, default: null },

  // Thumbnail usada em listagens/cards
  fotoThumb:      { type: String, default: null },

  // NOVO: original explícita
  fotoOriginal:   { type: String, default: null },

  // NOVO: tamanho intermediário opcional
  fotoMedium:     { type: String, default: null },

  // NOVO: metadados da foto
  fotoMeta:       { type: fotoMetaSchema, default: () => ({}) },

  // 🔓 link público (somente leitura) p/ responsáveis
  publicView:     { type: publicViewSchema, default: () => ({}) },

  // 👇 Contatos (mantido por compatibilidade)
  contatos:       { type: contatosSchema, default: () => ({}) },

  // 👇 NOVO: Alertas e trilhas de comunicação
  alertas:        { type: alertasSchema, default: () => ({}) },

  // 👇 Integração Telegram — uso preferencial no backend
  // Campo simples (um responsável principal) — útil para sistemas já prontos
  chatIdResponsavel:    { type: String, trim: true, default: "" },

  // Campo recomendado: vários responsáveis (pai/mãe/guardião)
  chatIdsResponsaveis:  { type: [String], default: [] },

  // 🔐 multi-tenant (ObjectId da Instituicao) - campo atual/legado
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  
  usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },

  // 🔐 novo padrão SaaS (mantido sincronizado com instituicao)
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', default: null, index: true },

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
  // Mantém chatIdResponsavel como o primeiro do array (convenção)
  if (!this.chatIdResponsavel) this.chatIdResponsavel = id;
};

alunoSchema.methods.removeChatId = function removeChatId(chatId) {
  const id = String(chatId || '').trim();
  if (!id) return;
  this.chatIdsResponsaveis = (this.chatIdsResponsaveis || []).filter(c => c !== id);
  if (this.chatIdResponsavel === id) {
    // Se removemos o principal, tenta promover outro
    this.chatIdResponsavel = this.chatIdsResponsaveis[0] || "";
  }
};

alunoSchema.methods.getAllChatIds = function getAllChatIds() {
  const arr = new Set([...(this.chatIdsResponsaveis || [])]);
  if (this.chatIdResponsavel) arr.add(this.chatIdResponsavel);
  // Retrocompat: incluir legado se existir
  if (this.contatos?.telegramChatId) arr.add(this.contatos.telegramChatId);
  return Array.from(arr);
};

/**
 * Helper opcional para o novo fluxo de foto
 * Mantém retrocompatibilidade automaticamente:
 * - foto => original principal
 * - fotoThumb => thumbnail
 */
alunoSchema.methods.setFotoUrls = function setFotoUrls({
  original = null,
  thumb = null,
  medium = null,
  publicId = null,
  meta = null,
} = {}) {
  if (original) {
    this.foto = original;          // legado continua funcionando
    this.fotoOriginal = original;  // novo campo explícito
  }

  if (thumb) {
    this.fotoThumb = thumb;
  }

  if (medium) {
    this.fotoMedium = medium;
  }

  if (publicId !== undefined) {
    this.fotoPublicId = publicId;
  }

  if (meta && typeof meta === 'object') {
    this.fotoMeta = {
      ...(this.fotoMeta?.toObject ? this.fotoMeta.toObject() : this.fotoMeta || {}),
      ...meta,
    };
  }
};

/**
 * Helper para obter a melhor URL disponível
 */
alunoSchema.methods.getFotoPrincipal = function getFotoPrincipal() {
  return this.fotoOriginal || this.foto || null;
};

/**
 * Helper para obter a thumb
 */
alunoSchema.methods.getFotoThumb = function getFotoThumb() {
  return this.fotoThumb || this.fotoOriginal || this.foto || null;
};

/**
 * Virtual de conveniência para novo padrão
 */
alunoSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

/** ============================
 *  Pré-validate
 *  - Gera código de acesso
 *  - Migra legado contatos.telegramChatId
 *  - Deduplica e normaliza chat IDs
 *  - Mantém consistência dos campos de foto
 *  - Sincroniza instituicao ↔ tenantId
 *  ============================
 */
alunoSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    // Código curto se não existir
    if (!this.codigoAcesso) {
      this.codigoAcesso = crypto.randomBytes(3).toString('hex').toUpperCase();
    }

    // Garante arrays
    if (!Array.isArray(this.chatIdsResponsaveis)) {
      this.chatIdsResponsaveis = (this.chatIdsResponsaveis ? [this.chatIdsResponsaveis] : []);
    }

    // Migração: se houver telegramChatId legado em contatos, incorpora
    const legado = this.contatos?.telegramChatId ? String(this.contatos.telegramChatId).trim() : '';
    if (legado) {
      if (!this.chatIdsResponsaveis.includes(legado)) {
        this.chatIdsResponsaveis.push(legado);
      }
      if (!this.chatIdResponsavel) {
        this.chatIdResponsavel = legado;
      }
    }

    // Se chatIdResponsavel existe e não está no array, adiciona
    if (this.chatIdResponsavel) {
      const id = String(this.chatIdResponsavel).trim();
      if (id && !this.chatIdsResponsaveis.includes(id)) {
        this.chatIdsResponsaveis.push(id);
      }
    }

    // Deduplica e normaliza (string trim)
    this.chatIdsResponsaveis = Array.from(
      new Set((this.chatIdsResponsaveis || []).map(s => String(s || '').trim()).filter(Boolean))
    );

    /**
     * ==========================================================
     * CONSISTÊNCIA DOS CAMPOS DE FOTO
     * ==========================================================
     * Regras:
     * - se fotoOriginal existe e foto não existe, copia para foto
     * - se foto existe e fotoOriginal não existe, copia para fotoOriginal
     * - mantém retrocompatibilidade sem quebrar telas antigas
     */
    if (this.fotoOriginal && !this.foto) {
      this.foto = this.fotoOriginal;
    }

    if (this.foto && !this.fotoOriginal) {
      this.fotoOriginal = this.foto;
    }

    if (!this.fotoMeta) {
      this.fotoMeta = {};
    }

    if (typeof this.elogios !== 'number') this.elogios = 0;
    if (typeof this.atosIndisciplina !== 'number') this.atosIndisciplina = 0;
    if (typeof this.notificacoesNegativas !== 'number') this.notificacoesNegativas = 0;

    next();
  } catch (err) {
    next(err);
  }
});

/** ============================
 *  Pré findOneAndUpdate
 *  - Sincroniza instituicao ↔ tenantId em updates
 *  - Mantém consistência de foto
 *  - Deduplica chatIdsResponsaveis
 *  ============================
 */
alunoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};

    sincronizarTenantNoUpdate(update);

    const $set = update.$set || {};

    const chatIds = update.chatIdsResponsaveis ?? $set.chatIdsResponsaveis;
    if (Array.isArray(chatIds)) {
      const normalizados = Array.from(
        new Set(chatIds.map(s => String(s || '').trim()).filter(Boolean))
      );
      if (update.$set) update.$set.chatIdsResponsaveis = normalizados;
      else update.chatIdsResponsaveis = normalizados;
    }

    const foto = update.foto ?? $set.foto;
    const fotoOriginal = update.fotoOriginal ?? $set.fotoOriginal;

    if (fotoOriginal && !foto) {
      if (update.$set) update.$set.foto = fotoOriginal;
      else update.foto = fotoOriginal;
    }

    if (foto && !fotoOriginal) {
      if (update.$set) update.$set.fotoOriginal = foto;
      else update.fotoOriginal = foto;
    }

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/** ============================
 *  Índices
 *  ============================
 */
alunoSchema.index({ instituicao: 1, codigoAcesso: 1 }, { unique: true, sparse: true });
alunoSchema.index({ tenantId: 1, codigoAcesso: 1 }, { sparse: true });

alunoSchema.index({ instituicao: 1, turma: 1, nome: 1 });
alunoSchema.index({ tenantId: 1, turma: 1, nome: 1 });

alunoSchema.index({ instituicao: 1, nome: 1 });
alunoSchema.index({ tenantId: 1, nome: 1 });

alunoSchema.index({ instituicao: 1, turma: 1, comportamento: -1 });
alunoSchema.index({ tenantId: 1, turma: 1, comportamento: -1 });

alunoSchema.index({ instituicao: 1, comportamento: -1 });
alunoSchema.index({ tenantId: 1, comportamento: -1 });

alunoSchema.index({ instituicao: 1, turma: 1, elogios: -1 });
alunoSchema.index({ tenantId: 1, turma: 1, elogios: -1 });

alunoSchema.index({ instituicao: 1, turma: 1, notificacoesNegativas: -1 });
alunoSchema.index({ tenantId: 1, turma: 1, notificacoesNegativas: -1 });

alunoSchema.index({ instituicao: 1, turma: 1, atosIndisciplina: -1 });
alunoSchema.index({ tenantId: 1, turma: 1, atosIndisciplina: -1 });

alunoSchema.index({ 'publicView.token': 1 }, { unique: true, sparse: true });

// Acelera buscas por instituição + chat (envios/relatórios por turma)
alunoSchema.index({ instituicao: 1, chatIdResponsavel: 1 }, { sparse: true });
alunoSchema.index({ tenantId: 1, chatIdResponsavel: 1 }, { sparse: true });

alunoSchema.index({ instituicao: 1, chatIdsResponsaveis: 1 }, { sparse: true });
alunoSchema.index({ tenantId: 1, chatIdsResponsaveis: 1 }, { sparse: true });

// 👇 Útil para relatórios/diagnóstico de comunicação NP
alunoSchema.index({ instituicao: 1, 'alertas.npRegularEnviadoAt': 1 }, { sparse: true });
alunoSchema.index({ tenantId: 1, 'alertas.npRegularEnviadoAt': 1 }, { sparse: true });

module.exports = mongoose.models.Aluno || mongoose.model('Aluno', alunoSchema);