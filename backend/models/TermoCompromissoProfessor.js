'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

function hashConteudo(conteudo) {
  return crypto.createHash('sha256').update(String(conteudo || ''), 'utf8').digest('hex');
}

const termoCompromissoProfessorSchema = new Schema({
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
  publico: {
    type: String,
    enum: ['professor'],
    default: 'professor',
    required: true,
    index: true,
  },
  titulo: {
    type: String,
    required: true,
    trim: true,
  },
  versao: {
    type: String,
    required: true,
    trim: true,
  },
  conteudo: {
    type: String,
    required: true,
  },
  conteudoHash: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  ativo: {
    type: Boolean,
    default: false,
    index: true,
  },
  publicadoEm: {
    type: Date,
    default: null,
  },
  criadoPor: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null,
  },
  observacao: {
    type: String,
    trim: true,
    default: null,
  },
}, { timestamps: true });

termoCompromissoProfessorSchema.index(
  { instituicao: 1, publico: 1, versao: 1 },
  { unique: true }
);
termoCompromissoProfessorSchema.index({ instituicao: 1, publico: 1, ativo: 1, publicadoEm: -1 });

termoCompromissoProfessorSchema.pre('validate', function (next) {
  try {
    if (!this.tenantId && this.instituicao) this.tenantId = this.instituicao;
    if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
    if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
      throw new Error('Inconsistência entre instituicao e tenantId no termo.');
    }
    this.conteudoHash = hashConteudo(this.conteudo);
    if (this.ativo && !this.publicadoEm) this.publicadoEm = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

termoCompromissoProfessorSchema.statics.hashConteudo = hashConteudo;

module.exports = mongoose.models.TermoCompromissoProfessor ||
  mongoose.model('TermoCompromissoProfessor', termoCompromissoProfessorSchema);
