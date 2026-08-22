'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

function syncTenant(doc) {
  if (doc.instituicao && !doc.tenantId) doc.tenantId = doc.instituicao;
  if (!doc.instituicao && doc.tenantId) doc.instituicao = doc.tenantId;
  if (doc.instituicao && doc.tenantId && String(doc.instituicao) !== String(doc.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId no fornecedor de uniformes.');
  }
}

const enderecoSchema = new Schema({
  logradouro: { type: String, trim: true, default: '' },
  numero: { type: String, trim: true, default: '' },
  complemento: { type: String, trim: true, default: '' },
  bairro: { type: String, trim: true, default: '' },
  cidade: { type: String, trim: true, default: '' },
  uf: { type: String, trim: true, uppercase: true, default: '' },
  cep: { type: String, trim: true, default: '' },
}, { _id: false });

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  nome: { type: String, required: true, trim: true },
  nomeBusca: { type: String, trim: true, index: true },
  razaoSocial: { type: String, trim: true, default: '' },
  nomeFantasia: { type: String, trim: true, default: '' },
  documento: { type: String, trim: true, default: '' },
  telefone: { type: String, trim: true, default: '' },
  whatsapp: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  endereco: { type: enderecoSchema, default: () => ({}) },
  responsavel: { type: String, trim: true, default: '' },
  observacoes: { type: String, trim: true, default: '' },
  ativo: { type: Boolean, default: true, index: true },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  atualizadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  syncTenant(this);
  this.nomeBusca = String(this.nome || '').trim().toLocaleLowerCase('pt-BR');
});

schema.index({ instituicao: 1, ativo: 1, nomeBusca: 1 });

module.exports = mongoose.models.UniformeFornecedor || mongoose.model('UniformeFornecedor', schema);
