'use strict';

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const AssociacaoPessoa = require('../../models/AssociacaoPessoa');
const AssociacaoConta = require('../../models/AssociacaoConta');
const AssociacaoCategoria = require('../../models/AssociacaoCategoria');
const AssociacaoProjeto = require('../../models/AssociacaoProjeto');
const AssociacaoMovimentacao = require('../../models/AssociacaoMovimentacao');
const AssociacaoContribuicao = require('../../models/AssociacaoContribuicao');
const AssociacaoPagamento = require('../../models/AssociacaoPagamento');
const AssociacaoRecibo = require('../../models/AssociacaoRecibo');
const AssociacaoPatrimonio = require('../../models/AssociacaoPatrimonio');
const AssociacaoDocumento = require('../../models/AssociacaoDocumento');
const AssociacaoAnexo = require('../../models/AssociacaoAnexo');
const AssociacaoMensagemModelo = require('../../models/AssociacaoMensagemModelo');
const AssociacaoCampanha = require('../../models/AssociacaoCampanha');
const AssociacaoMensagemFila = require('../../models/AssociacaoMensagemFila');
const AssociacaoLembreteConfig = require('../../models/AssociacaoLembreteConfig');
const AssociacaoLembreteEnvio = require('../../models/AssociacaoLembreteEnvio');
const Usuario = require('../../models/Usuario');
const UsuarioVinculoInstituicao = require('../../models/UsuarioVinculoInstituicao');
const { criarOuAtualizarVinculo } = require('../../services/usuarioVinculos');
const Counter = require('../../models/Counter');
const Log = require('../../models/Log');

const { exigirPermissao, PERFIS, normalizePerfil } = require('../../middleware/associacaoAuth');
const { registrarAuditoriaAssociacao } = require('../../services/associacaoAudit');
const { gerarIndicadoresFinanceiros } = require('../../services/associacaoIndicadores');
const { prepararFilaCampanha, processarFilaCampanha } = require('../../services/associacaoMensageria');
const {
  getOrCreateConfig: getOrCreateReminderConfig,
  processTenantReminders,
} = require('../../services/associacaoLembretes');
const { generateTemporaryPassword, validatePasswordStrength } = require('../../utils/passwordPolicy');
const { uploadBufferToS3, getObjectFromS3 } = require('../../services/s3');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'text/plain',
    ]);
    if (!allowed.has(file.mimetype)) return cb(new Error('Formato de arquivo não permitido.'));
    return cb(null, true);
  },
});

function tenant(req) {
  return req.associacao.tenantId;
}

function actor(req) {
  return req.usuario.id;
}

function tenantDoc(req, extra = {}) {
  return {
    ...extra,
    instituicao: tenant(req),
    tenantId: tenant(req),
    createdBy: actor(req),
    updatedBy: actor(req),
  };
}

function tenantFilter(req, extra = {}) {
  return { tenantId: tenant(req), ...extra };
}

function trim(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value, required = false) {
  if (!value) {
    if (required) throw new Error('Data obrigatória.');
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Data inválida.');
  return d;
}

function objectId(value, field, required = false) {
  if (!value) {
    if (required) throw new Error(`${field} é obrigatório.`);
    return null;
  }
  if (!mongoose.isValidObjectId(String(value))) throw new Error(`${field} inválido.`);
  return new mongoose.Types.ObjectId(String(value));
}

function regex(value) {
  return new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function pageParams(req, defaultLimit = 100) {
  const limit = Math.min(Math.max(parseInt(req.query.limit || defaultLimit, 10) || defaultLimit, 1), 500);
  const page = Math.max(parseInt(req.query.page || 1, 10) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}

function contributionStatus(contribution, now = new Date()) {
  if (contribution.status === 'Cancelado') return 'Cancelado';
  const paid = Number(contribution.valorPago || 0);
  const expected = Number(contribution.valorPrevisto || 0);
  if (paid >= expected && expected > 0) return 'Em dia';
  if (paid > 0) return 'Parcial';
  if (contribution.vencimento && new Date(contribution.vencimento) < now) return 'Atrasado';
  return 'Pendente';
}

async function ensureDefaults(req) {
  const tenantId = tenant(req);
  const userId = actor(req);

  const [accountCount, categoryCount, templateCount] = await Promise.all([
    AssociacaoConta.countDocuments({ tenantId }),
    AssociacaoCategoria.countDocuments({ tenantId }),
    AssociacaoMensagemModelo.countDocuments({ tenantId }),
  ]);

  if (!accountCount) {
    await AssociacaoConta.insertMany([
      tenantDoc(req, { nome: 'Caixa', tipo: 'Caixa', saldoInicial: 0 }),
      tenantDoc(req, { nome: 'Conta bancária', tipo: 'Banco', saldoInicial: 0 }),
      tenantDoc(req, { nome: 'PIX', tipo: 'PIX', saldoInicial: 0 }),
    ]);
  }

  if (!categoryCount) {
    const categories = [
      ['Contribuição', 'Entrada'], ['Doação', 'Entrada'], ['Parceria', 'Entrada'],
      ['Patrocínio', 'Entrada'], ['Rifa', 'Entrada'], ['Evento', 'Ambos'],
      ['Material', 'Saída'], ['Manutenção', 'Saída'], ['Alimentação', 'Saída'],
      ['Serviços', 'Saída'], ['Transporte', 'Saída'], ['Taxas bancárias', 'Saída'],
      ['Administrativo', 'Saída'], ['Outros', 'Ambos'],
    ];
    await AssociacaoCategoria.insertMany(categories.map(([nome, tipoMovimentacao]) => tenantDoc(req, { nome, tipoMovimentacao })));
  }

  if (!templateCount) {
    await AssociacaoMensagemModelo.insertMany([
      tenantDoc(req, {
        nome: 'Feliz aniversário', evento: 'Aniversário', canal: 'E-mail',
        assunto: 'Feliz aniversário, {nome}!',
        conteudo: 'Olá, {nome}!\n\nA associação deseja a você um feliz aniversário, com saúde, paz e muitas realizações. Agradecemos por fazer parte da nossa comunidade.',
      }),
      tenantDoc(req, {
        nome: 'Mensagem de final de ano', evento: 'Ano-Novo', canal: 'E-mail',
        assunto: 'Boas festas — Associação',
        conteudo: 'Olá, {nome}!\n\nAgradecemos pela confiança e parceria durante este ano. Desejamos um novo ciclo de paz, união e conquistas para toda a família.',
      }),
    ]);
  }

  return { tenantId, userId };
}

async function nextReceiptNumber(req) {
  const year = new Date().getFullYear();
  const key = `associacao:${tenant(req)}:recibo:${year}`;
  const counter = await Counter.findOneAndUpdate(
    { chave: key },
    {
      $inc: { seq: 1 },
      $set: { atualizadoEm: new Date() },
      $setOnInsert: { instituicao: tenant(req), tenantId: tenant(req) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${year}-${String(counter.seq).padStart(6, '0')}`;
}

async function movementSnapshots(req, body) {
  const [pessoa, conta, categoria, projeto] = await Promise.all([
    body.pessoa ? AssociacaoPessoa.findOne(tenantFilter(req, { _id: body.pessoa })).lean() : null,
    body.conta ? AssociacaoConta.findOne(tenantFilter(req, { _id: body.conta })).lean() : null,
    body.categoria ? AssociacaoCategoria.findOne(tenantFilter(req, { _id: body.categoria })).lean() : null,
    body.projeto ? AssociacaoProjeto.findOne(tenantFilter(req, { _id: body.projeto })).lean() : null,
  ]);

  if (body.pessoa && !pessoa) throw new Error('Pessoa não encontrada neste tenant.');
  if (body.conta && !conta) throw new Error('Conta não encontrada neste tenant.');
  if (body.categoria && !categoria) throw new Error('Categoria não encontrada neste tenant.');
  if (body.projeto && !projeto) throw new Error('Projeto não encontrado neste tenant.');

  return {
    pessoa,
    conta,
    categoria,
    projeto,
  };
}

async function createReceipt(req, movement, payerName) {
  if (movement.tipo !== 'Entrada' || movement.status !== 'Pago') return null;
  const existing = await AssociacaoRecibo.findOne(tenantFilter(req, { movimentacao: movement._id }));
  if (existing) return existing;

  return AssociacaoRecibo.create(tenantDoc(req, {
    numero: await nextReceiptNumber(req),
    movimentacao: movement._id,
    pessoa: movement.pessoa || null,
    pagadorNome: payerName || movement.pessoaNome || 'Pagador não informado',
    valor: movement.valor,
    dataRecibo: movement.dataMovimentacao,
    finalidade: movement.descricao,
    formaPagamento: movement.formaPagamento,
  }));
}

router.get('/contexto', exigirPermissao('dashboard:ler'), async (req, res) => {
  await ensureDefaults(req);
  const inst = req.associacao.instituicao;
  return res.json({
    associacao: {
      id: String(inst._id),
      nome: inst.nomeExibicao || inst.nome,
      nomeOficial: inst.nome,
      sigla: inst.sigla || null,
      slug: inst.slug,
      logoUrl: inst.logoUrl || '/assets/associacao/logo-apacmdpii-czs.png',
      cnpj: inst.cnpj || null,
      email: inst.email || null,
      telefone: inst.telefone || null,
      endereco: inst.endereco || null,
      plano: inst.associacaoConfig?.plano || 'piloto',
      matriz: inst.instituicaoMatriz || null,
    },
    usuario: {
      id: req.usuario.id,
      nome: req.usuario.nome,
      email: req.usuario.email,
      tipo: req.usuario.tipo,
      perfilAssociacao: req.associacao.perfil,
      permissoes: req.associacao.permissoes,
    },
  });
});

router.get('/dashboard', exigirPermissao('dashboard:ler'), async (req, res) => {
  await ensureDefaults(req);
  const tenantId = new mongoose.Types.ObjectId(tenant(req));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [accounts, monthTotals, pendingContrib, peopleCount, recent, projectCount, birthdays] = await Promise.all([
    AssociacaoConta.find({ tenantId, status: 'Ativo' }).lean(),
    AssociacaoMovimentacao.aggregate([
      { $match: { tenantId, status: 'Pago', dataMovimentacao: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: '$tipo', total: { $sum: '$valor' }, quantidade: { $sum: 1 } } },
    ]),
    AssociacaoContribuicao.aggregate([
      { $match: { tenantId, status: { $nin: ['Em dia', 'Cancelado'] } } },
      { $group: { _id: null, total: { $sum: { $max: [{ $subtract: ['$valorPrevisto', '$valorPago'] }, 0] } }, quantidade: { $sum: 1 } } },
    ]),
    AssociacaoPessoa.countDocuments({ tenantId, status: 'Ativo' }),
    AssociacaoMovimentacao.find({ tenantId }).sort({ dataMovimentacao: -1, createdAt: -1 }).limit(8).lean(),
    AssociacaoProjeto.countDocuments({ tenantId, status: 'Ativo' }),
    AssociacaoPessoa.find({ tenantId, status: 'Ativo', dataNascimento: { $ne: null } })
      .select('nome alunoNome alunoTurma dataNascimento email whatsapp telefone autorizacaoComunicacao autorizaAniversario')
      .lean(),
  ]);

  const paidByAccount = await AssociacaoMovimentacao.aggregate([
    { $match: { tenantId, status: 'Pago', conta: { $ne: null } } },
    { $group: { _id: { conta: '$conta', tipo: '$tipo' }, total: { $sum: '$valor' } } },
  ]);

  const accountMap = new Map(accounts.map(a => [String(a._id), { ...a, saldo: Number(a.saldoInicial || 0) }]));
  for (const row of paidByAccount) {
    const account = accountMap.get(String(row._id.conta));
    if (!account) continue;
    account.saldo += row._id.tipo === 'Entrada' ? row.total : -row.total;
  }

  const accountBalances = [...accountMap.values()];
  const totalBalance = accountBalances.reduce((sum, item) => sum + item.saldo, 0);
  const income = monthTotals.find(item => item._id === 'Entrada') || { total: 0, quantidade: 0 };
  const expense = monthTotals.find(item => item._id === 'Saída') || { total: 0, quantidade: 0 };
  const pending = pendingContrib[0] || { total: 0, quantidade: 0 };

  const upcomingBirthdays = birthdays.map(person => {
    const birth = new Date(person.dataNascimento);
    let next = new Date(now.getFullYear(), birth.getUTCMonth(), birth.getUTCDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate());
    return { ...person, proximoAniversario: next, dias: Math.ceil((next - now) / 86400000) };
  }).filter(item => item.dias >= 0 && item.dias <= 30).sort((a, b) => a.dias - b.dias);

  return res.json({
    saldo: totalBalance,
    contas: accountBalances,
    receitasMes: income.total,
    receitasQuantidade: income.quantidade,
    despesasMes: expense.total,
    despesasQuantidade: expense.quantidade,
    pendente: pending.total,
    pendenciasQuantidade: pending.quantidade,
    pessoasAtivas: peopleCount,
    projetosAtivos: projectCount,
    aniversariantes: upcomingBirthdays,
    movimentacoesRecentes: recent,
  });
});

router.get('/opcoes', exigirPermissao('dashboard:ler'), async (req, res) => {
  const tenantId = tenant(req);
  const [pessoas, contas, categorias, projetos, turmas] = await Promise.all([
    AssociacaoPessoa.find({ tenantId, status: 'Ativo' }).select('nome alunoNome alunoTurma tipo').sort({ nome: 1 }).lean(),
    AssociacaoConta.find({ tenantId, status: 'Ativo' }).select('nome tipo').sort({ nome: 1 }).lean(),
    AssociacaoCategoria.find({ tenantId, status: 'Ativo' }).select('nome tipoMovimentacao').sort({ nome: 1 }).lean(),
    AssociacaoProjeto.find({ tenantId, status: { $in: ['Planejamento', 'Ativo'] } }).select('nome tipo status').sort({ nome: 1 }).lean(),
    AssociacaoPessoa.distinct('alunoTurma', { tenantId, status: 'Ativo', alunoTurma: { $nin: [null, ''] } }),
  ]);
  return res.json({ pessoas, contas, categorias, projetos, turmas: turmas.sort() });
});

/* =========================
   PESSOAS
========================= */
router.get('/pessoas', exigirPermissao('pessoas:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.tipo) filter.tipo = req.query.tipo;
  if (req.query.turma) filter.alunoTurma = req.query.turma;
  if (req.query.q) {
    const rx = regex(req.query.q);
    filter.$or = [{ nome: rx }, { cpfCnpj: rx }, { email: rx }, { telefone: rx }, { whatsapp: rx }, { alunoNome: rx }, { alunoTurma: rx }];
  }
  const { limit, skip, page } = pageParams(req);
  const [items, total] = await Promise.all([
    AssociacaoPessoa.find(filter).sort({ nome: 1 }).skip(skip).limit(limit).lean(),
    AssociacaoPessoa.countDocuments(filter),
  ]);
  return res.json({ pessoas: items, total, page, pages: Math.ceil(total / limit) });
});

router.post('/pessoas', exigirPermissao('pessoas:escrever'), async (req, res) => {
  try {
    if (!trim(req.body.nome)) return res.status(400).json({ mensagem: 'Informe o nome.' });
    const doc = await AssociacaoPessoa.create(tenantDoc(req, {
      nome: trim(req.body.nome),
      tipo: req.body.tipo || 'Pai/Responsável',
      cpfCnpj: trim(req.body.cpfCnpj),
      telefone: trim(req.body.telefone),
      whatsapp: trim(req.body.whatsapp) || trim(req.body.telefone),
      email: trim(req.body.email),
      endereco: trim(req.body.endereco),
      alunoNome: trim(req.body.alunoNome),
      alunoTurma: trim(req.body.alunoTurma),
      dataNascimento: date(req.body.dataNascimento),
      canalPreferido: req.body.canalPreferido || 'WhatsApp',
      autorizacaoComunicacao: bool(req.body.autorizacaoComunicacao),
      autorizaAniversario: bool(req.body.autorizaAniversario),
      autorizaDatasComemorativas: bool(req.body.autorizaDatasComemorativas),
      autorizaNoticiasAssociacao: bool(req.body.autorizaNoticiasAssociacao),
      status: req.body.status || 'Ativo',
      observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoPessoa', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Pessoa cadastrada.', pessoa: doc });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ mensagem: 'CPF/CNPJ já cadastrado nesta associação.' });
    return res.status(400).json({ mensagem: error.message });
  }
});

router.patch('/pessoas/:id', exigirPermissao('pessoas:escrever'), async (req, res) => {
  try {
    const before = await AssociacaoPessoa.findOne(tenantFilter(req, { _id: objectId(req.params.id, 'Pessoa', true) })).lean();
    if (!before) return res.status(404).json({ mensagem: 'Pessoa não encontrada.' });
    const allowed = ['nome','tipo','cpfCnpj','telefone','whatsapp','email','endereco','alunoNome','alunoTurma','canalPreferido','status','observacoes'];
    const $set = { updatedBy: actor(req) };
    for (const field of allowed) if (field in req.body) $set[field] = trim(req.body[field]);
    for (const field of ['autorizacaoComunicacao','autorizaAniversario','autorizaDatasComemorativas','autorizaNoticiasAssociacao']) if (field in req.body) $set[field] = bool(req.body[field]);
    if ('dataNascimento' in req.body) $set.dataNascimento = date(req.body.dataNascimento);
    const doc = await AssociacaoPessoa.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
    await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoPessoa', entidadeId: doc._id, entidadeNome: doc.nome, antes: before, depois: doc.toObject() });
    return res.json({ mensagem: 'Cadastro atualizado.', pessoa: doc });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});


router.delete('/pessoas/:id', exigirPermissao('pessoas:escrever'), async (req, res) => {
  try {
    const pessoaId = objectId(req.params.id, 'Pessoa', true);
    const before = await AssociacaoPessoa.findOne(tenantFilter(req, { _id: pessoaId })).lean();
    if (!before) return res.status(404).json({ mensagem: 'Pessoa não encontrada.' });

    const tenantId = tenant(req);
    const motivo = trim(req.body?.motivo) || 'Exclusão solicitada na tela de pessoas.';

    const [
      movimentacoes,
      contribuicoes,
      pagamentos,
      recibos,
      lembretes,
      mensagens,
      anexos,
    ] = await Promise.all([
      AssociacaoMovimentacao.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoContribuicao.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoPagamento.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoRecibo.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoLembreteEnvio.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoMensagemFila.countDocuments({ tenantId, pessoa: pessoaId }),
      AssociacaoAnexo.countDocuments({ tenantId, entidadeTipo: 'pessoa', entidadeId: pessoaId, status: 'Ativo' }),
    ]);

    const vinculos = {
      movimentacoes,
      contribuicoes,
      pagamentos,
      recibos,
      lembretes,
      mensagens,
      anexos,
    };
    const totalVinculos = Object.values(vinculos).reduce((total, value) => total + Number(value || 0), 0);

    if (totalVinculos > 0) {
      const doc = await AssociacaoPessoa.findOneAndUpdate(
        tenantFilter(req, { _id: pessoaId }),
        {
          $set: {
            status: 'Inativo',
            autorizacaoComunicacao: false,
            autorizaAniversario: false,
            autorizaDatasComemorativas: false,
            autorizaNoticiasAssociacao: false,
            updatedBy: actor(req),
          },
        },
        { new: true, runValidators: true },
      );

      await Promise.all([
        AssociacaoMensagemFila.updateMany(
          { tenantId, pessoa: pessoaId, status: { $in: ['Pendente', 'Processando'] } },
          { $set: { status: 'Cancelada', erro: 'Cadastro da pessoa inativado.' } },
        ),
        AssociacaoLembreteEnvio.updateMany(
          { tenantId, pessoa: pessoaId, status: { $in: ['Processando', 'Erro'] } },
          { $set: { status: 'Cancelado', erro: 'Cadastro da pessoa inativado.', proximaTentativaEm: null } },
        ),
      ]);

      await registrarAuditoriaAssociacao(req, {
        acao: 'INACTIVATE',
        entidade: 'AssociacaoPessoa',
        entidadeId: doc._id,
        entidadeNome: doc.nome,
        antes: before,
        depois: doc.toObject(),
        motivo,
        severidade: 'aviso',
        detalhes: { motivoPreservacao: 'Cadastro possui histórico vinculado.', totalVinculos, vinculos },
      });

      return res.json({
        mensagem: 'Cadastro inativado para preservar contribuições, pagamentos e demais históricos vinculados.',
        inativado: true,
        excluido: false,
        totalVinculos,
        vinculos,
        pessoa: doc,
      });
    }

    await AssociacaoPessoa.deleteOne(tenantFilter(req, { _id: pessoaId }));
    await registrarAuditoriaAssociacao(req, {
      acao: 'DELETE',
      entidade: 'AssociacaoPessoa',
      entidadeId: before._id,
      entidadeNome: before.nome,
      antes: before,
      depois: null,
      motivo,
      severidade: 'aviso',
      detalhes: { totalVinculos: 0 },
    });

    return res.json({
      mensagem: 'Cadastro excluído com sucesso.',
      inativado: false,
      excluido: true,
      totalVinculos: 0,
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

/* =========================
   CONTAS E CATEGORIAS
========================= */
router.get('/contas', exigirPermissao('financeiro:ler'), async (req, res) => {
  const items = await AssociacaoConta.find(tenantFilter(req)).sort({ status: 1, nome: 1 }).lean();
  const tenantId = new mongoose.Types.ObjectId(tenant(req));
  const totals = await AssociacaoMovimentacao.aggregate([
    { $match: { tenantId, status: 'Pago', conta: { $ne: null } } },
    { $group: { _id: { conta: '$conta', tipo: '$tipo' }, total: { $sum: '$valor' } } },
  ]);
  const map = new Map(items.map(i => [String(i._id), { ...i, saldo: Number(i.saldoInicial || 0) }]));
  for (const row of totals) {
    const item = map.get(String(row._id.conta));
    if (item) item.saldo += row._id.tipo === 'Entrada' ? row.total : -row.total;
  }
  return res.json({ contas: [...map.values()] });
});

router.post('/contas', exigirPermissao('financeiro:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoConta.create(tenantDoc(req, {
      nome: trim(req.body.nome), tipo: req.body.tipo || 'Caixa',
      saldoInicial: number(req.body.saldoInicial), dataSaldoInicial: date(req.body.dataSaldoInicial),
      status: req.body.status || 'Ativo', observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoConta', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Conta cadastrada.', conta: doc });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ mensagem: error?.code === 11000 ? 'Já existe uma conta com esse nome.' : error.message });
  }
});

router.patch('/contas/:id', exigirPermissao('financeiro:escrever'), async (req, res) => {
  const before = await AssociacaoConta.findOne(tenantFilter(req, { _id: req.params.id })).lean();
  if (!before) return res.status(404).json({ mensagem: 'Conta não encontrada.' });
  const $set = { updatedBy: actor(req) };
  for (const field of ['nome','tipo','status','observacoes']) if (field in req.body) $set[field] = trim(req.body[field]);
  if ('saldoInicial' in req.body) $set.saldoInicial = number(req.body.saldoInicial);
  if ('dataSaldoInicial' in req.body) $set.dataSaldoInicial = date(req.body.dataSaldoInicial);
  const doc = await AssociacaoConta.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
  await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoConta', entidadeId: doc._id, entidadeNome: doc.nome, antes: before, depois: doc.toObject() });
  return res.json({ mensagem: 'Conta atualizada.', conta: doc });
});

router.get('/categorias', exigirPermissao('financeiro:ler'), async (req, res) => {
  const items = await AssociacaoCategoria.find(tenantFilter(req)).sort({ tipoMovimentacao: 1, nome: 1 }).lean();
  return res.json({ categorias: items });
});

router.post('/categorias', exigirPermissao('financeiro:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoCategoria.create(tenantDoc(req, {
      nome: trim(req.body.nome), tipoMovimentacao: req.body.tipoMovimentacao || 'Ambos', status: req.body.status || 'Ativo',
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoCategoria', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Categoria cadastrada.', categoria: doc });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ mensagem: error?.code === 11000 ? 'Categoria já cadastrada.' : error.message });
  }
});

/* =========================
   MOVIMENTAÇÕES
========================= */
router.get('/movimentacoes', exigirPermissao('financeiro:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.tipo) filter.tipo = req.query.tipo;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.conta) filter.conta = objectId(req.query.conta, 'Conta');
  if (req.query.categoria) filter.categoria = objectId(req.query.categoria, 'Categoria');
  if (req.query.projeto) filter.projeto = objectId(req.query.projeto, 'Projeto');
  if (req.query.turma) filter.alunoTurma = req.query.turma;
  if (req.query.dataInicial || req.query.dataFinal) {
    filter.dataMovimentacao = {};
    if (req.query.dataInicial) filter.dataMovimentacao.$gte = date(req.query.dataInicial);
    if (req.query.dataFinal) {
      const end = date(req.query.dataFinal); end.setHours(23,59,59,999); filter.dataMovimentacao.$lte = end;
    }
  }
  if (req.query.q) {
    const rx = regex(req.query.q);
    filter.$or = [{ descricao: rx }, { pessoaNome: rx }, { alunoNome: rx }, { alunoTurma: rx }, { categoriaNome: rx }, { contaNome: rx }, { projetoNome: rx }];
  }
  const { limit, skip, page } = pageParams(req, 150);
  const [items, total] = await Promise.all([
    AssociacaoMovimentacao.find(filter).sort({ dataMovimentacao: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    AssociacaoMovimentacao.countDocuments(filter),
  ]);
  return res.json({ movimentacoes: items, total, page, pages: Math.ceil(total / limit) });
});

router.post('/movimentacoes', exigirPermissao('financeiro:escrever'), async (req, res) => {
  try {
    const valor = number(req.body.valor);
    if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
    if (!trim(req.body.descricao)) throw new Error('Informe a descrição.');
    const snap = await movementSnapshots(req, req.body);
    const doc = await AssociacaoMovimentacao.create(tenantDoc(req, {
      dataMovimentacao: date(req.body.dataMovimentacao || new Date(), true),
      dataVencimento: date(req.body.dataVencimento),
      tipo: req.body.tipo,
      status: req.body.status || 'Pago',
      pessoa: snap.pessoa?._id || null,
      pessoaNome: snap.pessoa?.nome || trim(req.body.pessoaNome),
      alunoNome: snap.pessoa?.alunoNome || trim(req.body.alunoNome),
      alunoTurma: snap.pessoa?.alunoTurma || trim(req.body.alunoTurma),
      descricao: trim(req.body.descricao),
      categoria: snap.categoria?._id || null,
      categoriaNome: snap.categoria?.nome || trim(req.body.categoriaNome) || 'Outros',
      conta: snap.conta?._id || null,
      contaNome: snap.conta?.nome || null,
      projeto: snap.projeto?._id || null,
      projetoNome: snap.projeto?.nome || null,
      formaPagamento: trim(req.body.formaPagamento),
      valor,
      observacoes: trim(req.body.observacoes),
      origemTipo: trim(req.body.origemTipo),
      origemId: trim(req.body.origemId),
      grupoRecorrencia: trim(req.body.grupoRecorrencia),
      parcelaNumero: number(req.body.parcelaNumero, null),
      parcelaTotal: number(req.body.parcelaTotal, null),
    }));
    const recibo = bool(req.body.gerarRecibo) ? await createReceipt(req, doc, doc.pessoaNome) : null;
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoMovimentacao', entidadeId: doc._id, entidadeNome: doc.descricao, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Movimentação cadastrada.', movimentacao: doc, recibo });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.patch('/movimentacoes/:id', exigirPermissao('financeiro:escrever'), async (req, res) => {
  try {
    const before = await AssociacaoMovimentacao.findOne(tenantFilter(req, { _id: objectId(req.params.id, 'Movimentação', true) })).lean();
    if (!before) return res.status(404).json({ mensagem: 'Movimentação não encontrada.' });
    if (before.status === 'Cancelado') return res.status(409).json({ mensagem: 'Movimentação cancelada não pode ser editada.' });
    const snap = await movementSnapshots(req, req.body);
    const $set = { updatedBy: actor(req) };
    for (const field of ['tipo','status','descricao','formaPagamento','observacoes']) if (field in req.body) $set[field] = trim(req.body[field]);
    if ('valor' in req.body) { const v = number(req.body.valor); if (!(v > 0)) throw new Error('Valor inválido.'); $set.valor = v; }
    if ('dataMovimentacao' in req.body) $set.dataMovimentacao = date(req.body.dataMovimentacao, true);
    if ('dataVencimento' in req.body) $set.dataVencimento = date(req.body.dataVencimento);
    if ('pessoa' in req.body) {
      $set.pessoa = snap.pessoa?._id || null; $set.pessoaNome = snap.pessoa?.nome || null;
      $set.alunoNome = snap.pessoa?.alunoNome || null; $set.alunoTurma = snap.pessoa?.alunoTurma || null;
    }
    if ('conta' in req.body) { $set.conta = snap.conta?._id || null; $set.contaNome = snap.conta?.nome || null; }
    if ('categoria' in req.body) { $set.categoria = snap.categoria?._id || null; $set.categoriaNome = snap.categoria?.nome || 'Outros'; }
    if ('projeto' in req.body) { $set.projeto = snap.projeto?._id || null; $set.projetoNome = snap.projeto?.nome || null; }
    const doc = await AssociacaoMovimentacao.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
    await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoMovimentacao', entidadeId: doc._id, entidadeNome: doc.descricao, antes: before, depois: doc.toObject() });
    return res.json({ mensagem: 'Movimentação atualizada.', movimentacao: doc });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.post('/movimentacoes/:id/cancelar', exigirPermissao('financeiro:cancelar'), async (req, res) => {
  const motivo = trim(req.body.motivo);
  if (!motivo || motivo.length < 5) return res.status(400).json({ mensagem: 'Informe uma justificativa para o cancelamento.' });
  const before = await AssociacaoMovimentacao.findOne(tenantFilter(req, { _id: req.params.id })).lean();
  if (!before) return res.status(404).json({ mensagem: 'Movimentação não encontrada.' });
  if (before.status === 'Cancelado') return res.status(409).json({ mensagem: 'Movimentação já cancelada.' });
  const doc = await AssociacaoMovimentacao.findOneAndUpdate(tenantFilter(req, { _id: before._id }), {
    $set: { status: 'Cancelado', 'cancelamento.motivo': motivo, 'cancelamento.canceladoEm': new Date(), 'cancelamento.canceladoPor': actor(req), updatedBy: actor(req) },
  }, { new: true });
  await AssociacaoRecibo.updateOne(tenantFilter(req, { movimentacao: doc._id }), { $set: { status: 'Cancelado', motivoCancelamento: motivo, updatedBy: actor(req) } });
  await registrarAuditoriaAssociacao(req, { acao: 'CANCEL', entidade: 'AssociacaoMovimentacao', entidadeId: doc._id, entidadeNome: doc.descricao, antes: before, depois: doc.toObject(), motivo, severidade: 'aviso' });
  return res.json({ mensagem: 'Movimentação cancelada com histórico preservado.', movimentacao: doc });
});

/* =========================
   CONTRIBUIÇÕES
========================= */
router.get('/contribuicoes', exigirPermissao('contribuicoes:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.referencia) filter.referencia = req.query.referencia;
  if (req.query.turma) filter.alunoTurma = req.query.turma;
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ responsavelNome: rx }, { alunoNome: rx }, { alunoTurma: rx }]; }
  const items = await AssociacaoContribuicao.find(filter).sort({ referencia: -1, responsavelNome: 1 }).lean();
  const now = new Date();
  const updates = [];
  for (const item of items) {
    const status = contributionStatus(item, now);
    if (status !== item.status) {
      item.status = status;
      updates.push({ updateOne: { filter: { _id: item._id, tenantId: tenant(req) }, update: { $set: { status } } } });
    }
    item.valorPendente = Math.max(Number(item.valorPrevisto || 0) - Number(item.valorPago || 0), 0);
  }
  if (updates.length) await AssociacaoContribuicao.bulkWrite(updates, { ordered: false });

  const contributionIds = items.map(item => item._id);
  const reminderTenantId = new mongoose.Types.ObjectId(String(tenant(req)));
  const lastReminders = contributionIds.length
    ? await AssociacaoLembreteEnvio.aggregate([
        { $match: { tenantId: reminderTenantId, contribuicao: { $in: contributionIds } } },
        { $sort: { createdAt: -1 } },
        { $group: {
          _id: '$contribuicao',
          status: { $first: '$status' },
          canal: { $first: '$canal' },
          etapa: { $first: '$etapa' },
          etapaNome: { $first: '$etapaNome' },
          enviadoEm: { $first: '$enviadoEm' },
          createdAt: { $first: '$createdAt' },
          erro: { $first: '$erro' },
        } },
      ])
    : [];
  const reminderMap = new Map(lastReminders.map(item => [String(item._id), item]));
  for (const item of items) item.ultimoLembrete = reminderMap.get(String(item._id)) || null;

  const summary = items.reduce((acc, item) => {
    acc.previsto += Number(item.valorPrevisto || 0); acc.pago += Number(item.valorPago || 0); acc.pendente += item.valorPendente;
    if (item.valorPendente > 0 && item.status !== 'Cancelado') acc.comPendencia += 1;
    return acc;
  }, { previsto: 0, pago: 0, pendente: 0, comPendencia: 0 });
  return res.json({ contribuicoes: items, resumo: summary });
});

router.post('/contribuicoes', exigirPermissao('contribuicoes:escrever'), async (req, res) => {
  try {
    const pessoaId = objectId(req.body.pessoa, 'Pessoa', true);
    const pessoa = await AssociacaoPessoa.findOne(tenantFilter(req, { _id: pessoaId })).lean();
    if (!pessoa) throw new Error('Pessoa não encontrada.');
    const valor = number(req.body.valorPrevisto);
    if (!(valor > 0)) throw new Error('Informe um valor previsto válido.');
    const doc = await AssociacaoContribuicao.create(tenantDoc(req, {
      pessoa: pessoa._id, responsavelNome: pessoa.nome,
      alunoNome: trim(req.body.alunoNome) || pessoa.alunoNome,
      alunoTurma: trim(req.body.alunoTurma) || pessoa.alunoTurma,
      referencia: trim(req.body.referencia), vencimento: date(req.body.vencimento, true),
      valorPrevisto: valor, valorPago: 0, status: 'Pendente', observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoContribuicao', entidadeId: doc._id, entidadeNome: `${doc.responsavelNome} ${doc.referencia}`, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Contribuição cadastrada.', contribuicao: doc });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ mensagem: error?.code === 11000 ? 'Já existe contribuição para esta pessoa e referência.' : error.message });
  }
});

router.post('/contribuicoes/:id/pagamentos', exigirPermissao('contribuicoes:escrever'), async (req, res) => {
  try {
    const contribution = await AssociacaoContribuicao.findOne(tenantFilter(req, { _id: objectId(req.params.id, 'Contribuição', true) }));
    if (!contribution) return res.status(404).json({ mensagem: 'Contribuição não encontrada.' });
    if (contribution.status === 'Cancelado') return res.status(409).json({ mensagem: 'Contribuição cancelada.' });
    const amount = number(req.body.valor);
    const pending = Math.max(contribution.valorPrevisto - contribution.valorPago, 0);
    if (!(amount > 0)) throw new Error('Informe um valor válido.');
    if (amount > pending + 0.001) throw new Error(`O pagamento excede o valor pendente de R$ ${pending.toFixed(2)}.`);
    const accountId = objectId(req.body.conta, 'Conta', true);
    const account = await AssociacaoConta.findOne(tenantFilter(req, { _id: accountId, status: 'Ativo' })).lean();
    if (!account) throw new Error('Conta financeira não encontrada.');
    let category = await AssociacaoCategoria.findOne(tenantFilter(req, { nome: 'Contribuição', status: 'Ativo' })).lean();
    if (!category) category = await AssociacaoCategoria.create(tenantDoc(req, { nome: 'Contribuição', tipoMovimentacao: 'Entrada' }));
    const paymentDate = date(req.body.dataPagamento || new Date(), true);
    const movement = await AssociacaoMovimentacao.create(tenantDoc(req, {
      dataMovimentacao: paymentDate, tipo: 'Entrada', status: 'Pago',
      pessoa: contribution.pessoa, pessoaNome: contribution.responsavelNome,
      alunoNome: contribution.alunoNome, alunoTurma: contribution.alunoTurma,
      descricao: `Contribuição ${contribution.referencia}`,
      categoria: category._id, categoriaNome: category.nome,
      conta: account._id, contaNome: account.nome,
      formaPagamento: trim(req.body.formaPagamento), valor: amount,
      origemTipo: 'contribuicao_pagamento', origemId: String(contribution._id),
      observacoes: trim(req.body.observacoes),
    }));
    const payment = await AssociacaoPagamento.create(tenantDoc(req, {
      contribuicao: contribution._id, pessoa: contribution.pessoa, movimentacao: movement._id,
      conta: account._id, valor: amount, dataPagamento: paymentDate, formaPagamento: trim(req.body.formaPagamento),
    }));
    contribution.valorPago = Number((contribution.valorPago + amount).toFixed(2));
    contribution.status = contributionStatus(contribution);
    contribution.updatedBy = actor(req);
    await contribution.save();
    if (contribution.status === 'Em dia') {
      await AssociacaoLembreteEnvio.updateMany(
        tenantFilter(req, { contribuicao: contribution._id, status: { $in: ['Erro', 'Processando'] } }),
        {
          $set: {
            status: 'Cancelado',
            erro: 'Cancelado automaticamente após a quitação da contribuição.',
            proximaTentativaEm: null,
            updatedBy: actor(req),
          },
        }
      );
    }
    const receipt = await createReceipt(req, movement, contribution.responsavelNome);
    await registrarAuditoriaAssociacao(req, { acao: 'PAYMENT', entidade: 'AssociacaoContribuicao', entidadeId: contribution._id, entidadeNome: `${contribution.responsavelNome} ${contribution.referencia}`, detalhes: { valor: amount, pagamento: payment._id, movimentacao: movement._id, recibo: receipt?._id } });
    return res.status(201).json({ mensagem: 'Pagamento registrado.', contribuicao: contribution, pagamento: payment, movimentacao: movement, recibo: receipt });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});


/* =========================
   LEMBRETES DE VENCIMENTO
========================= */
router.get('/lembretes/configuracao', exigirPermissao('lembretes:ler'), async (req, res) => {
  try {
    const config = await getOrCreateReminderConfig({ tenantId: tenant(req), actorId: actor(req) });
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [enviados30Dias, errosAbertos, contribuicoesPendentes] = await Promise.all([
      AssociacaoLembreteEnvio.countDocuments(tenantFilter(req, { status: 'Enviado', enviadoEm: { $gte: last30Days } })),
      AssociacaoLembreteEnvio.countDocuments(tenantFilter(req, { status: 'Erro' })),
      AssociacaoContribuicao.countDocuments(tenantFilter(req, {
        status: { $ne: 'Cancelado' },
        lembretesSuspensos: { $ne: true },
        $expr: { $lt: [{ $ifNull: ['$valorPago', 0] }, '$valorPrevisto'] },
      })),
    ]);

    return res.json({
      configuracao: config,
      estatisticas: {
        enviados30Dias,
        errosAbertos,
        contribuicoesPendentes,
        ultimaExecucaoEm: config.ultimaExecucaoEm,
        ultimaExecucaoResumo: config.ultimaExecucaoResumo,
      },
      canaisDisponiveis: {
        email: true,
        whatsappAutomatico: typeof req.app.locals.mensageria?.sendWhatsApp === 'function',
      },
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.put('/lembretes/configuracao', exigirPermissao('lembretes:gerenciar'), async (req, res) => {
  try {
    const config = await getOrCreateReminderConfig({ tenantId: tenant(req), actorId: actor(req) });
    const before = config.toObject();

    const days = Array.isArray(req.body.diasSemana)
      ? [...new Set(req.body.diasSemana.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      : config.diasSemana;
    if (!days.length) throw new Error('Selecione ao menos um dia da semana.');

    const hour = Number(req.body.horaEnvio);
    const minute = Number(req.body.minutoEnvio ?? 0);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Horário de envio inválido.');
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('Minuto de envio inválido.');

    const incomingStages = Array.isArray(req.body.etapas) ? req.body.etapas : [];
    const allowedCodes = new Set(config.etapas.map(stage => stage.codigo));
    const stagesByCode = new Map(incomingStages.map(stage => [String(stage.codigo || '').trim(), stage]));
    const stages = config.etapas.map(existing => {
      const incoming = stagesByCode.get(existing.codigo) || {};
      const offset = Number(incoming.deslocamentoDias ?? existing.deslocamentoDias);
      if (!Number.isInteger(offset) || offset < -365 || offset > 365) throw new Error(`Deslocamento inválido para ${existing.nome}.`);
      const subject = trim(incoming.assunto ?? existing.assunto);
      const message = trim(incoming.mensagem ?? existing.mensagem);
      if (!subject || !message) throw new Error(`Informe assunto e mensagem para ${existing.nome}.`);
      return {
        codigo: existing.codigo,
        nome: trim(incoming.nome) || existing.nome,
        ativo: bool(incoming.ativo, existing.ativo),
        deslocamentoDias: offset,
        assunto: subject,
        mensagem: message,
      };
    });

    for (const incoming of incomingStages) {
      if (incoming?.codigo && !allowedCodes.has(String(incoming.codigo))) throw new Error('Foi informada uma etapa de lembrete inválida.');
    }

    const channels = {
      email: bool(req.body.canais?.email, true),
      whatsapp: bool(req.body.canais?.whatsapp, false),
    };
    const active = bool(req.body.ativo, false);
    if (active && !channels.email && !channels.whatsapp) throw new Error('Ative ao menos um canal antes de ligar a automação.');
    if (channels.whatsapp && typeof req.app.locals.mensageria?.sendWhatsApp !== 'function') {
      throw new Error('O WhatsApp automático ainda não está configurado. Mantenha esse canal desativado até conectar um provedor sendWhatsApp ao backend.');
    }

    config.ativo = active;
    config.somenteAutorizados = bool(req.body.somenteAutorizados, true);
    config.horaEnvio = hour;
    config.minutoEnvio = minute;
    config.diasSemana = days.sort((a, b) => a - b);
    config.canais = channels;
    config.maxTentativas = Math.min(Math.max(Number(req.body.maxTentativas || config.maxTentativas || 3), 1), 10);
    config.intervaloTentativasHoras = Math.min(Math.max(Number(req.body.intervaloTentativasHoras || config.intervaloTentativasHoras || 6), 1), 72);
    config.limitePorExecucao = Math.min(Math.max(Number(req.body.limitePorExecucao || config.limitePorExecucao || 200), 1), 1000);
    config.etapas = stages;
    config.updatedBy = actor(req);
    await config.save();

    await registrarAuditoriaAssociacao(req, {
      acao: 'UPDATE',
      entidade: 'AssociacaoLembreteConfig',
      entidadeId: config._id,
      entidadeNome: 'Lembretes automáticos de contribuição',
      antes: before,
      depois: config.toObject(),
    });

    return res.json({
      mensagem: active
        ? 'Automação de lembretes salva e ativada.'
        : 'Configuração salva. A automação permanece desativada.',
      configuracao: config,
      aviso: null,
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.get('/lembretes/historico', exigirPermissao('lembretes:ler'), async (req, res) => {
  try {
    const filter = tenantFilter(req);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.canal) filter.canal = req.query.canal;
    if (req.query.contribuicao) filter.contribuicao = objectId(req.query.contribuicao, 'Contribuição', true);
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
    const items = await AssociacaoLembreteEnvio.find(filter)
      .populate('contribuicao', 'responsavelNome alunoNome alunoTurma referencia vencimento valorPrevisto valorPago status lembretesSuspensos')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ envios: items });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.post('/lembretes/processar', exigirPermissao('lembretes:gerenciar'), async (req, res) => {
  try {
    const result = await processTenantReminders({
      tenantId: tenant(req),
      actorId: actor(req),
      mensageria: req.app.locals.mensageria,
      forceTime: true,
    });
    await registrarAuditoriaAssociacao(req, {
      acao: 'PROCESS',
      entidade: 'AssociacaoLembreteConfig',
      entidadeId: result.config?._id,
      entidadeNome: 'Processamento manual dos lembretes automáticos',
      detalhes: result.summary,
    });
    return res.json({
      mensagem: result.skipped
        ? 'Nenhum lembrete foi processado porque a automação está desativada.'
        : `Processamento concluído: ${result.summary.sent} enviado(s), ${result.summary.errors} erro(s) e ${result.summary.duplicates} já processado(s).`,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.post('/contribuicoes/:id/lembrete', exigirPermissao('lembretes:gerenciar'), async (req, res) => {
  try {
    const contributionId = objectId(req.params.id, 'Contribuição', true);
    const channel = req.body.canal === 'WhatsApp' ? 'WhatsApp' : 'E-mail';
    const contribution = await AssociacaoContribuicao.findOne(tenantFilter(req, { _id: contributionId })).lean();
    if (!contribution) throw new Error('Contribuição não encontrada.');

    const result = await processTenantReminders({
      tenantId: tenant(req),
      actorId: actor(req),
      mensageria: req.app.locals.mensageria,
      forceTime: true,
      contributionId,
      manual: true,
      requestedChannel: channel,
    });

    await registrarAuditoriaAssociacao(req, {
      acao: 'SEND',
      entidade: 'AssociacaoContribuicao',
      entidadeId: contributionId,
      entidadeNome: `${contribution.responsavelNome} ${contribution.referencia}`,
      detalhes: { canal: channel, resumo: result.summary, origem: 'Manual' },
    });

    if (result.summary.sent > 0) return res.json({ mensagem: `Lembrete enviado por ${channel}.`, ...result });
    if (result.summary.errors > 0) return res.status(400).json({ mensagem: `Não foi possível enviar o lembrete por ${channel}. Consulte o histórico para ver o erro.`, ...result });
    return res.status(400).json({ mensagem: 'O lembrete não foi enviado. Verifique autorização de comunicação, contato, pendência ou suspensão.', ...result });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.patch('/contribuicoes/:id/lembretes', exigirPermissao('lembretes:gerenciar'), async (req, res) => {
  try {
    const contributionId = objectId(req.params.id, 'Contribuição', true);
    const suspend = bool(req.body.suspender, true);
    const reason = trim(req.body.motivo);
    if (suspend && (!reason || reason.length < 3)) throw new Error('Informe o motivo da suspensão dos lembretes.');

    const before = await AssociacaoContribuicao.findOne(tenantFilter(req, { _id: contributionId })).lean();
    if (!before) throw new Error('Contribuição não encontrada.');

    const update = suspend
      ? {
          lembretesSuspensos: true,
          lembretesSuspensosEm: new Date(),
          lembretesSuspensosPor: actor(req),
          lembretesSuspensosMotivo: reason,
          updatedBy: actor(req),
        }
      : {
          lembretesSuspensos: false,
          lembretesSuspensosEm: null,
          lembretesSuspensosPor: null,
          lembretesSuspensosMotivo: null,
          updatedBy: actor(req),
        };

    const doc = await AssociacaoContribuicao.findOneAndUpdate(
      tenantFilter(req, { _id: contributionId }),
      { $set: update },
      { new: true, runValidators: true }
    );

    await registrarAuditoriaAssociacao(req, {
      acao: suspend ? 'SUSPEND' : 'RESUME',
      entidade: 'AssociacaoContribuicao',
      entidadeId: contributionId,
      entidadeNome: `${doc.responsavelNome} ${doc.referencia}`,
      antes,
      depois: doc.toObject(),
      motivo: reason,
    });

    return res.json({
      mensagem: suspend ? 'Lembretes desta contribuição foram suspensos.' : 'Lembretes desta contribuição foram reativados.',
      contribuicao: doc,
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.get('/recibos/:id', exigirPermissao('relatorios:ler'), async (req, res) => {
  const receipt = await AssociacaoRecibo.findOne(tenantFilter(req, { _id: req.params.id })).populate('movimentacao pessoa').lean();
  if (!receipt) return res.status(404).json({ mensagem: 'Recibo não encontrado.' });
  return res.json({ recibo: receipt, associacao: req.associacao.instituicao });
});

/* =========================
   PROJETOS
========================= */
router.get('/projetos', exigirPermissao('projetos:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ nome: rx }, { descricao: rx }, { responsavelNome: rx }]; }
  const items = await AssociacaoProjeto.find(filter).sort({ createdAt: -1 }).lean();
  const tenantId = new mongoose.Types.ObjectId(tenant(req));
  const totals = await AssociacaoMovimentacao.aggregate([
    { $match: { tenantId, status: 'Pago', projeto: { $ne: null } } },
    { $group: { _id: { projeto: '$projeto', tipo: '$tipo' }, total: { $sum: '$valor' } } },
  ]);
  const map = new Map(items.map(item => [String(item._id), { ...item, arrecadado: 0, aplicado: 0, saldo: 0 }]));
  for (const row of totals) {
    const item = map.get(String(row._id.projeto));
    if (!item) continue;
    if (row._id.tipo === 'Entrada') item.arrecadado += row.total; else item.aplicado += row.total;
    item.saldo = item.arrecadado - item.aplicado;
  }
  return res.json({ projetos: [...map.values()] });
});

router.post('/projetos', exigirPermissao('projetos:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoProjeto.create(tenantDoc(req, {
      nome: trim(req.body.nome), tipo: req.body.tipo || 'Projeto', descricao: trim(req.body.descricao),
      dataInicio: date(req.body.dataInicio), dataFim: date(req.body.dataFim),
      metaArrecadacao: number(req.body.metaArrecadacao), orcamentoPrevisto: number(req.body.orcamentoPrevisto),
      responsavelNome: trim(req.body.responsavelNome), status: req.body.status || 'Planejamento', observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoProjeto', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Projeto/campanha cadastrado.', projeto: doc });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.patch('/projetos/:id', exigirPermissao('projetos:escrever'), async (req, res) => {
  const before = await AssociacaoProjeto.findOne(tenantFilter(req, { _id: req.params.id })).lean();
  if (!before) return res.status(404).json({ mensagem: 'Projeto não encontrado.' });
  const $set = { updatedBy: actor(req) };
  for (const field of ['nome','tipo','descricao','responsavelNome','status','observacoes']) if (field in req.body) $set[field] = trim(req.body[field]);
  for (const field of ['metaArrecadacao','orcamentoPrevisto']) if (field in req.body) $set[field] = number(req.body[field]);
  for (const field of ['dataInicio','dataFim']) if (field in req.body) $set[field] = date(req.body[field]);
  const doc = await AssociacaoProjeto.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
  await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoProjeto', entidadeId: doc._id, entidadeNome: doc.nome, antes: before, depois: doc.toObject() });
  return res.json({ mensagem: 'Projeto atualizado.', projeto: doc });
});

/* =========================
   PATRIMÔNIO
========================= */
router.get('/patrimonios', exigirPermissao('patrimonio:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ codigo: rx }, { nome: rx }, { categoria: rx }, { localizacao: rx }, { responsavelNome: rx }]; }
  const items = await AssociacaoPatrimonio.find(filter).sort({ codigo: 1 }).lean();
  const resumo = items.reduce((acc, item) => { acc.quantidade += 1; acc.valor += Number(item.valorAquisicao || 0); if (item.status === 'Em manutenção') acc.manutencao += 1; if (item.status !== 'Baixado') acc.ativos += 1; return acc; }, { quantidade: 0, ativos: 0, manutencao: 0, valor: 0 });
  return res.json({ patrimonios: items, resumo });
});

router.post('/patrimonios', exigirPermissao('patrimonio:escrever'), async (req, res) => {
  try {
    const projectId = objectId(req.body.projeto, 'Projeto');
    if (projectId && !(await AssociacaoProjeto.exists(tenantFilter(req, { _id: projectId })))) throw new Error('Projeto não encontrado.');
    const doc = await AssociacaoPatrimonio.create(tenantDoc(req, {
      codigo: trim(req.body.codigo), nome: trim(req.body.nome), categoria: trim(req.body.categoria), descricao: trim(req.body.descricao),
      dataAquisicao: date(req.body.dataAquisicao), valorAquisicao: number(req.body.valorAquisicao), origem: req.body.origem || 'Compra',
      localizacao: trim(req.body.localizacao), responsavelNome: trim(req.body.responsavelNome),
      estadoConservacao: req.body.estadoConservacao || 'Bom', status: req.body.status || 'Em uso', projeto: projectId, observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoPatrimonio', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Bem patrimonial cadastrado.', patrimonio: doc });
  } catch (error) { return res.status(error?.code === 11000 ? 409 : 400).json({ mensagem: error?.code === 11000 ? 'Código patrimonial já utilizado.' : error.message }); }
});

router.patch('/patrimonios/:id', exigirPermissao('patrimonio:escrever'), async (req, res) => {
  const before = await AssociacaoPatrimonio.findOne(tenantFilter(req, { _id: req.params.id })).lean();
  if (!before) return res.status(404).json({ mensagem: 'Patrimônio não encontrado.' });
  const $set = { updatedBy: actor(req) };
  for (const field of ['codigo','nome','categoria','descricao','origem','localizacao','responsavelNome','estadoConservacao','status','observacoes']) if (field in req.body) $set[field] = trim(req.body[field]);
  if ('valorAquisicao' in req.body) $set.valorAquisicao = number(req.body.valorAquisicao);
  if ('dataAquisicao' in req.body) $set.dataAquisicao = date(req.body.dataAquisicao);
  if ('projeto' in req.body) $set.projeto = objectId(req.body.projeto, 'Projeto');
  const doc = await AssociacaoPatrimonio.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
  await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoPatrimonio', entidadeId: doc._id, entidadeNome: doc.nome, antes: before, depois: doc.toObject() });
  return res.json({ mensagem: 'Patrimônio atualizado.', patrimonio: doc });
});

/* =========================
   DOCUMENTOS
========================= */
router.get('/documentos', exigirPermissao('documentos:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.tipo) filter.tipo = req.query.tipo;
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ titulo: rx }, { numeroReferencia: rx }, { responsavelNome: rx }]; }
  const items = await AssociacaoDocumento.find(filter).sort({ dataValidade: 1, createdAt: -1 }).lean();
  const now = new Date(); const thirty = new Date(now.getTime() + 30 * 86400000);
  for (const item of items) {
    if (item.status === 'Vigente' && item.dataValidade && new Date(item.dataValidade) < now) item.statusCalculado = 'Vencido';
    else if (item.status === 'Vigente' && item.dataValidade && new Date(item.dataValidade) <= thirty) item.statusCalculado = 'Vence em até 30 dias';
    else item.statusCalculado = item.status;
  }
  return res.json({ documentos: items });
});

router.post('/documentos', exigirPermissao('documentos:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoDocumento.create(tenantDoc(req, {
      titulo: trim(req.body.titulo), tipo: req.body.tipo || 'Outro', numeroReferencia: trim(req.body.numeroReferencia),
      dataEmissao: date(req.body.dataEmissao), dataValidade: date(req.body.dataValidade),
      responsavelNome: trim(req.body.responsavelNome), status: req.body.status || 'Vigente', observacoes: trim(req.body.observacoes),
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoDocumento', entidadeId: doc._id, entidadeNome: doc.titulo, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Documento cadastrado.', documento: doc });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.patch('/documentos/:id', exigirPermissao('documentos:escrever'), async (req, res) => {
  const before = await AssociacaoDocumento.findOne(tenantFilter(req, { _id: req.params.id })).lean();
  if (!before) return res.status(404).json({ mensagem: 'Documento não encontrado.' });
  const $set = { updatedBy: actor(req) };
  for (const field of ['titulo','tipo','numeroReferencia','responsavelNome','status','observacoes']) if (field in req.body) $set[field] = trim(req.body[field]);
  for (const field of ['dataEmissao','dataValidade']) if (field in req.body) $set[field] = date(req.body[field]);
  const doc = await AssociacaoDocumento.findOneAndUpdate(tenantFilter(req, { _id: before._id }), { $set }, { new: true, runValidators: true });
  await registrarAuditoriaAssociacao(req, { acao: 'UPDATE', entidade: 'AssociacaoDocumento', entidadeId: doc._id, entidadeNome: doc.titulo, antes: before, depois: doc.toObject() });
  return res.json({ mensagem: 'Documento atualizado.', documento: doc });
});

/* =========================
   ANEXOS
========================= */
router.get('/anexos', exigirPermissao('anexos:ler'), async (req, res) => {
  const filter = tenantFilter(req, { status: req.query.status || 'Ativo' });
  if (req.query.entidadeTipo) filter.entidadeTipo = req.query.entidadeTipo;
  if (req.query.entidadeId) filter.entidadeId = objectId(req.query.entidadeId, 'Registro');
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ nomeOriginal: rx }, { descricao: rx }, { entidadeNome: rx }]; }
  const items = await AssociacaoAnexo.find(filter).sort({ createdAt: -1 }).lean();
  return res.json({ anexos: items });
});

router.post('/anexos', exigirPermissao('anexos:escrever'), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) throw new Error('Selecione um arquivo.');
    const entidadeTipo = trim(req.body.entidadeTipo);
    const entidadeId = objectId(req.body.entidadeId, 'Registro', true);
    const allowedTypes = ['movimentacao','projeto','patrimonio','documento','pessoa'];
    if (!allowedTypes.includes(entidadeTipo)) throw new Error('Tipo de vínculo inválido.');
    const safeBase = path.basename(req.file.originalname).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const key = `associacoes/${tenant(req)}/${entidadeTipo}/${Date.now()}-${safeBase}`;
    let url; let provider; let storageKey;
    if (process.env.AWS_BUCKET_NAME && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      url = await uploadBufferToS3({ buffer: req.file.buffer, key, contentType: req.file.mimetype });
      provider = 's3'; storageKey = key;
    } else {
      const dir = path.join(__dirname, '..', '..', 'uploads', 'associacoes', String(tenant(req)), entidadeTipo);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}-${safeBase}`;
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);
      url = `/uploads/associacoes/${tenant(req)}/${entidadeTipo}/${filename}`;
      provider = 'local'; storageKey = path.join(String(tenant(req)), entidadeTipo, filename);
    }
    const doc = await AssociacaoAnexo.create(tenantDoc(req, {
      entidadeTipo, entidadeId, entidadeNome: trim(req.body.entidadeNome),
      nomeOriginal: req.file.originalname, mimeType: req.file.mimetype,
      extensao: path.extname(req.file.originalname).toLowerCase(), tamanhoBytes: req.file.size,
      descricao: trim(req.body.descricao), storageProvider: provider, storageKey, url: 'protected',
    }));
    doc.url = `/api/associacao/anexos/${doc._id}/arquivo`;
    await doc.save();
    await registrarAuditoriaAssociacao(req, { acao: 'UPLOAD', entidade: 'AssociacaoAnexo', entidadeId: doc._id, entidadeNome: doc.nomeOriginal, detalhes: { entidadeTipo, entidadeId, tamanhoBytes: doc.tamanhoBytes, provider } });
    return res.status(201).json({ mensagem: 'Anexo enviado.', anexo: doc });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.get('/anexos/:id/arquivo', exigirPermissao('anexos:ler'), async (req, res) => {
  try {
    const doc = await AssociacaoAnexo.findOne(tenantFilter(req, { _id: req.params.id, status: 'Ativo' })).lean();
    if (!doc) return res.status(404).json({ mensagem: 'Anexo não encontrado.' });

    const safeName = String(doc.nomeOriginal || 'anexo').replace(/[\r\n"]/g, '_');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (doc.storageProvider === 's3') {
      const object = await getObjectFromS3({ key: doc.storageKey });
      if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
      object.Body.on('error', error => { if (!res.headersSent) res.status(500); res.end(); console.error('[associacao/anexo/s3]', error); });
      return object.Body.pipe(res);
    }

    if (doc.storageProvider === 'local') {
      const root = path.resolve(__dirname, '..', '..', 'uploads', 'associacoes');
      const filePath = path.resolve(root, String(doc.storageKey || ''));
      if (!filePath.startsWith(root + path.sep)) return res.status(403).json({ mensagem: 'Caminho de anexo inválido.' });
      if (!fs.existsSync(filePath)) return res.status(404).json({ mensagem: 'Arquivo físico não encontrado.' });
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Length', String(stat.size));
      return fs.createReadStream(filePath).pipe(res);
    }

    if (doc.url && /^https?:\/\//i.test(doc.url)) return res.redirect(doc.url);
    return res.status(404).json({ mensagem: 'Arquivo indisponível.' });
  } catch (error) {
    if (!res.headersSent) return res.status(500).json({ mensagem: 'Erro ao abrir anexo.', erro: error.message });
    return res.end();
  }
});

router.post('/anexos/:id/remover', exigirPermissao('anexos:escrever'), async (req, res) => {
  const motivo = trim(req.body.motivo);
  if (!motivo) return res.status(400).json({ mensagem: 'Informe o motivo da remoção.' });
  const doc = await AssociacaoAnexo.findOneAndUpdate(tenantFilter(req, { _id: req.params.id, status: 'Ativo' }), {
    $set: { status: 'Removido', removidoPor: actor(req), removidoEm: new Date(), motivoRemocao: motivo, updatedBy: actor(req) },
  }, { new: true });
  if (!doc) return res.status(404).json({ mensagem: 'Anexo não encontrado.' });
  await registrarAuditoriaAssociacao(req, { acao: 'REMOVE_ATTACHMENT', entidade: 'AssociacaoAnexo', entidadeId: doc._id, entidadeNome: doc.nomeOriginal, motivo, severidade: 'aviso' });
  return res.json({ mensagem: 'Anexo removido do uso, com histórico preservado.', anexo: doc });
});

/* =========================
   RELACIONAMENTO / MENSAGENS
========================= */
router.get('/mensagens/modelos', exigirPermissao('mensagens:ler'), async (req, res) => {
  const items = await AssociacaoMensagemModelo.find(tenantFilter(req)).sort({ status: 1, nome: 1 }).lean();
  return res.json({ modelos: items });
});

router.post('/mensagens/modelos', exigirPermissao('mensagens:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoMensagemModelo.create(tenantDoc(req, {
      nome: trim(req.body.nome), evento: req.body.evento || 'Comunicado', canal: req.body.canal || 'E-mail',
      assunto: trim(req.body.assunto), conteudo: trim(req.body.conteudo), status: req.body.status || 'Ativo',
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoMensagemModelo', entidadeId: doc._id, entidadeNome: doc.nome, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Modelo salvo.', modelo: doc });
  } catch (error) { return res.status(error?.code === 11000 ? 409 : 400).json({ mensagem: error?.code === 11000 ? 'Já existe um modelo com esse nome.' : error.message }); }
});

router.get('/mensagens/campanhas', exigirPermissao('mensagens:ler'), async (req, res) => {
  const items = await AssociacaoCampanha.find(tenantFilter(req)).sort({ createdAt: -1 }).lean();
  return res.json({ campanhas: items });
});

router.post('/mensagens/campanhas', exigirPermissao('mensagens:escrever'), async (req, res) => {
  try {
    const doc = await AssociacaoCampanha.create(tenantDoc(req, {
      titulo: trim(req.body.titulo), evento: trim(req.body.evento) || 'Comunicado', canal: req.body.canal || 'E-mail',
      assunto: trim(req.body.assunto), conteudo: trim(req.body.conteudo), agendadaPara: date(req.body.agendadaPara),
      publico: {
        tipos: Array.isArray(req.body.tipos) ? req.body.tipos.map(trim).filter(Boolean) : [],
        turmas: Array.isArray(req.body.turmas) ? req.body.turmas.map(trim).filter(Boolean) : [],
        apenasAutorizados: bool(req.body.apenasAutorizados, true),
        apenasAniversariantes: bool(req.body.apenasAniversariantes, false),
      },
      status: 'Rascunho',
    }));
    await registrarAuditoriaAssociacao(req, { acao: 'CREATE', entidade: 'AssociacaoCampanha', entidadeId: doc._id, entidadeNome: doc.titulo, depois: doc.toObject() });
    return res.status(201).json({ mensagem: 'Campanha criada.', campanha: doc });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.post('/mensagens/campanhas/:id/preparar', exigirPermissao('mensagens:escrever'), async (req, res) => {
  try {
    const result = await prepararFilaCampanha(req.params.id, tenant(req), actor(req));
    await registrarAuditoriaAssociacao(req, { acao: 'QUEUE', entidade: 'AssociacaoCampanha', entidadeId: result.campanha._id, entidadeNome: result.campanha.titulo, detalhes: { total: result.total } });
    return res.json({ mensagem: `${result.total} destinatário(s) preparado(s).`, ...result });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.post('/mensagens/campanhas/:id/processar', exigirPermissao('mensagens:escrever'), async (req, res) => {
  try {
    const result = await processarFilaCampanha({ campanhaId: req.params.id, tenantId: tenant(req), limite: req.body.limite || 50, mensageria: req.app.locals.mensageria });
    await registrarAuditoriaAssociacao(req, { acao: 'SEND', entidade: 'AssociacaoCampanha', entidadeId: result.campanha._id, entidadeNome: result.campanha.titulo, detalhes: result });
    return res.json({ mensagem: 'Processamento da fila concluído.', ...result });
  } catch (error) { return res.status(400).json({ mensagem: error.message }); }
});

router.get('/mensagens/fila', exigirPermissao('mensagens:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.campanha) filter.campanha = objectId(req.query.campanha, 'Campanha');
  if (req.query.status) filter.status = req.query.status;
  const items = await AssociacaoMensagemFila.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return res.json({ fila: items });
});

/* =========================
   USUÁRIOS DO MÓDULO
========================= */
router.get('/usuarios', exigirPermissao('usuarios:gerenciar'), async (req, res) => {
  const tenantId = tenant(req);

  const [vinculos, legados] = await Promise.all([
    UsuarioVinculoInstituicao.find({
      instituicao: tenantId,
      'acessosModulos.associacao.ativo': true,
    })
      .populate('usuario', 'nome email tipo ativo instituicao tenantId createdAt updatedAt')
      .sort({ createdAt: 1 })
      .lean(),
    Usuario.find({
      instituicao: tenantId,
      'acessosModulos.associacao.ativo': true,
    })
      .select('nome email tipo ativo instituicao tenantId acessosModulos createdAt updatedAt')
      .sort({ nome: 1 })
      .lean(),
  ]);

  const map = new Map();
  for (const vinculo of vinculos) {
    if (!vinculo.usuario) continue;
    const usuarioId = String(vinculo.usuario._id);
    map.set(usuarioId, {
      id: usuarioId,
      vinculoId: String(vinculo._id),
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      tipo: vinculo.tipoInstitucional || vinculo.usuario.tipo,
      ativo: vinculo.ativo !== false && vinculo.usuario.ativo !== false,
      perfil: vinculo.acessosModulos?.associacao?.perfil || null,
      identidadeReutilizada: String(vinculo.usuario.instituicao || '') !== String(tenantId),
      instituicaoPrimaria: vinculo.usuario.instituicao || null,
      origem: vinculo.origem || 'vinculo',
      createdAt: vinculo.createdAt,
      updatedAt: vinculo.updatedAt,
    });
  }

  for (const usuario of legados) {
    const usuarioId = String(usuario._id);
    if (map.has(usuarioId)) continue;
    map.set(usuarioId, {
      id: usuarioId,
      vinculoId: null,
      nome: usuario.nome,
      email: usuario.email,
      tipo: usuario.tipo,
      ativo: usuario.ativo !== false,
      perfil: usuario.acessosModulos?.associacao?.perfil || null,
      identidadeReutilizada: false,
      instituicaoPrimaria: usuario.instituicao || null,
      origem: 'legado_v3_1',
      createdAt: usuario.createdAt,
      updatedAt: usuario.updatedAt,
    });
  }

  return res.json({ usuarios: [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) });
});

router.get('/usuarios/buscar', exigirPermissao('usuarios:gerenciar'), async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
  }

  const usuario = await Usuario.findOne({ email })
    .select('nome email tipo ativo instituicao tenantId')
    .populate('instituicao', 'nome sigla slug')
    .lean();

  if (!usuario) return res.json({ encontrado: false });

  const vinculo = await UsuarioVinculoInstituicao.findOne({
    usuario: usuario._id,
    instituicao: tenant(req),
  }).lean();

  return res.json({
    encontrado: true,
    usuario: {
      id: String(usuario._id),
      nome: usuario.nome,
      email: usuario.email,
      ativo: usuario.ativo !== false,
      instituicaoPrimaria: usuario.instituicao || null,
    },
    vinculo: vinculo ? {
      id: String(vinculo._id),
      ativo: vinculo.ativo !== false,
      perfil: vinculo.acessosModulos?.associacao?.perfil || null,
    } : null,
  });
});

router.post('/usuarios', exigirPermissao('usuarios:gerenciar'), async (req, res) => {
  try {
    const perfil = normalizePerfil(req.body.perfil);
    if (!perfil) throw new Error(`Perfil inválido. Use: ${PERFIS.join(', ')}.`);

    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');

    let usuario = await Usuario.findOne({ email }).select('+senha nome email tipo ativo instituicao tenantId');
    let identidadeReutilizada = Boolean(usuario);
    let password = null;

    if (usuario?.ativo === false) {
      throw new Error('Esse e-mail pertence a um usuário inativo. Reative-o antes de conceder o acesso.');
    }

    if (!usuario) {
      password = trim(req.body.senha) || generateTemporaryPassword();
      const validation = validatePasswordStrength(password);
      if (!validation.ok) throw new Error(validation.message);

      const nome = trim(req.body.nome);
      if (!nome || nome.length < 3) throw new Error('Informe o nome completo do novo usuário.');

      usuario = await Usuario.create({
        nome,
        email,
        senha: password,
        tipo: 'admin',
        portal: 'institucional',
        instituicao: tenant(req),
        tenantId: tenant(req),
        ativo: true,
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        acessosModulos: { associacao: { ativo: true, perfil } },
      });
    }

    const vinculoExistente = await UsuarioVinculoInstituicao.findOne({
      usuario: usuario._id,
      instituicao: tenant(req),
    }).lean();

    if (vinculoExistente?.ativo === true && vinculoExistente.acessosModulos?.associacao?.ativo === true) {
      throw new Error('Este usuário já possui acesso à associação. Altere o perfil no cadastro existente.');
    }

    const vinculo = await criarOuAtualizarVinculo({
      usuarioId: usuario._id,
      instituicaoId: tenant(req),
      perfilAssociacao: perfil,
      tipoInstitucional: 'admin',
      ativo: true,
      origem: identidadeReutilizada ? 'associacao' : 'manual',
      actorId: req.usuario.id,
    });

    const inst = req.associacao.instituicao;
    let emailResult = null;
    if (req.app.locals.mensageria?.sendEmail) {
      const link = `${req.protocol}://${req.get('host')}/login.html?t=${encodeURIComponent(inst.slug)}`;
      if (identidadeReutilizada) {
        emailResult = await req.app.locals.mensageria.sendEmail({
          to: email,
          subject: `Acesso liberado — ${inst.sigla || inst.nome}`,
          text: `Olá, ${usuario.nome}. Seu acesso à associação foi liberado com o perfil ${perfil}. Use o mesmo e-mail e a mesma senha que você já utiliza no Axoriin. Acesse: ${link}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Acesso ao Axoriin Associações</h2><p>Olá, <b>${usuario.nome}</b>.</p><p>Seu acesso a <b>${inst.nome}</b> foi liberado com o perfil <b>${perfil.replaceAll('_', ' ')}</b>.</p><p>Use <b>o mesmo e-mail e a mesma senha</b> que você já utiliza no Axoriin.</p><p><a href="${link}">Entrar na associação</a></p></div>`,
        });
      } else {
        emailResult = await req.app.locals.mensageria.sendEmail({
          to: email,
          subject: `Acesso ao Axoriin Associações — ${inst.sigla || inst.nome}`,
          text: `Olá, ${usuario.nome}. Seu acesso foi criado. Usuário: ${email}. Senha temporária: ${password}. Acesse: ${link}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Acesso ao Axoriin Associações</h2><p>Olá, <b>${usuario.nome}</b>.</p><p>Seu acesso foi criado para <b>${inst.nome}</b>.</p><p><b>Usuário:</b> ${email}<br><b>Senha temporária:</b> ${password}</p><p><a href="${link}">Entrar no sistema</a></p><p>Troque a senha após o primeiro acesso.</p></div>`,
        });
      }
    }

    await registrarAuditoriaAssociacao(req, {
      acao: identidadeReutilizada ? 'LINK' : 'CREATE',
      entidade: 'UsuarioVinculoInstituicao',
      entidadeId: vinculo._id,
      entidadeNome: usuario.nome,
      detalhes: { perfil, email, identidadeReutilizada, usuarioId: usuario._id, emailEnviado: !!emailResult?.ok },
    });

    return res.status(201).json({
      mensagem: identidadeReutilizada
        ? 'Usuário existente vinculado à associação. A senha atual foi preservada.'
        : 'Novo usuário criado e vinculado à associação.',
      usuario: {
        id: usuario._id,
        vinculoId: vinculo._id,
        nome: usuario.nome,
        email: usuario.email,
        perfil,
        identidadeReutilizada,
      },
      senhaTemporaria: identidadeReutilizada ? null : password,
      email: emailResult,
    });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.patch('/usuarios/:vinculoId', exigirPermissao('usuarios:gerenciar'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.vinculoId)) throw new Error('Vínculo inválido.');
    const perfil = req.body.perfil !== undefined ? normalizePerfil(req.body.perfil) : undefined;
    if (req.body.perfil !== undefined && !perfil) throw new Error('Perfil inválido.');

    const set = { atualizadoPor: req.usuario.id };
    if (perfil) {
      set['acessosModulos.associacao.perfil'] = perfil;
      set['acessosModulos.associacao.ativo'] = true;
    }
    if (req.body.ativo !== undefined) {
      const ativo = bool(req.body.ativo, true);
      set.ativo = ativo;
      set['acessosModulos.associacao.ativo'] = ativo;
    }

    const vinculo = await UsuarioVinculoInstituicao.findOneAndUpdate(
      { _id: req.params.vinculoId, instituicao: tenant(req) },
      { $set: set },
      { new: true, runValidators: true }
    ).populate('usuario', 'nome email');

    if (!vinculo) throw new Error('Vínculo não encontrado nesta associação.');

    await registrarAuditoriaAssociacao(req, {
      acao: 'UPDATE',
      entidade: 'UsuarioVinculoInstituicao',
      entidadeId: vinculo._id,
      entidadeNome: vinculo.usuario?.nome || null,
      detalhes: { perfil: vinculo.acessosModulos?.associacao?.perfil, ativo: vinculo.ativo },
    });

    return res.json({ mensagem: 'Acesso atualizado.', vinculo });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

router.delete('/usuarios/:vinculoId', exigirPermissao('usuarios:gerenciar'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.vinculoId)) throw new Error('Vínculo inválido.');

    const vinculo = await UsuarioVinculoInstituicao.findOneAndUpdate(
      { _id: req.params.vinculoId, instituicao: tenant(req) },
      {
        $set: {
          ativo: false,
          'acessosModulos.associacao.ativo': false,
          atualizadoPor: req.usuario.id,
        },
      },
      { new: true }
    ).populate('usuario', 'nome email');

    if (!vinculo) throw new Error('Vínculo não encontrado nesta associação.');
    if (String(vinculo.usuario?._id || '') === String(req.usuario.id)) {
      // Reverte para impedir que o presidente remova a própria sessão por engano.
      await UsuarioVinculoInstituicao.updateOne(
        { _id: vinculo._id },
        { $set: { ativo: true, 'acessosModulos.associacao.ativo': true } }
      );
      throw new Error('Você não pode remover o próprio acesso por esta tela.');
    }

    await registrarAuditoriaAssociacao(req, {
      acao: 'UNLINK',
      entidade: 'UsuarioVinculoInstituicao',
      entidadeId: vinculo._id,
      entidadeNome: vinculo.usuario?.nome || null,
      motivo: trim(req.body?.motivo) || 'Acesso removido pela administração da associação.',
    });

    return res.json({ mensagem: 'Acesso à associação removido. A identidade Axoriin foi preservada.' });
  } catch (error) {
    return res.status(400).json({ mensagem: error.message });
  }
});

/* =========================
   RELATÓRIOS E AUDITORIA
========================= */
/* =========================
   INDICADORES FINANCEIROS
========================= */
router.get('/indicadores/financeiro', exigirPermissao('relatorios:ler'), async (req, res) => {
  try {
    const indicadores = await gerarIndicadoresFinanceiros({
      tenantId: tenant(req),
      meses: req.query.meses,
      turma: req.query.turma,
      agora: new Date(),
    });
    return res.json(indicadores);
  } catch (error) {
    console.error('[associacao:indicadores] erro:', error);
    return res.status(500).json({ mensagem: 'Não foi possível gerar os indicadores financeiros.' });
  }
});

router.get('/relatorios/financeiro', exigirPermissao('relatorios:ler'), async (req, res) => {
  const filter = tenantFilter(req);
  if (req.query.inicio || req.query.fim) {
    filter.dataMovimentacao = {};
    if (req.query.inicio) filter.dataMovimentacao.$gte = date(req.query.inicio);
    if (req.query.fim) { const end = date(req.query.fim); end.setHours(23,59,59,999); filter.dataMovimentacao.$lte = end; }
  }
  if (req.query.conta) filter.conta = objectId(req.query.conta, 'Conta');
  if (req.query.projeto) filter.projeto = objectId(req.query.projeto, 'Projeto');
  if (req.query.status) filter.status = req.query.status;
  const rows = await AssociacaoMovimentacao.find(filter).sort({ dataMovimentacao: 1 }).lean();
  const summary = rows.reduce((acc, item) => {
    if (item.status === 'Pago') {
      if (item.tipo === 'Entrada') acc.entradas += item.valor; else acc.saidas += item.valor;
    } else if (item.status !== 'Cancelado') acc.pendente += item.valor;
    return acc;
  }, { entradas: 0, saidas: 0, pendente: 0 });
  summary.resultado = summary.entradas - summary.saidas;
  return res.json({ linhas: rows, resumo: summary, associacao: req.associacao.instituicao });
});

router.get('/auditoria', exigirPermissao('auditoria:ler'), async (req, res) => {
  const filter = { tenantId: tenant(req), modulo: 'associacao' };
  if (req.query.acao) filter.acao = req.query.acao;
  if (req.query.entidade) filter.entidade = req.query.entidade;
  if (req.query.q) { const rx = regex(req.query.q); filter.$or = [{ usuarioNome: rx }, { entidadeNome: rx }, { acao: rx }, { motivo: rx }]; }
  const items = await Log.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return res.json({ logs: items });
});

module.exports = router;
