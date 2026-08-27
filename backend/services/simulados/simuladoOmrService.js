'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const { texto, normalizarResposta } = require('./simuladoAnaliseService');

const EXTRATOR = path.join(__dirname, '..', '..', 'pdf', 'extrair_cartoes_simulado.py');
const MAX_PDF_BYTES = 120 * 1024 * 1024;

function candidatosPython() {
  const itens = [];
  const push = (cmd, pre = []) => {
    if (!cmd) return;
    const chave = `${cmd}|${pre.join(' ')}`;
    if (!itens.some((item) => item.chave === chave)) itens.push({ chave, cmd, pre });
  };
  if (process.env.VIRTUAL_ENV) {
    push(process.platform === 'win32'
      ? path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe')
      : path.join(process.env.VIRTUAL_ENV, 'bin', 'python'));
  }
  if (process.env.CONDA_PREFIX) {
    push(process.platform === 'win32'
      ? path.join(process.env.CONDA_PREFIX, 'python.exe')
      : path.join(process.env.CONDA_PREFIX, 'bin', 'python'));
  }
  if (process.platform === 'win32') {
    push('py', ['-3']);
    push('python');
    push('python3');
  } else {
    push('python3');
    push('python');
  }
  return itens;
}

function localizarPythonOmr() {
  const falhas = [];
  for (const candidato of candidatosPython()) {
    const teste = spawnSync(candidato.cmd, [
      ...candidato.pre,
      '-c',
      'import sys, fitz, cv2, numpy; print(sys.executable)',
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    if (teste.status === 0) {
      return { ...candidato, executable: String(teste.stdout || '').trim().split(/\r?\n/)[0] || candidato.cmd };
    }
    falhas.push([candidato.cmd, ...candidato.pre].join(' '));
  }
  const error = new Error(
    'O motor de leitura óptica não está instalado. Execute “python -m pip install -r pdf/requirements.txt” ' +
    `e reinicie o Axoriin. Interpretadores testados: ${falhas.join(', ') || 'nenhum'}.`
  );
  error.codigo = 'OMR_INDISPONIVEL';
  throw error;
}

function executarExtrator({ python, pdfPath, outputPath, dia }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python.cmd, [
      ...python.pre,
      EXTRATOR,
      pdfPath,
      outputPath,
      '--dia',
      String(dia),
    ], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 8 * 60 * 1000);
    child.stdout.on('data', (chunk) => { if (stdout.length < 200_000) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 1_000_000) stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', async (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('A leitura óptica ultrapassou oito minutos. Divida o PDF em partes menores.'));
      let raw = '';
      try { raw = await fs.readFile(outputPath, 'utf8'); } catch (_error) {}
      let payload = null;
      try { payload = JSON.parse(raw); } catch (_error) {}
      if (code !== 0 || payload?.erro) {
        return reject(new Error(texto(payload?.erro || stderr || stdout || `O leitor OMR terminou com código ${code}.`).slice(0, 2000)));
      }
      if (!payload || !Array.isArray(payload.cartoes)) {
        return reject(new Error('O leitor OMR executou, mas não retornou cartões válidos.'));
      }
      return resolve(payload);
    });
  });
}

function questoesDoDia(simulado, dia) {
  const questoes = (simulado?.questoes || [])
    .filter((item) => Number(item.dia || 1) === dia)
    .sort((a, b) => Number(a.numero) - Number(b.numero));
  const porNumero = new Map();
  for (const questao of questoes) {
    const numero = Number(questao.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 80) {
      throw new Error(`A questão ${texto(questao.codigo)} possui numeração incompatível com o cartão de 80 questões.`);
    }
    if (porNumero.has(numero)) throw new Error(`Há mais de uma questão com o número ${numero} no dia ${dia}.`);
    porNumero.set(numero, questao);
  }
  const ausentes = Array.from({ length: 80 }, (_item, index) => index + 1).filter((numero) => !porNumero.has(numero));
  if (ausentes.length) {
    throw new Error(`A matriz do dia ${dia} precisa conter as questões 1 a 80. Faltam: ${ausentes.slice(0, 15).join(', ')}${ausentes.length > 15 ? '…' : ''}.`);
  }
  return { questoes, porNumero };
}

function diaTemIdioma(questoes) {
  return questoes.some((questao) => (questao.variantes || [])
    .some((item) => ['INGLES', 'ESPANHOL'].includes(texto(item.codigo).toUpperCase())));
}

function mapearCartao(cartao, { turma, dia, porNumero, possuiIdioma }) {
  const respostas = {};
  const marcacoes = (cartao.marcacoes || []).map((item) => {
    const numero = Number(item.numero);
    const questao = porNumero.get(numero);
    const codigoQuestao = texto(questao?.codigo).toUpperCase();
    const normalizada = normalizarResposta(item.resposta);
    if (codigoQuestao && normalizada.informada) respostas[codigoQuestao] = normalizada.resposta || 'BRANCO';
    return {
      codigoQuestao,
      numero,
      status: ['marcada', 'branco', 'multipla', 'incerta'].includes(item.status) ? item.status : 'incerta',
      resposta: normalizada.informada ? (normalizada.resposta || 'BRANCO') : '',
      confianca: Math.max(0, Math.min(1, Number(item.confianca) || 0)),
      scores: Array.isArray(item.scores) ? item.scores.slice(0, 5).map((value) => Number(value) || 0) : [],
    };
  });
  const pendentesResposta = marcacoes.filter((item) => ['multipla', 'incerta'].includes(item.status)).length;
  const idiomaLido = texto(cartao.idioma?.idioma).toUpperCase();
  const idioma = possuiIdioma && ['INGLES', 'ESPANHOL'].includes(idiomaLido) ? idiomaLido : (possuiIdioma ? 'NAO_INFORMADO' : 'NAO_APLICAVEL');
  const avisos = [
    `Página ${Number(cartao.pagina)}: confira o estudante antes de processar.`,
    ...(Array.isArray(cartao.avisos) ? cartao.avisos.map((item) => texto(item).slice(0, 500)).filter(Boolean) : []),
  ];
  return {
    numeroLinha: Number(cartao.pagina),
    pagina: Number(cartao.pagina),
    dia,
    fonte: 'cartao_pdf',
    alunoIdInformado: '',
    codigoInformado: '',
    nomeInformado: `Cartão da página ${Number(cartao.pagina)}`,
    turmaInformada: turma,
    idiomaEstrangeiro: idioma,
    idiomaOrigem: idioma === 'NAO_INFORMADO' || idioma === 'NAO_APLICAVEL' ? 'nao_informado' : 'cartao',
    aluno: null,
    vinculoStatus: 'nao_localizado',
    candidatos: [],
    respostas,
    omr: {
      status: cartao.status === 'ilegivel' ? 'ilegivel' : (pendentesResposta ? 'revisao' : 'pronto'),
      revisaoObrigatoria: pendentesResposta > 0,
      revisada: false,
      geometriaConfianca: Math.max(0, Math.min(1, Number(cartao.geometriaConfianca) || 0)),
      circulosDetectados: Math.max(0, Number(cartao.circulosDetectados) || 0),
      respostasReconhecidas: marcacoes.filter((item) => item.status === 'marcada').length,
      brancosReconhecidos: marcacoes.filter((item) => item.status === 'branco').length,
      ambiguidades: pendentesResposta,
      idiomaConfianca: Math.max(0, Math.min(1, Number(cartao.idioma?.confianca) || 0)),
      marcacoes,
      previewCabecalho: texto(cartao.previewCabecalho),
      previewGrade: texto(cartao.previewGrade),
    },
    avisos: [...new Set(avisos)],
  };
}

async function analisarPdfCartoes({ arquivo, simulado, turma, dia }) {
  if (!arquivo?.buffer?.length) throw new Error('Selecione o PDF escaneado dos cartões-resposta.');
  if (arquivo.buffer.length > MAX_PDF_BYTES) throw new Error('O PDF ultrapassa 120 MB. Divida-o por turma ou em partes menores.');
  if (arquivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('O arquivo não possui uma assinatura PDF válida.');
  const numeroDia = Number(dia);
  if (![1, 2].includes(numeroDia)) throw new Error('Selecione o dia 1 ou o dia 2 do cartão-resposta.');
  const turmaLimpa = texto(turma).slice(0, 100);
  if (!turmaLimpa) throw new Error('Selecione a turma dos cartões deste PDF.');
  const { questoes, porNumero } = questoesDoDia(simulado, numeroDia);
  const possuiIdioma = diaTemIdioma(questoes);
  const python = localizarPythonOmr();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoriin-simulado-omr-'));
  const pdfPath = path.join(tempDir, 'cartoes.pdf');
  const outputPath = path.join(tempDir, 'resultado.json');
  try {
    await fs.writeFile(pdfPath, arquivo.buffer);
    const extraido = await executarExtrator({ python, pdfPath, outputPath, dia: numeroDia });
    if (!extraido.cartoes.length) throw new Error('Nenhum cartão foi encontrado no PDF.');
    const linhas = extraido.cartoes.map((cartao) => mapearCartao(cartao, {
      turma: turmaLimpa,
      dia: numeroDia,
      porNumero,
      possuiIdioma,
    }));
    return {
      linhas,
      avisos: [
        'O PDF original não é armazenado. Revise os cartões sinalizados antes da confirmação.',
        'A vinculação ao aluno é sempre conferida; o Axoriin não usa caligrafia incerta para atribuir nota.',
      ],
      resumoOmr: extraido.resumo || {},
      dia: numeroDia,
      turma: turmaLimpa,
      possuiIdioma,
      motor: texto(extraido.motor),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}

module.exports = {
  MAX_PDF_BYTES,
  localizarPythonOmr,
  questoesDoDia,
  diaTemIdioma,
  analisarPdfCartoes,
};
