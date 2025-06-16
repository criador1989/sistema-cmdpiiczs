const express = require('express');
const router = express.Router();
const Aluno = require('../../models/Aluno');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

router.get('/turma/:turma', async (req, res) => {
  try {
    const turma = req.params.turma;
    const alunos = await Aluno.find({ turma });

    if (alunos.length === 0) {
      return res.status(404).json({ erro: 'Nenhum aluno encontrado para esta turma.' });
    }

    const scriptPath = path.join(__dirname, '../../pdf/generate_cartoes.py');
    const python = spawn('python', [scriptPath], { shell: true });

    let zipPath = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      zipPath = data.toString().trim();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(zipPath)) {
        console.error('Erro Python:', stderr);
        return res.status(500).json({ erro: 'Falha na geração do arquivo ZIP.' });
      }

      res.download(zipPath, 'cartoes_turma.zip', (err) => {
        if (err) console.error('Erro ao enviar ZIP:', err);
        fs.unlink(zipPath, () => {});
      });
    });

    python.stdin.write(JSON.stringify(alunos));
    python.stdin.end();

  } catch (erro) {
    console.error("Erro ao gerar os cartões:", erro);
    res.status(500).json({ erro: 'Erro ao gerar os cartões.' });
  }
});

module.exports = router;
