'use strict';

const crypto = require('crypto');

const Aluno = require('../models/Aluno');
const Instituicao = require('../models/Instituicao');
const AccessDevice = require('../models/AccessDevice');
const AccessIdentity = require('../models/AccessIdentity');
const AccessEvent = require('../models/AccessEvent');
const DailyStudentAccess = require('../models/DailyStudentAccess');
const mensageria = require('./mensageria');
const {
  DEFAULT_POLICY,
  getPolicy,
  classifyAccess,
  shouldNotify,
} = require('./accessPolicyService');

const CONTROL_ID_GRANTED_EVENT = 7;

function trim(value, max = 180) {
  const s = String(value ?? '').trim();
  return s.slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOccurredAt(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const n = Number(value);
  if (Number.isFinite(n)) {
    const ms = n < 1e12 ? n * 1000 : n;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dt = new Date(value || Date.now());
  if (!Number.isNaN(dt.getTime())) return dt;
  return new Date();
}

function resolveTimezone(device, instituicao) {
  return trim(device?.configuracao?.timezone || instituicao?.timezone || 'America/Rio_Branco', 80)
    || 'America/Rio_Branco';
}

function schoolContext(occurredAt, timezone, policy = DEFAULT_POLICY, turma = '') {
  return classifyAccess({ occurredAt, timezone, policy, turma });
}

function mappingKey(provider, deviceId, externalUserId) {
  return `${provider}:${deviceId || '*'}:${trim(externalUserId, 120)}`;
}

function makeEventKey(deviceId, event) {
  const externalEventId = trim(event.externalEventId, 120);
  if (externalEventId) return `${deviceId}:${externalEventId}`;

  const seed = [
    deviceId,
    trim(event.externalUserId, 120),
    String(event.eventCode ?? ''),
    normalizeOccurredAt(event.occurredAt).toISOString(),
    trim(event.portalId, 40),
    trim(event.identifierId, 40),
  ].join('|');

  return `${deviceId}:hash:${crypto.createHash('sha256').update(seed).digest('hex')}`;
}

function normalizeNotificationChannels(device) {
  const allowed = new Set(['email', 'whatsapp', 'telegram']);
  const input = Array.isArray(device?.canaisNotificacao) ? device.canaisNotificacao : [];
  const unique = [...new Set(input.map((v) => String(v || '').trim().toLowerCase()).filter((v) => allowed.has(v)))];
  return unique.length ? unique : ['email'];
}

function summarizeChannel(canal, result) {
  if (!result) return { canal, ok: false, provider: null, messageId: null, erro: 'Canal não processado.' };

  const firstSuccess = Array.isArray(result.results)
    ? result.results.find((item) => item?.ok)
    : null;

  return {
    canal,
    ok: Boolean(result.ok),
    provider: trim(result.provider || firstSuccess?.provider || (canal === 'email' ? 'smtp' : canal), 80) || null,
    messageId: trim(result.messageId || result.id || firstSuccess?.messageId || firstSuccess?.id || '', 180) || null,
    erro: trim(result.erro || result.error || '', 450) || null,
  };
}

function classificationLabel(value) {
  return ({
    turno_regular: 'turno regular',
    contraturno: 'contraturno',
    fora_turno: 'fora de turno',
    sem_turno_definido: 'turno da turma ainda não definido',
  })[value] || value;
}

async function findIdentity({ instituicaoId, deviceId, provider, externalUserId }) {
  const keys = [
    mappingKey(provider, deviceId, externalUserId),
    mappingKey(provider, null, externalUserId),
  ];

  return AccessIdentity.findOne({
    instituicao: instituicaoId,
    ativo: { $ne: false },
    mappingKey: { $in: keys },
  })
    .sort({ device: -1 })
    .lean();
}

async function ensureDailyAccess({ instituicaoId, alunoId, deviceId, occurredAt, context }) {
  const filter = {
    instituicao: instituicaoId,
    aluno: alunoId,
    dateKey: context.dateKey,
    turno: context.janela,
  };

  let doc = await DailyStudentAccess.findOne(filter);
  if (!doc) {
    try {
      doc = await DailyStudentAccess.create({
        instituicao: instituicaoId,
        tenantId: instituicaoId,
        aluno: alunoId,
        dateKey: context.dateKey,
        turno: context.janela,
        turnoRegularAluno: context.turnoRegularAluno || null,
        classificacao: context.classificacao,
        attendanceEligible: Boolean(context.attendanceEligible),
        firstEntryAt: occurredAt,
        lastSeenAt: occurredAt,
        detectionCount: 1,
        firstDevice: deviceId,
        lastDevice: deviceId,
      });
      return doc;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      doc = await DailyStudentAccess.findOne(filter);
    }
  }

  if (!doc) throw new Error('Não foi possível consolidar a entrada do aluno.');

  if (!doc.firstEntryAt || occurredAt < doc.firstEntryAt) {
    doc.firstEntryAt = occurredAt;
    doc.firstDevice = deviceId;
  }
  if (!doc.lastSeenAt || occurredAt >= doc.lastSeenAt) {
    doc.lastSeenAt = occurredAt;
    doc.lastDevice = deviceId;
  }
  doc.turnoRegularAluno = context.turnoRegularAluno || null;
  doc.classificacao = context.classificacao;
  doc.attendanceEligible = Boolean(context.attendanceEligible);
  doc.detectionCount = Number(doc.detectionCount || 0) + 1;
  await doc.save();

  return doc;
}

async function sendEntryNotification({ aluno, instituicao, device, daily, context, force = false }) {
  if (!device?.notificarResponsavel) {
    return { attempted: false, reason: 'Notificações desativadas no dispositivo.' };
  }

  if (!force) {
    const claimed = await DailyStudentAccess.findOneAndUpdate(
      {
        _id: daily._id,
        'notificacao.tentada': { $ne: true },
      },
      {
        $set: {
          'notificacao.tentada': true,
          'notificacao.tentadaEm': new Date(),
        },
        $inc: { 'notificacao.tentativas': 1 },
      },
      { new: true }
    );

    if (!claimed) {
      return {
        attempted: false,
        duplicateSuppressed: true,
        reason: `Notificação já tratada para a janela ${context.janelaLabel || context.janela}.`,
      };
    }
    daily = claimed;
  } else {
    daily = await DailyStudentAccess.findByIdAndUpdate(
      daily._id,
      {
        $set: {
          'notificacao.tentada': true,
          'notificacao.tentadaEm': new Date(),
        },
        $inc: { 'notificacao.tentativas': 1 },
      },
      { new: true }
    );
  }

  const institutionName = trim(
    instituicao?.nomeExibicao || instituicao?.nome || instituicao?.sigla || 'instituição de ensino',
    180
  );

  const gateName = trim(device?.local || device?.nome || 'acesso principal', 180);
  const studentName = trim(aluno?.nome || 'Estudante', 180);
  const classText = classificationLabel(context.classificacao);

  const titulo = `Entrada registrada — ${institutionName}`;
  const texto = [
    `Informamos que ${studentName} teve sua entrada registrada em ${institutionName}.`,
    `Data: ${context.dateLabel}`,
    `Horário: ${context.timeLabel}`,
    `Acesso: ${gateName}`,
    `Classificação interna: ${classText}`,
    '',
    'Este registro confirma a entrada no colégio e não substitui a confirmação de presença em sala pelo professor.',
  ].join('\n');

  const requestedChannels = normalizeNotificationChannels(device);
  const canais = [];

  // Email/Telegram usam a mensageria unificada.
  // WhatsApp de acesso é tratado separadamente para respeitar a regra do Axoriin:
  // usar EXCLUSIVAMENTE aluno.contatos.whatsapp, sem fallback para telefone,
  // telefoneResponsavel ou whatsappOriginal.
  const nonWhatsappChannels = requestedChannels.filter((canal) => canal !== 'whatsapp');

  if (nonWhatsappChannels.length) {
    let resultado;
    try {
      resultado = await mensageria.enfileirarParaResponsaveis({
        alunoId: aluno._id,
        instituicao: instituicao._id,
        preferenciaCanais: nonWhatsappChannels,
        titulo,
        texto,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.55">
          <p>Informamos que <strong>${escapeHtml(studentName)}</strong> teve sua entrada registrada em <strong>${escapeHtml(institutionName)}</strong>.</p>
          <p><strong>Data:</strong> ${escapeHtml(context.dateLabel)}<br>
          <strong>Horário:</strong> ${escapeHtml(context.timeLabel)}<br>
          <strong>Acesso:</strong> ${escapeHtml(gateName)}</p>
          <p style="color:#555">Este registro confirma a entrada no colégio e não substitui a confirmação de presença em sala pelo professor.</p>
        </div>`,
        meta: {
          tipo: 'ACESSO_ESCOLAR',
          accessDailyId: String(daily._id),
          accessClassification: context.classificacao,
          accessWindow: context.janela,
        },
      });
    } catch (err) {
      resultado = { ok: false, resultados: {}, erro: err?.message || String(err) };
    }

    for (const canal of nonWhatsappChannels) {
      const raw = resultado?.resultados?.[canal];
      if (raw) {
        canais.push(summarizeChannel(canal, raw));
      } else {
        canais.push({
          canal,
          ok: false,
          provider: canal === 'email' ? 'smtp' : canal,
          messageId: null,
          erro: trim(resultado?.erro || 'Canal solicitado, mas sem retorno da mensageria.', 450),
        });
      }
    }
  }

  if (requestedChannels.includes('whatsapp')) {
    const whatsapp = trim(aluno?.contatos?.whatsapp, 40);

    if (!whatsapp) {
      canais.push({
        canal: 'whatsapp',
        ok: false,
        provider: 'twilio',
        messageId: null,
        erro: 'contatos.whatsapp não informado. Nenhum outro campo de telefone foi utilizado.',
      });
    } else if (aluno?.contatos?.whatsappValido === false) {
      canais.push({
        canal: 'whatsapp',
        ok: false,
        provider: 'twilio',
        messageId: null,
        erro: trim(aluno?.contatos?.whatsappErro || 'contatos.whatsapp marcado como inválido.', 450),
      });
    } else {
      try {
        const wa = await mensageria.enviarWhatsAppDireto({
          to: whatsapp,
          text: texto,
          contentSid: process.env.TWILIO_WHATSAPP_ACESSO_CONTENT_SID || undefined,
          contentVariables: {
            1: institutionName,
            2: studentName,
            3: context.dateLabel,
            4: context.timeLabel,
            5: gateName,
          },
          templateKey: 'ACESSO_ESCOLAR',
          meta: {
            tipo: 'ACESSO_ESCOLAR',
            accessDailyId: String(daily._id),
            accessClassification: context.classificacao,
            accessWindow: context.janela,
          },
        });
        canais.push(summarizeChannel('whatsapp', wa));
      } catch (err) {
        canais.push({
          canal: 'whatsapp',
          ok: false,
          provider: 'twilio',
          messageId: null,
          erro: trim(err?.message || String(err), 450),
        });
      }
    }
  }

  // O envio geral é considerado bem-sucedido se pelo menos um canal solicitado
  // tiver êxito. Falhas parciais continuam preservadas em notificacao.canais.
  const ok = canais.some((canal) => canal.ok);

  await DailyStudentAccess.updateOne(
    { _id: daily._id },
    {
      $set: {
        'notificacao.ok': ok,
        'notificacao.enviadaEm': ok ? new Date() : null,
        'notificacao.canais': canais,
      },
    }
  );

  return {
    attempted: true,
    ok,
    canais,
  };
}

async function processSingleEvent({
  device,
  event,
  source = 'bridge',
  alunoOverride = null,
  allowNotify = true,
  forceNotification = false,
}) {
  const instituicaoId = device.instituicao;
  const eventCode = toNumberOrNull(event.eventCode);
  const externalUserId = trim(event.externalUserId, 120);

  if (eventCode !== CONTROL_ID_GRANTED_EVENT || !externalUserId || externalUserId === '0') {
    return { ignored: true, reason: 'Evento não representa acesso concedido de usuário identificado.' };
  }

  const configuredDeviceId = trim(device?.externalDeviceId, 120);
  const receivedDeviceId = trim(event?.externalDeviceId, 120);
  if (configuredDeviceId && receivedDeviceId && configuredDeviceId !== receivedDeviceId) {
    return {
      ignored: true,
      reason: 'device_id recebido não corresponde ao dispositivo autenticado no Axoriin.',
      deviceMismatch: true,
    };
  }

  const instituicao = await Instituicao.findById(instituicaoId)
    .select('nome nomeExibicao sigla timezone')
    .lean();

  if (!instituicao) throw new Error('Instituição do dispositivo não encontrada.');

  const occurredAt = normalizeOccurredAt(event.occurredAt);
  const timezone = resolveTimezone(device, instituicao);
  const policy = await getPolicy(instituicaoId);
  const direction = device.tipoUso === 'saida' ? 'saida' : 'entrada';

  if (direction !== 'entrada') {
    return { ignored: true, reason: 'Dispositivo configurado apenas como saída.' };
  }

  let aluno = alunoOverride;
  let identity = null;

  if (!aluno) {
    identity = await findIdentity({
      instituicaoId,
      deviceId: String(device._id),
      provider: 'controlid',
      externalUserId,
    });

    if (identity) {
      aluno = await Aluno.findOne({ _id: identity.aluno, instituicao: instituicaoId })
        .select('_id nome turma instituicao contatos telefone')
        .lean();
    }
  }

  const context = schoolContext(occurredAt, timezone, policy, aluno?.turma || '');

  const eventKey = makeEventKey(String(device._id), {
    ...event,
    eventCode,
    occurredAt,
    externalUserId,
  });

  const eventDoc = {
    instituicao: instituicaoId,
    tenantId: instituicaoId,
    device: device._id,
    aluno: aluno?._id || null,
    eventKey,
    externalEventId: trim(event.externalEventId, 120) || null,
    externalUserId,
    externalDeviceId: receivedDeviceId || configuredDeviceId || null,
    occurredAt,
    eventCode,
    identifierId: trim(event.identifierId, 60) || null,
    portalId: trim(event.portalId, 60) || null,
    confidence: toNumberOrNull(event.confidence),
    direction,
    source,
    status: aluno ? 'reconhecido' : 'nao_vinculado',
    alunoSnapshot: aluno ? { nome: aluno.nome || '', turma: aluno.turma || '' } : {},
  };

  let accessEvent;
  try {
    accessEvent = await AccessEvent.create(eventDoc);
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await AccessEvent.findOne({ instituicao: instituicaoId, eventKey }).lean();
      return { duplicate: true, event: existing || null };
    }
    throw err;
  }

  await AccessDevice.updateOne(
    { _id: device._id },
    {
      $set: {
        lastSeenAt: new Date(),
        lastEventAt: occurredAt,
        ...(receivedDeviceId && !device.externalDeviceId
          ? { externalDeviceId: receivedDeviceId }
          : {}),
      },
    }
  );

  if (!aluno) {
    return {
      ok: true,
      unlinked: true,
      event: accessEvent.toObject(),
      externalUserId,
    };
  }

  const daily = await ensureDailyAccess({
    instituicaoId,
    alunoId: aluno._id,
    deviceId: device._id,
    occurredAt,
    context,
  });

  let notification = { attempted: false, reason: 'Envio não solicitado.' };
  const policyAllowsNotify = shouldNotify(policy, context.classificacao);
  if (allowNotify && policyAllowsNotify) {
    notification = await sendEntryNotification({
      aluno,
      instituicao,
      device,
      daily,
      context,
      force: forceNotification,
    });

    if (notification.attempted) {
      await AccessEvent.updateOne(
        { _id: accessEvent._id },
        {
          $set: {
            'notificacao.tentada': true,
            'notificacao.ok': Boolean(notification.ok),
            'notificacao.tentadaEm': new Date(),
            'notificacao.canais': notification.canais || [],
          },
        }
      );
    }
  } else if (allowNotify && !policyAllowsNotify) {
    notification = { attempted: false, reason: `Notificação desativada para ${classificationLabel(context.classificacao)}.` };
  }

  return {
    ok: true,
    eventId: String(accessEvent._id),
    aluno: { _id: aluno._id, nome: aluno.nome, turma: aluno.turma },
    dailyId: String(daily._id),
    context,
    notification,
  };
}

function extractControlIdEvents(body = {}) {
  const changes = Array.isArray(body?.object_changes) ? body.object_changes : [];
  const result = [];

  for (const change of changes) {
    if (String(change?.object || '') !== 'access_logs') continue;
    if (String(change?.type || '').toLowerCase() !== 'inserted') continue;

    const values = change?.values || {};
    result.push({
      externalEventId: values.id,
      occurredAt: values.time,
      eventCode: values.event,
      externalDeviceId: values.device_id || body.device_id,
      externalUserId: values.user_id,
      identifierId: values.identifier_id,
      portalId: values.portal_id,
      confidence: values.confidence,
    });
  }

  if (!result.length && body?.access_event) {
    const values = body.access_event || {};
    result.push({
      externalEventId: values.id || values.externalEventId,
      occurredAt: values.time || values.occurredAt,
      eventCode: values.event || values.eventCode,
      externalDeviceId: values.device_id || values.externalDeviceId || body.device_id,
      externalUserId: values.user_id || values.externalUserId,
      identifierId: values.identifier_id || values.identifierId,
      portalId: values.portal_id || values.portalId,
      confidence: values.confidence,
    });
  }

  return result;
}

async function processControlIdPayload({ device, body }) {
  if (body && Object.prototype.hasOwnProperty.call(body, 'access_photo')) {
    return { ok: true, ignoredPhotoPayload: true, processed: 0, ignored: 1, results: [] };
  }

  const events = extractControlIdEvents(body);
  const results = [];

  for (const event of events) {
    const result = await processSingleEvent({
      device,
      event,
      source: 'controlid_monitor',
      allowNotify: true,
    });
    results.push(result);
  }

  return {
    ok: true,
    processed: results.filter((r) => r?.ok && !r?.duplicate).length,
    duplicates: results.filter((r) => r?.duplicate).length,
    unlinked: results.filter((r) => r?.unlinked).length,
    ignored: results.filter((r) => r?.ignored).length,
    results,
  };
}

async function retryDailyNotification({ dailyId, instituicaoId }) {
  const daily = await DailyStudentAccess.findOne({ _id: dailyId, instituicao: instituicaoId });
  if (!daily) return { ok: false, status: 404, message: 'Registro de acesso não encontrado.' };

  const aluno = await Aluno.findOne({ _id: daily.aluno, instituicao: instituicaoId })
    .select('_id nome turma instituicao contatos telefone')
    .lean();

  const device = await AccessDevice.findOne({
    _id: daily.lastDevice || daily.firstDevice,
    instituicao: instituicaoId,
  }).lean();

  const instituicao = await Instituicao.findById(instituicaoId)
    .select('nome nomeExibicao sigla timezone')
    .lean();

  if (!aluno || !device || !instituicao) {
    return { ok: false, status: 409, message: 'Aluno, dispositivo ou instituição não disponível para reenvio.' };
  }

  const policy = await getPolicy(instituicaoId);
  const context = schoolContext(daily.firstEntryAt, resolveTimezone(device, instituicao), policy, aluno.turma);
  const notification = await sendEntryNotification({
    aluno,
    instituicao,
    device,
    daily,
    context,
    force: true,
  });

  return { ok: true, notification, context };
}

module.exports = {
  CONTROL_ID_GRANTED_EVENT,
  schoolContext,
  mappingKey,
  makeEventKey,
  extractControlIdEvents,
  processSingleEvent,
  processControlIdPayload,
  retryDailyNotification,
};
