'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const schema = new Schema({
  nome: { type: String, required: true, trim: true, index: true },
  tipo: {
    type: String,
    enum: ['Pai/Responsável', 'Associado', 'Parceiro', 'Fornecedor', 'Colaborador', 'Doador', 'Outro'],
    default: 'Pai/Responsável',
    index: true,
  },
  cpfCnpj: { type: String, trim: true, default: null },
  telefone: { type: String, trim: true, default: null },
  whatsapp: { type: String, trim: true, default: null },
  email: { type: String, trim: true, lowercase: true, default: null },
  endereco: { type: String, trim: true, default: null },
  alunoNome: { type: String, trim: true, default: null, index: true },
  alunoTurma: { type: String, trim: true, default: null, index: true },
  dataNascimento: { type: Date, default: null, index: true },
  canalPreferido: {
    type: String,
    enum: ['WhatsApp', 'E-mail', 'SMS', 'Nenhum'],
    default: 'WhatsApp',
  },
  autorizacaoComunicacao: { type: Boolean, default: false, index: true },
  autorizaAniversario: { type: Boolean, default: false },
  autorizaDatasComemorativas: { type: Boolean, default: false },
  autorizaNoticiasAssociacao: { type: Boolean, default: false },
  status: { type: String, enum: ['Ativo', 'Inativo'], default: 'Ativo', index: true },
  observacoes: { type: String, trim: true, default: null },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1, nome: 1 });
schema.index({ tenantId: 1, cpfCnpj: 1 }, { unique: true, sparse: true });
schema.index({ tenantId: 1, alunoTurma: 1, alunoNome: 1 });

module.exports = mongoose.models.AssociacaoPessoa || mongoose.model('AssociacaoPessoa', schema);
