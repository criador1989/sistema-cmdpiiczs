'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const regrasSchema = new Schema({
  mediaGlobalMinima: { type: Number, default: 8.5 },
  mediaDisciplinaMinima: { type: Number, default: 8.0 },
  notaRecuperacaoCorte: { type: Number, default: 7.0 },
  notaAbaixoCorteImpede: { type: Boolean, default: true },
  notaDisciplinarMinima: { type: Number, default: 7.0 },
  // Campo legado mantido para leitura de processos anteriores à v1.1.0.
  modoPontuacaoDisciplinar: {
    type: String,
    enum: ['soma', 'media', 'informativo'],
    default: 'informativo',
  },
}, { _id: false });

const arquivoSchema = new Schema({
  nomeOriginal: { type: String, trim: true, default: '' },
  mimeType: { type: String, trim: true, default: '' },
  tamanhoBytes: { type: Number, default: 0 },
  sha256: { type: String, trim: true, default: '' },
  formatoDetectado: { type: String, trim: true, default: '' },
  planilha: { type: String, trim: true, default: '' },
  linhaCabecalho: { type: Number, default: 1 },
  cabecalhos: { type: [String], default: [] },
  nomesOriginais: { type: [String], default: [] },
  quantidadeArquivos: { type: Number, default: 1 },
  bimestresDetectados: { type: [Number], default: [] },
}, { _id: false });

const totaisSchema = new Schema({
  importados: { type: Number, default: 0 },
  aptos: { type: Number, default: 0 },
  naoAptos: { type: Number, default: 0 },
  pendentes: { type: Number, default: 0 },
  vinculadosAutomaticamente: { type: Number, default: 0 },
  vinculadosManualmente: { type: Number, default: 0 },
  naoLocalizados: { type: Number, default: 0 },
}, { _id: false });

const alamarProcessoSchema = new Schema({
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
  lote: { type: Schema.Types.ObjectId, ref: 'AlamarLote', default: null, index: true },
  modoImportacao: { type: String, enum: ['individual', 'lote'], default: 'individual', index: true },
  turmaApuracao: { type: String, trim: true, default: '', index: true },
  status: {
    type: String,
    enum: ['processado', 'homologado', 'cancelado'],
    default: 'processado',
    index: true,
  },
  regras: { type: regrasSchema, default: () => ({}) },
  arquivo: { type: arquivoSchema, default: () => ({}) },
  totais: { type: totaisSchema, default: () => ({}) },
  avisosImportacao: { type: [String], default: [] },
  componentesExcluidos: { type: [String], default: [] },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  homologadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  homologadoEm: { type: Date, default: null },
}, { timestamps: true });

alamarProcessoSchema.pre('validate', function sincronizarTenant(next) {
  try {
    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (this.tenantId && !this.instituicao) this.instituicao = this.tenantId;
    if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
      throw new Error('Inconsistência de instituição no processo do Alamar.');
    }
    next();
  } catch (error) {
    next(error);
  }
});

alamarProcessoSchema.index({ instituicao: 1, anoLetivo: -1, semestre: -1, createdAt: -1 });
alamarProcessoSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
alamarProcessoSchema.index({ instituicao: 1, 'arquivo.sha256': 1, createdAt: -1 });

module.exports = mongoose.models.AlamarProcesso || mongoose.model('AlamarProcesso', alamarProcessoSchema);
