'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { Schema } = mongoose;

function normalizarTurma(valor) {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function toObjectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function objectIdToString(value) {
  if (!value) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

async function gerarHash(senha) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senha, salt);
}

function gerarTokenProfessor() {
  return crypto.randomBytes(16).toString('hex');
}

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
      enum: ['admin', 'monitor', 'professor', 'aluno', 'responsavel', 'secretaria'],
      default: 'monitor',
      index: true,
    },

    /**
     * CAMPOS DE VÍNCULO COM O ALUNO
     * - alunoId: vínculo principal com o documento Aluno
     * - portal: ajuda o sistema a diferenciar acesso institucional vs aluno
     */
    alunoId: {
      type: Schema.Types.ObjectId,
      ref: 'Aluno',
      default: null,
      index: true,
    },

    portal: {
      type: String,
      enum: ['institucional', 'aluno', 'responsavel'],
      default: 'institucional',
      index: true,
    },

    /**
     * ESCOPO DO OBSERVATÓRIO
     * Usado por usuários do tipo "secretaria" para definir quais dados
     * agregados poderão visualizar no painel executivo.
     */
    escopoObservatorio: {
      nivel: {
        type: String,
        enum: ['nacional', 'estadual', 'municipal', 'regional', 'rede', 'instituicoes', null],
        default: null,
        index: true,
      },

      estado: {
        type: String,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 2,
        default: null,
        index: true,
      },

      municipio: {
        type: String,
        trim: true,
        default: null,
        index: true,
      },

      regional: {
        type: String,
        trim: true,
        default: null,
        index: true,
      },

      rede: {
        type: String,
        trim: true,
        default: null,
        index: true,
      },

      instituicoesPermitidas: [{
        type: Schema.Types.ObjectId,
        ref: 'Instituicao',
      }],

      podeVerDadosIndividuais: {
        type: Boolean,
        default: false,
      },
    },

    /**
     * CAMPO LEGADO / ATUAL
     * Continua existindo para não quebrar o sistema atual.
     */
    instituicao: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      required: [true, 'Instituição é obrigatória.'],
      index: true,
    },

    /**
     * NOVO CAMPO MULTI-TENANT
     * Mantido em paralelo com "instituicao" para transição gradual.
     */
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Instituicao',
      default: null,
      index: true,
    },

    // Acessos modulares preservam o tipo institucional legado e permitem
    // perfis específicos no Axoriin Associações sem quebrar o login atual.
    acessosModulos: {
      associacao: {
        ativo: { type: Boolean, default: false, index: true },
        perfil: {
          type: String,
          enum: ['presidente', 'vice_presidente', 'tesoureiro', 'secretario', 'conselho_fiscal', 'operador', 'consulta', null],
          default: null,
          index: true,
        },
      },
    },

    // turmas vinculadas ao professor
    turmas: {
      type: [String],
      default: [],
      index: true,
      set: (arr) => {
        if (!Array.isArray(arr)) return [];
        return [...new Set(arr.map(normalizarTurma).filter(Boolean))];
      }
    },

    tokenAcesso: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    emailVerificado: {
      type: Boolean,
      default: true,
      index: true,
    },

    emailVerificadoEm: {
      type: Date,
      default: null,
    },

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
  {
    timestamps: true
  }
);

/* =========================
   ÍNDICES
========================= */
usuarioSchema.index({ instituicao: 1, email: 1 }, { unique: true });
usuarioSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
usuarioSchema.index({ tokenVerificacaoHash: 1, tokenVerificacaoExpiraEm: 1 });
usuarioSchema.index({ instituicao: 1, tipo: 1, turmas: 1 });
usuarioSchema.index({ tenantId: 1, tipo: 1, turmas: 1 });
usuarioSchema.index({ instituicao: 1, portal: 1, tipo: 1 });
usuarioSchema.index({ tenantId: 1, portal: 1, tipo: 1 });
usuarioSchema.index({ instituicao: 1, alunoId: 1 }, { sparse: true });
usuarioSchema.index({ tenantId: 1, alunoId: 1 }, { sparse: true });
usuarioSchema.index({ tenantId: 1, 'acessosModulos.associacao.ativo': 1, 'acessosModulos.associacao.perfil': 1 });
usuarioSchema.index({
  tipo: 1,
  'escopoObservatorio.nivel': 1,
  'escopoObservatorio.estado': 1,
  'escopoObservatorio.municipio': 1,
});

/* =========================
   SINCRONIZAÇÃO tenantId <-> instituicao
========================= */
function sincronizarTenant(doc) {
  const instituicao = toObjectIdOrNull(doc.instituicao);
  const tenantId = toObjectIdOrNull(doc.tenantId);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no usuário.');
  }

  if (instituicao && !tenantId) {
    doc.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    doc.instituicao = tenantId;
  }
}

function sincronizarTenantNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};

  const instituicaoDireta = update.instituicao;
  const tenantDireto = update.tenantId;

  const instituicaoSet = $set.instituicao ?? $setOnInsert.instituicao ?? instituicaoDireta;
  const tenantSet = $set.tenantId ?? $setOnInsert.tenantId ?? tenantDireto;

  const instituicao = toObjectIdOrNull(instituicaoSet);
  const tenantId = toObjectIdOrNull(tenantSet);

  if (instituicao && tenantId && objectIdToString(instituicao) !== objectIdToString(tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no update do usuário.');
  }

  if (instituicao && !tenantId) {
    if (update.$set) update.$set.tenantId = instituicao;
    else update.tenantId = instituicao;
  } else if (!instituicao && tenantId) {
    if (update.$set) update.$set.instituicao = tenantId;
    else update.instituicao = tenantId;
  }
}

function sincronizarPortalETipo(doc) {
  const tipo = String(doc.tipo || '').trim().toLowerCase();

  if (tipo === 'aluno') {
    doc.portal = 'aluno';
    doc.turmas = [];
    doc.tokenAcesso = undefined;
    return;
  }

  if (tipo === 'responsavel') {
    doc.portal = 'responsavel';
    doc.turmas = [];
    doc.tokenAcesso = undefined;
    return;
  }

  doc.portal = 'institucional';
}

function sincronizarPortalETipoNoUpdate(update) {
  if (!update || typeof update !== 'object') return;

  const alvo = update.$set || update;
  const tipo = String(alvo.tipo || '').trim().toLowerCase();

  if (!tipo) return;

  if (tipo === 'aluno') {
    alvo.portal = 'aluno';
    alvo.turmas = [];
    alvo.tokenAcesso = undefined;
    return;
  }

  if (tipo === 'responsavel') {
    alvo.portal = 'responsavel';
    alvo.turmas = [];
    alvo.tokenAcesso = undefined;
    return;
  }

  alvo.portal = 'institucional';
}

/* =========================
   MIDDLEWARES
========================= */
usuarioSchema.pre('validate', function (next) {
  try {
    sincronizarTenant(this);
    sincronizarPortalETipo(this);
    next();
  } catch (err) {
    next(err);
  }
});

usuarioSchema.pre('save', async function (next) {
  try {
    if (this.isModified('email') && this.email) {
      this.email = String(this.email).trim().toLowerCase();
    }

    if (this.isModified('turmas') && Array.isArray(this.turmas)) {
      this.turmas = [...new Set(this.turmas.map(normalizarTurma).filter(Boolean))];
    }

    sincronizarTenant(this);
    sincronizarPortalETipo(this);

    if (this.isModified('senha')) {
      this.senha = await gerarHash(this.senha);
    }

    if (this.tipo === 'professor' && !this.tokenAcesso) {
      this.tokenAcesso = gerarTokenProfessor();
    }

    if (this.tipo !== 'professor') {
      this.tokenAcesso = undefined;
    }

    next();
  } catch (err) {
    next(err);
  }
});

usuarioSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};

    if (update.email || update.$set?.email) {
      const alvo = update.$set || update;
      alvo.email = String(alvo.email || '').trim().toLowerCase();
    }

    const alvoTurmas = update.turmas || update.$set?.turmas;
    if (Array.isArray(alvoTurmas)) {
      const turmasNormalizadas = [...new Set(alvoTurmas.map(normalizarTurma).filter(Boolean))];
      if (update.$set) update.$set.turmas = turmasNormalizadas;
      else update.turmas = turmasNormalizadas;
    }

    const novaSenha = update.senha || update.$set?.senha;
    if (typeof novaSenha === 'string' && novaSenha.length > 0) {
      const hashed = await gerarHash(novaSenha);
      if (update.$set) update.$set.senha = hashed;
      else update.senha = hashed;
    }

    const novoTipo = update.tipo || update.$set?.tipo;
    const jaTemToken = update.tokenAcesso || update.$set?.tokenAcesso;
    if (novoTipo === 'professor' && !jaTemToken) {
      const novoToken = gerarTokenProfessor();
      if (update.$set) update.$set.tokenAcesso = novoToken;
      else update.tokenAcesso = novoToken;
    }

    sincronizarTenantNoUpdate(update);
    sincronizarPortalETipoNoUpdate(update);
    this.setUpdate(update);

    next();
  } catch (err) {
    next(err);
  }
});

/* =========================
   MÉTODOS
========================= */
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

/* =========================
   VIRTUALS
========================= */
usuarioSchema.virtual('tenant').get(function () {
  return this.tenantId || this.instituicao || null;
});

usuarioSchema.virtual('tenantSlug').get(function () {
  return null;
});

/* =========================
   TRANSFORM
========================= */
function ocultarCampos(_doc, ret) {
  delete ret.senha;
  delete ret.__v;
  delete ret.tokenVerificacaoHash;
  delete ret.tokenVerificacaoExpiraEm;
  return ret;
}

usuarioSchema.set('toJSON', { virtuals: true, transform: ocultarCampos });
usuarioSchema.set('toObject', { virtuals: true, transform: ocultarCampos });

module.exports = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema);