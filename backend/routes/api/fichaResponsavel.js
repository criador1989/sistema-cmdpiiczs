const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// Rota pública: /api/ficha/:codigo
router.get('/ficha/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo?.trim().toUpperCase();
    if (!codigo) {
      return res.status(400).json({ erro: 'Código de acesso não fornecido.' });
    }

    console.log("🔍 Buscando ficha do aluno com código:", codigo);

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) {
      console.warn("⚠️ Nenhum aluno encontrado com o código:", codigo);
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    const notificacoes = await Notificacao.find({ aluno: aluno._id })
      .sort({ createdAt: -1 })
      .select('tipo tipoMedida motivo valorNumerico createdAt');

    return res.json({
      aluno: {
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso,
        comportamento: aluno.comportamento || 8.00
      },
      notificacoes
    });
  } catch (erro) {
    console.error('❌ Erro interno ao buscar ficha do aluno:', erro);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
