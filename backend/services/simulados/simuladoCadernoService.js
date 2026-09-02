'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const { uploadBufferToS3 } = require('../s3');

const EXTRATOR = path.join(__dirname, '..', '..', 'pdf', 'extrair_caderno_simulado.py');
const MAX_CADERNO_BYTES = 120 * 1024 * 1024;
const MAX_RUNTIME_MS = Math.max(5, Math.min(90, Number(process.env.SIMULADOS_CADERNO_MAX_MINUTOS) || 30)) * 60 * 1000;

function texto(value) { return String(value ?? '').trim(); }

function awsConfigurado() {
  return Boolean(
    process.env.AWS_BUCKET_NAME &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

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

function localizarPython() {
  const testados = [];
  for (const candidato of candidatosPython()) {
    const teste = spawnSync(candidato.cmd, [
      ...candidato.pre,
      '-c',
      'import fitz,sys; print(sys.executable)',
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    if (teste.status === 0) return candidato;
    testados.push([candidato.cmd, ...candidato.pre].join(' '));
  }
  const error = new Error(`PyMuPDF não está disponível para indexar o caderno. Interpretadores testados: ${testados.join(', ') || 'nenhum'}.`);
  error.codigo = 'CADERNO_PYTHON_INDISPONIVEL';
  throw error;
}

async function validarArquivoPdf(filePath, size = 0) {
  if (!filePath || !fsSync.existsSync(filePath)) throw new Error('Selecione o PDF do caderno de prova.');
  const stat = await fs.stat(filePath);
  const bytes = Number(size || stat.size || 0);
  if (!bytes) throw new Error('O PDF do caderno está vazio.');
  if (bytes > MAX_CADERNO_BYTES) throw new Error('O PDF do caderno ultrapassa 120 MB.');
  const fd = await fs.open(filePath, 'r');
  try {
    const assinatura = Buffer.alloc(5);
    await fd.read(assinatura, 0, 5, 0);
    if (assinatura.toString('ascii') !== '%PDF-') throw new Error('O arquivo enviado não possui uma assinatura PDF válida.');
  } finally {
    await fd.close();
  }
  return bytes;
}

async function sha256Arquivo(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function variantesEsperadas(questao) {
  const codigos = (questao?.variantes || []).map((v) => texto(v?.codigo).toUpperCase()).filter(Boolean);
  if (codigos.includes('INGLES') && codigos.includes('ESPANHOL')) return ['INGLES', 'ESPANHOL'];
  return ['PADRAO'];
}

function rangePaginas(inicio, fim) {
  const a = Number(inicio);
  const b = Math.max(a, Number(fim));
  return Array.from({ length: b - a + 1 }, (_item, index) => a + index);
}

function paginaMetaMap(paginas = []) {
  return new Map((paginas || []).map((p) => [Number(p.numero), p]));
}

function colunaMarcador(inicio, meta) {
  const largura = Number(meta?.pdfLargura || 595.3);
  return Number(inicio?.x || 0) < largura / 2 ? 0 : 1;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v || 0)));
}

function criarRecortesQuestao({ inicio, fim, paginas }) {
  if (!inicio?.pagina) return [];
  const metas = paginaMetaMap(paginas);
  const metaInicial = metas.get(Number(inicio.pagina));
  if (!metaInicial) return [];

  const colunaInicial = colunaMarcador(inicio, metaInicial);
  const inicioCelula = (Number(inicio.pagina) - 1) * 2 + colunaInicial;

  let fimCelula = null;
  let colunaFinal = null;
  if (fim?.pagina) {
    const metaFim = metas.get(Number(fim.pagina));
    if (metaFim) {
      colunaFinal = colunaMarcador(fim, metaFim);
      fimCelula = (Number(fim.pagina) - 1) * 2 + colunaFinal;
    }
  }

  const ultimaPagina = Math.max(...Array.from(metas.keys()).filter(Number.isFinite), Number(inicio.pagina));
  const ultimaCelula = (ultimaPagina - 1) * 2 + 1;
  const limiteCelula = fimCelula == null ? ultimaCelula : Math.max(inicioCelula, fimCelula);
  const recortes = [];

  for (let celula = inicioCelula; celula <= limiteCelula; celula += 1) {
    const pagina = Math.floor(celula / 2) + 1;
    const coluna = celula % 2;
    const meta = metas.get(pagina);
    if (!meta) continue;

    const largura = Number(meta.pdfLargura || 595.3);
    const altura = Number(meta.pdfAltura || 841.9);
    const divisao = largura / 2;
    const margemExt = Math.min(9, largura * 0.02);
    const margemCentro = Math.min(5, largura * 0.012);
    const corpoTopo = Math.max(0, Number(meta.corpoTopo || 8));
    const corpoFundo = Math.min(altura, Number(meta.corpoFundo || altura - 12));

    let x0 = coluna === 0 ? margemExt : divisao + margemCentro;
    let x1 = coluna === 0 ? divisao - margemCentro : largura - margemExt;
    let y0 = corpoTopo;
    let y1 = corpoFundo;

    if (celula === inicioCelula) y0 = Math.max(corpoTopo, Number(inicio.y || corpoTopo) - 8);
    if (fimCelula != null && celula === fimCelula) y1 = Math.min(corpoFundo, Number(fim.y || corpoFundo) - 8);

    if (y1 <= y0 + 8 || x1 <= x0 + 8) continue;

    recortes.push({
      pagina,
      coluna,
      x0: clamp01(x0 / largura),
      y0: clamp01(y0 / altura),
      x1: clamp01(x1 / largura),
      y1: clamp01(y1 / altura),
    });
  }

  return recortes;
}

function mapearQuestoes({ simulado, dia, marcadores, paginasTotal, paginas = [] }) {
  const questoesMatriz = (simulado?.questoes || [])
    .filter((q) => Number(q?.dia || 1) === Number(dia))
    .sort((a, b) => Number(a.numero) - Number(b.numero));
  if (!questoesMatriz.length) throw new Error(`A matriz não possui questões cadastradas para o dia ${dia}.`);

  const porNumero = new Map();
  (marcadores || []).forEach((m) => {
    const numero = Number(m?.numero);
    if (!Number.isInteger(numero) || numero < 1) return;
    if (!porNumero.has(numero)) porNumero.set(numero, []);
    porNumero.get(numero).push({
      numero,
      pagina: Number(m.pagina),
      x: Number(m.x || 0),
      y: Number(m.y || 0),
      x1: Number(m.x1 || 0),
      y1: Number(m.y1 || 0),
    });
  });
  porNumero.forEach((lista) => lista.sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x));

  const registros = [];
  const avisos = [];

  for (const questao of questoesMatriz) {
    const numero = Number(questao.numero);
    const marc = porNumero.get(numero) || [];
    const variantes = variantesEsperadas(questao);
    if (variantes.length === 2) {
      if (marc.length < 2) {
        avisos.push(`Questão ${numero}: eram esperadas as variantes Inglês e Espanhol, mas foram encontrados ${marc.length} marcador(es).`);
      }
      variantes.forEach((variante, index) => {
        const inicio = marc[index];
        if (!inicio) return;
        registros.push({
          codigoQuestao: texto(questao.codigo).toUpperCase(),
          numero,
          dia: Number(dia),
          variante,
          inicio,
        });
      });
    } else {
      const inicio = marc[0];
      if (!inicio) {
        avisos.push(`Questão ${numero}: cabeçalho não localizado no PDF.`);
        continue;
      }
      registros.push({
        codigoQuestao: texto(questao.codigo).toUpperCase(),
        numero,
        dia: Number(dia),
        variante: 'PADRAO',
        inicio,
      });
    }
  }

  const ingles = registros.filter((r) => r.variante === 'INGLES').sort((a,b) => a.numero-b.numero);
  const espanhol = registros.filter((r) => r.variante === 'ESPANHOL').sort((a,b) => a.numero-b.numero);
  const padrao = registros.filter((r) => r.variante === 'PADRAO').sort((a,b) => a.numero-b.numero);
  const sequencias = [ingles, espanhol, padrao].filter((seq) => seq.length);

  for (let si = 0; si < sequencias.length; si += 1) {
    const seq = sequencias[si];
    const proxSeq = sequencias[si + 1] || null;
    for (let i = 0; i < seq.length; i += 1) {
      const atual = seq[i];
      const prox = seq[i + 1] || proxSeq?.[0] || null;
      const paginaInicial = Math.max(1, Number(atual.inicio.pagina));
      const paginaFinal = prox
        ? Math.max(paginaInicial, Number(prox.inicio.pagina))
        : Math.max(paginaInicial, Number(paginasTotal));
      atual.paginaInicial = paginaInicial;
      atual.paginaFinal = paginaFinal;
      atual.paginas = rangePaginas(paginaInicial, paginaFinal);
      atual.recortes = criarRecortesQuestao({ inicio: atual.inicio, fim: prox?.inicio || null, paginas });
      delete atual.inicio;
    }
  }

  const semRecorte = registros.filter((r) => !(r.recortes || []).length);
  if (semRecorte.length) avisos.push(`${semRecorte.length} questão(ões) foram indexadas sem recorte preciso e exigem conferência.`);

  return {
    questoes: registros.sort((a,b) => a.numero-b.numero || a.variante.localeCompare(b.variante)),
    avisos,
    resumo: {
      paginasTotal: Number(paginasTotal || 0),
      questoesMapeadas: registros.length,
      variantesIngles: ingles.length,
      variantesEspanhol: espanhol.length,
      pendencias: avisos.length,
    },
  };
}

function executarExtrator({ pdfPath, jsonPath, pagesDir, onProgress }) {
  const python = localizarPython();
  return new Promise((resolve, reject) => {
    const child = spawn(python.cmd, [
      ...python.pre,
      EXTRATOR,
      pdfPath,
      jsonPath,
      pagesDir,
    ], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    let stdoutBuffer = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (_e) {}
    }, MAX_RUNTIME_MS);

    const processLine = (line) => {
      const clean = String(line || '').trim();
      if (!clean) return;
      try {
        const payload = JSON.parse(clean);
        if (payload?.tipo === 'progresso') onProgress?.(payload);
      } catch (_e) {}
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      lines.forEach(processLine);
    });
    child.stderr.on('data', (chunk) => { if (stderr.length < 200_000) stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', async (code) => {
      clearTimeout(timer);
      processLine(stdoutBuffer);
      if (timedOut) return reject(new Error('A indexação do caderno ultrapassou o tempo seguro e foi interrompida.'));
      if (code !== 0) return reject(new Error(texto(stderr || `O indexador terminou com código ${code}.`).slice(0, 2000)));
      try {
        const raw = await fs.readFile(jsonPath, 'utf8');
        return resolve(JSON.parse(raw));
      } catch (error) {
        return reject(new Error(`O indexador não retornou metadados válidos: ${error.message}`));
      }
    });
  });
}

async function processarCaderno({ pdfPath, nomeOriginal, mimeType, tamanhoBytes, hash, instituicaoId, simulado, dia, onProgress }) {
  if (!awsConfigurado()) {
    const error = new Error('O armazenamento S3 precisa estar configurado para publicar os cadernos no Portal do Aluno.');
    error.codigo = 'CADERNO_STORAGE_INDISPONIVEL';
    throw error;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoriin-caderno-'));
  const jsonPath = path.join(tempDir, 'indice.json');
  const pagesDir = path.join(tempDir, 'paginas');
  await fs.mkdir(pagesDir, { recursive: true });

  try {
    const extraido = await executarExtrator({ pdfPath, jsonPath, pagesDir, onProgress });
    const mapeado = mapearQuestoes({
      simulado,
      dia,
      marcadores: extraido.marcadores || [],
      paginasTotal: extraido.paginasTotal,
      paginas: extraido.paginas || [],
    });

    const baseKey = `simulados-cadernos/${String(instituicaoId)}/${String(simulado._id)}/dia-${dia}/${hash}`;
    onProgress?.({ etapa: 'enviando', paginasProcessadas: 0, paginasTotal: extraido.paginasTotal, percentual: 0 });

    const pdfBuffer = await fs.readFile(pdfPath);
    const pdfKey = `${baseKey}/caderno.pdf`;
    await uploadBufferToS3({ buffer: pdfBuffer, key: pdfKey, contentType: 'application/pdf' });

    const paginas = [];
    const paginasOriginais = extraido.paginas || [];
    for (let index = 0; index < paginasOriginais.length; index += 1) {
      const page = paginasOriginais[index];
      const pagePath = path.join(pagesDir, page.arquivo);
      const buffer = await fs.readFile(pagePath);
      const storageKey = `${baseKey}/paginas/${page.arquivo}`;
      await uploadBufferToS3({ buffer, key: storageKey, contentType: 'image/jpeg' });
      paginas.push({
        numero: Number(page.numero),
        storageKey,
        largura: Number(page.largura || 0),
        altura: Number(page.altura || 0),
      });
      onProgress?.({
        etapa: 'enviando',
        paginasProcessadas: index + 1,
        paginasTotal: paginasOriginais.length,
        percentual: paginasOriginais.length ? Math.round(((index + 1) / paginasOriginais.length) * 100) : 100,
      });
    }

    return {
      arquivo: {
        nomeOriginal: texto(nomeOriginal).slice(0,255),
        mimeType: texto(mimeType || 'application/pdf').slice(0,120),
        tamanhoBytes: Number(tamanhoBytes || pdfBuffer.length || 0),
        sha256: hash,
        storageProvider: 's3',
        storageKey: pdfKey,
      },
      paginas,
      questoes: mapeado.questoes,
      resumo: mapeado.resumo,
      avisos: mapeado.avisos,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}

async function limparUploadTemporario(filePath) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
}

module.exports = {
  MAX_CADERNO_BYTES,
  validarArquivoPdf,
  sha256Arquivo,
  processarCaderno,
  limparUploadTemporario,
  mapearQuestoes,
};
