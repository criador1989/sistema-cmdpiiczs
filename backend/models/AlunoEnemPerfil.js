'use strict';

const mongoose = require('mongoose');

const CompetenciasSchema = new mongoose.Schema({
  c1: { type: Number, default: 0, min: 0, max: 200 },
  c2: { type: Number, default: 0, min: 0, max: 200 },
  c3: { type: Number, default: 0, min: 0, max: 200 },
  c4: { type: Number, default: 0, min: 0, max: 200 },
  c5: { type: Number, default: 0, min: 0, max: 200 }
}, { _id: false });

const AlunoEnemPerfilSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  aluno: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  turma: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
  diagnostico: { type: CompetenciasSchema, default: () => ({}) },
  atual: { type: CompetenciasSchema, default: () => ({}) },
  diagnosticoRealizado: { type: Boolean, default: false, index: true },
  notaDiagnostico: { type: Number, default: 0, min: 0, max: 1000 },
  notaAtual: { type: Number, default: 0, min: 0, max: 1000 },
  evolucaoTotal: { type: Number, default: 0 },
  competenciaPrioritaria: { type: String, enum: ['C1','C2','C3','C4','C5','GERAL'], default: 'GERAL', index: true },
  competenciaMaisForte: { type: String, enum: ['C1','C2','C3','C4','C5','GERAL'], default: 'GERAL' },
  fragilidades: [{ type: String, trim: true, index: true }],
  metaSemanal: { type: String, default: '', trim: true },
  proximoConteudoId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnemConteudo', default: null },
  proximoConteudoCodigo: { type: String, default: '', trim: true },
  progressoPercentual: { type: Number, default: 0, min: 0, max: 100 },
  ultimaRedacaoId: { type: mongoose.Schema.Types.ObjectId, ref: 'RedacaoEnem', default: null },
  ultimaAtualizacaoFonte: { type: String, enum: ['redacao','progresso','manual','inicial'], default: 'inicial' },
  recalculadoEm: { type: Date, default: null }
}, { timestamps: true, collection: 'aluno_enem_perfis' });

AlunoEnemPerfilSchema.index({ instituicao: 1, aluno: 1 }, { unique: true });
AlunoEnemPerfilSchema.index({ instituicao: 1, turma: 1, competenciaPrioritaria: 1 });

module.exports = mongoose.models.AlunoEnemPerfil || mongoose.model('AlunoEnemPerfil', AlunoEnemPerfilSchema);
