'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { numeroOuNulo, booleanoRecuperacao } = require('./alamarRules');

function normalizarTexto(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00A0]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizarCabecalho(value) {
  return normalizarTexto(value)
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizarNome(value) {
  return normalizarTexto(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizarTurma(value) {
  return normalizarTexto(value).replace(/[^a-z0-9]/g, '');
}

function classificarGrupoTurmaAlamar(turma) {
  const texto = normalizarTexto(turma);
  const match = texto.match(/\d+/);
  const numero = match ? Number(match[0]) : null;
  if ([6, 7, 8, 9].includes(numero)) return 'fundamental';
  if ([1, 2, 3].includes(numero)) return 'medio';
  return 'outros';
}

function valorCelula(cell) {
  if (cell === null || cell === undefined) return '';
  if (typeof cell !== 'object' || cell instanceof Date) return cell;
  if (Object.prototype.hasOwnProperty.call(cell, 'result')) return cell.result;
  if (Array.isArray(cell.richText)) return cell.richText.map(item => item.text || '').join('');
  if (Object.prototype.hasOwnProperty.call(cell, 'text')) return cell.text;
  if (Object.prototype.hasOwnProperty.call(cell, 'hyperlink')) return cell.text || cell.hyperlink;
  return String(cell);
}

function decodificarTexto(buffer) {
  let texto = buffer.toString('utf8');
  if (texto.includes('\uFFFD')) {
    try {
      texto = new TextDecoder('windows-1252').decode(buffer);
    } catch (_error) {
      // Mantém UTF-8 quando a codificação alternativa não estiver disponível.
    }
  }
  return texto;
}

function detectarDelimitador(texto) {
  const primeiraLinha = String(texto || '').split(/\r?\n/).find(line => line.trim()) || '';
  const candidatos = [';', ',', '\t', '|'];
  return candidatos
    .map(delimitador => ({ delimitador, total: primeiraLinha.split(delimitador).length }))
    .sort((a, b) => b.total - a.total)[0]?.delimitador || ';';
}

function parseCsv(texto) {
  const delimitador = detectarDelimitador(texto);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const src = String(texto || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    const next = src[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimitador) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some(value => String(value).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some(value => String(value).trim() !== '')) rows.push(row);
  return { rows, delimitador };
}

function pontuarLinhaCabecalho(row) {
  const headers = row.map(normalizarCabecalho);
  const aliases = [
    ['aluno', 'nome do aluno', 'nome aluno', 'estudante', 'discente'],
    ['turma', 'classe'],
    ['disciplina', 'componente curricular', 'componente', 'materia'],
    ['nota', 'media', 'bimestre'],
    ['matricula', 'ra', 'codigo aluno'],
  ];
  return aliases.reduce((score, grupo) => score + (headers.some(h => grupo.includes(h)) ? 1 : 0), 0);
}

function encontrarCabecalho(rows) {
  let melhor = { index: 0, score: -1 };
  rows.slice(0, 30).forEach((row, index) => {
    const score = pontuarLinhaCabecalho(row);
    if (score > melhor.score) melhor = { index, score };
  });
  return melhor.index;
}

function cabecalhoUnico(headers) {
  const usados = new Map();
  return headers.map((header, index) => {
    const base = String(valorCelula(header) || `COLUNA_${index + 1}`).trim() || `COLUNA_${index + 1}`;
    const key = normalizarCabecalho(base) || `coluna_${index + 1}`;
    const count = usados.get(key) || 0;
    usados.set(key, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function rowsParaObjetos(rows, headerIndex) {
  const headers = cabecalhoUnico(rows[headerIndex] || []);
  return {
    headers,
    objects: rows.slice(headerIndex + 1).map((row, offset) => {
      const obj = { __linha: headerIndex + offset + 2 };
      headers.forEach((header, index) => { obj[header] = valorCelula(row[index]); });
      return obj;
    }).filter(obj => headers.some(header => String(obj[header] ?? '').trim() !== '')),
  };
}

function acharColuna(headers, aliases) {
  const normalized = headers.map(header => ({ original: header, normalized: normalizarCabecalho(header) }));
  for (const alias of aliases) {
    const exact = normalized.find(item => item.normalized === alias);
    if (exact) return exact.original;
  }
  for (const alias of aliases) {
    const partial = normalized.find(item => item.normalized.includes(alias));
    if (partial) return partial.original;
  }
  return null;
}

const ALIASES = {
  nome: ['nome do aluno', 'nome aluno', 'aluno', 'estudante', 'discente', 'nome'],
  turma: ['turma', 'classe', 'serie turma', 'serie'],
  matricula: ['matricula', 'numero matricula', 'n matricula', 'ra', 'registro aluno', 'codigo aluno'],
  simaedId: ['simaed id', 'id simaed', 'codigo simaed'],
  disciplina: ['disciplina', 'componente curricular', 'componente', 'materia'],
  bimestre: ['bimestre', 'etapa', 'periodo'],
  nota: ['nota', 'media bimestral', 'resultado'],
  mediaSemestral: ['media semestral', 'media final semestre', 'media semestre'],
  recuperacao: ['recuperacao', 'ficou recuperacao', 'situacao recuperacao', 'rec'],
};

function extrairBimestreDoCabecalho(header) {
  const texto = normalizarCabecalho(header);
  const patterns = [
    /^(?:nota\s+)?(1|2|3|4)\s*(?:b|bi|bim|bimestre)$/,
    /^(.+?)\s+(1|2|3|4)\s*(?:b|bi|bim|bimestre)\b/,
    /^(1|2|3|4)\s*(?:b|bi|bim|bimestre)\s+(.+)$/,
    /^(.+?)\s+(?:b|bi|bim)\s*(1|2|3|4)$/,
    /^(.+?)\s+(1|2|3|4)\s*$/,
  ];

  for (const [index, pattern] of patterns.entries()) {
    const match = texto.match(pattern);
    if (!match) continue;
    if (index === 0) return { disciplina: '', bimestre: Number(match[1]) };
    if (index === 2) return { disciplina: match[2].trim(), bimestre: Number(match[1]) };
    return { disciplina: match[1].trim(), bimestre: Number(match[2]) };
  }
  return null;
}

function chaveAluno({ matricula, simaedId, nome, turma }) {
  const id = String(matricula || simaedId || '').trim();
  if (id) return `id:${normalizarTexto(id)}`;
  return `nt:${normalizarNome(nome)}|${normalizarTurma(turma)}`;
}

function getOrCreateAluno(map, data) {
  const key = chaveAluno(data);
  if (!map.has(key)) {
    map.set(key, {
      nome: String(data.nome || '').trim(),
      turma: String(data.turma || '').trim(),
      matricula: String(data.matricula || '').trim(),
      simaedId: String(data.simaedId || '').trim(),
      disciplinas: new Map(),
      linhasOrigem: new Set(),
      avisos: [],
    });
  }
  const aluno = map.get(key);
  if (!aluno.nome && data.nome) aluno.nome = String(data.nome).trim();
  if (!aluno.turma && data.turma) aluno.turma = String(data.turma).trim();
  if (data.linha) aluno.linhasOrigem.add(Number(data.linha));
  return aluno;
}

function getOrCreateDisciplina(aluno, nome) {
  const clean = String(nome || '').trim();
  const key = normalizarCabecalho(clean);
  if (!key) return null;
  if (!aluno.disciplinas.has(key)) {
    aluno.disciplinas.set(key, { nome: clean, notas: new Map(), mediaSemestral: null, recuperacao: false });
  }
  return aluno.disciplinas.get(key);
}

function adicionarNota(disciplina, bimestre, valor, recuperacao, aluno) {
  if (!disciplina || !Number.isInteger(Number(bimestre))) return;
  const nota = numeroOuNulo(valor);
  if (nota === null) return;
  const bim = Number(bimestre);
  if (disciplina.notas.has(bim)) {
    aluno.avisos.push(`Nota duplicada em ${disciplina.nome}, ${bim}º bimestre; foi mantido o último valor encontrado.`);
  }
  disciplina.notas.set(bim, { bimestre: bim, valor: nota, recuperacaoExplicita: Boolean(recuperacao) });
  if (recuperacao) disciplina.recuperacao = true;
}

function finalizarAlunos(map, bimestresEsperados) {
  return [...map.values()].map(aluno => ({
    nome: aluno.nome,
    nomeNormalizado: normalizarNome(aluno.nome),
    turma: aluno.turma,
    turmaNormalizada: normalizarTurma(aluno.turma),
    matricula: aluno.matricula,
    simaedId: aluno.simaedId,
    linhasOrigem: [...aluno.linhasOrigem].sort((a, b) => a - b),
    avisos: [...new Set(aluno.avisos)],
    disciplinas: [...aluno.disciplinas.values()].map(disciplina => ({
      nome: disciplina.nome,
      notas: bimestresEsperados.map(bimestre => disciplina.notas.get(bimestre) || {
        bimestre,
        valor: null,
        recuperacaoExplicita: false,
      }),
      mediaSemestral: disciplina.mediaSemestral,
      recuperacao: disciplina.recuperacao,
      recuperacaoDesconhecida: Boolean(disciplina.recuperacaoDesconhecida),
    })),
  })).filter(aluno => aluno.nome && aluno.disciplinas.length > 0);
}

function detectarFormato(headers) {
  const disciplina = acharColuna(headers, ALIASES.disciplina);
  const bimestre = acharColuna(headers, ALIASES.bimestre);
  const nota = acharColuna(headers, ALIASES.nota);
  const wide = headers.filter(header => extrairBimestreDoCabecalho(header));
  if (disciplina && bimestre && nota) return 'long_bimestre';
  if (disciplina) return 'long_pareado';
  if (wide.length >= 2) return 'wide_bimestres';
  return 'wide_medias';
}

function processarObjetos({ headers, objects, semestre }) {
  const bimestresEsperados = semestre === 2 ? [3, 4] : [1, 2];
  const formato = detectarFormato(headers);
  const nomeCol = acharColuna(headers, ALIASES.nome);
  const turmaCol = acharColuna(headers, ALIASES.turma);
  const matriculaCol = acharColuna(headers, ALIASES.matricula);
  const simaedIdCol = acharColuna(headers, ALIASES.simaedId);
  const disciplinaCol = acharColuna(headers, ALIASES.disciplina);
  const bimestreCol = acharColuna(headers, ALIASES.bimestre);
  const notaCol = acharColuna(headers, ALIASES.nota);
  const mediaCol = acharColuna(headers, ALIASES.mediaSemestral);
  const recuperacaoCol = acharColuna(headers, ALIASES.recuperacao);
  const avisos = [];

  if (!nomeCol) {
    throw new Error(`Não foi possível identificar a coluna do nome do aluno. Cabeçalhos encontrados: ${headers.join(' | ')}`);
  }

  const alunos = new Map();

  if (formato === 'long_bimestre') {
    for (const row of objects) {
      const aluno = getOrCreateAluno(alunos, {
        nome: row[nomeCol], turma: turmaCol ? row[turmaCol] : '', matricula: matriculaCol ? row[matriculaCol] : '',
        simaedId: simaedIdCol ? row[simaedIdCol] : '', linha: row.__linha,
      });
      const disciplina = getOrCreateDisciplina(aluno, row[disciplinaCol]);
      const bimestre = Number(String(row[bimestreCol] || '').replace(/\D/g, ''));
      if (!bimestresEsperados.includes(bimestre)) continue;
      adicionarNota(disciplina, bimestre, row[notaCol], recuperacaoCol ? booleanoRecuperacao(row[recuperacaoCol]) : false, aluno);
    }
  } else if (formato === 'long_pareado') {
    const bimColumns = new Map();
    headers.forEach(header => {
      const info = extrairBimestreDoCabecalho(header);
      if (info && bimestresEsperados.includes(info.bimestre)) bimColumns.set(info.bimestre, header);
    });

    for (const row of objects) {
      const aluno = getOrCreateAluno(alunos, {
        nome: row[nomeCol], turma: turmaCol ? row[turmaCol] : '', matricula: matriculaCol ? row[matriculaCol] : '',
        simaedId: simaedIdCol ? row[simaedIdCol] : '', linha: row.__linha,
      });
      const disciplina = getOrCreateDisciplina(aluno, row[disciplinaCol]);
      const recuperacao = recuperacaoCol ? booleanoRecuperacao(row[recuperacaoCol]) : false;
      bimestresEsperados.forEach(bimestre => adicionarNota(disciplina, bimestre, row[bimColumns.get(bimestre)], recuperacao, aluno));
      if (mediaCol && disciplina) disciplina.mediaSemestral = numeroOuNulo(row[mediaCol]);
      if (disciplina && recuperacao) disciplina.recuperacao = true;
    }
  } else if (formato === 'wide_bimestres') {
    const gradeColumns = headers
      .map(header => ({ header, info: extrairBimestreDoCabecalho(header) }))
      .filter(item => item.info && bimestresEsperados.includes(item.info.bimestre));

    for (const row of objects) {
      const aluno = getOrCreateAluno(alunos, {
        nome: row[nomeCol], turma: turmaCol ? row[turmaCol] : '', matricula: matriculaCol ? row[matriculaCol] : '',
        simaedId: simaedIdCol ? row[simaedIdCol] : '', linha: row.__linha,
      });
      const recuperacaoGeral = recuperacaoCol ? booleanoRecuperacao(row[recuperacaoCol]) : false;
      gradeColumns.forEach(({ header, info }) => {
        const disciplina = getOrCreateDisciplina(aluno, info.disciplina);
        adicionarNota(disciplina, info.bimestre, row[header], recuperacaoGeral, aluno);
      });
    }
  } else {
    const baseCols = new Set([nomeCol, turmaCol, matriculaCol, simaedIdCol, recuperacaoCol].filter(Boolean));
    const numericCandidates = headers.filter(header => !baseCols.has(header));
    avisos.push('O arquivo parece conter apenas médias por disciplina. Sem notas bimestrais ou indicação explícita de recuperação, os casos podem permanecer pendentes.');

    for (const row of objects) {
      const aluno = getOrCreateAluno(alunos, {
        nome: row[nomeCol], turma: turmaCol ? row[turmaCol] : '', matricula: matriculaCol ? row[matriculaCol] : '',
        simaedId: simaedIdCol ? row[simaedIdCol] : '', linha: row.__linha,
      });
      const recuperacaoGeral = recuperacaoCol ? booleanoRecuperacao(row[recuperacaoCol]) : false;
      numericCandidates.forEach(header => {
        const media = numeroOuNulo(row[header]);
        if (media === null) return;
        const disciplina = getOrCreateDisciplina(aluno, header);
        disciplina.mediaSemestral = media;
        disciplina.recuperacao = recuperacaoGeral;
        disciplina.recuperacaoDesconhecida = !recuperacaoCol;
      });
    }
  }

  const alunosFinalizados = finalizarAlunos(alunos, bimestresEsperados);
  if (!alunosFinalizados.length) {
    throw new Error(`Nenhum aluno com notas válidas foi encontrado. Formato detectado: ${formato}.`);
  }

  return { alunos: alunosFinalizados, formato, avisos, bimestresEsperados };
}


function arquivoEhPdf(arquivo) {
  const nome = String(arquivo?.originalname || arquivo?.nomeArquivo || '').toLowerCase();
  const mime = String(arquivo?.mimetype || arquivo?.mimeType || '').toLowerCase();
  return nome.endsWith('.pdf') || mime === 'application/pdf';
}

function executarComando(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        ...(options.env || {}),
      },
    });
    let stdout = '';
    let stderr = '';
    let total = 0;
    const limite = 50 * 1024 * 1024;

    child.stdout.on('data', chunk => {
      total += chunk.length;
      if (total > limite) {
        child.kill();
        reject(new Error('A extração do PDF produziu dados demais. Divida a importação em menos arquivos.'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => reject(error));
    child.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr });
      const erro = new Error(stderr.trim() || `O extrator PDF terminou com código ${code}.`);
      erro.codigoProcesso = code;
      return reject(erro);
    });
  });
}

async function executarExtratorPdf(caminhos) {
  const script = path.join(__dirname, '..', 'pdf', 'extrair_notas_simaed.py');
  const comandos = [];
  if (process.env.PYTHON_BIN) comandos.push({ command: process.env.PYTHON_BIN, prefix: [] });
  comandos.push({ command: 'python', prefix: [] }, { command: 'py', prefix: ['-3'] });
  let ultimoErro = null;

  for (const item of comandos) {
    try {
      const { stdout } = await executarComando(item.command, [...item.prefix, script, ...caminhos]);
      const payload = JSON.parse(stdout);
      if (!Array.isArray(payload.relatorios)) throw new Error('O extrator PDF não retornou relatórios válidos.');
      return payload;
    } catch (error) {
      ultimoErro = error;
      if (error?.code === 'ENOENT') continue;
      const texto = String(error?.message || '');
      const matchJson = texto.match(/\{[\s\S]*\}/);
      if (matchJson) {
        try {
          const detalhe = JSON.parse(matchJson[0]);
          throw new Error(detalhe.erro || detalhe.detalhes || texto);
        } catch (parseError) {
          if (parseError.message !== matchJson[0]) throw parseError;
        }
      }
      throw error;
    }
  }

  throw new Error(`Python não foi localizado para interpretar o PDF. ${ultimoErro?.message || ''}`.trim());
}

async function extrairRelatoriosPdf(arquivos) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axoriin-alamar-pdf-'));
  try {
    const caminhos = [];
    for (let index = 0; index < arquivos.length; index += 1) {
      const arquivo = arquivos[index];
      const destino = path.join(tempDir, `relatorio-${String(index + 1).padStart(2, '0')}.pdf`);
      await fs.writeFile(destino, arquivo.buffer);
      caminhos.push(destino);
    }
    const payload = await executarExtratorPdf(caminhos);
    payload.relatorios.forEach((relatorio, index) => {
      relatorio.nomeArquivo = arquivos[index]?.originalname || relatorio.nomeArquivo || `relatorio-${index + 1}.pdf`;
    });
    return payload;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function processarRelatoriosPdf({ relatorios, semestre }) {
  const bimestresEsperados = Number(semestre) === 2 ? [3, 4] : [1, 2];
  const alunos = new Map();
  const avisos = [];
  const disciplinasEncontradas = [];
  const disciplinasVistas = new Set();
  const disciplinasComAlgumaNota = new Set();
  const relatoriosVistos = new Set();
  let totalLinhas = 0;

  for (const relatorio of relatorios) {
    const bimestre = Number(relatorio?.bimestre);
    const turma = String(relatorio?.turma || '').trim();
    if (!bimestresEsperados.includes(bimestre)) {
      throw new Error(`O arquivo ${relatorio?.nomeArquivo || 'PDF'} corresponde ao ${bimestre || '?'}º bimestre, que não pertence ao semestre selecionado.`);
    }
    if (!turma) throw new Error(`Não foi possível identificar a turma em ${relatorio?.nomeArquivo || 'um dos PDFs'}.`);

    const chaveRelatorio = `${normalizarTurma(turma)}|${bimestre}`;
    if (relatoriosVistos.has(chaveRelatorio)) {
      avisos.push(`Há mais de um PDF da turma ${turma} para o ${bimestre}º bimestre; em notas duplicadas, o último valor foi mantido.`);
    }
    relatoriosVistos.add(chaveRelatorio);

    (relatorio.disciplinas || []).forEach(disciplina => {
      const chave = normalizarCabecalho(disciplina);
      if (chave && !disciplinasVistas.has(chave)) {
        disciplinasVistas.add(chave);
        disciplinasEncontradas.push(String(disciplina).trim());
      }
    });

    for (const linha of relatorio.alunos || []) {
      totalLinhas += 1;
      const aluno = getOrCreateAluno(alunos, {
        nome: linha.nome,
        turma: linha.turma || turma,
        matricula: '',
        simaedId: '',
        linha: totalLinhas,
      });

      const situacao = String(linha.situacao || '').trim();
      if (situacao && normalizarTexto(situacao) !== 'em curso') {
        const data = String(linha.dataSituacao || '').trim();
        aluno.avisos.push(`Situação no SIMAED: ${situacao}${data ? ` em ${data}` : ''}.`);
      }

      for (const [nomeDisciplina, valor] of Object.entries(linha.notas || {})) {
        const disciplina = getOrCreateDisciplina(aluno, nomeDisciplina);
        if (numeroOuNulo(valor) !== null) {
          disciplinasComAlgumaNota.add(normalizarCabecalho(nomeDisciplina));
        }
        adicionarNota(disciplina, bimestre, valor, false, aluno);
      }
    }

    (relatorio.avisos || []).forEach(aviso => avisos.push(`${relatorio.nomeArquivo}: ${aviso}`));
  }

  const detectados = [...new Set(relatorios.map(item => Number(item.bimestre)).filter(Number.isInteger))].sort();
  const faltantes = bimestresEsperados.filter(item => !detectados.includes(item));
  if (faltantes.length) {
    avisos.push(`Não foram enviados PDFs do ${faltantes.map(item => `${item}º`).join(' e ')} bimestre. Os alunos afetados permanecerão pendentes por dados incompletos.`);
  }

  const alunosFinalizados = finalizarAlunos(alunos, bimestresEsperados)
    .map(aluno => ({
      ...aluno,
      // Remove apenas componentes que estão completamente vazios em toda a
      // importação (ex.: Formação Técnica e Profissional sem lançamento).
      // Ausências individuais continuam preservadas e podem gerar pendência.
      disciplinas: (aluno.disciplinas || []).filter(disciplina =>
        disciplinasComAlgumaNota.has(normalizarCabecalho(disciplina.nome))
      ),
    }))
    .filter(aluno => aluno.disciplinas.length > 0);
  if (!alunosFinalizados.length) throw new Error('Nenhum aluno com notas válidas foi encontrado nos PDFs.');

  return {
    alunos: alunosFinalizados,
    formato: 'pdf_simaed_relacao_notas',
    avisos: [...new Set(avisos)],
    bimestresEsperados,
    bimestresDetectados: detectados,
    planilha: 'PDF SIMAED',
    linhaCabecalho: 0,
    cabecalhos: disciplinasEncontradas.filter(nome => disciplinasComAlgumaNota.has(normalizarCabecalho(nome))),
    delimitador: null,
    totalLinhas,
  };
}


function ordenarTurmas(a, b) {
  const extrair = value => {
    const texto = String(value || '');
    const match = texto.match(/(\d+)/);
    const numero = match ? Number(match[1]) : 999;
    const letra = (texto.match(/([a-z])\s*$/i) || [])[1] || '';
    return { numero, letra: letra.toUpperCase(), texto };
  };
  const aa = extrair(a);
  const bb = extrair(b);
  return aa.numero - bb.numero || aa.letra.localeCompare(bb.letra, 'pt-BR') || aa.texto.localeCompare(bb.texto, 'pt-BR');
}

function organizarRelatoriosPorTurma({ relatorios, semestre }) {
  const lista = Array.isArray(relatorios) ? relatorios.filter(Boolean) : [];
  const bimestresEsperados = Number(semestre) === 2 ? [3, 4] : [1, 2];
  const grupos = new Map();
  const erros = [];
  const avisos = [];

  lista.forEach((relatorio, index) => {
    const turma = String(relatorio?.turma || '').trim();
    const turmaNormalizada = normalizarTurma(turma);
    const bimestre = Number(relatorio?.bimestre);
    const nomeArquivo = String(relatorio?.nomeArquivo || `arquivo-${index + 1}.pdf`);

    if (!turma || !turmaNormalizada) {
      erros.push(`${nomeArquivo}: não foi possível identificar a turma.`);
      return;
    }
    if (!bimestresEsperados.includes(bimestre)) {
      erros.push(`${nomeArquivo}: o ${bimestre || '?'}º bimestre não pertence ao semestre selecionado.`);
      return;
    }

    if (!grupos.has(turmaNormalizada)) {
      grupos.set(turmaNormalizada, {
        turma,
        turmaNormalizada,
        relatorios: [],
        porBimestre: new Map(),
        arquivos: [],
        bimestres: [],
        status: 'PRONTO',
        mensagem: '',
      });
    }

    const grupo = grupos.get(turmaNormalizada);
    grupo.relatorios.push(relatorio);
    grupo.arquivos.push(nomeArquivo);

    if (grupo.porBimestre.has(bimestre)) {
      const anterior = grupo.porBimestre.get(bimestre);
      grupo.status = 'DUPLICADO';
      grupo.mensagem = `Há mais de um arquivo para o ${bimestre}º bimestre: ${anterior.nomeArquivo} e ${nomeArquivo}.`;
      erros.push(`${grupo.turma}: ${grupo.mensagem}`);
    } else {
      grupo.porBimestre.set(bimestre, relatorio);
    }
  });

  const turmas = [...grupos.values()].map(grupo => {
    grupo.bimestres = [...grupo.porBimestre.keys()].sort((a, b) => a - b);
    const faltantes = bimestresEsperados.filter(bimestre => !grupo.porBimestre.has(bimestre));
    if (grupo.status !== 'DUPLICADO' && faltantes.length) {
      grupo.status = 'INCOMPLETO';
      grupo.mensagem = `Falta ${faltantes.map(item => `${item}º bimestre`).join(' e ')}.`;
      erros.push(`${grupo.turma}: ${grupo.mensagem}`);
    }
    if (grupo.status === 'PRONTO') {
      grupo.relatorios = bimestresEsperados.map(bimestre => grupo.porBimestre.get(bimestre));
      grupo.arquivos = grupo.relatorios.map(item => item.nomeArquivo);
      grupo.mensagem = `${bimestresEsperados.length} bimestres identificados corretamente.`;
    }
    delete grupo.porBimestre;
    return grupo;
  }).sort((a, b) => ordenarTurmas(a.turma, b.turma));

  const turmasProntas = turmas.filter(item => item.status === 'PRONTO');
  const totalRelatorios = lista.length;
  if (!totalRelatorios) erros.push('Nenhum relatório PDF foi reconhecido.');
  if (!turmasProntas.length && !erros.length) erros.push('Nenhuma turma possui os dois bimestres necessários para o semestre.');

  return {
    semestre: Number(semestre),
    bimestresEsperados,
    totalArquivos: totalRelatorios,
    totalTurmas: turmas.length,
    totalTurmasProntas: turmasProntas.length,
    turmas,
    erros: [...new Set(erros)],
    avisos: [...new Set(avisos)],
    valido: erros.length === 0 && turmas.length > 0,
  };
}

async function analisarLotePdfNotas({ arquivos, semestre }) {
  const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];
  if (!lista.length) throw new Error('Nenhum PDF foi enviado para a apuração em lote.');
  if (lista.some(arquivo => !arquivoEhPdf(arquivo))) {
    throw new Error('A apuração em lote aceita somente PDFs digitais do SIMAED.');
  }
  const extraido = await extrairRelatoriosPdf(lista);
  const analise = organizarRelatoriosPorTurma({ relatorios: extraido.relatorios, semestre: Number(semestre) });
  return { ...analise, relatorios: extraido.relatorios };
}

async function lerArquivosNotas({ arquivos, semestre }) {
  const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];
  if (!lista.length) throw new Error('Nenhum arquivo foi enviado.');

  const pdfs = lista.filter(arquivoEhPdf);
  if (pdfs.length) {
    if (pdfs.length !== lista.length) {
      throw new Error('Não misture PDF com CSV ou XLSX na mesma importação. Envie apenas PDFs ou uma única planilha.');
    }
    const extraido = await extrairRelatoriosPdf(pdfs);
    const turmas = [...new Set(extraido.relatorios.map(item => normalizarTurma(item?.turma)).filter(Boolean))];
    if (turmas.length > 1) {
      throw new Error('Foram detectadas várias turmas nos PDFs. Use a opção "Apuração em lote" para enviar todas as turmas de uma vez.');
    }
    return processarRelatoriosPdf({ relatorios: extraido.relatorios, semestre: Number(semestre) });
  }

  if (lista.length !== 1) {
    throw new Error('Para CSV ou XLSX, envie somente um arquivo por importação.');
  }

  const arquivo = lista[0];
  return lerArquivoNotas({
    buffer: arquivo.buffer,
    nomeArquivo: arquivo.originalname,
    mimeType: arquivo.mimetype,
    semestre,
  });
}

async function lerArquivoNotas({ buffer, nomeArquivo, mimeType, semestre }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Arquivo vazio.');
  const ext = String(nomeArquivo || '').toLowerCase().split('.').pop();
  let rows = [];
  let planilha = '';
  let delimitador = null;

  if (ext === 'csv' || String(mimeType || '').includes('csv') || ext === 'txt') {
    const parsed = parseCsv(decodificarTexto(buffer));
    rows = parsed.rows;
    delimitador = parsed.delimitador;
    planilha = 'CSV';
  } else if (ext === 'xlsx' || String(mimeType || '').includes('spreadsheetml')) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets.find(sheet => sheet.actualRowCount > 0);
    if (!worksheet) throw new Error('A planilha não possui linhas.');
    planilha = worksheet.name;
    worksheet.eachRow({ includeEmpty: false }, row => {
      const values = [];
      for (let i = 1; i <= Math.max(row.cellCount, worksheet.actualColumnCount); i += 1) {
        values.push(valorCelula(row.getCell(i).value));
      }
      rows.push(values);
    });
  } else {
    throw new Error('Formato não suportado. Envie CSV, XLSX ou PDF do SIMAED.');
  }

  if (!rows.length) throw new Error('O arquivo não possui dados.');
  const headerIndex = encontrarCabecalho(rows);
  const { headers, objects } = rowsParaObjetos(rows, headerIndex);
  const processado = processarObjetos({ headers, objects, semestre: Number(semestre) });

  return {
    ...processado,
    planilha,
    linhaCabecalho: headerIndex + 1,
    cabecalhos: headers,
    delimitador,
    totalLinhas: objects.length,
  };
}

module.exports = {
  normalizarTexto,
  normalizarCabecalho,
  normalizarNome,
  normalizarTurma,
  classificarGrupoTurmaAlamar,
  parseCsv,
  extrairBimestreDoCabecalho,
  lerArquivoNotas,
  lerArquivosNotas,
  processarRelatoriosPdf,
  extrairRelatoriosPdf,
  organizarRelatoriosPorTurma,
  analisarLotePdfNotas,
};
