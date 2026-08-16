'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const Aluno = require('../../models/Aluno');
const AttendanceSession = require('../../models/AttendanceSession');
const AttendanceRecord = require('../../models/AttendanceRecord');
const DailyStudentAccess = require('../../models/DailyStudentAccess');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { attachActor, logAction } = require('../../utils/audit');
const attendanceProvider = require('../../services/attendanceProvider');
const { getPolicy, classShift } = require('../../services/accessPolicyService');

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeClass(value) {
  return clean(value, 80)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slugPart(value) {
  return normalizeClass(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'geral';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorId(req) {
  return String(req.usuario?.id || req.usuario?._id || '');
}

function actorName(req) {
  return clean(req.usuario?.nome || req.usuario?.email || 'Usuário', 180);
}

function role(req) {
  return String(req.usuario?.tipo || '').trim().toLowerCase();
}

function isAdmin(req) {
  return ['admin', 'master', 'superadmin'].includes(role(req));
}

function professorCanAccessClass(req, turma) {
  if (isAdmin(req)) return true;
  if (role(req) !== 'professor') return false;

  const turmas = Array.isArray(req.usuario?.turmas) ? req.usuario.turmas : [];
  if (!turmas.length) return true;

  const target = normalizeClass(turma);
  return turmas.map(normalizeClass).includes(target);
}

function requireTeacherOrAdmin(req, res, next) {
  if (role(req) === 'professor' || isAdmin(req)) return next();
  return res.status(403).json({ ok: false, mensagem: 'Acesso permitido apenas a professores ou administradores.' });
}

function validateDateKey(value) {
  const s = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeShift(value) {
  const s = clean(value, 20).toLowerCase();
  return ['matutino', 'vespertino', 'noturno'].includes(s) ? s : null;
}

function makeSessionKey({ dateKey, turno, turma, componenteCurricular, aulaNumero, professorId }) {
  return [
    dateKey,
    turno,
    slugPart(turma),
    slugPart(componenteCurricular || 'geral'),
    Number(aulaNumero || 0),
    String(professorId || ''),
  ].join('|');
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (err) {
    console.warn('[chamada][audit]', err?.message || err);
  }
}

async function ensureCanManageSession(req, session) {
  if (!session) return false;
  if (!professorCanAccessClass(req, session.turma)) return false;
  if (isAdmin(req)) return true;
  return String(session.professor) === actorId(req);
}

async function syncAttendanceRecords(session) {
  const instituicaoId = session.instituicao;
  const turmaRegex = new RegExp(`^${escapeRegex(session.turma)}$`, 'i');

  const [alunos, dailyAccess] = await Promise.all([
    Aluno.find({
      instituicao: instituicaoId,
      turma: turmaRegex,
      ativo: { $ne: false },
    })
      .select('_id nome turma')
      .sort({ nome: 1 })
      .lean(),
    DailyStudentAccess.find({
      instituicao: instituicaoId,
      dateKey: session.dateKey,
      turno: session.turno,
      classificacao: 'turno_regular',
      attendanceEligible: true,
    })
      .select('aluno firstEntryAt lastSeenAt detectionCount')
      .lean(),
  ]);

  const accessByStudent = new Map(dailyAccess.map((item) => [String(item.aluno), item]));

  if (alunos.length) {
    const ops = alunos.map((aluno) => {
      const gate = accessByStudent.get(String(aluno._id));
      return {
        updateOne: {
          filter: { session: session._id, aluno: aluno._id },
          update: {
            $setOnInsert: {
              instituicao: instituicaoId,
              tenantId: instituicaoId,
              session: session._id,
              aluno: aluno._id,
              alunoNome: aluno.nome,
              turma: aluno.turma,
              statusProfessor: 'pendente',
            },
            $set: {
              alunoNome: aluno.nome,
              turma: aluno.turma,
              gateDetected: Boolean(gate),
              gateFirstEntryAt: gate?.firstEntryAt || null,
              gateLastSeenAt: gate?.lastSeenAt || null,
              gateDetectionCount: Number(gate?.detectionCount || 0),
            },
          },
          upsert: true,
        },
      };
    });

    await AttendanceRecord.bulkWrite(ops, { ordered: false });
  }

  return AttendanceRecord.find({ session: session._id })
    .sort({ alunoNome: 1 })
    .lean();
}

async function loadSessionWithRecords(req, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const session = await AttendanceSession.findOne({ _id: id, instituicao: req.instituicaoId });
  if (!session) return null;
  if (!(await ensureCanManageSession(req, session))) return { forbidden: true };

  const records = await syncAttendanceRecords(session);
  return { session, records };
}

router.use(autenticar, requireTenant, requireTeacherOrAdmin, attachActor);

router.get('/turmas', async (req, res) => {
  try {
    let turmas;

    if (role(req) === 'professor' && Array.isArray(req.usuario?.turmas) && req.usuario.turmas.length) {
      turmas = [...new Set(req.usuario.turmas.map((t) => clean(t, 80)).filter(Boolean))];
    } else {
      turmas = await Aluno.distinct('turma', { instituicao: req.instituicaoId, ativo: { $ne: false } });
    }

    turmas.sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' }));
    const policy = await getPolicy(req.instituicaoId);
    const detalhes = turmas.map((turma) => ({ turma, turno: classShift(policy, turma) }));
    return res.json({ ok: true, turmas, detalhes });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao listar turmas da chamada.' });
  }
});

router.post('/sessoes/abrir', async (req, res) => {
  try {
    const turma = clean(req.body?.turma, 80);
    const dateKey = validateDateKey(req.body?.dateKey);
    const turno = normalizeShift(req.body?.turno);
    const componenteCurricular = clean(req.body?.componenteCurricular, 120);
    const aulaNumero = Math.min(Math.max(Number(req.body?.aulaNumero || 0), 0), 20);

    if (!turma || !dateKey || !turno) {
      return res.status(400).json({ ok: false, mensagem: 'Informe turma, data e turno.' });
    }

    if (!professorCanAccessClass(req, turma)) {
      return res.status(403).json({ ok: false, mensagem: 'Você não possui acesso a esta turma.' });
    }

    const policy = await getPolicy(req.instituicaoId);
    const configuredShift = classShift(policy, turma);
    if (configuredShift && configuredShift !== turno) {
      return res.status(400).json({
        ok: false,
        mensagem: `A turma ${turma} está configurada para o turno ${configuredShift}. Abra a chamada nesse turno.`,
      });
    }

    const professorId = actorId(req);
    if (!mongoose.isValidObjectId(professorId)) {
      return res.status(401).json({ ok: false, mensagem: 'Usuário da sessão inválido.' });
    }

    const sessionKey = makeSessionKey({
      dateKey,
      turno,
      turma,
      componenteCurricular,
      aulaNumero,
      professorId,
    });

    let session = await AttendanceSession.findOne({
      instituicao: req.instituicaoId,
      sessionKey,
    });

    if (!session) {
      try {
        session = await AttendanceSession.create({
          instituicao: req.instituicaoId,
          tenantId: req.instituicaoId,
          sessionKey,
          dateKey,
          turno,
          turma,
          componenteCurricular,
          aulaNumero,
          professor: professorId,
          professorNome: actorName(req),
          status: 'aberta',
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
        session = await AttendanceSession.findOne({
          instituicao: req.instituicaoId,
          sessionKey,
        });
      }
    }

    const records = await syncAttendanceRecords(session);

    await safeAudit({
      req,
      event: 'CHAMADA_ABERTA',
      targetType: 'AttendanceSession',
      targetId: session._id,
      entidadeNome: `${session.turma} - ${session.dateKey}`,
      modulo: 'chamada',
      meta: { turma, dateKey, turno, totalAlunos: records.length },
    });

    return res.json({
      ok: true,
      session: session.toObject(),
      records,
    });
  } catch (err) {
    console.error('[chamada][abrir]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao abrir a chamada.' });
  }
});

router.get('/sessoes/:id', async (req, res) => {
  try {
    const loaded = await loadSessionWithRecords(req, req.params.id);
    if (!loaded) return res.status(404).json({ ok: false, mensagem: 'Chamada não encontrada.' });
    if (loaded.forbidden) return res.status(403).json({ ok: false, mensagem: 'Sem acesso a esta chamada.' });

    return res.json({
      ok: true,
      session: loaded.session.toObject(),
      records: loaded.records,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao carregar chamada.' });
  }
});

router.patch('/sessoes/:id/registros/:recordId', async (req, res) => {
  try {
    const loaded = await loadSessionWithRecords(req, req.params.id);
    if (!loaded) return res.status(404).json({ ok: false, mensagem: 'Chamada não encontrada.' });
    if (loaded.forbidden) return res.status(403).json({ ok: false, mensagem: 'Sem acesso a esta chamada.' });

    if (loaded.session.status === 'finalizada') {
      return res.status(409).json({ ok: false, mensagem: 'Esta chamada já foi finalizada.' });
    }

    if (!mongoose.isValidObjectId(req.params.recordId)) {
      return res.status(400).json({ ok: false, mensagem: 'Registro inválido.' });
    }

    const allowed = new Set([
      'pendente',
      'presente',
      'ausente',
      'atrasado',
      'falta_justificada',
      'entrou_colegio_fora_sala',
    ]);
    const status = clean(req.body?.statusProfessor, 40);
    if (!allowed.has(status)) {
      return res.status(400).json({ ok: false, mensagem: 'Status de presença inválido.' });
    }

    const record = await AttendanceRecord.findOneAndUpdate(
      {
        _id: req.params.recordId,
        session: loaded.session._id,
        instituicao: req.instituicaoId,
      },
      {
        $set: {
          statusProfessor: status,
          confirmadoPor: status === 'pendente' ? null : actorId(req),
          confirmadoEm: status === 'pendente' ? null : new Date(),
          observacao: clean(req.body?.observacao, 500),
        },
      },
      { new: true, runValidators: true }
    );

    if (!record) return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado nesta chamada.' });

    return res.json({ ok: true, record });
  } catch (err) {
    console.error('[chamada][registro]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao atualizar presença.' });
  }
});

router.post('/sessoes/:id/confirmar-detectados', async (req, res) => {
  try {
    const loaded = await loadSessionWithRecords(req, req.params.id);
    if (!loaded) return res.status(404).json({ ok: false, mensagem: 'Chamada não encontrada.' });
    if (loaded.forbidden) return res.status(403).json({ ok: false, mensagem: 'Sem acesso a esta chamada.' });
    if (loaded.session.status === 'finalizada') {
      return res.status(409).json({ ok: false, mensagem: 'Esta chamada já foi finalizada.' });
    }

    const result = await AttendanceRecord.updateMany(
      {
        session: loaded.session._id,
        instituicao: req.instituicaoId,
        gateDetected: true,
        statusProfessor: 'pendente',
      },
      {
        $set: {
          statusProfessor: 'presente',
          confirmadoPor: actorId(req),
          confirmadoEm: new Date(),
        },
      }
    );

    await safeAudit({
      req,
      event: 'CHAMADA_DETECTADOS_CONFIRMADOS',
      targetType: 'AttendanceSession',
      targetId: loaded.session._id,
      entidadeNome: loaded.session.turma,
      modulo: 'chamada',
      meta: { alterados: result.modifiedCount || 0 },
    });

    const records = await syncAttendanceRecords(loaded.session);
    return res.json({ ok: true, alterados: result.modifiedCount || 0, records });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao confirmar alunos detectados.' });
  }
});

router.post('/sessoes/:id/marcar-pendentes-ausentes', async (req, res) => {
  try {
    const loaded = await loadSessionWithRecords(req, req.params.id);
    if (!loaded) return res.status(404).json({ ok: false, mensagem: 'Chamada não encontrada.' });
    if (loaded.forbidden) return res.status(403).json({ ok: false, mensagem: 'Sem acesso a esta chamada.' });
    if (loaded.session.status === 'finalizada') {
      return res.status(409).json({ ok: false, mensagem: 'Esta chamada já foi finalizada.' });
    }

    const result = await AttendanceRecord.updateMany(
      {
        session: loaded.session._id,
        instituicao: req.instituicaoId,
        statusProfessor: 'pendente',
      },
      {
        $set: {
          statusProfessor: 'ausente',
          confirmadoPor: actorId(req),
          confirmadoEm: new Date(),
        },
      }
    );

    const records = await AttendanceRecord.find({ session: loaded.session._id })
      .sort({ alunoNome: 1 })
      .lean();

    return res.json({ ok: true, alterados: result.modifiedCount || 0, records });
  } catch (err) {
    return res.status(500).json({ ok: false, mensagem: 'Erro ao marcar ausências.' });
  }
});

router.post('/sessoes/:id/finalizar', async (req, res) => {
  try {
    const loaded = await loadSessionWithRecords(req, req.params.id);
    if (!loaded) return res.status(404).json({ ok: false, mensagem: 'Chamada não encontrada.' });
    if (loaded.forbidden) return res.status(403).json({ ok: false, mensagem: 'Sem acesso a esta chamada.' });

    const pending = await AttendanceRecord.countDocuments({
      session: loaded.session._id,
      statusProfessor: 'pendente',
    });

    if (pending > 0) {
      return res.status(409).json({
        ok: false,
        mensagem: `Ainda existem ${pending} aluno(s) sem confirmação.`,
        pending,
      });
    }

    loaded.session.status = 'finalizada';
    loaded.session.finalizadaEm = new Date();
    loaded.session.finalizadaPor = actorId(req);
    await loaded.session.save();

    const records = await AttendanceRecord.find({ session: loaded.session._id })
      .sort({ alunoNome: 1 })
      .lean();

    const external = await attendanceProvider.enviarChamada({
      session: loaded.session.toObject(),
      records,
    });

    loaded.session.integracaoSimaed = {
      status: external?.status || 'nao_configurado',
      tentativaEm: external?.configured ? new Date() : null,
      enviadoEm: external?.ok ? new Date() : null,
      externalId: external?.externalId || null,
      erro: external?.ok ? null : clean(external?.message || '', 500) || null,
    };
    await loaded.session.save();

    await safeAudit({
      req,
      event: 'CHAMADA_FINALIZADA',
      targetType: 'AttendanceSession',
      targetId: loaded.session._id,
      entidadeNome: loaded.session.turma,
      modulo: 'chamada',
      meta: {
        total: records.length,
        integracaoSimaed: loaded.session.integracaoSimaed?.status || 'nao_configurado',
      },
    });

    return res.json({
      ok: true,
      session: loaded.session.toObject(),
      records,
      external,
    });
  } catch (err) {
    console.error('[chamada][finalizar]', err);
    return res.status(500).json({ ok: false, mensagem: 'Erro ao finalizar chamada.' });
  }
});

module.exports = router;
