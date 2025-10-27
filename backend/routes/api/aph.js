// routes/api/aph.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AphAtendimento = require('../../models/AphAtendimento');

// ---------- utils de normalização ----------
function normSN(v) {
  // aceita "Sim"/"Não", boolean ou strings variadas
  if (typeof v === 'string') {
    return v.trim().toLowerCase().startsWith('s') ? 'Sim' : 'Não';
  }
  if (typeof v === 'boolean') {
    return v ? 'Sim' : 'Não';
  }
  return 'Não';
}
function pickMeio(body) {
  // prioridade: campo atual -> legado flat -> legado aninhado
  return (
    (body.meioComunicacao || '').trim() ||
    (body.meio || '').trim() ||
    (body.comunicacao && (body.comunicacao.meio || '').trim()) ||
    ''
  );
}
function pickEncaminhamento(body) {
  return (
    (body.encaminhamento || '').trim() ||
    (body.comunicacao && (body.comunicacao.encaminhamento || '').trim()) ||
    ''
  );
}
function pickInformados(body) {
  // aceita responsaveisInformados (string), ou informados (boolean), ou comunicacao.informados
  if (body.responsaveisInformados != null) return normSN(body.responsaveisInformados);
  if (typeof body.informados === 'boolean') return normSN(body.informados);
  if (body.comunicacao && typeof body.comunicacao.informados === 'boolean') {
    return normSN(body.comunicacao.informados);
  }
  return 'Não';
}
function sanitizeArray(arr) {
  return Array.isArray(arr) ? arr.filter(x => !!x).map(String) : [];
}
function sanitizeStr(s) {
  return (s == null ? '' : String(s)).trim();
}

// ---------- CREATE ----------
router.post('/atendimentos', async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.alunoId || !mongoose.Types.ObjectId.isValid(body.alunoId)) {
      return res.status(400).json({ message: 'alunoId inválido ou ausente' });
    }

    const doc = new AphAtendimento({
      alunoId: body.alunoId,
      responsavel: sanitizeStr(body.responsavel),
      local: sanitizeStr(body.local),
      hora: sanitizeStr(body.hora),

      tipos: sanitizeArray(body.tipos),
      materiais: sanitizeArray(body.materiais),

      observacoes: sanitizeStr(body.observacoes),

      // comunicação - nomes do schema
      responsaveisInformados: pickInformados(body), // "Sim"/"Não"
      meioComunicacao: pickMeio(body),
      encaminhamento: pickEncaminhamento(body),

      // metadados
      criadoPor: sanitizeStr(body.criadoPor || (req.user && req.user.nome) || ''),
    });

    const saved = await doc.save();
    return res.json(saved);
  } catch (e) {
    console.error('POST /api/aph/atendimentos erro:', e);
    return res.status(500).json({ message: 'Falha ao salvar atendimento' });
  }
});

// ---------- UPDATE ----------
router.put('/atendimentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id inválido' });
    }

    const update = {
      responsavel: sanitizeStr(body.responsavel),
      local: sanitizeStr(body.local),
      hora: sanitizeStr(body.hora),

      tipos: sanitizeArray(body.tipos),
      materiais: sanitizeArray(body.materiais),

      observacoes: sanitizeStr(body.observacoes),

      // comunicação (sempre gravar nos campos do schema)
      responsaveisInformados: pickInformados(body),
      meioComunicacao: pickMeio(body),
      encaminhamento: pickEncaminhamento(body),
    };

    const saved = await AphAtendimento.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );

    if (!saved) return res.status(404).json({ message: 'Registro não encontrado' });
    return res.json(saved);
  } catch (e) {
    console.error('PUT /api/aph/atendimentos/:id erro:', e);
    return res.status(500).json({ message: 'Falha ao atualizar atendimento' });
  }
});

// ---------- READ (por aluno) ----------
router.get('/atendimentos/:alunoId', async (req, res) => {
  try {
    const { alunoId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(alunoId)) {
      return res.status(400).json({ message: 'alunoId inválido' });
    }
    const itens = await AphAtendimento.find({ alunoId })
      .sort({ createdAt: -1 })
      .lean();

    // normaliza campos na resposta (compatibilidade)
    const norm = itens.map(a => ({
      ...a,
      responsaveisInformados: normSN(
        a.responsaveisInformados != null ? a.responsaveisInformados :
        (typeof a.informados === 'boolean' ? a.informados : (a.comunicacao && a.comunicacao.informados))
      ),
      meioComunicacao: a.meioComunicacao || a.meio || (a.comunicacao && a.comunicacao.meio) || '',
      encaminhamento: a.encaminhamento || (a.comunicacao && a.comunicacao.encaminhamento) || '',
    }));

    return res.json(norm);
  } catch (e) {
    console.error('GET /api/aph/atendimentos/:alunoId erro:', e);
    return res.status(500).json({ message: 'Falha ao buscar atendimentos' });
  }
});

// ---------- READ (um por id) ----------
router.get('/atendimento/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id inválido' });
    }
    const a = await AphAtendimento.findById(id).lean();
    if (!a) return res.status(404).json({ message: 'Registro não encontrado' });

    const norm = {
      ...a,
      responsaveisInformados: normSN(
        a.responsaveisInformados != null ? a.responsaveisInformados :
        (typeof a.informados === 'boolean' ? a.informados : (a.comunicacao && a.comunicacao.informados))
      ),
      meioComunicacao: a.meioComunicacao || a.meio || (a.comunicacao && a.comunicacao.meio) || '',
      encaminhamento: a.encaminhamento || (a.comunicacao && a.comunicacao.encaminhamento) || '',
    };

    return res.json(norm);
  } catch (e) {
    console.error('GET /api/aph/atendimento/:id erro:', e);
    return res.status(500).json({ message: 'Falha ao buscar atendimento' });
  }
});

module.exports = router;
