const mongoose = require('mongoose');
const { Schema } = mongoose;

const faixaSchema = new Schema({
  nome: String,
  min: Number,
  max: Number
}, { _id: false });

const configuracaoDisciplinarSchema = new Schema({

  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    unique: true,
    index: true
  },

  comportamento: {
    notaInicial: { type: Number, default: 8.0 },

    faixas: {
      type: [faixaSchema],
      default: [
        { nome: "Excepcional", min: 9.01, max: 10 },
        { nome: "Ótimo", min: 8.01, max: 9.0 },
        { nome: "Bom", min: 7.0, max: 8.0 },
        { nome: "Regular", min: 5.0, max: 6.99 },
        { nome: "Insuficiente", min: 3.0, max: 4.99 },
        { nome: "Incompatível", min: 0, max: 2.99 }
      ]
    }
  },

  medidas: {
    advertenciaEscrita: { type: Number, default: -0.30 },
    repreensao: { type: Number, default: -0.50 },
    aecdePorDia: { type: Number, default: -0.70 },
    aiaPorDia: { type: Number, default: -1.20 }
  },

  recompensas: {
    elogioVerbal: { type: Number, default: 0.15 },
    elogioIndividual: { type: Number, default: 0.60 },
    elogioColetivo: { type: Number, default: 0.20 },
    mediaAlta: { type: Number, default: 0.40 }
  },

  tsmd: {
    ativo: { type: Boolean, default: true },
    diasParaIniciar: { type: Number, default: 60 },
    incrementoPorDia: { type: Number, default: 0.01 },
    limiteMaximo: { type: Number, default: 10 }
  }

}, { timestamps: true });

module.exports = mongoose.model('ConfiguracaoDisciplinar', configuracaoDisciplinarSchema);