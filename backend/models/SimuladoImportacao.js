'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const CandidatoSchema = new Schema({
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true },
  nome: { type: String, default: '', trim: true },
  turma: { type: String, default: '', trim: true },
  codigoAcesso: { type: String, default: '', trim: true },
}, { _id: false });

const MarcacaoOmrSchema = new Schema({
  codigoQuestao: { type: String, default: '', uppercase: true, trim: true },
  numero: { type: Number, required: true, min: 1, max: 80 },
  status: {
    type: String,
    enum: ['marcada', 'branco', 'multipla', 'incerta', 'conferida_manual'],
    default: 'incerta',
  },
  resposta: { type: String, enum: ['', 'A', 'B', 'C', 'D', 'E', 'BRANCO'], default: '' },
  confianca: { type: Number, default: 0, min: 0, max: 1 },
  scores: { type: [Number], default: [] },
}, { _id: false });

const OmrSchema = new Schema({
  status: {
    type: String,
    enum: ['nao_aplicavel', 'pronto', 'revisao', 'ilegivel', 'conferido_manual'],
    default: 'nao_aplicavel',
  },
  revisaoObrigatoria: { type: Boolean, default: false },
  revisada: { type: Boolean, default: false },
  geometriaConfianca: { type: Number, default: 0, min: 0, max: 1 },
  circulosDetectados: { type: Number, default: 0, min: 0 },
  respostasReconhecidas: { type: Number, default: 0, min: 0, max: 80 },
  brancosReconhecidos: { type: Number, default: 0, min: 0, max: 80 },
  ambiguidades: { type: Number, default: 0, min: 0, max: 80 },
  idiomaConfianca: { type: Number, default: 0, min: 0, max: 1 },
  marcacoes: { type: [MarcacaoOmrSchema], default: [] },
  previewCabecalho: { type: String, default: '' },
  previewGrade: { type: String, default: '' },
}, { _id: false });

const LinhaSchema = new Schema({
  numeroLinha: { type: Number, required: true, min: 1 },
  pagina: { type: Number, default: null, min: 1 },
  dia: { type: Number, default: null, min: 1, max: 10 },
  fonte: { type: String, enum: ['arquivo_estruturado', 'cartao_pdf'], default: 'arquivo_estruturado' },
  situacaoAplicacao: {
    type: String,
    enum: ['presente', 'ausente', 'descartada'],
    default: 'presente',
    index: true,
  },
  situacaoAplicacaoMotivo: { type: String, default: '', trim: true },
  situacaoAplicacaoPor: { type: Schema.Types.Mixed, default: null },
  situacaoAplicacaoEm: { type: Date, default: null },
  alunoIdInformado: { type: String, default: '', trim: true },
  codigoInformado: { type: String, default: '', trim: true },
  nomeInformado: { type: String, default: '', trim: true },
  turmaInformada: { type: String, default: '', trim: true },
  idiomaEstrangeiro: {
    type: String,
    enum: ['NAO_INFORMADO', 'NAO_APLICAVEL', 'NAO_MARCADO', 'INGLES', 'ESPANHOL'],
    default: 'NAO_INFORMADO',
  },
  idiomaOrigem: {
    type: String,
    enum: ['nao_informado', 'planilha', 'manual', 'lista', 'cartao', 'prova'],
    default: 'nao_informado',
  },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null, index: true },
  vinculoStatus: {
    type: String,
    enum: ['automatico', 'manual', 'ambiguo', 'nao_localizado', 'duplicado'],
    default: 'nao_localizado',
    index: true,
  },
  candidatos: { type: [CandidatoSchema], default: [] },
  respostas: { type: Schema.Types.Mixed, default: () => ({}) },
  omr: { type: OmrSchema, default: () => ({}) },
  avisos: { type: [String], default: [] },
}, { _id: false });

const TotaisSchema = new Schema({
  linhas: { type: Number, default: 0, min: 0 },
  prontas: { type: Number, default: 0, min: 0 },
  ambiguas: { type: Number, default: 0, min: 0 },
  naoLocalizadas: { type: Number, default: 0, min: 0 },
  duplicadas: { type: Number, default: 0, min: 0 },
  idiomasPendentes: { type: Number, default: 0, min: 0 },
  idiomasNaoMarcados: { type: Number, default: 0, min: 0 },
  omrPendentes: { type: Number, default: 0, min: 0 },
  omrProntas: { type: Number, default: 0, min: 0 },
  ausentes: { type: Number, default: 0, min: 0 },
  descartadas: { type: Number, default: 0, min: 0 },
  processadas: { type: Number, default: 0, min: 0 },
}, { _id: false });

const SimuladoImportacaoSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  simulado: { type: Schema.Types.ObjectId, ref: 'Simulado', required: true, index: true },
  arquivo: {
    nomeOriginal: { type: String, default: '', trim: true },
    mimeType: { type: String, default: '', trim: true },
    tamanhoBytes: { type: Number, default: 0, min: 0 },
    sha256: { type: String, default: '', trim: true, index: true },
    formato: { type: String, enum: ['xlsx', 'csv', 'json', 'pdf'], required: true },
    planilha: { type: String, default: '', trim: true },
    turma: { type: String, default: '', trim: true },
    dia: { type: Number, default: null, min: 1, max: 10 },
    motorLeitura: { type: String, default: '', trim: true },
  },
  status: {
    type: String,
    enum: ['analisada', 'processando', 'processada', 'substituida', 'erro', 'cancelada'],
    default: 'analisada',
    index: true,
  },
  linhas: { type: [LinhaSchema], default: [] },
  totais: { type: TotaisSchema, default: () => ({}) },
  avisos: { type: [String], default: [] },
  erro: { type: String, default: '', trim: true },
  criadoPor: { type: Schema.Types.Mixed, default: null },
  processadoPor: { type: Schema.Types.Mixed, default: null },
  processadoEm: { type: Date, default: null },
  substituiImportacao: { type: Schema.Types.ObjectId, ref: 'SimuladoImportacao', default: null, index: true },
  vinculosRecuperados: { type: Number, default: 0, min: 0 },
  vinculosRecuperadosEm: { type: Date, default: null },
  substituidaPorImportacao: { type: Schema.Types.ObjectId, ref: 'SimuladoImportacao', default: null, index: true },
  substituidaPor: { type: Schema.Types.Mixed, default: null },
  substituidaEm: { type: Date, default: null },
}, { timestamps: true, collection: 'simulado_importacoes' });

attachTenantHooks(SimuladoImportacaoSchema, 'importação de simulado');

SimuladoImportacaoSchema.index({ instituicao: 1, simulado: 1, createdAt: -1 });
SimuladoImportacaoSchema.index({ instituicao: 1, simulado: 1, 'arquivo.sha256': 1 });

module.exports = mongoose.models.SimuladoImportacao || mongoose.model('SimuladoImportacao', SimuladoImportacaoSchema);
