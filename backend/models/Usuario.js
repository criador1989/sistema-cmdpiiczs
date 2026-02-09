// models/Usuario.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { Schema } = mongoose;

const usuarioSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome é obrigatório.'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'E-mail é obrigatório.'],
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')),
        message: 'E-mail inválido.',
      },
      // ⚠️ NÃO coloque unique aqui se você quer permitir o mesmo e-mail em instituições diferentes
      // unique: true
    },

    senha: {
      type: String,
      required: [true, 'Senha é obrigatória.'],
      select: false,
      minlength: [6, 'Senha deve ter ao menos 6 caracteres.'],
    },

    tipo: {
      type: String,
      enum: ['admin', 'monitor', 'professor'],
      default: 'monitor',
      index: true,
    },

    // 🔗 Referência para a instituição (ObjectId)
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: [true, 'Instituição é obrigatória.'],
      index: true,
    },

    // Token de acesso rápido (ex.: professores via QR Code)
    tokenAcesso: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // ✅ CONFIRMAÇÃO DE E-MAIL
    // default: true para NÃO quebrar usuários antigos já existentes no banco
    emailVerificado: {
      type: Boolean,
      default: true,
      index: true,
    },

    emailVerificadoEm: {
      type: Date,
      default: null,
    },

    // armazena HASH (sha256) do token de confirmação (nunca salvar token cru)
    tokenVerificacaoHash: {
      type: String,
      default: null,
      index: true,
    },

    tokenVerificacaoExpiraEm: {
      type: Date,
      default: null,
      index: true,
    },

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

/* ===========================================================
 *  ÍNDICES
 * ===========================================================
 */

// ✅ E-mail único DENTRO da mesma instituição
// (Permite mesmo e-mail em instituições diferentes)
usuarioSchema.index({ instituicao: 1, email: 1 }, { unique: true });

// (opcional) ajuda a procurar tokens válidos/expirados
usuarioSchema.index({ tokenVerificacaoHash: 1, tokenVerificacaoExpiraEm: 1 });

/* ===========================================================
 *  FUNÇÕES AUXILIARES
 * ===========================================================
 */
async function gerarHash(senha) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senha, salt);
}

function gerarTokenProfessor() {
  // 16 bytes -> 32 caracteres hexadecimais únicos
  return crypto.randomBytes(16).toString('hex');
}

/* ===========================================================
 *  HOOKS MONGOOSE
 * ===========================================================
 */

// Antes de salvar
usuarioSchema.pre('save', async function (next) {
  try {
    // normaliza email sempre
    if (this.isModified('email') && this.email) {
      this.email = String(this.email).trim().toLowerCase();
    }

    // hash senha se alterada
    if (this.isModified('senha')) {
      this.senha = await gerarHash(this.senha);
    }

    // gera token professor (se necessário)
    if (this.tipo === 'professor' && !this.tokenAcesso) {
      this.tokenAcesso = gerarTokenProfessor();
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Antes de atualizar (findOneAndUpdate)
usuarioSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};

    // normaliza email
    if (update.email || update.$set?.email) {
      const u = update.$set || update;
      u.email = String(u.email || '').trim().toLowerCase();
    }

    // hash de senha se necessário
    const novaSenha = update.senha || update.$set?.senha;
    if (typeof novaSenha === 'string' && novaSenha.length > 0) {
      const hashed = await gerarHash(novaSenha);
      if (update.$set) update.$set.senha = hashed;
      else update.senha = hashed;
    }

    // gera token se tipo virou professor
    const novoTipo = update.tipo || update.$set?.tipo;
    const jaTemToken = update.tokenAcesso || update.$set?.tokenAcesso;
    if (novoTipo === 'professor' && !jaTemToken) {
      const novoToken = gerarTokenProfessor();
      if (update.$set) update.$set.tokenAcesso = novoToken;
      else update.tokenAcesso = novoToken;
    }

    next();
  } catch (err) {
    next(err);
  }
});

/* ===========================================================
 *  MÉTODOS DE INSTÂNCIA
 * ===========================================================
 */
usuarioSchema.methods.compararSenha = function (senhaDigitada) {
  return bcrypt.compare(String(senhaDigitada || ''), this.senha);
};

usuarioSchema.methods.regenerarTokenProfessor = function () {
  if (this.tipo !== 'professor') {
    throw new Error('Apenas usuários do tipo professor podem ter tokenAcesso.');
  }
  this.tokenAcesso = gerarTokenProfessor();
  return this.tokenAcesso;
};

/* ===========================================================
 *  FORMATADORES (toJSON / toObject)
 * ===========================================================
 */
function ocultarCampos(_doc, ret) {
  delete ret.senha;
  delete ret.__v;

  // por segurança, nunca expor campos de confirmação
  delete ret.tokenVerificacaoHash;
  delete ret.tokenVerificacaoExpiraEm;

  return ret;
}

usuarioSchema.set('toJSON', { virtuals: true, transform: ocultarCampos });
usuarioSchema.set('toObject', { virtuals: true, transform: ocultarCampos });

/* ===========================================================
 *  EXPORT
 * ===========================================================
 */
module.exports = mongoose.model('Usuario', usuarioSchema);
