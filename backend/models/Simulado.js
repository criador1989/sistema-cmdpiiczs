'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const VarianteQuestaoSchema = new Schema({
  codigo: {
    type: String,
    enum: ['PADRAO', 'INGLES', 'ESPANHOL'],
    default: 'PADRAO',
    required: true,
    uppercase: true,
    trim: true,
  },
  gabarito: {
    type: String,
    enum: ['', 'A', 'B', 'C', 'D', 'E'],
    default: '',
    uppercase: true,
    trim: true,
  },
  componente: { type: String, default: '', trim: true },
  macroconteudo: { type: String, default: '', trim: true, index: true },
  conteudo: { type: String, default: '', trim: true, index: true },
  habilidade: { type: String, default: '', trim: true, index: true },
  habilidadeEnem: { type: String, default: '', uppercase: true, trim: true, index: true },
  habilidadeEnemConfianca: {
    type: String,
    enum: ['nao_informada', 'direta', 'aproximada'],
    default: 'nao_informada',
    lowercase: true,
    trim: true,
  },
  competencia: { type: String, default: '', trim: true, index: true },
  descritor: { type: String, default: '', trim: true },
  dificuldade: {
    type: String,
    enum: ['nao_informada', 'facil', 'media', 'dificil'],
    default: 'nao_informada',
  },
  questaoBanco: { type: Schema.Types.ObjectId, ref: 'Questao', default: null },
}, { _id: false });

const QuestaoSimuladoSchema = new Schema({
  codigo: { type: String, required: true, uppercase: true, trim: true },
  numero: { type: Number, required: true, min: 1 },
  dia: { type: Number, default: 1, min: 1, max: 10 },
  ordemGlobal: { type: Number, default: 0, min: 0 },
  area: { type: String, default: '', trim: true, index: true },
  tipo: { type: String, enum: ['objetiva'], default: 'objetiva' },
  peso: { type: Number, default: 1, min: 0.01, max: 100 },
  anulada: { type: Boolean, default: false },
  observacao: { type: String, default: '', trim: true },
  variantes: { type: [VarianteQuestaoSchema], default: () => [{ codigo: 'PADRAO' }] },
}, { _id: false });

const DiaSchema = new Schema({
  numero: { type: Number, required: true, min: 1, max: 10 },
  titulo: { type: String, default: '', trim: true },
  dataAplicacao: { type: Date, default: null },
  quantidadeQuestoes: { type: Number, default: 0, min: 0, max: 500 },
}, { _id: false });

const ConfiguracaoAnaliseSchema = new Schema({
  percentualConsolidado: { type: Number, default: 70, min: 1, max: 100 },
  percentualAtencao: { type: Number, default: 50, min: 0, max: 99 },
  minimoQuestoesIndicador: { type: Number, default: 2, min: 1, max: 50 },
  minimoRespondentesQuestao: { type: Number, default: 5, min: 1, max: 5000 },
  minimoAlunosGrupo: { type: Number, default: 2, min: 1, max: 5000 },
  minimoCoberturaIndividual: { type: Number, default: 80, min: 1, max: 100 },
}, { _id: false });

const SimuladoSchema = new Schema({
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
  codigo: { type: String, required: true, uppercase: true, trim: true },
  titulo: { type: String, required: true, trim: true },
  descricao: { type: String, default: '', trim: true },
  tipo: {
    type: String,
    enum: ['enem', 'saeb', 'interno', 'olimpiada', 'outro'],
    default: 'interno',
    index: true,
  },
  anoLetivo: { type: Number, required: true, min: 2000, max: 2200, index: true },
  etapa: { type: String, default: 'Ensino Médio', trim: true },
  series: { type: [String], default: [] },
  turmas: { type: [String], default: [], index: true },
  dias: { type: [DiaSchema], default: () => [{ numero: 1, titulo: 'Dia 1' }] },
  questoes: { type: [QuestaoSimuladoSchema], default: [] },
  configuracaoAnalise: { type: ConfiguracaoAnaliseSchema, default: () => ({}) },
  status: {
    type: String,
    enum: ['rascunho', 'matriz_pronta', 'com_resultados', 'finalizado', 'arquivado'],
    default: 'rascunho',
    index: true,
  },
  versaoMatriz: { type: Number, default: 1, min: 1 },
  simuladoReferencia: { type: Schema.Types.ObjectId, ref: 'Simulado', default: null },
  criadoPor: { type: Schema.Types.Mixed, default: null },
  atualizadoPor: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true, collection: 'simulados' });

SimuladoSchema.pre('validate', function validarMatriz() {
  const codigos = new Set();

  for (const questao of this.questoes || []) {
    const codigo = String(questao.codigo || '').trim().toUpperCase();
    if (!codigo) throw new Error('Toda questão precisa de um código.');
    if (codigos.has(codigo)) throw new Error(`Código de questão duplicado: ${codigo}.`);
    codigos.add(codigo);

    const variantes = new Set();
    for (const variante of questao.variantes || []) {
      const chave = String(variante.codigo || 'PADRAO').trim().toUpperCase();
      if (variantes.has(chave)) {
        throw new Error(`Variante ${chave} duplicada na questão ${codigo}.`);
      }
      variantes.add(chave);
    }
  }

  const consolidado = Number(this.configuracaoAnalise?.percentualConsolidado || 70);
  const atencao = Number(this.configuracaoAnalise?.percentualAtencao || 50);
  if (atencao >= consolidado) {
    throw new Error('O percentual de atenção deve ser menor que o percentual consolidado.');
  }
});

attachTenantHooks(SimuladoSchema, 'simulado');

SimuladoSchema.index({ instituicao: 1, codigo: 1 }, { unique: true });
SimuladoSchema.index({ instituicao: 1, anoLetivo: -1, status: 1, createdAt: -1 });
SimuladoSchema.index({ tenantId: 1, turmas: 1, anoLetivo: -1 });

module.exports = mongoose.models.Simulado || mongoose.model('Simulado', SimuladoSchema);
