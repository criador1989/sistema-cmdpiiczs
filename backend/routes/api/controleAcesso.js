'use strict';

const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const net = require('net');
const { DateTime } = require('luxon');

const router = express.Router();

const Aluno = require('../../models/Aluno');
const Instituicao = require('../../models/Instituicao');
const AccessDevice = require('../../models/AccessDevice');
const AccessIdentity = require('../../models/AccessIdentity');
const AccessEvent = require('../../models/AccessEvent');
const DailyStudentAccess = require('../../models/DailyStudentAccess');
const AccessPolicy = require('../../models/AccessPolicy');
const AccessEnrollmentJob = require('../../models/AccessEnrollmentJob');

const { autenticar, apenasAdmin } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { attachActor, logAction } = require('../../utils/audit');
const {
  mappingKey,
  processSingleEvent,
  processControlIdPayload,
  retryDailyNotification,
} = require('../../services/accessEventService');
const {
  getPolicy,
  validateWindows,
  normalizeClass,
} = require('../../services/accessPolicyService');

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function generateBridgeKey() {
  return `axf_${crypto.randomBytes(32).toString('base64url')}`;
}

function bridgeKeyPrefix(value) {
  const key = String(value || '');
  return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : 'configurada';
}

function normalizeCode(value) {
  return clean(value, 60)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
}

function firmwareInfo(version) {
  const value = clean(version, 40);
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { familia: 'desconhecida', templateSuportado: false };
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major === 7) {
    return {
      familia: 'V7',
      templateSuportado: minor > 10 || (minor === 10 && patch >= 0),
    };
  }
  if (major === 8) {
    return {
      familia: 'V8',
      templateSuportado: minor > 6 || (minor === 6 && patch >= 0),
    };
  }
  return { familia: 'desconhecida', templateSuportado: false };
}

function normalizeIp(value) {
  const ip = clean(value, 80);
  if (!ip) return null;
  return net.isIP(ip) === 4 ? ip : null;
}

function invalidIpProvided(value) {
  const raw = clean(value, 80);
  return Boolean(raw) && net.isIP(raw) !== 4;
}

function isAdminRole(req) {
  return ['admin', 'master', 'superadmin'].includes(String(req.usuario?.tipo || '').toLowerCase());
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (err) {
    console.warn('[controle-acesso][audit]', err?.message || err);
  }
}

async function deviceAuth(req, res, next) {
  try {
    const rawKey = clean(req.headers['x-axoriin-device-key'], 300);
    if (!rawKey) {
      return res.status(401).json({ ok: false, mensagem: 'Chave do dispositivo ausente.' });
    }

    const keyHash = hashKey(rawKey);
    const device = await AccessDevice.findOne({
      bridgeKeyHash: keyHash,
      ativo: { $ne: false },
    }).lean();

    if (!device) {
      return res.status(401).json({ ok: false, mensagem: 'Chave do dispositivo inválida.' });
    }

    req.accessDevice = device;
    req.instituicaoId = String(device.instituicao);
    req.tenantId = String(device.instituicao);

    AccessDevice.updateOne(
      { _id: device._id },
      { $set: { bridgeUltimoUsoEm: new Date(), lastSeenAt: new Date() } }
    ).catch(() => {});

    return next();
  } catch (err) {
    console.error('[controle-acesso][deviceAuth]', err);
    return res.status(500).json({ ok: false, mensagem: 'Falha ao autenticar dispositivo.' });
  }
}

// ---------------------------------------------------------
// Endpoint futuro do Axoriin Face Bridge.
// Aceita o JSON "dao" da Control iD já encaminhado pelo bridge.
// Não armazena access_photo, base64 ou template facial.
// ---------------------------------------------------------
router.post('/ingest', deviceAuth, async (req, res) => {
  try {
    const result = await processControlIdPayload({
      device: req.accessDevice,
      body: req.body || {},
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[controle-acesso][ingest]', err);
    return res.status(500).json({ ok: false, mensagem: 'Falha ao processar evento de acesso.' });
  }
});

function containsForbiddenBiometricPayload(value) {
  const forbidden = new Set(['face_template', 'user_image', 'access_photo', 'image_base64', 'photo_base64', 'template_base64']);
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(String(key).toLowerCase())) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function enrollmentPublic(job) {
  if (!job) return null;
  const obj = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  return {
    _id: obj._id,
    aluno: obj.aluno,
    alunoSnapshot: obj.alunoSnapshot,
    sourceDevice: obj.sourceDevice,
    targetDevices: obj.targetDevices,
    groupId: obj.groupId,
    status: obj.status,
    etapa: obj.etapa,
    mensagem: obj.mensagem,
    resultados: obj.resultados || [],
    bridge: obj.bridge || {},
    erro: obj.erro || {},
    privacy: obj.privacy || { photoPersisted: false, templatePersisted: false },
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function enrollmentJobForBridge(jobId, accessDevice) {
  if (!mongoose.isValidObjectId(jobId)) return null;
  return AccessEnrollmentJob.findOne({
    _id: jobId,
    instituicao: accessDevice.instituicao,
    sourceDevice: accessDevice._id,
  });
}

// ---------------------------------------------------------
// Fase 1.2 - fila de comandos do cadastro facial central.
// O Bridge puxa somente metadados e devolve somente user_id/status.
// Foto/template nunca entram nestes endpoints.
// ---------------------------------------------------------
router.post('/bridge/enrollment/claim', deviceAuth, async (req, res) => {
  try {
    const job = await AccessEnrollmentJob.findOneAndUpdate(
      {
        instituicao: req.accessDevice.instituicao,
        sourceDevice: req.accessDevice._id,
        status: 'aguardando_bridge',
      },
      {
        $set: {
          status: 'processando',
          etapa: 'preparando_usuarios',
          mensagem: 'Bridge assumiu o cadastro e está preparando os usuários nos equipamentos.',
          'bridge.claimedAt': new Date(),
          'bridge.lastProgressAt': new Date(),
        },
      },
      { new: true, sort: { createdAt: 1 } }
    ).lean();

    if (!job) return res.json({ ok: true, job: null });

    const deviceIds = [job.sourceDevice, ...(job.targetDevices || [])];
    const devices = await AccessDevice.find({
      _id: { $in: deviceIds },
      instituicao: req.accessDevice.instituicao,
      ativo: { $ne: false },
      provider: 'controlid_idface_max',
    })
      .select('nome codigo externalDeviceId serial firmware redeLocal controlId')
      .lean();

    const byId = new Map(devices.map((d) => [String(d._id), d]));
    const source = byId.get(String(job.sourceDevice));
    const targets = (job.targetDevices || []).map((id) => byId.get(String(id))).filter(Boolean);

    if (!source || targets.length !== (job.targetDevices || []).length) {
      await AccessEnrollmentJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'falhou',
            etapa: 'falhou',
            mensagem: 'Um ou mais dispositivos do cadastro não estão mais disponíveis.',
            'erro.code': 'DEVICE_NOT_AVAILABLE',
            'erro.message': 'Um ou mais dispositivos não puderam ser carregados.',
            'bridge.completedAt': new Date(),
          },
        }
      );
      return res.status(409).json({ ok: false, mensagem: 'Dispositivos do cadastro indisponíveis.' });
    }

    return res.json({
      ok: true,
      job: {
        id: String(job._id),
        aluno: {
          id: String(job.aluno),
          nome: job.alunoSnapshot?.nome || '',
          turma: job.alunoSnapshot?.turma || '',
          registration: job.alunoSnapshot?.codigoAcesso || '',
        },
        groupId: Number(job.groupId || 1),
        source: {
          externalDeviceId: source.externalDeviceId,
          name: source.nome,
          firmware: source.firmware,
        },
        targets: targets.map((d) => ({
          externalDeviceId: d.externalDeviceId,
          name: d.nome,
          firmware: d.firmware,
        })),
        privacy: { photoPersisted: false, templatePersisted: false },
      },
    });
  } catch (err) {
    console.error('[controle-acesso][bridge][enrollment][claim]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao reservar cadastro facial para o Bridge.' });
  }
});

router.post('/bridge/enrollment/:id/progress', deviceAuth, async (req, res) => {
  try {
    if (containsForbiddenBiometricPayload(req.body)) {
      return res.status(400).json({ ok: false, mensagem: 'Payload biométrico não é aceito pelo Axoriin.' });
    }
    const job = await enrollmentJobForBridge(req.params.id, req.accessDevice);
    if (!job) return res.status(404).json({ ok: false, mensagem: 'Cadastro facial não encontrado.' });
    if (!['processando', 'aguardando_bridge'].includes(job.status)) {
      return res.status(409).json({ ok: false, mensagem: 'Cadastro facial não está em processamento.' });
    }

    const etapas = ['preparando_usuarios', 'aguardando_captura', 'capturando', 'replicando', 'criando_vinculos'];
    const etapa = etapas.includes(clean(req.body?.etapa, 60)) ? clean(req.body.etapa, 60) : job.etapa;
    const mensagem = clean(req.body?.mensagem || job.mensagem, 500);

    job.status = 'processando';
    job.etapa = etapa;
    job.mensagem = mensagem;
    job.bridge.lastProgressAt = new Date();
    if (Array.isArray(req.body?.resultados)) {
      job.resultados = req.body.resultados.slice(0, 16).map((item) => ({
        deviceName: clean(item?.deviceName, 120) || null,
        externalDeviceId: clean(item?.externalDeviceId, 120) || null,
        role: item?.role === 'origem' ? 'origem' : 'destino',
        userId: clean(item?.userId, 120) || null,
        userCreated: item?.userCreated === true,
        groupOk: item?.groupOk === true,
        biometricStatus: ['nao_iniciado', 'capturada', 'replicada', 'ja_existente', 'falhou'].includes(item?.biometricStatus)
          ? item.biometricStatus
          : 'nao_iniciado',
        ok: item?.ok === true,
        message: clean(item?.message, 300) || null,
      }));
    }
    await job.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[controle-acesso][bridge][enrollment][progress]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar progresso do cadastro.' });
  }
});

router.post('/bridge/enrollment/:id/complete', deviceAuth, async (req, res) => {
  try {
    if (containsForbiddenBiometricPayload(req.body)) {
      return res.status(400).json({ ok: false, mensagem: 'Payload biométrico não é aceito pelo Axoriin.' });
    }
    const job = await enrollmentJobForBridge(req.params.id, req.accessDevice);
    if (!job) return res.status(404).json({ ok: false, mensagem: 'Cadastro facial não encontrado.' });

    const rawResults = Array.isArray(req.body?.resultados) ? req.body.resultados.slice(0, 16) : [];
    const expectedMongoIds = [job.sourceDevice, ...(job.targetDevices || [])];
    const devices = await AccessDevice.find({
      instituicao: req.accessDevice.instituicao,
      _id: { $in: expectedMongoIds },
    }).lean();
    const byExternal = new Map(devices.map((d) => [String(d.externalDeviceId), d]));
    const expectedExternal = new Set(devices.map((d) => String(d.externalDeviceId || '')).filter(Boolean));

    const results = [];
    let allOk = req.body?.ok === true && rawResults.length === expectedMongoIds.length && devices.length === expectedMongoIds.length;

    for (const item of rawResults) {
      const externalDeviceId = clean(item?.externalDeviceId, 120);
      const device = expectedExternal.has(externalDeviceId) ? byExternal.get(externalDeviceId) : null;
      const userId = clean(item?.userId, 120);
      const result = {
        device: device?._id || null,
        deviceName: clean(item?.deviceName || device?.nome, 120) || null,
        externalDeviceId: externalDeviceId || null,
        role: item?.role === 'origem' ? 'origem' : 'destino',
        userId: userId || null,
        userCreated: item?.userCreated === true,
        groupOk: item?.groupOk === true,
        biometricStatus: ['capturada', 'replicada', 'ja_existente', 'falhou'].includes(item?.biometricStatus)
          ? item.biometricStatus
          : 'falhou',
        identityOk: false,
        ok: item?.ok === true,
        message: clean(item?.message, 300) || null,
      };

      if (!device || !userId || item?.ok !== true) {
        allOk = false;
        if (!device && !result.message) result.message = 'Dispositivo não localizado no Axoriin.';
        results.push(result);
        continue;
      }

      const key = mappingKey('controlid', String(device._id), userId);
      const collision = await AccessIdentity.findOne({ instituicao: job.instituicao, mappingKey: key }).lean();
      if (collision && String(collision.aluno) !== String(job.aluno)) {
        allOk = false;
        result.ok = false;
        result.message = 'user_id já está vinculado a outro aluno no Axoriin.';
        results.push(result);
        continue;
      }

      await AccessIdentity.findOneAndUpdate(
        { instituicao: job.instituicao, mappingKey: key },
        {
          $set: {
            tenantId: job.instituicao,
            provider: 'controlid',
            device: device._id,
            aluno: job.aluno,
            externalUserId: userId,
            registration: job.alunoSnapshot.codigoAcesso,
            mappingKey: key,
            ativo: true,
            sincronizadoEm: new Date(),
          },
          $setOnInsert: { instituicao: job.instituicao },
        },
        { upsert: true, new: true, runValidators: true }
      );

      result.identityOk = true;
      results.push(result);
    }

    job.resultados = results;
    job.bridge.lastProgressAt = new Date();
    job.bridge.completedAt = new Date();

    if (allOk) {
      job.status = 'concluido';
      job.etapa = 'concluido';
      job.mensagem = 'Cadastro facial concluído e vínculos criados automaticamente.';
      job.erro = { code: null, message: null };
    } else {
      job.status = 'falhou';
      job.etapa = 'falhou';
      job.mensagem = clean(req.body?.mensagem || 'O cadastro facial terminou com falha ou resultado parcial.', 500);
      job.erro = {
        code: clean(req.body?.errorCode || 'ENROLLMENT_FAILED', 80),
        message: clean(req.body?.errorMessage || job.mensagem, 500),
      };
    }

    await job.save();

    return res.json({ ok: true, job: enrollmentPublic(job) });
  } catch (err) {
    console.error('[controle-acesso][bridge][enrollment][complete]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao concluir cadastro facial.' });
  }
});

// Rotas administrativas abaixo.
router.use(autenticar, requireTenant, apenasAdmin, attachActor);

router.get('/biometria/alunos/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Aluno inválido.' });
    }
    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.instituicaoId })
      .select('_id nome turma codigoAcesso')
      .lean();
    if (!aluno) return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado.' });
    return res.json({
      ok: true,
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao carregar dados do aluno.' });
  }
});

router.get('/biometria/jobs', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit || 10), 1), 30);
    const items = await AccessEnrollmentJob.find({ instituicao: req.instituicaoId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('aluno', 'nome turma codigoAcesso')
      .populate('sourceDevice', 'nome codigo externalDeviceId firmware')
      .populate('targetDevices', 'nome codigo externalDeviceId firmware')
      .lean();
    return res.json({ ok: true, items: items.map(enrollmentPublic) });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar cadastros faciais.' });
  }
});

router.get('/biometria/jobs/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Cadastro facial inválido.' });
    }
    const job = await AccessEnrollmentJob.findOne({ _id: req.params.id, instituicao: req.instituicaoId })
      .populate('aluno', 'nome turma codigoAcesso')
      .populate('sourceDevice', 'nome codigo externalDeviceId firmware')
      .populate('targetDevices', 'nome codigo externalDeviceId firmware')
      .lean();
    if (!job) return res.status(404).json({ ok: false, mensagem: 'Cadastro facial não encontrado.' });
    return res.json({ ok: true, job: enrollmentPublic(job) });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao carregar cadastro facial.' });
  }
});

router.post('/biometria/jobs', async (req, res) => {
  try {
    const alunoId = clean(req.body?.alunoId, 40);
    const sourceDeviceId = clean(req.body?.sourceDeviceId, 40);
    const targetDeviceIds = [...new Set((Array.isArray(req.body?.targetDeviceIds) ? req.body.targetDeviceIds : [])
      .map((v) => clean(v, 40)).filter(Boolean))];

    if (!mongoose.isValidObjectId(alunoId) || !mongoose.isValidObjectId(sourceDeviceId)) {
      return res.status(400).json({ ok: false, mensagem: 'Selecione aluno e aparelho de captura válidos.' });
    }
    if (!targetDeviceIds.length || targetDeviceIds.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ ok: false, mensagem: 'Selecione ao menos um aparelho de destino.' });
    }
    if (targetDeviceIds.includes(sourceDeviceId)) {
      return res.status(400).json({ ok: false, mensagem: 'O aparelho de captura não deve ser repetido como destino.' });
    }

    const active = await AccessEnrollmentJob.exists({
      instituicao: req.instituicaoId,
      aluno: alunoId,
      status: { $in: ['aguardando_bridge', 'processando'] },
    });
    if (active) {
      return res.status(409).json({ ok: false, mensagem: 'Este aluno já possui um cadastro facial em andamento.' });
    }

    const [aluno, devices] = await Promise.all([
      Aluno.findOne({ _id: alunoId, instituicao: req.instituicaoId })
        .select('_id nome turma codigoAcesso')
        .lean(),
      AccessDevice.find({
        _id: { $in: [sourceDeviceId, ...targetDeviceIds] },
        instituicao: req.instituicaoId,
        provider: 'controlid_idface_max',
        ativo: { $ne: false },
      }).lean(),
    ]);

    if (!aluno) return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado.' });
    const registration = clean(aluno.codigoAcesso, 120);
    if (!registration) {
      return res.status(400).json({ ok: false, mensagem: 'O aluno não possui código de acesso para usar como registration nos iDFace.' });
    }

    if (devices.length !== 1 + targetDeviceIds.length) {
      return res.status(400).json({ ok: false, mensagem: 'Um ou mais iDFace selecionados não estão disponíveis.' });
    }

    for (const device of devices) {
      if (!device.externalDeviceId || !device.redeLocal?.ip) {
        return res.status(400).json({ ok: false, mensagem: `${device.nome} não possui IP/device_id completo.` });
      }
      if (device.controlId?.templateFacialSuportado !== true) {
        return res.status(400).json({ ok: false, mensagem: `${device.nome} ainda não está marcado como compatível com Template API.` });
      }
    }

    const job = await AccessEnrollmentJob.create({
      instituicao: req.instituicaoId,
      tenantId: req.instituicaoId,
      aluno: aluno._id,
      alunoSnapshot: {
        nome: clean(aluno.nome, 180),
        turma: clean(aluno.turma, 80) || null,
        codigoAcesso: registration,
      },
      sourceDevice: sourceDeviceId,
      targetDevices: targetDeviceIds,
      groupId: 1,
      status: 'aguardando_bridge',
      etapa: 'fila',
      mensagem: 'Aguardando o Axoriin Face Bridge assumir o cadastro.',
      privacy: { photoPersisted: false, templatePersisted: false },
    });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_CADASTRO_FACIAL_SOLICITADO',
      targetType: 'AccessEnrollmentJob',
      targetId: job._id,
      entidadeNome: aluno.nome,
      aluno: aluno._id,
      alunoNome: aluno.nome,
      modulo: 'controle_acesso',
      meta: { sourceDeviceId, targetDeviceIds, registration },
    });

    return res.status(201).json({ ok: true, job: enrollmentPublic(job) });
  } catch (err) {
    console.error('[controle-acesso][biometria][jobs][post]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao iniciar cadastro facial central.' });
  }
});

router.post('/biometria/jobs/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Cadastro facial inválido.' });
    }
    const job = await AccessEnrollmentJob.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.instituicaoId, status: 'aguardando_bridge' },
      { $set: { status: 'cancelado', etapa: 'cancelado', mensagem: 'Cadastro facial cancelado pelo administrador.' } },
      { new: true }
    );
    if (!job) return res.status(409).json({ ok: false, mensagem: 'Somente cadastros ainda na fila podem ser cancelados.' });
    return res.json({ ok: true, job: enrollmentPublic(job) });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao cancelar cadastro facial.' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const instituicaoId = req.instituicaoId;
    const instituicao = await Instituicao.findById(instituicaoId)
      .select('timezone')
      .lean();

    const timezone = clean(instituicao?.timezone || 'America/Rio_Branco', 80);
    const dateKey = DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd');

    const [
      devices,
      entriesToday,
      regularToday,
      counterShiftToday,
      outsideToday,
      unlinked,
      notificationsFailed,
      recentEvents,
    ] = await Promise.all([
      AccessDevice.find({ instituicao: instituicaoId })
        .select('-bridgeKeyHash')
        .sort({ createdAt: 1 })
        .lean(),
      DailyStudentAccess.countDocuments({ instituicao: instituicaoId, dateKey }),
      DailyStudentAccess.countDocuments({ instituicao: instituicaoId, dateKey, classificacao: 'turno_regular' }),
      DailyStudentAccess.countDocuments({ instituicao: instituicaoId, dateKey, classificacao: 'contraturno' }),
      DailyStudentAccess.countDocuments({ instituicao: instituicaoId, dateKey, classificacao: 'fora_turno' }),
      AccessEvent.countDocuments({
        instituicao: instituicaoId,
        status: 'nao_vinculado',
        occurredAt: { $gte: DateTime.fromISO(dateKey, { zone: timezone }).startOf('day').toJSDate() },
      }),
      DailyStudentAccess.countDocuments({
        instituicao: instituicaoId,
        dateKey,
        'notificacao.tentada': true,
        'notificacao.canais': { $elemMatch: { ok: false } },
      }),
      AccessEvent.find({ instituicao: instituicaoId })
        .sort({ occurredAt: -1 })
        .limit(20)
        .populate('device', 'nome codigo local provider')
        .populate('aluno', 'nome turma')
        .lean(),
    ]);

    return res.json({
      ok: true,
      dateKey,
      timezone,
      metrics: {
        devices: devices.filter((d) => d.ativo !== false).length,
        entriesToday,
        regularToday,
        counterShiftToday,
        outsideToday,
        unlinked,
        notificationsFailed,
      },
      devices,
      recentEvents,
    });
  } catch (err) {
    console.error('[controle-acesso][dashboard]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao carregar o controle de acesso.' });
  }
});


router.get('/configuracao', async (req, res) => {
  try {
    const [policy, turmasRaw] = await Promise.all([
      getPolicy(req.instituicaoId),
      Aluno.aggregate([
        { $match: { instituicao: new mongoose.Types.ObjectId(req.instituicaoId) } },
        { $group: { _id: '$turma', total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const map = new Map((policy.turmas || []).map((item) => [normalizeClass(item.turma), item.turno]));
    const turmas = turmasRaw
      .filter((item) => clean(item._id, 80))
      .map((item) => ({
        turma: clean(item._id, 80),
        total: Number(item.total || 0),
        turno: map.get(normalizeClass(item._id)) || null,
      }));

    return res.json({ ok: true, policy, turmas });
  } catch (err) {
    console.error('[controle-acesso][configuracao][get]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao carregar configuração de turnos.' });
  }
});

router.put('/configuracao', async (req, res) => {
  try {
    const current = await getPolicy(req.instituicaoId);
    const janelas = {
      matutino: {
        ativo: req.body?.janelas?.matutino?.ativo !== false,
        inicio: clean(req.body?.janelas?.matutino?.inicio || current.janelas.matutino.inicio, 5),
        fim: clean(req.body?.janelas?.matutino?.fim || current.janelas.matutino.fim, 5),
      },
      vespertino: {
        ativo: req.body?.janelas?.vespertino?.ativo !== false,
        inicio: clean(req.body?.janelas?.vespertino?.inicio || current.janelas.vespertino.inicio, 5),
        fim: clean(req.body?.janelas?.vespertino?.fim || current.janelas.vespertino.fim, 5),
      },
      noturno: {
        ativo: req.body?.janelas?.noturno?.ativo === true,
        inicio: clean(req.body?.janelas?.noturno?.inicio || current.janelas.noturno.inicio, 5),
        fim: clean(req.body?.janelas?.noturno?.fim || current.janelas.noturno.fim, 5),
      },
    };

    const validation = validateWindows(janelas);
    if (!validation.ok) return res.status(400).json(validation);

    const turmas = [];
    const seen = new Set();
    for (const item of Array.isArray(req.body?.turmas) ? req.body.turmas : []) {
      const turma = clean(item?.turma, 80);
      const turno = clean(item?.turno, 20).toLowerCase();
      const key = normalizeClass(turma);
      if (!turma || !key || seen.has(key)) continue;
      if (!['matutino', 'vespertino', 'noturno'].includes(turno)) continue;
      seen.add(key);
      turmas.push({ turma, turno });
    }

    const notificacoes = {
      notificarTurnoRegular: req.body?.notificacoes?.notificarTurnoRegular !== false,
      notificarContraturno: req.body?.notificacoes?.notificarContraturno !== false,
      notificarForaTurno: req.body?.notificacoes?.notificarForaTurno !== false,
    };

    const chamada = { somenteTurnoRegular: true };

    const policy = await AccessPolicy.findOneAndUpdate(
      { instituicao: req.instituicaoId },
      {
        $set: {
          tenantId: req.instituicaoId,
          janelas,
          turmas,
          notificacoes,
          chamada,
        },
        $setOnInsert: { instituicao: req.instituicaoId },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_CONFIGURACAO_ATUALIZADA',
      targetType: 'AccessPolicy',
      targetId: policy._id,
      entidadeNome: 'Política de acesso',
      modulo: 'controle_acesso',
      meta: { turmasConfiguradas: turmas.length, janelas },
    });

    return res.json({ ok: true, policy });
  } catch (err) {
    console.error('[controle-acesso][configuracao][put]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao salvar configuração de turnos.' });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const items = await AccessDevice.find({ instituicao: req.instituicaoId })
      .select('-bridgeKeyHash')
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar dispositivos.' });
  }
});

router.post('/devices', async (req, res) => {
  try {
    const nome = clean(req.body?.nome, 120);
    const codigo = normalizeCode(req.body?.codigo || nome);
    const provider = ['controlid_idface_max', 'simulador', 'outro'].includes(req.body?.provider)
      ? req.body.provider
      : 'controlid_idface_max';
    const tipoUso = ['entrada', 'saida', 'misto'].includes(req.body?.tipoUso)
      ? req.body.tipoUso
      : 'entrada';

    if (!nome || !codigo) {
      return res.status(400).json({ ok: false, mensagem: 'Informe nome e código do dispositivo.' });
    }

    if (invalidIpProvided(req.body?.ipLocal)) {
      return res.status(400).json({ ok: false, mensagem: 'IP local inválido. Informe um IPv4, por exemplo 192.168.20.16.' });
    }

    const externalDeviceId = clean(req.body?.externalDeviceId, 120) || null;
    if (externalDeviceId) {
      const duplicateDevice = await AccessDevice.exists({ instituicao: req.instituicaoId, externalDeviceId });
      if (duplicateDevice) {
        return res.status(409).json({ ok: false, mensagem: 'Este device_id da Control iD já está cadastrado em outro dispositivo.' });
      }
    }

    const canais = Array.isArray(req.body?.canaisNotificacao)
      ? [...new Set(req.body.canaisNotificacao.map((v) => clean(v, 20).toLowerCase()))]
          .filter((v) => ['email', 'whatsapp', 'telegram'].includes(v))
      : ['email', 'whatsapp'];

    const rawKey = generateBridgeKey();

    const device = await AccessDevice.create({
      instituicao: req.instituicaoId,
      tenantId: req.instituicaoId,
      nome,
      codigo,
      provider,
      tipoUso,
      local: clean(req.body?.local || 'Portão principal', 180),
      externalDeviceId,
      serial: clean(req.body?.serial, 120) || null,
      firmware: clean(req.body?.firmware, 120) || null,
      redeLocal: {
        ip: normalizeIp(req.body?.ipLocal),
        portaWeb: Math.min(Math.max(Number(req.body?.portaWeb || 80), 1), 65535),
        protocolo: req.body?.protocolo === 'https' ? 'https' : 'http',
      },
      controlId: {
        familiaFirmware: firmwareInfo(req.body?.firmware).familia,
        templateFacialSuportado: firmwareInfo(req.body?.firmware).templateSuportado,
      },
      ativo: req.body?.ativo !== false,
      notificarResponsavel: req.body?.notificarResponsavel !== false,
      canaisNotificacao: canais.length ? canais : ['email'],
      bridgeKeyHash: hashKey(rawKey),
      bridgeKeyPrefix: bridgeKeyPrefix(rawKey),
      bridgeKeyRotacionadaEm: new Date(),
    });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_DISPOSITIVO_CRIADO',
      targetType: 'AccessDevice',
      targetId: device._id,
      entidadeNome: device.nome,
      modulo: 'controle_acesso',
      meta: { codigo: device.codigo, provider: device.provider },
    });

    const deviceSafe = device.toObject();
    delete deviceSafe.bridgeKeyHash;

    return res.status(201).json({
      ok: true,
      device: deviceSafe,
      bridgeKey: rawKey,
      aviso: 'A chave é exibida apenas agora. Guarde-a para configurar o Axoriin Face Bridge.',
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, mensagem: 'Já existe dispositivo com este código ou chave.' });
    }
    console.error('[controle-acesso][devices][post]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao cadastrar dispositivo.' });
  }
});

router.patch('/devices/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Dispositivo inválido.' });
    }

    if (req.body?.ipLocal !== undefined && invalidIpProvided(req.body.ipLocal)) {
      return res.status(400).json({ ok: false, mensagem: 'IP local inválido. Informe um IPv4 válido.' });
    }

    if (req.body?.externalDeviceId !== undefined) {
      const ext = clean(req.body.externalDeviceId, 120) || null;
      if (ext) {
        const duplicateDevice = await AccessDevice.exists({
          instituicao: req.instituicaoId,
          externalDeviceId: ext,
          _id: { $ne: req.params.id },
        });
        if (duplicateDevice) {
          return res.status(409).json({ ok: false, mensagem: 'Este device_id da Control iD já pertence a outro dispositivo.' });
        }
      }
    }

    const update = {};
    if (req.body?.nome !== undefined) update.nome = clean(req.body.nome, 120);
    if (req.body?.local !== undefined) update.local = clean(req.body.local, 180);
    if (req.body?.externalDeviceId !== undefined) update.externalDeviceId = clean(req.body.externalDeviceId, 120) || null;
    if (req.body?.serial !== undefined) update.serial = clean(req.body.serial, 120) || null;
    if (req.body?.firmware !== undefined) {
      update.firmware = clean(req.body.firmware, 120) || null;
      const info = firmwareInfo(req.body.firmware);
      update['controlId.familiaFirmware'] = info.familia;
      update['controlId.templateFacialSuportado'] = info.templateSuportado;
    }
    if (req.body?.ipLocal !== undefined) update['redeLocal.ip'] = normalizeIp(req.body.ipLocal);
    if (req.body?.portaWeb !== undefined) update['redeLocal.portaWeb'] = Math.min(Math.max(Number(req.body.portaWeb || 80), 1), 65535);
    if (req.body?.protocolo !== undefined) update['redeLocal.protocolo'] = req.body.protocolo === 'https' ? 'https' : 'http';
    if (req.body?.ativo !== undefined) update.ativo = Boolean(req.body.ativo);
    if (req.body?.notificarResponsavel !== undefined) update.notificarResponsavel = Boolean(req.body.notificarResponsavel);
    if (['entrada', 'saida', 'misto'].includes(req.body?.tipoUso)) update.tipoUso = req.body.tipoUso;

    if (Array.isArray(req.body?.canaisNotificacao)) {
      const canais = [...new Set(req.body.canaisNotificacao.map((v) => clean(v, 20).toLowerCase()))]
        .filter((v) => ['email', 'whatsapp', 'telegram'].includes(v));
      update.canaisNotificacao = canais;
    }

    const device = await AccessDevice.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.instituicaoId },
      { $set: update },
      { new: true, runValidators: true }
    ).select('-bridgeKeyHash');

    if (!device) return res.status(404).json({ ok: false, mensagem: 'Dispositivo não encontrado.' });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_DISPOSITIVO_ATUALIZADO',
      targetType: 'AccessDevice',
      targetId: device._id,
      entidadeNome: device.nome,
      modulo: 'controle_acesso',
      meta: { campos: Object.keys(update) },
    });

    return res.json({ ok: true, device });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar dispositivo.' });
  }
});

router.post('/devices/:id/rotate-key', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Dispositivo inválido.' });
    }

    const rawKey = generateBridgeKey();
    const device = await AccessDevice.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.instituicaoId },
      {
        $set: {
          bridgeKeyHash: hashKey(rawKey),
          bridgeKeyPrefix: bridgeKeyPrefix(rawKey),
          bridgeKeyRotacionadaEm: new Date(),
        },
      },
      { new: true }
    ).select('-bridgeKeyHash');

    if (!device) return res.status(404).json({ ok: false, mensagem: 'Dispositivo não encontrado.' });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_CHAVE_ROTACIONADA',
      targetType: 'AccessDevice',
      targetId: device._id,
      entidadeNome: device.nome,
      modulo: 'controle_acesso',
    });

    return res.json({
      ok: true,
      device,
      bridgeKey: rawKey,
      aviso: 'A chave anterior deixou de funcionar imediatamente.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao gerar nova chave.' });
  }
});

router.get('/identidades', async (req, res) => {
  try {
    const filter = { instituicao: req.instituicaoId };
    if (req.query?.deviceId && mongoose.isValidObjectId(req.query.deviceId)) {
      filter.device = req.query.deviceId;
    }

    const items = await AccessIdentity.find(filter)
      .sort({ updatedAt: -1 })
      .limit(500)
      .populate('aluno', 'nome turma')
      .populate('device', 'nome codigo')
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar vínculos.' });
  }
});

router.post('/identidades', async (req, res) => {
  try {
    const alunoId = clean(req.body?.alunoId, 40);
    const deviceId = clean(req.body?.deviceId, 40);
    const externalUserId = clean(req.body?.externalUserId, 120);
    const registration = clean(req.body?.registration, 120) || null;

    if (!mongoose.isValidObjectId(alunoId) || !externalUserId) {
      return res.status(400).json({ ok: false, mensagem: 'Informe aluno e user_id da Control iD.' });
    }

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.instituicaoId })
      .select('_id nome turma')
      .lean();
    if (!aluno) return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado nesta instituição.' });

    let device = null;
    if (deviceId) {
      if (!mongoose.isValidObjectId(deviceId)) {
        return res.status(400).json({ ok: false, mensagem: 'Dispositivo inválido.' });
      }
      device = await AccessDevice.findOne({ _id: deviceId, instituicao: req.instituicaoId }).lean();
      if (!device) return res.status(404).json({ ok: false, mensagem: 'Dispositivo não encontrado.' });
    }

    const key = mappingKey('controlid', device?._id ? String(device._id) : null, externalUserId);
    const existing = await AccessIdentity.findOne({ instituicao: req.instituicaoId, mappingKey: key });

    if (existing && String(existing.aluno) !== String(aluno._id)) {
      return res.status(409).json({
        ok: false,
        mensagem: 'Este user_id da Control iD já está vinculado a outro aluno.',
      });
    }

    const identity = await AccessIdentity.findOneAndUpdate(
      { instituicao: req.instituicaoId, mappingKey: key },
      {
        $set: {
          tenantId: req.instituicaoId,
          provider: 'controlid',
          device: device?._id || null,
          aluno: aluno._id,
          externalUserId,
          registration,
          mappingKey: key,
          ativo: true,
          sincronizadoEm: new Date(),
        },
        $setOnInsert: { instituicao: req.instituicaoId },
      },
      { upsert: true, new: true, runValidators: true }
    )
      .populate('aluno', 'nome turma')
      .populate('device', 'nome codigo');

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_IDENTIDADE_VINCULADA',
      targetType: 'AccessIdentity',
      targetId: identity._id,
      entidadeNome: aluno.nome,
      aluno: aluno._id,
      alunoNome: aluno.nome,
      modulo: 'controle_acesso',
      meta: { externalUserId, deviceId: device?._id || null },
    });

    return res.status(201).json({ ok: true, identity });
  } catch (err) {
    console.error('[controle-acesso][identidades][post]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao vincular identidade.' });
  }
});

router.delete('/identidades/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Vínculo inválido.' });
    }

    const identity = await AccessIdentity.findOneAndDelete({
      _id: req.params.id,
      instituicao: req.instituicaoId,
    });

    if (!identity) return res.status(404).json({ ok: false, mensagem: 'Vínculo não encontrado.' });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_IDENTIDADE_REMOVIDA',
      targetType: 'AccessIdentity',
      targetId: identity._id,
      modulo: 'controle_acesso',
      meta: { externalUserId: identity.externalUserId },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao remover vínculo.' });
  }
});

router.get('/eventos', async (req, res) => {
  try {
    const filter = { instituicao: req.instituicaoId };
    const status = clean(req.query?.status, 40);
    if (status && ['reconhecido', 'nao_vinculado', 'ignorado'].includes(status)) filter.status = status;

    if (req.query?.deviceId && mongoose.isValidObjectId(req.query.deviceId)) {
      filter.device = req.query.deviceId;
    }

    const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 300);

    const items = await AccessEvent.find(filter)
      .sort({ occurredAt: -1 })
      .limit(limit)
      .populate('device', 'nome codigo local provider')
      .populate('aluno', 'nome turma')
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar eventos.' });
  }
});

router.get('/acessos-diarios', async (req, res) => {
  try {
    const filter = { instituicao: req.instituicaoId };
    const dateKey = clean(req.query?.dateKey, 10);
    const turno = clean(req.query?.turno, 20);

    if (dateKey) filter.dateKey = dateKey;
    if (['matutino', 'vespertino', 'noturno', 'fora_turno'].includes(turno)) filter.turno = turno;
    const classificacao = clean(req.query?.classificacao, 30);
    if (['turno_regular', 'contraturno', 'fora_turno', 'sem_turno_definido'].includes(classificacao)) filter.classificacao = classificacao;

    const items = await DailyStudentAccess.find(filter)
      .sort({ firstEntryAt: -1 })
      .limit(500)
      .populate('aluno', 'nome turma')
      .populate('firstDevice', 'nome codigo local externalDeviceId redeLocal')
      .populate('lastDevice', 'nome codigo local externalDeviceId redeLocal')
      .lean();

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar entradas consolidadas.' });
  }
});

async function ensureSimulatorDevice(instituicaoId) {
  let device = await AccessDevice.findOne({
    instituicao: instituicaoId,
    codigo: 'SIMULADOR-IDFACE',
  }).lean();

  if (device) return device;

  const rawKey = generateBridgeKey();
  try {
    const created = await AccessDevice.create({
      instituicao: instituicaoId,
      tenantId: instituicaoId,
      nome: 'Simulador iDFace Max',
      codigo: 'SIMULADOR-IDFACE',
      provider: 'simulador',
      tipoUso: 'entrada',
      local: 'Simulador local',
      ativo: true,
      notificarResponsavel: false,
      canaisNotificacao: ['email', 'whatsapp'],
      bridgeKeyHash: hashKey(rawKey),
      bridgeKeyPrefix: bridgeKeyPrefix(rawKey),
      bridgeKeyRotacionadaEm: new Date(),
    });
    return created.toObject();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return AccessDevice.findOne({
      instituicao: instituicaoId,
      codigo: 'SIMULADOR-IDFACE',
    }).lean();
  }
}

router.post('/simular', async (req, res) => {
  try {
    const alunoId = clean(req.body?.alunoId, 40);
    if (!mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ ok: false, mensagem: 'Selecione um aluno válido.' });
    }

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.instituicaoId })
      .select('_id nome turma instituicao contatos telefone')
      .lean();

    if (!aluno) return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado.' });

    const device = await ensureSimulatorDevice(req.instituicaoId);
    const allowNotify = req.body?.enviarNotificacao === true;
    const forceNotification = allowNotify && req.body?.forcarNotificacao === true;
    const occurredAt = req.body?.occurredAt ? new Date(req.body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return res.status(400).json({ ok: false, mensagem: 'Data/hora da simulação inválida.' });
    }

    // O simulador é seguro por padrão: não envia aos responsáveis a menos que
    // o administrador marque explicitamente essa opção.
    const effectiveDevice = {
      ...device,
      notificarResponsavel: allowNotify,
    };

    const result = await processSingleEvent({
      device: effectiveDevice,
      event: {
        externalEventId: `SIM-${crypto.randomUUID()}`,
        occurredAt,
        eventCode: 7,
        externalDeviceId: 'SIMULADOR',
        externalUserId: `SIM-${aluno._id}`,
        identifierId: 'FACE_SIMULADA',
        portalId: '1',
        confidence: null,
      },
      source: 'simulador',
      alunoOverride: aluno,
      allowNotify,
      forceNotification,
    });

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_EVENTO_SIMULADO',
      targetType: 'AccessEvent',
      targetId: result.eventId || 'simulacao',
      entidadeNome: aluno.nome,
      aluno: aluno._id,
      alunoNome: aluno.nome,
      modulo: 'controle_acesso',
      meta: { enviarNotificacao: allowNotify, forcarNotificacao: forceNotification, occurredAt },
    });

    return res.status(201).json({ ok: true, result });
  } catch (err) {
    console.error('[controle-acesso][simular]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao simular entrada.' });
  }
});

router.post('/acessos-diarios/:id/retry-notification', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, mensagem: 'Registro inválido.' });
    }

    const result = await retryDailyNotification({
      dailyId: req.params.id,
      instituicaoId: req.instituicaoId,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json(result);
    }

    await safeAudit({
      req,
      event: 'CONTROLE_ACESSO_NOTIFICACAO_REENVIADA',
      targetType: 'DailyStudentAccess',
      targetId: req.params.id,
      modulo: 'controle_acesso',
    });

    return res.json(result);
  } catch (err) {
    console.error('[controle-acesso][retry]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao reenviar notificação.' });
  }
});

module.exports = router;
