const mongoose = require('mongoose');

const LivroOcorrenciaExportacaoSchema =
  new mongoose.Schema({

    tenant: {
      type: String,
      index: true,
      default: 'default'
    },

    hash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    exportadoEm: {
      type: Date,
      default: Date.now,
      index: true
    },

    exportadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null
    },

    exportadoPorNome: {
      type: String,
      trim: true,
      default: ''
    },

    filtros: {

      ano: {
        type: String,
        default: ''
      },

      status: {
        type: String,
        default: ''
      },

      natureza: {
        type: String,
        default: ''
      },

      gravidade: {
        type: String,
        default: ''
      }

    },

    totalRegistros: {
      type: Number,
      default: 0
    },

    metadados: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }

  }, {
    timestamps: true
  });

module.exports =
  mongoose.model(
    'LivroOcorrenciaExportacao',
    LivroOcorrenciaExportacaoSchema
  );