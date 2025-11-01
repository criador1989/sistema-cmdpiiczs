// backend/routes/api/aph.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const AphAtendimento = require('../../models/AphAtendimento');
const Aluno = require('../../models/Aluno');

// Usaremos o mailer como fallback caso a mensageria não esteja disponível
const { safeSendMail, MAIL_ENABLED } = require('../../utils/mailer');

/* -------------------- utils -------------------- */
function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
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
  if (encaminhamento) linhas.push(`• Encaminhamento: ${encaminhamento}`);

  linhas.push(
    ``,
    `Este comunicado é informativo. Permanecemos à disposição.`,
    `Atenciosamente,`,
    `Coordenação — CMDPII/CZS`
  );

  return { titulo: `Comunicado de APH — ${nome}`, texto: linhas.join('\n') };
}

/**
 * Extrai possíveis e-mails dos responsáveis do objeto aluno (tenta ser tolerante a formatos).
 * Retorna um array deduplicado.
 */
function extrairEmailsResponsaveis(aluno) {
  const emails = new Set();

  // aluno.contatos?.email
  const contatoEmail = aluno?.contatos?.email || aluno?.contatoEmail || '';
  if (contatoEmail) String(contatoEmail).split(/[;, ]+/).forEach(e => e && emails.add(e));

  // aluno.responsaveis: [{ email }, ...] ou variações
  if (Array.isArray(aluno?.responsaveis)) {
    for (const r of aluno.responsaveis) {
      const e = r?.email || r?.contatoEmail || '';
      if (e) String(e).split(/[;, ]+/).forEach(x => x && emails.add(x));
    }
  }

  // Possíveis campos soltos
  ['email', 'email1', 'email2'].forEach(k => {
    const v = aluno?.[k];
    if (v) String(v).split(/[;, ]+/).forEach(x => x && emails.add(x));
  });

  return Array.from(emails);
}

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

    // filtro por data (tolerante)
    const { dtIni, dtFim } = req.query;
    if (dtIni || dtFim) {
      filtro.data = {};
      if (dtIni && !Number.isNaN(Date.parse(dtIni))) filtro.data.$gte = new Date(dtIni);
      if (dtFim && !Number.isNaN(Date.parse(dtFim))) filtro.data.$lte = new Date(dtFim);
      if (!Object.keys(filtro.data).length) delete filtro.data;
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

// Salvar atendimento (resposta imediata; comunicação em background)
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
      .select('nome turma instituicao contatos responsaveis telefone email email1 email2')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });

    const payload = {
      alunoId: aluno._id,
      responsavel: (responsavel || '').trim(),
      local: (local || '').trim(),
      hora: (hora || '').trim(),
      data: data ? new Date(data) : new Date(),
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

    // === Responde IMEDIATAMENTE para não travar o front ===
    res.status(201).json({
      ok: true,
      atendimento: novo,
      comunicacao: { queued: true }
    });

    // === Dispara comunicação EM BACKGROUND ===
    Promise.resolve().then(async () => {
      try {
        const { titulo, texto } = montarMensagemAPH({ aluno, at: payload });
        const mensageria = getMensageria(req);

        if (mensageria?.enfileirarParaResponsaveis) {
          const comunicacao = await mensageria.enfileirarParaResponsaveis({
            alunoId: String(aluno._id),
            instituicao: String(inst),
            // prioriza email, depois telegram; gera link de WhatsApp
            preferenciaCanais: ['email', 'telegram', 'whatsapp'],
            titulo,
            texto,
            html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
            meta: { tipo: 'aph_atendimento', atendimentoId: String(novo._id) }
          });

          if (!comunicacao?.ok) {
            console.warn('[APH] Mensageria retornou falha:', comunicacao);
          }
        } else if (MAIL_ENABLED) {
          // Fallback: tenta e-mail direto
          const destinatarios = extrairEmailsResponsaveis(aluno);
          if (destinatarios.length) {
            const result = await safeSendMail({
              to: destinatarios.join(','),
              subject: titulo,
              text: texto,
              html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
            });
            if (!result.ok && !result.skipped) {
              console.error('[APH] Fallback e-mail falhou:', result.error);
            }
          } else {
            console.warn('[APH] Sem e-mails de responsáveis para fallback do APH.');
          }
        } else {
          console.warn('[APH] Mensageria indisponível e MAIL_ENABLED=false — nenhuma comunicação enviada.');
        }
      } catch (e) {
        console.error('[APH] Erro no disparo em background:', e && e.stack ? e.stack : e);
      }
    });

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
   REENGATILHAR COMUNICAÇÃO (resposta rápida + background)
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
      .select('nome turma instituicao contatos responsaveis telefone email email1 email2')
      .lean();
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado.' });

    // Responde rápido
    res.json({ ok: true, queued: true });

    // Dispara em background
    Promise.resolve().then(async () => {
      try {
        const { titulo, texto } = montarMensagemAPH({ aluno, at });
        const mensageria = getMensageria(req);

        if (mensageria?.enfileirarParaResponsaveis) {
          const comunicacao = await mensageria.enfileirarParaResponsaveis({
            alunoId: String(aluno._id),
            instituicao: String(inst),
            preferenciaCanais: ['email', 'telegram', 'whatsapp'],
            titulo,
            texto,
            html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
            meta: { tipo: 'aph_atendimento_reenvio', atendimentoId: String(at._id) }
          });

          if (!comunicacao?.ok) {
            console.warn('[APH] Mensageria falhou no reengatilhamento:', comunicacao);
          }
        } else if (MAIL_ENABLED) {
          const destinatarios = extrairEmailsResponsaveis(aluno);
          if (destinatarios.length) {
            const result = await safeSendMail({
              to: destinatarios.join(','),
              subject: titulo,
              text: texto,
              html: `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; white-space: pre-wrap">${texto}</pre>`,
            });
            if (!result.ok && !result.skipped) {
              console.error('[APH] Fallback e-mail falhou (reengatilhar):', result.error);
            }
          } else {
            console.warn('[APH] Sem e-mails de responsáveis para fallback no reengatilhar.');
          }
        } else {
          console.warn('[APH] Mensageria indisponível e MAIL_ENABLED=false no reengatilhar.');
        }
      } catch (e) {
        console.error('[APH] Erro no reengatilhamento em background:', e && e.stack ? e.stack : e);
      }
    });

  } catch (err) {
    console.error('[APH] POST reengatilhar erro:', err);
    res.status(500).json({ message: 'Erro ao reenviar comunicado.' });
  }
});

module.exports = router;
