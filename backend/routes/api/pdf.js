// backend/routes/api/pdf.js
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Notificacao = require('../../models/Notificacao');
const { autenticar } = require('../../middleware/autenticacao');

const router = express.Router();

/* ------------ Helpers ------------- */
function calcularComportamentoClassificacao(nota) {
  const n = Number(nota || 0);
  if (n >= 9.5) return 'Excepcional';
  if (n >= 8.5) return 'Ótimo';
  if (n >= 7.5) return 'Bom';
  if (n >= 6.0) return 'Regular';
  if (n >= 4.0) return 'Insuficiente';
  return 'Incompatível';
}
function montarDescricaoInfracao({ artigo, inciso, motivo }) {
  const a = (artigo || '').replace(/^Art\.?\s*/i, '').trim(); // evita "Art. Art. 54"
  const partes = [];
  if (a) partes.push(`Art. ${a}`);
  if (inciso) partes.push(inciso);
  if (motivo) partes.push(`Motivo: ${motivo}`);
  return partes.join(' | ');
}
function toFixed2(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/* ============ Rota: gerar DOCX da notificação ============ */
router.post('/pdf/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      instituicao: req.usuario.instituicao
    }).populate('aluno');

    if (!notificacao || !notificacao.aluno) {
      return res.status(404).json({ error: 'Notificação ou aluno não encontrado' });
    }

    const aluno = notificacao.aluno;

    // Números crus
    const notaAnteriorNum = Number(notificacao.notaAnterior);
    const valorNum        = Number(notificacao.valorNumerico);
    const notaAtualSalva  = Number(notificacao.notaAtual);

    // 🔒 Cálculo determinístico da nota final do dia (pós-evento)
    // 1) Se conseguimos somar anterior + valor -> essa é a nota final do DOCX
    // 2) Caso contrário, usamos a notaAtual salva, se válida
    // 3) Senão fica vazio
    let notaFinalNum = Number.isFinite(notaAnteriorNum) && Number.isFinite(valorNum)
      ? +(notaAnteriorNum + valorNum).toFixed(2)
      : (Number.isFinite(notaAtualSalva) ? +notaAtualSalva.toFixed(2) : NaN);

    // Classificação textual baseada na nota final
    const classificacao = calcularComportamentoClassificacao(notaFinalNum);

    const descricaoInfracao = montarDescricaoInfracao({
      artigo: notificacao.artigo || '',
      inciso: notificacao.inciso || '',
      motivo: notificacao.motivo || ''
    });

    // Payload para o Python
    const dados = {
      // Identificação
      numero: (notificacao._id || '').toString().slice(-6).toUpperCase(),
      numeroSequencial: notificacao.numeroSequencial || '',
      aluno: aluno.nome,
      alunoNome: aluno.nome,
      turma: aluno.turma,
      alunoTurma: aluno.turma,

      // Regulamento
      artigo: notificacao.artigo || '',
      paragrafo: notificacao.paragrafo || (notificacao.inciso?.split('–')[0]?.trim() || ''),
      descricaoInciso: notificacao.inciso || '',
      descricaoInfracao,
      classificacaoRegulamento: notificacao.classificacaoRegulamento || '',

      // Medida
      tipoMedida: notificacao.tipoMedida,
      tipo: notificacao.tipo || notificacao.tipoMedida,
      observacao: notificacao.observacao || '-',

      // Valores
      valorNumerico: toFixed2(valorNum),
      Valor: toFixed2(valorNum),

      // Notas (duas casas)
      notaAnterior: toFixed2(notaAnteriorNum),
      // 👉 Forçamos que "notaAtual" seja a nota FINAL recalculada
      notaAtual: Number.isFinite(notaFinalNum) ? toFixed2(notaFinalNum) : '',
      notaPublicavel: Number.isFinite(notaFinalNum) ? toFixed2(notaFinalNum) : '',
      notaFinal: Number.isFinite(notaFinalNum) ? toFixed2(notaFinalNum) : '',

      // Comportamento (TEXTO)
      classificacaoComportamental: classificacao,
      comportamento: classificacao,

      // Datas
      dataPorExtenso: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      }),
      dataHora: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      })
    };

    // Log detalhado p/ conferir no terminal
    console.log('📤 Dados enviados ao Python:', {
      notaAnterior: dados.notaAnterior,
      valorNumerico: dados.valorNumerico,
      notaAtual: dados.notaAtual,
      notaFinal: dados.notaFinal
    });

    const scriptPath = path.join(__dirname, '../../pdf/generate_notification_docx.py');
    const python = spawn('python', [scriptPath], { cwd: path.resolve(__dirname, '../../') });

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

    let output = '';
    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error('❌ Erro Python:', data.toString()); });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Python finalizou com código ${code}`);
        return res.status(500).send('Erro ao gerar DOCX');
      }
      const docxPath = output.trim();
      if (!fs.existsSync(docxPath)) return res.status(500).send('Arquivo gerado não encontrado');

      const filename = `notificacao_${aluno.nome.replace(/\s+/g, '_')}.docx`;
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
