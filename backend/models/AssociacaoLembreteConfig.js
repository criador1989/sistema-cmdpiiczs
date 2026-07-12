'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { associationTenantPlugin } = require('./associacao/tenantPlugin');

const ETAPAS_PADRAO = Object.freeze([
  {
    codigo: 'antes_5',
    nome: '5 dias antes',
    ativo: true,
    deslocamentoDias: -5,
    assunto: 'Lembrete de contribuição — vencimento em {vencimento}',
    mensagem: [
      'Olá, {nome}.',
      '',
      'Lembramos que a contribuição referente a {referencia}, no valor pendente de {valor_pendente}, vencerá em {vencimento}.',
      '',
      'Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.',
      '',
      '{associacao}',
    ].join('\n'),
  },
  {
    codigo: 'no_dia',
    nome: 'No dia do vencimento',
    ativo: true,
    deslocamentoDias: 0,
    assunto: 'Contribuição com vencimento hoje — {referencia}',
    mensagem: [
      'Olá, {nome}.',
      '',
      'A contribuição referente a {referencia}, no valor pendente de {valor_pendente}, vence hoje ({vencimento}).',
      '',
      'Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.',
      '',
      '{associacao}',
    ].join('\n'),
  },
  {
    codigo: 'apos_3',
    nome: '3 dias após o vencimento',
    ativo: true,
    deslocamentoDias: 3,
    assunto: 'Lembrete de contribuição pendente — {referencia}',
    mensagem: [
      'Olá, {nome}.',
      '',
      'Identificamos que a contribuição referente a {referencia}, com vencimento em {vencimento}, ainda consta como pendente.',
      '',
      'Valor pendente: {valor_pendente}.',
      '',
      'Caso o pagamento já tenha sido realizado, desconsidere esta mensagem ou aguarde a atualização do sistema.',
      '',
      '{associacao}',
    ].join('\n'),
  },
  {
    codigo: 'apos_10',
    nome: '10 dias após o vencimento',
    ativo: true,
    deslocamentoDias: 10,
    assunto: 'Segundo lembrete de contribuição pendente — {referencia}',
    mensagem: [
      'Olá, {nome}.',
      '',
      'A contribuição referente a {referencia}, com vencimento em {vencimento}, permanece registrada como pendente.',
      '',
      'Valor pendente: {valor_pendente}.',
      '',
      'Caso já tenha efetuado o pagamento, desconsidere esta mensagem ou entre em contato com a associação para conferência.',
      '',
      '{associacao}',
    ].join('\n'),
  },
  {
    codigo: 'apos_30',
    nome: '30 dias após o vencimento',
    ativo: true,
    deslocamentoDias: 30,
    assunto: 'Aviso administrativo de contribuição pendente — {referencia}',
    mensagem: [
      'Olá, {nome}.',
      '',
      'Consta em nosso controle uma contribuição pendente referente a {referencia}, com vencimento em {vencimento}.',
      '',
      'Valor pendente: {valor_pendente}.',
      '',
      'Pedimos, por gentileza, que verifique a situação. Caso o pagamento já tenha sido realizado, desconsidere esta mensagem ou entre em contato para atualização do registro.',
      '',
      '{associacao}',
    ].join('\n'),
  },
]);

const etapaSchema = new Schema({
  codigo: {
    type: String,
    enum: ETAPAS_PADRAO.map(item => item.codigo),
    required: true,
  },
  nome: { type: String, required: true, trim: true },
  ativo: { type: Boolean, default: true },
  deslocamentoDias: { type: Number, required: true, min: -365, max: 365 },
  assunto: { type: String, required: true, trim: true, maxlength: 250 },
  mensagem: { type: String, required: true, trim: true, maxlength: 5000 },
}, { _id: false });

const schema = new Schema({
  ativo: { type: Boolean, default: false, index: true },
  somenteAutorizados: { type: Boolean, default: true },
  horaEnvio: { type: Number, default: 8, min: 0, max: 23 },
  minutoEnvio: { type: Number, default: 0, min: 0, max: 59 },
  diasSemana: {
    type: [Number],
    default: () => [0, 1, 2, 3, 4, 5, 6],
    validate: {
      validator: value => Array.isArray(value) && value.length > 0 && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6),
      message: 'Selecione ao menos um dia válido da semana.',
    },
  },
  canais: {
    email: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false },
  },
  maxTentativas: { type: Number, default: 3, min: 1, max: 10 },
  intervaloTentativasHoras: { type: Number, default: 6, min: 1, max: 72 },
  limitePorExecucao: { type: Number, default: 200, min: 1, max: 1000 },
  etapas: {
    type: [etapaSchema],
    default: () => ETAPAS_PADRAO.map(item => ({ ...item })),
  },
  ultimaExecucaoEm: { type: Date, default: null },
  ultimaExecucaoResumo: {
    examinadas: { type: Number, default: 0 },
    elegiveis: { type: Number, default: 0 },
    enviados: { type: Number, default: 0 },
    erros: { type: Number, default: 0 },
    ignorados: { type: Number, default: 0 },
  },
}, { timestamps: true });

schema.plugin(associationTenantPlugin);
schema.index({ tenantId: 1 }, { unique: true });
schema.index({ ativo: 1, tenantId: 1 });

schema.statics.etapasPadrao = function etapasPadrao() {
  return ETAPAS_PADRAO.map(item => ({ ...item }));
};

module.exports = mongoose.models.AssociacaoLembreteConfig || mongoose.model('AssociacaoLembreteConfig', schema);
