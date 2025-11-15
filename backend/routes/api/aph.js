// backend/routes/api/aph.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const AphAtendimento = require('../../models/AphAtendimento');
const Aluno = require('../../models/Aluno');

/* -------------------- utils -------------------- */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

function endOfDay(d) {
  // garante inclusão do último dia por completo
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// timeout “macio” para chamadas externas (ex.: mensageria)
function withTimeout(promise, ms = 8000, label = 'operação') {
  let t;
  const timer = new Promise((resolve) => {
    t = setTimeout(() => {
      resolve({ __timeout: true, ok: false, erro: `Timeout ${label} (${ms}ms)` });
    }, ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timer]);
}

function montarMensagemAPH({ aluno, at }) {
  const nome  = aluno?.nome || 'Aluno(a)';
  const turma = aluno?.turma || '—';

  const data = at?.data ? new Date(at.data) : null;
  const dataStr = data ? data.toLocaleDateString('pt-BR') : '—';
  const horaStr = (at?.hora && String(at.hora).trim()) ? String(at.hora).trim() : '—';
  const local   = at?.local || '—';

  const tipos = Array.isArray(at?.tipos) && at.tipos.length ? at.tipos.join(', ') : '—';
  const materiais = Array.isArray(at?.materiais) && at.materiais.length ? at.materiais.join(', ') : '—';

  const sintomas = (at?.sinaisESintomas || '').trim();
  const procedimentos = (at?.procedimentos || '').trim();
  const observ = (at?.observacoes || at?.observacao || '').trim();
  const encaminhamento = (at?.houveEncaminhamento || at?.encaminhamento) ? 'Sim' : 'Não';

  const linhas = [
    `Prezados responsáveis de ${nome} (${turma}),`,
    ``,
    `Registramos um atendimento de APH realizado pela escola:`,
    `• Data: ${dataStr}  • Hora: ${horaStr}  • Local: ${local}`,
    `• Ocorrência(s): ${tipos}`,
    `• Materiais/recursos aplicados: ${materiais}`,
  ];
  if (sintomas)       linhas.push(`• Sinais/sintomas: ${sintomas}`);
  if (procedimentos)  linhas.push(`• Procedimentos realizados: ${procedimentos}`);
  if (observ)         linhas.push(`• Observações: ${observ}`);
  // mostramos "Encaminhamento: Sim/Não" explícito
  linhas.push(`• Encaminhamento: ${encaminhamento}`);

  linhas.push(
    ``,
    `Este comunicado é informativo. Permanecemos à disposição.`,
    `Atenciosamente,`,
    `Coordenação — CMDPII/CZS`
  );

  return { titulo: `Comunicado de APH — ${nome}`, texto: linhas.join('\n') };
}

/* -------------------- parse de data robusto -------------------- */
function parseDateOnlyLocal(v) {
  if (!v) return new Date();
  if (typeof v === 'string') {
    const iso = /^\d{4}-\d{2}-\d{2}/.test(v);
    const br  = /^\d{2}\/\d{2}\/\d{4}$/.test(v);
    if (iso)   return new Date(v + (v.length === 10 ? 'T00:00:00' : ''));
    if (br) {
      const [dd, mm, yyyy] = v.split('/').map(Number);
      return new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    }
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? new Date() : new Date(t);
}

/* =========================================================
   STATUS
   ========================================================= */
router.get('/status', (_req, res) => res.json({ ok: true, service: 'aph' }));

/* =========================================================
   LISTAS / DETALHES
   ========================================================= */

// GET /api/aph/atendimentos?alunoId=...&q=...&dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD&page=1&limit=20
router.get('/atendimentos', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);

    const filtro = { instituicao: inst };

    // filtro por aluno
    if (req.query.alunoId && mongoose.isValidObjectId(req.query.alunoId)) {
      filtro.alunoId = new mongoose.Types.ObjectId(req.query.alunoId);
    }

    // filtro por data com inclusão do último dia (23:59:59.999)
    const { dtIni, dtFim } = req.query;
    if (dtIni || dtFim) {
      const dataFiltro = {};
      if (dtIni && !Number.isNaN(Date.parse(dtIni))) dataFiltro.$gte = new Date(dtIni);
      if (dtFim && !Number.isNaN(Date.parse(dtFim))) dataFiltro.$lte = endOfDay(dtFim);
      if (Object.keys(dataFiltro).length) filtro.data = dataFiltro;
    }

    // busca textual
    const q = (req.query.q || '').trim();
    if (q) {
      const regex = new RegExp(q, 'i');
      filtro.$or = [
        { responsavel: regex },
        { local: regex },
        { tipos: regex },
        { materiais: regex },
        { observacoes: regex },
        { procedimentos: regex },
        { sinaisESintomas: regex },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, list] = await Promise.all([
      AphAtendimento.countDocuments(filtro),
      AphAtendimento.find(filtro)
        .sort({ data: -1, hora: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    return res.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: list,  // compat en-US
      itens: list,  // compat pt-BR
    });
  } catch (err) {
    console.error('[APH] GET /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao listar atendimentos.' });
  }
});

// Alias de listagem por aluno
router.get('/atendimentos/aluno/:alunoId', autenticar, (req, res, next) => {
  req.url = `/atendimentos?alunoId=${encodeURIComponent(req.params.alunoId)}`;
  next();
});

// 🔁 Alias compatível com front antigo: /api/aph/listar
router.get('/listar', autenticar, (req, res, next) => {
  const q = [];
  if (req.query.alunoId) q.push(`alunoId=${encodeURIComponent(req.query.alunoId)}`);
  if (req.query.page)    q.push(`page=${encodeURIComponent(req.query.page)}`);
  if (req.query.limit)   q.push(`limit=${encodeURIComponent(req.query.limit)}`);
  if (req.query.dtIni)   q.push(`dtIni=${encodeURIComponent(req.query.dtIni)}`);
  if (req.query.dtFim)   q.push(`dtFim=${encodeURIComponent(req.query.dtFim)}`);
  if (req.query.q)       q.push(`q=${encodeURIComponent(req.query.q)}`);
  req.url = `/atendimentos${q.length ? '?' + q.join('&') : ''}`;
  next();
});

// Contador para a Ficha
router.get('/atendimentos/count/:alunoId', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });
    const { alunoId } = req.params;
    if (!mongoose.isValidObjectId(alunoId)) return res.json({ total: 0 });
    const total = await AphAtendimento.countDocuments({ instituicao: inst, alunoId });
    res.json({ total });
  } catch (e) {
    console.warn('[APH] count falhou:', e?.message || e);
    res.json({ total: 0 });
  }
});

// Detalhe
router.get('/atendimentos/:id', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const _id = req.params.id;
    if (!mongoose.isValidObjectId(_id)) return res.status(404).json({ message: 'Registro não encontrado.' });

    const doc = await AphAtendimento.findOne({ _id, instituicao: inst }).lean();
    if (!doc) return res.status(404).json({ message: 'Registro não encontrado.' });

    res.json(doc);
  } catch (err) {
    console.error('[APH] GET /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao carregar atendimento.' });
  }
});

// Alias (compat)
router.get('/atendimento/:id', autenticar, (req, res, next) => {
  req.url = `/atendimentos/${req.params.id}`;
  next();
});

/* =========================================================
   CRIAR / EDITAR / EXCLUIR
   ========================================================= */

router.post('/atendimentos', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const {
      alunoId,
      responsavel,
      local,
      hora,
      data,
      tipos = [],
      materiais = [],
      sinaisESintomas = '',
      procedimentos = '',
      observacoes = '',
      responsaveisInformados,
      meioComunicacao = '',
      encaminhamento = '',
      houveEncaminhamento
    } = req.body || {};

    if (!alunoId || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ message: 'alunoId inválido/ausente.' });
    }

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: inst })
      .select('nome turma instituicao contatos responsaveis telefone')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });

    const payload = {
      alunoId: aluno._id,
      responsavel: (responsavel || '').trim(),
      local: (local || '').trim(),
      hora: (hora || '').trim(),
      data: parseDateOnlyLocal(data),
      tipos: Array.isArray(tipos) ? tipos : [],
      materiais: Array.isArray(materiais) ? materiais : [],
      sinaisESintomas,
      procedimentos,
      observacoes,
      responsaveisInformados: (responsaveisInformados === 'Sim' || responsaveisInformados === true) ? 'Sim' : 'Não',
      meioComunicacao,
      encaminhamento,
      houveEncaminhamento: Boolean(houveEncaminhamento),
      instituicao: inst
    };

    const novo = await AphAtendimento.create(payload);

    // Disparo de comunicação (tolerante a falhas)
    let comunicacao = { ok: false, motivo: 'mensageria indisponível' };
    try {
      const mensageria = getMensageria(req);
      if (mensageria?.enfileirarParaResponsaveis) {
        const { titulo, texto } = montarMensagemAPH({ aluno, at: payload });
        const prom = mensageria.enfileirarParaResponsaveis({
          alunoId: String(aluno._id),
          instituicao: String(inst),
          // prioriza email, depois telegram; gera link de WhatsApp
          preferenciaCanais: ['email', 'telegram', 'whatsapp'],
          titulo,
          texto,
          html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
          meta: { tipo: 'aph_atendimento', atendimentoId: String(novo._id) }
        });

        const r = await withTimeout(prom, 8000, 'mensageria APH');
        if (r?.__timeout) {
          console.warn('[APH] mensageria: timeout — resposta não aguardada (considerando enfileirado).');
          comunicacao = { ok: true, queued: true, motivo: 'timeout_mensageria' };
        } else {
          comunicacao = r;
        }
      } else {
        console.warn('[APH] mensageria indisponível (não bloqueia o salvamento).');
      }
    } catch (e) {
      console.warn('[APH] Falha no disparo de comunicação:', e?.message || e);
    }

    res.status(201).json({ ok: true, atendimento: novo, comunicacao });
  } catch (err) {
    console.error('[APH] POST /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao salvar atendimento.' });
  }
});

router.put('/atendimentos/:id', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Registro não encontrado.' });

    const patch = {
      responsavel: (req.body?.responsavel || '').trim(),
      local: (req.body?.local || '').trim(),
      hora: (req.body?.hora || '').trim(),
      tipos: Array.isArray(req.body?.tipos) ? req.body.tipos : [],
      materiais: Array.isArray(req.body?.materiais) ? req.body.materiais : [],
      observacoes: (req.body?.observacoes || '').trim(),
      responsaveisInformados: (req.body?.responsaveisInformados === 'Sim' || req.body?.responsaveisInformados === true) ? 'Sim' : 'Não',
      meioComunicacao: (req.body?.meioComunicacao || '').trim(),
      encaminhamento: (req.body?.encaminhamento || '').trim(),
      sinaisESintomas: (req.body?.sinaisESintomas || '').trim(),
      procedimentos: (req.body?.procedimentos || '').trim(),
      houveEncaminhamento: Boolean(req.body?.houveEncaminhamento),
      ...(req.body?.data ? { data: parseDateOnlyLocal(req.body.data) } : {}),
    };

    const upd = await AphAtendimento.findOneAndUpdate(
      { _id: id, instituicao: inst },
      { $set: patch },
      { new: true }
    ).lean();

    if (!upd) return res.status(404).json({ message: 'Registro não encontrado.' });
    res.json({ ok: true, atendimento: upd });
  } catch (err) {
    console.error('[APH] PUT /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao atualizar atendimento.' });
  }
});

router.delete('/atendimentos/:id', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Registro não encontrado.' });

    const del = await AphAtendimento.findOneAndDelete({ _id: id, instituicao: inst }).lean();
    if (!del) return res.status(404).json({ message: 'Registro não encontrado.' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[APH] DELETE /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao excluir atendimento.' });
  }
});

/* =========================================================
   REENGATILHAR COMUNICAÇÃO
   ========================================================= */

router.post('/atendimentos/:id/reengatilhar-comunicacao', autenticar, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'Registro não encontrado.' });

    const at = await AphAtendimento.findOne({ _id: id, instituicao: inst }).lean();
    if (!at) return res.status(404).json({ message: 'Registro não encontrado.' });

    const aluno = await Aluno.findOne({ _id: at.alunoId, instituicao: inst })
      .select('nome turma instituicao contatos responsaveis telefone')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const mensageria = getMensageria(req);
    if (!mensageria?.enfileirarParaResponsaveis) {
      return res.json({ ok: false, comunicacao: { motivo: 'mensageria indisponível' } });
    }

    const { titulo, texto } = montarMensagemAPH({ aluno, at });

    // não deixar a requisição travar; timeout curto
    const prom = mensageria.enfileirarParaResponsaveis({
      alunoId: String(aluno._id),
      instituicao: String(inst),
      preferenciaCanais: ['email', 'telegram', 'whatsapp'],
      titulo,
      texto,
      html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
      meta: { tipo: 'aph_atendimento_reenvio', atendimentoId: String(at._id) }
    });

    const r = await withTimeout(prom, 8000, 'mensageria reenvio APH');
    if (r?.__timeout) {
      console.warn('[APH] reenvio: timeout — resposta não aguardada (considerando enfileirado).');
      return res.json({ ok: true, queued: true, comunicacao: { motivo: 'timeout_mensageria' } });
    }

    return res.json({ ok: Boolean(r?.ok), comunicacao: r });
  } catch (err) {
    console.error('[APH] POST reengatilhar erro:', err);
    res.status(500).json({ message: 'Erro ao reenviar comunicado.' });
  }
});

module.exports = router;
