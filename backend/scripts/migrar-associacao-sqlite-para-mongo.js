#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const initSqlJs = require('sql.js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Instituicao = require('../models/Instituicao');
const Usuario = require('../models/Usuario');
const Pessoa = require('../models/AssociacaoPessoa');
const Conta = require('../models/AssociacaoConta');
const Categoria = require('../models/AssociacaoCategoria');
const Projeto = require('../models/AssociacaoProjeto');
const Movimentacao = require('../models/AssociacaoMovimentacao');
const Contribuicao = require('../models/AssociacaoContribuicao');
const Pagamento = require('../models/AssociacaoPagamento');
const Recibo = require('../models/AssociacaoRecibo');
const Patrimonio = require('../models/AssociacaoPatrimonio');
const Documento = require('../models/AssociacaoDocumento');
const Anexo = require('../models/AssociacaoAnexo');
const MensagemModelo = require('../models/AssociacaoMensagemModelo');
const Campanha = require('../models/AssociacaoCampanha');
const MensagemFila = require('../models/AssociacaoMensagemFila');
const { uploadBufferToS3 } = require('../services/s3');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const next = process.argv[index + 1];
  return !next || next.startsWith('--') ? true : next;
}
function asDate(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function yes(value) { return Number(value) === 1 || value === true || String(value).toLowerCase() === 'true'; }
function clean(value) { const v = String(value ?? '').trim(); return v || null; }
function enumValue(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function parseJson(value, fallback = {}) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

function rows(db, table) {
  const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table.replaceAll("'", "''")}'`);
  if (!exists.length || !exists[0].values.length) return [];
  const result = db.exec(`SELECT * FROM ${table}`);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(valuesRow => Object.fromEntries(columns.map((column, index) => [column, valuesRow[index]])));
}

async function upsertLegacy(Model, tenantId, legacyId, data, dryRun) {
  if (dryRun) return { _id: new mongoose.Types.ObjectId(), ...data, legacyId: String(legacyId) };
  return Model.findOneAndUpdate(
    { tenantId, legacyId: String(legacyId) },
    { $set: data, $setOnInsert: { instituicao: tenantId, tenantId, legacyId: String(legacyId) } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function storeAttachment({ row, tenantId, entityId, entityType, actorId, dryRun }) {
  const base64 = String(row.file_data || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const safeName = path.basename(row.original_name || `anexo-${row.id}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const key = `associacoes/${tenantId}/migracao/${Date.now()}-${row.id}-${safeName}`;
  let url = 'protected';
  let storageProvider = 'local';
  let storageKey = path.join(String(tenantId), 'migracao', path.basename(key));

  if (!dryRun) {
    if (process.env.AWS_BUCKET_NAME && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      await uploadBufferToS3({ buffer, key, contentType: row.mime_type || 'application/octet-stream' });
      storageProvider = 's3'; storageKey = key;
    } else {
      const dir = path.join(__dirname, '..', 'uploads', 'associacoes', String(tenantId), 'migracao');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, path.basename(key)), buffer);
    }
  }

  const doc = await upsertLegacy(Anexo, tenantId, row.id, {
    entidadeTipo: entityType,
    entidadeId: entityId,
    entidadeNome: clean(row.entity_label),
    nomeOriginal: row.original_name || safeName,
    mimeType: row.mime_type || 'application/octet-stream',
    extensao: clean(row.extension) || path.extname(safeName).toLowerCase(),
    tamanhoBytes: num(row.size_bytes, buffer.length),
    descricao: clean(row.description), storageProvider, storageKey, url,
    status: row.status === 'Removido' ? 'Removido' : 'Ativo',
    motivoRemocao: clean(row.removed_reason), removidoEm: asDate(row.removed_at),
    createdBy: actorId, updatedBy: actorId,
    createdAt: asDate(row.created_at) || new Date(), updatedAt: asDate(row.updated_at) || new Date(),
  }, dryRun);
  if (!dryRun) {
    doc.url = `/api/associacao/anexos/${doc._id}/arquivo`;
    await doc.save();
  }
  return doc;
}

async function main() {
  const sqlitePath = path.resolve(String(arg('sqlite') || ''));
  const slug = String(arg('slug') || '').trim().toLowerCase();
  const dryRun = Boolean(arg('dry-run', false));
  if (!sqlitePath || !fs.existsSync(sqlitePath)) throw new Error('Informe um arquivo existente com --sqlite "caminho\\banco.sqlite".');
  if (!slug) throw new Error('Informe o tenant com --slug apacmdpii-czs.');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI não configurada.');

  console.log(`\nAxoriin Associações — migração ${dryRun ? '(SIMULAÇÃO)' : '(EXECUÇÃO)'}`);
  console.log('SQLite:', sqlitePath);
  console.log('Tenant:', slug);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, maxPoolSize: 5, family: 4 });
  const institution = await Instituicao.findOne({ slug });
  if (!institution) throw new Error(`Tenant "${slug}" não encontrado.`);
  const moduleActive = institution.categoriaInstituicao === 'associacao' || institution.associacaoConfig?.ativo || institution.modulosAtivos?.includes('associacao');
  if (!moduleActive) throw new Error('O módulo associação não está ativo neste tenant.');
  const actor = await Usuario.findOne({ tenantId: institution._id, 'acessosModulos.associacao.ativo': true }).sort({ createdAt: 1 });
  if (!actor) throw new Error('Crie primeiro o usuário presidente no tenant da associação.');

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(sqlitePath));
  const tenantId = institution._id;
  const actorId = actor._id;
  const maps = { people: new Map(), accounts: new Map(), categories: new Map(), projects: new Map(), movements: new Map(), contributions: new Map(), assets: new Map(), documents: new Map(), campaigns: new Map() };
  const sourcePeopleById = new Map(rows(db, 'people').map(item => [Number(item.id), item]));
  const counts = {};

  async function migrate(table, callback) {
    const items = rows(db, table); counts[table] = { origem: items.length, migrados: 0, erros: [] };
    for (const row of items) {
      try { await callback(row); counts[table].migrados += 1; }
      catch (error) { counts[table].erros.push({ id: row.id, erro: error.message }); }
    }
    console.log(`${table}: ${counts[table].migrados}/${items.length}${counts[table].erros.length ? ` (${counts[table].erros.length} erro(s))` : ''}`);
  }

  const common = row => ({ createdBy: actorId, updatedBy: actorId, createdAt: asDate(row.created_at) || new Date(), updatedAt: asDate(row.updated_at) || new Date() });

  await migrate('people', async row => {
    const doc = await upsertLegacy(Pessoa, tenantId, row.id, {
      nome: row.name, tipo: enumValue(row.type, ['Pai/Responsável','Associado','Parceiro','Fornecedor','Colaborador','Doador','Outro'], 'Outro'),
      cpfCnpj: clean(row.cpf_cnpj), telefone: clean(row.phone), whatsapp: clean(row.phone), email: clean(row.email), endereco: clean(row.address),
      alunoNome: clean(row.student_name), alunoTurma: clean(row.student_class), dataNascimento: asDate(row.birth_date),
      canalPreferido: enumValue(row.preferred_channel, ['WhatsApp','E-mail','SMS','Nenhum'], 'WhatsApp'),
      autorizacaoComunicacao: yes(row.communication_consent), autorizaAniversario: yes(row.allow_birthday),
      autorizaDatasComemorativas: yes(row.allow_commemorative), autorizaNoticiasAssociacao: yes(row.allow_association_news),
      status: row.status === 'Inativo' ? 'Inativo' : 'Ativo', observacoes: clean(row.notes), ...common(row),
    }, dryRun); maps.people.set(Number(row.id), doc._id);
  });

  await migrate('accounts', async row => {
    const data = {
      nome: row.name, tipo: enumValue(row.type, ['Caixa','Banco','PIX','Poupança','Fundo','Outro'], 'Outro'), saldoInicial: num(row.initial_balance),
      status: row.status === 'Inativo' ? 'Inativo' : 'Ativo', observacoes: clean(row.notes), ...common(row),
    };
    let doc;
    if (!dryRun) {
      const existing = await Conta.findOne({ tenantId, nome: row.name });
      doc = existing
        ? await Conta.findByIdAndUpdate(existing._id, { $set: { ...data, legacyId: String(row.id), updatedBy: actorId } }, { new: true, runValidators: true })
        : await upsertLegacy(Conta, tenantId, row.id, data, false);
    } else doc = await upsertLegacy(Conta, tenantId, row.id, data, true);
    maps.accounts.set(Number(row.id), doc._id);
  });

  await migrate('categories', async row => {
    const type = enumValue(row.transaction_type, ['Entrada','Saída','Ambos'], 'Ambos');
    const data = { nome: row.name, tipoMovimentacao: type, status: row.status === 'Inativo' ? 'Inativo' : 'Ativo', ...common(row) };
    let doc;
    if (!dryRun) {
      const existing = await Categoria.findOne({ tenantId, nome: row.name, tipoMovimentacao: type });
      doc = existing
        ? await Categoria.findByIdAndUpdate(existing._id, { $set: { ...data, legacyId: String(row.id), updatedBy: actorId } }, { new: true, runValidators: true })
        : await upsertLegacy(Categoria, tenantId, row.id, data, false);
    } else doc = await upsertLegacy(Categoria, tenantId, row.id, data, true);
    maps.categories.set(`${row.name}|${row.transaction_type}`, doc._id); if (!maps.categories.has(row.name)) maps.categories.set(row.name, doc._id);
  });

  await migrate('projects', async row => {
    const doc = await upsertLegacy(Projeto, tenantId, row.id, {
      nome: row.name, tipo: enumValue(row.project_type, ['Projeto','Campanha','Evento','Rifa','Reforma','Aquisição','Outro'], 'Outro'), descricao: clean(row.description),
      dataInicio: asDate(row.start_date), dataFim: asDate(row.end_date), metaArrecadacao: num(row.goal_amount), orcamentoPrevisto: num(row.budget_amount),
      responsavelNome: clean(row.responsible_name), status: enumValue(row.status, ['Planejamento','Ativo','Concluído','Suspenso','Cancelado'], 'Planejamento'), observacoes: clean(row.notes), ...common(row),
    }, dryRun); maps.projects.set(Number(row.id), doc._id);
  });

  await migrate('transactions', async row => {
    const categoryId = maps.categories.get(`${row.category}|${row.type}`) || maps.categories.get(`${row.category}|Ambos`) || maps.categories.get(row.category) || null;
    const doc = await upsertLegacy(Movimentacao, tenantId, row.id, {
      dataMovimentacao: asDate(row.transaction_date) || new Date(), tipo: row.type === 'Saída' ? 'Saída' : 'Entrada',
      status: enumValue(row.status, ['Pago','Pendente','Previsto','Atrasado','Cancelado'], 'Pago'), pessoa: maps.people.get(Number(row.person_id)) || null,
      pessoaNome: clean(row.person_name), alunoNome: clean(row.student_name), alunoTurma: clean(sourcePeopleById.get(Number(row.person_id))?.student_class), descricao: row.description,
      categoria: categoryId, categoriaNome: row.category || 'Outros', conta: maps.accounts.get(Number(row.account_id)) || null,
      projeto: maps.projects.get(Number(row.project_id)) || null, formaPagamento: clean(row.payment_method), valor: num(row.amount), observacoes: clean(row.notes),
      origemTipo: clean(row.source_type), origemId: row.source_id == null ? null : String(row.source_id), grupoRecorrencia: clean(row.recurrence_group),
      parcelaNumero: row.installment_number == null ? null : num(row.installment_number), parcelaTotal: row.installment_total == null ? null : num(row.installment_total),
      cancelamento: { motivo: clean(row.cancellation_reason), canceladoEm: asDate(row.cancelled_at), canceladoPor: row.cancelled_at ? actorId : null }, ...common(row),
    }, dryRun); maps.movements.set(Number(row.id), doc._id);
  });

  await migrate('contributions', async row => {
    const personId = maps.people.get(Number(row.person_id)); if (!personId) throw new Error('Pessoa vinculada não migrada.');
    const personRow = sourcePeopleById.get(Number(row.person_id));
    const doc = await upsertLegacy(Contribuicao, tenantId, row.id, {
      pessoa: personId, responsavelNome: personRow?.name || 'Responsável', alunoNome: clean(row.student_name), alunoTurma: clean(row.student_class),
      referencia: row.reference_month, vencimento: asDate(row.due_date) || new Date(), valorPrevisto: num(row.expected_amount), valorPago: num(row.paid_amount),
      status: enumValue(row.status, ['Pendente','Parcial','Em dia','Atrasado','Cancelado'], 'Pendente'), observacoes: clean(row.notes), ...common(row),
    }, dryRun); maps.contributions.set(Number(row.id), doc._id);
  });

  await migrate('receipts', async row => {
    const movementId = maps.movements.get(Number(row.transaction_id)); if (!movementId) throw new Error('Movimentação vinculada não migrada.');
    await upsertLegacy(Recibo, tenantId, row.id, {
      numero: row.receipt_number, movimentacao: movementId, pessoa: maps.people.get(Number(row.person_id)) || null, pagadorNome: row.payer_name,
      valor: num(row.amount), dataRecibo: asDate(row.receipt_date) || new Date(), finalidade: row.purpose, formaPagamento: clean(row.payment_method),
      status: row.status === 'Cancelado' ? 'Cancelado' : 'Ativo', motivoCancelamento: clean(row.cancellation_reason), ...common(row),
    }, dryRun);
  });

  await migrate('assets', async row => {
    const doc = await upsertLegacy(Patrimonio, tenantId, row.id, {
      codigo: row.asset_code, nome: row.name, categoria: clean(row.category), descricao: clean(row.description), dataAquisicao: asDate(row.acquisition_date),
      valorAquisicao: num(row.acquisition_value), origem: enumValue(row.source_type, ['Compra','Doação','Parceria','Campanha','Outro'], 'Outro'),
      localizacao: clean(row.location), responsavelNome: clean(row.responsible_name), estadoConservacao: enumValue(row.condition_status, ['Novo','Bom','Regular','Ruim','Inservível'], 'Bom'),
      status: enumValue(row.status, ['Em uso','Em estoque','Cedido à escola','Em manutenção','Baixado'], 'Em uso'), projeto: maps.projects.get(Number(row.project_id)) || null,
      observacoes: clean(row.notes), ...common(row),
    }, dryRun); maps.assets.set(Number(row.id), doc._id);
  });

  await migrate('documents', async row => {
    const doc = await upsertLegacy(Documento, tenantId, row.id, {
      titulo: row.title, tipo: enumValue(row.document_type, ['Estatuto','Ata','Certidão','Contrato','Prestação de contas','Nota fiscal','Comprovante','Outro'], 'Outro'),
      numeroReferencia: clean(row.document_number), dataEmissao: asDate(row.issue_date), dataValidade: asDate(row.expiry_date), responsavelNome: clean(row.responsible_name),
      status: enumValue(row.status, ['Vigente','Vencido','Arquivado','Cancelado'], 'Vigente'), observacoes: clean(row.notes), ...common(row),
    }, dryRun); maps.documents.set(Number(row.id), doc._id);
  });

  await migrate('message_templates', async row => {
    const data = {
      nome: row.name, evento: enumValue(row.event_type, ['Aniversário','Natal','Ano-Novo','Dia das Mães','Dia dos Pais','Boas-vindas','Comunicado','Outro'], 'Outro'),
      canal: enumValue(row.channel, ['E-mail','WhatsApp','SMS'], 'E-mail'), conteudo: row.content, status: row.status === 'Inativo' ? 'Inativo' : 'Ativo', ...common(row),
    };
    if (!dryRun) {
      const existing = await MensagemModelo.findOne({ tenantId, nome: row.name });
      if (existing) await MensagemModelo.findByIdAndUpdate(existing._id, { $set: { ...data, legacyId: String(row.id), updatedBy: actorId } }, { new: true, runValidators: true });
      else await upsertLegacy(MensagemModelo, tenantId, row.id, data, false);
    } else await upsertLegacy(MensagemModelo, tenantId, row.id, data, true);
  });

  await migrate('campaigns', async row => {
    const filter = parseJson(row.audience_filter, {});
    const doc = await upsertLegacy(Campanha, tenantId, row.id, {
      titulo: row.title, evento: clean(row.event_type) || 'Comunicado', canal: enumValue(row.channel, ['E-mail','WhatsApp','SMS'], 'E-mail'),
      conteudo: row.content || '', agendadaPara: asDate(row.scheduled_at), publico: { tipos: filter.tipos || [], turmas: filter.turmas || [], apenasAutorizados: filter.apenasAutorizados !== false, apenasAniversariantes: Boolean(filter.apenasAniversariantes) },
      status: enumValue(row.status, ['Rascunho','Preparada','Programada','Em processamento','Concluída','Cancelada'], 'Rascunho'), ...common(row),
    }, dryRun); maps.campaigns.set(Number(row.id), doc._id);
  });

  await migrate('message_queue', async row => {
    const campaignId = maps.campaigns.get(Number(row.campaign_id)); if (!campaignId) throw new Error('Campanha vinculada não migrada.');
    await upsertLegacy(MensagemFila, tenantId, row.id, {
      campanha: campaignId, pessoa: maps.people.get(Number(row.person_id)) || null, destino: row.destination || 'sem-destino',
      canal: enumValue(row.channel, ['E-mail','WhatsApp','SMS'], 'E-mail'), conteudo: row.content || '',
      status: ({'Aguardando conexão':'Pendente','Programada':'Pendente','Enviada':'Enviada','Erro':'Erro','Cancelada':'Cancelada'})[row.status] || 'Pendente',
      provedorMensagemId: clean(row.provider_message_id), erro: clean(row.error_message), agendadaPara: asDate(row.scheduled_at), enviadaEm: asDate(row.sent_at), ...common(row),
    }, dryRun);
  });

  await migrate('attachments', async row => {
    const mapping = {
      transactions: ['movements', 'movimentacao'],
      projects: ['projects', 'projeto'],
      assets: ['assets', 'patrimonio'],
      documents: ['documents', 'documento'],
      people: ['people', 'pessoa'],
      movimentacao: ['movements', 'movimentacao'],
      projeto: ['projects', 'projeto'],
      patrimonio: ['assets', 'patrimonio'],
      documento: ['documents', 'documento'],
      pessoa: ['people', 'pessoa'],
    }[row.entity_type];
    const mapName = mapping?.[0];
    const entityType = mapping?.[1];
    const entityId = mapName ? maps[mapName].get(Number(row.entity_id)) : null;
    if (!entityId || !entityType) throw new Error(`Registro ou tipo vinculado não migrado: ${row.entity_type}.`);
    await storeAttachment({ row, tenantId, entityId, entityType, actorId, dryRun });
  });

  // Reconstrói pagamentos a partir das movimentações de origem contribuição_pagamento.
  const transactionRows = rows(db, 'transactions').filter(row => row.source_type === 'contribution_payment' && row.source_id);
  counts.payments_rebuilt = { origem: transactionRows.length, migrados: 0, erros: [] };
  for (const row of transactionRows) {
    try {
      const contributionId = maps.contributions.get(Number(row.source_id)); const movementId = maps.movements.get(Number(row.id)); const personId = maps.people.get(Number(row.person_id));
      if (!contributionId || !movementId || !personId) throw new Error('Vínculos insuficientes.');
      await upsertLegacy(Pagamento, tenantId, `transaction-${row.id}`, {
        contribuicao: contributionId, pessoa: personId, movimentacao: movementId, conta: maps.accounts.get(Number(row.account_id)) || null,
        valor: num(row.amount), dataPagamento: asDate(row.transaction_date) || new Date(), formaPagamento: clean(row.payment_method), ...common(row),
      }, dryRun); counts.payments_rebuilt.migrados += 1;
    } catch (error) { counts.payments_rebuilt.erros.push({ id: row.id, erro: error.message }); }
  }
  console.log(`payments_rebuilt: ${counts.payments_rebuilt.migrados}/${transactionRows.length}`);

  db.close();
  const reportPath = path.resolve(`relatorio-migracao-associacao-${slug}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  const report = { dryRun, tenant: { id: String(tenantId), slug, nome: institution.nome }, sqlitePath, generatedAt: new Date().toISOString(), counts };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nRelatório:', reportPath);
  const totalErrors = Object.values(counts).reduce((sum, item) => sum + (item.erros?.length || 0), 0);
  console.log(totalErrors ? `Concluído com ${totalErrors} erro(s). Consulte o relatório.` : 'Migração concluída sem erros registrados.');
  await mongoose.disconnect();
  process.exitCode = totalErrors ? 2 : 0;
}

main().catch(async error => {
  console.error('\nERRO FATAL:', error.message);
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => null);
  process.exit(1);
});
