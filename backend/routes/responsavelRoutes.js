const express = require('express');
const router = express.Router();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');

// GET /api/responsavel/:codigo - Buscar notificações pelo código de acesso do aluno
router.get('/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.trim();

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });

    if (!aluno) {
      return res.status(404).json({ mensagem: 'Aluno não encontrado com esse código.' });
    }

    // Notificações restritas à mesma instituição do aluno, com campos limitados
    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao: aluno.instituicao
    })
      .select('motivo tipo tipoMedida observacao data') // 👈 apenas campos públicos
      .sort({ data: -1 });

    res.json({
      aluno: {
        nome: aluno.nome,
        turma: aluno.turma
      },
      notificacoes
    });
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao buscar notificações.', erro: error.message });
  }
});

module.exports = router;
