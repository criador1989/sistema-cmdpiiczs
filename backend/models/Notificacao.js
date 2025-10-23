// backend/models/Notificacao.js
const mongoose = require('mongoose');

const notificacaoSchema = new mongoose.Schema({
  aluno: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aluno',
    required: false,
    index: true,
  },

  // natureza do registro
  natureza: {
    type: String,
    enum: ['indisciplina', 'elogio'],
    default: 'indisciplina',
    required: true,
    index: true,
  },

  // rótulos exibidos
  tipo: { type: String, required: true },       // ex.: 'Advertência Escrita' | 'Elogio'
  motivo: { type: String, required: true },     // ato de indisciplina OU descrição do elogio
  tipoMedida: { type: String, required: true }, // ex.: 'A.I.A' | 'A.E.C.D.E' | 'Elogio'

  // valor usado no cálculo (negativo p/ medidas, positivo p/ elogios)
  valorNumerico: { type: Number, required: true },

  quantidadeDias: { type: Number, default: 1 },

  observacao: { type: String },

  data: { type: Date, required: true, index: true },

  notaAnterior: { type: Number },
  notaAtual: { type: Number },

  artigo: { type: String },
  paragrafo: { type: String },
  inciso: { type: String },
  classificacaoRegulamento: { type: String },

  // exclusivo por instituicao + numeroSequencial (não global)
  numeroSequencial: { type: String, required: true },

  // ✅ ObjectId (ref Instituicao)
  instituicao: { type: mongoose.Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },

  // fluxo de aprovação
  status: {
    type: String,
    enum: ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente',
    index: true,
  },
  avaliador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
  comentarioMonitor: { type: String },
  comentarioRevisao: { type: String },

  // DEVOLUÇÃO (fluxo físico)
  entregue: { type: Boolean, default: false, index: true },
  entregueEm: { type: Date, default: null },
  prazoDevolucao: { type: Date, default: null, index: true },
  devolvidoPeloAluno: { type: Boolean, default: false, index: true },
  devolvidaEm: { type: Date, default: null },
  alertaAtivo: { type: Boolean, default: false, index: true },

  // classificador para elogios
  tipoElogio: {
    type: String,
    enum: ['elogioVerbal', 'boletimInternoIndividual', 'boletimInternoColetivo', 'mediaAlta', null],
    default: null,
  },

  // ✅ Campos usados pelos filtros do painel
  lida: { type: Boolean, default: false, index: true },
  arquivada: { type: Boolean, default: false, index: true }, // ↔ não confundir com status:'arquivado'
  ativo: { type: Boolean, default: true, index: true },

}, {
  timestamps: true,
});

// ==================== ÍNDICES ====================

// históricos por aluno/data
notificacaoSchema.index({ aluno: 1, data: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, natureza: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, data: 1, createdAt: 1 });

// listas/paginação no controle
notificacaoSchema.index({ instituicao: 1, ativo: 1, arquivada: 1, lida: 1, createdAt: -1 });
notificacaoSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
notificacaoSchema.index({ instituicao: 1, createdAt: -1 });

// busca por número
notificacaoSchema.index({ instituicao: 1, numeroSequencial: 1 }, { unique: true });

// filtros de pendência de devolução (usados no painel)
notificacaoSchema.index({ instituicao: 1, status: 1, entregue: 1, devolvidoPeloAluno: 1, prazoDevolucao: 1 });

module.exports = mongoose.model('Notificacao', notificacaoSchema);
