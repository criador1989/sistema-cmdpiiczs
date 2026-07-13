const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const calcularNotaTSMD = require('../../utils/calculoNota'); // já existente

// GET /api/diagnostico/nota-anterior/:alunoId?ate=YYYY-MM-DD
router.get('/nota-anterior/:alunoId', async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { ate } = req.query;

    const aluno = await Aluno.findById(alunoId);
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado.' });

    // data de corte: se não vier, usa "agora"
    const dataCorte = ate ? new Date(ate) : new Date();

    // pega todas as notificações do aluno até a data de corte (inclusive)
    const notificacoes = await Notificacao.find({
      aluno: alunoId,
      data: { $lte: dataCorte }
    }).sort({ data: 1 });

    // ⚠️ IMPORTANTE: o calcularNotaTSMD precisa SOMAR elogios (valorNumerico positivo)
    // e SUBTRAIR penalidades (valorNumerico negativo). Ele deve receber:
    //   calcularNotaTSMD(aluno.dataEntrada, dataCorte, notificacoes)
    // Se sua função atual sempre subtrai, ajuste para: nota += n.valor
    const nota = calcularNotaTSMD(aluno.dataEntrada, dataCorte, notificacoes);

    // resumo simples
    const somaElogios = notificacoes
      .filter(n => typeof n.valorNumerico === 'number' && n.valorNumerico > 0)
      .reduce((acc, n) => acc + n.valorNumerico, 0);

    const somaPenalidades = notificacoes
      .filter(n => typeof n.valorNumerico === 'number' && n.valorNumerico < 0)
      .reduce((acc, n) => acc + n.valorNumerico, 0);

    return res.json({
      aluno: { id: aluno._id, nome: aluno.nome, turma: aluno.turma },
      dataEntrada: aluno.dataEntrada,
      dataCorte,
      notaCalculada: Number(nota.toFixed(2)),
      totalElogios: Number(somaElogios.toFixed(2)),
      totalPenalidades: Number(somaPenalidades.toFixed(2)),
      qtdNotificacoesConsideradas: notificacoes.length
    });
  } catch (err) {
    console.error('Erro em /api/diagnostico/nota-anterior:', err);
    return res.status(500).json({ mensagem: 'Erro ao calcular nota anterior.' });
  }
});

module.exports = router;
