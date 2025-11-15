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

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

/* ===========================================================
 *  ÍNDICES E VALIDAÇÕES
 * ===========================================================
 */

// Garantir e-mail único dentro da mesma instituição
usuarioSchema.index({ instituicao: 1, email: 1 }, { unique: true });

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
    if (this.isModified('senha')) {
      this.senha = await gerarHash(this.senha);
    }

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
function ocultarCampos(doc, ret) {
  delete ret.senha;
  delete ret.__v;
  return ret;
}

usuarioSchema.set('toJSON', { virtuals: true, transform: ocultarCampos });
usuarioSchema.set('toObject', { virtuals: true, transform: ocultarCampos });

/* ===========================================================
 *  EXPORT
 * ===========================================================
 */
module.exports = mongoose.model('Usuario', usuarioSchema);
