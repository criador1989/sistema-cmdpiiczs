'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const leituraSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nome: { type: String, trim: true, default: 'Administrador' },
    lidaEm: { type: Date, default: Date.now },
  },
  { _id: false }
);

const historicoSchema = new Schema(
  {
    acao: {
      type: String,
      enum: [
        'criada',
        'editada',
        'lida',
        'atendimento_assumido',
        'atendimento_liberado',
        'status_alterado',
        'resolvida',
        'arquivada',
      ],
      required: true,
    },
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    nome: { type: String, trim: true, default: 'Sistema' },
    em: { type: Date, default: Date.now },
    detalhe: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { _id: false }
);

const atendimentoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    nome: { type: String, trim: true, default: '' },
    assumidoEm: { type: Date, default: null },
  },
  { _id: false }
);

const resolucaoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    nome: { type: String, trim: true, default: '' },
    resolvidaEm: { type: Date, default: null },
    nota: { type: String, trim: true, maxlength: 1500, default: '' },
  },
  { _id: false }
);

const observacaoProfessorSchema = new Schema(
  {
    aluno: {
      type: Schema.Types.ObjectId,
      ref: 'Aluno',
      required: true,
      index: true,
    },
    alunoNome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    turma: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    professor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
    professorNome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    componenteCurricular: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    categoria: {
      type: String,
      enum: [
        'comportamento',
        'participacao_pedagogica',
        'convivencia',
        'seguranca',
        'atividade',
        'elogio',
        'outro',
      ],
      default: 'comportamento',
      index: true,
    },
    prioridade: {
      type: String,
      enum: ['normal', 'atencao', 'urgente'],
      default: 'normal',
      index: true,
    },
    texto: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 2500,
    },
    marcadores: {
      type: [String],
      default: [],
      set: (valores) => {
        if (!Array.isArray(valores)) return [];
        return [...new Set(
          valores
            .map((item) => String(item || '').trim().slice(0, 100))
            .filter(Boolean)
        )].slice(0, 12);
      },
    },
    origemRegistro: {
      type: String,
      enum: ['digitacao', 'voz', 'misto'],
      default: 'digitacao',
    },
    modoRegistro: {
      type: String,
      enum: ['individual', 'lote'],
      default: 'individual',
      index: true,
    },
    loteId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: '',
      index: true,
    },
    loteTotal: {
      type: Number,
      min: 1,
      max: 50,
      default: 1,
    },
    loteIndice: {
      type: Number,
      min: 1,
      max: 50,
      default: 1,
    },
    status: {
      type: String,
      enum: ['nova', 'lida', 'em_atendimento', 'resolvida', 'arquivada'],
      default: 'nova',
      index: true,
    },
    lidaPor: {
      type: [leituraSchema],
      default: [],
    },
    atendimento: {
      type: atendimentoSchema,
      default: () => ({}),
    },
    resolucao: {
      type: resolucaoSchema,
      default: () => ({}),
    },
    historico: {
      type: [historicoSchema],
      default: [],
    },
    editavelAte: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
      index: true,
    },
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

observacaoProfessorSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
observacaoProfessorSchema.index({ instituicao: 1, professor: 1, createdAt: -1 });
observacaoProfessorSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
observacaoProfessorSchema.index({ instituicao: 1, prioridade: 1, status: 1, createdAt: -1 });
observacaoProfessorSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
observacaoProfessorSchema.index({ instituicao: 1, loteId: 1, createdAt: -1 });

observacaoProfessorSchema.pre('validate', function sincronizarTenant(next) {
  try {
    const instituicao = this.instituicao ? String(this.instituicao) : '';
    const tenantId = this.tenantId ? String(this.tenantId) : '';

    if (instituicao && tenantId && instituicao !== tenantId) {
      throw new Error('Inconsistência entre instituicao e tenantId na observação do professor.');
    }

    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;

    if (!Array.isArray(this.historico)) this.historico = [];
    if (this.isNew && !this.historico.some((item) => item.acao === 'criada')) {
      this.historico.push({
        acao: 'criada',
        usuario: this.professor,
        nome: this.professorNome || 'Professor',
        em: new Date(),
      });
    }

    next();
  } catch (erro) {
    next(erro);
  }
});

module.exports =
  mongoose.models.ObservacaoProfessor ||
  mongoose.model('ObservacaoProfessor', observacaoProfessorSchema);
