const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// 🔍 ROTA ORIGINAL: /api/ficha/:codigo (continua funcionando)
router.get('/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo?.trim().toUpperCase();
    if (!codigo) return res.status(400).json({ erro: 'Código de acesso não informado.' });

    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });

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
    console.error("❌ ERRO na rota /api/ficha/:codigo:", erro);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});


// ✅ NOVA ROTA: /api/ficha/id/:id — busca ficha por ID do aluno
router.get('/id/:id', async (req, res) => {
  try {
    const aluno = await Aluno.findById(req.params.id);
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

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
    console.error('❌ ERRO na rota /api/ficha/id/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
