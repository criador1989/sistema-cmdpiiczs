const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: false
  },

  // NOVO: natureza do registro (mantém compatibilidade: default indisciplina)
  natureza: {
    type: String,
    enum: ['indisciplina', 'elogio'],
    default: 'indisciplina',
    required: true
  },

  // rótulos exibidos
  tipo: { type: String, required: true },       // ex.: 'Advertência Escrita' ou 'Elogio'
  motivo: { type: String, required: true },     // ato de indisciplina OU descrição do elogio
  tipoMedida: { type: String, required: true }, // ex.: 'A.I.A' ou 'Elogio'

  // valor usado no cálculo (negativo p/ medidas, positivo p/ elogios)
  valorNumerico: { type: Number, required: true },

  quantidadeDias: { type: Number, default: 1 },

  // observação (mantive seu nome singular)
  observacao: { type: String },

  data: { type: Date, required: true },

  notaAnterior: { type: Number },
  notaAtual: { type: Number },

  artigo: { type: String },
  paragrafo: { type: String },
  inciso: { type: String },
  classificacaoRegulamento: { type: String },

  numeroSequencial: { type: String, required: true, unique: true },

  instituicao: { type: String, required: true },

  // 🔽 Fluxo de aprovação/monitor
  status: {
    type: String,
    enum: ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente'
  },
  avaliador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  comentarioMonitor: { type: String },
  comentarioRevisao: { type: String },
  devolvidoPeloAluno: { type: Boolean, default: false },

  // NOVO: classificador para elogios (facilita relatórios)
  tipoElogio: {
    type: String,
    enum: ['elogioVerbal', 'boletimInternoIndividual', 'boletimInternoColetivo', 'mediaAlta', null],
    default: null
  }
}, {
  timestamps: true
});

notificacaoSchema.index({ aluno: 1, data: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, natureza: 1 });

module.exports = mongoose.model('Notificacao', notificacaoSchema);
