const express = require('express');
const router = express.Router();
const Instituicao = require('../../models/Instituicao');

router.get('/corrigir-cmdpii-czs', async (req, res) => {
  try {

    const inst = await Instituicao.findOne({
      nome: { $regex: /^CMDPII-CZS$/i }
    });

    if (!inst) {
      return res.status(404).json({
        mensagem: 'Instituição CMDPII-CZS não encontrada.'
      });
    }

    inst.slug = 'cmdpii';
    inst.sigla = 'CMDPII-CZS';
    inst.ativo = true;

    await inst.save();

    return res.json({
      mensagem: 'Instituição corrigida com sucesso.',
      instituicao: {
        id: String(inst._id),
        nome: inst.nome,
        sigla: inst.sigla,
        slug: inst.slug,
        ativo: inst.ativo
      }
    });

  } catch (error) {
    console.error('Erro ao corrigir instituição legada:', error);

    return res.status(500).json({
      mensagem: 'Erro ao corrigir instituição.',
      erro: error.message
    });
  }
});

module.exports = router;