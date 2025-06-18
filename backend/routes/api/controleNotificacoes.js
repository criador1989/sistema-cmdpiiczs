const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const autenticar = require('../../middleware/autenticacao');

// 🔹 GET - Listar notificações por data (ou todas pendentes)
router.get('/', autenticar, async (req, res) => {
  try {
    const { data } = req.query;
    const filtro = {
      instituicao: req.usuario.instituicao,
      status: 'pendente'
    };

    if (data) {
      const inicio = new Date(data);
      const fim = new Date(data);
      fim.setHours(23, 59, 59, 999);
      filtro.createdAt = { $gte: inicio, $lte: fim };
    }

    const notificacoes = await Notificacao.find(filtro)
      .populate('aluno')
      .select('-__v');

    res.json(notificacoes);
  } catch (err) {
    console.error('Erro ao buscar notificações para controle:', err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// 🔹 PUT - Deferir notificação
router.put('/:id/deferir', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      {
        status: 'deferido',
        avaliador: req.usuario._id,
        comentarioMonitor: ''
      },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao deferir notificação' });
  }
});

// 🔹 PUT - Solicitar revisão
router.put('/:id/revisar', autenticar, async (req, res) => {
  try {
    const { comentario } = req.body;

    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      {
        status: 'revisao_solicitada',
        avaliador: req.usuario._id,
        comentarioMonitor: comentario
      },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao solicitar revisão' });
  }
});

// 🔹 PUT - Arquivar notificação
router.put('/:id/arquivar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findByIdAndUpdate(
      req.params.id,
      {
        status: 'arquivado',
        avaliador: req.usuario._id
      },
      { new: true }
    );
    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao arquivar notificação' });
  }
});

// 🔹 PUT - Reenviar notificação (voltar ao status pendente)
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!notificacao) {
      return res.status(404).json({ erro: 'Notificação não encontrada.' });
    }

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ mensagem: 'Notificação reenviada com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ erro: 'Erro ao reenviar notificação' });
  }
});

// 🔹 DELETE - Excluir notificação
router.delete('/:id', autenticar, async (req, res) => {
  try {
    await Notificacao.findByIdAndDelete(req.params.id);
    res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir notificação' });
  }
});

module.exports = router;
