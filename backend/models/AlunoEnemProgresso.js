'use strict';

const mongoose = require('mongoose');

const AlunoEnemProgressoSchema = new mongoose.Schema({
  instituicao: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  aluno: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  conteudoId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnemConteudo', required: true, index: true },
  codigoConteudo: { type: String, required: true, trim: true, uppercase: true, index: true },
  status: { type: String, enum: ['nao_iniciado','em_andamento','concluido'], default: 'nao_iniciado', index: true },
  percentual: { type: Number, default: 0, min: 0, max: 100 },
  iniciadoEm: { type: Date, default: null },
  concluidoEm: { type: Date, default: null },
  resultado: { type: mongoose.Schema.Types.Mixed, default: null },
  origem: { type: String, enum: ['trilha','redacao','questionario','manual'], default: 'trilha' }
}, { timestamps: true, collection: 'aluno_enem_progressos' });

AlunoEnemProgressoSchema.index({ instituicao: 1, aluno: 1, conteudoId: 1 }, { unique: true });
AlunoEnemProgressoSchema.index({ instituicao: 1, aluno: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.models.AlunoEnemProgresso || mongoose.model('AlunoEnemProgresso', AlunoEnemProgressoSchema);
