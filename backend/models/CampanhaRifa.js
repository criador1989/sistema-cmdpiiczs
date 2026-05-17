const mongoose = require("mongoose");

const CampanhaRifaSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instituicao",
      required: true,
      index: true,
    },

    nome: {
      type: String,
      required: true,
      trim: true,
    },

    descricao: {
      type: String,
      default: "",
      trim: true,
    },

    numeroInicial: {
      type: Number,
      required: true,
      min: 1,
    },

    numeroFinal: {
      type: Number,
      required: true,
      min: 1,
    },

    quantidadeTotal: {
      type: Number,
      required: true,
      min: 1,
    },

    valorUnitario: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    chavePix: {
      type: String,
      default: "",
      trim: true,
    },

    responsavelFinanceiro: {
      type: String,
      default: "",
      trim: true,
    },

    dataInicio: {
      type: Date,
      default: null,
    },

    dataFim: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ativa", "encerrada", "cancelada", "arquivada"],
      default: "ativa",
      index: true,
    },

    motivoCancelamento: {
      type: String,
      default: "",
      trim: true,
    },

    canceladaEm: {
      type: Date,
      default: null,
    },

    encerradaEm: {
      type: Date,
      default: null,
    },

    arquivadaEm: {
      type: Date,
      default: null,
    },

    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },

    atualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

CampanhaRifaSchema.index({
  instituicao: 1,
  status: 1,
});

CampanhaRifaSchema.index(
  {
    instituicao: 1,
    nome: 1,
  },
  {
    unique: false,
  }
);

CampanhaRifaSchema.pre("validate", function (next) {
  if (this.numeroInicial && this.numeroFinal) {
    if (this.numeroFinal < this.numeroInicial) {
      return next(
        new Error("O número final da campanha não pode ser menor que o número inicial.")
      );
    }

    this.quantidadeTotal = this.numeroFinal - this.numeroInicial + 1;
  }

  next();
});

module.exports = mongoose.model("CampanhaRifa", CampanhaRifaSchema);