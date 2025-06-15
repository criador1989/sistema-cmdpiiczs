const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

router.get('/ficha/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo?.trim().toUpperCase();
    console.log("🔍 Código recebido:", codigo);

    if (!codigo) {
      console.warn("⚠️ Nenhum código foi enviado.");
      return res.status(400).json({ erro: 'Código de acesso não informado.' });
    }

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    console.log("📋 Resultado da busca por aluno:", aluno);

    if (!aluno) {
      console.warn("⚠️ Aluno não encontrado com código:", codigo);
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    const notificacoes = await Notificacao.find({ aluno: aluno._id })
      .sort({ createdAt: -1 })
      .select('tipo tipoMedida motivo valorNumerico createdAt');

    console.log("📄 Notificações encontradas:", notificacoes.length);

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
    console.error("❌ ERRO GRAVE NA ROTA /api/ficha/:codigo:", erro);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
});

module.exports = router;
