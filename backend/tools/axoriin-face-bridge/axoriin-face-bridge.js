'use strict';

/**
 * Axoriin Face Bridge 1.2 - Control iD iDFace Max
 * Node.js 20+, sem dependências externas.
 *
 * - recebe callbacks Monitor de múltiplos iDFace;
 * - identifica o aparelho por device_id e confirma o IP de origem;
 * - usa uma chave Axoriin diferente por aparelho;
 * - mantém fila local somente com metadados sanitizados;
 * - descarta access_photo por streaming, sem persistir foto;
 * - nunca aceita templates/credenciais no DAO.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.BRIDGE_PORT || 8787);
const HOST = String(process.env.BRIDGE_HOST || '0.0.0.0');
const AXORIIN_BASE_URL = String(process.env.AXORIIN_BASE_URL || '').replace(/\/+$/, '');
const QUEUE_DIR = path.resolve(process.env.BRIDGE_QUEUE_DIR || path.join(__dirname, 'queue'));
const MAX_DAO_BYTES = Math.max(64 * 1024, Number(process.env.BRIDGE_MAX_DAO_BYTES || 1024 * 1024));
const RETRY_MS = Math.max(5000, Number(process.env.BRIDGE_RETRY_MS || 15000));
const COMMAND_POLL_MS = Math.max(2000, Number(process.env.BRIDGE_COMMAND_POLL_MS || 3000));
const CAPTURE_DELAY_MS = Math.max(3000, Number(process.env.BRIDGE_CAPTURE_DELAY_MS || 6000));
const IDFACE_API_USER = String(process.env.IDFACE_API_USER || '').trim();
const IDFACE_API_PASSWORD = String(process.env.IDFACE_API_PASSWORD || '');

function log(...args) { console.log(new Date().toISOString(), ...args); }
function warn(...args) { console.warn(new Date().toISOString(), ...args); }
function clean(v, max = 300) { return String(v ?? '').trim().slice(0, max); }

function envDevice(index) {
  const id = String(index).padStart(2, '0');
  const name = clean(process.env[`IDFACE_${id}_NAME`] || `IDFACE ${id}`, 100);
  const ip = clean(process.env[`IDFACE_${id}_IP`], 80);
  const deviceId = clean(process.env[`IDFACE_${id}_DEVICE_ID`], 120);
  const key = clean(process.env[`AXORIIN_DEVICE_KEY_${id}`], 300);
  const port = Math.min(Math.max(Number(process.env[`IDFACE_${id}_PORT`] || 80), 1), 65535);
  if (!ip && !deviceId && !key) return null;
  if (!ip || !deviceId || !key) {
    throw new Error(`Configuração incompleta do ${name}: defina IDFACE_${id}_IP, IDFACE_${id}_DEVICE_ID e AXORIIN_DEVICE_KEY_${id}.`);
  }
  return { slot: id, name, ip, deviceId, key, port };
}

function loadRoutes() {
  const routes = [];
  for (let i = 1; i <= 16; i += 1) {
    const item = envDevice(i);
    if (item) routes.push(item);
  }
  const deviceIds = new Set();
  const ips = new Set();
  for (const item of routes) {
    if (deviceIds.has(item.deviceId)) throw new Error(`device_id duplicado no bridge: ${item.deviceId}`);
    if (ips.has(item.ip)) throw new Error(`IP duplicado no bridge: ${item.ip}`);
    deviceIds.add(item.deviceId);
    ips.add(item.ip);
  }
  return routes;
}

let ROUTES;
try {
  ROUTES = loadRoutes();
} catch (err) {
  console.error('[bridge] configuração inválida:', err.message);
  process.exit(2);
}

const CENTRAL_ENROLLMENT_CONFIGURED = Boolean(AXORIIN_BASE_URL && ROUTES.length && IDFACE_API_USER && IDFACE_API_PASSWORD);

function normalizeRemoteAddress(req) {
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_DAO_BYTES) {
      throw Object.assign(new Error('Payload DAO acima do limite.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sanitizeDao(body) {
  const changes = Array.isArray(body?.object_changes) ? body.object_changes : [];
  const objectChanges = [];
  const ids = new Set();

  for (const change of changes) {
    if (String(change?.object || '') !== 'access_logs') continue;
    if (String(change?.type || '').toLowerCase() !== 'inserted') continue;
    const v = change?.values || {};
    const deviceId = clean(v.device_id ?? body?.device_id, 120) || null;
    if (deviceId) ids.add(deviceId);
    objectChanges.push({
      object: 'access_logs',
      type: 'inserted',
      values: {
        id: v.id ?? null,
        time: v.time ?? null,
        event: v.event ?? null,
        device_id: deviceId,
        identifier_id: v.identifier_id ?? null,
        user_id: v.user_id ?? null,
        portal_id: v.portal_id ?? null,
        confidence: v.confidence ?? null,
      },
    });
  }

  if (!objectChanges.length) return null;
  if (ids.size > 1) throw Object.assign(new Error('Um mesmo callback contém eventos de device_id diferentes.'), { status: 400 });
  return {
    body: { object_changes: objectChanges, device_id: [...ids][0] || clean(body?.device_id, 120) || null },
    deviceId: [...ids][0] || clean(body?.device_id, 120) || null,
  };
}

function resolveRoute({ deviceId, remoteIp }) {
  const byDevice = deviceId ? ROUTES.find((r) => r.deviceId === deviceId) : null;
  const byIp = remoteIp ? ROUTES.find((r) => r.ip === remoteIp) : null;

  if (byDevice && byIp && byDevice.slot !== byIp.slot) {
    return { error: `device_id ${deviceId} chegou pelo IP ${remoteIp}, mas pertencem a aparelhos diferentes na configuração.` };
  }
  const route = byDevice || byIp;
  if (!route) return { error: `Aparelho não autorizado: IP=${remoteIp || '-'} device_id=${deviceId || '-'}.` };
  if (route.ip !== remoteIp) return { error: `IP de origem inesperado para ${route.name}: recebido ${remoteIp}, esperado ${route.ip}.` };
  if (deviceId && route.deviceId !== deviceId) return { error: `device_id inesperado para ${route.name}.` };
  return { route };
}

async function forwardToAxoriin(route, body) {
  if (!AXORIIN_BASE_URL) throw new Error('AXORIIN_BASE_URL não configurado.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${AXORIIN_BASE_URL}/api/controle-acesso/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Axoriin-Device-Key': route.key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.mensagem || result.message || `Axoriin HTTP ${response.status}`);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureQueue() { await fsp.mkdir(QUEUE_DIR, { recursive: true }); }

async function queuePayload(route, body) {
  await ensureQueue();
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.json`;
  const target = path.join(QUEUE_DIR, name);
  // A chave do dispositivo NÃO é gravada na fila. Somente o slot lógico + DAO sanitizado.
  await fsp.writeFile(target, JSON.stringify({ routeSlot: route.slot, body }), { encoding: 'utf8', flag: 'wx' });
  return name;
}

async function retryQueue() {
  if (!AXORIIN_BASE_URL || !ROUTES.length) return;
  await ensureQueue();
  const files = (await fsp.readdir(QUEUE_DIR)).filter((n) => n.endsWith('.json')).sort().slice(0, 100);
  for (const name of files) {
    const target = path.join(QUEUE_DIR, name);
    try {
      const item = JSON.parse(await fsp.readFile(target, 'utf8'));
      const route = ROUTES.find((r) => r.slot === String(item.routeSlot));
      if (!route) throw new Error(`Rota ${item.routeSlot} não existe mais na configuração.`);
      await forwardToAxoriin(route, item.body);
      await fsp.unlink(target);
      log('[fila] reenviado', name, 'via', route.name);
    } catch (err) {
      warn('[fila] ainda pendente:', name, '-', err.message);
      break;
    }
  }
}

async function handleDao(req, res) {
  let original;
  try { original = await readJson(req); }
  catch (err) { return json(res, err.status || 400, { ok: false, mensagem: err.message }); }

  let sanitized;
  try { sanitized = sanitizeDao(original); }
  catch (err) { return json(res, err.status || 400, { ok: false, mensagem: err.message }); }
  original = null;

  if (!sanitized) return json(res, 200, { ok: true, ignored: true, reason: 'Sem access_logs inserted.' });

  const remoteIp = normalizeRemoteAddress(req);
  const resolved = resolveRoute({ deviceId: sanitized.deviceId, remoteIp });
  if (!resolved.route) return json(res, 403, { ok: false, mensagem: resolved.error });
  const route = resolved.route;

  try {
    const result = await forwardToAxoriin(route, sanitized.body);
    return json(res, 200, { ok: true, forwarded: true, device: route.name, axoriin: result });
  } catch (err) {
    try {
      const queueFile = await queuePayload(route, sanitized.body);
      warn('[dao] Axoriin indisponível; evento na fila:', queueFile, '-', route.name, '-', err.message);
      return json(res, 200, { ok: true, forwarded: false, queued: true, device: route.name });
    } catch (queueErr) {
      warn('[dao] falha no envio e na fila:', queueErr.message);
      return json(res, 503, { ok: false, mensagem: 'Falha ao encaminhar e enfileirar evento.' });
    }
  }
}

function discardPhoto(req, res) {
  const remoteIp = normalizeRemoteAddress(req);
  if (!ROUTES.some((r) => r.ip === remoteIp)) {
    req.resume();
    return req.on('end', () => json(res, 403, { ok: false, mensagem: 'Origem não autorizada.' }));
  }
  // Deliberadamente não concatena chunks e não grava em disco.
  req.on('error', () => {});
  req.resume();
  req.on('end', () => json(res, 200, { ok: true, ignored: true, reason: 'access_photo descartado pelo Axoriin' }));
}

function apiBase(route) {
  return `http://${route.ip}:${route.port || 80}`;
}

async function deviceApi(route, endpoint, { body = {}, session = null, timeoutMs = 15000 } = {}) {
  const suffix = session ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}` : endpoint;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase(route)}${suffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = clean(result?.error || result?.message || result?.mensagem || `HTTP ${response.status}`, 500);
      throw new Error(`${route.name}: ${msg}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function loginDevice(route) {
  const result = await deviceApi(route, '/login.fcgi', {
    body: { login: IDFACE_API_USER, password: IDFACE_API_PASSWORD },
    timeoutMs: 10000,
  });
  if (!result?.session) throw new Error(`${route.name}: sessão não retornada pelo login.`);
  return String(result.session);
}

async function loadDeviceObjects(route, session, object, fields, where = null, limit = 10000) {
  const body = { object, fields, limit };
  if (where) body.where = where;
  return deviceApi(route, '/load_objects.fcgi', { body, session, timeoutMs: 20000 });
}

async function ensureDeviceUser(route, session, aluno) {
  const users = await loadDeviceObjects(route, session, 'users', ['id', 'registration', 'name'], null, 10000);
  const items = Array.isArray(users?.users) ? users.users : [];
  const existing = items.find((u) => clean(u?.registration, 120) === aluno.registration);
  if (existing) {
    return { userId: String(existing.id), created: false };
  }
  const created = await deviceApi(route, '/create_objects.fcgi', {
    session,
    body: {
      object: 'users',
      values: [{ registration: aluno.registration, name: aluno.nome }],
    },
  });
  const id = Array.isArray(created?.ids) ? created.ids[0] : null;
  if (id === null || id === undefined) throw new Error(`${route.name}: user_id não retornado ao criar usuário.`);
  return { userId: String(id), created: true };
}

async function ensureDeviceGroup(route, session, userId, groupId) {
  const groups = await loadDeviceObjects(route, session, 'groups', ['id', 'name'], null, 100);
  const group = (Array.isArray(groups?.groups) ? groups.groups : []).find((g) => Number(g?.id) === Number(groupId));
  if (!group) throw new Error(`${route.name}: Grupo ${groupId} não existe.`);

  const links = await loadDeviceObjects(
    route,
    session,
    'user_groups',
    ['user_id', 'group_id'],
    { user_groups: { user_id: Number(userId) } },
    100
  );
  const exists = (Array.isArray(links?.user_groups) ? links.user_groups : [])
    .some((x) => Number(x?.user_id) === Number(userId) && Number(x?.group_id) === Number(groupId));
  if (!exists) {
    await deviceApi(route, '/create_objects.fcgi', {
      session,
      body: { object: 'user_groups', values: [{ user_id: Number(userId), group_id: Number(groupId) }] },
    });
  }
  return true;
}

async function getDeviceConfiguration(route, session, body) {
  return deviceApi(route, '/get_configuration.fcgi', { session, body, timeoutMs: 10000 });
}

async function setDeviceConfiguration(route, session, body) {
  return deviceApi(route, '/set_configuration.fcgi', { session, body, timeoutMs: 10000 });
}

function routeByExternalDeviceId(deviceId) {
  return ROUTES.find((r) => String(r.deviceId) === String(deviceId)) || null;
}

async function bridgePost(route, endpoint, body) {
  if (!AXORIIN_BASE_URL) throw new Error('AXORIIN_BASE_URL não configurado.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${AXORIIN_BASE_URL}/api/controle-acesso${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Axoriin-Device-Key': route.key,
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.mensagem || `Axoriin HTTP ${response.status}`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function updateEnrollmentProgress(authRoute, jobId, etapa, mensagem, resultados = []) {
  return bridgePost(authRoute, `/bridge/enrollment/${encodeURIComponent(jobId)}/progress`, {
    etapa,
    mensagem,
    resultados,
  });
}

function safeEnrollmentError(response, fallback = 'Falha no cadastro facial.') {
  let message = fallback;
  if (response && Object.prototype.hasOwnProperty.call(response, 'error')) message += ` ${clean(response.error, 300)}`;
  const info = response?.info;
  if (info && Object.prototype.hasOwnProperty.call(info, 'match_user_id')) {
    message += ` Rosto semelhante ao user_id ${clean(info.match_user_id, 80)}.`;
  }
  return message.trim();
}

function resultSnapshot(ctx) {
  return ctx.map((x) => ({
    deviceName: x.route.name,
    externalDeviceId: x.route.deviceId,
    role: x.role,
    userId: x.userId || null,
    userCreated: x.userCreated === true,
    groupOk: x.groupOk === true,
    biometricStatus: x.biometricStatus || 'nao_iniciado',
    ok: x.ok === true,
    message: x.message || null,
  }));
}

async function executeEnrollmentJob(command, authRoute) {
  const jobId = String(command.id);
  const aluno = command.aluno || {};
  const groupId = Number(command.groupId || 1);
  const sourceRoute = routeByExternalDeviceId(command.source?.externalDeviceId);
  const targetRoutes = (command.targets || []).map((d) => routeByExternalDeviceId(d.externalDeviceId));

  if (!sourceRoute) throw new Error('A origem do cadastro não existe na configuração local do Bridge.');
  if (sourceRoute.slot !== authRoute.slot) throw new Error('A chave que reservou o cadastro não corresponde ao aparelho de origem.');
  if (targetRoutes.some((r) => !r)) throw new Error('Um ou mais aparelhos de destino não existem na configuração local do Bridge.');
  if (!aluno.nome || !aluno.registration) throw new Error('Nome/registration do aluno não foram recebidos do Axoriin.');

  const contexts = [
    { route: sourceRoute, role: 'origem', session: null, userId: null, userCreated: false, groupOk: false, biometricStatus: 'nao_iniciado', ok: false, message: null },
    ...targetRoutes.map((route) => ({ route, role: 'destino', session: null, userId: null, userCreated: false, groupOk: false, biometricStatus: 'nao_iniciado', ok: false, message: null })),
  ];

  let template = null;
  let previousExtract = null;

  try {
    log(`[cadastro ${jobId}] preparando ${aluno.nome} em ${contexts.length} iDFace.`);
    await updateEnrollmentProgress(authRoute, jobId, 'preparando_usuarios', `Preparando ${aluno.nome} nos ${contexts.length} equipamentos.`, resultSnapshot(contexts));

    // Primeiro prepara TODOS os usuários/grupos. Se algum aparelho falhar, não inicia captura.
    for (const ctx of contexts) {
      ctx.session = await loginDevice(ctx.route);
      const user = await ensureDeviceUser(ctx.route, ctx.session, aluno);
      ctx.userId = user.userId;
      ctx.userCreated = user.created;
      await ensureDeviceGroup(ctx.route, ctx.session, ctx.userId, groupId);
      ctx.groupOk = true;
      ctx.message = 'Usuário e Grupo 1 preparados.';
      await updateEnrollmentProgress(authRoute, jobId, 'preparando_usuarios', `${ctx.route.name}: usuário ${ctx.userId} preparado.`, resultSnapshot(contexts));
    }

    const source = contexts[0];

    await setDeviceConfiguration(source.route, source.session, { general: { keep_user_image: '0' } });
    const before = await getDeviceConfiguration(source.route, source.session, { online_client: ['extract_face_template'] });
    previousExtract = clean(before?.online_client?.extract_face_template, 10) || '0';
    await setDeviceConfiguration(source.route, source.session, { online_client: { extract_face_template: '1' } });
    const verify = await getDeviceConfiguration(source.route, source.session, { online_client: ['extract_face_template'] });
    if (clean(verify?.online_client?.extract_face_template, 10) !== '1') {
      throw new Error(`${source.route.name}: extract_face_template não ficou em 1.`);
    }

    await updateEnrollmentProgress(
      authRoute,
      jobId,
      'aguardando_captura',
      `Posicione ${aluno.nome} diante do ${source.route.name}. A captura começará em alguns segundos.`,
      resultSnapshot(contexts)
    );
    log(`[cadastro ${jobId}] POSICIONE ${aluno.nome} diante do ${source.route.name}.`);
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_DELAY_MS));

    await updateEnrollmentProgress(authRoute, jobId, 'capturando', `Capturando a face de ${aluno.nome} no ${source.route.name}.`, resultSnapshot(contexts));
    const capture = await deviceApi(source.route, '/remote_enroll.fcgi', {
      session: source.session,
      timeoutMs: 90000,
      body: {
        type: 'face',
        user_id: Number(source.userId),
        save: true,
        sync: true,
        auto: true,
        countdown: 3,
      },
    });

    if (capture?.success !== true) throw new Error(safeEnrollmentError(capture, `${source.route.name}: captura facial não concluída.`));
    if (!capture?.face_template || typeof capture.face_template !== 'string') {
      throw new Error(`${source.route.name}: captura concluída sem retorno de face_template.`);
    }
    template = capture.face_template;
    source.biometricStatus = 'capturada';
    source.ok = true;
    source.message = 'Face capturada; fotografia não persistida pelo Axoriin/Bridge.';
    log(`[cadastro ${jobId}] captura concluída; template mantido somente em memória.`);

    await updateEnrollmentProgress(authRoute, jobId, 'replicando', 'Captura concluída. Replicando a credencial facial para os demais aparelhos.', resultSnapshot(contexts));

    for (let i = 1; i < contexts.length; i += 1) {
      const ctx = contexts[i];
      const enroll = await deviceApi(ctx.route, '/face_template_enroll.fcgi', {
        session: ctx.session,
        timeoutMs: 30000,
        body: {
          match: true,
          face_templates: [{
            user_id: Number(ctx.userId),
            timestamp: Math.floor(Date.now() / 1000),
            face_template: template,
          }],
        },
      });
      const item = Array.isArray(enroll?.results)
        ? enroll.results.find((r) => Number(r?.user_id) === Number(ctx.userId))
        : null;
      if (!item) throw new Error(`${ctx.route.name}: resposta do face_template_enroll sem resultado para user_id ${ctx.userId}.`);
      if (item.success !== true) {
        const errors = Array.isArray(item.errors) ? item.errors : [];
        const sameUser = errors.some((e) => Number(e?.info?.match_user_id) === Number(ctx.userId));
        if (sameUser) {
          ctx.biometricStatus = 'ja_existente';
          ctx.ok = true;
          ctx.message = 'A mesma face já estava cadastrada neste usuário.';
        } else {
          const details = errors.map((e) => `${clean(e?.code, 60)} ${clean(e?.message, 180)}`.trim()).filter(Boolean).join(' | ');
          throw new Error(`${ctx.route.name}: template recusado${details ? ` - ${details}` : ''}.`);
        }
      } else {
        ctx.biometricStatus = 'replicada';
        ctx.ok = true;
        ctx.message = 'Template facial replicado.';
      }
      await updateEnrollmentProgress(authRoute, jobId, 'replicando', `${ctx.route.name}: credencial facial pronta.`, resultSnapshot(contexts));
    }

    await updateEnrollmentProgress(authRoute, jobId, 'criando_vinculos', 'Biometria concluída. O Axoriin está criando os vínculos device_id + user_id.', resultSnapshot(contexts));

    const completion = await bridgePost(authRoute, `/bridge/enrollment/${encodeURIComponent(jobId)}/complete`, {
      ok: true,
      mensagem: 'Cadastro facial único concluído em todos os aparelhos.',
      resultados: resultSnapshot(contexts),
    });
    log(`[cadastro ${jobId}] CONCLUÍDO para ${aluno.nome}.`);
    return completion;
  } catch (err) {
    warn(`[cadastro ${jobId}] falhou:`, err.message);
    for (const ctx of contexts) {
      if (!ctx.ok && ctx.biometricStatus === 'nao_iniciado') {
        ctx.biometricStatus = 'falhou';
        if (!ctx.message) ctx.message = err.message;
      }
    }
    await bridgePost(authRoute, `/bridge/enrollment/${encodeURIComponent(jobId)}/complete`, {
      ok: false,
      errorCode: 'BRIDGE_ENROLLMENT_FAILED',
      errorMessage: clean(err.message, 500),
      mensagem: clean(err.message, 500),
      resultados: resultSnapshot(contexts),
    }).catch((completeErr) => warn(`[cadastro ${jobId}] falha ao reportar erro:`, completeErr.message));
    return null;
  } finally {
    const source = contexts[0];
    if (source?.session && previousExtract && /^[01]$/.test(previousExtract)) {
      await setDeviceConfiguration(source.route, source.session, {
        online_client: { extract_face_template: String(previousExtract) },
      }).catch((err) => warn(`[cadastro ${jobId}] não foi possível restaurar extract_face_template:`, err.message));
    }
    template = null;
  }
}

let enrollmentBusy = false;
let lastPollError = '';

async function pollEnrollmentCommands() {
  if (enrollmentBusy || !CENTRAL_ENROLLMENT_CONFIGURED) return;
  enrollmentBusy = true;
  try {
    for (const route of ROUTES) {
      const result = await bridgePost(route, '/bridge/enrollment/claim', {});
      if (result?.job) {
        lastPollError = '';
        await executeEnrollmentJob(result.job, route);
        break;
      }
    }
  } catch (err) {
    const msg = clean(err.message, 300);
    if (msg !== lastPollError) warn('[cadastro] fila do Axoriin indisponível:', msg);
    lastPollError = msg;
  } finally {
    enrollmentBusy = false;
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'axoriin-face-bridge',
      version: '1.2.0',
      configured: Boolean(AXORIIN_BASE_URL && ROUTES.length),
      centralEnrollmentConfigured: CENTRAL_ENROLLMENT_CONFIGURED,
      noPhotoStorage: true,
      devices: ROUTES.map((r) => ({ slot: r.slot, name: r.name, ip: r.ip, deviceId: r.deviceId })),
    });
  }

  if (req.method === 'POST' && pathname === '/api/notifications/access_photo') {
    return discardPhoto(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/notifications/dao') {
    return handleDao(req, res);
  }

  if (req.method === 'POST' && pathname.startsWith('/api/notifications/')) {
    const remoteIp = normalizeRemoteAddress(req);
    req.resume();
    req.on('end', () => {
      if (!ROUTES.some((r) => r.ip === remoteIp)) return json(res, 403, { ok: false, mensagem: 'Origem não autorizada.' });
      return json(res, 200, { ok: true, ignored: true });
    });
    return;
  }

  req.resume();
  return json(res, 404, { ok: false, mensagem: 'Endpoint não encontrado.' });
});

server.listen(PORT, HOST, async () => {
  await ensureQueue().catch(() => {});
  log(`Axoriin Face Bridge 1.2 ouvindo em http://${HOST}:${PORT}`);
  log('Monitor Control iD: path api/notifications -> POST /api/notifications/dao');
  if (!AXORIIN_BASE_URL) warn('AXORIIN_BASE_URL não definido.');
  if (!ROUTES.length) warn('Nenhum iDFace configurado. O bridge rejeitará callbacks até que as rotas sejam definidas.');
  else ROUTES.forEach((r) => log(`[device] ${r.name}: ${r.ip}:${r.port} / ${r.deviceId}`));
  if (CENTRAL_ENROLLMENT_CONFIGURED) log('[cadastro] cadastro facial central ATIVO; credenciais Control iD mantidas somente neste processo.');
  else warn('[cadastro] cadastro facial central INATIVO: informe IDFACE_API_USER e IDFACE_API_PASSWORD ao iniciar o Bridge.');
  retryQueue().catch((e) => warn('[fila]', e.message));
  pollEnrollmentCommands().catch((e) => warn('[cadastro]', e.message));
});

setInterval(() => retryQueue().catch((e) => warn('[fila]', e.message)), RETRY_MS).unref();
setInterval(() => pollEnrollmentCommands().catch((e) => warn('[cadastro]', e.message)), COMMAND_POLL_MS).unref();
