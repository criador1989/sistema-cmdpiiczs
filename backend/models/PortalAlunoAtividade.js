'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const EventoSchema = new Schema({
  tipo: {
    type: String,
    enum: [
      'portal_acesso',
      'simulados_abriu',
      'simulado_abriu',
      'questao_abriu',
      'revisao_questao',
      'revisao_conteudo',
      'revisao_concluida',
    ],
    required: true,
  },
  em: { type: Date, default: Date.now, index: true },
  resultadoId: { type: Schema.Types.ObjectId, ref: 'SimuladoResultado', default: null },
  simuladoId: { type: Schema.Types.ObjectId, ref: 'Simulado', default: null },
  simuladoTitulo: { type: String, default: '', trim: true },
  detalhe: { type: String, default: '', trim: true, maxlength: 240 },
}, { _id: false });

const ProgressoAtualSchema = new Schema({
  resultadoId: { type: Schema.Types.ObjectId, ref: 'SimuladoResultado', default: null },
  simuladoId: { type: Schema.Types.ObjectId, ref: 'Simulado', default: null },
  titulo: { type: String, default: '', trim: true },
  totalQuestoesRevisao: { type: Number, default: 0, min: 0 },
  revisadas: { type: Number, default: 0, min: 0 },
  percentual: { type: Number, default: 0, min: 0, max: 100 },
  concluido: { type: Boolean, default: false },
  atualizadoEm: { type: Date, default: null },
}, { _id: false });

const PortalAlunoAtividadeSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },

  alunoNomeSnapshot: { type: String, default: '', trim: true, index: true },
  alunoTurmaSnapshot: { type: String, default: '', trim: true, index: true },
  alunoCodigoSnapshot: { type: String, default: '', trim: true },

  primeiroAcessoPortalEm: { type: Date, default: null, index: true },
  ultimoAcessoPortalEm: { type: Date, default: null, index: true },
  totalAcessosPortal: { type: Number, default: 0, min: 0 },

  primeiroAcessoSimuladosEm: { type: Date, default: null, index: true },
  ultimoAcessoSimuladosEm: { type: Date, default: null, index: true },
  totalAberturasSimulados: { type: Number, default: 0, min: 0 },

  primeiroSimuladoAbertoEm: { type: Date, default: null, index: true },
  ultimoSimuladoAbertoEm: { type: Date, default: null, index: true },

  resultadosAbertos: {
    type: [{ type: Schema.Types.ObjectId, ref: 'SimuladoResultado' }],
    default: [],
  },
  revisoesConcluidas: {
    type: [{ type: Schema.Types.ObjectId, ref: 'SimuladoResultado' }],
    default: [],
  },

  progressoAtual: { type: ProgressoAtualSchema, default: () => ({}) },

  ultimaAtividadeEm: { type: Date, default: null, index: true },
  ultimaAtividadeTipo: { type: String, default: '', trim: true, index: true },
  eventosRecentes: { type: [EventoSchema], default: [] },
}, {
  timestamps: true,
  collection: 'portal_aluno_atividades',
});

attachTenantHooks(PortalAlunoAtividadeSchema, 'atividade do portal do aluno');

PortalAlunoAtividadeSchema.index({ instituicao: 1, aluno: 1 }, { unique: true });
PortalAlunoAtividadeSchema.index({ instituicao: 1, alunoTurmaSnapshot: 1, ultimaAtividadeEm: -1 });
PortalAlunoAtividadeSchema.index({ instituicao: 1, ultimoAcessoPortalEm: -1 });
PortalAlunoAtividadeSchema.index({ instituicao: 1, ultimoAcessoSimuladosEm: -1 });

module.exports =
  mongoose.models.PortalAlunoAtividade ||
  mongoose.model('PortalAlunoAtividade', PortalAlunoAtividadeSchema);
