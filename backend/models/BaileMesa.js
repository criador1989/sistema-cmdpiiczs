const mongoose = require('mongoose');

const baileMesaOcupanteSchema = new mongoose.Schema(
  {
    contrato: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BaileContrato',
      default: null,
      index: true,
    },

    aluno: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Aluno',
      default: null,
      index: true,
    },

    alunoNome: {
      type: String,
      default: '',
      trim: true,
    },

    turma: {
      type: String,
      default: '',
      trim: true,
    },

    quantidadeLugares: {
      type: Number,
      default: 1,
      min: 1,
    },

    observacao: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true, timestamps: true }
);

const baileMesaSchema = new mongoose.Schema(
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
      default: 2026,
      index: true,
    },

    evento: {
      type: String,
      default: 'Baile de Formatura 3ª Série do Ensino Médio',
      trim: true,
    },

    numeroMesa: {
      type: String,
      required: true,
      trim: true,
    },

    capacidade: {
      type: Number,
      required: true,
      enum: [6, 8, 10],
      default: 6,
    },

    ordem: {
      type: Number,
      default: 0,
      index: true,
    },

    setor: {
      type: String,
      default: '',
      trim: true,
    },

    observacoes: {
      type: String,
      default: '',
      trim: true,
    },

    ocupantes: [baileMesaOcupanteSchema],

    ativa: {
      type: Boolean,
      default: true,
      index: true,
    },

    criadaPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    criadaPorNome: {
      type: String,
      default: '',
      trim: true,
    },

    atualizadaPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    atualizadaPorNome: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

baileMesaSchema.index(
  { instituicao: 1, anoLetivo: 1, numeroMesa: 1 },
  { unique: true }
);

baileMesaSchema.virtual('lugaresOcupados').get(function () {
  return (this.ocupantes || []).reduce((acc, item) => {
    return acc + Number(item.quantidadeLugares || 0);
  }, 0);
});

baileMesaSchema.virtual('lugaresDisponiveis').get(function () {
  const ocupados = (this.ocupantes || []).reduce((acc, item) => {
    return acc + Number(item.quantidadeLugares || 0);
  }, 0);

  return Math.max(Number(this.capacidade || 0) - ocupados, 0);
});

baileMesaSchema.set('toJSON', { virtuals: true });
baileMesaSchema.set('toObject', { virtuals: true });

baileMesaSchema.methods.resumo = function () {
  const obj = this.toObject();

  const lugaresOcupados = (obj.ocupantes || []).reduce((acc, item) => {
    return acc + Number(item.quantidadeLugares || 0);
  }, 0);

  return {
    ...obj,
    lugaresOcupados,
    lugaresDisponiveis: Math.max(Number(obj.capacidade || 0) - lugaresOcupados, 0),
    completa: lugaresOcupados >= Number(obj.capacidade || 0),
  };
};

module.exports =
  mongoose.models.BaileMesa ||
  mongoose.model('BaileMesa', baileMesaSchema);