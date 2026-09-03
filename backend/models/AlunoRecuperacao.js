'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const alunoRecuperacaoSchema = new Schema(
  {
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: true,
      index: true
    },

    alunoId: {
      type: Schema.Types.ObjectId,
      ref: 'Aluno',
      required: true,
      index: true
    },

    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
      index: true
    },

    // Endereço já confirmado e autorizado para recuperar a conta.
    // Não é unique: irmãos podem usar o mesmo e-mail do responsável.
    emailRecuperacao: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      index: true
    },

    emailRecuperacaoVerificadoEm: {
      type: Date,
      default: null
    },

    // Enquanto um novo endereço aguarda confirmação, o endereço anterior
    // (se existir) continua válido.
    emailPendente: {
      type: String,
      trim: true,
      lowercase: true,
      default: null
    },

    tokenConfirmacaoHash: {
      type: String,
      default: null,
      select: false
    },

    tokenConfirmacaoExpiraEm: {
      type: Date,
      default: null
    },

    resetTokenHash: {
      type: String,
      default: null,
      select: false
    },

    resetTokenExpiraEm: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

alunoRecuperacaoSchema.index(
  { instituicao: 1, alunoId: 1 },
  { unique: true, name: 'uniq_aluno_recuperacao_por_instituicao' }
);

alunoRecuperacaoSchema.index(
  { tokenConfirmacaoHash: 1 },
  { sparse: true, name: 'idx_aluno_recuperacao_confirmacao' }
);

alunoRecuperacaoSchema.index(
  { resetTokenHash: 1 },
  { sparse: true, name: 'idx_aluno_recuperacao_reset' }
);

function ocultarSegredos(_doc, ret) {
  delete ret.tokenConfirmacaoHash;
  delete ret.resetTokenHash;
  delete ret.__v;
  return ret;
}

alunoRecuperacaoSchema.set('toJSON', { transform: ocultarSegredos });
alunoRecuperacaoSchema.set('toObject', { transform: ocultarSegredos });

module.exports =
  mongoose.models.AlunoRecuperacao ||
  mongoose.model('AlunoRecuperacao', alunoRecuperacaoSchema);
