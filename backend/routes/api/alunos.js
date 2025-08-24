const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao'); // ✅ incluído para exclusão em cascata
const { autenticar } = require('../../middleware/autenticacao');
const autenticarTokenProfessor = require('../../middleware/tokenProfessor');
const calcularNotaComportamento = require('../../utils/calculoNota');
const Log = require('../../models/Log');

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

// GET /api/alunos/professor - Lista alunos para professores via token
router.get('/professor', autenticarTokenProfessor, async (req, res) => {
  try {
    const alunos = await Aluno.find({ instituicao: req.professor.instituicao });

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

// ✅ NOVA ROTA ADICIONADA
// GET /api/alunos/baixorendimento - Lista alunos com comportamento insuficiente ou incompatível
router.get('/baixorendimento', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find({
      instituicao: req.usuario.instituicao
    });

    const alunosFiltrados = [];

    for (const aluno of alunos) {
      const nota = await calcularNotaComportamento(aluno._id);
      if (nota < 5.0) {
        alunosFiltrados.push({
          ...aluno.toObject(),
          comportamento: nota
        });
      }
    }

    res.json(alunosFiltrados);
  } catch (error) {
    console.error('Erro ao buscar alunos com comportamento insuficiente/incompatível:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos com baixo rendimento', error });
  }
});

// GET /api/alunos/insuficientes - (antiga rota que ainda está disponível)
router.get('/insuficientes', autenticar, async (req, res) => {
  try {
    const alunos = await Aluno.find({
      instituicao: req.usuario.instituicao
    });

    const alunosFiltrados = [];

    for (const aluno of alunos) {
      const nota = await calcularNotaComportamento(aluno._id);
      if (nota < 5.0) {
        alunosFiltrados.push({
          ...aluno.toObject(),
          comportamento: nota
        });
      }
    }

    res.json(alunosFiltrados);
  } catch (error) {
    console.error('Erro ao buscar alunos com nota insuficiente:', error);
    res.status(500).json({ message: 'Erro ao buscar alunos com comportamento insuficiente', error });
  }
});

// POST /api/alunos - Criar novo aluno com vínculo institucional
router.post('/', autenticar, async (req, res) => {
  try {
    const {
      nome,
      turma,
      dataEntrada,
      nascimento,
      telefone,
      endereco,
      nomePai,
      nomeMae,
      foto
    } = req.body;

    const turmaNormalizada = turma
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ºº°]/g, "º")
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
      foto: foto || null,
      instituicao: req.usuario.instituicao
    });

    const alunoSalvo = await novoAluno.save();

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Cadastro de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoSalvo._id
    });

    res.status(201).json(alunoSalvo);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar aluno', error });
  }
});

// PUT /api/alunos/transferir - Transfere vários alunos de turma
router.put('/transferir', autenticar, async (req, res) => {
  try {
    const { ids, novaTurma } = req.body;

    if (!Array.isArray(ids) || !novaTurma) {
      return res.status(400).json({ mensagem: 'IDs e nova turma são obrigatórios.' });
    }

    const turmaNormalizada = novaTurma
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ºº°]/g, "º")
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
router.put('/:id', autenticar, async (req, res) => {
  try {
    const dadosAtualizados = req.body;

    if (dadosAtualizados.turma) {
      dadosAtualizados.turma = dadosAtualizados.turma
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºº°]/g, "º")
        .replace(/[ª]/g, "ª")
        .trim();
    }

    const alunoAtualizado = await Aluno.findOneAndUpdate(
      { _id: req.params.id, instituicao: req.usuario.instituicao },
      dadosAtualizados,
      { new: true }
    );

    if (!alunoAtualizado) return res.status(404).json({ message: 'Aluno não encontrado' });

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Edição de Aluno',
      entidade: 'Aluno',
      entidadeId: alunoAtualizado._id
    });

    res.json(alunoAtualizado);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar aluno', error });
  }
});

// DELETE /api/alunos/:id - Deletar aluno da mesma instituição (com cascata)
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const aluno = await Aluno.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    });

    if (!aluno) return res.status(404).json({ message: 'Aluno não encontrado' });

    // Exclusão em cascata: Notificações e Observações vinculadas
    await Promise.all([
      Notificacao.deleteMany({ aluno: aluno._id }),
      Observacao.deleteMany({ aluno: aluno._id }),
      Aluno.deleteOne({ _id: aluno._id })
    ]);

    await Log.create({
      usuario: req.usuario._id,
      acao: 'Exclusão de Aluno',
      entidade: 'Aluno',
      entidadeId: aluno._id
    });

    res.json({ message: 'Aluno e dados relacionados deletados com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar aluno:', error);
    res.status(500).json({ message: 'Erro ao deletar aluno', error });
  }
});

module.exports = router;
