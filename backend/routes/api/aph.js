'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const AphAtendimento = require('../../models/AphAtendimento');
const Aluno = require('../../models/Aluno');

// usa o mesmo serviço de e-mail já validado no sistema
const { sendMail } = require('../../utils/mailer');

/* -------------------- helpers multi-tenant -------------------- */
function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

/* -------------------- utils -------------------- */
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function withTimeout(promise, ms = 8000, label = 'operação') {
  let t;
  const timer = new Promise((resolve) => {
    t = setTimeout(() => {
      resolve({ __timeout: true, ok: false, erro: `Timeout ${label} (${ms}ms)` });
    }, ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timer]);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseDateOnlyLocal(v) {
  if (!v) return new Date();

  if (typeof v === 'string') {
    const iso = /^\d{4}-\d{2}-\d{2}/.test(v);
    const br = /^\d{2}\/\d{2}\/\d{4}$/.test(v);

    if (iso) return new Date(v + (v.length === 10 ? 'T00:00:00' : ''));
    if (br) {
      const [dd, mm, yyyy] = v.split('/').map(Number);
      return new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    }
  }

  const t = Date.parse(v);
  return Number.isNaN(t) ? new Date() : new Date(t);
}

function formatDateBR(dateValue) {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function montarMensagemAPH({ aluno, at }) {
  const nome = aluno?.nome || 'Aluno(a)';
  const turma = aluno?.turma || '—';

  const dataStr = formatDateBR(at?.data);
  const horaStr = (at?.hora && String(at.hora).trim()) ? String(at.hora).trim() : '—';
  const local = at?.local || '—';

  const tipos = Array.isArray(at?.tipos) && at.tipos.length ? at.tipos.join(', ') : '—';
  const materiais = Array.isArray(at?.materiais) && at.materiais.length ? at.materiais.join(', ') : '—';

  const sintomas = (at?.sinaisESintomas || '').trim();
  const procedimentos = (at?.procedimentos || '').trim();
  const observ = (at?.observacoes || at?.observacao || '').trim();
  const encaminhamento = (at?.houveEncaminhamento || at?.encaminhamento) ? 'Sim' : 'Não';

  const titulo = `Comunicado de APH — ${nome}`;

  const texto = [
    `Prezados responsáveis de ${nome} (${turma}),`,
    ``,
    `Registramos um atendimento de APH realizado pela escola:`,
    `• Data: ${dataStr}`,
    `• Hora: ${horaStr}`,
    `• Local: ${local}`,
    `• Ocorrência(s): ${tipos}`,
    `• Materiais/recursos aplicados: ${materiais}`,
    ...(sintomas ? [`• Sinais/sintomas: ${sintomas}`] : []),
    ...(procedimentos ? [`• Procedimentos realizados: ${procedimentos}`] : []),
    ...(observ ? [`• Observações: ${observ}`] : []),
    `• Encaminhamento: ${encaminhamento}`,
    ``,
    `Este comunicado é informativo. Permanecemos à disposição.`,
    `Atenciosamente,`,
    `Coordenação — CMDPII/CZS`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">
      <p>Prezados responsáveis de <strong>${escapeHtml(nome)}</strong> (${escapeHtml(turma)}),</p>
      <p>Registramos um atendimento de APH realizado pela escola:</p>
      <ul>
        <li><strong>Data:</strong> ${escapeHtml(dataStr)}</li>
        <li><strong>Hora:</strong> ${escapeHtml(horaStr)}</li>
        <li><strong>Local:</strong> ${escapeHtml(local)}</li>
        <li><strong>Ocorrência(s):</strong> ${escapeHtml(tipos)}</li>
        <li><strong>Materiais/recursos aplicados:</strong> ${escapeHtml(materiais)}</li>
        ${sintomas ? `<li><strong>Sinais/sintomas:</strong> ${escapeHtml(sintomas)}</li>` : ''}
        ${procedimentos ? `<li><strong>Procedimentos realizados:</strong> ${escapeHtml(procedimentos)}</li>` : ''}
        ${observ ? `<li><strong>Observações:</strong> ${escapeHtml(observ)}</li>` : ''}
        <li><strong>Encaminhamento:</strong> ${escapeHtml(encaminhamento)}</li>
      </ul>
      <p>Este comunicado é informativo. Permanecemos à disposição.</p>
      <p>Atenciosamente,<br>Coordenação — CMDPII/CZS</p>
    </div>
  `;

  return { titulo, texto, html };
}

function extractPossibleEmailsFromValue(value, set) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => extractPossibleEmailsFromValue(item, set));
    return;
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => extractPossibleEmailsFromValue(item, set));
    return;
  }

  const str = String(value).trim();
  if (!str) return;

  const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (matches) {
    matches.forEach((m) => set.add(m.trim().toLowerCase()));
  }
}

function getEmailsResponsaveis(aluno) {
  const set = new Set();

  extractPossibleEmailsFromValue(aluno?.emailResponsavel, set);
  extractPossibleEmailsFromValue(aluno?.emailMae, set);
  extractPossibleEmailsFromValue(aluno?.emailPai, set);
  extractPossibleEmailsFromValue(aluno?.email, set);
  extractPossibleEmailsFromValue(aluno?.contatos, set);
  extractPossibleEmailsFromValue(aluno?.responsaveis, set);
  extractPossibleEmailsFromValue(aluno?.responsavel, set);

  return [...set];
}

async function enviarComunicadoAPH({ aluno, at, tenantId }) {
  const emails = getEmailsResponsaveis(aluno);

  if (!emails.length) {
    return {
      ok: false,
      motivo: 'sem_email_responsavel'
    };
  }

  const { titulo, texto, html } = montarMensagemAPH({ aluno, at });

  console.log('[APH][MAIL] destinatarios =', emails.join(', '));
  console.log('[APH][MAIL] tenant =', String(tenantId || ''));
  console.log('[APH][MAIL] subject =', titulo);

  const result = await withTimeout(
    sendMail({
      to: emails,
      subject: titulo,
      html,
      text: texto
    }),
    12000,
    'envio email APH'
  );

  if (result?.__timeout) {
    console.warn('[APH][MAIL] timeout no envio do APH.');
    return {
      ok: false,
      motivo: 'timeout_envio_email'
    };
  }

  return {
    ok: true,
    canal: 'email',
    to: emails,
    result
  };
}

/* =========================================================
   STATUS
   ========================================================= */
router.get('/status', (_req, res) => res.json({ ok: true, service: 'aph' }));

/* =========================================================
   LISTAS / DETALHES
   ========================================================= */

// GET /api/aph/atendimentos?alunoId=...&q=...&dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD&page=1&limit=20
router.get('/atendimentos', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);

    const filtro = {
      ...buildTenantMatch(tenantId)
    };

    if (req.query.alunoId && mongoose.isValidObjectId(req.query.alunoId)) {
      filtro.alunoId = new mongoose.Types.ObjectId(req.query.alunoId);
    }

    const { dtIni, dtFim } = req.query;
    if (dtIni || dtFim) {
      const dataFiltro = {};
      if (dtIni && !Number.isNaN(Date.parse(dtIni))) dataFiltro.$gte = new Date(dtIni);
      if (dtFim && !Number.isNaN(Date.parse(dtFim))) dataFiltro.$lte = endOfDay(dtFim);
      if (Object.keys(dataFiltro).length) filtro.data = dataFiltro;
    }

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
      items: list,
      itens: list,
    });
  } catch (err) {
    console.error('[APH] GET /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao listar atendimentos.' });
  }
});

// Alias de listagem por aluno
router.get('/atendimentos/aluno/:alunoId', autenticar, requireTenant, (req, res, next) => {
  req.url = `/atendimentos?alunoId=${encodeURIComponent(req.params.alunoId)}`;
  next();
});

// Alias compatível com front antigo: /api/aph/listar
router.get('/listar', autenticar, requireTenant, (req, res, next) => {
  const q = [];
  if (req.query.alunoId) q.push(`alunoId=${encodeURIComponent(req.query.alunoId)}`);
  if (req.query.page) q.push(`page=${encodeURIComponent(req.query.page)}`);
  if (req.query.limit) q.push(`limit=${encodeURIComponent(req.query.limit)}`);
  if (req.query.dtIni) q.push(`dtIni=${encodeURIComponent(req.query.dtIni)}`);
  if (req.query.dtFim) q.push(`dtFim=${encodeURIComponent(req.query.dtFim)}`);
  if (req.query.q) q.push(`q=${encodeURIComponent(req.query.q)}`);
  req.url = `/atendimentos${q.length ? '?' + q.join('&') : ''}`;
  next();
});

// Contador para a Ficha
router.get('/atendimentos/count/:alunoId', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { alunoId } = req.params;
    if (!mongoose.isValidObjectId(alunoId)) return res.json({ total: 0 });

    const total = await AphAtendimento.countDocuments({
      ...buildTenantMatch(tenantId),
      alunoId
    });

    res.json({ total });
  } catch (e) {
    console.warn('[APH] count falhou:', e?.message || e);
    res.json({ total: 0 });
  }
});

// Detalhe
router.get('/atendimentos/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const _id = req.params.id;
    if (!mongoose.isValidObjectId(_id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const doc = await AphAtendimento.findOne({
      _id,
      ...buildTenantMatch(tenantId)
    }).lean();

    if (!doc) return res.status(404).json({ message: 'Registro não encontrado.' });

    res.json(doc);
  } catch (err) {
    console.error('[APH] GET /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao carregar atendimento.' });
  }
});

// Alias (compat)
router.get('/atendimento/:id', autenticar, requireTenant, (req, res, next) => {
  req.url = `/atendimentos/${req.params.id}`;
  next();
});

/* =========================================================
   CRIAR / EDITAR / EXCLUIR
   ========================================================= */

router.post('/atendimentos', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

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

    const aluno = await Aluno.findOne({
      _id: alunoId,
      ...buildTenantMatch(tenantId)
    })
      .select('nome turma instituicao tenantId contatos responsaveis responsavel telefone email emailResponsavel emailMae emailPai')
      .lean();

    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    const payload = tenantData(req, {
      alunoId: aluno._id,
      responsavel: (responsavel || '').trim(),
      local: (local || '').trim(),
      hora: (hora || '').trim(),
      data: parseDateOnlyLocal(data),
      tipos: Array.isArray(tipos) ? tipos : [],
      materiais: Array.isArray(materiais) ? materiais : [],
      sinaisESintomas: String(sinaisESintomas || '').trim(),
      procedimentos: String(procedimentos || '').trim(),
      observacoes: String(observacoes || '').trim(),
      responsaveisInformados: (responsaveisInformados === 'Sim' || responsaveisInformados === true) ? 'Sim' : 'Não',
      meioComunicacao: String(meioComunicacao || '').trim(),
      encaminhamento: String(encaminhamento || '').trim(),
      houveEncaminhamento: Boolean(houveEncaminhamento)
    });

    const novo = await AphAtendimento.create(payload);

    let comunicacao = { ok: false, motivo: 'nao_enviado' };
    try {
      comunicacao = await enviarComunicadoAPH({
        aluno,
        at: payload,
        tenantId
      });
    } catch (e) {
      console.warn('[APH] Falha no disparo de comunicação:', e?.message || e);
      comunicacao = {
        ok: false,
        motivo: e?.message || 'erro_envio_email'
      };
    }

    res.status(201).json({ ok: true, atendimento: novo, comunicacao });
  } catch (err) {
    console.error('[APH] POST /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao salvar atendimento.' });
  }
});

router.put('/atendimentos/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

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
      tenantId,
      instituicao: tenantId
    };

    const upd = await AphAtendimento.findOneAndUpdate(
      {
        _id: id,
        ...buildTenantMatch(tenantId)
      },
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

router.delete('/atendimentos/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const del = await AphAtendimento.findOneAndDelete({
      _id: id,
      ...buildTenantMatch(tenantId)
    }).lean();

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

router.post('/atendimentos/:id/reengatilhar-comunicacao', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const at = await AphAtendimento.findOne({
      _id: id,
      ...buildTenantMatch(tenantId)
    }).lean();

    if (!at) return res.status(404).json({ message: 'Registro não encontrado.' });

    const aluno = await Aluno.findOne({
      _id: at.alunoId,
      ...buildTenantMatch(tenantId)
    })
      .select('nome turma instituicao tenantId contatos responsaveis responsavel telefone email emailResponsavel emailMae emailPai')
      .lean();

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    const comunicacao = await enviarComunicadoAPH({
      aluno,
      at,
      tenantId
    });

    return res.json({ ok: Boolean(comunicacao?.ok), comunicacao });
  } catch (err) {
    console.error('[APH] POST reengatilhar erro:', err);
    res.status(500).json({ message: 'Erro ao reenviar comunicado.' });
  }
});

module.exports = router;