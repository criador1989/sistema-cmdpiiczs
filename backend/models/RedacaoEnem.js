'use strict';

const mongoose = require('mongoose');
const CompetenciasSchema = new mongoose.Schema({
  c1: { type: Number, default: 0, min: 0, max: 200 },
  c2: { type: Number, default: 0, min: 0, max: 200 },
  c3: { type: Number, default: 0, min: 0, max: 200 },
  c4: { type: Number, default: 0, min: 0, max: 200 },
  c5: { type: Number, default: 0, min: 0, max: 200 }
}, { _id: false });

const FeedbackCompetenciaSchema = new mongoose.Schema({
  nivel: { type: String, default: '', trim: true },
  diagnostico: { type: String, default: '', trim: true },
  evidencias: [{ type: String, trim: true }],
  comoMelhorar: [{ type: String, trim: true }]
}, { _id: false });

const FeedbackCompetenciasSchema = new mongoose.Schema({
  c1: { type: FeedbackCompetenciaSchema, default: () => ({}) },
  c2: { type: FeedbackCompetenciaSchema, default: () => ({}) },
  c3: { type: FeedbackCompetenciaSchema, default: () => ({}) },
  c4: { type: FeedbackCompetenciaSchema, default: () => ({}) },
  c5: { type: FeedbackCompetenciaSchema, default: () => ({}) }
}, { _id: false });

const ElementosIntervencaoSchema = new mongoose.Schema({
  agente: { type: String, default: '', trim: true },
  acao: { type: String, default: '', trim: true },
  meio: { type: String, default: '', trim: true },
  finalidade: { type: String, default: '', trim: true },
  detalhamento: { type: String, default: '', trim: true },
  respeitaDireitosHumanos: { type: Boolean, default: true }
}, { _id: false });

const AtividadePraticaSchema = new mongoose.Schema({
  prioridade: { type: Number, default: 1, min: 1, max: 5 },
  competencia: { type: String, enum: ['C1','C2','C3','C4','C5','GERAL'], default: 'GERAL' },
  atividade: { type: String, default: '', trim: true },
  objetivo: { type: String, default: '', trim: true },
  prazoSugerido: { type: String, default: '', trim: true }
}, { _id: false });

const AuditoriaCorrecaoSchema = new mongoose.Schema({
  modelo: { type: String, default: '', trim: true },
  promptVersao: { type: String, default: '', trim: true },
  responseId: { type: String, default: '', trim: true },
  requestId: { type: String, default: '', trim: true },
  inputTokens: { type: Number, default: 0, min: 0 },
  outputTokens: { type: Number, default: 0, min: 0 },
  totalTokens: { type: Number, default: 0, min: 0 },
  duracaoMs: { type: Number, default: 0, min: 0 },
  corrigidoEm: { type: Date, default: null }
}, { _id: false });

const CorrecaoIASchema = new mongoose.Schema({
  notaTotal: { type: Number, default: 0, min: 0, max: 1000 },
  competencias: { type: CompetenciasSchema, default: () => ({}) },
  feedbackCompetencias: { type: FeedbackCompetenciasSchema, default: () => ({}) },
  resumoAvaliacao: { type: String, default: '', trim: true },
  focoPrincipal: { type: String, default: '', trim: true },
  pontosFortes: [{ type: String, trim: true }],
  pontosMelhorar: [{ type: String, trim: true }],
  recomendacoes: [{ type: String, trim: true }],
  propostaIntervencao: { type: String, default: '', trim: true },
  propostaIntervencaoIdentificada: { type: String, default: '', trim: true },
  sugestaoAprimoramentoIntervencao: { type: String, default: '', trim: true },
  elementosIntervencao: { type: ElementosIntervencaoSchema, default: () => ({}) },
  observacoesTecnicas: { type: String, default: '', trim: true },
  planoEstudoSugerido: [{ type: String, trim: true }],
  atividadesPraticas: { type: [AtividadePraticaSchema], default: [] },
  alertaTema: {
    fugaAoTema: { type: Boolean, default: false },
    justificativa: { type: String, default: '', trim: true }
  },
  alertaCopiaMotivadores: {
    suspeita: { type: Boolean, default: false },
    justificativa: { type: String, default: '', trim: true }
  },
  disclaimer: { type: String, default: 'Estimativa pedagógica automatizada. Não substitui a correção oficial do Inep nem a avaliação do professor.' },
  modelo: { type: String, default: '', trim: true },
  corrigidoEm: { type: Date, default: null },
  auditoria: { type: AuditoriaCorrecaoSchema, default: () => ({}) }
}, { _id: false });

const ApoioProfessorSchema = new mongoose.Schema({
  solicitado: { type: Boolean, default: false },
  status: { type: String, enum: ['nao_solicitado','solicitado','respondido'], default: 'nao_solicitado' },
  focoTema: { type: String, default: '', trim: true },
  observacaoProfessor: { type: String, default: '', trim: true },
  professorId: { type: mongoose.Schema.Types.Mixed, default: null },
  professorNome: { type: String, default: '', trim: true },
  respondidoEm: { type: Date, default: null }
}, { _id: false });

const FotoManuscritaSchema = new mongoose.Schema({
  key: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  bucket: { type: String, default: '', trim: true },
  originalname: { type: String, default: '', trim: true },
  mimetype: { type: String, default: '', trim: true },
  size: { type: Number, default: 0, min: 0 },
  enviadaEm: { type: Date, default: null }
}, { _id: false });

const EvidenciaAutoriaSchema = new mongoose.Schema({
  fotoManuscritaInformada: { type: Boolean, default: false },
  cronometroUtilizado: { type: Boolean, default: false },
  colagensDetectadas: { type: Number, default: 0, min: 0 },
  caracteresColados: { type: Number, default: 0, min: 0 },
  maiorColagem: { type: Number, default: 0, min: 0 },
  colagemGrandeDetectada: { type: Boolean, default: false },
  proporcaoTextoColado: { type: Number, default: 0, min: 0, max: 1 },
  eventosDigitacao: { type: Number, default: 0, min: 0 },
  caracteresDigitadosEstimados: { type: Number, default: 0, min: 0 },
  tempoEdicaoSegundos: { type: Number, default: 0, min: 0 },
  revisoesEstimadas: { type: Number, default: 0, min: 0 },
  similaridadeMotivadores: { type: Number, default: 0, min: 0, max: 1 },
  similaridadeRedacoesAnteriores: { type: Number, default: 0, min: 0, max: 1 },
  nivelAtencao: { type: String, enum: ['baixo','moderado','alto'], default: 'baixo' },
  motivosAtencao: [{ type: String, trim: true }],
  observacao: { type: String, default: 'Indicadores de autoria são sinais pedagógicos e não constituem prova de fraude.' }
}, { _id: false });


const EvolucaoCompetenciasSchema = new mongoose.Schema({
  c1: { type: Number, default: 0 },
  c2: { type: Number, default: 0 },
  c3: { type: Number, default: 0 },
  c4: { type: Number, default: 0 },
  c5: { type: Number, default: 0 }
}, { _id: false });

const EvolucaoRedacaoSchema = new mongoose.Schema({
  notaAnterior: { type: Number, default: 0, min: 0, max: 1000 },
  notaAtual: { type: Number, default: 0, min: 0, max: 1000 },
  diferencaTotal: { type: Number, default: 0 },
  competencias: {
    type: EvolucaoCompetenciasSchema,
    default: () => ({})
  }
}, { _id: false });

const RedacaoEnemSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  aluno: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  usuarioAluno: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  turma: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  temaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RedacaoTema',
    required: true,
    index: true
  },
  cicloId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RedacaoCiclo',
    default: null,
    index: true
  },
  modalidade: {
    type: String,
    enum: [
      'legado',
      'trilha_orientada',
      'pratica_livre',
      'avaliacao_institucional'
    ],
    default: 'legado',
    index: true
  },
  etapaCiclo: {
    type: String,
    enum: ['producao_inicial', 'reescrita', 'pratica', 'avaliacao', 'legado'],
    default: 'legado',
    index: true
  },
  versaoAnteriorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RedacaoEnem',
    default: null
  },
  evolucao: {
    type: EvolucaoRedacaoSchema,
    default: null
  },
  temaTituloSnapshot: { type: String, required: true, trim: true },
  propostaSnapshot: { type: String, required: true, trim: true },
  textosMotivadoresSnapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
  texto: { type: String, required: true, trim: true },
  textoNormalizado: { type: String, default: '', trim: true },
  quantidadePalavras: { type: Number, default: 0, min: 0 },
  tempoGastoSegundos: { type: Number, default: 0, min: 0 },
  cronometroUtilizado: { type: Boolean, default: false },
  fotoManuscrita: { type: FotoManuscritaSchema, default: null },
  evidenciaAutoria: { type: EvidenciaAutoriaSchema, default: () => ({}) },
  status: { type: String, enum: ['rascunho','enviada','corrigindo_ia','corrigida','erro_correcao','apoio_professor_solicitado','apoio_professor_respondido'], default: 'enviada', index: true },
  tentativa: { type: Number, default: 1, min: 1 },
  mesReferencia: { type: String, default: '', index: true },
  correcaoIA: { type: CorrecaoIASchema, default: null },
  apoioProfessor: { type: ApoioProfessorSchema, default: () => ({}) },
  erroCorrecao: { type: String, default: '' },
  tentativasCorrecaoIA: { type: Number, default: 0, min: 0 },
  ultimaTentativaCorrecaoEm: { type: Date, default: null }
}, { timestamps: true, collection: 'redacoes_enem' });

RedacaoEnemSchema.index({ instituicao: 1, aluno: 1, createdAt: -1 });
RedacaoEnemSchema.index({ instituicao: 1, temaId: 1, aluno: 1, tentativa: -1 });
RedacaoEnemSchema.index({ instituicao: 1, cicloId: 1, aluno: 1, createdAt: 1 });
RedacaoEnemSchema.index({ instituicao: 1, modalidade: 1, aluno: 1, mesReferencia: 1 });
RedacaoEnemSchema.index({ instituicao: 1, aluno: 1, mesReferencia: 1, createdAt: -1 });
RedacaoEnemSchema.index({ instituicao: 1, status: 1, createdAt: -1 });
RedacaoEnemSchema.index({ instituicao: 1, 'apoioProfessor.status': 1, updatedAt: -1 });

module.exports = mongoose.model('RedacaoEnem', RedacaoEnemSchema);
