'use strict';

const mongoose = require('mongoose');

const FonteSchema = new mongoose.Schema({
  titulo: { type: String, default: '', trim: true },
  orgao: { type: String, default: '', trim: true },
  ano: { type: Number, default: 2025 },
  referencia: { type: String, default: '', trim: true }
}, { _id: false });

const EnemConteudoSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, default: 'global', index: true },
  codigo: { type: String, required: true, trim: true, uppercase: true, index: true },
  curso: { type: String, default: 'Redação ENEM', trim: true, index: true },
  unidade: { type: String, required: true, trim: true, index: true },
  ordemUnidade: { type: Number, default: 0, index: true },
  ordem: { type: Number, default: 0, index: true },
  tipo: {
    type: String,
    enum: ['diagnostico', 'aula', 'oficina', 'atividade', 'checklist', 'leitura', 'simulado'],
    default: 'aula',
    index: true
  },
  titulo: { type: String, required: true, trim: true },
  resumo: { type: String, default: '', trim: true },
  conteudo: { type: String, default: '', trim: true },
  competencia: { type: String, enum: ['C1','C2','C3','C4','C5','GERAL'], default: 'GERAL', index: true },
  fragilidades: [{ type: String, trim: true, index: true }],
  duracaoMinutos: { type: Number, default: 10, min: 1, max: 240 },
  preRequisitos: [{ type: String, trim: true, uppercase: true }],
  rotaAcao: { type: String, default: '', trim: true },
  rotuloAcao: { type: String, default: 'Abrir atividade', trim: true },
  obrigatorio: { type: Boolean, default: true },
  fonte: { type: FonteSchema, default: () => ({}) },
  status: { type: String, enum: ['ativo','inativo','arquivado'], default: 'ativo', index: true },
  criadoPor: { type: mongoose.Schema.Types.Mixed, default: null },
  atualizadoPor: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, collection: 'enem_conteudos' });

EnemConteudoSchema.index({ instituicao: 1, codigo: 1 }, { unique: true });
EnemConteudoSchema.index({ instituicao: 1, status: 1, ordemUnidade: 1, ordem: 1 });
EnemConteudoSchema.index({ instituicao: 1, competencia: 1, status: 1, ordem: 1 });

module.exports = mongoose.models.EnemConteudo || mongoose.model('EnemConteudo', EnemConteudoSchema);
