// backend/models/Notificacao.js
const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: false
  },

  // natureza do registro
  natureza: {
    type: String,
    enum: ['indisciplina', 'elogio'],
    default: 'indisciplina',
    required: true
  },

  // rótulos exibidos
  tipo: { type: String, required: true },       // ex.: 'Advertência Escrita' | 'Elogio'
  motivo: { type: String, required: true },     // ato de indisciplina OU descrição do elogio
  tipoMedida: { type: String, required: true }, // ex.: 'A.I.A' | 'A.E.C.D.E' | 'Elogio'

  // valor usado no cálculo (negativo p/ medidas, positivo p/ elogios)
  valorNumerico: { type: Number, required: true },

  quantidadeDias: { type: Number, default: 1 },

  observacao: { type: String },

  data: { type: Date, required: true },

  notaAnterior: { type: Number },
  notaAtual: { type: Number },

  artigo: { type: String },
  paragrafo: { type: String },
  inciso: { type: String },
  classificacaoRegulamento: { type: String },

  // ⚠️ agora exclusivo por instituicao + numeroSequencial (não global)
  numeroSequencial: { type: String, required: true },

  instituicao: { type: String, required: true },

  // fluxo de aprovação
  status: {
    type: String,
    enum: ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente'
  },
  avaliador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  comentarioMonitor: { type: String },
  comentarioRevisao: { type: String },
  devolvidoPeloAluno: { type: Boolean, default: false },

  // classificador para elogios
  tipoElogio: {
    type: String,
    enum: ['elogioVerbal', 'boletimInternoIndividual', 'boletimInternoColetivo', 'mediaAlta', null],
    default: null
  }
}, {
  timestamps: true
});

/* ==================== ÍNDICES ==================== */

// históricos por aluno/data
notificacaoSchema.index({ aluno: 1, data: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, natureza: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, data: 1, createdAt: 1 });

// listas/paginação no controle
notificacaoSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
notificacaoSchema.index({ instituicao: 1, createdAt: -1 });

// busca por número
notificacaoSchema.index({ instituicao: 1, numeroSequencial: 1 }, { unique: true });

// (opcional) busca textual no controle/lista
// habilite se usar $text: { $search: q } nas consultas:
// notificacaoSchema.index({ motivo: 'text', tipo: 'text', tipoMedida: 'text' });

module.exports = mongoose.model('Notificacao', notificacaoSchema);
