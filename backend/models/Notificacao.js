const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: true
  },
  tipo: {
    type: String,
    required: true
  },
  motivo: {
    type: String,
    required: true
  },
  tipoMedida: {
    type: String,
    required: true
  },
  valorNumerico: {
    type: Number,
    required: true
  },
  quantidadeDias: {
    type: Number,
    default: 1
  },
  observacao: {
    type: String
  },
  data: {
    type: Date,
    required: true
  },
  notaAnterior: {
    type: Number
  },
  notaAtual: {
    type: Number
  },
  artigo: {
    type: String
  },
  paragrafo: {
    type: String
  },
  inciso: {
    type: String
  },
  classificacaoRegulamento: {
    type: String
  },
  numeroSequencial: {
    type: String,
    required: true,
    unique: true
  },
  instituicao: {
    type: String,
    required: true
  },

  // 🔽 Novos campos para controle de monitor e fluxo
  status: {
    type: String,
    enum: ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente'
  },
  avaliador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  },
  comentarioMonitor: {
    type: String
  },
  comentarioRevisao: {
    type: String // Comentário do coordenador solicitando revisão
  },
  devolvidoPeloAluno: {
    type: Boolean,
    default: false // Se o aluno devolveu fisicamente a notificação
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Notificacao', notificacaoSchema);
