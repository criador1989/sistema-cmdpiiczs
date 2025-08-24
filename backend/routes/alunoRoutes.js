// backend/routes/alunoRoutes.js
const express = require('express');
const router = express.Router();

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');         // p/ recálculo
const calcularNotaTSMD = require('../utils/calculoNota');      // p/ recálculo
const upload = require('../middleware/upload');
const { autenticar } = require('../middleware/autenticacao');

function gerarCodigoAcesso(tamanho = 8) {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';
  for (let i = 0; i < tamanho; i++) {
    codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return codigo;
}

// util local: normaliza data para 00:00
function toDateOnly(d) {
  if (!d) return undefined;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ✅ [1] Listar todos os alunos da instituição ou filtrar por turma
router.get('/', autenticar, async (req, res) => {
  try {
    const filtro = { instituicao: req.usuario.instituicao };
    if (req.query.turma) {
      filtro.turma = req.query.turma;
    }
    const alunos = await Aluno.find(filtro);
    res.json(alunos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar alunos', error: error.message });
  }
});

// ✅ [2] Criar novo aluno (com normalização + recálculo)
router.post('/', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const { nome, turma, dataEntrada, nomePai, nomeMae, telefone, nascimento, endereco } = req.body;

    if (!nome || !turma || !dataEntrada) {
      return res.status(400).json({ message: 'Nome, turma e data de entrada são obrigatórios.' });
    }

    const novoAluno = new Aluno({
      nome,
      turma,
      dataEntrada: toDateOnly(dataEntrada),
      nomePai,
      nomeMae,
      telefone,
      nascimento: toDateOnly(nascimento),
      endereco,
      codigoAcesso: gerarCodigoAcesso(),
      foto: req.file ? req.file.filename : (req.body.foto || null),
      instituicao: req.usuario.instituicao
    });

    await novoAluno.save();

    // recálculo inicial com TODAS as notificações existentes do aluno
    const notificacoes = await Notificacao.find({
      aluno: novoAluno._id,
      instituicao: req.usuario.instituicao
    }).select('data createdAt valorNumerico');

    const nota = calcularNotaTSMD(novoAluno.dataEntrada, new Date(), notificacoes);
    novoAluno.comportamento = Number(nota.toFixed(2));
    await novoAluno.save();

    const out = novoAluno.toObject();
    out.fotoUrl = novoAluno.foto ? `/uploads/${novoAluno.foto}` : null;
    res.status(201).json(out);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar aluno', error: error.message });
  }
});

// ✅ [3] TRANSFERÊNCIA EM LOTE
router.put('/transferir', autenticar, async (req, res) => {
  const { ids, novaTurma } = req.body;

  if (!ids || !Array.isArray(ids) || !novaTurma) {
    return res.status(400).json({ erro: 'Dados inválidos para transferência.' });
  }

  try {
    const resultado = await Aluno.updateMany(
      { _id: { $in: ids }, instituicao: req.usuario.instituicao },
      { $set: { turma: novaTurma } }
    );
    res.json({ mensagem: `Alunos transferidos para a turma ${novaTurma}.`, resultado });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao transferir alunos.', error: error.message });
  }
});

// ✅ [4] Buscar aluno por ID
router.get('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json(aluno);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar aluno', error: error.message });
  }
});

// ✅ [5] Atualizar aluno (com normalização + recálculo + fotoUrl)
router.put('/:id', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const camposEditaveis = [
      'nome', 'turma', 'nomePai', 'nomeMae', 'telefone', 'endereco',
      'codigoAcesso', 'foto', 'dataEntrada', 'nascimento'
    ];

    const atualizacao = {};
    for (const c of camposEditaveis) {
      if (req.body[c] !== undefined) {
        atualizacao[c] = (c === 'dataEntrada' || c === 'nascimento')
          ? toDateOnly(req.body[c])
          : req.body[c];
      }
    }
    if (req.file) atualizacao.foto = req.file.filename;

    const aluno = await Aluno.findOne({ _id: req.params.id, instituicao: req.usuario.instituicao });
    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    Object.assign(aluno, atualizacao);
    await aluno.save();

    // recálculo após atualização
    const notificacoes = await Notificacao.find({
      aluno: aluno._id,
      instituicao: req.usuario.instituicao
    }).select('data createdAt valorNumerico');

    const nota = calcularNotaTSMD(aluno.dataEntrada, new Date(), notificacoes);
    aluno.comportamento = Number(nota.toFixed(2));
    await aluno.save();

    const out = aluno.toObject();
    out.fotoUrl = aluno.foto ? `/uploads/${aluno.foto}` : null;
    res.json(out);
  } catch (error) {
    console.error('Erro ao atualizar aluno:', error);
    res.status(400).json({ message: 'Erro ao atualizar aluno', error: error.message });
  }
});

// ✅ [6] Deletar aluno
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const alunoDeletado = await Aluno.findOneAndDelete({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });
    if (!alunoDeletado) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json({ message: 'Aluno deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar aluno', error: error.message });
  }
});

module.exports = router;
