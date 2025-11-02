// backend/routes/api/notificacoes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');

const calcularNotaTSMD = require('../../utils/calculoNota');
const enviarWhatsapp = require('../../utils/twilio');
const { autenticar } = require('../../middleware/autenticacao');
const { obterDadosDoRegulamento } = require('../../utils/regulamento');
const { addBusinessDays } = require('../../utils/businessDays');
const { logAction, attachActor } = require('../../utils/audit');

// 🚀 Serviços de mensageria (telegram + NP)
// (enviarTelegram é usado em outras rotas; e-mail/telegram unificados via app.locals.mensageria)
const { enviarTelegram, enviarNPEncaminhamento } = require('../../services/mensageria');

/* =========================================================
   ===== NOVOS HELPERS: Mensageria / E-mail Deferido =======
   ========================================================= */

function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

/** Reaproveita sua coleta de chatIds já existente (para telegram) */
function getChatIdsFromAlunoDoc(alunoDoc) {
  if (!alunoDoc) return [];
  if (typeof alunoDoc.getAllChatIds === 'function') {
    return (alunoDoc.getAllChatIds() || []).filter(Boolean);
  }
  const set = new Set([
    ...(alunoDoc.chatIdsResponsaveis || []),
    alunoDoc.chatIdResponsavel || '',
    alunoDoc?.contatos?.telegramChatId || ''
  ].map(s => String(s || '').trim()).filter(Boolean));
  return Array.from(set);
}

/** pt-BR data/hora helpers (reutilizados abaixo) */
function formatDataBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function formatDataHoraBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${formatDataBr(d)} ${hh}:${mi}`;
}

/** Monta assunto/corpo do comunicado de DEFERIMENTO */
function montarEmailDeferido({ aluno, notif }) {
  const nome = aluno?.nome || 'Aluno(a)';
  const turma = aluno?.turma || '—';
  const numero = notif?.numeroSequencial || '—';
  const dataStr = notif?.data ? formatDataBr(notif.data) : formatDataBr(new Date());
  const inciso = (notif?.inciso || '').trim();
  const motivo = (notif?.motivo || '').trim() || '—';
  const medida = notif?.tipoMedida || notif?.tipo || '—';
  const dias = notif?.quantidadeDias && notif.quantidadeDias > 1 ? ` (${notif.quantidadeDias} dias)` : '';
  const assunto = `Nova Notificação Disciplinar DEFERIDA — ${nome} (${turma}) — Nº ${numero}`;
  const text = [
    'Prezada família,',
    '',
    `Informamos que foi DEFERIDA uma Notificação Disciplinar referente a ${nome} (turma ${turma}).`,
    `Data: ${dataStr}`,
    `Medida: ${medida}${dias}`,
    inciso ? `Inciso: ${inciso}` : null,
    `Motivo/Descrição: ${motivo}`,
    `Nº: ${numero}`,
    '',
    'Este é um comunicado automático do CMDPII/CZS.'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <p>Prezada família,</p>
      <p>Informamos que foi <strong>DEFERIDA</strong> uma Notificação Disciplinar referente a
      <strong>${nome}</strong> (turma <strong>${turma}</strong>).</p>
      <p>
        <b>Data:</b> ${dataStr}<br/>
        <b>Medida:</b> ${medida}${dias}<br/>
        ${inciso ? `<b>Inciso:</b> ${inciso}<br/>` : ``}
        <b>Motivo/Descrição:</b> ${motivo}<br/>
        <b>Nº:</b> ${numero}
      </p>
      <p style="margin-top:16px">Este é um comunicado automático do <b>CMDPII/CZS</b>.</p>
    </div>
  `;
  return { subject: assunto, text, html };
}

/**
 * Dispara aviso de DEFERIDO (e-mail + telegram) de forma idempotente:
 * - só envia se status === 'deferido'
 * - não envia se mensagemEnviada === true
 * - após enviar, marca mensagemEnviada/mensagemEnviadaEm e deferidoEm (se ainda não houver)
 */
async function enviarAvisoDeferidoIfNeeded({ req, notifId }) {
  const mensageria = getMensageria(req);
  const notif = await Notificacao.findById(notifId).lean();
  if (!notif) return { skipped: true, reason: 'notificação não encontrada' };
  if (notif.status !== 'deferido') return { skipped: true, reason: 'status não é deferido' };
  if (notif.mensagemEnviada) return { skipped: true, reason: 'mensagem já enviada' };

  const aluno = await Aluno.findById(notif.aluno).lean();
  const { subject, text, html } = montarEmailDeferido({ aluno, notif });

  // === ENVIO UNIFICADO (email + telegram) ===
  if (mensageria && typeof mensageria.enfileirarParaResponsaveis === 'function') {
    try {
      await mensageria.enfileirarParaResponsaveis({
        alunoId: aluno._id,
        instituicao: notif.instituicao,
        preferenciaCanais: ['email', 'telegram'],
        titulo: subject,
        texto: text,
        html,
        meta: { tipo: 'NOTIFICACAO_DEFERIDA', notifId: String(notif._id) }
      });
    } catch (e) {
      console.warn('[deferido] falha no enfileirarParaResponsaveis:', e?.message || e);
      // fallback mínimo: Telegram direto (se tiver chatId)
      const chatIds = getChatIdsFromAlunoDoc(aluno);
      if (chatIds.length) {
        const msgTG = [
          '🔔 CMDPII/CZS — Notificação DEFERIDA',
          `Aluno(a): ${aluno?.nome || '—'} (${aluno?.turma || '—'})`,
          `Medida: ${notif?.tipoMedida || notif?.tipo || '—'}${notif?.quantidadeDias > 1 ? ` (${notif.quantidadeDias} dias)` : ''}`,
          `Nº: ${notif?.numeroSequencial || '—'}`,
          `Data: ${notif?.data ? formatDataBr(notif.data) : formatDataBr(new Date())}`
        ].join('\n');
        for (const cid of chatIds) {
          try { await enviarTelegram({ nome: aluno?.nome, turma: aluno?.turma }, 'Notificação', cid, msgTG); } catch {}
        }
      }
    }
  }

  await Notificacao.findByIdAndUpdate(notifId, {
    $set: {
      mensagemEnviada: true,
      mensagemEnviadaEm: new Date(),
      deferidoEm: notif.deferidoEm || new Date()
    }
  });
  return { ok: true };
}

/* =========================================================
   ========  RESTO DO ARQUIVO (o que você já tinha)  =======
   ========================================================= */

// ------------------ Mapas de valores ------------------
const MAPA_NEGATIVOS = {
  'Advertência Escrita': -0.30,
  'Repreensão': -0.50,
  'A.E.C.D.E': -0.70,
  'A.I.A': -1.20
};
const MAPA_ELOGIOS = {
  elogioVerbal: 0.15,
  boletimInternoIndividual: 0.60,
  boletimInternoColetivo: 0.20,
  mediaAlta: 0.40
};
const PRECISA_DIAS = new Set(['A.E.C.D.E', 'A.I.A']);

// ------------------ ENV (opcionais p/ mensagem NP) ------------------
const NP_AGENDAMENTO_URL = process.env.NP_AGENDAMENTO_URL || '';
const CONTATO_ESCOLA = process.env.CONTATO_ESCOLA || '';

// ------------------ Helpers já existentes ------------------
function buildInstMatch(inst) {
  const ors = [{ instituicao: { $exists: false } }, { instituicao: null }];
  if (!inst) return { $or: ors };
  const asStr = String(inst);
  ors.push({ instituicao: asStr });
  if (mongoose.isValidObjectId(inst)) {
    ors.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  }
  return { $or: ors };
}
function buildAlunoMatch(inst) {
  const ors = [{ instituicao: { $exists: false } }, { instituicao: null }];
  if (inst) {
    ors.push({ instituicao: String(inst) });
    if (mongoose.isValidObjectId(inst)) ors.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  }
  return { $or: ors };
}
function parseDateOnlyLocal(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return new Date();
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function toDayStart(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function toDayEnd(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function estaFaixaRegular(nota) {
  const n = Number(nota);
  return isFinite(n) && n >= 5.0 && n <= 6.99;
}
async function recomputarNotaAlunoAteAgora(alunoId, instituicao) {
  const instMatch = buildInstMatch(instituicao);
  const aluno = await Aluno.findOne({ _id: alunoId, ...buildAlunoMatch(instituicao) });
  if (!aluno) return null;

  const historico = await Notificacao.find({ aluno: alunoId, ...instMatch })
    .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza')
    .sort({ data: 1, createdAt: 1 });

  const notaFinal = calcularNotaTSMD(aluno.dataEntrada, new Date(), historico);
  aluno.comportamento = +Number(notaFinal).toFixed(2);
  await aluno.save();
  return aluno;
}
async function getAlunoInfo(alunoId, instituicao) {
  if (!alunoId) return { alunoNome: '—', alunoTurma: '—' };
  const a = await Aluno.findOne({ _id: alunoId, ...buildAlunoMatch(instituicao) }).select('nome turma').lean();
  return { alunoNome: a?.nome || '—', alunoTurma: a?.turma || '—' };
}
async function verificarEnvioNP(alunoDoc, instituicao) {
  if (!alunoDoc) return;
  const nota = Number(alunoDoc.comportamento);
  if (!estaFaixaRegular(nota)) return;

  const jaEnviadoEm = alunoDoc.alertas?.npRegularEnviadoAt || null;
  const ultimaNota = typeof alunoDoc.alertas?.npRegularUltimaNota === 'number' ? alunoDoc.alertas.npRegularUltimaNota : null;
  const precisaEnviar = !jaEnviadoEm || (ultimaNota === null) || Math.abs(Number(ultimaNota) - nota) >= 0.01;

  if (!precisaEnviar) return;

  try {
    await enviarNPEncaminhamento({
      alunoId: alunoDoc._id,
      notaAtual: nota,
      instituicao,
      linkAgendamento: NP_AGENDAMENTO_URL,
      contatoEscola: CONTATO_ESCOLA,
      preferenciaCanais: ['email', 'telegram']
    });

    alunoDoc.alertas = alunoDoc.alertas || {};
    alunoDoc.alertas.npRegularEnviadoAt = new Date();
    alunoDoc.alertas.npRegularUltimaNota = nota;
    await alunoDoc.save();
  } catch (e) {
    console.warn('[NP] Falha ao enviar encaminhamento:', e.message);
  }
}

/* ================= ROTAS ================= */

// GET "/novas" (placeholder)
router.get('/novas', autenticar, attachActor, async (_req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

// GET "/pendencias/devolucao/contador"
router.get('/pendencias/devolucao/contador', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const agora = new Date();
    const total = await Notificacao.countDocuments({
      ...instMatch,
      status: 'deferido',
      entregue: true,
      devolvidoPeloAluno: { $ne: true },
      prazoDevolucao: { $ne: null, $lt: agora }
    });
    res.json({ total });
  } catch (err) {
    console.error('Erro contador pendências:', err);
    res.status(500).json({ error: 'Erro ao calcular contador de pendências.' });
  }
});

// GET "/pendencias/devolucao"
router.get('/pendencias/devolucao', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const alunoMatch = buildAlunoMatch(req.usuario.instituicao);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const agora = new Date();

    const itens = await Notificacao.find({
      ...instMatch,
      status: 'deferido',
      entregue: true,
      devolvidoPeloAluno: { $ne: true },
      prazoDevolucao: { $ne: null, $lt: agora }
    })
      .sort({ prazoDevolucao: 1 })
      .limit(limit)
      .select('aluno entregue entregueEm prazoDevolucao devolvidoPeloAluno numeroSequencial tipo tipoMedida data')
      .populate({ path: 'aluno', select: 'nome turma instituicao', match: alunoMatch })
      .lean();

    const filtrados = (itens || []).filter(i => i.aluno);
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro pendências:', err);
    res.status(500).json({ error: 'Erro ao buscar pendências de devolução.' });
  }
});

// GET "/" (lista paginada)
router.get('/', autenticar, attachActor, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.max(parseInt(req.query.limit || '10', 10), 1);

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const alunoMatch = buildAlunoMatch(req.usuario.instituicao);

    const q = (req.query.q || '').trim();
    const turma = (req.query.turma || '').trim();

    const filtroBase = { ...instMatch };

    if (q || turma) {
      const alunoFiltro = buildAlunoMatch(req.usuario.instituicao);
      if (q) {
        alunoFiltro.nome = {
          $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i'
        };
      }
      if (turma) alunoFiltro.turma = turma;

      const alunos = await Aluno.find(alunoFiltro).select('_id').lean();
      const ids = alunos.map(a => a._id);
      if (ids.length === 0) {
        return res.json({ total: 0, page, totalPages: 0, data: [] });
      }
      filtroBase.aluno = { $in: ids };
    }

    const total = await Notificacao.countDocuments(filtroBase);
    const totalPages = Math.ceil(total / limit) || 0;

    const notificacoes = await Notificacao.find(filtroBase)
      .sort({ data: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('aluno tipo tipoMedida data status valorNumerico quantidadeDias notaAnterior notaAtual comentarioMonitor numeroSequencial entregue prazoDevolucao devolvidoPeloAluno entregueEm natureza mensagemEnviada deferidoEm')
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao',
        match: alunoMatch
      })
      .lean();

    const dataRaw = (notificacoes || []).filter(n => n.aluno);

    const data = dataRaw.map(n => {
      const precisaDias = PRECISA_DIAS.has(n.tipoMedida);
      const dias = precisaDias ? Math.max(1, parseInt(n.quantidadeDias || 1, 10)) : 1;
      const valorTotal = Number(n.valorNumerico || 0);
      const valorUnitario = precisaDias ? Number((valorTotal / dias).toFixed(2)) : valorTotal;
      return { ...n, valorTotal, valorUnitario };
    });

    res.json({ total, page, totalPages, data });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

// GET "/:id" (detalhes)
router.get('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...instMatch
    }).populate({ path: 'aluno', select: 'nome turma instituicao' });

    if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada' });

    const precisaDias = PRECISA_DIAS.has(notificacao.tipoMedida);
    const dias = precisaDias ? Math.max(1, parseInt(notificacao.quantidadeDias || 1, 10)) : 1;
    const valorTotal = Number(notificacao.valorNumerico || 0);
    const valorUnitario = precisaDias ? Number((valorTotal / dias).toFixed(2)) : valorTotal;

    res.json({
      ...notificacao.toObject(),
      valorTotal,
      valorUnitario
    });
  } catch (err) {
    console.error('Erro ao carregar notificação:', err);
    res.status(500).json({ message: 'Erro ao carregar notificação.' });
  }
});

// POST "/" (criar notificação) + ENVIO TELEGRAM/WHATSAPP
router.post('/', autenticar, attachActor, async (req, res) => {
  const {
    aluno, motivo, tipo, tipoMedida, observacao, data,
    quantidadeDias, valorNumerico,
    natureza = 'indisciplina',
    tipoElogio
  } = req.body;

  try {
    const alunoRelacionado = await Aluno.findOne({
      _id: aluno,
      ...buildAlunoMatch(req.usuario.instituicao)
    });

    if (!alunoRelacionado) {
      return res.status(404).json({ error: 'Aluno não encontrado ou pertence a outra instituição' });
    }

    const dt = data ? parseDateOnlyLocal(data) : new Date();

    // Valor numérico e rótulos
    let valor = 0;
    let payload = {
      aluno,
      instituicao: mongoose.isValidObjectId(req.usuario.instituicao)
        ? new mongoose.Types.ObjectId(req.usuario.instituicao)
        : String(req.usuario.instituicao),
      observacao: observacao || null,
      data: dt,
      natureza
    };

    if (natureza === 'elogio') {
      const vMap = (typeof valorNumerico === 'number') ? valorNumerico : MAPA_ELOGIOS[tipoElogio];
      valor = Number(vMap || 0);

      payload = {
        ...payload,
        tipo: 'Elogio',
        tipoMedida: 'Elogio',
        tipoElogio: tipoElogio || null,
        motivo: ({
          elogioVerbal: 'Elogio verbal',
          boletimInternoIndividual: 'Boletim Interno Individual',
          boletimInternoColetivo: 'Boletim Interno Coletivo',
          mediaAlta: 'Média ≥ 8,5',
        }[tipoElogio]) || (motivo || 'Elogio'),
        valorNumerico: valor,
        artigo: null, paragrafo: null, inciso: null,
        classificacaoRegulamento: null,
        quantidadeDias: null
      };
    } else {
      // ===== INDISCIPLINA =====
      const tituloMedida = (tipoMedida || tipo || '').trim();
      const precisaDias = PRECISA_DIAS.has(tituloMedida);
      const dias = precisaDias ? Math.max(1, parseInt(quantidadeDias || 1, 10)) : 1;

      if (typeof valorNumerico === 'number') {
        valor = Number(valorNumerico);
      } else {
        const base = (MAPA_NEGATIVOS[tituloMedida] || 0);
        valor = Number((base * dias).toFixed(2));
      }

      const dadosRegulamento = obterDadosDoRegulamento(motivo || '');
      payload = {
        ...payload,
        tipo: tituloMedida || 'Medida',
        tipoMedida: tituloMedida || 'Medida',
        motivo,
        valorNumerico: valor,
        quantidadeDias: precisaDias ? dias : 1,
        artigo: dadosRegulamento.artigo,
        paragrafo: dadosRegulamento.paragrafo,
        inciso: dadosRegulamento.inciso,
        classificacaoRegulamento: dadosRegulamento.classificacao
      };
    }

    // ===== cálculo preciso (notaAnterior / notaNoDia) =====
    const dayStart = toDayStart(dt);
    const dayEnd   = toDayEnd(dt);

    const endOntem = new Date(dayStart.getTime() - 1);
    const instMatch = buildInstMatch(req.usuario.instituicao);

    const notificacoesAntes = await Notificacao.find({
      aluno, ...instMatch, data: { $lt: dayStart }
    }).select('data valorNumerico createdAt quantidadeDias tipoMedida natureza').sort({ data: 1, createdAt: 1 });

    const notaAnterior = calcularNotaTSMD(alunoRelacionado.dataEntrada, endOntem, notificacoesAntes);

    const notificacoesAteDia = await Notificacao.find({
      aluno, ...instMatch, data: { $lt: dayEnd }
    }).select('data valorNumerico createdAt quantidadeDias tipoMedida natureza').sort({ data: 1, createdAt: 1 });

    const paraCalculoDia = [
      ...notificacoesAteDia.map(n => ({
        data: n.data,
        createdAt: n.createdAt,
        valorNumerico: n.valorNumerico,
        quantidadeDias: n.quantidadeDias,
        tipoMedida: n.tipoMedida,
        natureza: n.natureza
      })),
      {
        data: dt,
        createdAt: dt,
        valorNumerico: Number(payload.valorNumerico || 0),
        quantidadeDias: payload.quantidadeDias ?? 1,
        tipoMedida: payload.tipoMedida,
        natureza: payload.natureza
      }
    ];
    const notaNoDia = calcularNotaTSMD(alunoRelacionado.dataEntrada, dayEnd, paraCalculoDia);

    // numeração sequencial por ano (instituição)
    const anoAtual = dt.getFullYear();
    const notificacoesAno = await Notificacao.find({
      numeroSequencial: { $regex: new RegExp(`\\/${anoAtual}$`) },
      ...instMatch
    }).select('numeroSequencial');

    let maiorNumero = 0;
    notificacoesAno.forEach(n => {
      const [num] = (n.numeroSequencial || '').split('/');
      const parsed = parseInt(num, 10);
      if (!isNaN(parsed) && parsed > maiorNumero) maiorNumero = parsed;
    });
    const proximoNumero = maiorNumero + 1;
    const numeroSequencial = `${String(proximoNumero).padStart(2, '0')}/${anoAtual}`;

    const novaNotificacao = new Notificacao({
      ...payload,
      notaAnterior,
      notaAtual: notaNoDia,
      numeroSequencial,
      status: 'pendente'
    });

    await novaNotificacao.save();

    // 🔎 LOG
    await logAction({
      req,
      acao: 'NOTIFICACAO_CRIADA',
      entidade: 'Notificacao',
      entidadeId: novaNotificacao._id,
      entidadeNome: alunoRelacionado?.nome,
      extra: {
        alunoId: String(alunoRelacionado?._id || aluno),
        alunoNome: alunoRelacionado?.nome || '—',
        alunoTurma: alunoRelacionado?.turma || '—',
        tipo: novaNotificacao.tipo,
        tipoMedida: novaNotificacao.tipoMedida,
        numeroSequencial: novaNotificacao.numeroSequencial,
        natureza: payload.natureza,
        motivo: payload.motivo,
        valorNumerico: payload.valorNumerico,
        quantidadeDias: payload.quantidadeDias,
        data: dt
      }
    });

    // (C) Recalcular nota atual do aluno até “agora”
    const alunoAtualizado = await recomputarNotaAlunoAteAgora(aluno, req.usuario.instituicao);

    // ===================== ENVIO MENSAGENS (criação) =====================

    // WhatsApp (mantido)
    if (alunoRelacionado.telefone) {
      const mensagemWA = `Olá, responsável pelo aluno ${alunoRelacionado.nome}.
      
Foi registrada uma ${payload.natureza === 'elogio' ? 'menção de elogio' : 'notificação disciplinar'}:
🔸 Motivo: ${payload.motivo}
🔸 Medida: ${payload.tipoMedida}${payload.quantidadeDias > 1 ? ` (${payload.quantidadeDias} dias)` : ''}

Nota de comportamento (no dia do evento): ${Number(notaNoDia).toFixed(2)}
Nº: ${numeroSequencial}`;
      try { await enviarWhatsapp(alunoRelacionado.telefone, mensagemWA); } catch {}
    }

    // Telegram (mantido)
    const chatIds = getChatIdsFromAlunoDoc(alunoRelacionado);
    if (chatIds.length) {
      const titulo = payload.natureza === 'elogio' ? 'ELOGIO' : 'NOTIFICAÇÃO DISCIPLINAR';
      const mensagemTG = [
        `🏫 CMDPII/CZS — ${titulo}`,
        `Aluno(a): ${alunoRelacionado.nome} (${alunoRelacionado.turma})`,
        `Data: ${formatDataBr(dt)}`,
        payload.natureza === 'elogio'
          ? `Elogio: ${payload.motivo}`
          : `Motivo: ${payload.motivo}`,
        payload.tipoMedida ? `Medida: ${payload.tipoMedida}${payload.quantidadeDias > 1 ? ` (${payload.quantidadeDias} dias)` : ''}` : null,
        `Nota de comportamento (no dia): ${Number(notaNoDia).toFixed(2)}`,
        `Nº: ${numeroSequencial}`
      ].filter(Boolean).join('\n');

      for (const cid of chatIds) {
        try { await enviarTelegram({ nome: alunoRelacionado.nome, turma: alunoRelacionado.turma }, 'Notificação', cid, mensagemTG); } catch {}
      }
    }

    // 💡 NP (faixa 5.00–6.99)
    await verificarEnvioNP(alunoAtualizado, req.usuario.instituicao);

    res.status(201).json(novaNotificacao);
  } catch (err) {
    console.error('Erro ao criar notificação:', err);
    res.status(500).json({ error: 'Erro ao criar notificação: ' + err.message });
  }
});

// PUT "/:id" (atualizar notificação) — inclui disparo quando virar DEFERIDO
router.put('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: req.params.id,
      ...instMatch
    });
    if (!notif) return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });

    const camposEditaveis = [
      'aluno','tipo','motivo','tipoMedida','valorNumerico','observacao','data',
      'quantidadeDias','comentarioMonitor','status','natureza','tipoElogio',
      'artigo','paragrafo','inciso','classificacaoRegulamento'
    ];

    const antes = {
      aluno: notif.aluno,
      tipo: notif.tipo,
      tipoMedida: notif.tipoMedida,
      natureza: notif.natureza,
      motivo: notif.motivo,
      valorNumerico: notif.valorNumerico,
      quantidadeDias: notif.quantidadeDias,
      data: notif.data,
      status: notif.status,
      numeroSequencial: notif.numeroSequencial
    };

    // aplicar mudanças
    for (const campo of camposEditaveis) {
      if (req.body[campo] !== undefined) {
        if (campo === 'data' && typeof req.body[campo] === 'string') {
          notif[campo] = parseDateOnlyLocal(req.body[campo]);
        } else {
          notif[campo] = req.body[campo];
        }
      }
    }

    // regras de cálculo
    if (notif.natureza === 'elogio') {
      if (req.body.valorNumerico === undefined && req.body.tipoElogio) {
        notif.valorNumerico = MAPA_ELOGIOS[req.body.tipoElogio] ?? notif.valorNumerico;
        notif.tipo = 'Elogio';
        notif.tipoMedida = 'Elogio';
        notif.artigo = notif.paragrafo = notif.inciso = notif.classificacaoRegulamento = null;
      }
    } else {
      const tipoMudou = typeof req.body.tipoMedida !== 'undefined' || typeof req.body.tipo !== 'undefined';
      const diasMudou = typeof req.body.quantidadeDias !== 'undefined';

      if (req.body.valorNumerico === undefined && (tipoMudou || diasMudou)) {
        const tituloMedida = ((req.body.tipoMedida ?? notif.tipoMedida ?? req.body.tipo ?? notif.tipo) || '').trim();
        const precisaDias = PRECISA_DIAS.has(tituloMedida);
        const diasBrutos = (req.body.quantidadeDias ?? notif.quantidadeDias ?? 1);
        const dias = precisaDias ? Math.max(1, parseInt(diasBrutos, 10) || 1) : 1;

        const base = MAPA_NEGATIVOS[tituloMedida] ?? 0;
        notif.valorNumerico = Number((base * dias).toFixed(2));
        notif.tipo = tituloMedida || notif.tipo;
        notif.tipoMedida = tituloMedida || notif.tipoMedida;
        notif.quantidadeDias = precisaDias ? dias : 1;

        if (!notif.artigo && !notif.classificacaoRegulamento && (req.body.motivo || notif.motivo)) {
          const dadosReg = obterDadosDoRegulamento(req.body.motivo || notif.motivo || '');
          notif.artigo = dadosReg.artigo ?? notif.artigo;
          notif.paragrafo = dadosReg.paragrafo ?? notif.paragrafo;
          notif.inciso = dadosReg.inciso ?? notif.inciso;
          notif.classificacaoRegulamento = dadosReg.classificacao ?? notif.classificacaoRegulamento;
        }
      }
    }

    // detectar transição para DEFERIDO
    const virouDeferido = (antes.status !== 'deferido' && notif.status === 'deferido');

    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, req.usuario.instituicao);

    await logAction({
      req,
      acao: 'NOTIFICACAO_ATUALIZADA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        antes,
        depois: {
          aluno: notif.aluno,
          tipo: notif.tipo,
          tipoMedida: notif.tipoMedida,
          natureza: notif.natureza,
          motivo: notif.motivo,
          valorNumerico: notif.valorNumerico,
          quantidadeDias: notif.quantidadeDias,
          data: notif.data,
          status: notif.status,
          numeroSequencial: notif.numeroSequencial
        }
      }
    });

    const alunoApósUpdate = await recomputarNotaAlunoAteAgora(notif.aluno, req.usuario.instituicao);

    // 💡 NP (faixa 5.00–6.99)
    await verificarEnvioNP(alunoApósUpdate, req.usuario.instituicao);

    // 🚀 NOVO: se virou DEFERIDO, dispara comunicado (idempotente)
    if (virouDeferido) {
      try {
        await enviarAvisoDeferidoIfNeeded({ req, notifId: notif._id });
      } catch (e) {
        console.warn('[deferido/update] falha disparo:', e.message);
      }
    }

    res.json({ message: 'Notificação atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);
    res.status(500).json({ message: 'Erro ao atualizar notificação.' });
  }
});

// PUT "/:id/reenviar" (voltar para pendente)
router.put('/:id/reenviar', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...instMatch
    });

    if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notificacao.aluno, req.usuario.instituicao);

    await logAction({
      req,
      acao: 'NOTIFICACAO_REENVIADA',
      entidade: 'Notificacao',
      entidadeId: notificacao._id,
      extra: {
        alunoId: String(notificacao.aluno),
        alunoNome, alunoTurma,
        tipo: notificacao.tipo,
        tipoMedida: notificacao.tipoMedida,
        numeroSequencial: notificacao.numeroSequencial,
        status: 'pendente'
      }
    });

    const alunoApósReenviar = await recomputarNotaAlunoAteAgora(notificacao.aluno, req.usuario.instituicao);
    await verificarEnvioNP(alunoApósReenviar, req.usuario.instituicao);

    res.json({ message: 'Notificação reenviada com sucesso.' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ message: 'Erro ao reenviar notificação.' });
  }
});

// POST "/:id/entregar"  + AVISO TELEGRAM
router.post('/:id/entregar', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({ _id: req.params.id, ...instMatch }).populate('aluno', 'nome turma instituicao telefone chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId dataEntrada');
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });

    if (notif.status !== 'deferido') {
      return res.status(400).json({ error: 'Apenas notificações deferidas podem ser marcadas como ENTREGUE.' });
    }
    if (notif.entregue === true) {
      return res.status(200).json({ message: 'Já estava marcada como ENTREGUE.', prazoDevolucao: notif.prazoDevolucao, entregueEm: notif.entregueEm });
    }

    const agora = new Date();
    const prazo = addBusinessDays(agora, 2, { tz: 'America/Rio_Branco' });

    notif.entregue = true;
    notif.entregueEm = agora;
    notif.prazoDevolucao = prazo;
    notif.alertaAtivo = false;
    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, req.usuario.instituicao);

    await logAction({
      req,
      acao: 'NOTIFICACAO_ENTREGUE',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno._id || notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        entregueEm: agora,
        prazoDevolucao: prazo
      }
    });

    const msgEntrega = [
      '📩 CMDPII/CZS — Confirmação de ENTREGA de notificação',
      `Aluno(a): ${alunoNome} (${alunoTurma})`,
      `Nº: ${notif.numeroSequencial}`,
      `Entregue em: ${formatDataHoraBr(agora)}`,
      `Prazo de devolução: ${formatDataBr(prazo)}`
    ].join('\n');

    const chatIds = getChatIdsFromAlunoDoc(notif.aluno);
    for (const cid of chatIds) {
      try { await enviarTelegram({ nome: alunoNome, turma: alunoTurma }, 'Notificação', cid, msgEntrega); } catch {}
    }

    if (notif.aluno?.telefone) {
      try { await enviarWhatsapp(notif.aluno.telefone, msgEntrega); } catch {}
    }

    const alunoDoc = await Aluno.findOne({ _id: notif.aluno._id || notif.aluno, ...buildAlunoMatch(req.usuario.instituicao) });
    await verificarEnvioNP(alunoDoc, req.usuario.instituicao);

    res.json({ message: 'Marcada como ENTREGUE.', prazoDevolucao: notif.prazoDevolucao, entregueEm: notif.entregueEm });
  } catch (err) {
    console.error('Erro ao marcar ENTREGUE:', err);
    res.status(500).json({ error: 'Erro ao marcar ENTREGUE.' });
  }
});

// POST "/:id/devolver"  + AVISO TELEGRAM
router.post('/:id/devolver', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({ _id: req.params.id, ...instMatch }).populate('aluno', 'nome turma instituicao telefone chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId');
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });

    if (notif.status !== 'deferido') {
      return res.status(400).json({ error: 'Apenas notificações deferidas podem ser marcadas como DEVOLVIDA.' });
    }
    if (!notif.entregue) {
      return res.status(400).json({ error: 'Marque ENTREGUE antes de marcar DEVOLVIDA.' });
    }
    if (notif.devolvidoPeloAluno === true) {
      return res.status(200).json({ message: 'Já estava marcada como DEVOLVIDA.', devolvidaEm: notif.devolvidaEm });
    }

    const agora = new Date();
    notif.devolvidoPeloAluno = true;
    notif.devolvidaEm = agora;
    notif.alertaAtivo = false;
    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno._id || notif.aluno, req.usuario.instituicao);

    await logAction({
      req,
      acao: 'NOTIFICACAO_DEVOLVIDA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno._id || notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        devolvidaEm: agora
      }
    });

    const msgDev = [
      '✅ CMDPII/CZS — Notificação DEVOLVIDA',
      `Aluno(a): ${alunoNome} (${alunoTurma})`,
      `Nº: ${notif.numeroSequencial}`,
      `Devolvida em: ${formatDataHoraBr(agora)}`
    ].join('\n');

    const chatIds = getChatIdsFromAlunoDoc(notif.aluno);
    for (const cid of chatIds) {
      try { await enviarTelegram({ nome: alunoNome, turma: alunoTurma }, 'Notificação', cid, msgDev); } catch {}
    }

    if (notif.aluno?.telefone) {
      try { await enviarWhatsapp(notif.aluno.telefone, msgDev); } catch {}
    }

    const alunoDoc = await Aluno.findOne({ _id: notif.aluno._id || notif.aluno, ...buildAlunoMatch(req.usuario.instituicao) });
    await verificarEnvioNP(alunoDoc, req.usuario.instituicao);

    res.json({ message: 'Marcada como DEVOLVIDA.', devolvidaEm: notif.devolvidaEm });
  } catch (err) {
    console.error('Erro ao marcar DEVOLVIDA:', err);
    res.status(500).json({ error: 'Erro ao marcar DEVOLVIDA.' });
  }
});

// 💥 NOVA ROTA: PUT "/:id/deferir" — muda status para DEFERIDO e dispara comunicado
router.put('/:id/deferir', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: req.params.id,
      ...instMatch
    });
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });

    // atualiza somente se não estiver deferido ainda
    if (notif.status !== 'deferido') {
      notif.status = 'deferido';
      notif.deferidoEm = new Date();
      await notif.save();
    }

    // dispara comunicado idempotente
    try {
      await enviarAvisoDeferidoIfNeeded({ req, notifId: notif._id });
    } catch (e) {
      console.warn('[deferido/endpoint] falha disparo:', e.message);
    }

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, req.usuario.instituicao);
    await logAction({
      req,
      acao: 'NOTIFICACAO_DEFERIDA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        deferidoEm: notif.deferidoEm
      }
    });

    res.json({ message: 'Notificação deferida e comunicado disparado (quando aplicável).', notificacao: notif });
  } catch (err) {
    console.error('Erro ao deferir notificação:', err);
    res.status(500).json({ error: 'Erro ao deferir notificação.' });
  }
});

// DELETE "/:id"
router.delete('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...instMatch
    });
    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });
    }

    const { alunoNome, alunoTurma } = await getAlunoInfo(notificacao.aluno, req.usuario.instituicao);

    await logAction({
      req,
      acao: 'NOTIFICACAO_EXCLUIDA',
      entidade: 'Notificacao',
      entidadeId: notificacao._id,
      extra: {
        alunoId: String(notificacao.aluno),
        alunoNome, alunoTurma,
        tipo: notificacao.tipo,
        tipoMedida: notificacao.tipoMedida,
        numeroSequencial: notificacao.numeroSequencial,
        natureza: notificacao.natureza,
        motivo: notificacao.motivo,
        valorNumerico: notificacao.valorNumerico,
        quantidadeDias: notificacao.quantidadeDias,
        data: notificacao.data
      }
    });

    const alunoId = notificacao.aluno;
    await notificacao.deleteOne();

    const alunoAtual = await recomputarNotaAlunoAteAgora(alunoId, req.usuario.instituicao);
    await verificarEnvioNP(alunoAtual, req.usuario.instituicao);

    res.json({ message: 'Notificação excluída e nota recalculada com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    res.status(500).json({ message: 'Erro ao excluir notificação.' });
  }
});

module.exports = router;
