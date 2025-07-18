const express = require('express');
const router = express.Router();
const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const calcularNotaComportamento = require('../../utils/calcularNota');

// GET /api/usuarios/acesso/:token - Acesso público via token do professor
router.get('/acesso/:token', async (req, res) => {
  try {
    const token = req.params.token;

    // Busca o professor pelo token
    const professor = await Usuario.findOne({
      tokenAcessoProfessor: token,
      tipo: 'professor'
    });

    if (!professor) {
      return res.status(404).json({ erro: 'Token inválido ou professor não encontrado.' });
    }

    // Busca todos os alunos da mesma instituição do professor
    const alunos = await Aluno.find({ instituicao: professor.instituicao });

    // Calcula nota atualizada de cada aluno
    const alunosComNotas = await Promise.all(alunos.map(async (aluno) => {
      const comportamento = await calcularNotaComportamento(aluno._id);
      return {
        ...aluno.toObject(),
        comportamento
      };
    }));

    res.json({ alunos: alunosComNotas });

  } catch (erro) {
    console.error('Erro ao buscar alunos por token do professor:', erro);
    res.status(500).json({ erro: 'Erro interno ao buscar alunos' });
  }
});

module.exports = router;
