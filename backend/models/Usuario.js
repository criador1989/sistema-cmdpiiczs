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
      // Unicidade aplicada via índice composto (instituicao + email)
      validate: {
        validator: (v) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')),
        message: 'E-mail inválido.',
      },
    },

    senha: {
      type: String,
      required: [true, 'Senha é obrigatória.'],
      select: false, // nunca retorna por padrão
      minlength: [6, 'Senha deve ter ao menos 6 caracteres.'],
    },

    tipo: {
      type: String,
      enum: ['admin', 'monitor', 'professor'],
      default: 'monitor',
      index: true,
    },

    // 🔐 Multi-tenant
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: [true, 'Instituição é obrigatória.'],
      index: true,
    },

    // Token de acesso “rápido” (ex.: para rotas de professor)
    tokenAcesso: {
      type: String,
      unique: true,
      sparse: true, // só professores terão
      index: true,
    },

    // (Opcional) flag de status
    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

/** ===================== Índices ===================== */
/**
 * Unicidade por instituição + e-mail
 * (substitui unique:true global – mais flexível em multi-tenant)
 */
usuarioSchema.index({ instituicao: 1, email: 1 }, { unique: true });

/** ===================== Helpers internos ===================== */
function precisaHashDaSenha(docOuUpdate) {
  // Quando vem via save: doc.isModified('senha') cobre.
  // Quando vem via findOneAndUpdate: checamos update.$set?.senha | update.senha
  if (!docOuUpdate) return false;
  if (typeof docOuUpdate.isModified === 'function') {
    return docOuUpdate.isModified('senha');
  }
  const u = docOuUpdate.$set || docOuUpdate;
  return typeof u?.senha === 'string' && u.senha.length >= 1;
}

async function gerarHash(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

function precisaTokenProfessor(docOuUpdate) {
  const u = docOuUpdate.$set || docOuUpdate;
  const tipoAlvo = u?.tipo;
  const virandoProfessor = tipoAlvo === 'professor';
  const jaTemToken = !!(u?.tokenAcesso);
  return virandoProfessor && !jaTemToken;
}

function gerarTokenProfessor() {
  // 16 bytes -> 32 hex (curto, suficiente e único por índice)
  return crypto.randomBytes(16).toString('hex');
}

/** ===================== Hooks: CREATE/UPDATE ===================== */

// Hash da senha + token professor em CREATE
usuarioSchema.pre('save', async function preSave(next) {
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

// Hash da senha + token professor em UPDATE (findOneAndUpdate)
usuarioSchema.pre('findOneAndUpdate', async function preF1U(next) {
  try {
    const update = this.getUpdate() || {};

    // garantir normalização de e-mail se vindo no update
    if (update.$set?.email || update.email) {
      const u = update.$set || update;
      if (typeof u.email === 'string') {
        u.email = u.email.trim().toLowerCase();
      }
    }

    // Hash da senha se enviada no update
    if (precisaHashDaSenha(update)) {
      const u = update.$set || update;
      u.senha = await gerarHash(u.senha);
    }

    // Geração de tokenAcesso se tipo virar professor e ainda não houver token
    if (precisaTokenProfessor(update)) {
      const u = update.$set || update;
      u.tokenAcesso = gerarTokenProfessor();
    }

    next();
  } catch (err) {
    next(err);
  }
});

/** ===================== Métodos de instância ===================== */
usuarioSchema.methods.compararSenha = function compararSenha(senhaDigitada) {
  return bcrypt.compare(String(senhaDigitada || ''), this.senha);
};

usuarioSchema.methods.regenerarTokenProfessor = function regenerarTokenProfessor() {
  if (this.tipo !== 'professor') {
    throw new Error('Apenas usuários do tipo professor podem ter tokenAcesso.');
  }
  this.tokenAcesso = gerarTokenProfessor();
  return this.tokenAcesso;
};

/** ===================== toJSON/toObject (higienização) ===================== */
function ocultarCampos(doc, ret) {
  delete ret.senha;
  delete ret.__v;
  return ret;
}

usuarioSchema.set('toJSON', { virtuals: true, transform: ocultarCampos });
usuarioSchema.set('toObject', { virtuals: true, transform: ocultarCampos });

module.exports = mongoose.model('Usuario', usuarioSchema);
