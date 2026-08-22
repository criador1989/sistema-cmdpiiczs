'use strict';

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');

const Aluno = require('../../models/Aluno');
const UniformeFornecedor = require('../../models/UniformeFornecedor');
const UniformeCampanha = require('../../models/UniformeCampanha');
const UniformeItem = require('../../models/UniformeItem');
const UniformeVoucher = require('../../models/UniformeVoucher');
const UniformeAgenda = require('../../models/UniformeAgenda');
const UniformeEntrega = require('../../models/UniformeEntrega');
const UniformeDivergencia = require('../../models/UniformeDivergencia');
const UniformeImportacao = require('../../models/UniformeImportacao');
const {
  buildVoucherFilter,
  getReportData,
  createPdfBuffer,
  createDocxBuffer,
} = require('../../services/uniformesReportService');
const {
  getDeliveryListData,
  createDeliveryPdfBuffer,
  createDeliveryDocxBuffer,
} = require('../../services/uniformesDeliveryListService');
const {
  analisarPdfUniformes,
  atualizarVinculoAluno,
  importarAnalise,
} = require('../../services/uniformesPdfImportService');

const router = express.Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const nome = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (nome.endsWith('.pdf') || mime === 'application/pdf') return cb(null, true);
    return cb(new Error('A importação de vouchers aceita somente arquivos PDF.'));
  },
});

const ALLOWED_ROLES = new Set(['admin', 'monitor']);
const VOUCHER_STATUS = new Set([
  'cadastrado', 'validado', 'aguardando_fornecedor', 'disponivel_entrega',
  'agendado', 'entregue', 'divergencia', 'cancelado',
]);

router.use((req, res, next) => {
  const role = String(req.usuario?.tipo || '').trim().toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({ ok: false, mensagem: 'Módulo restrito a administradores e monitores.' });
  }
  return next();
});

function tenant(req) {
  const id = req.usuario?.instituicao || req.usuario?.tenantId;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error('Instituição inválida na sessão.');
    err.status = 401;
    throw err;
  }
  return new mongoose.Types.ObjectId(String(id));
}

function uid(req) {
  const id = req.usuario?.id || req.usuario?._id;
  return mongoose.Types.ObjectId.isValid(String(id || '')) ? new mongoose.Types.ObjectId(String(id)) : null;
}

function clean(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function int(value, fallback = 0, min = 0, max = 100000) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    const err = new Error(`${label} inválido.`);
    err.status = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function respondError(res, error) {
  const status = error?.status || (error?.code === 11000 ? 409 : 500);
  const mensagem = error?.code === 11000
    ? 'Já existe um registro com este identificador nesta instituição.'
    : (error?.message || 'Erro interno.');
  if (status >= 500) console.error('[uniformes]', error);
  return res.status(status).json({ ok: false, mensagem });
}

function protocol() {
  const year = new Date().getFullYear();
  return `UNI-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}


function deliveryReportSlug(value) {
  return ({
    pendentes: 'pendentes-retirada',
    entregues: 'entregas-concluidas',
    parciais: 'entregas-parciais',
    divergencias: 'divergencias-entrega',
    resumo_fornecedor: 'resumo-fornecedor',
    resumo_turma: 'resumo-turma',
  })[String(value || '').trim().toLowerCase()] || 'lista-entrega-uniformes';
}

function dateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ensureTenantDoc(Model, id, tenantId, label) {
  const docId = assertObjectId(id, label);
  const doc = await Model.findOne({ _id: docId, instituicao: tenantId });
  if (!doc) {
    const err = new Error(`${label} não encontrado nesta instituição.`);
    err.status = 404;
    throw err;
  }
  return doc;
}

async function dashboardData(tenantId, campanha = null) {
  const base = { instituicao: tenantId };
  if (campanha && mongoose.Types.ObjectId.isValid(String(campanha))) base.campanha = campanha;
  const [total, entregues, divergencias, alunos, pendenciasAbertas] = await Promise.all([
    UniformeVoucher.countDocuments(base),
    UniformeVoucher.countDocuments({ ...base, status: 'entregue' }),
    UniformeVoucher.countDocuments({ ...base, status: 'divergencia' }),
    UniformeVoucher.distinct('aluno', base),
    UniformeDivergencia.countDocuments({ ...base, status: { $in: ['aberta', 'em_tratamento'] } }),
  ]);
  const cancelados = await UniformeVoucher.countDocuments({ ...base, status: 'cancelado' });
  return {
    alunosContemplados: alunos.length,
    vouchers: total,
    entregues,
    pendentes: Math.max(0, total - entregues - cancelados),
    divergencias,
    pendenciasAbertas,
    percentualEntregue: total ? Number(((entregues / total) * 100).toFixed(1)) : 0,
  };
}

router.get('/bootstrap', async (req, res) => {
  try {
    const t = tenant(req);
    const campanha = req.query.campanha || null;
    const now = new Date();
    const [dashboard, campanhas, fornecedores, turmas, agendas, itens] = await Promise.all([
      dashboardData(t, campanha),
      UniformeCampanha.find({ instituicao: t }).sort({ anoLetivo: -1, createdAt: -1 }).lean(),
      UniformeFornecedor.find({ instituicao: t, ativo: true }).sort({ nome: 1 }).lean(),
      Aluno.distinct('turma', { instituicao: t }),
      UniformeAgenda.find({ instituicao: t, fim: { $gte: now }, status: { $in: ['planejada', 'confirmada'] } })
        .populate('fornecedor', 'nome nomeFantasia')
        .populate('campanha', 'nome anoLetivo')
        .sort({ inicio: 1 }).limit(8).lean(),
      UniformeItem.find({ instituicao: t, ativo: true }).populate('fornecedor', 'nome').sort({ nome: 1 }).lean(),
    ]);
    return res.json({
      ok: true,
      usuario: { nome: req.usuario?.nome || '', tipo: req.usuario?.tipo || '' },
      dashboard,
      campanhas,
      fornecedores,
      turmas: turmas.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true })),
      agendas,
      itens,
    });
  } catch (error) { return respondError(res, error); }
});

router.get('/dashboard', async (req, res) => {
  try { return res.json({ ok: true, dashboard: await dashboardData(tenant(req), req.query.campanha) }); }
  catch (error) { return respondError(res, error); }
});

router.get('/alunos', async (req, res) => {
  try {
    const t = tenant(req);
    const q = clean(req.query.q, 120);
    const turma = clean(req.query.turma, 120);
    const filter = { instituicao: t };
    if (turma) filter.turma = turma;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ nome: rx }, { codigoAcesso: rx }, { turma: rx }];
    }
    const alunos = await Aluno.find(filter).select('nome turma codigoAcesso fotoThumb foto').sort({ nome: 1 }).limit(40).lean();
    return res.json({ ok: true, alunos });
  } catch (error) { return respondError(res, error); }
});

router.get('/alunos/:id/resumo', async (req, res) => {
  try {
    const t = tenant(req);
    const aluno = await ensureTenantDoc(Aluno, req.params.id, t, 'Aluno');
    const vouchers = await UniformeVoucher.find({ instituicao: t, aluno: aluno._id, status: { $ne: 'cancelado' } })
      .populate('fornecedor', 'nome')
      .populate('item', 'nome codigoExterno')
      .populate('campanha', 'nome anoLetivo')
      .sort({ createdAt: 1 }).lean();
    return res.json({ ok: true, aluno: { _id: aluno._id, nome: aluno.nome, turma: aluno.turma, codigoAcesso: aluno.codigoAcesso }, vouchers });
  } catch (error) { return respondError(res, error); }
});

router.get('/fornecedores', async (req, res) => {
  try {
    const t = tenant(req);
    const ativos = req.query.ativos === 'false' ? null : true;
    const filter = { instituicao: t };
    if (ativos !== null) filter.ativo = ativos;
    const fornecedores = await UniformeFornecedor.find(filter).sort({ ativo: -1, nome: 1 }).lean();
    return res.json({ ok: true, fornecedores });
  } catch (error) { return respondError(res, error); }
});

router.post('/fornecedores', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const nome = clean(req.body.nome, 180);
    if (!nome) return res.status(400).json({ ok: false, mensagem: 'Informe o nome do fornecedor.' });
    const fornecedor = await UniformeFornecedor.create({
      instituicao: t, tenantId: t, nome,
      razaoSocial: clean(req.body.razaoSocial, 220), nomeFantasia: clean(req.body.nomeFantasia, 220),
      documento: clean(req.body.documento, 40), telefone: clean(req.body.telefone, 40), whatsapp: clean(req.body.whatsapp, 40),
      email: clean(req.body.email, 180), responsavel: clean(req.body.responsavel, 180), observacoes: clean(req.body.observacoes),
      endereco: req.body.endereco || {}, ativo: req.body.ativo !== false, criadoPor: user, atualizadoPor: user,
    });
    return res.status(201).json({ ok: true, fornecedor });
  } catch (error) { return respondError(res, error); }
});

router.put('/fornecedores/:id', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const fornecedor = await ensureTenantDoc(UniformeFornecedor, req.params.id, t, 'Fornecedor');
    ['nome','razaoSocial','nomeFantasia','documento','telefone','whatsapp','email','responsavel','observacoes'].forEach(k => {
      if (req.body[k] !== undefined) fornecedor[k] = clean(req.body[k], k === 'observacoes' ? 5000 : 220);
    });
    if (req.body.endereco && typeof req.body.endereco === 'object') fornecedor.endereco = req.body.endereco;
    if (req.body.ativo !== undefined) fornecedor.ativo = bool(req.body.ativo);
    fornecedor.atualizadoPor = user;
    await fornecedor.save();
    return res.json({ ok: true, fornecedor });
  } catch (error) { return respondError(res, error); }
});

router.get('/campanhas', async (req, res) => {
  try {
    const campanhas = await UniformeCampanha.find({ instituicao: tenant(req) }).populate('fornecedores', 'nome').sort({ anoLetivo: -1, createdAt: -1 }).lean();
    return res.json({ ok: true, campanhas });
  } catch (error) { return respondError(res, error); }
});

router.post('/campanhas', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const nome = clean(req.body.nome, 180);
    const anoLetivo = int(req.body.anoLetivo, new Date().getFullYear(), 2000, 2200);
    if (!nome) return res.status(400).json({ ok: false, mensagem: 'Informe o nome da campanha.' });
    const fornecedores = Array.isArray(req.body.fornecedores)
      ? req.body.fornecedores.filter(v => mongoose.Types.ObjectId.isValid(String(v))).map(v => new mongoose.Types.ObjectId(String(v)))
      : [];
    const campanha = await UniformeCampanha.create({
      instituicao: t, tenantId: t, nome, anoLetivo,
      dataInicio: dateOrNull(req.body.dataInicio), dataFim: dateOrNull(req.body.dataFim),
      descricao: clean(req.body.descricao), fornecedores,
      status: ['rascunho','ativa','encerrada','arquivada'].includes(req.body.status) ? req.body.status : 'rascunho',
      criadoPor: user, atualizadoPor: user,
    });
    return res.status(201).json({ ok: true, campanha });
  } catch (error) { return respondError(res, error); }
});

router.put('/campanhas/:id', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const campanha = await ensureTenantDoc(UniformeCampanha, req.params.id, t, 'Campanha');
    if (req.body.nome !== undefined) campanha.nome = clean(req.body.nome, 180);
    if (req.body.anoLetivo !== undefined) campanha.anoLetivo = int(req.body.anoLetivo, campanha.anoLetivo, 2000, 2200);
    if (req.body.dataInicio !== undefined) campanha.dataInicio = dateOrNull(req.body.dataInicio);
    if (req.body.dataFim !== undefined) campanha.dataFim = dateOrNull(req.body.dataFim);
    if (req.body.descricao !== undefined) campanha.descricao = clean(req.body.descricao);
    if (Array.isArray(req.body.fornecedores)) campanha.fornecedores = req.body.fornecedores.filter(v => mongoose.Types.ObjectId.isValid(String(v)));
    if (['rascunho','ativa','encerrada','arquivada'].includes(req.body.status)) campanha.status = req.body.status;
    campanha.atualizadoPor = user;
    await campanha.save();
    return res.json({ ok: true, campanha });
  } catch (error) { return respondError(res, error); }
});

router.get('/itens', async (req, res) => {
  try {
    const t = tenant(req);
    const filter = { instituicao: t };
    if (req.query.campanha) filter.campanha = assertObjectId(req.query.campanha, 'Campanha');
    if (req.query.fornecedor) filter.fornecedor = assertObjectId(req.query.fornecedor, 'Fornecedor');
    const itens = await UniformeItem.find(filter).populate('fornecedor', 'nome').populate('campanha', 'nome anoLetivo').sort({ nome: 1 }).lean();
    return res.json({ ok: true, itens });
  } catch (error) { return respondError(res, error); }
});

router.post('/itens', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const campanha = await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha');
    let fornecedor = null;
    if (req.body.fornecedor) fornecedor = await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor');
    const nome = clean(req.body.nome, 220);
    if (!nome) return res.status(400).json({ ok: false, mensagem: 'Informe o nome do item ou kit.' });
    const item = await UniformeItem.create({
      instituicao: t, tenantId: t, campanha: campanha._id, fornecedor: fornecedor?._id || null,
      codigoExterno: clean(req.body.codigoExterno, 80), nome, descricao: clean(req.body.descricao),
      categoria: clean(req.body.categoria || 'uniforme', 100),
      genero: ['masculino','feminino','unissex','nao_aplicavel'].includes(req.body.genero) ? req.body.genero : 'nao_aplicavel',
      etapa: clean(req.body.etapa, 120), quantidadePecas: int(req.body.quantidadePecas, 1, 1, 100),
      composicao: Array.isArray(req.body.composicao) ? req.body.composicao.slice(0, 30).map(c => ({ nome: clean(c.nome, 180), quantidade: int(c.quantidade, 1, 1, 100) })).filter(c => c.nome) : [],
      ativo: req.body.ativo !== false, criadoPor: user, atualizadoPor: user,
    });
    return res.status(201).json({ ok: true, item });
  } catch (error) { return respondError(res, error); }
});

router.put('/itens/:id', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const item = await ensureTenantDoc(UniformeItem, req.params.id, t, 'Item');
    if (req.body.campanha !== undefined) item.campanha = (await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha'))._id;
    if (req.body.fornecedor !== undefined) item.fornecedor = req.body.fornecedor ? (await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor'))._id : null;
    ['codigoExterno','nome','descricao','categoria','etapa'].forEach(k => { if (req.body[k] !== undefined) item[k] = clean(req.body[k], k === 'descricao' ? 5000 : 220); });
    if (req.body.genero && ['masculino','feminino','unissex','nao_aplicavel'].includes(req.body.genero)) item.genero = req.body.genero;
    if (req.body.quantidadePecas !== undefined) item.quantidadePecas = int(req.body.quantidadePecas, 1, 1, 100);
    if (Array.isArray(req.body.composicao)) item.composicao = req.body.composicao.slice(0, 30).map(c => ({ nome: clean(c.nome, 180), quantidade: int(c.quantidade, 1, 1, 100) })).filter(c => c.nome);
    if (req.body.ativo !== undefined) item.ativo = bool(req.body.ativo);
    item.atualizadoPor = user;
    await item.save();
    return res.json({ ok: true, item });
  } catch (error) { return respondError(res, error); }
});


/* =========================
   IMPORTAÇÃO DE VOUCHERS PDF
   ========================= */
router.get('/importacoes', async (req, res) => {
  try {
    const t = tenant(req);
    const filter = { instituicao: t };
    if (req.query.campanha) filter.campanha = assertObjectId(req.query.campanha, 'Campanha');
    const limit = int(req.query.limit, 20, 1, 100);
    const importacoes = await UniformeImportacao.find(filter)
      .select('-registros')
      .populate('campanha', 'nome anoLetivo')
      .populate('criadoPor', 'nome tipo')
      .populate('importadoPor', 'nome tipo')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ ok: true, importacoes });
  } catch (error) { return respondError(res, error); }
});

router.get('/importacoes/:id', async (req, res) => {
  try {
    const t = tenant(req);
    const importacao = await UniformeImportacao.findOne({ _id: assertObjectId(req.params.id, 'Importação'), instituicao: t })
      .populate('campanha', 'nome anoLetivo')
      .lean();
    if (!importacao) return res.status(404).json({ ok: false, mensagem: 'Importação não encontrada nesta instituição.' });
    return res.json({ ok: true, importacao });
  } catch (error) { return respondError(res, error); }
});

router.post('/importacoes/analisar-pdf', importUpload.single('arquivo'), async (req, res) => {
  try {
    const t = tenant(req);
    const campanha = assertObjectId(req.body.campanha, 'Campanha');
    if (!req.file) return res.status(400).json({ ok: false, mensagem: 'Selecione o PDF de vouchers.' });
    const resultado = await analisarPdfUniformes({
      arquivo: req.file,
      instituicaoId: t,
      campanhaId: campanha,
      usuarioId: uid(req),
    });
    const obj = resultado.importacao.toObject ? resultado.importacao.toObject() : resultado.importacao;
    return res.status(resultado.reutilizada ? 200 : 201).json({
      ok: true,
      mensagem: resultado.reutilizada
        ? 'Este PDF já havia sido analisado. A análise anterior foi reaberta sem duplicar dados.'
        : 'PDF analisado. Confira os vínculos antes de importar.',
      reutilizada: Boolean(resultado.reutilizada),
      aviso: resultado.aviso || '',
      importacao: obj,
    });
  } catch (error) {
    if (!error.status) error.status = 400;
    console.error('[uniformes/importacao-pdf] Falha ao analisar PDF:', error?.stack || error);
    return res.status(error.status || 400).json({
      ok: false,
      mensagem: error?.message || 'Não foi possível analisar o PDF.',
      codigo: error?.codigo || 'IMPORTACAO_PDF_ERRO',
      ...(process.env.NODE_ENV === 'development' && error?.diagnostico ? { diagnostico: error.diagnostico } : {}),
    });
  }
});

router.patch('/importacoes/:id/registros/:registroId/aluno', async (req, res) => {
  try {
    const t = tenant(req);
    const importacao = await UniformeImportacao.findOne({ _id: assertObjectId(req.params.id, 'Importação'), instituicao: t });
    if (!importacao) return res.status(404).json({ ok: false, mensagem: 'Importação não encontrada nesta instituição.' });
    const registro = await atualizarVinculoAluno({
      importacao,
      registroId: req.params.registroId,
      alunoId: req.body.aluno,
      instituicaoId: t,
    });
    return res.json({ ok: true, registro, totais: importacao.totais });
  } catch (error) { if (!error.status) error.status = 400; return respondError(res, error); }
});

router.post('/importacoes/:id/confirmar', async (req, res) => {
  try {
    const t = tenant(req);
    const importacao = await UniformeImportacao.findOne({ _id: assertObjectId(req.params.id, 'Importação'), instituicao: t });
    if (!importacao) return res.status(404).json({ ok: false, mensagem: 'Importação não encontrada nesta instituição.' });
    const resultado = await importarAnalise({
      importacao,
      instituicaoId: t,
      usuarioId: uid(req),
      criarFornecedores: req.body.criarFornecedores !== false,
      criarItens: req.body.criarItens !== false,
    });
    return res.json({
      ok: true,
      mensagem: resultado.importacao.status === 'importado'
        ? 'Importação concluída.'
        : 'Importação parcial concluída. Os registros pendentes permaneceram para revisão.',
      importacao: resultado.importacao,
      resultados: resultado.resultados,
    });
  } catch (error) { if (!error.status) error.status = 400; return respondError(res, error); }
});

router.patch('/importacoes/:id/cancelar', async (req, res) => {
  try {
    const t = tenant(req);
    const importacao = await UniformeImportacao.findOne({ _id: assertObjectId(req.params.id, 'Importação'), instituicao: t });
    if (!importacao) return res.status(404).json({ ok: false, mensagem: 'Importação não encontrada nesta instituição.' });
    if ((importacao.totais?.importados || 0) > 0) return res.status(409).json({ ok: false, mensagem: 'A importação já possui vouchers gravados e não pode ser cancelada por esta ação.' });
    importacao.status = 'cancelado';
    await importacao.save();
    return res.json({ ok: true, importacao });
  } catch (error) { return respondError(res, error); }
});

router.get('/vouchers', async (req, res) => {
  try {
    const t = tenant(req);
    const page = int(req.query.page, 1, 1, 100000);
    const limit = int(req.query.limit, 25, 1, 100);
    const filter = buildVoucherFilter(t, req.query);
    const [total, vouchers] = await Promise.all([
      UniformeVoucher.countDocuments(filter),
      UniformeVoucher.find(filter)
        .populate('fornecedor', 'nome nomeFantasia')
        .populate('item', 'nome codigoExterno')
        .populate('campanha', 'nome anoLetivo')
        .sort({ turmaSnapshot: 1, alunoNomeSnapshot: 1, createdAt: 1 })
        .skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), vouchers });
  } catch (error) { return respondError(res, error); }
});

router.post('/vouchers', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const aluno = await ensureTenantDoc(Aluno, req.body.aluno, t, 'Aluno');
    const campanha = await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha');
    const fornecedor = await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor');
    const item = await ensureTenantDoc(UniformeItem, req.body.item, t, 'Item');
    const codigo = clean(req.body.codigo, 120).toUpperCase();
    if (!codigo) return res.status(400).json({ ok: false, mensagem: 'Informe o código do voucher.' });
    const voucher = await UniformeVoucher.create({
      instituicao: t, tenantId: t, campanha: campanha._id,
      aluno: aluno._id, alunoNomeSnapshot: aluno.nome, turmaSnapshot: aluno.turma,
      codigo, fornecedor: fornecedor._id, item: item._id,
      itemCodigoSnapshot: item.codigoExterno || '', itemNomeSnapshot: item.nome,
      quantidade: int(req.body.quantidade, 1, 1, 100), lote: clean(req.body.lote, 120),
      validade: dateOrNull(req.body.validade), origem: ['manual','pdf','excel','csv','api'].includes(req.body.origem) ? req.body.origem : 'manual',
      status: VOUCHER_STATUS.has(req.body.status) ? req.body.status : 'cadastrado',
      observacoes: clean(req.body.observacoes), criadoPor: user, atualizadoPor: user,
    });
    return res.status(201).json({ ok: true, voucher });
  } catch (error) { return respondError(res, error); }
});

router.post('/vouchers/lote', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const registros = Array.isArray(req.body.registros) ? req.body.registros.slice(0, 1000) : [];
    if (!registros.length) return res.status(400).json({ ok: false, mensagem: 'Nenhum voucher informado.' });
    const resultados = [];
    for (const r of registros) {
      try {
        const aluno = await ensureTenantDoc(Aluno, r.aluno, t, 'Aluno');
        const campanha = await ensureTenantDoc(UniformeCampanha, r.campanha, t, 'Campanha');
        const fornecedor = await ensureTenantDoc(UniformeFornecedor, r.fornecedor, t, 'Fornecedor');
        const item = await ensureTenantDoc(UniformeItem, r.item, t, 'Item');
        const codigo = clean(r.codigo, 120).toUpperCase();
        if (!codigo) throw Object.assign(new Error('Código do voucher ausente.'), { status: 400 });
        const voucher = await UniformeVoucher.create({
          instituicao: t, tenantId: t, campanha: campanha._id, aluno: aluno._id,
          alunoNomeSnapshot: aluno.nome, turmaSnapshot: aluno.turma, codigo,
          fornecedor: fornecedor._id, item: item._id, itemCodigoSnapshot: item.codigoExterno || '', itemNomeSnapshot: item.nome,
          quantidade: int(r.quantidade, 1, 1, 100), lote: clean(r.lote, 120), validade: dateOrNull(r.validade),
          origem: ['manual','pdf','excel','csv','api'].includes(r.origem) ? r.origem : 'manual',
          status: VOUCHER_STATUS.has(r.status) ? r.status : 'cadastrado', observacoes: clean(r.observacoes),
          criadoPor: user, atualizadoPor: user,
        });
        resultados.push({ ok: true, codigo: voucher.codigo, id: voucher._id });
      } catch (e) {
        resultados.push({ ok: false, codigo: clean(r.codigo, 120), mensagem: e.code === 11000 ? 'Voucher duplicado.' : e.message });
      }
    }
    return res.status(207).json({ ok: true, total: registros.length, inseridos: resultados.filter(r => r.ok).length, erros: resultados.filter(r => !r.ok).length, resultados });
  } catch (error) { return respondError(res, error); }
});

router.patch('/vouchers/:id/status', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const status = clean(req.body.status, 60);
    if (!VOUCHER_STATUS.has(status)) return res.status(400).json({ ok: false, mensagem: 'Status de voucher inválido.' });
    const voucher = await ensureTenantDoc(UniformeVoucher, req.params.id, t, 'Voucher');
    if (voucher.status === 'entregue' && status !== 'entregue') return res.status(409).json({ ok: false, mensagem: 'Voucher já entregue. A reversão deve ser feita por procedimento administrativo auditável.' });
    voucher.status = status; voucher.atualizadoPor = user;
    await voucher.save();
    return res.json({ ok: true, voucher });
  } catch (error) { return respondError(res, error); }
});

router.get('/agendas', async (req, res) => {
  try {
    const t = tenant(req); const filter = { instituicao: t };
    if (req.query.campanha) filter.campanha = assertObjectId(req.query.campanha, 'Campanha');
    if (req.query.fornecedor) filter.fornecedor = assertObjectId(req.query.fornecedor, 'Fornecedor');
    const agendas = await UniformeAgenda.find(filter).populate('fornecedor', 'nome').populate('campanha', 'nome anoLetivo').sort({ inicio: 1 }).lean();
    return res.json({ ok: true, agendas });
  } catch (error) { return respondError(res, error); }
});

router.post('/agendas', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const campanha = await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha');
    const fornecedor = await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor');
    const inicio = dateOrNull(req.body.inicio); const fim = dateOrNull(req.body.fim);
    if (!inicio || !fim) return res.status(400).json({ ok: false, mensagem: 'Informe as datas inicial e final.' });
    const agenda = await UniformeAgenda.create({
      instituicao: t, tenantId: t, campanha: campanha._id, fornecedor: fornecedor._id,
      titulo: clean(req.body.titulo, 220), inicio, fim, horarioInicio: clean(req.body.horarioInicio, 10), horarioFim: clean(req.body.horarioFim, 10),
      local: clean(req.body.local || 'Escola', 220), turmas: Array.isArray(req.body.turmas) ? req.body.turmas.map(v => clean(v, 120)).filter(Boolean) : [],
      series: Array.isArray(req.body.series) ? req.body.series.map(v => clean(v, 120)).filter(Boolean) : [],
      capacidade: int(req.body.capacidade, 0, 0, 100000), instrucoes: clean(req.body.instrucoes),
      status: ['planejada','confirmada','concluida','cancelada'].includes(req.body.status) ? req.body.status : 'planejada',
      criadoPor: user, atualizadoPor: user,
    });
    return res.status(201).json({ ok: true, agenda });
  } catch (error) { return respondError(res, error); }
});

router.put('/agendas/:id', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const agenda = await ensureTenantDoc(UniformeAgenda, req.params.id, t, 'Agenda');
    if (req.body.campanha) agenda.campanha = (await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha'))._id;
    if (req.body.fornecedor) agenda.fornecedor = (await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor'))._id;
    ['titulo','horarioInicio','horarioFim','local','instrucoes'].forEach(k => { if (req.body[k] !== undefined) agenda[k] = clean(req.body[k], k === 'instrucoes' ? 5000 : 220); });
    if (req.body.inicio !== undefined) agenda.inicio = dateOrNull(req.body.inicio);
    if (req.body.fim !== undefined) agenda.fim = dateOrNull(req.body.fim);
    if (Array.isArray(req.body.turmas)) agenda.turmas = req.body.turmas.map(v => clean(v, 120)).filter(Boolean);
    if (Array.isArray(req.body.series)) agenda.series = req.body.series.map(v => clean(v, 120)).filter(Boolean);
    if (req.body.capacidade !== undefined) agenda.capacidade = int(req.body.capacidade, 0, 0, 100000);
    if (['planejada','confirmada','concluida','cancelada'].includes(req.body.status)) agenda.status = req.body.status;
    agenda.atualizadoPor = user; await agenda.save();
    return res.json({ ok: true, agenda });
  } catch (error) { return respondError(res, error); }
});

router.get('/lista-entrega', async (req, res) => {
  try {
    const data = await getDeliveryListData(tenant(req), req.query);
    return res.json({
      ok: true,
      resumo: data.resumo, total: data.total, page: data.page, pages: data.pages, grupos: data.grupos,
    });
  } catch (error) { return respondError(res, error); }
});

router.get('/lista-entrega/pdf', async (req, res) => {
  try {
    const data = await getDeliveryListData(tenant(req), { ...req.query, page: 1, limit: 500000 });
    const buffer = await createDeliveryPdfBuffer(data);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${deliveryReportSlug(req.query.relatorio)}-${stamp}.pdf"`);
    return res.send(buffer);
  } catch (error) { return respondError(res, error); }
});

router.get('/lista-entrega/docx', async (req, res) => {
  try {
    const data = await getDeliveryListData(tenant(req), { ...req.query, page: 1, limit: 500000 });
    const buffer = await createDeliveryDocxBuffer(data);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${deliveryReportSlug(req.query.relatorio)}-${stamp}.docx"`);
    return res.send(buffer);
  } catch (error) { return respondError(res, error); }
});

router.get('/entregas', async (req, res) => {
  try {
    const t = tenant(req); const page = int(req.query.page, 1, 1, 100000); const limit = int(req.query.limit, 25, 1, 100);
    const filter = { instituicao: t };
    if (req.query.campanha) filter.campanha = assertObjectId(req.query.campanha, 'Campanha');
    if (req.query.fornecedor) filter.fornecedor = assertObjectId(req.query.fornecedor, 'Fornecedor');
    if (req.query.turma) filter.turmaSnapshot = clean(req.query.turma, 120);
    const q = clean(req.query.q, 120);
    if (q) filter.$or = [{ alunoNomeSnapshot: new RegExp(escapeRegex(q), 'i') }, { protocolo: new RegExp(escapeRegex(q), 'i') }, { 'responsavel.nome': new RegExp(escapeRegex(q), 'i') }];
    const [total, entregas] = await Promise.all([
      UniformeEntrega.countDocuments(filter),
      UniformeEntrega.find(filter).populate('fornecedor', 'nome').populate('campanha', 'nome anoLetivo').sort({ entregueEm: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), entregas });
  } catch (error) { return respondError(res, error); }
});

router.post('/entregas', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const t = tenant(req); const user = uid(req);
    if (!user) return res.status(401).json({ ok: false, mensagem: 'Usuário inválido na sessão.' });
    const aluno = await ensureTenantDoc(Aluno, req.body.aluno, t, 'Aluno');
    const fornecedor = await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor');
    const ids = Array.isArray(req.body.vouchers) ? [...new Set(req.body.vouchers.map(String))] : [];
    if (!ids.length || ids.some(v => !mongoose.Types.ObjectId.isValid(v))) return res.status(400).json({ ok: false, mensagem: 'Selecione ao menos um voucher válido.' });
    const resp = req.body.responsavel || {};
    if (!clean(resp.nome, 220) || !clean(resp.documento, 120)) return res.status(400).json({ ok: false, mensagem: 'Informe nome e documento do responsável.' });
    const checklist = req.body.checklist || {};
    const requiredChecks = ['documentoConferido','vouchersConferidos','itensConferidos','assinaturaColetada'];
    if (!requiredChecks.every(k => bool(checklist[k]))) return res.status(400).json({ ok: false, mensagem: 'Conclua todas as conferências obrigatórias antes de finalizar a entrega.' });

    let entregaFinal = null;
    await session.withTransaction(async () => {
      const vouchers = await UniformeVoucher.find({ _id: { $in: ids }, instituicao: t }).session(session);
      if (vouchers.length !== ids.length) throw Object.assign(new Error('Um ou mais vouchers não foram encontrados nesta instituição.'), { status: 404 });
      const campanhaIds = new Set(vouchers.map(v => String(v.campanha)));
      if (campanhaIds.size !== 1) throw Object.assign(new Error('Todos os vouchers da mesma entrega devem pertencer à mesma campanha.'), { status: 409 });
      if (vouchers.some(v => String(v.aluno) !== String(aluno._id))) throw Object.assign(new Error('Há voucher de outro aluno na seleção.'), { status: 409 });
      if (vouchers.some(v => String(v.fornecedor) !== String(fornecedor._id))) throw Object.assign(new Error('Há voucher de outro fornecedor na seleção. Faça entregas separadas por fornecedor.'), { status: 409 });
      if (vouchers.some(v => ['entregue','cancelado'].includes(v.status))) throw Object.assign(new Error('Um ou mais vouchers já foram entregues ou cancelados.'), { status: 409 });

      const [created] = await UniformeEntrega.create([{
        instituicao: t, tenantId: t, campanha: vouchers[0].campanha, aluno: aluno._id,
        alunoNomeSnapshot: aluno.nome, turmaSnapshot: aluno.turma, fornecedor: fornecedor._id,
        vouchers: vouchers.map(v => ({ voucher: v._id, codigo: v.codigo, item: v.item, itemNome: v.itemNomeSnapshot, quantidade: v.quantidade })),
        responsavel: {
          nome: clean(resp.nome, 220), tipoDocumento: clean(resp.tipoDocumento || 'RG/CPF', 80), documento: clean(resp.documento, 120),
          parentesco: clean(resp.parentesco, 120), telefone: clean(resp.telefone, 60),
        },
        checklist: {
          documentoConferido: true, vouchersConferidos: true, itensConferidos: true, assinaturaColetada: true,
        },
        status: 'concluida', observacoes: clean(req.body.observacoes), protocolo: protocol(), entregueEm: new Date(),
        atendente: { usuario: user, nome: clean(req.usuario?.nome, 220), tipo: clean(req.usuario?.tipo, 60) },
      }], { session });
      entregaFinal = created;
      await UniformeVoucher.updateMany(
        { _id: { $in: vouchers.map(v => v._id) }, instituicao: t },
        { $set: { status: 'entregue', entrega: created._id, entregueEm: created.entregueEm, atualizadoPor: user, divergencia: null } },
        { session }
      );
    });

    return res.status(201).json({ ok: true, entrega: entregaFinal });
  } catch (error) { return respondError(res, error); }
  finally { await session.endSession(); }
});

router.get('/divergencias', async (req, res) => {
  try {
    const t = tenant(req); const filter = { instituicao: t };
    if (req.query.status && req.query.status !== 'todas') filter.status = req.query.status;
    if (req.query.fornecedor) filter.fornecedor = assertObjectId(req.query.fornecedor, 'Fornecedor');
    if (req.query.campanha) filter.campanha = assertObjectId(req.query.campanha, 'Campanha');
    const divergencias = await UniformeDivergencia.find(filter).populate('fornecedor', 'nome').populate('voucher', 'codigo itemNomeSnapshot').sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ ok: true, divergencias });
  } catch (error) { return respondError(res, error); }
});

router.post('/divergencias', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const aluno = await ensureTenantDoc(Aluno, req.body.aluno, t, 'Aluno');
    const campanha = await ensureTenantDoc(UniformeCampanha, req.body.campanha, t, 'Campanha');
    const fornecedor = await ensureTenantDoc(UniformeFornecedor, req.body.fornecedor, t, 'Fornecedor');
    let voucher = null;
    if (req.body.voucher) voucher = await ensureTenantDoc(UniformeVoucher, req.body.voucher, t, 'Voucher');
    const descricao = clean(req.body.descricao);
    if (!descricao) return res.status(400).json({ ok: false, mensagem: 'Descreva a divergência.' });
    const tipos = ['item_nao_veio','tamanho_incorreto','modelo_incorreto','quantidade_divergente','voucher_nao_localizado','aluno_nao_localizado','fornecedor_incorreto','sem_documento','recusa','defeito','outro'];
    const tipo = tipos.includes(req.body.tipo) ? req.body.tipo : 'outro';
    const divergencia = await UniformeDivergencia.create({
      instituicao: t, tenantId: t, campanha: campanha._id, aluno: aluno._id,
      alunoNomeSnapshot: aluno.nome, turmaSnapshot: aluno.turma, fornecedor: fornecedor._id,
      voucher: voucher?._id || null, tipo, descricao, status: 'aberta', criadoPor: user,
    });
    if (voucher && voucher.status !== 'entregue') {
      voucher.status = 'divergencia'; voucher.divergencia = { tipo, descricao, registradaEm: new Date() }; voucher.atualizadoPor = user; await voucher.save();
    }
    return res.status(201).json({ ok: true, divergencia });
  } catch (error) { return respondError(res, error); }
});

router.patch('/divergencias/:id', async (req, res) => {
  try {
    const t = tenant(req); const user = uid(req);
    const divergencia = await ensureTenantDoc(UniformeDivergencia, req.params.id, t, 'Divergência');
    if (['aberta','em_tratamento','resolvida','cancelada'].includes(req.body.status)) divergencia.status = req.body.status;
    if (req.body.resolucao !== undefined) divergencia.resolucao = clean(req.body.resolucao);
    if (divergencia.status === 'resolvida') { divergencia.resolvidoPor = user; divergencia.resolvidoEm = new Date(); }
    await divergencia.save();
    if (divergencia.voucher && divergencia.status === 'resolvida') {
      await UniformeVoucher.updateOne({ _id: divergencia.voucher, instituicao: t, status: 'divergencia' }, { $set: { status: 'disponivel_entrega', divergencia: null, atualizadoPor: user } });
    }
    return res.json({ ok: true, divergencia });
  } catch (error) { return respondError(res, error); }
});

router.get('/relatorios/dados', async (req, res) => {
  try { return res.json({ ok: true, ...(await getReportData(tenant(req), req.query)) }); }
  catch (error) { return respondError(res, error); }
});

router.get('/relatorios/pdf', async (req, res) => {
  try {
    const data = await getReportData(tenant(req), req.query);
    const buffer = await createPdfBuffer(data);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="uniformes-vouchers-${stamp}.pdf"`);
    return res.send(buffer);
  } catch (error) { return respondError(res, error); }
});

router.get('/relatorios/docx', async (req, res) => {
  try {
    const data = await getReportData(tenant(req), req.query);
    const buffer = await createDocxBuffer(data);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="uniformes-vouchers-${stamp}.docx"`);
    return res.send(buffer);
  } catch (error) { return respondError(res, error); }
});

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const mensagem = error.code === 'LIMIT_FILE_SIZE'
      ? 'O PDF excede o limite de 120 MB.'
      : `Falha no envio do PDF: ${error.message}`;
    return res.status(400).json({ ok: false, mensagem });
  }
  if (error && String(error.message || '').includes('somente arquivos PDF')) {
    return res.status(400).json({ ok: false, mensagem: error.message });
  }
  return next(error);
});

module.exports = router;
