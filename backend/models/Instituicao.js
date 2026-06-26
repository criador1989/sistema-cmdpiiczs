// backend/models/Instituicao.js
'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

function toSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function trimOrUndefined(v) {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function lowerOrUndefined(v) {
  const s = trimOrUndefined(v);
  return s ? s.toLowerCase() : undefined;
}

function upperOrUndefined(v) {
  const s = trimOrUndefined(v);
  return s ? s.toUpperCase() : undefined;
}

function normalizeDomain(v) {
  const s = lowerOrUndefined(v);
  if (!s) return undefined;
  return s.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function normalizarRedeEnsino(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['estadual', 'municipal', 'federal', 'privada', 'militar', 'civico_militar', 'outra'].includes(s)) return s;
  return 'estadual';
}

function normalizarTipoEscola(v, redeEnsino = '') {
  const s = String(v || '').trim().toLowerCase();
  if (['militar', 'civico_militar', 'civil', 'privada', 'outra'].includes(s)) return s;
  if (redeEnsino === 'privada') return 'privada';
  if (redeEnsino === 'militar') return 'militar';
  if (redeEnsino === 'civico_militar') return 'civico_militar';
  return 'civil';
}

function aplicarProtecaoObservatorio(doc) {
  if (!doc) return;

  const rede = normalizarRedeEnsino(doc.redeEnsino || doc.rede || 'estadual');
  const tipo = normalizarTipoEscola(doc.tipoEscola || doc.tipoInstituicao, rede);

  doc.redeEnsino = rede;
  doc.tipoEscola = tipo;

  // Proteção conservadora: escolas privadas e ambientes de teste não aparecem para Secretaria.
  if (rede === 'privada' || tipo === 'privada') {
    doc.observatorioAtivo = false;
    doc.visivelParaSecretaria = false;
  }

  if (doc.ambienteTeste === true) {
    doc.visivelParaSecretaria = false;
  }
}

const instituicaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da instituição é obrigatório.'],
      trim: true,
    },

    slug: {
      type: String,
      required: [true, 'Slug da instituição é obrigatório.'],
      trim: true,
      lowercase: true,
      index: true,
    },

    sigla: {
      type: String,
      trim: true,
      uppercase: true,
    },

    cnpj: {
      type: String,
      trim: true,
      match: [/^\d{14}$/, 'CNPJ deve conter 14 dígitos numéricos.'],
    },

    municipio: { type: String, trim: true, index: true },
    estado: { type: String, trim: true, uppercase: true, minlength: 2, maxlength: 2, index: true },
    timezone: { type: String, trim: true, default: 'America/Rio_Branco', index: true, },
    endereco: { type: String, trim: true },
    telefone: { type: String, trim: true },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
        message: 'E-mail inválido.',
      },
    },

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },

    ativa: {
      type: Boolean,
      default: true,
      index: true,
    },

    subdominio: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined,
    },

    dominioPersonalizado: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined,
    },

    nomeExibicao: {
      type: String,
      trim: true,
      default: undefined,
    },

    logoUrl: {
      type: String,
      trim: true,
      default: undefined,
    },

    codigo: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
      default: undefined,
    },

    // =========================
    // GOVERNANÇA DO OBSERVATÓRIO
    // =========================
    redeEnsino: {
      type: String,
      enum: ['estadual', 'municipal', 'federal', 'privada', 'militar', 'civico_militar', 'outra'],
      default: 'estadual',
      index: true,
    },

    tipoEscola: {
      type: String,
      enum: ['militar', 'civico_militar', 'civil', 'privada', 'outra'],
      default: 'civil',
      index: true,
    },

    observatorioAtivo: {
      type: Boolean,
      default: false,
      index: true,
    },

    visivelParaSecretaria: {
      type: Boolean,
      default: false,
      index: true,
    },

    ambienteTeste: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/** Índices */
instituicaoSchema.index({ slug: 1 }, { unique: true });
instituicaoSchema.index({ nome: 1 }, { unique: true });
instituicaoSchema.index({ subdominio: 1 }, { unique: true, sparse: true });
instituicaoSchema.index({ dominioPersonalizado: 1 }, { unique: true, sparse: true });
instituicaoSchema.index({ codigo: 1 }, { unique: true, sparse: true });
instituicaoSchema.index({ ativa: 1, slug: 1 });
instituicaoSchema.index({ ativo: 1, slug: 1 });
instituicaoSchema.index({ estado: 1, municipio: 1, redeEnsino: 1, observatorioAtivo: 1, visivelParaSecretaria: 1 });
instituicaoSchema.index({ ambienteTeste: 1, observatorioAtivo: 1 });

/** Normalizações */
instituicaoSchema.pre('validate', function (next) {
  try {
    if (this.nome) this.nome = String(this.nome).trim();

    if (!this.slug || String(this.slug).trim().length < 2) {
      this.slug = toSlug(this.nome);
    } else {
      this.slug = toSlug(this.slug);
    }

    if (this.sigla !== undefined) this.sigla = upperOrUndefined(this.sigla);
    if (this.municipio !== undefined) this.municipio = trimOrUndefined(this.municipio);
    if (this.estado !== undefined) this.estado = upperOrUndefined(this.estado);
    if (this.endereco !== undefined) this.endereco = trimOrUndefined(this.endereco);
    if (this.telefone !== undefined) this.telefone = trimOrUndefined(this.telefone);
    if (this.email !== undefined) this.email = lowerOrUndefined(this.email);
    if (this.nomeExibicao !== undefined) this.nomeExibicao = trimOrUndefined(this.nomeExibicao);
    if (this.codigo !== undefined) this.codigo = upperOrUndefined(this.codigo);

    if (this.subdominio !== undefined) {
      this.subdominio = this.subdominio ? toSlug(this.subdominio) : undefined;
    }

    if (this.dominioPersonalizado !== undefined) {
      this.dominioPersonalizado = normalizeDomain(this.dominioPersonalizado);
    }

    if (typeof this.ativo === 'boolean' && typeof this.ativa !== 'boolean') {
      this.ativa = this.ativo;
    } else if (typeof this.ativa === 'boolean' && typeof this.ativo !== 'boolean') {
      this.ativo = this.ativa;
    } else if (typeof this.ativo === 'boolean' && typeof this.ativa === 'boolean') {
      this.ativa = this.ativo;
    }

    aplicarProtecaoObservatorio(this);

    next();
  } catch (e) {
    next(e);
  }
});

instituicaoSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    if (!update.$set) update.$set = {};

    const alvo = update.$set;

    if ('nome' in alvo && alvo.nome !== undefined) {
      alvo.nome = String(alvo.nome).trim();
    }

    if ('slug' in alvo) {
      alvo.slug = toSlug(alvo.slug);
    } else if ('nome' in alvo && (!alvo.slug || String(alvo.slug || '').trim().length < 2)) {
      alvo.slug = toSlug(alvo.nome);
    }

    if ('sigla' in alvo) alvo.sigla = upperOrUndefined(alvo.sigla);
    if ('municipio' in alvo) alvo.municipio = trimOrUndefined(alvo.municipio);
    if ('estado' in alvo) alvo.estado = upperOrUndefined(alvo.estado);
    if ('endereco' in alvo) alvo.endereco = trimOrUndefined(alvo.endereco);
    if ('telefone' in alvo) alvo.telefone = trimOrUndefined(alvo.telefone);
    if ('email' in alvo) alvo.email = lowerOrUndefined(alvo.email);
    if ('nomeExibicao' in alvo) alvo.nomeExibicao = trimOrUndefined(alvo.nomeExibicao);
    if ('codigo' in alvo) alvo.codigo = upperOrUndefined(alvo.codigo);

    if ('subdominio' in alvo) {
      alvo.subdominio = alvo.subdominio ? toSlug(alvo.subdominio) : undefined;
    }

    if ('dominioPersonalizado' in alvo) {
      alvo.dominioPersonalizado = normalizeDomain(alvo.dominioPersonalizado);
    }

    if ('ativo' in alvo && !('ativa' in alvo)) {
      alvo.ativa = alvo.ativo;
    } else if ('ativa' in alvo && !('ativo' in alvo)) {
      alvo.ativo = alvo.ativa;
    } else if ('ativo' in alvo && 'ativa' in alvo) {
      alvo.ativa = alvo.ativo;
    }

    if ('redeEnsino' in alvo) alvo.redeEnsino = normalizarRedeEnsino(alvo.redeEnsino);
    if ('tipoEscola' in alvo) alvo.tipoEscola = normalizarTipoEscola(alvo.tipoEscola, alvo.redeEnsino);

    if (alvo.redeEnsino === 'privada' || alvo.tipoEscola === 'privada') {
      alvo.observatorioAtivo = false;
      alvo.visivelParaSecretaria = false;
    }

    if (alvo.ambienteTeste === true) {
      alvo.visivelParaSecretaria = false;
    }

    this.setUpdate(update);
    next();
  } catch (e) {
    next(e);
  }
});

instituicaoSchema.virtual('tenantSlug').get(function () {
  return this.slug || null;
});

instituicaoSchema.virtual('hostPreferencial').get(function () {
  if (this.dominioPersonalizado) return this.dominioPersonalizado;
  if (this.subdominio) return this.subdominio;
  return this.slug || null;
});

instituicaoSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Instituicao || mongoose.model('Instituicao', instituicaoSchema);
