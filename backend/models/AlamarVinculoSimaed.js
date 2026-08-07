'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const alamarVinculoSimaedSchema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', required: true, index: true },
  matricula: { type: String, trim: true, default: '' },
  simaedId: { type: String, trim: true, default: '' },
  nomeNormalizado: { type: String, trim: true, default: '', index: true },
  turmaNormalizada: { type: String, trim: true, default: '', index: true },
  ativo: { type: Boolean, default: true, index: true },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

alamarVinculoSimaedSchema.pre('validate', function sincronizarTenant(next) {
  try {
    if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
    if (this.tenantId && !this.instituicao) this.instituicao = this.tenantId;
    next();
  } catch (error) {
    next(error);
  }
});

alamarVinculoSimaedSchema.index({ instituicao: 1, matricula: 1, ativo: 1 });
alamarVinculoSimaedSchema.index({ instituicao: 1, simaedId: 1, ativo: 1 });
alamarVinculoSimaedSchema.index({ instituicao: 1, nomeNormalizado: 1, turmaNormalizada: 1, ativo: 1 });

module.exports = mongoose.models.AlamarVinculoSimaed || mongoose.model('AlamarVinculoSimaed', alamarVinculoSimaedSchema);
