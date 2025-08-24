const express = require('express');
const router = express.Router();

// POST /api/ficha/salvar/:id
router.post('/salvar/:id', async (req, res) => {
  // Exemplo simples de resposta
  res.json({ mensagem: 'Observação salva com sucesso (rota funcional).' });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');

// Se você já tem util de cálculo de comportamento, use:
let calcularNotaTSMD;
try {
  calcularNotaTSMD = require('../../utils/calculoNota'); // mantém como opcional
} catch (e) { calcularNotaTSMD = null; }

// GET /api/alunos/:id/ficha  (protegido)
router.get('/alunos/:id/ficha', autenticar, async (req, res) => {
  try {
    const { id } = req.params;
    const instituicao = req.usuario.instituicao;

    // Busca aluno limitado à instituição do usuário logado
    const aluno = await Aluno.findOne({ _id: id, instituicao }).lean();
    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    // Notificações do aluno (mais recentes primeiro)
    const notificacoes = await Notificacao.find({ aluno: aluno._id, instituicao })
      .sort({ createdAt: -1 })
      .select('tipo tipoMedida motivo valorNumerico artigo inciso classificacaoRegulamento observacoes data createdAt')
      .lean();

    // Observações manuais (seu modelo pode chamar “Observacao”)
    const observacoes = await Observacao.find({ aluno: aluno._id, instituicao })
      .sort({ createdAt: -1 })
      .select('texto autor createdAt')
      .lean();

    // Nota de comportamento (tenta calcular; se não houver util, usa campo salvo)
    let notaComportamento = typeof aluno.comportamento === 'number' ? aluno.comportamento : 8.0;
    if (calcularNotaTSMD) {
      const eventos = notificacoes.map(n => ({
        data: n.data || n.createdAt,
        valorNumerico: n.valorNumerico || 0
      }));
      try {
        const dataEntrada = aluno.dataEntrada ? new Date(aluno.dataEntrada) : null;
        notaComportamento = calcularNotaTSMD(dataEntrada, new Date(), eventos);
      } catch { /* mantém nota existente */ }
    }

    res.json({
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        fotoUrl: aluno.fotoUrl || null,
        dataEntrada: aluno.dataEntrada || null,
        codigoAcesso: aluno.codigoAcesso || null,
        comportamento: Number(notaComportamento.toFixed(2)),
      },
      notificacoes,
      observacoes
    });
  } catch (erro) {
    console.error('Erro ao montar ficha do aluno:', erro);
    res.status(500).json({ erro: 'Erro ao montar ficha do aluno.' });
  }
});

module.exports = router;
