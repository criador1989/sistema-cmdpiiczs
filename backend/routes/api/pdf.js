const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const autenticar = require('../../middleware/autenticacao');

const router = express.Router();

// GERAÇÃO DE DOCX COM PYTHON
router.post('/pdf/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notificacao || !notificacao.aluno) {
      return res.status(404).json({ error: 'Notificação ou aluno não encontrado' });
    }

    // DADOS PARA O DOCUMENTO
    const dados = {
      numero: notificacao._id.toString().slice(-6).toUpperCase(),
      aluno: notificacao.aluno.nome,
      turma: notificacao.aluno.turma,
      artigo: notificacao.artigo || '',
      paragrafo: notificacao.inciso?.split('–')[0]?.trim() || '§ 3º',
      inciso: notificacao.inciso?.split('–')[1]?.trim() || '1',
      classificacaoRegulamento: notificacao.classificacaoRegulamento || '',
      tipoMedida: notificacao.tipoMedida,
      observacao: notificacao.observacao || '-',
      Valor: notificacao.valorNumerico.toFixed(2),
      comportamento: calcularComportamentoClassificacao(notificacao.notaAtual),
      notaAnterior: notificacao.notaAnterior.toFixed(2),
      notaAtual: notificacao.notaAtual.toFixed(2),
      dataHora: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      })
    };

    console.log('🔍 Dados enviados ao Python:', dados);

    const python = spawn('python', ['pdf/generate_notification.py'], {
      cwd: path.resolve(__dirname, '../../')
    });

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

    let output = '';
    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      console.error(`Erro Python: ${data}`);
    });

    python.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).send('Erro ao gerar PDF');
      }

      const docxPath = output.trim();
      const filename = `notificacao_${notificacao.aluno.nome.replace(/\s+/g, '_')}.docx`;
      res.download(docxPath, filename, (err) => {
        if (err) console.error('Erro ao enviar o arquivo:', err);
      });
    });

  } catch (err) {
    console.error('❌ Erro ao gerar notificação:', err);
    res.status(500).json({ error: 'Erro ao gerar notificação' });
  }
});

// Função auxiliar
function calcularComportamentoClassificacao(nota) {
  if (nota >= 9.5) return 'Excepcional';
  if (nota >= 8.5) return 'Ótimo';
  if (nota >= 7.5) return 'Bom';
  if (nota >= 6.0) return 'Regular';
  if (nota >= 4.0) return 'Insuficiente';
  return 'Incompatível';
}

module.exports = router;
