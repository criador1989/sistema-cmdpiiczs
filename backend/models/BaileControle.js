const mongoose = require('mongoose');

const baileControleSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },

    anoLetivo: {
      type: Number,
      required: true,
      index: true,
    },

    evento: {
      type: String,
      default: 'Baile de Formatura 3ª Série do Ensino Médio',
      trim: true,
    },

    capacidadeBase: {
      type: Number,
      default: 700,
      min: 0,
    },

    cadeirasExtrasConvidados: {
      type: Number,
      default: 0,
      min: 0,
    },

    observacoes: {
      type: String,
      default: '',
      trim: true,
    },

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },

    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    criadoPorNome: {
      type: String,
      default: '',
      trim: true,
    },

    atualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    atualizadoPorNome: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

baileControleSchema.index(
  { instituicao: 1, anoLetivo: 1 },
  { unique: true }
);

baileControleSchema.virtual('capacidadeTotal').get(function () {
  return (
    Number(this.capacidadeBase || 0) +
    Number(this.cadeirasExtrasConvidados || 0)
  );
});

baileControleSchema.methods.resumo = function () {
  const obj = this.toObject();

  return {
    ...obj,
    capacidadeBase: Number(obj.capacidadeBase || 0),
    cadeirasExtrasConvidados: Number(obj.cadeirasExtrasConvidados || 0),
    capacidadeTotal:
      Number(obj.capacidadeBase || 0) +
      Number(obj.cadeirasExtrasConvidados || 0),
  };
};

baileControleSchema.set('toJSON', { virtuals: true });
baileControleSchema.set('toObject', { virtuals: true });

module.exports =
  mongoose.models.BaileControle ||
  mongoose.model('BaileControle', baileControleSchema);