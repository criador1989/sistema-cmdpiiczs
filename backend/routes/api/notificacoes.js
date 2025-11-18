// backend/routes/api/notificacoes.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const Counter = require('../../models/Counter'); // ✅ CONTADOR ATÔMICO

const calcularNotaTSMD = require('../../utils/calculoNota');
const enviarWhatsapp = require('../../utils/twilio');
const { autenticar } = require('../../middleware/autenticacao');
const { obterDadosDoRegulamento } = require('../../utils/regulamento');
const { addBusinessDays } = require('../../utils/businessDays');
const { logAction, attachActor } = require('../../utils/audit');

// 🚀 Serviços de mensageria (telegram + NP)
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
  const set = new Set(
    [
      ...(alunoDoc.chatIdsResponsaveis || []),
      alunoDoc.chatIdResponsavel || '',
      alunoDoc?.contatos?.telegramChatId || ''
    ]
      .map(s => String(s || '').trim())
      .filter(Boolean)
  );
  return Array.from(set);
}

/** pt-BR data/hora helpers (reutilizados abaixo) */
function formatDataBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function formatDataHoraBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
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
  const dias =
    notif?.quantidadeDias && notif.quantidadeDias > 1
      ? ` (${notif.quantidadeDias} dias)`
      : '';
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
  ]
    .filter(Boolean)
    .join('\n');

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
 * Dispara aviso de DEFERIDO (e-mail + telegram) de forma idempotente
 */
async function enviarAvisoDeferidoIfNeeded({ req, notifId }) {
  const mensageria = getMensageria(req);
  const notif = await Notificacao.findById(notifId).lean();
  if (!notif) return { skipped: true, reason: 'notificação não encontrada' };
  if (notif.status !== 'deferido') return { skipped: true, reason: 'status não é deferido' };
  if (notif.mensagemEnviada) return { skipped: true, reason: 'mensagem já enviada' };

  const aluno = await Aluno.findById(notif.aluno).lean();
  const { subject, text, html } = montarEmailDeferido({ aluno, notif });

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
      const chatIds = getChatIdsFromAlunoDoc(aluno);
      if (chatIds.length) {
        const msgTG = [
          '🔔 CMDPII/CZS — Notificação DEFERIDA',
          `Aluno(a): ${aluno?.nome || '—'} (${aluno?.turma || '—'})`,
          `Medida: ${notif?.tipoMedida || notif?.tipo || '—'}${
            notif?.quantidadeDias > 1 ? ` (${notif.quantidadeDias} dias)` : ''
          }`,
          `Nº: ${notif?.numeroSequencial || '—'}`,
          `Data: ${notif?.data ? formatDataBr(notif.data) : formatDataBr(new Date())}`
        ].join('\n');
        for (const cid of chatIds) {
          try {
            await enviarTelegram(
              { nome: aluno?.nome, turma: aluno?.turma },
              'Notificação',
              cid,
              msgTG
            );
          } catch {}
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
  'Advertência Escrita': -0.3,
  Repreensão: -0.5,
  'A.E.C.D.E': -0.7,
  'A.I.A': -1.2
};
const MAPA_ELOGIOS = {
  elogioVerbal: 0.15,
  boletimInternoIndividual: 0.6,
  boletimInternoColetivo: 0.2,
  mediaAlta: 0.4
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
    if (mongoose.isValidObjectId(inst))
      ors.push({ instituicao: new mongoose.Types.ObjectId(inst) });
  }
  return { $or: ors };
}
function parseDateOnlyLocal(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return new Date();
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function toDayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toDayEnd(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
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
  const a = await Aluno.findOne({
    _id: alunoId,
    ...buildAlunoMatch(instituicao)
  })
    .select('nome turma')
    .lean();
  return { alunoNome: a?.nome || '—', alunoTurma: a?.turma || '—' };
}
async function verificarEnvioNP(alunoDoc, instituicao) {
  if (!alunoDoc) return;
  const nota = Number(alunoDoc.comportamento);
  if (!estaFaixaRegular(nota)) return;

  const jaEnviadoEm = alunoDoc.alertas?.npRegularEnviadoAt || null;
  const ultimaNota =
    typeof alunoDoc.alertas?.npRegularUltimaNota === 'number'
      ? alunoDoc.alertas.npRegularUltimaNota
      : null;
  const precisaEnviar =
    !jaEnviadoEm || ultimaNota === null || Math.abs(Number(ultimaNota) - nota) >= 0.01;

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

/* ========= NOVO: contador atômico p/ numeroSequencial SEM transações ========= */
async function getNextNumeroSequencialAtomic(instituicao, dataRef = new Date()) {
  const ano =
    dataRef instanceof Date ? dataRef.getFullYear() : new Date().getFullYear();
  const chave = `notificacao:${String(instituicao)}:${ano}`;

  // 1) Descobre o MAIOR numeroSequencial já usado nesse ano/instituição
  const ult = await Notificacao.find({
    instituicao: instituicao,
    data: { $gte: new Date(ano, 0, 1), $lt: new Date(ano + 1, 0, 1) }
  })
    .select('numeroSequencial')
    .sort({ numeroSequencial: -1 }) // pega o maior, pois é zero-padded
    .limit(1)
    .lean();

  let startSeq = 0;
  let pad = 4;

  if (ult?.length && ult[0]?.numeroSequencial) {
    const m = String(ult[0].numeroSequencial).match(/^(\d{1,})\//);
    if (m) {
      startSeq = parseInt(m[1], 10) || 0;
      pad = Math.max(m[1].length, 4);
    }
  }

  // 2) Busca/cria documento do contador
  let counter = await Counter.findOne({ chave });

  if (!counter) {
    try {
      counter = await Counter.create({
        chave,
        seq: startSeq,
        ano,
        atualizadoEm: new Date()
      });
    } catch (e) {
      // Em corrida, alguém criou antes: busca de novo
      if (e.code === 11000) {
        counter = await Counter.findOne({ chave });
      } else {
        throw e;
      }
    }
  }

  // 3) Se por algum motivo o seq do contador estiver ABAIXO do máximo já usado,
  //    ajusta pra não repetir números.
  if (counter.seq < startSeq) {
    counter = await Counter.findOneAndUpdate(
      { chave },
      { $set: { seq: startSeq, atualizadoEm: new Date(), ano } },
      { new: true }
    );
  }

  // 4) Incrementa seq de forma atômica
  counter = await Counter.findOneAndUpdate(
    { chave },
    { $inc: { seq: 1 }, $set: { atualizadoEm: new Date(), ano } },
    { new: true }
  );

  const seq = counter.seq;
  return {
    ano,
    seq,
    numeroSequencial: `${String(seq).padStart(pad, '0')}/${ano}`
  };
}

/* ========= NOVO HELPER: recalcular campos nota da própria notificação ========= */
async function recomputarCamposNotaDaNotificacao(notif, instituicao) {
  try {
    const alunoDoc = await Aluno.findOne({
      _id: notif.aluno,
      ...buildAlunoMatch(instituicao)
    })
      .select('dataEntrada')
      .lean();

    if (!alunoDoc) return;

    const dt = notif.data || new Date();
    const dayStart = toDayStart(dt);
    const dayEnd = toDayEnd(dt);
    const endOntem = new Date(dayStart.getTime() - 1);
    const instMatch = buildInstMatch(instituicao);

    // Notas antes de hoje (para notaAnterior)
    const notificacoesAntes = await Notificacao.find({
      aluno: notif.aluno,
      ...instMatch,
      data: { $lt: dayStart }
    })
      .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza')
      .sort({ data: 1, createdAt: 1 });

    const notaAnterior = calcularNotaTSMD(
      alunoDoc.dataEntrada,
      endOntem,
      notificacoesAntes
    );

    // Notas até o fim do dia (para notaAtual / nota no dia)
    const notificacoesAteDia = await Notificacao.find({
      aluno: notif.aluno,
      ...instMatch,
      data: { $lt: dayEnd }
    })
      .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza')
      .sort({ data: 1, createdAt: 1 });

    const listaDia = [
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
        createdAt: notif.createdAt || dt,
        valorNumerico: Number(notif.valorNumerico || 0),
        quantidadeDias: notif.quantidadeDias ?? 1,
        tipoMedida: notif.tipoMedida,
        natureza: notif.natureza
      }
    ];

    const notaNoDia = calcularNotaTSMD(
      alunoDoc.dataEntrada,
      dayEnd,
      listaDia
    );

    await Notificacao.findByIdAndUpdate(notif._id, {
      $set: {
        notaAnterior: Number(notaAnterior.toFixed?.(2) ?? notaAnterior),
        notaAtual: Number(notaNoDia.toFixed?.(2) ?? notaNoDia)
      }
    });
  } catch (e) {
    console.warn('[recomputarCamposNotaDaNotificacao] falha:', e?.message || e);
  }
}

/* ========= Helper local: valida ObjectId para rotas /:id ========= */
function isObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

/* ================= ROTAS (ORDEM IMPORTA!) ================= */

/* ---------------- ROTAS ESTÁTICAS / COLEÇÕES --------------- */

// GET "/novas" (placeholder)
router.get('/novas', autenticar, attachActor, async (_req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

// GET "/pendencias/devolucao/contador"
router.get(
  '/pendencias/devolucao/contador',
  autenticar,
  attachActor,
  async (req, res) => {
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
      res
        .status(500)
        .json({ error: 'Erro ao calcular contador de pendências.' });
    }
  }
);

/* ——— Handler compartilhado para pendências de devolução ——— */
async function handlerPendenciasDevolucao(req, res) {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const alunoMatch = buildAlunoMatch(req.usuario.instituicao);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || '50', 10), 1),
      200
    );
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
      .select(
        'aluno entregue entregueEm prazoDevolucao devolvidoPeloAluno numeroSequencial tipo tipoMedida data'
      )
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao',
        match: alunoMatch
      })
      .lean();

    const filtrados = (itens || []).filter(i => i.aluno);
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro pendências:', err);
    res
      .status(500)
      .json({ error: 'Erro ao buscar pendências de devolução.' });
  }
}

// GET "/pendencias/devolucao" (rota original)
router.get(
  '/pendencias/devolucao',
  autenticar,
  attachActor,
  handlerPendenciasDevolucao
);

// ✅ Alias chamado pelo painel antigo: "/pendentes-devolucao"
router.get(
  '/pendentes-devolucao',
  autenticar,
  attachActor,
  handlerPendenciasDevolucao
);

// ✅ Alias para listagem de pendentes
router.get('/pendentes', autenticar, attachActor, async (req, res) => {
  try {
    const instMatch = buildInstMatch(req.usuario.instituicao);
    const alunoMatch = buildAlunoMatch(req.usuario.instituicao);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || '50', 10), 1),
      200
    );

    const itens = await Notificacao.find({
      ...instMatch,
      status: 'pendente'
    })
      .sort({ data: -1, createdAt: -1 })
      .limit(limit)
      .select(
        'aluno numeroSequencial tipo tipoMedida data status natureza'
      )
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao',
        match: alunoMatch
      })
      .lean();

    const filtrados = (itens || []).filter(i => i.aluno);
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro listar pendentes:', err);
    res
      .status(500)
      .json({ error: 'Erro ao buscar notificações pendentes.' });
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
        return res.json({
          total: 0,
          page,
          totalPages: 0,
          data: []
        });
      }
      filtroBase.aluno = { $in: ids };
    }

    const total = await Notificacao.countDocuments(filtroBase);
    const totalPages = Math.ceil(total / limit) || 0;

    const notificacoes = await Notificacao.find(filtroBase)
      .sort({ data: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        'aluno tipo tipoMedida data status valorNumerico quantidadeDias notaAnterior notaAtual comentarioMonitor numeroSequencial entregue prazoDevolucao devolvidoPeloAluno entregueEm natureza mensagemEnviada deferidoEm'
      )
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao',
        match: alunoMatch
      })
      .lean();

    const dataRaw = (notificacoes || []).filter(n => n.aluno);

    const data = dataRaw.map(n => {
      const precisaDias = PRECISA_DIAS.has(n.tipoMedida);
      const dias = precisaDias
        ? Math.max(1, parseInt(n.quantidadeDias || 1, 10))
        : 1;
      const valorTotal = Number(n.valorNumerico || 0);
      const valorUnitario = precisaDias
        ? Number((valorTotal / dias).toFixed(2))
        : valorTotal;
      return { ...n, valorTotal, valorUnitario };
    });

    res.json({ total, page, totalPages, data });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res
      .status(500)
      .json({ error: 'Erro ao buscar notificações.' });
  }
});

/* -------------------- POST "/" (CRIAR) — SEM TRANSAÇÃO -------------------- */
router.post('/', autenticar, attachActor, async (req, res) => {
  try {
    const inst = req.usuario?.instituicao;
    if (!inst) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const {
      aluno,
      natureza,
      tipo,
      tipoMedida,
      tipoElogio,
      motivo,
      quantidadeDias,
      valorNumerico,
      observacao,
      data,
      artigo,
      paragrafo,
      inciso,
      classificacaoRegulamento,
      comentarioMonitor
    } = req.body || {};

    if (!aluno || !mongoose.isValidObjectId(aluno)) {
      return res
        .status(400)
        .json({ message: 'Aluno inválido/ausente.' });
    }

    // Confirma aluno pertence à instituição
    const alunoDoc = await Aluno.findOne({
      _id: aluno,
      ...buildAlunoMatch(inst)
    })
      .select('nome turma instituicao')
      .lean();
    if (!alunoDoc) {
      return res
        .status(404)
        .json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    // Normaliza natureza/medida/valor
    const ehElogio = natureza === 'elogio';
    let tituloMedida = ehElogio ? 'Elogio' : (tipoMedida || tipo || '').trim();
    let dias = 1;
    if (!ehElogio && PRECISA_DIAS.has(tituloMedida)) {
      const d = parseInt(quantidadeDias, 10);
      dias = Number.isInteger(d) && d > 0 ? d : 1;
    }

    let valor = 0;
    if (ehElogio) {
      const m = MAPA_ELOGIOS[tipoElogio] ?? undefined;
      valor =
        typeof valorNumerico === 'number'
          ? valorNumerico
          : typeof m === 'number'
          ? m
          : 0;
    } else {
      const base = MAPA_NEGATIVOS[tituloMedida] ?? 0;
      valor =
        typeof valorNumerico === 'number'
          ? valorNumerico
          : Number((base * dias).toFixed(2));
    }

    // DATA
    const dataRef = data ? parseDateOnlyLocal(data) : new Date();

    // numeroSequencial atômico (sem transação)
    const ns = await getNextNumeroSequencialAtomic(inst, dataRef);
    const numeroSequencial = ns.numeroSequencial;

    // Cria notificação
    const created = await Notificacao.create({
      instituicao: inst,
      aluno,
      natureza: ehElogio ? 'elogio' : 'indisciplina',
      tipo: tituloMedida || (ehElogio ? 'Elogio' : ''),
      tipoMedida: tituloMedida || (ehElogio ? 'Elogio' : ''),
      tipoElogio: ehElogio ? tipoElogio || null : null,
      motivo: ehElogio
        ? {
            elogioVerbal: 'Elogio verbal',
            boletimInternoIndividual: 'Boletim Interno Individual',
            boletimInternoColetivo: 'Boletim Interno Coletivo',
            mediaAlta: 'Média ≥ 8,5'
          }[tipoElogio] || 'Elogio'
        : (typeof motivo === 'string' ? motivo : '').trim(),
      quantidadeDias: ehElogio
        ? 1
        : PRECISA_DIAS.has(tituloMedida)
        ? dias
        : 1,
      valorNumerico: Number(valor || 0),
      observacao: (observacao || '').trim(),
      data: dataRef,
      comentarioMonitor: (comentarioMonitor || '').trim(),
      artigo: ehElogio ? null : artigo || null,
      paragrafo: ehElogio ? null : paragrafo || null,
      inciso: ehElogio ? null : inciso || null,
      classificacaoRegulamento: ehElogio
        ? null
        : classificacaoRegulamento || null,
      status: 'pendente',
      numeroSequencial
    });

    // Mantém campos de nota consistentes e analytics
    await recomputarCamposNotaDaNotificacao(created, inst);
    const alunoApósCreate = await recomputarNotaAlunoAteAgora(aluno, inst);
    await verificarEnvioNP(alunoApósCreate, inst);

    const { alunoNome, alunoTurma } = await getAlunoInfo(aluno, inst);
    await logAction({
      req,
      acao: 'NOTIFICACAO_CRIADA',
      entidade: 'Notificacao',
      entidadeId: created._id,
      extra: {
        alunoId: String(aluno),
        alunoNome,
        alunoTurma,
        tipo: created.tipo,
        tipoMedida: created.tipoMedida,
        numeroSequencial: created.numeroSequencial,
        natureza: created.natureza,
        data: created.data
      }
    });

    res.status(201).json({ ok: true, notificacao: created });
  } catch (err) {
    console.error('❌ Erro ao criar notificação:', err);
    const msg =
      String(err?.code) === '11000' &&
      /numeroSequencial/.test(String(err?.message || ''))
        ? 'Número sequencial duplicado — tente novamente.'
        : 'Erro ao criar notificação.';
    res.status(500).json({ message: msg });
  }
});

/* ---------------- ROTAS POR ID (depois das estáticas) --------------- */

// GET "/:id" (detalhes)
router.get('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ message: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: id,
      ...instMatch
    }).populate({ path: 'aluno', select: 'nome turma instituicao' });

    if (!notificacao)
      return res
        .status(404)
        .json({ message: 'Notificação não encontrada' });

    const precisaDias = PRECISA_DIAS.has(notificacao.tipoMedida);
    const dias = precisaDias
      ? Math.max(1, parseInt(notificacao.quantidadeDias || 1, 10))
      : 1;
    const valorTotal = Number(notificacao.valorNumerico || 0);
    const valorUnitario = precisaDias
      ? Number((valorTotal / dias).toFixed(2))
      : valorTotal;

    const notaPublicavel =
      typeof notificacao.notaAtual === 'number'
        ? Number(notificacao.notaAtual).toFixed(2)
        : typeof notificacao.notaAnterior === 'number'
        ? Number(notificacao.notaAnterior).toFixed(2)
        : null;

    res.json({
      ...notificacao.toObject(),
      valorTotal,
      valorUnitario,
      notaPublicavel
    });
  } catch (err) {
    console.error('Erro ao carregar notificação:', err);
    res
      .status(500)
      .json({ message: 'Erro ao carregar notificação.' });
  }
});

// POST "/:id/entregar"
router.post('/:id/entregar', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: id,
      ...instMatch
    }).populate(
      'aluno',
      'nome turma instituicao telefone chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId dataEntrada'
    );
    if (!notif)
      return res
        .status(404)
        .json({ error: 'Notificação não encontrada.' });

    if (notif.status !== 'deferido') {
      return res.status(400).json({
        error: 'Apenas notificações deferidas podem ser marcadas como ENTREGUE.'
      });
    }
    if (notif.entregue === true) {
      return res.status(200).json({
        message: 'Já estava marcada como ENTREGUE.',
        prazoDevolucao: notif.prazoDevolucao,
        entregueEm: notif.entregueEm
      });
    }

    const agora = new Date();
    const prazo = addBusinessDays(agora, 2, { tz: 'America/Rio_Branco' });

    notif.entregue = true;
    notif.entregueEm = agora;
    notif.prazoDevolucao = prazo;
    notif.alertaAtivo = false;
    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notif.aluno,
      req.usuario.instituicao
    );

    await logAction({
      req,
      acao: 'NOTIFICACAO_ENTREGUE',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno._id || notif.aluno),
        alunoNome,
        alunoTurma,
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
      try {
        await enviarTelegram(
          { nome: alunoNome, turma: alunoTurma },
          'Notificação',
          cid,
          msgEntrega
        );
      } catch {}
    }

    if (notif.aluno?.telefone) {
      try {
        await enviarWhatsapp(notif.aluno.telefone, msgEntrega);
      } catch {}
    }

    const alunoDoc = await Aluno.findOne({
      _id: notif.aluno._id || notif.aluno,
      ...buildAlunoMatch(req.usuario.instituicao)
    });
    await verificarEnvioNP(alunoDoc, req.usuario.instituicao);

    res.json({
      message: 'Marcada como ENTREGUE.',
      prazoDevolucao: notif.prazoDevolucao,
      entregueEm: notif.entregueEm
    });
  } catch (err) {
    console.error('Erro ao marcar ENTREGUE:', err);
    res.status(500).json({ error: 'Erro ao marcar ENTREGUE.' });
  }
});

// POST "/:id/devolver"
router.post('/:id/devolver', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: id,
      ...instMatch
    }).populate(
      'aluno',
      'nome turma instituicao telefone chatIdResponsavel chatIdsResponsaveis contatos.telegramChatId'
    );
    if (!notif)
      return res
        .status(404)
        .json({ error: 'Notificação não encontrada.' });

    if (notif.status !== 'deferido') {
      return res.status(400).json({
        error: 'Apenas notificações deferidas podem ser marcadas como DEVOLVIDA.'
      });
    }
    if (!notif.entregue) {
      return res.status(400).json({
        error: 'Marque ENTREGUE antes de marcar DEVOLVIDA.'
      });
    }
    if (notif.devolvidoPeloAluno === true) {
      return res.status(200).json({
        message: 'Já estava marcada como DEVOLVIDA.',
        devolvidaEm: notif.devolvidaEm
      });
    }

    const agora = new Date();
    notif.devolvidoPeloAluno = true;
    notif.devolvidaEm = agora;
    notif.alertaAtivo = false;
    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notif.aluno._id || notif.aluno,
      req.usuario.instituicao
    );

    await logAction({
      req,
      acao: 'NOTIFICACAO_DEVOLVIDA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno._id || notif.aluno),
        alunoNome,
        alunoTurma,
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
      try {
        await enviarTelegram(
          { nome: alunoNome, turma: alunoTurma },
          'Notificação',
          cid,
          msgDev
        );
      } catch {}
    }

    if (notif.aluno?.telefone) {
      try {
        await enviarWhatsapp(notif.aluno.telefone, msgDev);
      } catch {}
    }

    const alunoDoc = await Aluno.findOne({
      _id: notif.aluno._id || notif.aluno,
      ...buildAlunoMatch(req.usuario.instituicao)
    });
    await verificarEnvioNP(alunoDoc, req.usuario.instituicao);

    res.json({
      message: 'Marcada como DEVOLVIDA.',
      devolvidaEm: notif.devolvidaEm
    });
  } catch (err) {
    console.error('Erro ao marcar DEVOLVIDA:', err);
    res.status(500).json({ error: 'Erro ao marcar DEVOLVIDA.' });
  }
});

// PUT "/:id" (atualizar notificação)
router.put('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ message: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: id,
      ...instMatch
    });
    if (!notif)
      return res.status(404).json({
        message: 'Notificação não encontrada ou não pertence à instituição.'
      });

    const camposEditaveis = [
      'aluno',
      'tipo',
      'motivo',
      'tipoMedida',
      'valorNumerico',
      'observacao',
      'data',
      'quantidadeDias',
      'comentarioMonitor',
      'status',
      'natureza',
      'tipoElogio',
      'artigo',
      'paragrafo',
      'inciso',
      'classificacaoRegulamento'
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

    for (const campo of camposEditaveis) {
      if (req.body[campo] !== undefined) {
        if (campo === 'data' && typeof req.body[campo] === 'string') {
          notif[campo] = parseDateOnlyLocal(req.body[campo]);
        } else {
          notif[campo] = req.body[campo];
        }
      }
    }

    if (notif.natureza === 'elogio') {
      if (req.body.valorNumerico === undefined && req.body.tipoElogio) {
        notif.valorNumerico =
          MAPA_ELOGIOS[req.body.tipoElogio] ?? notif.valorNumerico;
        notif.tipo = 'Elogio';
        notif.tipoMedida = 'Elogio';
        notif.artigo =
          notif.paragrafo =
          notif.inciso =
          notif.classificacaoRegulamento =
            null;
      }
    } else {
      const tipoMudou =
        typeof req.body.tipoMedida !== 'undefined' ||
        typeof req.body.tipo !== 'undefined';
      const diasMudou =
        typeof req.body.quantidadeDias !== 'undefined';

      if (
        req.body.valorNumerico === undefined &&
        (tipoMudou || diasMudou)
      ) {
        const tituloMedida = (
          req.body.tipoMedida ??
          notif.tipoMedida ??
          req.body.tipo ??
          notif.tipo ??
          ''
        ).trim();
        const precisaDias = PRECISA_DIAS.has(tituloMedida);
        const diasBrutos =
          req.body.quantidadeDias ?? notif.quantidadeDias ?? 1;
        const dias = precisaDias
          ? Math.max(1, parseInt(diasBrutos, 10) || 1)
          : 1;

        const base = MAPA_NEGATIVOS[tituloMedida] ?? 0;
        notif.valorNumerico = Number((base * dias).toFixed(2));
        notif.tipo = tituloMedida || notif.tipo;
        notif.tipoMedida = tituloMedida || notif.tipoMedida;
        notif.quantidadeDias = precisaDias ? dias : 1;

        if (
          !notif.artigo &&
          !notif.classificacaoRegulamento &&
          (req.body.motivo || notif.motivo)
        ) {
          const dadosReg = obterDadosDoRegulamento(
            req.body.motivo || notif.motivo || ''
          );
          notif.artigo = dadosReg.artigo ?? notif.artigo;
          notif.paragrafo = dadosReg.paragrafo ?? notif.paragrafo;
          notif.inciso = dadosReg.inciso ?? notif.inciso;
          notif.classificacaoRegulamento =
            dadosReg.classificacao ?? notif.classificacaoRegulamento;
        }
      }
    }

    const virouDeferido =
      antes.status !== 'deferido' && notif.status === 'deferido';

    await notif.save();

    await recomputarCamposNotaDaNotificacao(
      notif,
      req.usuario.instituicao
    );

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notif.aluno,
      req.usuario.instituicao
    );

    await logAction({
      req,
      acao: 'NOTIFICACAO_ATUALIZADA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome,
        alunoTurma,
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

    const alunoApósUpdate = await recomputarNotaAlunoAteAgora(
      notif.aluno,
      req.usuario.instituicao
    );
    await verificarEnvioNP(alunoApósUpdate, req.usuario.instituicao);

    if (virouDeferido) {
      try {
        await enviarAvisoDeferidoIfNeeded({
          req,
          notifId: notif._id
        });
      } catch (e) {
        console.warn('[deferido/update] falha disparo:', e.message);
      }
    }

    res.json({ message: 'Notificação atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);
    res
      .status(500)
      .json({ message: 'Erro ao atualizar notificação.' });
  }
});

// PUT "/:id/reenviar"
router.put('/:id/reenviar', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ message: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: id,
      ...instMatch
    });

    if (!notificacao)
      return res
        .status(404)
        .json({ message: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notificacao.aluno,
      req.usuario.instituicao
    );

    await logAction({
      req,
      acao: 'NOTIFICACAO_REENVIADA',
      entidade: 'Notificacao',
      entidadeId: notificacao._id,
      extra: {
        alunoId: String(notificacao.aluno),
        alunoNome,
        alunoTurma,
        tipo: notificacao.tipo,
        tipoMedida: notificacao.tipoMedida,
        numeroSequencial: notificacao.numeroSequencial,
        status: 'pendente'
      }
    });

    const alunoApósReenviar = await recomputarNotaAlunoAteAgora(
      notificacao.aluno,
      req.usuario.instituicao
    );
    await verificarEnvioNP(alunoApósReenviar, req.usuario.instituicao);

    res.json({ message: 'Notificação reenviada com sucesso.' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res
      .status(500)
      .json({ message: 'Erro ao reenviar notificação.' });
  }
});

// PUT "/:id/deferir"
router.put('/:id/deferir', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ error: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notif = await Notificacao.findOne({
      _id: id,
      ...instMatch
    });
    if (!notif)
      return res
        .status(404)
        .json({ error: 'Notificação não encontrada.' });

    if (notif.status !== 'deferido') {
      notif.status = 'deferido';
      notif.deferidoEm = new Date();
      await notif.save();
      await recomputarCamposNotaDaNotificacao(
        notif,
        req.usuario.instituicao
      );
    }

    try {
      await enviarAvisoDeferidoIfNeeded({
        req,
        notifId: notif._id
      });
    } catch (e) {
      console.warn('[deferido/endpoint] falha disparo:', e.message);
    }

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notif.aluno,
      req.usuario.instituicao
    );
    await logAction({
      req,
      acao: 'NOTIFICACAO_DEFERIDA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome,
        alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        deferidoEm: notif.deferidoEm
      }
    });

    res.json({
      message:
        'Notificação deferida e comunicado disparado (quando aplicável).',
      notificacao: notif
    });
  } catch (err) {
    console.error('Erro ao deferir notificação:', err);
    res
      .status(500)
      .json({ error: 'Erro ao deferir notificação.' });
  }
});

// DELETE "/:id"
router.delete('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ message: 'ID inválido' });

    const instMatch = buildInstMatch(req.usuario.instituicao);
    const notificacao = await Notificacao.findOne({
      _id: id,
      ...instMatch
    });
    if (!notificacao) {
      return res.status(404).json({
        message:
          'Notificação não encontrada ou não pertence à instituição.'
      });
    }

    const { alunoNome, alunoTurma } = await getAlunoInfo(
      notificacao.aluno,
      req.usuario.instituicao
    );

    await logAction({
      req,
      acao: 'NOTIFICACAO_EXCLUIDA',
      entidade: 'Notificacao',
      entidadeId: notificacao._id,
      extra: {
        alunoId: String(notificacao.aluno),
        alunoNome,
        alunoTurma,
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

    const alunoAtual = await recomputarNotaAlunoAteAgora(
      alunoId,
      req.usuario.instituicao
    );
    await verificarEnvioNP(alunoAtual, req.usuario.instituicao);

    res.json({
      message:
        'Notificação excluída e nota recalculada com sucesso.'
    });
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    res
      .status(500)
      .json({ message: 'Erro ao excluir notificação.' });
  }
});

module.exports = router;
