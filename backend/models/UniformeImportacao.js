'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const registroSchema = new Schema({
  pagina: { type: Number, min: 1, default: 1 },
  ordemNaPagina: { type: Number, min: 1, default: 1 },
  codigo: { type: String, trim: true, uppercase: true, default: '', index: true },
  alunoImportado: { type: String, trim: true, default: '' },
  turmaImportada: { type: String, trim: true, default: '' },
  turnoImportado: { type: String, trim: true, default: '' },
  aluno: { type: Schema.Types.ObjectId, ref: 'Aluno', default: null },
  alunoNomeSistema: { type: String, trim: true, default: '' },
  turmaSistema: { type: String, trim: true, default: '' },
  fornecedorImportado: { type: String, trim: true, default: '' },
  enderecoFornecedorImportado: { type: String, trim: true, default: '' },
  fornecedor: { type: Schema.Types.ObjectId, ref: 'UniformeFornecedor', default: null },
  itemCodigo: { type: String, trim: true, default: '' },
  itemNomeSugerido: { type: String, trim: true, default: '' },
  itemDescricao: { type: String, trim: true, default: '' },
  item: { type: Schema.Types.ObjectId, ref: 'UniformeItem', default: null },
  genero: { type: String, trim: true, default: 'nao_aplicavel' },
  etapa: { type: String, trim: true, default: '' },
  quantidadePecas: { type: Number, min: 1, default: 1 },
  lote: { type: String, trim: true, default: '' },
  emitidoEm: { type: Date, default: null },
  validade: { type: Date, default: null },
  criadoPorOrigem: { type: String, trim: true, default: '' },
  instituicaoOrigem: { type: String, trim: true, default: '' },
  duplicado: { type: Boolean, default: false },
  voucherExistente: { type: Schema.Types.ObjectId, ref: 'UniformeVoucher', default: null },
  situacao: {
    type: String,
    enum: ['pronto', 'novo_fornecedor', 'novo_item', 'revisar_aluno', 'duplicado', 'incompleto', 'importado', 'ignorado', 'erro'],
    default: 'pronto',
    index: true,
  },
  flags: { type: [String], default: [] },
  erros: { type: [String], default: [] },
  avisos: { type: [String], default: [] },
  voucherCriado: { type: Schema.Types.ObjectId, ref: 'UniformeVoucher', default: null },
}, { _id: true });

const schema = new Schema({
  instituicao: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Instituicao', required: true, index: true },
  campanha: { type: Schema.Types.ObjectId, ref: 'UniformeCampanha', required: true, index: true },
  arquivo: {
    nome: { type: String, trim: true, required: true },
    tamanho: { type: Number, min: 0, default: 0 },
    sha256: { type: String, trim: true, uppercase: true, required: true, index: true },
    paginas: { type: Number, min: 0, default: 0 },
  },
  status: {
    type: String,
    enum: ['analisado', 'importado', 'parcial', 'cancelado'],
    default: 'analisado',
    index: true,
  },
  totais: {
    detectados: { type: Number, min: 0, default: 0 },
    prontos: { type: Number, min: 0, default: 0 },
    importados: { type: Number, min: 0, default: 0 },
    duplicados: { type: Number, min: 0, default: 0 },
    pendentes: { type: Number, min: 0, default: 0 },
    alunos: { type: Number, min: 0, default: 0 },
    fornecedores: { type: Number, min: 0, default: 0 },
    fornecedoresNovos: { type: Number, min: 0, default: 0 },
    itens: { type: Number, min: 0, default: 0 },
    itensNovos: { type: Number, min: 0, default: 0 },
  },
  avisos: { type: [String], default: [] },
  erros: { type: [String], default: [] },
  registros: { type: [registroSchema], default: [] },
  criadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  importadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
  importadoEm: { type: Date, default: null },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.instituicao && !this.tenantId) this.tenantId = this.instituicao;
  if (!this.instituicao && this.tenantId) this.instituicao = this.tenantId;
  if (this.instituicao && this.tenantId && String(this.instituicao) !== String(this.tenantId)) {
    throw new Error('Inconsistência entre instituicao e tenantId na importação de uniformes.');
  }
  if (this.arquivo?.sha256) this.arquivo.sha256 = String(this.arquivo.sha256).trim().toUpperCase();
});

schema.index({ instituicao: 1, 'arquivo.sha256': 1, createdAt: -1 });
schema.index({ instituicao: 1, campanha: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.UniformeImportacao || mongoose.model('UniformeImportacao', schema);
