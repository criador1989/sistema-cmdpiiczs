'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const PERFIS_ASSOCIACAO = [
  'presidente',
  'vice_presidente',
  'tesoureiro',
  'secretario',
  'conselho_fiscal',
  'operador',
  'consulta',
];

const TIPOS_INSTITUCIONAIS = [
  'admin',
  'monitor',
  'professor',
  'aluno',
  'responsavel',
  'secretaria',
];

const vinculoSchema = new Schema(
  {
    usuario: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
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
    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },
    tipoInstitucional: {
      type: String,
      enum: TIPOS_INSTITUCIONAIS,
      default: 'admin',
      index: true,
    },
    portal: {
      type: String,
      enum: ['institucional', 'aluno', 'responsavel'],
      default: 'institucional',
      index: true,
    },
    alunoId: {
      type: Schema.Types.ObjectId,
      ref: 'Aluno',
      default: null,
      index: true,
    },
    turmas: {
      type: [String],
      default: [],
    },
    escopoObservatorio: {
      type: Schema.Types.Mixed,
      default: null,
    },
    acessosModulos: {
      associacao: {
        ativo: { type: Boolean, default: false, index: true },
        perfil: {
          type: String,
          enum: [...PERFIS_ASSOCIACAO, null],
          default: null,
          index: true,
        },
      },
    },
    origem: {
      type: String,
      enum: ['master_associacoes', 'associacao', 'migracao_legado', 'master_instituicoes', 'manual'],
      default: 'manual',
      index: true,
    },
    criadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
    atualizadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
  },
  { timestamps: true }
);

vinculoSchema.index({ usuario: 1, instituicao: 1 }, { unique: true });
vinculoSchema.index({ instituicao: 1, ativo: 1, 'acessosModulos.associacao.ativo': 1 });
vinculoSchema.index({ tenantId: 1, 'acessosModulos.associacao.perfil': 1, ativo: 1 });

vinculoSchema.pre('validate', function sincronizarTenant(next) {
  try {
    const instituicao = this.instituicao ? String(this.instituicao) : '';
    const tenantId = this.tenantId ? String(this.tenantId) : '';

    if (instituicao && tenantId && instituicao !== tenantId) {
      throw new Error('Inconsistência entre instituicao e tenantId no vínculo do usuário.');
    }

    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;

    if (Array.isArray(this.turmas)) {
      this.turmas = [...new Set(this.turmas.map(v => String(v || '').trim()).filter(Boolean))];
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.models.UsuarioVinculoInstituicao ||
  mongoose.model('UsuarioVinculoInstituicao', vinculoSchema);
module.exports.PERFIS_ASSOCIACAO = PERFIS_ASSOCIACAO;
module.exports.TIPOS_INSTITUCIONAIS = TIPOS_INSTITUCIONAIS;
