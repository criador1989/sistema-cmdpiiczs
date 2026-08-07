'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const notaSchema = new Schema({
  bimestre: { type: Number, min: 1, max: 4, required: true },
  valor: { type: Number, default: null },
  recuperacaoExplicita: { type: Boolean, default: false },
}, { _id: false });

const disciplinaSchema = new Schema({
  nome: { type: String, required: true, trim: true },
  chave: { type: String, trim: true, default: '' },
  considerarNoCalculo: { type: Boolean, default: true },
  notas: { type: [notaSchema], default: [] },
  mediaSemestral: { type: Number, default: null },
  recuperacao: { type: Boolean, default: false },
  recuperacaoDesconhecida: { type: Boolean, default: false },
  dadosIncompletos: { type: Boolean, default: false },
  motivos: { type: [String], default: [] },
}, { _id: false });

const criterioSchema = new Schema({
  mediaGlobal: { type: Boolean, default: false },
  todasDisciplinas: { type: Boolean, default: false },
  semRecuperacao: { type: Boolean, default: false },
  dadosCompletos: { type: Boolean, default: false },
  alunoVinculado: { type: Boolean, default: false },
  notaDisciplinarDisponivel: { type: Boolean, default: false },
  notaDisciplinarMinima: { type: Boolean, default: false },
}, { _id: false });

const alamarResultadoSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  processo: { type: Schema.Types.ObjectId, ref: 'AlamarProcesso', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null, index: true },

  nomeImportado: { type: String, required: true, trim: true },
  nomeNormalizado: { type: String, required: true, trim: true, index: true },
  turmaImportada: { type: String, trim: true, default: '' },
  turmaNormalizada: { type: String, trim: true, default: '', index: true },
  matriculaImportada: { type: String, trim: true, default: '' },
  simaedIdImportado: { type: String, trim: true, default: '' },

  vinculo: {
    status: { type: String, enum: ['automatico', 'manual', 'pendente'], default: 'pendente', index: true },
    criterio: { type: String, trim: true, default: '' },
    confianca: { type: Number, min: 0, max: 1, default: 0 },
    vinculadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    vinculadoEm: { type: Date, default: null },
  },

  disciplinas: { type: [disciplinaSchema], default: [] },
  mediaGlobal: { type: Number, default: null, index: true },
  menorMediaSemestral: { type: Number, default: null },
  disciplinaMenorMedia: { type: String, trim: true, default: '' },
  teveRecuperacao: { type: Boolean, default: false, index: true },
  notasAbaixoCorte: { type: [Schema.Types.Mixed], default: [] },

  notaDisciplinar: { type: Number, default: null, index: true },
  dataNotaDisciplinar: { type: Date, default: null },
  origemNotaDisciplinar: { type: String, trim: true, default: '' },
  pontuacaoClassificacao: { type: Number, default: null, index: true },

  elegibilidadeAcademica: {
    type: String,
    enum: ['APTO', 'NAO_APTO', 'PENDENTE'],
    default: 'PENDENTE',
    index: true,
  },
  status: {
    type: String,
    enum: ['APTO', 'NAO_APTO', 'PENDENTE'],
    default: 'PENDENTE',
    index: true,
  },
  criterios: { type: criterioSchema, default: () => ({}) },
  motivos: { type: [String], default: [] },
  avisos: { type: [String], default: [] },

  posicaoGeral: { type: Number, default: null, index: true },
  posicaoTurma: { type: Number, default: null, index: true },
  linhasOrigem: { type: [Number], default: [] },
}, { timestamps: true });

alamarResultadoSchema.pre('validate', function sincronizarTenant(next) {
  try {
    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (this.tenantId && !this.instituicao) this.instituicao = this.tenantId;
    if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
      throw new Error('Inconsistência de instituição no resultado do Alamar.');
    }
    next();
  } catch (error) {
    next(error);
  }
});

alamarResultadoSchema.index({ processo: 1, status: 1, mediaGlobal: -1, nomeImportado: 1 });
alamarResultadoSchema.index({ processo: 1, turmaNormalizada: 1, posicaoTurma: 1 });
alamarResultadoSchema.index({ processo: 1, aluno: 1 }, { sparse: true });
alamarResultadoSchema.index({ instituicao: 1, nomeNormalizado: 1, turmaNormalizada: 1 });

module.exports = mongoose.models.AlamarResultado || mongoose.model('AlamarResultado', alamarResultadoSchema);
