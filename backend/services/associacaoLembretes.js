'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const AssociacaoContribuicao = require('../models/AssociacaoContribuicao');
const AssociacaoPessoa = require('../models/AssociacaoPessoa');
const AssociacaoLembreteConfig = require('../models/AssociacaoLembreteConfig');
const AssociacaoLembreteEnvio = require('../models/AssociacaoLembreteEnvio');
const Instituicao = require('../models/Instituicao');
const { sendMail } = require('../utils/mailer');
const {
  dateKeyUtc,
  dateKeyInTimezone,
  hourMinuteInTimezone,
  addDaysToKey,
  weekdayFromKey,
  nextAllowedDateKey,
  isAtOrAfterConfiguredTime,
  stageTargetKey,
  chooseEligibleStage,
  preencherTemplate,
} = require('../utils/associacaoReminderRules');

function asId(value) {
  if (!value) return null;
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sanitizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function destinationFor(person, channel) {
  if (channel === 'E-mail') return String(person.email || '').trim().toLowerCase();
  if (channel === 'WhatsApp') return sanitizePhone(person.whatsapp || person.telefone);
  return '';
}

function activeChannels(config) {
  const channels = [];
  if (config.canais?.email !== false) channels.push('E-mail');
  if (config.canais?.whatsapp === true) channels.push('WhatsApp');
  return channels;
}

function automaticKey({ tenantId, contributionId, dueKey, stageCode, channel }) {
  return [tenantId, contributionId, dueKey, stageCode, channel].map(value => String(value).toLowerCase().replace(/\s+/g, '_')).join(':');
}

function manualKey({ tenantId, contributionId, channel }) {
  return `${tenantId}:${contributionId}:manual:${String(channel).toLowerCase()}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
}

async function getOrCreateConfig({ tenantId, actorId = null }) {
  const id = asId(tenantId);
  let config = await AssociacaoLembreteConfig.findOne({ tenantId: id });
  if (config) return config;

  try {
    config = await AssociacaoLembreteConfig.create({
      instituicao: id,
      tenantId: id,
      createdBy: actorId || null,
      updatedBy: actorId || null,
    });
    return config;
  } catch (error) {
    if (error?.code === 11000) return AssociacaoLembreteConfig.findOne({ tenantId: id });
    throw error;
  }
}

async function reserveSend({
  tenantId,
  actorId,
  contribution,
  person,
  stage,
  channel,
  destination,
  subject,
  content,
  origin,
  key,
  config,
  now,
}) {
  const base = {
    instituicao: tenantId,
    tenantId,
    createdBy: actorId || null,
    updatedBy: actorId || null,
    chave: key,
    contribuicao: contribution._id,
    pessoa: person._id,
    etapa: stage.codigo,
    etapaNome: stage.nome,
    origem: origin,
    canal: channel,
    destinatarioNome: person.nome,
    destino: destination,
    assunto: subject,
    conteudo: content,
    referencia: contribution.referencia,
    vencimento: contribution.vencimento,
    vencimentoChave: dateKeyUtc(contribution.vencimento),
    valorPendente: Math.max(Number(contribution.valorPrevisto || 0) - Number(contribution.valorPago || 0), 0),
    status: 'Processando',
    tentativas: 1,
  };

  try {
    return { record: await AssociacaoLembreteEnvio.create(base), acquired: true, retry: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const existing = await AssociacaoLembreteEnvio.findOne({ tenantId, chave: key });
  if (!existing) return { record: null, acquired: false, retry: false };
  if (existing.status === 'Enviado' || existing.status === 'Cancelado') return { record: existing, acquired: false, retry: false };

  const maxAttempts = Number(config.maxTentativas || 3);
  if (Number(existing.tentativas || 0) >= maxAttempts) return { record: existing, acquired: false, retry: false };

  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  const eligible = existing.status === 'Erro'
    ? (!existing.proximaTentativaEm || existing.proximaTentativaEm <= now)
    : existing.status === 'Processando' && existing.updatedAt <= staleBefore;

  if (!eligible) return { record: existing, acquired: false, retry: false };

  const updated = await AssociacaoLembreteEnvio.findOneAndUpdate(
    {
      _id: existing._id,
      tenantId,
      status: existing.status,
      tentativas: existing.tentativas,
    },
    {
      $set: {
        status: 'Processando',
        erro: null,
        proximaTentativaEm: null,
        destino: destination,
        assunto: subject,
        conteudo: content,
        valorPendente: base.valorPendente,
        updatedBy: actorId || null,
      },
      $inc: { tentativas: 1 },
    },
    { new: true }
  );

  return { record: updated || existing, acquired: Boolean(updated), retry: Boolean(updated) };
}

async function sendViaChannel({ channel, destination, subject, content, mensageria }) {
  if (channel === 'E-mail') {
    const sender = mensageria?.sendEmail
      ? mensageria.sendEmail.bind(mensageria)
      : async payload => sendMail(payload);

    const result = await sender({
      to: destination,
      subject,
      text: content,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.65;white-space:pre-line">${escapeHtml(content)}</div>`,
    });

    if (result && result.ok === false) throw new Error(result.erro || 'Falha no envio do e-mail.');
    return {
      provider: result?.provider || result?.details?.providerUsed || 'Axoriin Mailer',
      messageId: result?.messageId || result?.id || null,
    };
  }

  if (channel === 'WhatsApp') {
    if (!mensageria?.sendWhatsApp) {
      throw new Error('Provedor de WhatsApp automático ainda não configurado. Mantenha este canal desativado até concluir a integração.');
    }
    const result = await mensageria.sendWhatsApp({ to: destination, text: content });
    if (!result || result.ok === false) throw new Error(result?.erro || 'Falha no envio por WhatsApp.');
    return { provider: result.provider || 'WhatsApp', messageId: result.messageId || result.id || null };
  }

  throw new Error('Canal de envio inválido.');
}

async function executeReservedSend({ record, channel, destination, subject, content, mensageria, config, actorId, now }) {
  try {
    const providerResult = await sendViaChannel({ channel, destination, subject, content, mensageria });
    record.status = 'Enviado';
    record.enviadoEm = new Date();
    record.erro = null;
    record.proximaTentativaEm = null;
    record.provedor = providerResult.provider || null;
    record.provedorMensagemId = providerResult.messageId || null;
    record.updatedBy = actorId || null;
    await record.save();
    return { ok: true, record };
  } catch (error) {
    record.status = 'Erro';
    record.erro = String(error?.message || error).slice(0, 2000);
    record.proximaTentativaEm = new Date(now.getTime() + Number(config.intervaloTentativasHoras || 6) * 60 * 60 * 1000);
    record.updatedBy = actorId || null;
    await record.save();
    return { ok: false, record, error };
  }
}

function buildContext({ contribution, person, institution }) {
  return {
    nome: person.nome,
    aluno: contribution.alunoNome || person.alunoNome || '',
    turma: contribution.alunoTurma || person.alunoTurma || '',
    referencia: contribution.referencia,
    vencimento: contribution.vencimento,
    valorPrevisto: contribution.valorPrevisto,
    valorPago: contribution.valorPago,
    valorPendente: Math.max(Number(contribution.valorPrevisto || 0) - Number(contribution.valorPago || 0), 0),
    associacao: institution.nomeExibicao || institution.nome,
    sigla: institution.sigla || '',
    email: person.email || '',
    telefone: person.whatsapp || person.telefone || '',
  };
}

async function processOneContribution({ contribution, person, institution, config, todayKey, tenantId, actorId, mensageria, now, manual = false, requestedChannel = null }) {
  const pending = Math.max(Number(contribution.valorPrevisto || 0) - Number(contribution.valorPago || 0), 0);
  if (pending <= 0 || contribution.status === 'Cancelado') return { ignored: true, reason: 'sem_pendencia' };
  if (contribution.lembretesSuspensos === true) return { ignored: true, reason: 'suspenso' };
  if (!person || person.status === 'Inativo') return { ignored: true, reason: 'pessoa_inativa' };
  if (config.somenteAutorizados !== false && person.autorizacaoComunicacao !== true) return { ignored: true, reason: 'nao_autorizado' };

  let stage;
  if (manual) {
    const automaticStage = chooseEligibleStage({ contribution, config, todayKey });
    stage = automaticStage || {
      codigo: 'manual',
      nome: 'Lembrete manual',
      assunto: 'Lembrete de contribuição — {referencia}',
      mensagem: [
        'Olá, {nome}.',
        '',
        'Esta é uma mensagem de lembrete referente à contribuição de {referencia}.',
        'Vencimento: {vencimento}.',
        'Valor pendente: {valor_pendente}.',
        '',
        'Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.',
        '',
        '{associacao}',
      ].join('\n'),
    };
  } else {
    stage = chooseEligibleStage({ contribution, config, todayKey });
    if (!stage) return { ignored: true, reason: 'sem_etapa_elegivel' };
  }

  const channels = requestedChannel ? [requestedChannel] : activeChannels(config);
  if (!channels.length) return { ignored: true, reason: 'sem_canal' };

  const context = buildContext({ contribution, person, institution });
  const subject = preencherTemplate(stage.assunto, context);
  const content = preencherTemplate(stage.mensagem, context);
  const results = [];

  for (const channel of channels) {
    const destination = destinationFor(person, channel);
    if (!destination) {
      results.push({ channel, ignored: true, reason: 'sem_destino' });
      continue;
    }

    const dueKey = dateKeyUtc(contribution.vencimento);
    const key = manual
      ? manualKey({ tenantId, contributionId: contribution._id, channel })
      : automaticKey({ tenantId, contributionId: contribution._id, dueKey, stageCode: stage.codigo, channel });

    const reservation = await reserveSend({
      tenantId,
      actorId,
      contribution,
      person,
      stage,
      channel,
      destination,
      subject,
      content,
      origin: manual ? 'Manual' : 'Automático',
      key,
      config,
      now,
    });

    if (!reservation.acquired) {
      results.push({ channel, duplicate: true, record: reservation.record });
      continue;
    }

    const sent = await executeReservedSend({
      record: reservation.record,
      channel,
      destination,
      subject,
      content,
      mensageria,
      config,
      actorId,
      now,
    });
    results.push({ channel, ...sent });
  }

  return { ignored: false, stage, results };
}

async function processTenantReminders({ tenantId, actorId = null, mensageria = null, forceTime = false, contributionId = null, manual = false, requestedChannel = null, now = new Date() }) {
  const id = asId(tenantId);
  const [config, institution] = await Promise.all([
    getOrCreateConfig({ tenantId: id, actorId }),
    Instituicao.findById(id).select('nome nomeExibicao sigla slug timezone categoriaInstituicao associacaoConfig ativo ativa').lean(),
  ]);

  if (!institution || institution.ativo === false || institution.ativa === false) {
    throw new Error('Associação não encontrada ou inativa.');
  }

  const timezone = institution.timezone || 'America/Rio_Branco';
  const todayKey = dateKeyInTimezone(now, timezone);

  if (!manual && config.ativo !== true) {
    return { skipped: true, reason: 'automacao_desativada', config, institution, summary: { examined: 0, eligible: 0, sent: 0, errors: 0, ignored: 0 } };
  }

  if (!manual && !forceTime && !isAtOrAfterConfiguredTime(now, timezone, config)) {
    return { skipped: true, reason: 'antes_do_horario', config, institution, summary: { examined: 0, eligible: 0, sent: 0, errors: 0, ignored: 0 } };
  }

  const filter = {
    tenantId: id,
    status: { $ne: 'Cancelado' },
    lembretesSuspensos: { $ne: true },
    $expr: { $lt: [{ $ifNull: ['$valorPago', 0] }, '$valorPrevisto'] },
  };
  if (contributionId) filter._id = asId(contributionId);

  const contributions = await AssociacaoContribuicao.find(filter)
    .sort({ vencimento: 1, _id: 1 })
    .limit(manual ? 1 : 5000)
    .lean();

  const personIds = [...new Set(contributions.map(item => String(item.pessoa)).filter(Boolean))].map(asId);
  const people = await AssociacaoPessoa.find({ tenantId: id, _id: { $in: personIds } }).lean();
  const peopleMap = new Map(people.map(person => [String(person._id), person]));

  const summary = { examined: 0, eligible: 0, sent: 0, errors: 0, ignored: 0, duplicates: 0 };
  const details = [];
  const executionLimit = manual ? 1 : Number(config.limitePorExecucao || 200);

  for (const contribution of contributions) {
    if (!manual && (summary.sent + summary.errors) >= executionLimit) break;
    summary.examined += 1;
    const result = await processOneContribution({
      contribution,
      person: peopleMap.get(String(contribution.pessoa)),
      institution,
      config,
      todayKey,
      tenantId: id,
      actorId,
      mensageria,
      now,
      manual,
      requestedChannel,
    });

    if (result.ignored) {
      summary.ignored += 1;
      details.push({ contributionId: contribution._id, ignored: true, reason: result.reason });
      continue;
    }

    summary.eligible += 1;
    for (const item of result.results || []) {
      if (item.ignored) summary.ignored += 1;
      else if (item.duplicate) summary.duplicates += 1;
      else if (item.ok) summary.sent += 1;
      else summary.errors += 1;
    }
    details.push({ contributionId: contribution._id, stage: result.stage?.codigo, results: result.results });
  }

  config.ultimaExecucaoEm = new Date();
  config.ultimaExecucaoResumo = {
    examinadas: summary.examined,
    elegiveis: summary.eligible,
    enviados: summary.sent,
    erros: summary.errors,
    ignorados: summary.ignored,
  };
  config.updatedBy = actorId || config.updatedBy || null;
  await config.save();

  return { skipped: false, config, institution, summary, details };
}

async function processAllActiveAssociations({ mensageria = null, now = new Date() } = {}) {
  const configs = await AssociacaoLembreteConfig.find({ ativo: true }).select('tenantId').lean();
  const summary = { tenants: configs.length, processed: 0, sent: 0, errors: 0, ignored: 0, failures: [] };

  for (const config of configs) {
    try {
      const result = await processTenantReminders({ tenantId: config.tenantId, mensageria, now });
      if (!result.skipped) summary.processed += 1;
      summary.sent += Number(result.summary?.sent || 0);
      summary.errors += Number(result.summary?.errors || 0);
      summary.ignored += Number(result.summary?.ignored || 0);
    } catch (error) {
      summary.failures.push({ tenantId: String(config.tenantId), error: String(error?.message || error) });
    }
  }

  return summary;
}

module.exports = {
  dateKeyUtc,
  dateKeyInTimezone,
  hourMinuteInTimezone,
  addDaysToKey,
  weekdayFromKey,
  nextAllowedDateKey,
  stageTargetKey,
  chooseEligibleStage,
  preencherTemplate,
  getOrCreateConfig,
  processTenantReminders,
  processAllActiveAssociations,
};
