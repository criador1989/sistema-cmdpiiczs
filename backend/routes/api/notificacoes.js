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

// ------------------------------------------------------
// GET "/novas" (fixo / placeholder)
// ------------------------------------------------------
router.get('/novas', autenticar, async (req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

// ------------------------------------------------------
// GET "/"  (paginado + filtros leves: ?page=&limit=&q=&turma=)
// - Retorna payload enxuto para listagem. Detalhes via GET /:id
// ------------------------------------------------------
router.get('/', autenticar, async (req, res) => {
  try {
    // paginação
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.max(parseInt(req.query.limit || '10', 10), 1);

    // filtros
    const instituicao = req.usuario.instituicao;
    const q = (req.query.q || '').trim();
    const turma = (req.query.turma || '').trim();

    // filtro base
    const filtroBase = { instituicao };

    // se veio q/turma, procure alunos primeiro e restrinja por aluno
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
      // campos enxutos para a listagem (detalhes via GET /:id)
      .select('aluno tipo tipoMedida data status valorNumerico notaAnterior notaAtual comentarioMonitor numeroSequencial')
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
// GET "/:id"  (detalhes)
// ------------------------------------------------------
router.get('/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada' });
    }

    res.json(notificacao);
  } catch (err) {
    console.error('Erro ao carregar notificação:', err);
    res.status(500).json({ message: 'Erro ao carregar notificação.' });
  }
});

// ------------------------------------------------------
// POST "/"  (criar notificação)
// ------------------------------------------------------
router.post('/', autenticar, async (req, res) => {
  const {
    aluno,
    motivo,
    tipo,              // compat: pode vir do front antigo
    tipoMedida,        // compat: p/ indisciplina
    observacao,
    data,
    quantidadeDias,
    valorNumerico,     // compat: permite enviar explícito
    // NOVOS:
    natureza = 'indisciplina', // 'indisciplina' | 'elogio'
    tipoElogio         // ex.: 'elogioVerbal'
  } = req.body;

  try {
    const alunoRelacionado = await Aluno.findOne({
      _id: aluno,
      instituicao: req.usuario.instituicao
    });

    if (!alunoRelacionado) {
      return res.status(404).json({ error: 'Aluno não encontrado ou pertence a outra instituição' });
    }

    // Data desta notificação
    const dt = data ? new Date(data) : new Date();

    // Valor numérico e rótulos conforme natureza
    let valor = 0;
    let payload = {
      aluno,
      instituicao: req.usuario.instituicao,
      observacao: observacao || null,
      data: dt,
      natureza
    };

    if (natureza === 'elogio') {
      // ----- ELOGIO (positivo) -----
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
        artigo: null,
        paragrafo: null,
        inciso: null,
        classificacaoRegulamento: null,
        quantidadeDias: null
      };
    } else {
      // ----- INDISCIPLINA (negativo) -----
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

    // ===========================
    //   CÁLCULO DA NOTA (preciso)
    // ===========================
    const dayStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
    const dayEnd   = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0, 0);

    // (A) Nota até o dia anterior
    const endOntem = new Date(dayStart.getTime() - 1);
    const notificacoesAntes = await Notificacao.find({
      aluno,
      instituicao: req.usuario.instituicao,
      data: { $lt: dayStart }
    }).select('data valorNumerico createdAt').sort({ data: 1, createdAt: 1 });

    const notaAnterior = calcularNotaTSMD(alunoRelacionado.dataEntrada, endOntem, notificacoesAntes);

    // (B) Nota até o fim do dia atual + esta nova
    const endHoje = new Date(dayEnd.getTime() - 1);
    const notificacoesAteHoje = await Notificacao.find({
      aluno,
      instituicao: req.usuario.instituicao,
      data: { $lt: dayEnd }
    }).select('data valorNumerico createdAt').sort({ data: 1, createdAt: 1 });

    const paraCalculoDia = [
      ...notificacoesAteHoje.map(n => ({
        data: n.data, createdAt: n.createdAt, valorNumerico: n.valorNumerico
      })),
      { data: dt, createdAt: dt, valorNumerico: Number(valor || 0) }
    ];

    let notaAtual = calcularNotaTSMD(alunoRelacionado.dataEntrada, endHoje, paraCalculoDia);

    // Atualiza o aluno
    alunoRelacionado.comportamento = notaAtual;
    await alunoRelacionado.save();

    // numeração sequencial por ano
    const anoAtual = dt.getFullYear();
    const notificacoesAno = await Notificacao.find({
      numeroSequencial: { $regex: `/${anoAtual}$` },
      instituicao: req.usuario.instituicao
    });

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
      notaAtual,
      numeroSequencial,
      status: 'pendente'
    });

    await novaNotificacao.save();

    // WhatsApp (mantido)
    if (alunoRelacionado.telefone) {
      const mensagem = `Olá, responsável pelo aluno ${alunoRelacionado.nome}.
      
Foi registrada uma ${payload.natureza === 'elogio' ? 'menção de elogio' : 'notificação disciplinar'}:
🔸 Motivo: ${payload.motivo}
🔸 Medida: ${payload.tipoMedida}

Nota atual de comportamento: ${notaAtual.toFixed(2)}.`;
      await enviarWhatsapp(alunoRelacionado.telefone, mensagem);
    }

    res.status(201).json(novaNotificacao);
  } catch (err) {
    console.error('Erro ao criar notificação:', err);
    res.status(500).json({ error: 'Erro ao criar notificação: ' + err.message });
  }
});

// ------------------------------------------------------
// PUT "/:id"  (atualizar notificação)
// ------------------------------------------------------
router.put('/:id', autenticar, async (req, res) => {
  try {
    const notif = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!notif) {
      return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });
    }

    const camposEditaveis = [
      'aluno','tipo','motivo','tipoMedida','valorNumerico','observacao','data',
      'quantidadeDias','comentarioMonitor','status','natureza','tipoElogio',
      'artigo','paragrafo','inciso','classificacaoRegulamento'
    ];

    for (const campo of camposEditaveis) {
      if (req.body[campo] !== undefined) notif[campo] = req.body[campo];
    }

    // ajustes quando mudar natureza/medida sem valor explícito
    if (req.body.natureza === 'elogio' && req.body.valorNumerico === undefined && req.body.tipoElogio) {
      notif.valorNumerico = MAPA_ELOGIOS[req.body.tipoElogio] ?? notif.valorNumerico;
      notif.tipo = 'Elogio';
      notif.tipoMedida = 'Elogio';
      notif.artigo = notif.paragrafo = notif.inciso = notif.classificacaoRegulamento = null;
    }
    if (req.body.natureza === 'indisciplina' && req.body.valorNumerico === undefined && req.body.tipoMedida) {
      const base = MAPA_NEGATIVOS[req.body.tipoMedida] ?? 0;
      const dias = ['A.E.C.D.E','A.I.A'].includes(req.body.tipoMedida) ? Math.max(1, parseInt(req.body.quantidadeDias || 1, 10)) : 1;
      notif.valorNumerico = base * dias;
      notif.tipo = req.body.tipoMedida;
    }

    await notif.save();
    res.json({ message: 'Notificação atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);
    res.status(500).json({ message: 'Erro ao atualizar notificação.' });
  }
});

// ------------------------------------------------------
// PUT "/:id/reenviar"  (voltar para pendente)
// ------------------------------------------------------
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!notificacao) return res.status(404).json({ message: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ message: 'Notificação reenviada com sucesso.' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ message: 'Erro ao reenviar notificação.' });
  }
});

// ------------------------------------------------------
// DELETE "/:id"
// ------------------------------------------------------
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });
    }

    const alunoId = notificacao.aluno;
    await notificacao.deleteOne();

    const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.usuario.instituicao });

    const notificacoesRestantes = await Notificacao.find({
      aluno: alunoId,
      instituicao: req.usuario.instituicao
    }).sort({ data: 1 });

    const notaFinal = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoesRestantes);
    aluno.comportamento = parseFloat(notaFinal.toFixed(2));
    await aluno.save();

    res.json({ message: 'Notificação excluída e nota recalculada com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir notificação:', err);
    res.status(500).json({ message: 'Erro ao excluir notificação.' });
  }
});

module.exports = router;
