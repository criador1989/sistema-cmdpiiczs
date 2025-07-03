const express = require('express');
const router = express.Router();

const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const calcularNotaTSMD = require('../../utils/calculoNota');
const enviarWhatsapp = require('../../utils/twilio');
const autenticar = require('../../middleware/autenticacao');
const { obterDadosDoRegulamento } = require('../../utils/regulamento');

// GET fixo precisa vir antes do dinâmico
router.get('/novas', autenticar, async (req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

// GET paginado
router.get('/', autenticar, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const filtro = { instituicao: req.usuario.instituicao };

    const total = await Notificacao.countDocuments(filtro);
    const notificacoes = await Notificacao.find(filtro)
      .sort({ data: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate({
        path: 'aluno',
        match: { instituicao: req.usuario.instituicao }
      });

    const notificacoesComAluno = notificacoes.filter(n => n.aluno);

    res.json({
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: notificacoesComAluno
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

// GET /api/notificacoes/:id
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
    res.status(500).json({ message: 'Erro ao carregar notificação.' });
  }
});

// POST /api/notificacoes
router.post('/', autenticar, async (req, res) => {
  const {
    aluno,
    motivo,
    tipo,
    tipoMedida,
    observacao,
    data,
    quantidadeDias,
    valorNumerico
  } = req.body;

  try {
    const valores = {
      'Advertência Escrita': -0.30,
      'Repreensão': -0.50,
      'A.E.C.D.E': -0.70,
      'A.I.A': -1.20,
      'Elogio Verbal': +0.15,
      'Elogio Individual': +0.60,
      'Elogio Coletivo': +0.20,
      'Média ≥ 8,5': +0.40
    };

    let valor = valorNumerico;
    const dias = parseInt(quantidadeDias || 1);

    if ((tipoMedida === 'A.E.C.D.E' || tipoMedida === 'A.I.A') && dias > 1) {
      const base = valores[tipoMedida] || 0;
      valor = parseFloat((base * dias).toFixed(2));
    } else if (valores[tipoMedida] !== undefined) {
      valor = valores[tipoMedida];
    }

    const alunoRelacionado = await Aluno.findOne({
      _id: aluno,
      instituicao: req.usuario.instituicao
    });

    if (!alunoRelacionado) {
      return res.status(404).json({ error: 'Aluno não encontrado ou pertence a outra instituição' });
    }

    const notificacoesAnteriores = await Notificacao.find({
      aluno,
      instituicao: req.usuario.instituicao,
      data: { $lt: new Date(data) }
    }).sort({ data: -1 });

    let notaAnterior = 8.0;
    if (notificacoesAnteriores.length > 0) {
      notaAnterior = notificacoesAnteriores[0].notaAtual;
    } else {
      notaAnterior = calcularNotaTSMD(alunoRelacionado.dataEntrada, new Date(data), []);
    }

    const notaAtual = Math.max(0, Math.min(10, parseFloat((notaAnterior + valor).toFixed(2))));
    alunoRelacionado.comportamento = notaAtual;
    await alunoRelacionado.save();

    const dadosRegulamento = obterDadosDoRegulamento(motivo);
    const anoAtual = new Date(data).getFullYear();

    let novaNotificacao;
    let tentativa = 0;
    let numeroSequencial;

    while (true) {
      tentativa++;

      const ultima = await Notificacao.findOne({
        instituicao: req.usuario.instituicao,
        data: {
          $gte: new Date(`${anoAtual}-01-01T00:00:00.000Z`),
          $lte: new Date(`${anoAtual}-12-31T23:59:59.999Z`)
        }
      }).sort({ numeroSequencial: -1 });

      const proximoNumero = ultima
        ? parseInt(ultima.numeroSequencial.split('/')[0]) + tentativa
        : tentativa;

      numeroSequencial = `${String(proximoNumero).padStart(2, '0')}/${anoAtual}`;

      try {
        novaNotificacao = new Notificacao({
          aluno,
          motivo,
          tipo,
          tipoMedida,
          valorNumerico: valor,
          quantidadeDias: dias,
          observacao,
          data: new Date(data),
          notaAnterior,
          notaAtual,
          artigo: dadosRegulamento.artigo,
          paragrafo: dadosRegulamento.paragrafo,
          inciso: dadosRegulamento.inciso,
          classificacaoRegulamento: dadosRegulamento.classificacao,
          instituicao: req.usuario.instituicao,
          numeroSequencial,
          status: 'pendente'
        });

        await novaNotificacao.save();
        break;
      } catch (err) {
        if (err.code === 11000 && tentativa < 10) {
          continue;
        } else {
          console.error('Erro ao salvar notificação:', err);
          return res.status(500).json({ error: 'Erro ao salvar notificação.' });
        }
      }
    }

    if (alunoRelacionado.telefone) {
      const mensagem = `Olá, responsável pelo aluno ${alunoRelacionado.nome}.
      
Foi registrada uma notificação disciplinar:
🔸 Motivo: ${motivo}
🔸 Medida: ${tipoMedida}

Nota atual de comportamento: ${notaAtual.toFixed(2)}.`;

      await enviarWhatsapp(alunoRelacionado.telefone, mensagem);
    }

    res.status(201).json(novaNotificacao);
  } catch (err) {
    console.error('Erro ao criar notificação:', err);
    res.status(500).json({ error: 'Erro ao criar notificação: ' + err.message });
  }
});

// PUT /api/notificacoes/:id
router.put('/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada ou não pertence à instituição.' });
    }

    const camposEditaveis = [
      'aluno', 'tipo', 'motivo', 'tipoMedida', 'valorNumerico',
      'observacao', 'data', 'quantidadeDias', 'comentarioMonitor'
    ];

    for (const campo of camposEditaveis) {
      if (req.body[campo] !== undefined) {
        notificacao[campo] = req.body[campo];
      }
    }

    await notificacao.save();
    res.json({ message: 'Notificação atualizada com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);
    res.status(500).json({ message: 'Erro ao atualizar notificação.' });
  }
});

// PUT /api/notificacoes/:id/reenviar
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!notificacao) {
      return res.status(404).json({ message: 'Notificação não encontrada.' });
    }

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ message: 'Notificação reenviada com sucesso.' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ message: 'Erro ao reenviar notificação.' });
  }
});

// DELETE /api/notificacoes/:id
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

    const aluno = await Aluno.findOne({
      _id: alunoId,
      instituicao: req.usuario.instituicao
    });

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
