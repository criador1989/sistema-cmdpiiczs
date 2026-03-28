const express = require('express');
const router = express.Router();

const Monitor = require('../../models/Monitor');
const Presenca = require('../../models/MonitorPresenca');
const Nota = require('../../models/MonitorNota');
const Atividade = require('../../models/MonitorAtividade');

const { autenticar } = require('../../middleware/autenticacao');

/* =========================================================
   HELPERS MULTI-TENANT
========================================================= */

function getTenantId(req) {
  return (
    req.tenantId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.instituicaoId ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    null
  );
}

function exigirTenant(req, res, next) {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    return res.status(400).json({
      erro: 'Tenant não identificado na requisição.',
    });
  }
  req.tenantId = tenantId;
  return next();
}

/**
 * Como os models foram adaptados para multi-tenant com
 * tenantId + instituicao sincronizados, usamos um filtro
 * compatível com as duas possibilidades para não quebrar
 * dados já existentes durante a transição.
 */
function tenantClause(req) {
  return {
    $or: [
      { tenantId: req.tenantId },
      { instituicao: req.tenantId },
    ],
  };
}

function applyTenantData(req, payload = {}) {
  return {
    ...payload,
    tenantId: req.tenantId,
    instituicao: req.tenantId,
  };
}

function getUsuarioId(req) {
  return req.usuario?._id || req.user?._id || req.auth?._id || null;
}

/* =========================================================
   MIDDLEWARE: EXIGIR ADMIN
========================================================= */

function exigirAdmin(req, res, next) {
  const u = req.usuario || req.user || req.auth || {};
  const rawRole = u.perfil || u.role || u.papel || u.tipo || '';

  const roles = Array.isArray(rawRole)
    ? rawRole.map(r => String(r).trim().toLowerCase())
    : String(rawRole)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

  const isAdmin =
    roles.includes('admin') ||
    roles.includes('administrador');

  if (!isAdmin) {
    return res.status(403).json({
      erro: 'Apenas administradores.',
      role: rawRole || null,
    });
  }

  return next();
}

/* =========================================================
   ATIVIDADES / AGENDA
   (rotas específicas antes das rotas com /:id)
========================================================= */

// Criar atividade
router.post('/atividades', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.titulo || !body.inicio || !body.fim) {
      return res.status(400).json({ erro: 'titulo, inicio e fim são obrigatórios' });
    }

    const payload = applyTenantData(req, {
      ...body,
      criadoPor: getUsuarioId(req),
    });

    const doc = await Atividade.create(payload);
    return res.status(201).json(doc);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao criar atividade',
      detalhe: e.message,
    });
  }
});

// Listar atividades por período
router.get('/atividades', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const { de, ate, tipo } = req.query;

    const filtro = {
      ...tenantClause(req),
    };

    if (de || ate) {
      filtro.inicio = {};
      if (de) filtro.inicio.$gte = new Date(de);
      if (ate) filtro.inicio.$lte = new Date(ate);
    }

    if (tipo) filtro.tipo = tipo;

    const itens = await Atividade.find(filtro)
      .sort({ inicio: 1 })
      .populate('participantes', 'nome')
      .lean();

    return res.json(itens);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao listar atividades',
      detalhe: e.message,
    });
  }
});

// Atualizar atividade
router.patch('/atividades/:id', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    // proteção para não permitir troca manual de tenant pela requisição
    delete body.tenantId;
    delete body.instituicao;

    const payload = {
      ...body,
      atualizadoPor: getUsuarioId(req),
    };

    const doc = await Atividade.findOneAndUpdate(
      {
        _id: req.params.id,
        ...tenantClause(req),
      },
      payload,
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ erro: 'Atividade não encontrada' });
    }

    return res.json(doc);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao atualizar atividade',
      detalhe: e.message,
    });
  }
});

// Excluir atividade
router.delete('/atividades/:id', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const doc = await Atividade.findOneAndDelete({
      _id: req.params.id,
      ...tenantClause(req),
    });

    if (!doc) {
      return res.status(404).json({ erro: 'Atividade não encontrada' });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao excluir atividade',
      detalhe: e.message,
    });
  }
});

/* =========================================================
   DASHBOARD RÁPIDO
========================================================= */

router.get('/__stats', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const base = tenantClause(req);

    const [ativos, inativos, total] = await Promise.all([
      Monitor.countDocuments({ ...base, ativo: true }),
      Monitor.countDocuments({ ...base, ativo: false }),
      Monitor.countDocuments(base),
    ]);

    return res.json({ total, ativos, inativos });
  } catch (e) {
    return res.status(500).json({
      erro: 'Falha ao computar stats',
      detalhe: e.message,
    });
  }
});

/* =========================================================
   MONITORES
========================================================= */

// Lista com filtros básicos
router.get('/', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const { q = '', ativo, turno } = req.query;

    const filtro = {
      ...tenantClause(req),
    };

    if (q) {
      filtro.$and = filtro.$and || [];
      filtro.$and.push({
        $or: [
          { nome: new RegExp(q, 'i') },
          { matricula: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') },
          { telefone: new RegExp(q, 'i') },
        ],
      });
    }

    if (ativo === 'true' || ativo === 'false') {
      filtro.ativo = ativo === 'true';
    }

    if (turno) {
      filtro.turno = turno;
    }

    const itens = await Monitor.find(filtro)
      .sort({ nome: 1 })
      .lean();

    return res.json(itens);
  } catch (e) {
    return res.status(500).json({
      erro: 'Falha ao listar',
      detalhe: e.message,
    });
  }
});

// Criar
router.post('/', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    const payload = applyTenantData(req, {
      ...body,
      criadoPor: getUsuarioId(req),
    });

    const doc = await Monitor.create(payload);
    return res.status(201).json(doc);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao criar',
      detalhe: e.message,
    });
  }
});

// Obter por id
router.get('/:id', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const m = await Monitor.findOne({
      _id: req.params.id,
      ...tenantClause(req),
    }).lean();

    if (!m) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    return res.json(m);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao buscar',
      detalhe: e.message,
    });
  }
});

// Atualizar
router.patch('/:id', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};

    delete body.tenantId;
    delete body.instituicao;

    const payload = {
      ...body,
      atualizadoPor: getUsuarioId(req),
    };

    const m = await Monitor.findOneAndUpdate(
      {
        _id: req.params.id,
        ...tenantClause(req),
      },
      payload,
      { new: true }
    );

    if (!m) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    return res.json(m);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao atualizar',
      detalhe: e.message,
    });
  }
});

// "Excluir" (soft delete) -> ativo=false e dataDesligamento
router.delete('/:id', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const m = await Monitor.findOneAndUpdate(
      {
        _id: req.params.id,
        ...tenantClause(req),
      },
      {
        ativo: false,
        dataDesligamento: new Date(),
        atualizadoPor: getUsuarioId(req),
      },
      { new: true }
    );

    if (!m) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    return res.json({ ok: true, monitor: m });
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao excluir',
      detalhe: e.message,
    });
  }
});

/* =========================================================
   PRESENÇAS
========================================================= */

// Marcar presença/ausência do dia (ou data específica)
router.post('/:id/presencas', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const { status, motivo = '', observacao = '', data } = req.body;

    if (!['P', 'A', 'FJ'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido (use P, A ou FJ)' });
    }

    const monitor = await Monitor.findOne({
      _id: req.params.id,
      ...tenantClause(req),
    }).select('_id');

    if (!monitor) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    const d = data ? new Date(data) : new Date();
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const doc = await Presenca.findOneAndUpdate(
      {
        monitor: req.params.id,
        data: dia,
        ...tenantClause(req),
      },
      {
        $set: applyTenantData(req, {
          monitor: req.params.id,
          data: dia,
          status,
          motivo,
          observacao,
          registradoPor: getUsuarioId(req),
        }),
      },
      { new: true, upsert: true }
    );

    return res.status(201).json(doc);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao registrar presença',
      detalhe: e.message,
    });
  }
});

// Listar presenças por monitor com faixa de datas
router.get('/:id/presencas', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const { de, ate } = req.query;

    const monitor = await Monitor.findOne({
      _id: req.params.id,
      ...tenantClause(req),
    }).select('_id');

    if (!monitor) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    const filtro = {
      monitor: req.params.id,
      ...tenantClause(req),
    };

    if (de || ate) {
      filtro.data = {};
      if (de) filtro.data.$gte = new Date(de);
      if (ate) filtro.data.$lte = new Date(ate);
    }

    const itens = await Presenca.find(filtro)
      .sort({ data: -1 })
      .lean();

    return res.json(itens);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao listar presenças',
      detalhe: e.message,
    });
  }
});

/* =========================================================
   NOTAS / OBSERVAÇÕES
========================================================= */

router.post('/:id/notas', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const { texto, tipo = 'observacao', pontos = 0, data } = req.body;

    if (!texto || !texto.trim()) {
      return res.status(400).json({ erro: 'Texto é obrigatório' });
    }

    const monitor = await Monitor.findOne({
      _id: req.params.id,
      ...tenantClause(req),
    }).select('_id');

    if (!monitor) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    const nota = await Nota.create(
      applyTenantData(req, {
        monitor: req.params.id,
        data: data ? new Date(data) : new Date(),
        tipo,
        texto,
        pontos,
        registradoPor: getUsuarioId(req),
      })
    );

    if (Number(pontos)) {
      await Monitor.findOneAndUpdate(
        {
          _id: req.params.id,
          ...tenantClause(req),
        },
        { $inc: { score: Number(pontos) } }
      );
    }

    return res.status(201).json(nota);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao criar nota',
      detalhe: e.message,
    });
  }
});

router.get('/:id/notas', autenticar, exigirTenant, exigirAdmin, async (req, res) => {
  try {
    const monitor = await Monitor.findOne({
      _id: req.params.id,
      ...tenantClause(req),
    }).select('_id');

    if (!monitor) {
      return res.status(404).json({ erro: 'Monitor não encontrado' });
    }

    const itens = await Nota.find({
      monitor: req.params.id,
      ...tenantClause(req),
    })
      .sort({ data: -1, createdAt: -1 })
      .lean();

    return res.json(itens);
  } catch (e) {
    return res.status(400).json({
      erro: 'Falha ao listar notas',
      detalhe: e.message,
    });
  }
});

module.exports = router;