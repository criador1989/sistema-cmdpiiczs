const mongoose = require('mongoose');
const { Schema } = mongoose;

const chamadaAlunoSchema = new Schema({
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true },
  nome: { type: String, trim: true, default: '' },
  presente: { type: Boolean, default: true },
  faltaJustificada: { type: Boolean, default: false },
  observacao: { type: String, trim: true, default: '' },
  marcadoEm: { type: Date, default: null },
  origem: {
    type: String,
    enum: ['automatico', 'professor', 'historico'],
    default: 'automatico'
  }
}, { _id: false });

const chamadaEnvioSchema = new Schema({
  emailDestino: { type: String, trim: true, default: '' },
  whatsappDestino: { type: String, trim: true, default: '' },
  enviadaPorEmailEm: { type: Date, default: null },
  ultimoErroEmail: { type: String, trim: true, default: '' }
}, { _id: false });

const chamadaSchema = new Schema({
  instituicao: {
    type: Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true
  },

  turma: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  data: {
    type: String,
    required: true,
    index: true
  },

  alunos: {
    type: [chamadaAlunoSchema],
    default: []
  },

  status: {
    type: String,
    enum: ['aberta', 'fechada'],
    default: 'aberta'
  },

  envio: {
    type: chamadaEnvioSchema,
    default: () => ({})
  }
}, { timestamps: true });

chamadaSchema.index(
  { instituicao: 1, turma: 1, data: 1 },
  { unique: true }
);

module.exports = mongoose.model('Chamada', chamadaSchema);