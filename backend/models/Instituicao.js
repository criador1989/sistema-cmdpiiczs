// backend/models/Instituicao.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Representa uma instituição (ex.: Colégio Militar Dom Pedro II / Unidade Cruzeiro do Sul)
 * Usada apenas como referência (ref) em Usuário e Aluno.
 */
const instituicaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da instituição é obrigatório.'],
      trim: true,
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

    municipio: {
      type: String,
      trim: true,
    },

    estado: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
    },

    endereco: {
      type: String,
      trim: true,
    },

    telefone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) =>
          !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
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

/** Índices úteis */
instituicaoSchema.index({ nome: 1 }, { unique: true });

/** toJSON limpo */
instituicaoSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Instituicao', instituicaoSchema);
