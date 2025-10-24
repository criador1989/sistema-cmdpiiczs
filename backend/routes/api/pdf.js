const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

const router = express.Router();

// ------------------ Funções auxiliares ------------------
function calcularComportamentoClassificacao(nota) {
  if (nota >= 9.5) return 'Excepcional';
  if (nota >= 8.5) return 'Ótimo';
  if (nota >= 7.5) return 'Bom';
  if (nota >= 6.0) return 'Regular';
  if (nota >= 4.0) return 'Insuficiente';
  return 'Incompatível';
}

function montarDescricaoInfracao({ artigo, inciso, motivo }) {
  const partes = [];
  if (artigo) partes.push(`Art. ${artigo}`);
  if (inciso) partes.push(inciso); // já costuma vir com “Inciso … – texto …”
  if (motivo) partes.push(`Motivo: ${motivo}`);
  return partes.join(' | ');
}

// ------------------ Rota principal ------------------
// POST /api/pdf/:id  → gera DOCX da notificação
router.post('/pdf/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notificacao || !notificacao.aluno) {
      return res.status(404).json({ error: 'Notificação ou aluno não encontrado' });
    }

    // monta descrição textual completa da infração
    const descricaoInfracao = montarDescricaoInfracao({
      artigo: notificacao.artigo || '',
      inciso: notificacao.inciso || '',
      motivo: notificacao.motivo || ''
    });

    // dados enviados ao Python
    const dados = {
      numero: (notificacao._id || '').toString().slice(-6).toUpperCase(),
      numeroSequencial: notificacao.numeroSequencial || '',
      aluno: notificacao.aluno.nome,
      turma: notificacao.aluno.turma,
      artigo: notificacao.artigo || '',
      paragrafo: notificacao.paragrafo || (notificacao.inciso?.split('–')[0]?.trim() || ''),
      descricaoInciso: notificacao.inciso || '',
      descricaoInfracao, // << texto completo (artigo + inciso + motivo)
      classificacaoRegulamento: notificacao.classificacaoRegulamento || '',
      tipoMedida: notificacao.tipoMedida,
      observacao: notificacao.observacao || '-',
      Valor: Number(notificacao.valorNumerico || 0).toFixed(2),
      valorNumerico: Number(notificacao.valorNumerico || 0).toFixed(2),
      comportamento: calcularComportamentoClassificacao(Number(notificacao.notaAtual || 0)),
      notaAnterior: Number(notificacao.notaAnterior || 0).toFixed(2),
      notaAtual: Number(notificacao.notaAtual || 0).toFixed(2),
      dataPorExtenso: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }),
      dataHora: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    };

    console.log('📤 Dados enviados ao Python:', dados);

    const scriptPath = path.join(__dirname, '../../pdf/generate_notification_docx.py');
    const python = spawn('python', [scriptPath], {
      cwd: path.resolve(__dirname, '../../')
    });

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

    let output = '';
    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      console.error('❌ Erro Python:', data.toString());
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Python finalizou com código ${code}`);
        return res.status(500).send('Erro ao gerar DOCX');
      }

      const docxPath = output.trim();
      if (!fs.existsSync(docxPath)) {
        return res.status(500).send('Arquivo gerado não encontrado');
      }

      const filename = `notificacao_${notificacao.aluno.nome.replace(/\s+/g, '_')}.docx`;
      res.download(docxPath, filename, (err) => {
        if (err) console.error('❌ Erro ao enviar o arquivo gerado:', err);
      });
    });
  } catch (err) {
    console.error('❌ Erro ao gerar notificação:', err);
    res.status(500).json({ error: 'Erro ao gerar notificação' });
  }
});

module.exports = router;
