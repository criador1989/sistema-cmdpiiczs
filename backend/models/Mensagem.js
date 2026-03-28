// models/Mensagem.js
const mongoose = require('mongoose');

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
  return null;
}

function normalizeInstituicaoString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
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
  const instituicaoStr = normalizeInstituicaoString(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  // Se vier tenantId e não vier instituicao string, espelha
  if (tenantId && !instituicaoStr) {
    doc.instituicao = String(tenantId);
    return;
  }

  // Se vier instituicao string e ela for ObjectId válido, espelha para tenantId
  if (instituicaoStr && !tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    doc.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    return;
  }

  // Se ambos vierem e a string for um ObjectId válido, eles devem bater
  if (instituicaoStr && tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (instituicaoStr !== objectIdToString(tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId na mensagem.');
    }
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

  const instituicaoStr = normalizeInstituicaoString(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (tenantId && !instituicaoStr) {
    if (update.$set) update.$set.instituicao = String(tenantId);
    else update.instituicao = String(tenantId);
    return;
  }

  if (instituicaoStr && !tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (update.$set) update.$set.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    else update.tenantId = new mongoose.Types.ObjectId(instituicaoStr);
    return;
  }

  if (instituicaoStr && tenantId && mongoose.Types.ObjectId.isValid(instituicaoStr)) {
    if (instituicaoStr !== objectIdToString(tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId no update da mensagem.');
    }
  }
}

/* =========================
   SCHEMA
========================= */
const MensagemSchema = new mongoose.Schema(
  {
    remetente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },

    destinatario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },

    // Texto da mensagem (agora opcional se houver anexo)
    conteudo: {
      type: String,
      trim: true,
      set: v => (typeof v === 'string' ? v.trim() : v),
      validate: {
        validator: function (v) {
          // Só exige texto quando NÃO houver anexo
          return (v && v.length > 0) || !!this.anexoUrl;
        },
        message: 'Informe um texto ou um anexo.',
      },
    },

    // Anexo opcional
    anexoUrl: { type: String },   // ex: /uploads/mensagens/170000__arquivo.pdf
    anexoNome: { type: String },  // nome original
    anexoMime: { type: String },  // content-type

    lida: { type: Boolean, default: false },

    data: { type: Date, default: Date.now, index: true },

    // Multiescola (legado/atual)
    instituicao: { type: String, required: true, index: true },

    // Novo padrão SaaS
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

/* =========================
   ÍNDICES RECOMENDADOS
========================= */

// Conversas por instituição (permite filtros eficientes)
MensagemSchema.index(
  { instituicao: 1, remetente: 1, destinatario: 1, data: 1 }
);

MensagemSchema.index(
  { tenantId: 1, remetente: 1, destinatario: 1, data: 1 }
);

// Novas mensagens não lidas (usado por /novas e notificações)
MensagemSchema.index(
  { instituicao: 1, destinatario: 1, lida: 1, data: 1 }
);

MensagemSchema.index(
  { tenantId: 1, destinatario: 1, lida: 1, data: 1 }
);

/* =========================
   MIDDLEWARES
========================= */
MensagemSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);

    if (typeof this.instituicao === 'string') {
      this.instituicao = this.instituicao.trim();
    }

    if (typeof this.anexoUrl === 'string') this.anexoUrl = this.anexoUrl.trim();
    if (typeof this.anexoNome === 'string') this.anexoNome = this.anexoNome.trim();
    if (typeof this.anexoMime === 'string') this.anexoMime = this.anexoMime.trim();

    next();
  } catch (err) {
    next(err);
  }
});

MensagemSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    sincronizarTenantNoUpdate(update);

    const $set = update.$set || null;
    const alvo = $set || update;

    if (typeof alvo.instituicao === 'string') {
      alvo.instituicao = alvo.instituicao.trim();
    }
    if (typeof alvo.anexoUrl === 'string') alvo.anexoUrl = alvo.anexoUrl.trim();
    if (typeof alvo.anexoNome === 'string') alvo.anexoNome = alvo.anexoNome.trim();
    if (typeof alvo.anexoMime === 'string') alvo.anexoMime = alvo.anexoMime.trim();

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   VIRTUALS
========================= */
MensagemSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

/* =========================
   EXPORTAÇÃO
========================= */
module.exports = mongoose.models.Mensagem || mongoose.model('Mensagem', MensagemSchema);