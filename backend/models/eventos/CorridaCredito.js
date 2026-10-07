'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditoriaSchema = new Schema({
  acao: { type: String, required: true, trim: true },
  em: { type: Date, default: Date.now },
  usuarioId: { type: Schema.Types.ObjectId, default: null },
  usuarioNome: { type: String, trim: true, default: '' },
  usuarioTipo: { type: String, trim: true, default: '' },
  detalhes: { type: Schema.Types.Mixed, default: null },
}, { _id: false });

const destinoSchema = new Schema({
  tipo: { type: String, enum: ['disciplina', 'disciplinar'], required: true },
  chave: { type: String, required: true, trim: true },
  turno: { type: String, trim: true, default: '' },
  turma: { type: String, trim: true, default: '' },
  disciplina: { type: String, trim: true, default: '' },
  destinadoEm: { type: Date, default: Date.now },
}, { _id: false });

const processamentoSchema = new Schema({
  confirmadoEm: { type: Date, default: null },
  confirmadoPorId: { type: Schema.Types.ObjectId, default: null },
  confirmadoPorNome: { type: String, trim: true, default: '' },
  confirmadoPorTipo: { type: String, trim: true, default: '' },
  observacao: { type: String, trim: true, default: '' },
}, { _id: false });

const conciliacaoSchema = new Schema({
  metodo: {
    type: String,
    enum: [
      '',
      'alias_confirmado',
      'exato',
      'exato_nascimento',
      'fuzzy_automatico',
      'fuzzy_sugerido',
      'ambiguo',
      'baixa_confianca',
      'sem_candidato',
      'manual_confirmado',
    ],
    default: '',
  },
  score: { type: Number, min: 0, max: 1, default: 0 },
  margem: { type: Number, min: 0, max: 1, default: 0 },
  segundoScore: { type: Number, min: 0, max: 1, default: 0 },
  nivel: { type: String, enum: ['', 'exata', 'alta', 'media', 'baixa'], default: '' },
  candidatoAlunoId: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null },
  candidatoNome: { type: String, trim: true, default: '' },
  candidatoTurma: { type: String, trim: true, default: '' },
  nascimentoCoincide: { type: Boolean, default: false },
  turmaCoincide: { type: Boolean, default: false },
  aliasId: { type: Schema.Types.ObjectId, ref: 'CorridaAlunoAlias', default: null },
  atualizadoEm: { type: Date, default: null },
}, { _id: false });

const schema = new Schema({
  eventSlug: { type: String, required: true, index: true },
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },

  sourceInscricaoId: { type: Schema.Types.ObjectId, ref: 'EventoInscricao', required: true },
  sourceParticipanteId: { type: Schema.Types.ObjectId, ref: 'EventoParticipante', required: true },
  sourceParticipanteNome: { type: String, required: true, trim: true },
  sourceVinculo: { type: String, required: true, trim: true },
  origem: { type: String, enum: ['inscricao_propria', 'inscricao_parente'], required: true },
  deferidaEm: { type: Date, default: null },

  referenciaAlunoNome: { type: String, trim: true, default: '' },
  referenciaAlunoTurma: { type: String, trim: true, default: '' },
  referenciaAlunoNascimento: { type: Date, default: null },
  beneficiarioAlunoId: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null, index: true },
  beneficiarioNome: { type: String, trim: true, default: '' },
  beneficiarioTurma: { type: String, trim: true, default: '' },
  conciliacao: { type: conciliacaoSchema, default: () => ({}) },

  status: {
    type: String,
    enum: ['pendente_vinculo', 'disponivel', 'destinado', 'processado', 'revogado', 'revogado_processado'],
    default: 'pendente_vinculo',
    index: true,
  },

  destino: { type: destinoSchema, default: undefined },
  processamento: { type: processamentoSchema, default: () => ({}) },
  motivoPendencia: { type: String, trim: true, default: '' },
  motivoRevogacao: { type: String, trim: true, default: '' },
  auditoria: { type: [auditoriaSchema], default: [] },
}, {
  timestamps: true,
  collection: 'corrida_creditos',
});

schema.index({ eventSlug: 1, sourceInscricaoId: 1 }, { unique: true });
schema.index({ instituicao: 1, beneficiarioAlunoId: 1, status: 1 });
schema.index({ instituicao: 1, 'destino.turno': 1, 'destino.turma': 1, 'destino.disciplina': 1, status: 1 });
schema.index({ instituicao: 1, status: 1, 'conciliacao.metodo': 1 });
schema.index(
  { eventSlug: 1, beneficiarioAlunoId: 1, 'destino.chave': 1 },
  {
    unique: true,
    partialFilterExpression: { 'destino.chave': { $exists: true } },
  }
);

module.exports = mongoose.models.CorridaCredito || mongoose.model('CorridaCredito', schema);
