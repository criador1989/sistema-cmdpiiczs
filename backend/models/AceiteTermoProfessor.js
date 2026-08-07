'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const aceiteTermoProfessorSchema = new Schema({
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
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true,
  },
  usuarioNome: { type: String, required: true, trim: true },
  usuarioEmail: { type: String, trim: true, lowercase: true, default: null },
  usuarioTipo: { type: String, trim: true, default: 'professor' },
  instituicaoNome: { type: String, required: true, trim: true },
  termo: {
    type: Schema.Types.ObjectId,
    ref: 'TermoCompromissoProfessor',
    required: true,
    index: true,
  },
  termoTitulo: { type: String, required: true, trim: true },
  termoVersao: { type: String, required: true, trim: true, index: true },
  termoConteudo: { type: String, required: true },
  termoConteudoHash: { type: String, required: true, lowercase: true, index: true },
  aceitoEm: { type: Date, default: Date.now, required: true, index: true },
  declaracaoLeitura: { type: Boolean, required: true },
  declaracaoCompromisso: { type: Boolean, required: true },
  comprovanteCodigo: { type: String, required: true, unique: true, index: true },
  comprovanteHash: { type: String, required: true, lowercase: true, unique: true, index: true },
  ip: { type: String, trim: true, default: null },
  forwardedFor: { type: String, trim: true, default: null },
  userAgent: { type: String, default: null },
  navegador: { type: String, trim: true, default: null },
  sistema: { type: String, trim: true, default: null },
  dispositivo: { type: String, trim: true, default: null },
  requestId: { type: String, trim: true, default: null, index: true },
  sessionId: { type: String, trim: true, default: null, index: true },
  origem: { type: String, trim: true, default: 'primeiro-acesso' },
  revogadoEm: { type: Date, default: null, index: true },
  revogadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  motivoRevogacao: { type: String, trim: true, default: null },
}, { timestamps: true });

aceiteTermoProfessorSchema.index(
  { instituicao: 1, usuario: 1, termo: 1 },
  { unique: true }
);
aceiteTermoProfessorSchema.index({ instituicao: 1, termo: 1, aceitoEm: -1 });
aceiteTermoProfessorSchema.index({ instituicao: 1, usuario: 1, aceitoEm: -1 });

aceiteTermoProfessorSchema.pre('validate', function (next) {
  try {
    if (!this.tenantId && this.instituicao) this.tenantId = this.instituicao;
    if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
    if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId no aceite.');
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.models.AceiteTermoProfessor ||
  mongoose.model('AceiteTermoProfessor', aceiteTermoProfessorSchema);
