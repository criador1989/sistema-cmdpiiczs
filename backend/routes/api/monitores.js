const express = require('express');
const router = express.Router();

const Monitor = require('../../models/Monitor');
const Presenca = require('../../models/MonitorPresenca');
const Nota = require('../../models/MonitorNota');
const Atividade = require('../../models/MonitorAtividade');

const { autenticar } = require('../../middleware/autenticacao');

// Middleware: exigir admin
function exigirAdmin(req, res, next) {
  const u = req.usuario || req.user || req.auth || {};
  // agora considera também "tipo", igual ao index.js
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

/** ------------- MONITORES ------------- **/

// Lista com filtros básicos
router.get('/', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { q = '', ativo, turno } = req.query;
    const filtro = {};
    if (q) {
      filtro.$or = [
        { nome: new RegExp(q, 'i') },
        { matricula: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { telefone: new RegExp(q, 'i') },
      ];
    }
    if (ativo === 'true' || ativo === 'false') filtro.ativo = ativo === 'true';
    if (turno) filtro.turno = turno;

    const itens = await Monitor.find(filtro).sort({ nome: 1 }).lean();
    res.json(itens);
  } catch (e) {
    res.status(500).json({ erro: 'Falha ao listar', detalhe: e.message });
  }
});

// Criar
router.post('/', autenticar, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    body.criadoPor = req.usuario?._id || req.user?._id || null;
    const doc = await Monitor.create(body);
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao criar', detalhe: e.message });
  }
});

// Obter por id
router.get('/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const m = await Monitor.findById(req.params.id).lean();
    if (!m) return res.status(404).json({ erro: 'Monitor não encontrado' });
    res.json(m);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao buscar', detalhe: e.message });
  }
});

// Atualizar
router.patch('/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    body.atualizadoPor = req.usuario?._id || req.user?._id || null;
    const m = await Monitor.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!m) return res.status(404).json({ erro: 'Monitor não encontrado' });
    res.json(m);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao atualizar', detalhe: e.message });
  }
});

// "Excluir" (soft delete) -> ativo=false e dataDesligamento
router.delete('/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const m = await Monitor.findByIdAndUpdate(
      req.params.id,
      { ativo: false, dataDesligamento: new Date() },
      { new: true }
    );
    if (!m) return res.status(404).json({ erro: 'Monitor não encontrado' });
    res.json({ ok: true, monitor: m });
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao excluir', detalhe: e.message });
  }
});

/** ------------- PRESENÇAS ------------- **/

// Marcar presença/ausência do dia (ou data específica)
router.post('/:id/presencas', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { status, motivo = '', observacao = '', data } = req.body;
    if (!['P','A','FJ'].includes(status)) {
      return res.status(400).json({ erro: 'Status inválido (use P, A ou FJ)' });
    }
    const d = data ? new Date(data) : new Date();
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const doc = await Presenca.findOneAndUpdate(
      { monitor: req.params.id, data: dia },
      {
        $set: {
          monitor: req.params.id,
          data: dia,
          status,
          motivo,
          observacao,
          registradoPor: req.usuario?._id || req.user?._id || null,
        }
      },
      { new: true, upsert: true }
    );

    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao registrar presença', detalhe: e.message });
  }
});

// Listar presenças por monitor com faixa de datas
router.get('/:id/presencas', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { de, ate } = req.query;
    const filtro = { monitor: req.params.id };
    if (de || ate) {
      filtro.data = {};
      if (de) filtro.data.$gte = new Date(de);
      if (ate) filtro.data.$lte = new Date(ate);
    }
    const itens = await Presenca.find(filtro).sort({ data: -1 }).lean();
    res.json(itens);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao listar presenças', detalhe: e.message });
  }
});

/** ------------- NOTAS/OBSERVAÇÕES ------------- **/

router.post('/:id/notas', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { texto, tipo = 'observacao', pontos = 0, data } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto é obrigatório' });

    const nota = await Nota.create({
      monitor: req.params.id,
      data: data ? new Date(data) : new Date(),
      tipo, texto, pontos,
      registradoPor: req.usuario?._id || req.user?._id || null
    });

    // atualiza score do monitor
    if (Number(pontos)) {
      await Monitor.findByIdAndUpdate(req.params.id, { $inc: { score: Number(pontos) } });
    }

    res.status(201).json(nota);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao criar nota', detalhe: e.message });
  }
});

router.get('/:id/notas', autenticar, exigirAdmin, async (req, res) => {
  try {
    const itens = await Nota.find({ monitor: req.params.id }).sort({ data: -1, createdAt: -1 }).lean();
    res.json(itens);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao listar notas', detalhe: e.message });
  }
});

/** ------------- ATIVIDADES / AGENDA ------------- **/

// Criar atividade
router.post('/atividades', autenticar, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.titulo || !body.inicio || !body.fim) {
      return res.status(400).json({ erro: 'titulo, inicio e fim são obrigatórios' });
    }
    body.criadoPor = req.usuario?._id || req.user?._id || null;
    const doc = await Atividade.create(body);
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao criar atividade', detalhe: e.message });
  }
});

// Listar atividades por período
router.get('/atividades', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { de, ate, tipo } = req.query;
    const filtro = {};
    if (de || ate) {
      filtro.inicio = {};
      if (de) filtro.inicio.$gte = new Date(de);
      if (ate) filtro.inicio.$lte = new Date(ate);
    }
    if (tipo) filtro.tipo = tipo;

    const itens = await Atividade.find(filtro).sort({ inicio: 1 }).populate('participantes', 'nome').lean();
    res.json(itens);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao listar atividades', detalhe: e.message });
  }
});

// Atualizar atividade
router.patch('/atividades/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    body.atualizadoPor = req.usuario?._id || req.user?._id || null;
    const doc = await Atividade.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!doc) return res.status(404).json({ erro: 'Atividade não encontrada' });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao atualizar atividade', detalhe: e.message });
  }
});

// Excluir atividade
router.delete('/atividades/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    await Atividade.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ erro: 'Falha ao excluir atividade', detalhe: e.message });
  }
});

/** ------------- DASHBOARD RÁPIDO ------------- **/
router.get('/__stats', autenticar, exigirAdmin, async (_req, res) => {
  try {
    const [ativos, inativos, total] = await Promise.all([
      Monitor.countDocuments({ ativo: true }),
      Monitor.countDocuments({ ativo: false }),
      Monitor.countDocuments({})
    ]);
    res.json({ total, ativos, inativos });
  } catch (e) {
    res.status(500).json({ erro: 'Falha ao computar stats', detalhe: e.message });
  }
});

module.exports = router;
