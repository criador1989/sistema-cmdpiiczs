const express = require('express');
const router = express.Router();

// Rota de teste fixa para simular uma ficha de aluno
router.get('/teste/:codigo', async (req, res) => {
  const codigo = req.params.codigo?.trim().toUpperCase();

  console.log("🧪 Acessando ficha de teste com código:", codigo);

  if (!codigo) {
    return res.status(400).json({ erro: 'Código não informado.' });
  }

  if (codigo !== 'TESTE01') {
    return res.status(404).json({ erro: 'Código de teste inválido.' });
  }

  return res.json({
    aluno: {
      nome: 'Aluno de Teste',
      turma: '7ºA',
      codigoAcesso: 'TESTE01',
      comportamento: 8.75
    },
    notificacoes: [
      {
        tipo: 'Advertência',
        tipoMedida: 'Advertência Escrita',
        motivo: 'Uso indevido de uniforme',
        valorNumerico: 0.3,
        createdAt: new Date()
      },
      {
        tipo: 'Repreensão',
        tipoMedida: 'Repreensão',
        motivo: 'Descumprimento de ordem',
        valorNumerico: 0.5,
        createdAt: new Date()
      }
    ]
  });
});

module.exports = router;
