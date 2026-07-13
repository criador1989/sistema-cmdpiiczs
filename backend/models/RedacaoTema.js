'use strict';

const mongoose = require('mongoose');

const TextoMotivadorSchema = new mongoose.Schema({
  titulo: { type: String, trim: true, default: '' },
  conteudo: { type: String, trim: true, default: '' },
  fonte: { type: String, trim: true, default: '' },
  fonteUrl: { type: String, trim: true, default: '' },
  acessadoEm: { type: String, trim: true, default: '' },
  tipo: { type: String, enum: ['dado','reportagem','legislacao','conceito','citacao','estudo'], default: 'estudo' }
}, { _id: false });

const RedacaoTemaSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  codigoBanco: { type: String, trim: true, default: '', index: true },
  titulo: { type: String, required: true, trim: true },
  proposta: { type: String, required: true, trim: true },
  eixoTematico: { type: String, trim: true, default: 'Redação ENEM' },
  palavrasChave: [{ type: String, trim: true }],
  textosMotivadores: { type: [TextoMotivadorSchema], default: [] },
  modalidade: {
    type: String,
    enum: ['trilha_orientada', 'pratica_livre'],
    default: 'trilha_orientada',
    index: true
  },
  destaquePraticaLivre: { type: Boolean, default: false },
  ordemPraticaLivre: { type: Number, default: 0 },
  turmasDestinadas: { type: [mongoose.Schema.Types.Mixed], default: [] },
  publicoAlvo: { type: String, trim: true, default: 'Ensino Médio' },
  orientacoesProfessor: { type: String, trim: true, default: '' },
  tempoSugeridoMinutos: { type: Number, default: 60, min: 0, max: 240 },
  minimoPalavras: { type: Number, default: 120, min: 0 },
  maximoPalavras: { type: Number, default: 450, min: 0 },
  status: { type: String, enum: ['ativo','inativo','arquivado'], default: 'inativo', index: true },
  dataInicio: { type: Date, default: null },
  dataFim: { type: Date, default: null },
  criadoPor: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, collection: 'redacao_temas' });

RedacaoTemaSchema.index({ instituicao: 1, status: 1, modalidade: 1, createdAt: -1 });
RedacaoTemaSchema.index({ instituicao: 1, codigoBanco: 1 });

module.exports = mongoose.model('RedacaoTema', RedacaoTemaSchema);
