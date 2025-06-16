const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

router.get('/turma/:turma', async (req, res) => {
  const turma = decodeURIComponent(req.params.turma);
  try {
    // Buscar todos os alunos da turma
    const alunos = await Aluno.find({ turma }).select('nome turma codigoAcesso');

    if (!alunos.length) {
      return res.status(404).json({ erro: 'Nenhum aluno encontrado para essa turma.' });
    }

    // Caminho do script Python
    const scriptPath = path.join(__dirname, '../../pdf/generate_cartoes.py');

    // Processar com spawn
    const python = spawn('python3', [scriptPath], { shell: true });
    let resultado = '';
    let erroPython = '';

    python.stdout.on('data', (data) => {
      resultado += data.toString();
    });

    python.stderr.on('data', (data) => {
      erroPython += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(resultado.trim())) {
        console.error("Erro ao gerar os cartões:", erroPython);
        return res.status(500).json({ erro: 'Erro ao gerar os cartões.' });
      }

      // Enviar o ZIP gerado
      res.download(resultado.trim(), `cartoes_${turma}.zip`);
    });

    // Enviar os dados ao script
    python.stdin.write(JSON.stringify(alunos));
    python.stdin.end();

  } catch (err) {
    console.error("Erro na rota de geração de cartões:", err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
});

module.exports = router;
