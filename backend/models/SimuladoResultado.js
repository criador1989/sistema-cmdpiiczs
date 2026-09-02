'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const RespostaSchema = new Schema({
  codigoQuestao: { type: String, required: true, uppercase: true, trim: true },
  numero: { type: Number, required: true, min: 1 },
  dia: { type: Number, default: 1, min: 1, max: 10 },
  resposta: { type: String, enum: ['', 'A', 'B', 'C', 'D', 'E'], default: '' },
  respostaInformada: { type: Boolean, default: false },
  variante: { type: String, enum: ['', 'PADRAO', 'INGLES', 'ESPANHOL', 'SEM_OPCAO'], default: '' },
  gabarito: { type: String, enum: ['', 'A', 'B', 'C', 'D', 'E'], default: '' },
  correta: { type: Boolean, default: null },
  situacao: {
    type: String,
    enum: ['ACERTO', 'ERRO', 'BRANCO', 'NAO_INFORMADA', 'IDIOMA_PENDENTE', 'IDIOMA_NAO_MARCADO', 'ANULADA', 'GABARITO_PENDENTE'],
    required: true,
  },
  area: { type: String, default: '', trim: true },
  componente: { type: String, default: '', trim: true },
  macroconteudo: { type: String, default: '', trim: true },
  eixoPedagogico: { type: String, default: '', trim: true },
  eixoOrigem: { type: String, enum: ['', 'macroconteudo', 'componente'], default: '' },
  conteudo: { type: String, default: '', trim: true },
  habilidade: { type: String, default: '', trim: true },
  habilidadeEnemCodigo: { type: String, default: '', uppercase: true, trim: true },
  habilidadeEnemDescricao: { type: String, default: '', trim: true },
  habilidadeEnemRotulo: { type: String, default: '', trim: true },
  habilidadeEnemConfianca: { type: String, enum: ['', 'direta', 'aproximada'], default: '' },
  competenciaEnemCodigo: { type: String, default: '', uppercase: true, trim: true },
  competenciaEnemDescricao: { type: String, default: '', trim: true },
  competenciaEnemRotulo: { type: String, default: '', trim: true },
  areaEnemCodigo: { type: String, default: '', uppercase: true, trim: true },
  areaEnemNome: { type: String, default: '', trim: true },
  matrizEnemVersao: { type: String, default: '', trim: true },
  competencia: { type: String, default: '', trim: true },
  descritor: { type: String, default: '', trim: true },
  dificuldade: { type: String, default: 'nao_informada', trim: true },
  naturezaEvidencia: { type: String, enum: ['pedagogica', 'procedimental'], default: 'pedagogica' },
  peso: { type: Number, default: 1, min: 0.01 },
}, { _id: false });

const MetricaSchema = new Schema({
  chave: { type: String, default: '', trim: true },
  rotulo: { type: String, default: '', trim: true },
  areaCodigo: { type: String, default: '', trim: true },
  areaNome: { type: String, default: '', trim: true },
  competenciaCodigo: { type: String, default: '', trim: true },
  competenciaDescricao: { type: String, default: '', trim: true },
  habilidadeCodigo: { type: String, default: '', trim: true },
  habilidadeDescricao: { type: String, default: '', trim: true },
  totalQuestoes: { type: Number, default: 0, min: 0 },
  respondidas: { type: Number, default: 0, min: 0 },
  observadas: { type: Number, default: 0, min: 0 },
  acertos: { type: Number, default: 0, min: 0 },
  erros: { type: Number, default: 0, min: 0 },
  brancos: { type: Number, default: 0, min: 0 },
  naoInformadas: { type: Number, default: 0, min: 0 },
  pendentesIdioma: { type: Number, default: 0, min: 0 },
  semOpcaoIdioma: { type: Number, default: 0, min: 0 },
  pontosObtidos: { type: Number, default: 0, min: 0 },
  pontosPossiveis: { type: Number, default: 0, min: 0 },
  percentualAcerto: { type: Number, default: 0, min: 0, max: 100 },
  percentualPontuacao: { type: Number, default: 0, min: 0, max: 100 },
  coberturaPercentual: { type: Number, default: 0, min: 0, max: 100 },
  nivel: {
    type: String,
    enum: ['consolidado', 'em_desenvolvimento', 'prioritario', 'evidencia_insuficiente'],
    default: 'evidencia_insuficiente',
  },
  evidenciaSuficiente: { type: Boolean, default: false },
}, { _id: false });

const ResumoGeralSchema = new Schema({
  totalQuestoes: { type: Number, default: 0, min: 0 },
  pontuaveis: { type: Number, default: 0, min: 0 },
  respondidas: { type: Number, default: 0, min: 0 },
  observadas: { type: Number, default: 0, min: 0 },
  acertos: { type: Number, default: 0, min: 0 },
  erros: { type: Number, default: 0, min: 0 },
  brancos: { type: Number, default: 0, min: 0 },
  naoInformadas: { type: Number, default: 0, min: 0 },
  anuladas: { type: Number, default: 0, min: 0 },
  pendentesIdioma: { type: Number, default: 0, min: 0 },
  semOpcaoIdioma: { type: Number, default: 0, min: 0 },
  pendentesGabarito: { type: Number, default: 0, min: 0 },
  percentualAcerto: { type: Number, default: 0, min: 0, max: 100 },
  percentualPontuacao: { type: Number, default: 0, min: 0, max: 100 },
  coberturaPercentual: { type: Number, default: 0, min: 0, max: 100 },
  pontosObtidos: { type: Number, default: 0, min: 0 },
  pontosPossiveis: { type: Number, default: 0, min: 0 },
  pontosPossiveisAplicaveis: { type: Number, default: 0, min: 0 },
}, { _id: false });


const RevisaoConteudoSchema = new Schema({
  chave: { type: String, required: true, trim: true },
  titulo: { type: String, required: true, trim: true },
  area: { type: String, default: '', trim: true },
  revisado: { type: Boolean, default: false },
  revisadoEm: { type: Date, default: null },
  atualizadoEm: { type: Date, default: Date.now },
}, { _id: false });

const RevisaoQuestaoSchema = new Schema({
  codigoQuestao: { type: String, required: true, uppercase: true, trim: true },
  numero: { type: Number, required: true, min: 1, max: 500 },
  dia: { type: Number, required: true, min: 1, max: 10 },
  variante: { type: String, enum: ['', 'PADRAO', 'INGLES', 'ESPANHOL'], default: '' },
  revisada: { type: Boolean, default: false },
  revisadaEm: { type: Date, default: null },
  atualizadoEm: { type: Date, default: Date.now },
}, { _id: false });

const SimuladoResultadoSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  simulado: { type: Schema.Types.ObjectId, ref: 'Simulado', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  alunoNomeSnapshot: { type: String, required: true, trim: true },
  alunoTurmaSnapshot: { type: String, required: true, trim: true, index: true },
  alunoCodigoSnapshot: { type: String, default: '', trim: true },
  idiomaEstrangeiro: {
    type: String,
    enum: ['NAO_INFORMADO', 'NAO_APLICAVEL', 'NAO_MARCADO', 'INGLES', 'ESPANHOL'],
    default: 'NAO_INFORMADO',
    index: true,
  },
  idiomaOrigem: {
    type: String,
    enum: ['nao_informado', 'planilha', 'manual', 'lista', 'cartao', 'prova'],
    default: 'nao_informado',
  },
  idiomaConfirmado: { type: Boolean, default: false },
  diasAusentes: { type: [Number], default: [] },
  // V1.11.0: guarda somente a matéria-prima necessária para restaurar um dia
  // marcado como ausente depois do processamento, sem perder respostas A-E.
  respostasPreservadasAusencia: { type: [Schema.Types.Mixed], default: [] },
  respostas: { type: [RespostaSchema], default: [] },
  resumoGeral: { type: ResumoGeralSchema, default: () => ({}) },
  porDia: { type: [MetricaSchema], default: [] },
  porArea: { type: [MetricaSchema], default: [] },
  porComponente: { type: [MetricaSchema], default: [] },
  porEixo: { type: [MetricaSchema], default: [] },
  porConteudo: { type: [MetricaSchema], default: [] },
  porHabilidade: { type: [MetricaSchema], default: [] },
  porHabilidadeEnem: { type: [MetricaSchema], default: [] },
  porCompetenciaEnem: { type: [MetricaSchema], default: [] },
  porCompetencia: { type: [MetricaSchema], default: [] },
  porDescritor: { type: [MetricaSchema], default: [] },
  porDificuldade: { type: [MetricaSchema], default: [] },
  avisos: { type: [String], default: [] },
  revisoesConteudo: { type: [RevisaoConteudoSchema], default: [] },
  revisoesQuestao: { type: [RevisaoQuestaoSchema], default: [] },
  versaoMatriz: { type: Number, default: 1, min: 1 },
  versaoDiagnostico: { type: Number, default: 5, min: 1 },
  fonte: { type: String, enum: ['importacao', 'manual', 'api'], default: 'importacao' },
  importacao: { type: Schema.Types.ObjectId, ref: 'SimuladoImportacao', default: null, index: true },
  processadoPor: { type: Schema.Types.Mixed, default: null },
  processadoEm: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'simulado_resultados' });

attachTenantHooks(SimuladoResultadoSchema, 'resultado de simulado');

SimuladoResultadoSchema.index({ instituicao: 1, simulado: 1, aluno: 1 }, { unique: true });
SimuladoResultadoSchema.index({ instituicao: 1, simulado: 1, alunoTurmaSnapshot: 1 });
// V1.10.1: cobre a listagem paginada de resultados sem sort em memória.
SimuladoResultadoSchema.index({ instituicao: 1, simulado: 1, alunoTurmaSnapshot: 1, alunoNomeSnapshot: 1 });
SimuladoResultadoSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
SimuladoResultadoSchema.index({ simulado: 1, 'resumoGeral.percentualPontuacao': 1 });

module.exports = mongoose.models.SimuladoResultado || mongoose.model('SimuladoResultado', SimuladoResultadoSchema);
