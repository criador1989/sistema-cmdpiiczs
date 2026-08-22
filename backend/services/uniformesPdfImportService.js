'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const UniformeFornecedor = require('../models/UniformeFornecedor');
const UniformeCampanha = require('../models/UniformeCampanha');
const UniformeItem = require('../models/UniformeItem');
const UniformeVoucher = require('../models/UniformeVoucher');
const UniformeImportacao = require('../models/UniformeImportacao');

const EXTRATOR = path.join(__dirname, '..', 'pdf', 'extrair_vouchers_uniformes.py');

function texto(value, max = 5000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizar(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°ª]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizarNome(value) {
  return normalizar(value);
}

function normalizarFornecedor(value) {
  const tokensIgnorados = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a']);
  return normalizar(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => !tokensIgnorados.has(token))
    .join(' ');
}

function normalizarTurma(value) {
  let t = normalizar(value)
    .replace(/\b(matutino|vespertino|noturno|manha|tarde|noite|integral)\b/g, ' ')
    .replace(/\b(ensino|fundamental|medio|serie|ano|turma)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Casos usuais: "2 B", "6 A", "2a B" após remoção de ordinal.
  const compacto = t.replace(/\s+/g, '');
  let match = compacto.match(/^(\d{1,2})([a-z])$/i);
  if (match) return `${Number(match[1])}${match[2].toLowerCase()}`;

  match = t.match(/\b(\d{1,2})\b(?:\s+[a-z])?\s+\b([a-z])\b/i);
  if (match) return `${Number(match[1])}${match[2].toLowerCase()}`;

  match = t.match(/\b(\d{1,2})\s*([a-z])\b/i);
  if (match) return `${Number(match[1])}${match[2].toLowerCase()}`;

  const numero = t.match(/\b(\d{1,2})\b/);
  const letra = t.match(/\b([a-z])\b/i);
  if (numero && letra) return `${Number(numero[1])}${letra[1].toLowerCase()}`;
  return t.replace(/[^a-z0-9]/g, '');
}

function dataOuNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function candidatosPython() {
  const lista = [];
  const push = (cmd, pre = [], origem = '') => {
    if (!cmd) return;
    const key = `${cmd}|${pre.join(' ')}`;
    if (!lista.some(x => x.key === key)) lista.push({ key, cmd, pre, origem });
  };

  if (process.env.VIRTUAL_ENV) {
    push(
      process.platform === 'win32'
        ? path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe')
        : path.join(process.env.VIRTUAL_ENV, 'bin', 'python'),
      [],
      'VIRTUAL_ENV'
    );
  }
  if (process.env.CONDA_PREFIX) {
    push(
      process.platform === 'win32'
        ? path.join(process.env.CONDA_PREFIX, 'python.exe')
        : path.join(process.env.CONDA_PREFIX, 'bin', 'python'),
      [],
      'CONDA_PREFIX'
    );
  }

  if (process.platform === 'win32') {
    // O launcher `py` e o comando `python` podem apontar para instalações diferentes.
    // Por isso cada candidato é testado já com `import fitz`, e não apenas pela versão.
    push('py', ['-3'], 'Python Launcher');
    push('python', [], 'PATH');
    push('python3', [], 'PATH');
  } else {
    push('python3', [], 'PATH');
    push('python', [], 'PATH');
  }
  return lista;
}

function findPythonComPyMuPDF() {
  const diagnostico = [];
  for (const candidato of candidatosPython()) {
    const r = spawnSync(
      candidato.cmd,
      [...candidato.pre, '-c', 'import sys, fitz; print(sys.executable); print(getattr(fitz, "__version__", "ok"))'],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      }
    );
    if (r.status === 0) {
      const linhas = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
      return {
        cmd: candidato.cmd,
        pre: candidato.pre,
        origem: candidato.origem,
        executable: linhas[0] || candidato.cmd,
        pymupdf: linhas[1] || 'ok',
        diagnostico,
      };
    }
    diagnostico.push({
      comando: [candidato.cmd, ...candidato.pre].join(' '),
      erro: String(r.stderr || r.error?.message || r.stdout || 'indisponível').trim().slice(0, 700),
    });
  }
  return { cmd: null, pre: [], diagnostico };
}

function exigirPythonComPyMuPDF() {
  const python = findPythonComPyMuPDF();
  if (python?.cmd) return python;
  const testados = (python?.diagnostico || []).map(x => x.comando).filter(Boolean).join(', ') || 'nenhum';
  const err = new Error(
    `Não foi localizado um interpretador Python com PyMuPDF (fitz). Comandos testados: ${testados}. ` +
    'No PowerShell, execute: py -3 -m pip install --upgrade pymupdf  (ou python -m pip install --upgrade pymupdf) e reinicie o Axoriin.'
  );
  err.codigo = 'PYMUPDF_INDISPONIVEL';
  err.diagnostico = python?.diagnostico || [];
  throw err;
}

function tentarParseJson(raw) {
  const textoRaw = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!textoRaw) return null;

  try { return JSON.parse(textoRaw); } catch (_error) {}

  // Fallback para ambientes Windows em que alguma biblioteca/launcher escreva
  // avisos no stdout antes/depois do JSON. O canal principal da V1.2.2 é um
  // arquivo JSON temporário, mas esta recuperação mantém compatibilidade.
  const linhas = textoRaw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i -= 1) {
    const linha = linhas[i];
    if (!linha.startsWith('{') || !linha.endsWith('}')) continue;
    try { return JSON.parse(linha); } catch (_error) {}
  }

  const inicio = textoRaw.indexOf('{');
  const fim = textoRaw.lastIndexOf('}');
  if (inicio >= 0 && fim > inicio) {
    try { return JSON.parse(textoRaw.slice(inicio, fim + 1)); } catch (_error) {}
  }
  return null;
}

function executarExtrator(python, pdfPath) {
  return new Promise((resolve, reject) => {
    const saidaJson = path.join(
      os.tmpdir(),
      `axoriin_uniformes_${process.pid}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.json`
    );

    const finalizar = async () => {
      try { await fs.unlink(saidaJson); } catch (_error) {}
    };

    const child = spawn(python.cmd, [...python.pre, EXTRATOR, pdfPath, saidaJson], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';
    let bytes = 0;
    const limite = 30 * 1024 * 1024;
    let encerradoPorLimite = false;

    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limite && !encerradoPorLimite) {
        encerradoPorLimite = true;
        child.kill();
        return;
      }
      if (stdout.length < limite) stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', chunk => {
      if (stderr.length < 2_000_000) stderr += chunk.toString('utf8');
    });

    child.on('error', async error => {
      await finalizar();
      reject(error);
    });

    child.on('close', async code => {
      if (encerradoPorLimite) {
        await finalizar();
        return reject(new Error('A extração do PDF produziu dados demais. Divida o arquivo antes de importar.'));
      }

      let rawArquivo = '';
      try {
        rawArquivo = await fs.readFile(saidaJson, 'utf8');
      } catch (_error) {}

      const payload = tentarParseJson(rawArquivo) || tentarParseJson(stdout);
      await finalizar();

      if (code !== 0 || payload?.erro) {
        const detalhe = payload?.erro || stderr.trim() || stdout.trim() || `O extrator de vouchers terminou com código ${code}.`;
        return reject(new Error(detalhe));
      }

      if (!payload || !Array.isArray(payload.vouchers)) {
        const stdoutResumo = texto(stdout, 900);
        const stderrResumo = texto(stderr, 900);
        const err = new Error(
          'O extrator executou, mas o retorno JSON não pôde ser interpretado. ' +
          `Python: ${python.executable || python.cmd}. ` +
          `Saída JSON temporária: ${rawArquivo ? 'gerada' : 'não gerada'}. ` +
          (stderrResumo ? `stderr: ${stderrResumo}` : '') +
          (!stderrResumo && stdoutResumo ? `stdout: ${stdoutResumo}` : '')
        );
        err.codigo = 'EXTRATOR_JSON_INVALIDO';
        return reject(err);
      }

      return resolve(payload);
    });
  });
}

function statusRegistro({ erros, duplicado, aluno, fornecedor, item }) {
  if (Array.isArray(erros) && erros.length) return 'incompleto';
  if (duplicado) return 'duplicado';
  if (!aluno) return 'revisar_aluno';
  if (!fornecedor) return 'novo_fornecedor';
  if (!item) return 'novo_item';
  return 'pronto';
}

function flagsRegistro({ erros, duplicado, aluno, fornecedor, item }) {
  const flags = [];
  if (Array.isArray(erros) && erros.length) flags.push('extracao_incompleta');
  if (duplicado) flags.push('voucher_duplicado');
  if (!aluno) flags.push('aluno_nao_localizado');
  if (!fornecedor) flags.push('fornecedor_novo');
  if (!item) flags.push('item_novo');
  return flags;
}

function resumir(importacao) {
  const registros = importacao.registros || [];
  const estudantes = new Set(registros.map(r => normalizarNome(r.alunoImportado)).filter(Boolean));
  const fornecedores = new Set(registros.map(r => normalizarFornecedor(r.fornecedorImportado)).filter(Boolean));
  const itens = new Set(registros.map(r => `${normalizarFornecedor(r.fornecedorImportado)}|${texto(r.itemCodigo, 80)}`).filter(Boolean));
  const fornecedoresNovos = new Set(registros.filter(r => !r.fornecedor && r.fornecedorImportado).map(r => normalizarFornecedor(r.fornecedorImportado)));
  const itensNovos = new Set(registros.filter(r => !r.item && r.itemCodigo).map(r => `${normalizarFornecedor(r.fornecedorImportado)}|${texto(r.itemCodigo, 80)}`));
  const importados = registros.filter(r => r.situacao === 'importado').length;
  const duplicados = registros.filter(r => r.duplicado || r.situacao === 'duplicado').length;
  const prontos = registros.filter(r => r.situacao === 'pronto').length;
  const pendentes = registros.filter(r => ['novo_fornecedor', 'novo_item', 'revisar_aluno', 'incompleto', 'erro'].includes(r.situacao)).length;
  return {
    detectados: registros.length,
    prontos,
    importados,
    duplicados,
    pendentes,
    alunos: estudantes.size,
    fornecedores: fornecedores.size,
    fornecedoresNovos: fornecedoresNovos.size,
    itens: itens.size,
    itensNovos: itensNovos.size,
  };
}

function serializarImportacao(doc, { registros = true } = {}) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (!registros) delete obj.registros;
  return obj;
}

async function analisarPdfUniformes({ arquivo, instituicaoId, campanhaId, usuarioId }) {
  if (!arquivo?.buffer?.length) throw new Error('Selecione um PDF de vouchers.');
  const nome = texto(arquivo.originalname, 255);
  if (!nome.toLowerCase().endsWith('.pdf') && arquivo.mimetype !== 'application/pdf') {
    throw new Error('A importação de vouchers aceita somente PDF.');
  }
  if (arquivo.buffer.length > 120 * 1024 * 1024) throw new Error('O PDF excede 120 MB. Divida o arquivo em partes menores.');
  if (arquivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('O arquivo enviado não possui assinatura PDF válida.');

  const campanha = await UniformeCampanha.findOne({ _id: campanhaId, instituicao: instituicaoId });
  if (!campanha) throw new Error('Campanha não encontrada nesta instituição.');

  const sha256 = crypto.createHash('sha256').update(arquivo.buffer).digest('hex').toUpperCase();
  const anterior = await UniformeImportacao.findOne({
    instituicao: instituicaoId,
    campanha: campanha._id,
    'arquivo.sha256': sha256,
    status: { $ne: 'cancelado' },
  }).sort({ createdAt: -1 });
  if (anterior) {
    return { importacao: anterior, reutilizada: true, aviso: 'Este mesmo PDF já foi analisado para esta campanha. A análise anterior foi reaberta.' };
  }

  const python = exigirPythonComPyMuPDF();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoriin-uniformes-pdf-'));
  const pdfPath = path.join(tempDir, 'vouchers.pdf');

  try {
    await fs.writeFile(pdfPath, arquivo.buffer);
    const extraido = await executarExtrator(python, pdfPath);
    if (!extraido.vouchers.length) throw new Error('Nenhum voucher foi reconhecido no PDF. Confirme se o arquivo é digital e segue o modelo de vouchers da SEE.');
    if (extraido.vouchers.length > 3000) throw new Error('Foram detectados mais de 3.000 vouchers. Divida a importação em arquivos menores.');

    const [alunos, fornecedores, itens, codigosExistentes] = await Promise.all([
      Aluno.find({ instituicao: instituicaoId }).select('_id nome turma codigoAcesso').lean(),
      UniformeFornecedor.find({ instituicao: instituicaoId }).select('_id nome razaoSocial nomeFantasia').lean(),
      UniformeItem.find({ instituicao: instituicaoId, campanha: campanha._id }).select('_id fornecedor codigoExterno nome').lean(),
      UniformeVoucher.find({ instituicao: instituicaoId, codigo: { $in: extraido.vouchers.map(v => texto(v.codigo, 120).toUpperCase()).filter(Boolean) } }).select('_id codigo').lean(),
    ]);

    const alunosPorChave = new Map();
    const alunosPorNome = new Map();
    for (const aluno of alunos) {
      const nomeN = normalizarNome(aluno.nome);
      const turmaN = normalizarTurma(aluno.turma);
      const chave = `${nomeN}|${turmaN}`;
      if (!alunosPorChave.has(chave)) alunosPorChave.set(chave, []);
      alunosPorChave.get(chave).push(aluno);
      if (!alunosPorNome.has(nomeN)) alunosPorNome.set(nomeN, []);
      alunosPorNome.get(nomeN).push(aluno);
    }

    const fornecedoresPorNome = new Map();
    for (const f of fornecedores) {
      [f.nome, f.razaoSocial, f.nomeFantasia].filter(Boolean).forEach(nomeF => {
        const key = normalizarFornecedor(nomeF);
        if (key && !fornecedoresPorNome.has(key)) fornecedoresPorNome.set(key, f);
      });
    }

    const itensPorChave = new Map();
    const itensGenericosPorCodigo = new Map();
    for (const item of itens) {
      const key = `${String(item.fornecedor || '')}|${texto(item.codigoExterno, 80).toLowerCase()}`;
      if (!itensPorChave.has(key)) itensPorChave.set(key, item);
      if (!item.fornecedor && item.codigoExterno) itensGenericosPorCodigo.set(texto(item.codigoExterno, 80).toLowerCase(), item);
    }

    const existentes = new Map(codigosExistentes.map(v => [String(v.codigo).toUpperCase(), v]));
    const codigosNoArquivo = new Set();
    const registros = extraido.vouchers.map(v => {
      const avisos = [];
      const erros = Array.isArray(v.errosExtracao) ? v.errosExtracao.map(e => texto(e, 500)) : [];
      const codigo = texto(v.codigo, 120).toUpperCase();
      const nomeN = normalizarNome(v.aluno);
      const turmaN = normalizarTurma(v.turma);
      const candidatosExatos = alunosPorChave.get(`${nomeN}|${turmaN}`) || [];
      const candidatosNome = alunosPorNome.get(nomeN) || [];
      let aluno = null;
      if (candidatosExatos.length === 1) {
        aluno = candidatosExatos[0];
      } else if (candidatosExatos.length > 1) {
        avisos.push('Há mais de um aluno com o mesmo nome e turma no Axoriin; o vínculo precisa ser revisado.');
      } else if (candidatosNome.length === 1) {
        avisos.push(`O nome existe no Axoriin, mas a turma do PDF (${texto(v.turma, 120)}) difere do cadastro (${texto(candidatosNome[0].turma, 120)}). Confirme o aluno antes de importar.`);
      }

      const fornecedor = fornecedoresPorNome.get(normalizarFornecedor(v.fornecedor)) || null;
      const itemCodigo = texto(v.itemCodigo, 80);
      const item = fornecedor
        ? (itensPorChave.get(`${String(fornecedor._id)}|${itemCodigo.toLowerCase()}`) || itensGenericosPorCodigo.get(itemCodigo.toLowerCase()) || null)
        : null;

      const existente = existentes.get(codigo) || null;
      const duplicadoInterno = codigo && codigosNoArquivo.has(codigo);
      if (codigo) codigosNoArquivo.add(codigo);
      if (duplicadoInterno) avisos.push('O mesmo código aparece mais de uma vez dentro deste PDF.');
      const duplicado = Boolean(existente || duplicadoInterno);

      const base = {
        pagina: Number(v.pagina) || 1,
        ordemNaPagina: Number(v.ordemNaPagina) || 1,
        codigo,
        alunoImportado: texto(v.aluno, 220),
        turmaImportada: texto(v.turma, 160),
        turnoImportado: texto(v.turno, 40),
        aluno: aluno?._id || null,
        alunoNomeSistema: aluno?.nome || '',
        turmaSistema: aluno?.turma || '',
        fornecedorImportado: texto(v.fornecedor, 220),
        enderecoFornecedorImportado: texto(v.enderecoFornecedor, 500),
        fornecedor: fornecedor?._id || null,
        itemCodigo,
        itemNomeSugerido: texto(v.itemNomeSugerido || `Item ${itemCodigo}`, 220),
        itemDescricao: texto(v.descricao, 5000),
        item: item?._id || null,
        genero: ['masculino', 'feminino', 'unissex', 'nao_aplicavel'].includes(v.genero) ? v.genero : 'nao_aplicavel',
        etapa: texto(v.etapa, 120),
        quantidadePecas: Math.max(1, Math.min(100, Number(v.quantidadePecas) || 1)),
        lote: texto(v.lote, 120),
        emitidoEm: dataOuNull(v.geradoEm),
        validade: dataOuNull(v.validade),
        criadoPorOrigem: texto(v.criadoPor, 220),
        instituicaoOrigem: texto(v.instituicaoOrigem, 300),
        duplicado,
        voucherExistente: existente?._id || null,
        erros,
        avisos,
      };
      base.flags = flagsRegistro({ erros, duplicado, aluno: base.aluno, fornecedor: base.fornecedor, item: base.item });
      base.situacao = statusRegistro({ erros, duplicado, aluno: base.aluno, fornecedor: base.fornecedor, item: base.item });
      return base;
    });

    const avisos = [];
    if ((extraido.paginasSemTexto || []).length) avisos.push(`Páginas sem texto detectável: ${(extraido.paginasSemTexto || []).join(', ')}.`);
    if ((extraido.duplicadosNoArquivo || []).length) avisos.push(`${extraido.duplicadosNoArquivo.length} código(s) repetido(s) no próprio PDF.`);

    const importacao = new UniformeImportacao({
      instituicao: instituicaoId,
      tenantId: instituicaoId,
      campanha: campanha._id,
      arquivo: { nome, tamanho: arquivo.buffer.length, sha256, paginas: Number(extraido.paginas) || 0 },
      status: 'analisado',
      avisos,
      registros,
      criadoPor: usuarioId || null,
    });
    importacao.totais = resumir(importacao);
    await importacao.save();
    return { importacao, reutilizada: false };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function atualizarVinculoAluno({ importacao, registroId, alunoId, instituicaoId }) {
  const registro = importacao.registros.id(registroId);
  if (!registro) throw new Error('Registro da importação não encontrado.');
  if (!mongoose.Types.ObjectId.isValid(String(alunoId || ''))) throw new Error('Aluno inválido.');
  const aluno = await Aluno.findOne({ _id: alunoId, instituicao: instituicaoId }).select('_id nome turma');
  if (!aluno) throw new Error('Aluno não encontrado nesta instituição.');
  registro.aluno = aluno._id;
  registro.alunoNomeSistema = aluno.nome;
  registro.turmaSistema = aluno.turma;
  registro.avisos = (registro.avisos || []).filter(a => !String(a).includes('vínculo') && !String(a).includes('turma do PDF'));
  registro.flags = flagsRegistro({ erros: registro.erros, duplicado: registro.duplicado, aluno: registro.aluno, fornecedor: registro.fornecedor, item: registro.item });
  registro.situacao = statusRegistro({ erros: registro.erros, duplicado: registro.duplicado, aluno: registro.aluno, fornecedor: registro.fornecedor, item: registro.item });
  importacao.totais = resumir(importacao);
  await importacao.save();
  return registro;
}

async function importarAnalise({ importacao, instituicaoId, usuarioId, criarFornecedores = true, criarItens = true }) {
  if (!importacao || String(importacao.instituicao) !== String(instituicaoId)) throw new Error('Importação inválida para esta instituição.');
  if (importacao.status === 'cancelado') throw new Error('Esta importação foi cancelada.');

  const campanha = await UniformeCampanha.findOne({ _id: importacao.campanha, instituicao: instituicaoId });
  if (!campanha) throw new Error('Campanha da importação não foi encontrada.');

  const [fornecedoresAtuais, itensAtuais] = await Promise.all([
    UniformeFornecedor.find({ instituicao: instituicaoId }),
    UniformeItem.find({ instituicao: instituicaoId, campanha: campanha._id }),
  ]);
  const fornecedoresCache = new Map();
  for (const f of fornecedoresAtuais) {
    [f.nome, f.razaoSocial, f.nomeFantasia].filter(Boolean).forEach(valor => {
      const chave = normalizarFornecedor(valor);
      if (chave && !fornecedoresCache.has(chave)) fornecedoresCache.set(chave, f);
    });
  }
  const itensCache = new Map();
  const itensGenericos = new Map();
  for (const itemAtual of itensAtuais) {
    const codigoAtual = texto(itemAtual.codigoExterno, 80).toLowerCase();
    if (itemAtual.fornecedor) itensCache.set(`${String(itemAtual.fornecedor)}|${codigoAtual}`, itemAtual);
    else if (codigoAtual) itensGenericos.set(codigoAtual, itemAtual);
  }
  const resultados = [];

  for (const registro of importacao.registros) {
    if (registro.situacao === 'importado' && registro.voucherCriado) {
      resultados.push({ ok: true, codigo: registro.codigo, ignorado: true, motivo: 'Já importado anteriormente.' });
      continue;
    }
    if (!registro.codigo || (registro.erros || []).length) {
      registro.situacao = 'incompleto';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Dados incompletos no PDF.' });
      continue;
    }
    const existente = await UniformeVoucher.findOne({ instituicao: instituicaoId, codigo: registro.codigo }).select('_id codigo');
    if (existente) {
      registro.duplicado = true;
      registro.voucherExistente = existente._id;
      registro.situacao = 'duplicado';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Voucher já existe no Axoriin.' });
      continue;
    }
    if (!registro.aluno) {
      registro.situacao = 'revisar_aluno';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Aluno não localizado.' });
      continue;
    }
    const aluno = await Aluno.findOne({ _id: registro.aluno, instituicao: instituicaoId }).select('_id nome turma');
    if (!aluno) {
      registro.aluno = null;
      registro.situacao = 'revisar_aluno';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Aluno vinculado não existe mais.' });
      continue;
    }

    let fornecedor = null;
    if (registro.fornecedor) {
      fornecedor = await UniformeFornecedor.findOne({ _id: registro.fornecedor, instituicao: instituicaoId });
    }
    if (!fornecedor) {
      const chaveFornecedor = normalizarFornecedor(registro.fornecedorImportado);
      fornecedor = fornecedoresCache.get(chaveFornecedor) || null;
      if (!fornecedor && criarFornecedores) {
        fornecedor = await UniformeFornecedor.create({
          instituicao: instituicaoId,
          tenantId: instituicaoId,
          nome: registro.fornecedorImportado,
          razaoSocial: registro.fornecedorImportado,
          observacoes: registro.enderecoFornecedorImportado ? `Endereço identificado no voucher: ${registro.enderecoFornecedorImportado}` : 'Fornecedor criado automaticamente a partir de PDF de vouchers.',
          ativo: true,
          criadoPor: usuarioId || null,
          atualizadoPor: usuarioId || null,
        });
        await UniformeCampanha.updateOne({ _id: campanha._id, instituicao: instituicaoId }, { $addToSet: { fornecedores: fornecedor._id } });
      }
      if (fornecedor) fornecedoresCache.set(chaveFornecedor, fornecedor);
    }
    if (!fornecedor) {
      registro.situacao = 'novo_fornecedor';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Fornecedor novo aguardando cadastro.' });
      continue;
    }
    registro.fornecedor = fornecedor._id;

    let item = null;
    if (registro.item) item = await UniformeItem.findOne({ _id: registro.item, instituicao: instituicaoId, campanha: campanha._id });
    const chaveItem = `${String(fornecedor._id)}|${String(registro.itemCodigo || '').toLowerCase()}`;
    if (!item) {
      item = itensCache.get(chaveItem) || itensGenericos.get(String(registro.itemCodigo || '').toLowerCase()) || null;
      if (!item && criarItens) {
        item = await UniformeItem.create({
          instituicao: instituicaoId,
          tenantId: instituicaoId,
          campanha: campanha._id,
          fornecedor: fornecedor._id,
          codigoExterno: registro.itemCodigo,
          nome: registro.itemNomeSugerido || `Item ${registro.itemCodigo}`,
          descricao: registro.itemDescricao || '',
          categoria: 'uniforme',
          genero: ['masculino', 'feminino', 'unissex', 'nao_aplicavel'].includes(registro.genero) ? registro.genero : 'nao_aplicavel',
          etapa: registro.etapa || '',
          quantidadePecas: Math.max(1, Number(registro.quantidadePecas) || 1),
          ativo: true,
          criadoPor: usuarioId || null,
          atualizadoPor: usuarioId || null,
        });
      }
      if (item) itensCache.set(chaveItem, item);
    }
    if (!item) {
      registro.situacao = 'novo_item';
      resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Item novo aguardando cadastro.' });
      continue;
    }
    registro.item = item._id;

    try {
      const voucher = await UniformeVoucher.create({
        instituicao: instituicaoId,
        tenantId: instituicaoId,
        campanha: campanha._id,
        aluno: aluno._id,
        alunoNomeSnapshot: aluno.nome,
        turmaSnapshot: aluno.turma,
        codigo: registro.codigo,
        fornecedor: fornecedor._id,
        item: item._id,
        itemCodigoSnapshot: item.codigoExterno || registro.itemCodigo || '',
        itemNomeSnapshot: item.nome,
        quantidade: 1,
        lote: registro.lote || '',
        validade: registro.validade || null,
        emitidoEm: registro.emitidoEm || null,
        origem: 'pdf',
        status: 'validado',
        importacao: importacao._id,
        arquivoOrigem: importacao.arquivo?.nome || '',
        paginaOrigem: registro.pagina || null,
        fornecedorNomeOrigem: registro.fornecedorImportado || '',
        turmaOrigem: registro.turmaImportada || '',
        instituicaoOrigem: registro.instituicaoOrigem || '',
        criadoPorOrigem: registro.criadoPorOrigem || '',
        criadoPor: usuarioId || null,
        atualizadoPor: usuarioId || null,
      });
      registro.voucherCriado = voucher._id;
      registro.situacao = 'importado';
      registro.flags = [];
      resultados.push({ ok: true, codigo: voucher.codigo, id: voucher._id });
    } catch (error) {
      if (error?.code === 11000) {
        const atual = await UniformeVoucher.findOne({ instituicao: instituicaoId, codigo: registro.codigo }).select('_id');
        registro.duplicado = true;
        registro.voucherExistente = atual?._id || null;
        registro.situacao = 'duplicado';
        resultados.push({ ok: false, codigo: registro.codigo, motivo: 'Voucher duplicado.' });
      } else {
        registro.situacao = 'erro';
        registro.erros = [...new Set([...(registro.erros || []), texto(error.message || 'Falha ao importar voucher.', 500)])];
        resultados.push({ ok: false, codigo: registro.codigo, motivo: error.message || 'Falha ao importar voucher.' });
      }
    }
  }

  importacao.totais = resumir(importacao);
  importacao.importadoPor = usuarioId || null;
  importacao.importadoEm = new Date();
  importacao.status = importacao.totais.pendentes > 0 ? 'parcial' : 'importado';
  await importacao.save();
  return { importacao, resultados };
}

module.exports = {
  normalizarNome,
  normalizarTurma,
  normalizarFornecedor,
  resumir,
  serializarImportacao,
  analisarPdfUniformes,
  atualizarVinculoAluno,
  importarAnalise,
};
