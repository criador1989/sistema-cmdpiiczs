const mongoose = require('mongoose');
const { Schema } = mongoose;

const chamadaConfiguracaoSchema = new Schema({
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    unique: true,
    index: true
  },

  emailDestino: {
    type: String,
    trim: true,
    default: ''
  },

  whatsappDestino: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('ChamadaConfiguracao', chamadaConfiguracaoSchema);