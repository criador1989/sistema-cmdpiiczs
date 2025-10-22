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
const { addBusinessDays } = require('../../utils/businessDays'); // ⬅️ NOVO

// 🔎 auditoria centralizada
const { logAction, attachActor } = require('../../utils/audit');

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

// ------------------ Helpers ------------------
/** Data-only local (evita parse UTC “+1 dia”) */
function parseDateOnlyLocal(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return new Date();
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0); // local midnight
}

function toDayStart(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function toDayEnd(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }

/** Recalcula e persiste a nota ATUAL do aluno até “agora” */
async function recomputarNotaAlunoAteAgora(alunoId, instituicao) {
  const aluno = await Aluno.findOne({ _id: alunoId, instituicao });
  if (!aluno) return null;

  const historico = await Notificacao.find({ aluno: alunoId, instituicao })
    .select('data valorNumerico createdAt')
    .sort({ data: 1, createdAt: 1 });

  const notaFinal = calcularNotaTSMD(aluno.dataEntrada, new Date(), historico);
  aluno.comportamento = +Number(notaFinal).toFixed(2);
  await aluno.save();
  return aluno;
}

/** Busca nome/turma para logs */
async function getAlunoInfo(alunoId, instituicao) {
  if (!alunoId) return { alunoNome: '—', alunoTurma: '—' };
  const a = await Aluno.findOne({ _id: alunoId, instituicao }).select('nome turma').lean();
  return { alunoNome: a?.nome || '—', alunoTurma: a?.turma || '—' };
}

// ------------------------------------------------------
// GET "/novas" (placeholder)
// ------------------------------------------------------
router.get('/novas', autenticar, attachActor, async (_req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

// ------------------------------------------------------
// GET "/pendencias/devolucao/contador"
// ------------------------------------------------------
router.get('/pendencias/devolucao/contador', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const agora = new Date();
    const total = await Notificacao.countDocuments({
      instituicao,
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

// ------------------------------------------------------
// GET "/pendencias/devolucao"
// ------------------------------------------------------
router.get('/pendencias/devolucao', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const agora = new Date();

    const itens = await Notificacao.find({
      instituicao,
      status: 'deferido',
      entregue: true,
      devolvidoPeloAluno: { $ne: true },
      prazoDevolucao: { $ne: null, $lt: agora }
    })
      .sort({ prazoDevolucao: 1 })
      .limit(limit)
      .select('aluno entregue entregueEm prazoDevolucao devolvidoPeloAluno numeroSequencial tipo tipoMedida data')
      .populate({ path: 'aluno', select: 'nome turma', match: { instituicao } })
      .lean();

    const filtrados = (itens || []).filter(i => i.aluno); // safety
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro pendências:', err);
    res.status(500).json({ error: 'Erro ao buscar pendências de devolução.' });
  }
});

// ------------------------------------------------------
// GET "/" (lista paginada)
// ------------------------------------------------------
router.get('/', autenticar, attachActor, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.max(parseInt(req.query.limit || '10', 10), 1);

    const instituicao = req.usuario.instituicao;
    const q = (req.query.q || '').trim();
    const turma = (req.query.turma || '').trim();

    const filtroBase = { instituicao };

    if (q || turma) {
      const alunoFiltro = { instituicao };
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
      .select('aluno tipo tipoMedida data status valorNumerico notaAnterior notaAtual comentarioMonitor numeroSequencial entregue prazoDevolucao devolvidoPeloAluno entregueEm')
      .populate({
        path: 'aluno',
        select: 'nome turma',
        match: { instituicao }
      })
      .lean();

    const data = (notificacoes || []).filter(n => n.aluno);
    res.json({ total, page, totalPages, data });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

// ------------------------------------------------------
// GET "/:id" (detalhes)
// ------------------------------------------------------
router.get('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada' });
    res.json(notificacao);
  } catch (err) {
    console.error('Erro ao carregar notificação:', err);
    res.status(500).json({ message: 'Erro ao carregar notificação.' });
  }
});

// ------------------------------------------------------
// POST "/" (criar notificação)
// ------------------------------------------------------
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
      instituicao: req.usuario.instituicao
    });

    if (!alunoRelacionado) {
      return res.status(404).json({ error: 'Aluno não encontrado ou pertence a outra instituição' });
    }

    const dt = data ? parseDateOnlyLocal(data) : new Date();

    // Valor numérico e rótulos
    let valor = 0;
    let payload = {
      aluno,
      instituicao: req.usuario.instituicao,
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
      const tituloMedida = tipoMedida || tipo || '';
      const base = (typeof valorNumerico === 'number') ? valorNumerico : (MAPA_NEGATIVOS[tituloMedida] || 0);
      const precisaDias = ['A.E.C.D.E', 'A.I.A'].includes(tituloMedida);
      const dias = precisaDias ? Math.max(1, parseInt(quantidadeDias || 1, 10)) : 1;
      valor = Number((base * dias).toFixed(2));

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

    // ===== cálculo preciso
    const dayStart = toDayStart(dt);
    const dayEnd   = toDayEnd(dt);

    // (A) nota até ontem
    const endOntem = new Date(dayStart.getTime() - 1);
    const notificacoesAntes = await Notificacao.find({
      aluno, instituicao: req.usuario.instituicao, data: { $lt: dayStart }
    }).select('data valorNumerico createdAt').sort({ data: 1, createdAt: 1 });

    const notaAnterior = calcularNotaTSMD(alunoRelacionado.dataEntrada, endOntem, notificacoesAntes);

    // (B) nota até o fim do dia do evento + esta ocorrência
    const notificacoesAteDia = await Notificacao.find({
      aluno, instituicao: req.usuario.instituicao, data: { $lt: dayEnd }
    }).select('data valorNumerico createdAt').sort({ data: 1, createdAt: 1 });

    const paraCalculoDia = [
      ...notificacoesAteDia.map(n => ({ data: n.data, createdAt: n.createdAt, valorNumerico: n.valorNumerico })),
      { data: dt, createdAt: dt, valorNumerico: Number(valor || 0) }
    ];
    const notaNoDia = calcularNotaTSMD(alunoRelacionado.dataEntrada, dayEnd, paraCalculoDia);

    // numeração sequencial por ano (instituição)
    const anoAtual = dt.getFullYear();
    const notificacoesAno = await Notificacao.find({
      numeroSequencial: { $regex: new RegExp(`\\/${anoAtual}$`) },
      instituicao: req.usuario.instituicao
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

    // 🔎 LOG (aguardado, com ator anexo) — inclui alunoNome e turma
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

    // WhatsApp (mantido)
    if (alunoRelacionado.telefone) {
      const mensagem = `Olá, responsável pelo aluno ${alunoRelacionado.nome}.
      
Foi registrada uma ${payload.natureza === 'elogio' ? 'menção de elogio' : 'notificação disciplinar'}:
🔸 Motivo: ${payload.motivo}
🔸 Medida: ${payload.tipoMedida}

Nota atual de comportamento: ${(alunoAtualizado?.comportamento ?? notaNoDia).toFixed(2)}.`;
      try { await enviarWhatsapp(alunoRelacionado.telefone, mensagem); } catch {}
    }

    res.status(201).json(novaNotificacao);
  } catch (err) {
    console.error('Erro ao criar notificação:', err);
    res.status(500).json({ error: 'Erro ao criar notificação: ' + err.message });
  }
});

// ------------------------------------------------------
// PUT "/:id" (atualizar notificação)
// ------------------------------------------------------
router.put('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notif = await Notificacao.findOne({
      _id: req.params.id,
      instituicao
    });
    if (!notif) return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });

    const camposEditaveis = [
      'aluno','tipo','motivo','tipoMedida','valorNumerico','observacao','data',
      'quantidadeDias','comentarioMonitor','status','natureza','tipoElogio',
      'artigo','paragrafo','inciso','classificacaoRegulamento'
    ];

    // snapshot "antes" para o LOG
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

    // atualizar campos
    for (const campo of camposEditaveis) {
      if (req.body[campo] !== undefined) {
        if (campo === 'data' && typeof req.body[campo] === 'string') {
          notif[campo] = parseDateOnlyLocal(req.body[campo]);
        } else {
          notif[campo] = req.body[campo];
        }
      }
    }

    // ajustes automáticos
    if (req.body.natureza === 'elogio' && req.body.valorNumerico === undefined && req.body.tipoElogio) {
      notif.valorNumerico = MAPA_ELOGIOS[req.body.tipoElogio] ?? notif.valorNumerico;
      notif.tipo = 'Elogio';
      notif.tipoMedida = 'Elogio';
      notif.artigo = notif.paragrafo = notif.inciso = notif.classificacaoRegulamento = null;
    }
    if (req.body.natureza === 'indisciplina' && req.body.valorNumerico === undefined && req.body.tipoMedida) {
      const base = MAPA_NEGATIVOS[req.body.tipoMedida] ?? 0;
      const dias = ['A.E.C.D.E','A.I.A'].includes(req.body.tipoMedida) ? Math.max(1, parseInt(req.body.quantidadeDias || 1, 10)) : 1;
      notif.valorNumerico = Number((base * dias).toFixed(2));
      notif.tipo = req.body.tipoMedida;
    }

    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, instituicao);

    // 🔎 LOG
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

    // Recalcular nota atual
    await recomputarNotaAlunoAteAgora(notif.aluno, instituicao);

    res.json({ message: 'Notificação atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);
    res.status(500).json({ message: 'Erro ao atualizar notificação.' });
  }
});

// ------------------------------------------------------
// PUT "/:id/reenviar" (voltar para pendente)
// ------------------------------------------------------
router.put('/:id/reenviar', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao
    });

    if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notificacao.aluno, instituicao);

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

    await recomputarNotaAlunoAteAgora(notificacao.aluno, instituicao);

    res.json({ message: 'Notificação reenviada com sucesso.' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ message: 'Erro ao reenviar notificação.' });
  }
});

// ------------------------------------------------------
// POST "/:id/entregar"
// ------------------------------------------------------
router.post('/:id/entregar', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notif = await Notificacao.findOne({ _id: req.params.id, instituicao });
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
    notif.alertaAtivo = false; // só ativa quando passar do prazo sem devolução
    await notif.save();

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, instituicao);

    // log
    await logAction({
      req,
      acao: 'NOTIFICACAO_ENTREGUE',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        entregueEm: agora,
        prazoDevolucao: prazo
      }
    });

    res.json({ message: 'Marcada como ENTREGUE.', prazoDevolucao: notif.prazoDevolucao, entregueEm: notif.entregueEm });
  } catch (err) {
    console.error('Erro ao marcar ENTREGUE:', err);
    res.status(500).json({ error: 'Erro ao marcar ENTREGUE.' });
  }
});

// ------------------------------------------------------
// POST "/:id/devolver"
// ------------------------------------------------------
router.post('/:id/devolver', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notif = await Notificacao.findOne({ _id: req.params.id, instituicao });
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

    const { alunoNome, alunoTurma } = await getAlunoInfo(notif.aluno, instituicao);

    // log
    await logAction({
      req,
      acao: 'NOTIFICACAO_DEVOLVIDA',
      entidade: 'Notificacao',
      entidadeId: notif._id,
      extra: {
        alunoId: String(notif.aluno),
        alunoNome, alunoTurma,
        tipo: notif.tipo,
        tipoMedida: notif.tipoMedida,
        numeroSequencial: notif.numeroSequencial,
        devolvidaEm: agora
      }
    });

    res.json({ message: 'Marcada como DEVOLVIDA.', devolvidaEm: notif.devolvidaEm });
  } catch (err) {
    console.error('Erro ao marcar DEVOLVIDA:', err);
    res.status(500).json({ error: 'Erro ao marcar DEVOLVIDA.' });
  }
});

// ------------------------------------------------------
// DELETE "/:id"
// ------------------------------------------------------
router.delete('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const instituicao = req.usuario.instituicao;
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao
    });
    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });
    }

    const { alunoNome, alunoTurma } = await getAlunoInfo(notificacao.aluno, instituicao);

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

    await recomputarNotaAlunoAteAgora(alunoId, instituicao);

    res.json({ message: 'Notificação excluída e nota recalculada com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    res.status(500).json({ message: 'Erro ao excluir notificação.' });
  }
});

module.exports = router;
