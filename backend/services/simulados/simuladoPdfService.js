'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { texto } = require('./simuladoAnaliseService');

const GERADOR_PDF = path.join(__dirname, '..', '..', 'pdf', 'gerar_relatorio_diagnostico.py');
const MIME_PDF = 'application/pdf';

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

function localizarPythonPdf() {
  const falhas = [];
  for (const candidato of candidatosPython()) {
    const teste = spawnSync(candidato.cmd, [
      ...candidato.pre,
      '-c',
      'import sys, reportlab; print(sys.executable)',
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    if (teste.status === 0) return candidato;
    falhas.push([candidato.cmd, ...candidato.pre].join(' '));
  }
  const error = new Error(
    'O gerador de PDF não está disponível. Execute “python -m pip install -r pdf/requirements.txt” e reinicie o Axoriin. ' +
    `Interpretadores testados: ${falhas.join(', ') || 'nenhum'}.`
  );
  error.codigo = 'PDF_INDISPONIVEL';
  throw error;
}

function executarGerador({ python, inputPath, outputPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(python.cmd, [
      ...python.pre,
      GERADOR_PDF,
      inputPath,
      outputPath,
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
    }, 2 * 60 * 1000);
    child.stdout.on('data', (chunk) => { if (stdout.length < 100_000) stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 300_000) stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('A geração do PDF ultrapassou dois minutos. Tente novamente ou filtre uma turma.'));
      if (code !== 0) return reject(new Error(texto(stderr || stdout || `O gerador PDF terminou com código ${code}.`).slice(0, 2500)));
      return resolve();
    });
  });
}

async function gerarPdfComModo({ simulado, dashboard, resultados = [], comparacao = null, turma = '', modoRelatorio = 'geral' }) {
  const python = localizarPythonPdf();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoriin-simulado-pdf-'));
  const inputPath = path.join(tempDir, 'diagnostico.json');
  const outputPath = path.join(tempDir, 'diagnostico.pdf');
  const payload = {
    modoRelatorio,
    geradoEm: new Date().toISOString(),
    filtro: { turma: texto(turma) || 'Todas permitidas' },
    simulado,
    dashboard,
    resultados,
    comparacao,
  };
  try {
    await fs.writeFile(inputPath, JSON.stringify(payload), 'utf8');
    await executarGerador({ python, inputPath, outputPath });
    const buffer = await fs.readFile(outputPath);
    if (buffer.length < 1500 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('O relatório foi gerado, mas o arquivo PDF retornado é inválido.');
    }
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}

async function gerarRelatorioDiagnosticoPdf(args) {
  return gerarPdfComModo({ ...args, modoRelatorio: 'geral' });
}


async function gerarRelatorioVisualPdf(args) {
  return gerarPdfComModo({ ...args, modoRelatorio: 'visual' });
}

async function gerarRelatorioHabilidadesEnemPdf(args) {
  if (String(args?.simulado?.tipo || '').toLowerCase() !== 'enem') {
    const error = new Error('O relatório específico de habilidades está disponível somente para simulados ENEM.');
    error.codigo = 'RELATORIO_ENEM_INDISPONIVEL';
    throw error;
  }
  return gerarPdfComModo({ ...args, modoRelatorio: 'habilidades_enem' });
}

module.exports = {
  MIME_PDF,
  localizarPythonPdf,
  gerarRelatorioDiagnosticoPdf,
  gerarRelatorioVisualPdf,
  gerarRelatorioHabilidadesEnemPdf,
};
