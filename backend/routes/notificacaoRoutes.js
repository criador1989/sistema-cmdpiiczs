const express = require('express');
const router = express.Router();
const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const calcularNotaTSMD = require('../../utils/calculoNota');
const enviarEmail = require('../../services/emailService');
const autenticar = require('../../middleware/autenticar');
const { obterDadosDoRegulamento } = require('../../utils/regulamento');

// POST /api/notificacoes
router.post('/', autenticar, async (req, res) => {
  try {
    const { aluno, motivo, tipo, tipoMedida, observacao, data } = req.body;

    const valores = {
      'Advertência Escrita': -0.30,
      'Repreensão': -0.50,
      'A.E.C.D.E': -0.70,
      'A.I.A': -1.20,
      'Elogio Verbal': +0.15,
      'Elogio Individual': +0.60,
      'Elogio Coletivo': +0.20,
      'Média ≥ 8,5': +0.40
    };

    const valor = valores[tipoMedida] || 0;

    const alunoRelacionado = await Aluno.findOne({
      _id: aluno,
      instituicao: req.usuario.instituicao
    });

    if (!alunoRelacionado) {
      return res.status(404).json({ error: 'Aluno não encontrado ou pertence a outra instituição' });
    }

    const notificacoesAnteriores = await Notificacao.find({
      aluno,
      instituicao: req.usuario.instituicao,
      data: { $lt: new Date(data) }
    });

    const datasInfracoes = notificacoesAnteriores.map(n => n.data);
    const notaCalculada = calcularNotaTSMD(
      alunoRelacionado.dataEntrada,
      new Date(data),
      datasInfracoes
    );

    const notaAnterior = notaCalculada;
    const notaAtual = Math.max(0, Math.min(10, notaAnterior + valor));
    alunoRelacionado.comportamento = notaAtual;
    await alunoRelacionado.save();

    // Obter dados do regulamento com base no motivo
    const dadosRegulamento = obterDadosDoRegulamento(motivo);

    const novaNotificacao = new Notificacao({
      aluno,
      motivo,
      tipo,
      tipoMedida,
      valorNumerico: valor,
      observacao,
      data,
      notaAnterior,
      notaAtual,
      artigo: dadosRegulamento.artigo,
      paragrafo: dadosRegulamento.paragrafo,
      inciso: dadosRegulamento.inciso,
      classificacaoRegulamento: dadosRegulamento.classificacao,
      instituicao: req.usuario.instituicao
    });

    await novaNotificacao.save();

    if (alunoRelacionado.email) {
      const assunto = 'Notificação Disciplinar – Colégio Militar Dom Pedro II';
      const mensagemHtml = `
        <h2>Notificação Disciplinar</h2>
        <p><strong>Aluno:</strong> ${alunoRelacionado.nome}</p>
        <p><strong>Turma:</strong> ${alunoRelacionado.turma}</p>
        <p><strong>Data:</strong> ${new Date(data).toLocaleDateString()}</p>
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Medida Disciplinar:</strong> ${tipoMedida}</p>
        <p><strong>Motivo:</strong> ${motivo}</p>
        <p><strong>Observação:</strong> ${observacao || '-'}</p>
        <hr/>
        <p><strong>Nota anterior:</strong> ${notaAnterior.toFixed(2)}</p>
        <p><strong>Nota atual:</strong> ${notaAtual.toFixed(2)}</p>
        <p>Esta mensagem é automática. Em caso de dúvidas, entre em contato com a coordenação.</p>
      `;

      await enviarEmail(alunoRelacionado.email, assunto, mensagemHtml);
    }

    res.status(201).json(novaNotificacao);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar notificação: ' + err.message });
  }
});

// GET /api/notificacoes
router.get('/', autenticar, async (req, res) => {
  try {
    const notificacoes = await Notificacao.find({ instituicao: req.usuario.instituicao })
      .populate({
        path: 'aluno',
        match: { instituicao: req.usuario.instituicao }
      });
    res.json(notificacoes.filter(n => n.aluno));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// GET /api/notificacoes/:id
router.get('/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate({
      path: 'aluno',
      match: { instituicao: req.usuario.instituicao }
    });

    if (!notificacao || !notificacao.aluno) {
      return res.status(404).json({ error: 'Notificação não encontrada' });
    }

    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notificação: ' + err.message });
  }
});

// DELETE /api/notificacoes/:id
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const deletada = await Notificacao.findOneAndDelete({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!deletada) return res.status(404).json({ error: 'Notificação não encontrada' });
    res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir notificação: ' + err.message });
  }
});

// PUT /api/notificacoes/:id
router.put('/:id', autenticar, async (req, res) => {
  try {
    const atualizada = await Notificacao.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      req.body,
      { new: true }
    );
    if (!atualizada) return res.status(404).json({ error: 'Notificação não encontrada' });
    res.json(atualizada);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao editar notificação: ' + err.message });
  }
});

module.exports = router;
