'use strict';

const mongoose = require('mongoose');
const { attachTenantHooks } = require('../utils/tenantPair');

const { Schema } = mongoose;

const PaginaSchema = new Schema({
  numero: { type: Number, required: true, min: 1 },
  storageKey: { type: String, required: true, trim: true },
  largura: { type: Number, default: 0, min: 0 },
  altura: { type: Number, default: 0, min: 0 },
}, { _id: false });

const RecorteQuestaoSchema = new Schema({
  pagina: { type: Number, required: true, min: 1 },
  x0: { type: Number, required: true, min: 0, max: 1 },
  y0: { type: Number, required: true, min: 0, max: 1 },
  x1: { type: Number, required: true, min: 0, max: 1 },
  y1: { type: Number, required: true, min: 0, max: 1 },
  coluna: { type: Number, enum: [0, 1], default: 0 },
}, { _id: false });

const QuestaoCadernoSchema = new Schema({
  codigoQuestao: { type: String, default: '', uppercase: true, trim: true },
  numero: { type: Number, required: true, min: 1, max: 500 },
  dia: { type: Number, required: true, min: 1, max: 10 },
  variante: {
    type: String,
    enum: ['PADRAO', 'INGLES', 'ESPANHOL'],
    default: 'PADRAO',
    uppercase: true,
    trim: true,
  },
  paginaInicial: { type: Number, required: true, min: 1 },
  paginaFinal: { type: Number, required: true, min: 1 },
  paginas: { type: [Number], default: [] },
  recortes: { type: [RecorteQuestaoSchema], default: [] },
}, { _id: false });

const ProgressoSchema = new Schema({
  etapa: {
    type: String,
    enum: ['fila', 'extraindo', 'renderizando', 'enviando', 'finalizando', 'concluido', 'erro'],
    default: 'fila',
  },
  paginasTotal: { type: Number, default: 0, min: 0 },
  paginasProcessadas: { type: Number, default: 0, min: 0 },
  percentual: { type: Number, default: 0, min: 0, max: 100 },
  atualizadoEm: { type: Date, default: Date.now },
}, { _id: false });

const SimuladoCadernoSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  simulado: { type: Schema.Types.ObjectId, ref: 'Simulado', required: true, index: true },
  dia: { type: Number, required: true, min: 1, max: 10, index: true },
  titulo: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['analisando', 'pronto', 'erro'],
    default: 'analisando',
    index: true,
  },
  arquivo: {
    nomeOriginal: { type: String, default: '', trim: true },
    mimeType: { type: String, default: 'application/pdf', trim: true },
    tamanhoBytes: { type: Number, default: 0, min: 0 },
    sha256: { type: String, default: '', trim: true, index: true },
    storageProvider: { type: String, enum: ['s3'], default: 's3' },
    storageKey: { type: String, default: '', trim: true },
  },
  paginas: { type: [PaginaSchema], default: [] },
  questoes: { type: [QuestaoCadernoSchema], default: [] },
  progresso: { type: ProgressoSchema, default: () => ({}) },
  resumo: {
    paginasTotal: { type: Number, default: 0, min: 0 },
    questoesMapeadas: { type: Number, default: 0, min: 0 },
    variantesIngles: { type: Number, default: 0, min: 0 },
    variantesEspanhol: { type: Number, default: 0, min: 0 },
    pendencias: { type: Number, default: 0, min: 0 },
  },
  avisos: { type: [String], default: [] },
  erro: { type: String, default: '', trim: true },
  criadoPor: { type: Schema.Types.Mixed, default: null },
  processadoPor: { type: Schema.Types.Mixed, default: null },
  processadoEm: { type: Date, default: null },
}, { timestamps: true, collection: 'simulado_cadernos' });

attachTenantHooks(SimuladoCadernoSchema, 'caderno de simulado');

SimuladoCadernoSchema.index({ instituicao: 1, simulado: 1, dia: 1 }, { unique: true });
SimuladoCadernoSchema.index({ instituicao: 1, simulado: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.models.SimuladoCaderno || mongoose.model('SimuladoCaderno', SimuladoCadernoSchema);
