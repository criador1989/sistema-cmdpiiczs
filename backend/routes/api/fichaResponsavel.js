const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');

// GET /api/ficha/responsavel/:codigo
router.get('/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo.toUpperCase().trim();

    // Busca o aluno pelo código de acesso
    const aluno = await Aluno.findOne({ codigoAcesso: codigo });
    if (!aluno) {
      return res.status(404).json({ erro: 'Código inválido ou aluno não encontrado.' });
    }

    // Busca as notificações vinculadas a esse aluno
    const notificacoes = await Notificacao.find({ aluno: aluno._id })
      .sort({ createdAt: -1 }) // mais recentes primeiro
      .select('tipo tipoMedida motivo valorNumerico createdAt');

    // Prepara resposta com dados essenciais da ficha
    res.json({
      nome: aluno.nome,
      turma: aluno.turma,
      comportamento: aluno.comportamento?.toFixed(2) || '8.00',
      notificacoes: notificacoes.map(n => ({
        data: new Date(n.createdAt).toLocaleDateString('pt-BR'),
        tipo: n.tipo,
        tipoMedida: n.tipoMedida,
        motivo: n.motivo,
        valor: n.valorNumerico
      }))
    });

  } catch (erro) {
    console.error('Erro ao buscar ficha do aluno para responsável:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar ficha do aluno.' });
  }
});

module.exports = router;
