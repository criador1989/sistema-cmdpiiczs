const mongoose = require('mongoose');

const ConfiguracaoDocumentosSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
      unique: true,
    },

    ativo: {
      type: Boolean,
      default: true,
    },

    nomeInstituicao: {
      type: String,
      trim: true,
      default: '',
    },

    orgaoSuperior: {
      type: String,
      trim: true,
      default: '',
    },

    subtitulo: {
      type: String,
      trim: true,
      default: '',
    },

    endereco: {
      type: String,
      trim: true,
      default: '',
    },

    telefone: {
      type: String,
      trim: true,
      default: '',
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    cidadeUf: {
      type: String,
      trim: true,
      default: '',
    },

    rodapePadrao: {
      type: String,
      trim: true,
      default: '',
    },

    brasaoEsquerdoUrl: {
      type: String,
      trim: true,
      default: '',
    },

    brasaoDireitoUrl: {
      type: String,
      trim: true,
      default: '',
    },

    logoCentralUrl: {
      type: String,
      trim: true,
      default: '',
    },

    mostrarBrasaoEsquerdo: {
      type: Boolean,
      default: true,
    },

    mostrarBrasaoDireito: {
      type: Boolean,
      default: true,
    },

    mostrarLogoCentral: {
      type: Boolean,
      default: false,
    },

    mostrarRodape: {
      type: Boolean,
      default: true,
    },

    criadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },

    atualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.ConfiguracaoDocumentos ||
  mongoose.model('ConfiguracaoDocumentos', ConfiguracaoDocumentosSchema);