// backend/models/Instituicao.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

function toSlug(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')                      // troca não-alfanum por -
    .replace(/-+/g, '-')                              // remove repetidos
    .replace(/^-|-$/g, '');                           // tira - das pontas
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
  return s
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * Representa uma instituição (ex.: CMDPII - CZS)
 * A entrada do sistema deve ser SEMPRE por slug (?t=slug) ou subdomínio.
 */
const instituicaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da instituição é obrigatório.'],
      trim: true,
    },

    // ✅ identificador fixo (NUNCA digitado pelo usuário final)
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

    municipio: { type: String, trim: true },
    estado: { type: String, trim: true, uppercase: true, minlength: 2, maxlength: 2 },
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

    /**
     * ✅ Campo atual mantido
     */
    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * ✅ Novo alias semântico para o SaaS
     * Mantido sincronizado com "ativo"
     */
    ativa: {
      type: Boolean,
      default: true,
      index: true,
    },

    /**
     * ✅ Multi-tenant por subdomínio
     * Ex.: czs.axoriin.com
     */
    subdominio: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined,
    },

    /**
     * ✅ Opcional: domínio próprio da instituição
     * Ex.: portal.escola.com.br
     */
    dominioPersonalizado: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined,
    },

    /**
     * ✅ Nome curto opcional para branding
     */
    nomeExibicao: {
      type: String,
      trim: true,
      default: undefined,
    },

    /**
     * ✅ Identificador legado/externo opcional
     */
    codigo: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
      default: undefined,
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

/** Normalizações */
instituicaoSchema.pre('validate', function (next) {
  try {
    if (this.nome) this.nome = String(this.nome).trim();

    // se o slug não foi fornecido, gera a partir do nome
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

    // sincroniza ativa <-> ativo
    if (typeof this.ativo === 'boolean' && typeof this.ativa !== 'boolean') {
      this.ativa = this.ativo;
    } else if (typeof this.ativa === 'boolean' && typeof this.ativo !== 'boolean') {
      this.ativo = this.ativa;
    } else if (typeof this.ativo === 'boolean' && typeof this.ativa === 'boolean') {
      this.ativa = this.ativo;
    }

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

    this.setUpdate(update);
    next();
  } catch (e) {
    next(e);
  }
});

/** Virtuais */
instituicaoSchema.virtual('tenantSlug').get(function () {
  return this.slug || null;
});

instituicaoSchema.virtual('hostPreferencial').get(function () {
  if (this.dominioPersonalizado) return this.dominioPersonalizado;
  if (this.subdominio) return this.subdominio;
  return this.slug || null;
});

/** toJSON limpo */
instituicaoSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Instituicao || mongoose.model('Instituicao', instituicaoSchema);