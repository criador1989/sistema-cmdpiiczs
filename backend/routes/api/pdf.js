// backend/routes/api/pdf.js
'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const Notificacao = require('../../models/Notificacao');
const Instituicao = require('../../models/Instituicao');
const { autenticar } = require('../../middleware/autenticacao');
const { obterIdentidadeInstitucional } = require('../../utils/documentos/identidadeInstitucional');

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

/**
 * Data de calendário segura.
 *
 * NÃO usar new Date('YYYY-MM-DD').toLocaleDateString() para data de ocorrência,
 * porque em fusos como America/Rio_Branco/America/Manaus o dia pode voltar.
 */
function dateOnlyFromAny(value) {
  if (!value) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatarDataCalendarioBR(value) {
  const iso = dateOnlyFromAny(value);
  if (!iso) return '—';

  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataCalendarioExtenso(value) {
  const iso = dateOnlyFromAny(value);
  if (!iso) return '—';

  const [ano, mes, dia] = iso.split('-');
  const meses = [
    '',
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
  ];

  const mesNome = meses[Number(mes)] || mes;
  return `${dia} de ${mesNome} de ${ano}`;
}

function formatarDataHoraRealBR(value = new Date(), timeZone = 'America/Rio_Branco') {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/* ============ Rota: gerar DOCX da notificação ============ */
async function gerarDocxNotificacao(req, res) {
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
    const identidadeInstitucional = await obterIdentidadeInstitucional(req);
    const timezoneInstituicao = instituicao?.timezone || 'America/Rio_Branco';

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

    const descricaoInfracao = montarDescricaoInfracao({
      artigo: notificacao.artigo || '',
      paragrafo: notificacao.paragrafo || '',
      inciso: notificacao.inciso || '',
      motivo: notificacao.motivo || '',
      classificacao: notificacao.classificacaoRegulamento || ''
    });

    const textoCabecalho = regulamento?.textos?.cabecalho || '';
    const textoNotificacao = regulamento?.textos?.notificacao || '';
    const nomeRegulamento = regulamento?.nome || 'Regulamento Disciplinar';

    const hashDocumento = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        notificacao: notificacao._id,
        numero: notificacao.numeroSequencial,
        aluno: aluno?.nome,
        data: Date.now()
      }))
      .digest('hex');

    const hashAssinatura = crypto
      .createHash('sha256')
      .update(`${hashDocumento}-${Date.now()}`)
      .digest('hex');

    const pastaQr = path.join(
      __dirname,
      '../../public/uploads/qrcodes'
    );

    fs.mkdirSync(pastaQr, { recursive: true });

    const qrCodePath = path.join(
      pastaQr,
      `notif_${notificacao._id}.png`
    );

    const urlValidacao =
      `${req.protocol}://${req.get('host')}/verificar-documento.html?hash=${hashDocumento}`;

    await QRCode.toFile(qrCodePath, urlValidacao, {
      width: 300,
      margin: 2
    });

    const dataOcorrenciaExtenso = formatarDataCalendarioExtenso(notificacao.data);
    const dataOcorrenciaBR = formatarDataCalendarioBR(notificacao.data);

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

      // Data da ocorrência: calendário puro, sem conversão por fuso.
      dataPorExtenso: dataOcorrenciaExtenso,
      dataHora: dataOcorrenciaExtenso,
      data: dataOcorrenciaBR,
      dataOcorrencia: dataOcorrenciaBR,

      logoUrl: instituicao?.logoUrl || '',

      orgaoSuperior:
        identidadeInstitucional.orgaoSuperior || '',

      nomeInstituicao:
        identidadeInstitucional.nomeInstituicao || '',

      subtituloInstitucional:
        identidadeInstitucional.subtitulo || '',

      rodapeInstitucional:
        identidadeInstitucional.rodapePadrao || '',

      mostrarRodape:
        identidadeInstitucional.mostrarRodape !== false,

      mostrarBrasaoEsquerdo:
        identidadeInstitucional.mostrarBrasaoEsquerdo !== false,

      mostrarBrasaoDireito:
        identidadeInstitucional.mostrarBrasaoDireito !== false,

      brasaoEsquerdoUrl:
        identidadeInstitucional.brasaoEsquerdoUrl || '',

      brasaoDireitoUrl:
        identidadeInstitucional.brasaoDireitoUrl || '',

      cidade: instituicao?.municipio || '—',
      estado: instituicao?.estado || '—',

      assinaturaDigital: {
        assinadoPorNome:
          req.actor?.nome ||
          req.usuario?.nome ||
          req.user?.nome ||
          'Usuário institucional',

        cargo:
          req.usuario?.cargo ||
          req.usuario?.funcao ||
          req.usuario?.tipo ||
          'Usuário institucional',

        // Assinatura é data/hora real, então aqui o uso de Date continua correto.
        assinadoEm: formatarDataHoraRealBR(new Date(), timezoneInstituicao),

        hashDocumento,
        hashAssinatura,
        qrCodePath
      }
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
}

router.get('/pdf/:id', autenticar, gerarDocxNotificacao);
router.post('/pdf/:id', autenticar, gerarDocxNotificacao);

module.exports = router;
