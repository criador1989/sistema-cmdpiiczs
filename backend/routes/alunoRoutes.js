const express = require('express');
const router = express.Router();
const Aluno = require('../models/Aluno');
const upload = require('../middleware/upload');
const autenticar = require('../middleware/autenticacao');

function gerarCodigoAcesso(tamanho = 8) {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';
  for (let i = 0; i < tamanho; i++) {
    codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return codigo;
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

// ✅ [2] Criar novo aluno
router.post('/', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const {
      nome, turma, dataEntrada, nomePai, nomeMae, telefone, nascimento, endereco
    } = req.body;

    if (!nome || !turma || !dataEntrada) {
      return res.status(400).json({ message: 'Nome, turma e data de entrada são obrigatórios.' });
    }

    const novoAluno = new Aluno({
      nome,
      turma,
      dataEntrada,
      nomePai,
      nomeMae,
      telefone,
      nascimento,
      endereco,
      codigoAcesso: gerarCodigoAcesso(),
      foto: req.file ? req.file.filename : null,
      instituicao: req.usuario.instituicao // ✅ importante
    });

    const alunoSalvo = await novoAluno.save();
    res.status(201).json(alunoSalvo);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar aluno', error: error.message });
  }
});

// ✅ [3] Buscar aluno por ID
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

// ✅ [4] Atualizar aluno
router.put('/:id', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const atualizacao = { ...req.body };
    if (req.file) atualizacao.foto = req.file.filename;

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      atualizacao,
      { new: true }
    );

    if (!alunoAtualizado) {
      return res.status(404).json({ message: 'Aluno não encontrado' });
    }

    res.json(alunoAtualizado);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar aluno', error: error.message });
  }
});

// ✅ [5] Deletar aluno
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

// ✅ [6] Transferência em lote
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

module.exports = router;
