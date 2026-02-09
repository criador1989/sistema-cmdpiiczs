// backend/models/Instituicao.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

function toSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')                      // troca não-alfanum por -
    .replace(/-+/g, '-')                               // remove repetidos
    .replace(/^-|-$/g, '');                            // tira - das pontas
}

/**
 * Representa uma instituição (ex.: CMDPII - CZS)
 * A entrada do sistema deve ser SEMPRE por slug (?t=slug) ou subdomínio.
 */
const instituicaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da instituição é obrigatório.'],
      trim: true,
    },

    // ✅ identificador fixo (NUNCA digitado pelo usuário final)
    slug: {
      type: String,
      required: [true, 'Slug da instituição é obrigatório.'],
      trim: true,
      lowercase: true,
      index: true,
    },

    sigla: {
      type: String,
      trim: true,
      uppercase: true,
    },

    cnpj: {
      type: String,
      trim: true,
      match: [/^\d{14}$/, 'CNPJ deve conter 14 dígitos numéricos.'],
    },

    municipio: { type: String, trim: true },
    estado: { type: String, trim: true, uppercase: true, minlength: 2, maxlength: 2 },
    endereco: { type: String, trim: true },
    telefone: { type: String, trim: true },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
        message: 'E-mail inválido.',
      },
    },

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

/** Índices */
instituicaoSchema.index({ slug: 1 }, { unique: true }); // ✅ slug único
instituicaoSchema.index({ nome: 1 }, { unique: true }); // mantém seu padrão

/** Normalizações */
instituicaoSchema.pre('validate', function (next) {
  try {
    // se o slug não foi fornecido, gera a partir do nome
    if (!this.slug || String(this.slug).trim().length < 2) {
      this.slug = toSlug(this.nome);
    } else {
      this.slug = toSlug(this.slug);
    }
    next();
  } catch (e) {
    next(e);
  }
});

/** toJSON limpo */
instituicaoSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Instituicao', instituicaoSchema);
