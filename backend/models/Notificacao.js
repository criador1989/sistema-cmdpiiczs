// backend/models/Notificacao.js
'use strict';
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
  tipo:       { type: String, required: true }, // ex.: 'Advertência Escrita' | 'Elogio'
  motivo:     { type: String, required: true }, // ato de indisciplina OU descrição do elogio
  tipoMedida: { type: String, required: true }, // ex.: 'A.I.A' | 'A.E.C.D.E' | 'Elogio'

  // valor usado no cálculo
  valorNumerico: { type: Number, required: true },

  quantidadeDias: { type: Number, default: 1 },

  observacao: { type: String },

  data: { type: Date, required: true, index: true },

  notaAnterior: { type: Number },
  notaAtual:    { type: Number },

  artigo: { type: String },
  paragrafo: { type: String },
  inciso: { type: String },
  classificacaoRegulamento: { type: String },

  numeroSequencial: { type: String, required: true },

  // ✅ ObjectId (ref Instituicao)
  instituicao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Instituicao',
    required: true,
    index: true,
  },

  // fluxo de aprovação
  status: {
    type: String,
    // ✅ compatível com routes: pendente/deferido/indeferido
    // ✅ mantém legados: revisao_solicitada/arquivado
    enum: ['pendente', 'deferido', 'indeferido', 'revisao_solicitada', 'arquivado'],
    default: 'pendente',
    index: true,
  },
  avaliador: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
  comentarioMonitor: { type: String },
  comentarioRevisao: { type: String },

  deferidoEm: { type: Date, default: null },
  mensagemEnviada: { type: Boolean, default: false, index: true },
  mensagemEnviadaEm: { type: Date, default: null },

  // DEVOLUÇÃO
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

  // filtros do painel
  lida:      { type: Boolean, default: false, index: true },
  arquivada: { type: Boolean, default: false, index: true },
  ativo:     { type: Boolean, default: true, index: true },

}, {
  timestamps: true,
});

// ==================== ÍNDICES ====================
notificacaoSchema.index({ aluno: 1, data: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, natureza: 1 });
notificacaoSchema.index({ instituicao: 1, aluno: 1, data: 1, createdAt: 1 });
notificacaoSchema.index({ aluno: 1, data: 1, createdAt: 1 });

notificacaoSchema.index({ instituicao: 1, ativo: 1, arquivada: 1, lida: 1, createdAt: -1 });
notificacaoSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
notificacaoSchema.index({ instituicao: 1, createdAt: -1 });

// único por instituição
notificacaoSchema.index({ instituicao: 1, numeroSequencial: 1 }, { unique: true });

notificacaoSchema.index({ instituicao: 1, status: 1, entregue: 1, devolvidoPeloAluno: 1, prazoDevolucao: 1 });
notificacaoSchema.index({ instituicao: 1, status: 1, mensagemEnviada: 1, deferidoEm: -1 });

// ==================== REGRAS (anti dupla multiplicação) ====================
const MAPA_NEGATIVOS = {
  'Advertência Escrita': -0.30,
  'Repreensão':          -0.50,
  'A.E.C.D.E':           -0.70,
  'A.I.A':               -1.20,
};
const MAPA_ELOGIOS = {
  elogioVerbal:             0.15,
  boletimInternoIndividual: 0.60,
  boletimInternoColetivo:   0.20,
  mediaAlta:                0.40,
};
const REQUER_DIAS = new Set(['A.E.C.D.E', 'A.I.A']);

function fix2(n) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  return Number(n.toFixed(2));
}
function trimStr(s) { return typeof s === 'string' ? s.trim() : s; }

notificacaoSchema.pre('validate', function () {
  this.tipo       = trimStr(this.tipo);
  this.motivo     = trimStr(this.motivo);
  this.tipoMedida = trimStr(this.tipoMedida);
  this.artigo     = trimStr(this.artigo);
  this.paragrafo  = trimStr(this.paragrafo);
  this.inciso     = trimStr(this.inciso);
  this.classificacaoRegulamento = trimStr(this.classificacaoRegulamento);

  if (!this.tipo && this.tipoMedida) this.tipo = this.tipoMedida;

  // ----- ELOGIO -----
  if (this.natureza === 'elogio') {
    this.quantidadeDias = null;

    if (this.valorNumerico === undefined || this.valorNumerico === null || isNaN(this.valorNumerico)) {
      const v = MAPA_ELOGIOS[this.tipoElogio || ''] ?? 0;
      this.valorNumerico = fix2(v);
    } else {
      this.valorNumerico = fix2(Number(this.valorNumerico));
    }

    this.tipo = this.tipo || 'Elogio';
    this.tipoMedida = 'Elogio';

    this.artigo = this.paragrafo = this.inciso = this.classificacaoRegulamento = null;
    return;
  }

  // ----- INDISCIPLINA -----
  const titulo = (this.tipoMedida || this.tipo || '').trim();
  const precisaDias = REQUER_DIAS.has(titulo);

  if (precisaDias) {
    const dias = Math.max(1, parseInt(this.quantidadeDias || 1, 10) || 1);
    this.quantidadeDias = dias;
  } else {
    this.quantidadeDias = 1;
  }

  const valorFoiFornecido = (this.valorNumerico !== undefined && this.valorNumerico !== null && !isNaN(this.valorNumerico));

  if (!valorFoiFornecido) {
    const base = MAPA_NEGATIVOS[titulo] ?? 0;
    const mult = precisaDias ? this.quantidadeDias : 1;
    this.valorNumerico = fix2(base * mult);
  } else {
    this.valorNumerico = fix2(Number(this.valorNumerico));
  }
});

notificacaoSchema.pre('save', function () {
  if (this.natureza === 'elogio') return;

  const titulo = (this.tipoMedida || this.tipo || '').trim();
  const precisaDias = REQUER_DIAS.has(titulo);

  if (precisaDias) {
    const dias = Math.max(1, parseInt(this.quantidadeDias || 1, 10) || 1);
    this.quantidadeDias = dias;
  } else {
    this.quantidadeDias = 1;
  }

  const valorFoiFornecido = (this.valorNumerico !== undefined && this.valorNumerico !== null && !isNaN(this.valorNumerico));
  const camposDiasMudaram = this.isModified('tipoMedida') || this.isModified('quantidadeDias');

  if (!valorFoiFornecido && camposDiasMudaram) {
    const base = MAPA_NEGATIVOS[titulo] ?? 0;
    const mult = precisaDias ? this.quantidadeDias : 1;
    this.valorNumerico = fix2(base * mult);
  } else if (valorFoiFornecido) {
    this.valorNumerico = fix2(Number(this.valorNumerico));
  }
});

module.exports = mongoose.model('Notificacao', notificacaoSchema);
