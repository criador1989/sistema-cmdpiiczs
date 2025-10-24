// routes/api/alunos-alertas.js
const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Log = require('../../models/Log');

const { autenticar } = require('../../middleware/autenticacao');
const { classificarComportamento } = require('../../utils/comportamento');

// GET /api/alertas/comportamento
// Lista grupos p/ painel: REGULAR -> NP ; INSUFICIENTE -> informar responsáveis
router.get('/comportamento', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find(
      { comportamento: { $ne: null } },
      { nome: 1, turma: 1, comportamento: 1 }
    ).lean();

    const regular = [];
    const insuficiente = [];

    for (const a of alunos) {
      const { faixa } = classificarComportamento(Number(a.comportamento));
      if (faixa === 'regular') {
        regular.push({
          _id: a._id,
          nome: a.nome,
          turma: a.turma,
          nota: Number(a.comportamento),
          acao: 'Encaminhar ao NP e registrar no histórico'
        });
      }
      if (faixa === 'insuficiente') {
        insuficiente.push({
          _id: a._id,
          nome: a.nome,
          turma: a.turma,
          nota: Number(a.comportamento),
          acao: 'Informar responsáveis sobre possível não renovação'
        });
      }
    }

    res.json({ regular, insuficiente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao carregar alertas de comportamento' });
  }
});

// POST /api/alertas/comportamento/:alunoId/atualizar
// Body aceito: { comportamento: Number }  (ou notaComportamento, compatibilidade)
router.post('/comportamento/:alunoId/atualizar', autenticar, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const valorBody = req.body?.comportamento ?? req.body?.notaComportamento;
    const novaNota = Number(valorBody);

    if (Number.isNaN(novaNota)) {
      return res.status(400).json({ error: 'Informe o campo "comportamento" (Number).' });
    }

    const aluno = await Aluno.findById(alunoId);
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado' });

    // grava SEM alterar o schema: usamos o campo existente "comportamento"
    aluno.comportamento = novaNota;

    const { faixa, codigo } = classificarComportamento(aluno.comportamento);
    // se quiser manter um rastro textual, adiciona este campo (não é obrigatório no seu schema):
    aluno.ultimaClassificacaoComportamental = codigo; // ok se o schema já tiver; se não tiver, o Mongoose ignora

    // histórico disciplinar — só se existir no schema; se não existir, este bloco não quebra nada
    aluno.historicoDisciplinar = aluno.historicoDisciplinar || [];
    const agora = new Date();

    // anti-duplicação mensal (opcional)
    const dupGuard = async (tipo) => {
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      return await Notificacao.findOne({
        aluno: aluno._id,
        tipo,
        createdAt: { $gte: inicioMes }
      });
    };

    let notificacaoCriada = null;

    if (faixa === 'regular') {
      // Art. 51
      aluno.historicoDisciplinar.push({
        data: agora,
        tipo: 'Encaminhamento NP',
        descricao: 'Encaminhado ao Núcleo Psicossocial por ingresso no Comportamento REGULAR (5,00–6,99).'
      });

      if (!(await dupGuard('encaminhamento_np'))) {
        notificacaoCriada = await Notificacao.create({
          tipo: 'encaminhamento_np',
          titulo: 'Encaminhamento ao Núcleo Psicossocial',
          mensagem: `O(a) aluno(a) ${aluno.nome} ingressou no Comportamento REGULAR (nota ${aluno.comportamento.toFixed(2)}). Encaminhar ao NP e informar responsáveis (Art. 51).`,
          aluno: aluno._id,
          prioridade: 'alta',
          publicoAlvo: ['NP', 'COORD_CORPO_DE_ALUNOS'],
          meta: { artigo: 51, faixa: 'REGULAR' }
        });
      }

      if (!(await dupGuard('tarefa_np_informar_responsaveis'))) {
        await Notificacao.create({
          tipo: 'tarefa_np_informar_responsaveis',
          titulo: 'NP deve informar responsáveis',
          mensagem: `Informar pais/responsáveis sobre ingresso no Comportamento REGULAR e consequências da continuidade (aluno: ${aluno.nome}).`,
          aluno: aluno._id,
          prioridade: 'media',
          publicoAlvo: ['NP'],
          meta: { artigo: '51-par-unico', faixa: 'REGULAR' }
        });
      }

    } else if (faixa === 'insuficiente') {
      // Art. 52
      aluno.historicoDisciplinar.push({
        data: agora,
        tipo: 'Comunicação aos responsáveis',
        descricao: 'Informados sobre Comportamento INSUFICIENTE (3,00–4,99) e possível não renovação se evoluir para incompatível.'
      });

      if (!(await dupGuard('informar_responsaveis_insuficiente'))) {
        notificacaoCriada = await Notificacao.create({
          tipo: 'informar_responsaveis_insuficiente',
          titulo: 'Comunicar responsáveis — Comportamento INSUFICIENTE',
          mensagem: `O(a) aluno(a) ${aluno.nome} ingressou no Comportamento INSUFICIENTE (nota ${aluno.comportamento.toFixed(2)}). Informar responsáveis (Art. 52).`,
          aluno: aluno._id,
          prioridade: 'alta',
          publicoAlvo: ['COORD_CORPO_DE_ALUNOS'],
          meta: { artigo: 52, faixa: 'INSUFICIENTE' }
        });
      }
    }

    await aluno.save();

    try {
      await Log.create({
        acao: 'ATUALIZAR_COMPORTAMENTO',
        usuario: req.usuario?._id,
        detalhes: {
          aluno: aluno._id,
          nota: aluno.comportamento,
          classificacao: codigo,
          notificacao: notificacaoCriada?._id || null
        }
      });
    } catch {}

    res.json({
      ok: true,
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        comportamento: aluno.comportamento,
        classificacao: codigo
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao atualizar comportamento' });
  }
});

module.exports = router;
