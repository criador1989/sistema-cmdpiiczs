const mongoose = require("mongoose");

const RifaNumeroSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Instituicao",
      required: true,
      index: true,
    },

    campanha: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampanhaRifa",
      required: true,
      index: true,
    },

    numero: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    numeroValor: {
      type: Number,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["disponivel", "distribuida", "vendida", "paga", "devolvida"],
      default: "disponivel",
      index: true,
    },

    responsavelTipo: {
      type: String,
      enum: ["aluno", "servidor", "externo", "outro", ""],
      default: "",
    },

    responsavelId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    responsavelNome: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    turmaOuSetor: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    valor: {
      type: Number,
      default: 0,
      min: 0,
    },

    formaPagamento: {
      type: String,
      enum: ["pix", "dinheiro", "misto", ""],
      default: "",
    },

    valorPago: {
      type: Number,
      default: 0,
      min: 0,
    },

    comprovanteUrl: {
      type: String,
      default: "",
      trim: true,
    },

    observacao: {
      type: String,
      default: "",
      trim: true,
    },

    dataDistribuicao: {
      type: Date,
      default: null,
    },

    dataVenda: {
      type: Date,
      default: null,
    },

    dataPagamento: {
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

RifaNumeroSchema.index(
  {
    instituicao: 1,
    campanha: 1,
    numero: 1,
  },
  {
    unique: true,
  }
);

RifaNumeroSchema.index({
  instituicao: 1,
  campanha: 1,
  status: 1,
});

RifaNumeroSchema.index({
  instituicao: 1,
  campanha: 1,
  responsavelNome: 1,
});

RifaNumeroSchema.index({
  instituicao: 1,
  campanha: 1,
  turmaOuSetor: 1,
});

module.exports = mongoose.model("RifaNumero", RifaNumeroSchema);