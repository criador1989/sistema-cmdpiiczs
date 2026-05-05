'use strict';

const mongoose = require('mongoose');

const ComportamentoSnapshotSchema = new mongoose.Schema(
  {
    instituicao: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },

    aluno: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Aluno',
      required: true,
      index: true,
    },

    alunoNome: {
      type: String,
      default: '',
      trim: true,
    },

    turma: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turma',
      default: null,
      index: true,
    },

    turmaNome: {
      type: String,
      default: '',
      trim: true,
    },

    anoReferencia: {
      type: Number,
      required: true,
      index: true,
    },

    mesReferencia: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true,
    },

    diaReferencia: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
      index: true,
    },

    dataReferencia: {
      type: Date,
      required: true,
      index: true,
    },

    notaComportamento: {
      type: Number,
      default: 8,
      min: 0,
      max: 10,
    },

    faixaComportamento: {
      type: String,
      default: '',
      trim: true,
    },

    totalOcorrenciasPositivas: {
      type: Number,
      default: 0,
    },

    totalOcorrenciasNegativas: {
      type: Number,
      default: 0,
    },

    saldoOcorrencias: {
      type: Number,
      default: 0,
    },

    totalNotificacoes: {
      type: Number,
      default: 0,
    },

    totalNotificacoesDeferidas: {
      type: Number,
      default: 0,
    },

    totalElogios: {
      type: Number,
      default: 0,
    },

    totalMedidas: {
      type: Number,
      default: 0,
    },

    origem: {
      type: String,
      enum: ['automatico', 'manual', 'reprocessamento'],
      default: 'automatico',
      index: true,
    },

    ativoAlunoNoMomento: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ComportamentoSnapshotSchema.index(
  {
    instituicao: 1,
    aluno: 1,
    anoReferencia: 1,
    mesReferencia: 1,
    diaReferencia: 1,
  },
  { unique: true }
);

ComportamentoSnapshotSchema.index({
  instituicao: 1,
  dataReferencia: 1,
  turma: 1,
});

module.exports = mongoose.model('ComportamentoSnapshot', ComportamentoSnapshotSchema);