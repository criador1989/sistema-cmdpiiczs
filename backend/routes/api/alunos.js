
const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const upload = require('../../middleware/upload');
const autenticar = require('../../middleware/autenticacao');
const calcularNotaComportamento = require('../../utils/calcularNota');

// GET /api/alunos - Lista alunos da mesma instituição
router.get('/', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find({ instituicao: req.usuario.instituicao });

    const alunosComNotaAtualizada = await Promise.all(
      alunos.map(async (aluno) => {
        const notaAtualizada = await calcularNotaComportamento(aluno._id);
        return {
          ...aluno.toObject(),
          comportamento: notaAtualizada
        };
      })
    );

    res.json(alunosComNotaAtualizada);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar alunos', error });
  }
});

// POST /api/alunos - Criar novo aluno com vínculo institucional
router.post('/', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const {
      nome,
      turma,
      dataEntrada,
      nascimento,
      telefone,
      endereco,
      nomePai,
      nomeMae
    } = req.body;

    const turmaNormalizada = turma
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, '')
      .replace(/[º°]/g, "º")
      .replace(/[ª]/g, "ª")
      .trim();

    const novoAluno = new Aluno({
      nome,
      turma: turmaNormalizada,
      dataEntrada,
      nascimento,
      telefone,
      endereco,
      nomePai,
      nomeMae,
      instituicao: req.usuario.instituicao,
      foto: req.file ? `uploads/${req.file.filename}` : null
    });

    const alunoSalvo = await novoAluno.save();
    res.status(201).json(alunoSalvo);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar aluno', error });
  }
});

// ✅ PUT /api/alunos/transferir - Transfere vários alunos de turma (ESSA DEVE VIR ANTES DE /:id)
router.put('/transferir', autenticar, async (req, res) => {
  try {
    const { ids, novaTurma } = req.body;

    if (!Array.isArray(ids) || !novaTurma) {
      return res.status(400).json({ mensagem: 'IDs e nova turma são obrigatórios.' });
    }

    const turmaNormalizada = novaTurma
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, '')
      .replace(/[º°]/g, "º")
      .replace(/[ª]/g, "ª")
      .trim();

    const resultado = await Aluno.updateMany(
      { _id: { $in: ids }, instituicao: req.usuario.instituicao },
      { $set: { turma: turmaNormalizada } }
    );

    res.json({ mensagem: `✅ ${resultado.modifiedCount} aluno(s) transferido(s) com sucesso.` });
  } catch (error) {
    console.error('Erro ao transferir alunos:', error);
    res.status(500).json({ mensagem: 'Erro interno ao transferir alunos.' });
  }
});

// GET /api/alunos/:id - Buscar aluno da mesma instituição
router.get('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json(aluno);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar aluno', error });
  }
});

// PUT /api/alunos/:id - Atualizar aluno da mesma instituição
router.put('/:id', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const dadosAtualizados = req.body;

    if (dadosAtualizados.turma) {
      dadosAtualizados.turma = dadosAtualizados.turma
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, '')
        .replace(/[º°]/g, "º")
        .replace(/[ª]/g, "ª")
        .trim();
    }

    if (req.file) {
      dadosAtualizados.foto = `uploads/${req.file.filename}`;
    }

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      dadosAtualizados,
      { new: true }
    );

    if (!alunoAtualizado) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json(alunoAtualizado);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar aluno', error });
  }
});

// DELETE /api/alunos/:id - Deletar aluno da mesma instituição
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const alunoDeletado = await Aluno.findOneAndDelete({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!alunoDeletado) return res.status(404).json({ message: 'Aluno não encontrado' });
    res.json({ message: 'Aluno deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

module.exports = router;
