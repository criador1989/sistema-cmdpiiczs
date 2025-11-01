// backend/routes/api/controleNotificacoes.js
const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

/* ============================================================
   🔹 (NOVO) Mensageria opcional (lazy require, não quebra se não existir)
   ============================================================ */
let mensageria = null;
try {
  mensageria = require('../../services/mensageria'); // enviarEmail, enviarTelegram, linkWhatsApp
  console.log('[CTRL-NOTIF] mensageria carregada.');
} catch (_) {
  console.log('[CTRL-NOTIF] mensageria NÃO encontrada (ok por enquanto).');
}

/* ============================================================
   🔹 UTILITÁRIOS
   ============================================================ */

// Monta filtro base por instituição (inclui sem instituicao p/ compatibilidade)
function filtroInstituicaoDoUsuario(usuario) {
  const inst = (usuario && usuario.instituicao) ? String(usuario.instituicao) : null;
  if (!inst)
    return { $or: [{ instituicao: { $exists: false } }, { instituicao: { $eq: null } }] };
  return {
    $or: [
      { instituicao: inst },
      { instituicao: { $exists: false } },
      { instituicao: { $eq: null } },
    ],
  };
}

/* Pequenos helpers para texto/assunto (funcionam mesmo sem templates avançados) */
function assuntoDeferido(aluno, notif) {
  const nome = aluno?.nome || 'Aluno';
  return `Notificação deferida | ${nome}`;
}
function htmlDeferido(aluno, notif) {
  const nome = aluno?.nome || '';
  const turma = aluno?.turma || '';
  const tipo  = notif?.tipo || notif?.tipoMedida || '—';
  const motivo= notif?.motivo || '—';
  const num   = notif?.numeroSequencial || '—';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">
      <p>Prezada família do(a) aluno(a) <strong>${nome}</strong> (${turma}),</p>
      <p>Informamos que foi <strong>deferida</strong> uma notificação disciplinar referente ao(a) estudante.</p>
      <p><strong>Resumo:</strong></p>
      <ul>
        <li><b>Tipo/Medida:</b> ${tipo}</li>
        <li><b>Motivo:</b> ${motivo}</li>
        <li><b>Nº Sequencial:</b> ${num}</li>
      </ul>
      <p>Estamos à disposição para esclarecimentos.</p>
      <p>Atenciosamente,<br/>Coordenação — Colégio Militar Dom Pedro II/CZS</p>
    </div>
  `;
}
function textoCurtoDeferido(aluno, notif) {
  const nome = aluno?.nome || '';
  const turma = aluno?.turma || '';
  const tipo  = notif?.tipo || notif?.tipoMedida || '—';
  const num   = notif?.numeroSequencial || '—';
  return [
    `COMUNICADO — Notificação deferida`,
    `Aluno(a): ${nome} (${turma})`,
    `Tipo/Medida: ${tipo}`,
    `Nº: ${num}`,
    `Estamos à disposição. — CMDPII/CZS`
  ].join('\n');
}

/* ============================================================
   🔹 GET - Listar notificações para controle (pendentes + revisões)
   ============================================================ */
router.get('/', autenticar, async (req, res) => {
  try {
    // paginação
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const skip = (page - 1) * limit;

    // filtros
    const { q, data } = req.query;
    // status: pode vir "status=pendente" ou "status=pendente,revisao_solicitada"
    const rawStatus = (req.query.status || '').trim();
    const statuses = rawStatus
      ? rawStatus.split(',').map((s) => s.trim()).filter(Boolean)
      : ['pendente', 'revisao_solicitada'];

    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      status: { $in: statuses },
    };

    // filtro de data
    if (data) {
      const inicio = new Date(data);
      const fim = new Date(data);
      if (!isNaN(inicio.getTime())) {
        fim.setHours(23, 59, 59, 999);
        filtro.createdAt = { $gte: inicio, $lte: fim };
      }
    }

    // busca textual
    const textRegex = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // consulta principal
    const baseQuery = Notificacao.find(filtro)
      .populate('aluno', 'nome turma')
      .sort({ createdAt: -1, _id: -1 });

    const countQuery = Notificacao.countDocuments(filtro);

    let [total, docs] = await Promise.all([countQuery, baseQuery.skip(skip).limit(limit)]);

    // filtrar se houver q
    if (textRegex) {
      docs = docs.filter((n) => {
        const aluno = n.aluno || {};
        return (
          textRegex.test(n.motivo || '') ||
          textRegex.test(n.tipo || '') ||
          textRegex.test(n.tipoMedida || '') ||
          textRegex.test(n.numeroSequencial || '') ||
          textRegex.test(aluno.nome || '') ||
          textRegex.test(aluno.turma || '')
        );
      });

      // refaz count para busca textual
      const todosParaCount = await Notificacao.find(filtro)
        .populate('aluno', 'nome turma')
        .select('motivo tipo tipoMedida numeroSequencial aluno');
      total = todosParaCount.filter((n) => {
        const aluno = n.aluno || {};
        return (
          textRegex.test(n.motivo || '') ||
          textRegex.test(n.tipo || '') ||
          textRegex.test(n.tipoMedida || '') ||
          textRegex.test(n.numeroSequencial || '') ||
          textRegex.test(aluno.nome || '') ||
          textRegex.test(aluno.turma || '')
        );
      }).length;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ data: docs, page, limit, total, totalPages });
  } catch (err) {
    console.error('Erro ao buscar notificações para controle:', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

/* ============================================================
   🔹 PUT - Deferir notificação (AGORA COM LOGS E DISPARO DE COMUNICAÇÃO)
   ============================================================ */
router.put('/:id/deferir', autenticar, async (req, res) => {
  try {
    console.log('[CTRL-NOTIF] deferir chamado para id =', req.params.id);

    // Atualiza para 'deferido' e já traz dados do aluno
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      { status: 'deferido', avaliador: req.usuario._id, comentarioMonitor: '' },
      { new: true }
    ).populate('aluno', 'nome turma contatos');

    if (!notificacao) {
      console.log('[CTRL-NOTIF] não encontrado:', req.params.id);
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    console.log('[CTRL-NOTIF] deferido OK. Aluno:', notificacao.aluno?.nome || '(sem aluno)');
    console.log('[CTRL-NOTIF] mensageria disponível?', !!mensageria);

    // Disparo de comunicação
    let comunicacao = { tentou: false, resultados: {} };
    try {
      const aluno = notificacao.aluno || {};
      if (mensageria && aluno) {
        comunicacao.tentou = true;

        const assunto = assuntoDeferido(aluno, notificacao);
        const html    = htmlDeferido(aluno, notificacao);
        const texto   = textoCurtoDeferido(aluno, notificacao);

        // E-mail
        if (aluno?.contatos?.emailResponsavel) {
          try {
            comunicacao.resultados.email = await mensageria.enviarEmail(
              aluno, 'Deferido', html, aluno.contatos.emailResponsavel, assunto
            );
          } catch (e) {
            comunicacao.resultados.email = { ok:false, erro:e.message };
          }
        } else {
          comunicacao.resultados.email = { ok:false, motivo:'sem emailResponsavel' };
        }

        // Telegram
        if (aluno?.contatos?.telegramChatId) {
          try {
            comunicacao.resultados.telegram = await mensageria.enviarTelegram(
              aluno, 'Deferido', aluno.contatos.telegramChatId, texto
            );
          } catch (e) {
            comunicacao.resultados.telegram = { ok:false, erro:e.message };
          }
        } else {
          comunicacao.resultados.telegram = { ok:false, motivo:'sem telegramChatId' };
        }

        // WhatsApp link
        if (aluno?.contatos?.telefoneResponsavel) {
          try {
            const tel = String(aluno.contatos.telefoneResponsavel || '').replace(/\D/g,'');
            comunicacao.resultados.whatsappLink = mensageria.linkWhatsApp(aluno, 'Deferido', tel, texto);
          } catch (e) {
            comunicacao.resultados.whatsappLink = null;
          }
        } else {
          comunicacao.resultados.whatsappLink = null;
        }
      }
    } catch (e) {
      comunicacao.erro = e.message;
      console.warn('[CTRL-NOTIF] Falha ao enviar comunicação:', e);
    }

    console.log('[CTRL-NOTIF] comunicacao:', comunicacao);
    res.json({ ...notificacao.toObject?.() || notificacao, comunicacao });
  } catch (err) {
    console.error('Erro ao deferir notificação:', err);
    res.status(500).json({ erro: 'Erro ao deferir notificação' });
  }
});

/* ============================================================
   🔹 PUT - Solicitar revisão
   ============================================================ */
router.put('/:id/revisar', autenticar, async (req, res) => {
  try {
    const { comentario } = req.body;
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      {
        status: 'revisao_solicitada',
        avaliador: req.usuario._id,
        comentarioMonitor: comentario || '',
      },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao solicitar revisão' });
  }
});

/* ============================================================
   🔹 PUT - Arquivar notificação
   ============================================================ */
router.put('/:id/arquivar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      { status: 'arquivado', avaliador: req.usuario._id },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao arquivar notificação' });
  }
});

/* ============================================================
   🔹 PUT - Reenviar notificação (voltar ao status pendente)
   ============================================================ */
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...filtroInstituicaoDoUsuario(req.usuario),
    });
    if (!notificacao)
      return res.status(404).json({ erro: 'Notificação não encontrada.' });

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ mensagem: 'Notificação reenviada com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ erro: 'Erro ao reenviar notificação' });
  }
});

/* ============================================================
   🔹 DELETE - Excluir notificação
   ============================================================ */
router.delete('/:id', autenticar, async (req, res) => {
  try {
    await Notificacao.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir notificação' });
  }
});

/* ============================================================
   🔹 NOVAS ROTAS PARA O PAINEL E RELATÓRIOS
   ============================================================ */

// Contador rápido de notificações em controle (painel principal)
router.get('/contador/painel', autenticar, async (req, res) => {
  try {
    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      status: { $in: ['pendente', 'revisao_solicitada'] },
    };
    const total = await Notificacao.countDocuments(filtro);
    res.json({ total });
  } catch (err) {
    console.error('Erro ao contar notificações pendentes (painel):', err);
    res.status(500).json({ erro: 'Erro interno ao contar notificações' });
  }
});

// Dados resumidos p/ gráficos (últimos 30 dias)
router.get('/estatisticas', autenticar, async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      createdAt: { $gte: inicio, $lte: hoje },
    };

    const porStatus = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porNatureza = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$natureza', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porDia = await Notificacao.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.dia': 1 } },
    ]);

    res.json({
      intervalo: { inicio, fim: hoje },
      porStatus,
      porNatureza,
      porDia,
    });
  } catch (err) {
    console.error('Erro ao gerar estatísticas do controle:', err);
    res.status(500).json({ erro: 'Erro interno ao gerar estatísticas' });
  }
});

module.exports = router;
