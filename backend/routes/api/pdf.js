// backend/routes/api/pdf.js
'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
/**
 * Resolve o Python usado pelos geradores de documentos.
 *
 * Prioridade:
 * 1. AXORIIN_PYTHON / PYTHON_EXECUTABLE configurado no ambiente;
 * 2. .venv local do backend;
 * 3. comando "python" do sistema, preservando compatibilidade.
 */
function resolvePythonExecutable() {
  const configurado = String(
    process.env.AXORIIN_PYTHON ||
    process.env.PYTHON_EXECUTABLE ||
    ''
  ).trim();

  if (configurado) return configurado;

  const backendRoot = path.resolve(__dirname, '../../');

  const venvPython = process.platform === 'win32'
    ? path.join(backendRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(backendRoot, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  return 'python';
}

const PYTHON_EXECUTABLE = resolvePythonExecutable();

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

    const pastaTemp = path.join(
      __dirname,
      '../../tmp/notificacoes'
    );

    fs.mkdirSync(pastaQr, { recursive: true });
    fs.mkdirSync(pastaTemp, { recursive: true });

    const tokenTemporario = crypto.randomUUID();

    const qrCodePath = path.join(
      pastaQr,
      `notif_${notificacao._id}_${tokenTemporario}.png`
    );

    const saidaPath = path.join(
      pastaTemp,
      `notificacao_${notificacao._id}_${tokenTemporario}.docx`
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
      // Cada geração usa um arquivo exclusivo para evitar colisões
      // quando várias notificações são emitidas ao mesmo tempo.
      saidaPath,

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
    const python = spawn(PYTHON_EXECUTABLE, [scriptPath], { cwd: path.resolve(__dirname, '../../') });

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

    let output = '';
    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { console.error('❌ Erro Python:', data.toString()); });

    python.on('close', (code) => {
      const limparTemporarios = () => {
        for (const arquivo of [saidaPath, qrCodePath]) {
          try {
            if (arquivo && fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
          } catch (cleanupErr) {
            console.warn('[PDF][NOTIFICACAO] Falha ao limpar temporário:', cleanupErr?.message || cleanupErr);
          }
        }
      };

      if (code !== 0) {
        console.error(`❌ Python finalizou com código ${code}`);
        limparTemporarios();
        return res.status(500).send('Erro ao gerar DOCX');
      }

      const docxPath = output.trim() || saidaPath;

      if (!fs.existsSync(docxPath)) {
        limparTemporarios();
        return res.status(500).send('Arquivo gerado não encontrado');
      }

      const filename = `notificacao_${aluno.nome.replace(/\s+/g, '_')}.docx`;

      res.download(docxPath, filename, (err) => {
        if (err) console.error('❌ Erro ao enviar o arquivo gerado:', err);
        limparTemporarios();
      });
    });
  } catch (err) {
    console.error('❌ Erro ao gerar notificação:', err);
    res.status(500).json({ error: 'Erro ao gerar notificação' });
  }
}


function nomeArquivoSeguro(valor) {
  return String(valor || 'aluno')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100) || 'aluno';
}

/**
 * Resolve uma imagem institucional para uso no PDF.
 * Aceita URL HTTP(S), data URL e caminhos locais do backend/public/uploads.
 * Falhas de imagem nunca impedem a geração do lote.
 */
async function resolverImagemPdf(valor) {
  const origem = String(valor || '').trim();
  if (!origem) return null;

  try {
    const dataMatch = origem.match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
    if (dataMatch) {
      return Buffer.from(dataMatch[1], 'base64');
    }

    if (/^https?:\/\//i.test(origem)) {
      const resposta = await fetch(origem, { signal: AbortSignal.timeout(10000) });
      if (!resposta.ok) return null;
      return Buffer.from(await resposta.arrayBuffer());
    }

    const backendRoot = path.resolve(__dirname, '../../');
    const candidatos = [];

    if (origem.startsWith('/uploads/')) {
      const relativo = origem.replace(/^\/uploads\//, '');
      candidatos.push(path.join(backendRoot, 'uploads', relativo));
      candidatos.push(path.join(backendRoot, 'public', 'uploads', relativo));
    } else if (origem.startsWith('uploads/')) {
      const relativo = origem.replace(/^uploads\//, '');
      candidatos.push(path.join(backendRoot, 'uploads', relativo));
      candidatos.push(path.join(backendRoot, 'public', 'uploads', relativo));
    }

    candidatos.push(path.join(backendRoot, origem.replace(/^\/+/, '')));
    candidatos.push(origem);

    for (const candidato of candidatos) {
      if (candidato && fs.existsSync(candidato)) return candidato;
    }
  } catch (err) {
    console.warn('[PDF][LOTE][IMAGEM] Falha ao resolver imagem:', err?.message || err);
  }

  return null;
}

function desenharImagemSegura(doc, imagem, x, y, largura, altura) {
  if (!imagem) return;
  try {
    doc.image(imagem, x, y, { fit: [largura, altura], align: 'center', valign: 'center' });
  } catch (err) {
    console.warn('[PDF][LOTE][IMAGEM] Imagem ignorada:', err?.message || err);
  }
}

function textoPdf(valor, fallback = '—') {
  const s = String(valor ?? '').trim();
  return s || fallback;
}

function desenharCabecalhoLotePdf(doc, identidade, imagens = {}) {
  const margem = 42;
  const larguraPagina = doc.page.width;
  const topo = 28;

  desenharImagemSegura(doc, imagens.esquerda, margem, topo, 58, 58);
  desenharImagemSegura(doc, imagens.direita, larguraPagina - margem - 58, topo, 58, 58);

  const centroX = margem + 72;
  const centroW = larguraPagina - ((margem + 72) * 2);

  doc
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(textoPdf(identidade?.orgaoSuperior, ''), centroX, topo + 2, {
      width: centroW,
      align: 'center'
    });

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(textoPdf(identidade?.nomeInstituicao, ''), centroX, topo + 17, {
      width: centroW,
      align: 'center'
    });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text(textoPdf(identidade?.subtitulo, ''), centroX, topo + 35, {
      width: centroW,
      align: 'center'
    });

  doc
    .moveTo(margem, 94)
    .lineTo(larguraPagina - margem, 94)
    .lineWidth(0.7)
    .strokeColor('#9aa4ad')
    .stroke();

  doc.y = 107;
}

function desenharRotuloValor(doc, rotulo, valor, opcoes = {}) {
  const x = opcoes.x ?? 48;
  const width = opcoes.width ?? (doc.page.width - 96);
  const rotuloWidth = opcoes.rotuloWidth ?? 120;
  const fontSize = opcoes.fontSize ?? 10;
  const y = opcoes.y ?? doc.y;

  doc
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .text(`${rotulo}:`, x, y, { width: rotuloWidth, continued: true });

  doc
    .font('Helvetica')
    .text(` ${textoPdf(valor)}`, { width: width - rotuloWidth });

  doc.moveDown(0.28);
}

function desenharCaixaTexto(doc, titulo, conteudo, opcoes = {}) {
  const x = opcoes.x ?? 48;
  const width = opcoes.width ?? (doc.page.width - 96);
  const padding = 8;
  const fontSize = opcoes.fontSize ?? 9.4;
  const texto = textoPdf(conteudo);

  doc.font('Helvetica').fontSize(fontSize);
  const alturaTexto = doc.heightOfString(texto, { width: width - (padding * 2) });
  const altura = Math.max(44, alturaTexto + 30);
  const y = doc.y;

  doc
    .roundedRect(x, y, width, altura, 4)
    .lineWidth(0.7)
    .strokeColor('#b8c0c7')
    .stroke();

  doc
    .fillColor('#243746')
    .font('Helvetica-Bold')
    .fontSize(9.2)
    .text(titulo, x + padding, y + 7, { width: width - (padding * 2) });

  doc
    .fillColor('#111111')
    .font('Helvetica')
    .fontSize(fontSize)
    .text(texto, x + padding, y + 21, { width: width - (padding * 2) });

  doc.y = y + altura + 8;
}

function desenharResumoComportamento(doc, { notaAnterior, variacao, notaAtual, comportamento }) {
  const x = 48;
  const y = doc.y;
  const width = doc.page.width - 96;
  const col = width / 4;
  const dados = [
    ['Nota anterior', notaAnterior],
    ['Alteração', variacao],
    ['Nota atual', notaAtual],
    ['Comportamento', comportamento]
  ];

  dados.forEach(([rotulo, valor], i) => {
    const cx = x + (col * i);
    doc
      .rect(cx, y, col, 44)
      .lineWidth(0.6)
      .strokeColor('#bac4cc')
      .stroke();

    doc
      .fillColor('#4a5965')
      .font('Helvetica-Bold')
      .fontSize(7.6)
      .text(rotulo, cx + 4, y + 7, { width: col - 8, align: 'center' });

    doc
      .fillColor('#111111')
      .font('Helvetica-Bold')
      .fontSize(i === 3 ? 8.2 : 10)
      .text(textoPdf(valor), cx + 4, y + 22, { width: col - 8, align: 'center' });
  });

  doc.y = y + 55;
}

async function montarDadosPdfLote({ req, notificacao, aluno, instituicao, identidade, config, regulamento, timezoneInstituicao }) {
  const notaAnteriorNum = Number(notificacao.notaAnterior);
  const valorNum = Number(notificacao.valorNumerico);
  const notaAtualSalva = Number(notificacao.notaAtual);

  const notaFinalNum = Number.isFinite(notaAtualSalva)
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

  const urlValidacao = `${req.protocol}://${req.get('host')}/verificar-documento.html?hash=${hashDocumento}`;
  const qrBuffer = await QRCode.toBuffer(urlValidacao, { width: 260, margin: 2 });

  const delta = Number.isFinite(valorNum) ? valorNum : 0;
  const natureza = String(notificacao.natureza || '').trim().toLowerCase() || (delta > 0 ? 'elogio' : 'indisciplina');
  const titulo = natureza === 'elogio' ? 'ELOGIO INDIVIDUAL' : 'NOTIFICAÇÃO DISCIPLINAR';

  const fraseResultado = natureza === 'elogio'
    ? `Este reconhecimento resultou em acréscimo de ${Math.abs(delta).toFixed(2)} pontos, enquadrando o(a) aluno(a) no comportamento ${classificacao}.`
    : `Esta ocorrência resultou em redução de ${Math.abs(delta).toFixed(2)} pontos, enquadrando o(a) aluno(a) no comportamento ${classificacao}.`;

  const fraseFinal = natureza === 'elogio'
    ? 'Parabenizamos pela postura e incentivamos a continuidade desse desempenho.'
    : 'Reforçamos a importância do cumprimento das normas institucionais.';

  return {
    titulo,
    numeroSequencial: notificacao.numeroSequencial || '',
    alunoNome: aluno.nome,
    turma: aluno.turma,
    regulamentoNome: regulamento?.nome || 'Regulamento Disciplinar',
    textoInstitucional: regulamento?.textos?.notificacao || '',
    descricaoInfracao,
    observacao: notificacao.observacao || '-',
    valorNumerico: Number.isFinite(valorNum) ? valorNum.toFixed(2) : '0.00',
    notaAnterior: Number.isFinite(notaAnteriorNum) ? notaAnteriorNum.toFixed(2) : '0.00',
    notaAtual: Number.isFinite(notaFinalNum) ? notaFinalNum.toFixed(2) : '',
    comportamento: classificacao,
    dataPorExtenso: formatarDataCalendarioExtenso(notificacao.data),
    dataBR: formatarDataCalendarioBR(notificacao.data),
    cidade: instituicao?.municipio || '—',
    estado: instituicao?.estado || '—',
    fraseResultado,
    fraseFinal,
    assinatura: {
      nome: req.actor?.nome || req.usuario?.nome || req.user?.nome || 'Usuário institucional',
      cargo: req.usuario?.cargo || req.usuario?.funcao || req.usuario?.tipo || 'Usuário institucional',
      data: formatarDataHoraRealBR(new Date(), timezoneInstituicao),
      hashDocumento,
      hashAssinatura,
      qrBuffer
    },
    identidade
  };
}

async function desenharNotificacaoNoPdf(doc, dados, imagens, indice, total) {
  desenharCabecalhoLotePdf(doc, dados.identidade, imagens);

  doc
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(dados.titulo, 48, doc.y, { width: doc.page.width - 96, align: 'center' });

  doc.moveDown(0.55);

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#5a6770')
    .text(`Notificação ${indice + 1} de ${total} • Nº ${textoPdf(dados.numeroSequencial, '—')}`, {
      align: 'center'
    });

  doc.moveDown(0.8);

  desenharRotuloValor(doc, 'Aluno(a)', dados.alunoNome);
  desenharRotuloValor(doc, 'Turma', dados.turma);
  desenharRotuloValor(doc, 'Data da ocorrência', dados.dataPorExtenso);
  desenharRotuloValor(doc, 'Regulamento', dados.regulamentoNome);

  if (dados.textoInstitucional) {
    doc
      .fillColor('#222222')
      .font('Helvetica')
      .fontSize(9.2)
      .text(dados.textoInstitucional, 48, doc.y + 2, {
        width: doc.page.width - 96,
        align: 'justify',
        lineGap: 1
      });
    doc.moveDown(0.7);
  }

  desenharCaixaTexto(doc, 'DESCRIÇÃO / ENQUADRAMENTO', dados.descricaoInfracao, { fontSize: 9.2 });
  desenharCaixaTexto(doc, 'OBSERVAÇÃO', dados.observacao, { fontSize: 9.2 });

  desenharResumoComportamento(doc, {
    notaAnterior: dados.notaAnterior,
    variacao: `${Number(dados.valorNumerico) > 0 ? '+' : ''}${dados.valorNumerico}`,
    notaAtual: dados.notaAtual,
    comportamento: dados.comportamento
  });

  doc
    .fillColor('#111111')
    .font('Helvetica')
    .fontSize(9.3)
    .text(dados.fraseResultado, 48, doc.y, {
      width: doc.page.width - 96,
      align: 'justify',
      lineGap: 1
    });

  doc.moveDown(0.45);

  doc
    .font('Helvetica')
    .fontSize(9.3)
    .text(dados.fraseFinal, 48, doc.y, {
      width: doc.page.width - 96,
      align: 'justify'
    });

  if (doc.y > 590) {
    doc.addPage();
    desenharCabecalhoLotePdf(doc, dados.identidade, imagens);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#333333')
      .text(`${dados.titulo} — continuação`, 48, doc.y, {
        width: doc.page.width - 96,
        align: 'center'
      });
    doc.moveDown(1);
  } else {
    doc.y = Math.max(doc.y + 12, 590);
  }

  const boxX = 48;
  const boxY = doc.y;
  const boxW = doc.page.width - 96;
  const boxH = 116;

  doc
    .roundedRect(boxX, boxY, boxW, boxH, 5)
    .fillAndStroke('#f5f8fa', '#bac4cc');

  doc
    .fillColor('#17212b')
    .font('Helvetica-Bold')
    .fontSize(9.4)
    .text('DOCUMENTO ASSINADO ELETRONICAMENTE', boxX + 10, boxY + 9, {
      width: boxW - 100,
      align: 'left'
    });

  const textoX = boxX + 10;
  const textoY = boxY + 28;
  const textoW = boxW - 100;

  doc
    .fillColor('#222222')
    .font('Helvetica')
    .fontSize(7.4)
    .text(`Assinado por: ${textoPdf(dados.assinatura.nome)}`, textoX, textoY, { width: textoW })
    .text(`Cargo/Função: ${textoPdf(dados.assinatura.cargo)}`, { width: textoW })
    .text(`Data da assinatura: ${textoPdf(dados.assinatura.data)}`, { width: textoW })
    .text(`Hash da assinatura: ${textoPdf(dados.assinatura.hashAssinatura)}`, { width: textoW })
    .text(`Hash do documento: ${textoPdf(dados.assinatura.hashDocumento)}`, { width: textoW })
    .text('A autenticidade deste documento pode ser verificada pelo QR Code ao lado.', { width: textoW });

  desenharImagemSegura(doc, dados.assinatura.qrBuffer, boxX + boxW - 82, boxY + 18, 68, 68);

  doc
    .fillColor('#4f5a62')
    .font('Helvetica')
    .fontSize(7)
    .text('Validar documento', boxX + boxW - 88, boxY + 90, {
      width: 80,
      align: 'center'
    });

  doc.y = boxY + boxH + 10;
}

async function gerarPdfLoteNotificacoes(req, notificacoes) {
  const instituicao = await Instituicao.findById(req.usuario.instituicao).lean();
  const identidade = await obterIdentidadeInstitucional(req);
  const config = await getConfigDisciplinar(req.usuario.instituicao);
  const regulamento = getTextoRegulamento(config);
  const timezoneInstituicao = instituicao?.timezone || 'America/Rio_Branco';

  const imagens = {
    esquerda: identidade?.mostrarBrasaoEsquerdo !== false
      ? await resolverImagemPdf(identidade?.brasaoEsquerdoUrl)
      : null,
    direita: identidade?.mostrarBrasaoDireito !== false
      ? await resolverImagemPdf(identidade?.brasaoDireitoUrl)
      : null
  };

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 28, left: 42, right: 42, bottom: 36 },
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: 'Notificações disciplinares em lote',
      Author: identidade?.nomeInstituicao || 'Axoriin'
    }
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finalizado = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (let i = 0; i < notificacoes.length; i += 1) {
    const notificacao = notificacoes[i];
    const aluno = notificacao.aluno;
    if (!aluno) continue;

    doc.addPage();

    const dados = await montarDadosPdfLote({
      req,
      notificacao,
      aluno,
      instituicao,
      identidade,
      config,
      regulamento,
      timezoneInstituicao
    });

    await desenharNotificacaoNoPdf(doc, dados, imagens, i, notificacoes.length);
  }

  const range = doc.bufferedPageRange();
  const rodape = String(identidade?.rodapePadrao || '').trim();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const largura = doc.page.width;
    const altura = doc.page.height;

    doc
      .moveTo(42, altura - 44)
      .lineTo(largura - 42, altura - 44)
      .lineWidth(0.45)
      .strokeColor('#c6ccd1')
      .stroke();

    if (identidade?.mostrarRodape !== false && rodape) {
      doc
        .fillColor('#59656e')
        .font('Helvetica')
        .fontSize(6.7)
        .text(rodape, 42, altura - 38, {
          width: largura - 150,
          height: 22,
          ellipsis: true
        });
    }

    doc
      .fillColor('#59656e')
      .font('Helvetica')
      .fontSize(7)
      .text(`Página ${i - range.start + 1} de ${range.count}`, largura - 120, altura - 38, {
        width: 78,
        align: 'right'
      });
  }

  doc.end();
  return finalizado;
}

/* ============ Rota: gerar PDF único de um lote ============ */
router.get('/pdf/lote/:loteId', autenticar, async (req, res) => {
  try {
    const loteId = String(req.params.loteId || '').trim();

    if (!loteId || loteId.length > 100) {
      return res.status(400).json({ error: 'Lote inválido.' });
    }

    const notificacoes = await Notificacao.find({
      instituicao: req.usuario.instituicao,
      loteId,
      modoRegistro: 'lote'
    })
      .populate('aluno')
      .sort({ loteIndice: 1, numeroSequencial: 1 });

    if (!notificacoes.length) {
      return res.status(404).json({ error: 'Lote de notificações não encontrado.' });
    }

    const validas = notificacoes.filter((item) => item?.aluno);

    if (!validas.length) {
      return res.status(500).json({ error: 'Nenhuma notificação válida pôde ser gerada para este lote.' });
    }

    const pdfBuffer = await gerarPdfLoteNotificacoes(req, validas);

    const dataRef = validas[0]?.data
      ? dateOnlyFromAny(validas[0].data)
      : dateOnlyFromAny(new Date());

    const dataNome = (dataRef || '').replace(/-/g, '') || 'lote';
    const nomeDownload = `notificacoes_${dataNome}_${loteId.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeDownload}"`
    );
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('Cache-Control', 'private, no-store');

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('❌ Erro ao gerar PDF do lote de notificações:', err);
    return res.status(500).json({ error: 'Erro ao gerar PDF do lote de notificações.' });
  }
});

router.get('/pdf/:id', autenticar, gerarDocxNotificacao);
router.post('/pdf/:id', autenticar, gerarDocxNotificacao);

module.exports = router;
