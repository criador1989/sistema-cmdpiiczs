// backend/routes/api/pdf.js
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const Notificacao = require('../../models/Notificacao');
const Instituicao = require('../../models/Instituicao');
const { autenticar } = require('../../middleware/autenticacao');

const {
  getConfigDisciplinar,
  getClassificacaoComportamento,
  getTextoRegulamento
} = require('../../utils/configuracaoDisciplinar');

const router = express.Router();

/* ------------ Helpers ------------- */
function numeroParaRomano(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return String(valor || '').trim();

  const mapa = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];

  let restante = Math.trunc(n);
  let romano = '';

  for (const [num, simb] of mapa) {
    while (restante >= num) {
      romano += simb;
      restante -= num;
    }
  }

  return romano || String(valor || '').trim();
}

function montarDescricaoInfracao({
  artigo = '',
  paragrafo = '',
  inciso = '',
  motivo = '',
  classificacao = ''
} = {}) {
  const artigoTxt = String(artigo || '').trim();
  const paragrafoTxt = String(paragrafo || '').trim();
  const incisoTxt = numeroParaRomano(inciso);
  const motivoTxt = String(motivo || '').trim();
  const classificacaoTxt = String(classificacao || '').trim();

  const linhas = [];

  if (artigoTxt || paragrafoTxt) {
    linhas.push([artigoTxt, paragrafoTxt].filter(Boolean).join('. '));
  }

  if (classificacaoTxt) {
    linhas.push(`Classificação: ${classificacaoTxt}`);
  }

  if (incisoTxt || motivoTxt) {
    if (incisoTxt && motivoTxt) {
      linhas.push(`${incisoTxt} – ${motivoTxt}`);
    } else if (incisoTxt) {
      linhas.push(incisoTxt);
    } else {
      linhas.push(motivoTxt);
    }
  }

  return linhas.join('\n').trim() || '—';
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

    const instituicao = await Instituicao.findById(req.usuario.instituicao).lean();

    const config = await getConfigDisciplinar(req.usuario.instituicao);
    const regulamento = getTextoRegulamento(config);

    const notaAnteriorNum = Number(notificacao.notaAnterior);
    const valorNum = Number(notificacao.valorNumerico);
    const notaAtualSalva = Number(notificacao.notaAtual);

    let notaFinalNum = Number.isFinite(notaAtualSalva)
      ? +notaAtualSalva.toFixed(2)
      : (
          Number.isFinite(notaAnteriorNum) && Number.isFinite(valorNum)
            ? +(notaAnteriorNum + valorNum).toFixed(2)
            : NaN
        );

    const classificacao = getClassificacaoComportamento(notaFinalNum, config);

    // 🔥 AQUI ESTÁ A CORREÇÃO PRINCIPAL
    const descricaoInfracao = montarDescricaoInfracao({
      artigo: notificacao.artigo || '',
      paragrafo: notificacao.paragrafo || '',
      inciso: notificacao.inciso || '',
      motivo: notificacao.motivo || '',
      classificacao: notificacao.classificacaoRegulamento || ''
    });

    console.log('📄 DEBUG PDF:', {
      artigo: notificacao.artigo,
      paragrafo: notificacao.paragrafo,
      inciso: notificacao.inciso,
      classificacaoRegulamento: notificacao.classificacaoRegulamento,
      motivo: notificacao.motivo,
      descricaoInfracao
    });

    const textoCabecalho = regulamento?.textos?.cabecalho || '';
    const textoNotificacao = regulamento?.textos?.notificacao || '';
    const nomeRegulamento = regulamento?.nome || 'Regulamento Disciplinar';

    const dados = {
      numero: (notificacao._id || '').toString().slice(-6).toUpperCase(),
      numeroSequencial: notificacao.numeroSequencial || '',
      aluno: aluno.nome,
      alunoNome: aluno.nome,
      turma: aluno.turma,
      alunoTurma: aluno.turma,

      regulamentoNome: nomeRegulamento,
      cabecalho: textoCabecalho,
      textoInstitucional: textoNotificacao,

      descricaoInfracao,
      observacao: notificacao.observacao || '-',

      valorNumerico: toFixed2(valorNum),
      notaAnterior: toFixed2(notaAnteriorNum),
      notaAtual: Number.isFinite(notaFinalNum) ? toFixed2(notaFinalNum) : '',

      comportamento: classificacao,

      dataPorExtenso: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      }),
      dataHora: new Date(notificacao.data).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
      }),

      logoUrl: instituicao?.logoUrl || '',
      cidade: instituicao?.municipio || '—',
      estado: instituicao?.estado || '—'
    };

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

      if (!fs.existsSync(docxPath)) {
        return res.status(500).send('Arquivo gerado não encontrado');
      }

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