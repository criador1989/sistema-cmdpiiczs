'use strict';
const mongoose = require('mongoose');

const CategoriaSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  nome: { type: String, required: true, trim: true },
  descricao: { type: String, default: '' },
  premiacao: { type: String, default: '' },
  ativo: { type: Boolean, default: true },
}, { _id: false });

const LoteSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  nome: { type: String, required: true, trim: true },
  inicio: { type: Date, default: null },
  fim: { type: Date, default: null },
  valorCentavos: { type: Number, required: true, min: 0 },
  ativo: { type: Boolean, default: true },
}, { _id: false });

const CamisetaSchema = new mongoose.Schema({
  tamanho: { type: String, required: true, trim: true },
  estoque: { type: Number, default: null, min: 0 },
  ativo: { type: Boolean, default: true },
}, { _id: false });

const EventoConfigSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  schemaVersion: { type: Number, default: 136 },
  publicado: { type: Boolean, default: true },
  inscricoesAbertas: { type: Boolean, default: false },
  titulo: { type: String, default: 'Corrida CMDPII-CZS 2ª edição' },
  subtitulo: { type: String, default: 'Mais que uma corrida, um encontro da nossa comunidade. Esporte, educação e um futuro em movimento.' },
  destaque: { type: String, default: 'Esporte • Educação • Comunidade' },
  ctaPrincipal: { type: String, default: 'Inscreva-se agora' },
  ctaSecundario: { type: String, default: 'Ver regulamento' },
  dataLabel: { type: String, default: '22 de novembro de 2026 • largada às 17h' },
  eventDate: { type: Date, default: new Date('2026-11-22T22:00:00.000Z') },
  categoryReferenceDate: { type: Date, default: new Date('2026-11-22T12:00:00.000Z') },
  local: { type: String, default: 'Colégio Militar Dom Pedro II • Cruzeiro do Sul - AC' },
  percursoLabel: { type: String, default: 'Percurso oficial a confirmar' },
  resumoCategorias: { type: String, default: 'Fundamental II, Ensino Médio, AEE, PCD, servidores e comunidade escolar' },
  resumoPremiacao: { type: String, default: 'Premiação por categoria e sexo' },
  premioDescricao: { type: String, default: 'Troféus conforme o regulamento e medalha de finisher aos concluintes.' },
  sponsorMessage: { type: String, default: 'Espaço reservado para patrocinadores e apoiadores do evento' },
  sponsorSubMessage: { type: String, default: 'Em breve, nossos parceiros estarão aqui.' },
  contatoEmail: { type: String, default: 'colegiodompedro.czs@gmail.com' },
  contatoTelefone: { type: String, default: '' },
  bannerMediaId: { type: String, default: '' },
  bannerStorageProvider: { type: String, enum: ['', 'gridfs','s3'], default: '' },
  bannerStorageKey: { type: String, default: '' },
  bannerStorageUrl: { type: String, default: '' },
  bannerAlt: { type: String, default: 'Corrida CMDPII-CZS 2ª edição' },
  galeriaHistoricaInicializada: { type: Boolean, default: false },
  fraseLateral: { type: String, default: 'Correndo uma comunidade mais forte.' },
  regulamentoTexto: { type: String, default: 'Consulte o regulamento oficial em PDF e as informações resumidas desta página antes de concluir a inscrição.' },
  regulamentoPdfMediaId: { type: String, default: '' },
  regulamentoPdfNome: { type: String, default: '' },
  regulamentoPdfPublicado: { type: Boolean, default: false },
  regulamentoPdfAtualizadoEm: { type: Date, default: null },
  termoVersao: { type: String, default: '2026-09-23-v1' },
  publicoPermitido: { type: [String], default: [
    'Alunos do CMDPII/CZS', 'Pais e mães de alunos', 'Irmãos e irmãs de alunos', 'Ex-alunos (egressos)',
    'Servidores e colaboradores', 'Cônjuges e filhos de servidores/colaboradores', 'Comunidade Escolar II'
  ] },
  kitItems: { type: [String], default: [
    'Camiseta oficial com manga', 'Número de peito oficial', 'Estrutura pós-corrida', 'Medalha metálica de finisher (entregue somente no dia da corrida, após a conclusão da prova)'
  ] },
  camisetas: { type: [CamisetaSchema], default: () => ([
    { tamanho: 'PP' }, { tamanho: 'P' }, { tamanho: 'M' }, { tamanho: 'G' }, { tamanho: 'GG' }, { tamanho: 'XG' }
  ]) },
  lotes: { type: [LoteSchema], default: () => ([
    { key: 'promocional', nome: 'Lote Promocional', inicio: new Date('2026-09-24T05:00:00.000Z'), fim: new Date('2026-10-10T04:59:59.999Z'), valorCentavos: 7500, ativo: true },
    { key: 'normal', nome: 'Lote Normal', inicio: new Date('2026-10-10T05:00:00.000Z'), fim: null, valorCentavos: 9000, ativo: true },
  ]) },
  pagamento: {
    modo: { type: String, enum: ['manual', 'sicoob_api'], default: 'manual' },
    banco: { type: String, default: 'Sicoob' },
    chavePix: { type: String, default: '' },
    favorecido: { type: String, default: '' },
    instrucoes: { type: String, default: 'Realize o pagamento via PIX e anexe o comprovante. A inscrição será deferida após conferência pela organização.' },
    comprovanteObrigatorio: { type: Boolean, default: true },
    sicoobApiAtiva: { type: Boolean, default: false },
  },
  categorias: {
    type: [CategoriaSchema],
    default: () => ([
      { key: 'fundamental-regular', nome: 'Ensino Fundamental II Regular', descricao: 'Alunos do Ensino Fundamental II • turno da manhã.', premiacao: '1º, 2º e 3º • Masculino e Feminino' },
      { key: 'fundamental-aee', nome: 'Ensino Fundamental II AEE', descricao: 'Alunos do Ensino Fundamental II que optarem pela categoria AEE • turno da manhã.', premiacao: '1º, 2º e 3º • Masculino e Feminino' },
      { key: 'medio-regular', nome: 'Ensino Médio Regular', descricao: 'Alunos do Ensino Médio • turno da tarde.', premiacao: '1º, 2º e 3º • Masculino e Feminino' },
      { key: 'medio-aee', nome: 'Ensino Médio AEE', descricao: 'Alunos do Ensino Médio que optarem pela categoria AEE • turno da tarde.', premiacao: '1º, 2º e 3º • Masculino e Feminino' },
      { key: 'servidores', nome: 'Servidores/Colaboradores', descricao: 'Servidores e colaboradores do CMDPII/CZS.', premiacao: '1º e 2º • Masculino e Feminino' },
      { key: 'comunidade-1', nome: 'Comunidade Escolar I', descricao: 'Pais e mães de alunos e cônjuges de servidores/colaboradores.', premiacao: '1º e 2º • Masculino e Feminino' },
      { key: 'comunidade-2', nome: 'Comunidade Escolar II', descricao: 'Egressos, filhos de Bombeiros, filhos de servidores/colaboradores e irmãos/irmãs de alunos.', premiacao: '1º e 2º • Masculino e Feminino' },
      { key: 'pcd', nome: 'PCD', descricao: 'Atletas PCD pertencentes aos públicos autorizados no regulamento.', premiacao: '1º e 2º • Masculino e Feminino' },
    ])
  },
  certificado: {
    titulo: { type: String, default: 'Certificado de Participação' },
    textoBase: { type: String, default: 'Certificamos que {{NOME}} participou da Corrida CMDPII-CZS 2ª edição, demonstrando comprometimento, superação e espírito comunitário.' },
    assinatura: { type: String, default: 'Organização do Evento' },
    publicado: { type: Boolean, default: true },
  },
  medalha: {
    titulo: { type: String, default: 'CMDPII-CZS' },
    edicao: { type: String, default: '2ª edição' },
    ano: { type: String, default: '2026' },
    mensagem: { type: String, default: 'Parabéns! Sua dedicação faz parte dessa grande história.' },
    publicado: { type: Boolean, default: true },
  },
}, { timestamps: true, collection: 'evento_configs' });

module.exports = mongoose.models.EventoConfig || mongoose.model('EventoConfig', EventoConfigSchema);
