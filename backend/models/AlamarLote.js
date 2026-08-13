'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const arquivoLoteSchema = new Schema({
  nomeOriginal: { type: String, trim: true, default: '' },
  mimeType: { type: String, trim: true, default: '' },
  tamanhoBytes: { type: Number, default: 0 },
  sha256: { type: String, trim: true, default: '' },
  turma: { type: String, trim: true, default: '' },
  turmaNormalizada: { type: String, trim: true, default: '', index: true },
  bimestre: { type: Number, min: 1, max: 4, default: null },
}, { _id: false });

const turmaLoteSchema = new Schema({
  turma: { type: String, trim: true, required: true },
  turmaNormalizada: { type: String, trim: true, required: true },
  bimestres: { type: [Number], default: [] },
  arquivos: { type: [String], default: [] },
  processo: { type: Schema.Types.ObjectId, ref: 'AlamarProcesso', default: null, index: true },
  status: {
    type: String,
    enum: ['PRONTO', 'INCOMPLETO', 'DUPLICADO', 'PROCESSADO', 'ERRO'],
    default: 'PRONTO',
  },
  mensagem: { type: String, trim: true, default: '' },
  grupoConfiguracao: {
    type: String,
    enum: ['fundamental', 'medio', 'outros'],
    default: 'outros',
  },
  componentesExcluidos: { type: [String], default: [] },
}, { _id: false });

const totaisLoteSchema = new Schema({
  arquivos: { type: Number, default: 0 },
  turmas: { type: Number, default: 0 },
  importados: { type: Number, default: 0 },
  aptos: { type: Number, default: 0 },
  naoAptos: { type: Number, default: 0 },
  pendentes: { type: Number, default: 0 },
  vinculadosAutomaticamente: { type: Number, default: 0 },
  vinculadosManualmente: { type: Number, default: 0 },
  naoLocalizados: { type: Number, default: 0 },
}, { _id: false });

const alamarLoteSchema = new Schema({
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
  anoLetivo: { type: Number, required: true, index: true },
  semestre: { type: Number, enum: [1, 2], required: true, index: true },
  dataReferencia: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['processado', 'homologado', 'cancelado'],
    default: 'processado',
    index: true,
  },
  versao: { type: Number, default: 1 },
  arquivos: { type: [arquivoLoteSchema], default: [] },
  turmas: { type: [turmaLoteSchema], default: [] },
  totais: { type: totaisLoteSchema, default: () => ({}) },
  configuracaoComponentes: { type: Schema.Types.Mixed, default: () => ({}) },
  avisos: { type: [String], default: [] },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  homologadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  homologadoEm: { type: Date, default: null },
}, { timestamps: true });

alamarLoteSchema.pre('validate', function sincronizarTenant(next) {
  try {
    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (this.tenantId && !this.instituicao) this.instituicao = this.tenantId;
    if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
      throw new Error('Inconsistência de instituição no lote do Alamar.');
    }
    next();
  } catch (error) {
    next(error);
  }
});

alamarLoteSchema.index({ instituicao: 1, anoLetivo: -1, semestre: -1, createdAt: -1 });
alamarLoteSchema.index({ instituicao: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.AlamarLote || mongoose.model('AlamarLote', alamarLoteSchema);
