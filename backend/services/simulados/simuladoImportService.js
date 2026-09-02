'use strict';

const crypto = require('crypto');
const ExcelJS = require('exceljs');
const {
  texto,
  normalizarChave,
  normalizarIdioma,
  normalizarResposta,
  simuladoTemIdioma,
} = require('./simuladoAnaliseService');
const {
  FONTE_MATRIZ_ENEM,
  resolverHabilidadeEnem,
  listarReferenciaEnem,
} = require('./enemMatrizReferenciaService');

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMATOS_ACEITOS = new Set(['xlsx', 'csv', 'json']);

const CABECALHOS_MATRIZ = [
  'CODIGO', 'NUMERO', 'DIA', 'ORDEM_GLOBAL', 'AREA', 'VARIANTE', 'GABARITO',
  'COMPONENTE', 'MACROCONTEUDO', 'CONTEUDO', 'HABILIDADE', 'HABILIDADE_ENEM', 'CONFIANCA_ENEM', 'COMPETENCIA', 'DESCRITOR',
  'DIFICULDADE', 'PESO', 'ANULADA', 'OBSERVACAO',
];

const CABECALHOS_ALUNO = ['ALUNO_ID', 'CODIGO_ACESSO', 'NOME', 'TURMA', 'IDIOMA'];

function detectarFormato(nomeArquivo = '', mimeType = '') {
  const nome = texto(nomeArquivo).toLowerCase();
  const mime = texto(mimeType).toLowerCase();
  if (nome.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (nome.endsWith('.csv') || mime.includes('text/csv')) return 'csv';
  if (nome.endsWith('.json') || mime.includes('application/json')) return 'json';
  return '';
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function valorCelula(cell) {
  if (cell === undefined || cell === null) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell !== 'object') return cell;
  if (Object.prototype.hasOwnProperty.call(cell, 'result')) return cell.result ?? '';
  if (Array.isArray(cell.richText)) return cell.richText.map((item) => item.text || '').join('');
  if (Object.prototype.hasOwnProperty.call(cell, 'text')) return cell.text ?? '';
  if (Object.prototype.hasOwnProperty.call(cell, 'hyperlink')) return cell.text || cell.hyperlink || '';
  return texto(cell);
}

function parseCsv(textoCsv) {
  const conteudo = String(textoCsv || '').replace(/^\uFEFF/, '');
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] || '';
  const candidatos = [';', ',', '\t'];
  const delimitador = candidatos
    .map((item) => ({ item, total: primeiraLinha.split(item).length }))
    .sort((a, b) => b.total - a.total)[0].item;
  const linhas = [];
  let linha = [];
  let campo = '';
  let emAspas = false;

  for (let i = 0; i < conteudo.length; i += 1) {
    const char = conteudo[i];
    const proximo = conteudo[i + 1];
    if (char === '"') {
      if (emAspas && proximo === '"') {
        campo += '"';
        i += 1;
      } else {
        emAspas = !emAspas;
      }
    } else if (char === delimitador && !emAspas) {
      linha.push(campo);
      campo = '';
    } else if ((char === '\n' || char === '\r') && !emAspas) {
      if (char === '\r' && proximo === '\n') i += 1;
      linha.push(campo);
      if (linha.some((item) => texto(item))) linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += char;
    }
  }
  linha.push(campo);
  if (linha.some((item) => texto(item))) linhas.push(linha);
  return linhas;
}

function linhasParaObjetos(linhas) {
  if (!linhas.length) return { cabecalhos: [], linhas: [] };
  const cabecalhos = linhas[0].map((item, indice) => normalizarChave(item) || `COLUNA_${indice + 1}`);
  const objetos = linhas.slice(1).map((valores, indice) => {
    const item = { __linha: indice + 2 };
    cabecalhos.forEach((cabecalho, coluna) => { item[cabecalho] = valorCelula(valores[coluna]); });
    return item;
  }).filter((item) => cabecalhos.some((cabecalho) => texto(item[cabecalho])));
  return { cabecalhos, linhas: objetos };
}

async function lerTabela({ buffer, nomeArquivo, mimeType }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('O arquivo está vazio.');
  const formato = detectarFormato(nomeArquivo, mimeType);
  if (!FORMATOS_ACEITOS.has(formato)) throw new Error('Formato não aceito. Envie um arquivo XLSX, CSV ou JSON.');

  if (formato === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find((item) => item.actualRowCount > 0);
    if (!sheet) throw new Error('A planilha não possui linhas para importar.');
    const linhas = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const valores = [];
      for (let indice = 1; indice <= row.cellCount; indice += 1) valores.push(valorCelula(row.getCell(indice).value));
      linhas.push(valores);
    });
    return { formato, planilha: sheet.name, ...linhasParaObjetos(linhas) };
  }

  if (formato === 'csv') {
    return { formato, planilha: '', ...linhasParaObjetos(parseCsv(buffer.toString('utf8'))) };
  }

  let json;
  try {
    json = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('O arquivo JSON não é válido.');
  }
  const fonte = Array.isArray(json) ? json : (json.linhas || json.resultados || json.dados);
  if (!Array.isArray(fonte) || !fonte.length) throw new Error('O JSON deve conter uma lista de linhas.');
  const chaves = [...new Set(fonte.flatMap((item) => Object.keys(item || {}).map(normalizarChave)))];
  const linhas = fonte.map((item, indice) => {
    const normalizado = { __linha: indice + 1 };
    Object.entries(item || {}).forEach(([key, value]) => { normalizado[normalizarChave(key)] = valorCelula(value); });
    return normalizado;
  });
  return { formato, planilha: '', cabecalhos: chaves, linhas };
}

function inteiro(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numero = Number(value);
  return Number.isInteger(numero) && numero >= min && numero <= max ? numero : fallback;
}

function numero(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function booleano(value) {
  return ['SIM', 'S', 'TRUE', 'VERDADEIRO', '1', 'X', 'ANULADA', 'ANULADO'].includes(normalizarChave(value));
}

function dificuldade(value) {
  const chave = normalizarChave(value);
  if (['FACIL', 'MEDIA', 'DIFICIL'].includes(chave)) return chave.toLowerCase();
  return 'nao_informada';
}

function confiancaEnem(value, habilidadeInformada = '') {
  if (!texto(habilidadeInformada)) return 'nao_informada';
  const chave = normalizarChave(value);
  if (['APROXIMADA', 'APROX', 'ESTIMADA', 'BEST_FIT'].includes(chave)) return 'aproximada';
  return 'direta';
}

function variante(value) {
  const chave = normalizarChave(value) || 'PADRAO';
  if (['PADRAO', 'INGLES', 'ESPANHOL'].includes(chave)) return chave;
  return '';
}

function analisarMatriz(tabela) {
  const faltantes = ['CODIGO', 'NUMERO', 'AREA', 'VARIANTE', 'GABARITO']
    .filter((item) => !tabela.cabecalhos.includes(item));
  if (faltantes.length) {
    return { questoes: [], erros: [`Colunas obrigatórias ausentes: ${faltantes.join(', ')}.`], avisos: [] };
  }

  const mapa = new Map();
  const erros = [];
  const avisos = [];

  for (const linha of tabela.linhas) {
    const codigo = texto(linha.CODIGO).toUpperCase();
    const numeroQuestao = inteiro(linha.NUMERO, null, 1, 1000);
    const varianteCodigo = variante(linha.VARIANTE);
    const resposta = normalizarResposta(linha.GABARITO);
    if (!codigo) { erros.push(`Linha ${linha.__linha}: informe o código da questão.`); continue; }
    if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(codigo)) {
      erros.push(`Linha ${linha.__linha}: código ${codigo} inválido. Use letras, números, hífen ou sublinhado.`);
      continue;
    }
    if (!numeroQuestao) { erros.push(`Linha ${linha.__linha}: número da questão inválido.`); continue; }
    if (!varianteCodigo) { erros.push(`Linha ${linha.__linha}: variante inválida. Use PADRAO, INGLES ou ESPANHOL.`); continue; }
    if (!resposta.resposta && !booleano(linha.ANULADA)) {
      erros.push(`Linha ${linha.__linha}: gabarito inválido. Use A, B, C, D ou E.`);
      continue;
    }

    const base = {
      codigo,
      numero: numeroQuestao,
      dia: inteiro(linha.DIA, 1, 1, 10),
      ordemGlobal: inteiro(linha.ORDEM_GLOBAL, numeroQuestao, 0, 10000),
      area: texto(linha.AREA).slice(0, 200),
      tipo: 'objetiva',
      peso: numero(linha.PESO, 1, 0.01, 100),
      anulada: booleano(linha.ANULADA),
      observacao: texto(linha.OBSERVACAO).slice(0, 1000),
      variantes: [],
      __linhas: [],
    };
    if (!base.area) erros.push(`Linha ${linha.__linha}: informe a área do conhecimento.`);
    if (!mapa.has(codigo)) mapa.set(codigo, base);
    const questao = mapa.get(codigo);
    questao.__linhas.push(linha.__linha);

    if (questao.numero !== base.numero || questao.dia !== base.dia || questao.area !== base.area) {
      erros.push(`Linha ${linha.__linha}: os dados gerais de ${codigo} divergem de outra variante da mesma questão.`);
    }
    if (questao.variantes.some((item) => item.codigo === varianteCodigo)) {
      erros.push(`Linha ${linha.__linha}: variante ${varianteCodigo} repetida em ${codigo}.`);
      continue;
    }
    const habilidadeEnemInformada = texto(linha.HABILIDADE_ENEM).toUpperCase();
    const enem = habilidadeEnemInformada ? resolverHabilidadeEnem(base.area, habilidadeEnemInformada) : null;
    const habilidadeEnemConfianca = confiancaEnem(linha.CONFIANCA_ENEM, habilidadeEnemInformada);
    if (habilidadeEnemInformada && !enem) {
      erros.push(`Linha ${linha.__linha}: HABILIDADE_ENEM “${habilidadeEnemInformada}” não é válida para a área “${base.area}”. Use H1 a H30 conforme a Matriz de Referência ENEM.`);
    }

    questao.variantes.push({
      codigo: varianteCodigo,
      gabarito: resposta.resposta,
      componente: texto(linha.COMPONENTE).slice(0, 200),
      macroconteudo: texto(linha.MACROCONTEUDO).slice(0, 300),
      conteudo: texto(linha.CONTEUDO).slice(0, 500),
      habilidade: texto(linha.HABILIDADE).slice(0, 1000),
      habilidadeEnem: enem?.habilidadeCodigo || '',
      habilidadeEnemConfianca: enem ? habilidadeEnemConfianca : 'nao_informada',
      competencia: texto(linha.COMPETENCIA).slice(0, 1000),
      descritor: texto(linha.DESCRITOR).slice(0, 1000),
      dificuldade: dificuldade(linha.DIFICULDADE),
    });
  }

  const questoes = [...mapa.values()].map((item) => {
    delete item.__linhas;
    return item;
  }).sort((a, b) => a.dia - b.dia || a.ordemGlobal - b.ordemGlobal || a.numero - b.numero);

  const codigosPorCabecalho = new Map();
  questoes.forEach((questao) => {
    const chaveCabecalho = normalizarChave(questao.codigo);
    const anterior = codigosPorCabecalho.get(chaveCabecalho);
    if (anterior && anterior !== questao.codigo) {
      erros.push(`Os códigos ${anterior} e ${questao.codigo} geram a mesma coluna de respostas. Use códigos distintos.`);
    }
    codigosPorCabecalho.set(chaveCabecalho, questao.codigo);
  });

  for (const questao of questoes) {
    const codigos = new Set(questao.variantes.map((item) => item.codigo));
    const temIdioma = codigos.has('INGLES') || codigos.has('ESPANHOL');
    if (temIdioma && !(codigos.has('INGLES') && codigos.has('ESPANHOL'))) {
      erros.push(`Questão ${questao.codigo}: cadastre as duas variantes, INGLES e ESPANHOL.`);
    }
    if (temIdioma && codigos.has('PADRAO')) {
      erros.push(`Questão ${questao.codigo}: não misture PADRAO com variantes de idioma.`);
    }
    if (!temIdioma && !codigos.has('PADRAO')) {
      erros.push(`Questão ${questao.codigo}: questões comuns devem usar a variante PADRAO.`);
    }
    for (const item of questao.variantes) {
      if (!item.conteudo) avisos.push(`Questão ${questao.codigo}/${item.codigo}: conteúdo não informado.`);
      if (!item.habilidade) avisos.push(`Questão ${questao.codigo}/${item.codigo}: habilidade pedagógica interna não informada.`);
      if (!item.habilidadeEnem) avisos.push(`Questão ${questao.codigo}/${item.codigo}: HABILIDADE_ENEM não informada; o relatório oficial do ENEM mostrará esta variante como não mapeada.`);
    }
  }

  if (!questoes.length && !erros.length) erros.push('Nenhuma questão válida foi encontrada.');
  return { questoes, erros: [...new Set(erros)], avisos: [...new Set(avisos)] };
}

function normalizarNome(value) {
  return normalizarChave(value).replace(/_/g, ' ');
}

function normalizarTurma(value) {
  return normalizarChave(value).replace(/_/g, ' ');
}

function alunoView(aluno) {
  return {
    aluno: aluno._id,
    nome: texto(aluno.nome),
    turma: texto(aluno.turma),
    codigoAcesso: texto(aluno.codigoAcesso),
  };
}

function indexarAlunos(alunos = []) {
  const indice = { id: new Map(), codigo: new Map(), nomeTurma: new Map(), nome: new Map() };
  const adicionar = (mapa, chave, aluno) => {
    if (!chave) return;
    const lista = mapa.get(chave) || [];
    lista.push(aluno);
    mapa.set(chave, lista);
  };
  for (const aluno of alunos) {
    adicionar(indice.id, texto(aluno._id), aluno);
    adicionar(indice.codigo, normalizarChave(aluno.codigoAcesso), aluno);
    const nome = normalizarNome(aluno.nome);
    const turma = normalizarTurma(aluno.turma);
    adicionar(indice.nomeTurma, `${nome}::${turma}`, aluno);
    adicionar(indice.nome, nome, aluno);
  }
  return indice;
}

function localizarAluno(linha, indice) {
  const id = texto(linha.ALUNO_ID);
  const codigo = normalizarChave(linha.CODIGO_ACESSO);
  const nome = normalizarNome(linha.NOME);
  const turma = normalizarTurma(linha.TURMA);
  let candidatos = [];

  if (id && indice.id.has(id)) candidatos = indice.id.get(id);
  else if (codigo && indice.codigo.has(codigo)) candidatos = indice.codigo.get(codigo);
  else if (nome && turma && indice.nomeTurma.has(`${nome}::${turma}`)) candidatos = indice.nomeTurma.get(`${nome}::${turma}`);
  else if (nome && indice.nome.has(nome)) candidatos = indice.nome.get(nome);

  const unicos = [...new Map(candidatos.map((item) => [texto(item._id), item])).values()];
  if (unicos.length === 1) return { aluno: unicos[0], status: 'automatico', candidatos: [] };
  if (unicos.length > 1) return { aluno: null, status: 'ambiguo', candidatos: unicos.slice(0, 10) };
  return { aluno: null, status: 'nao_localizado', candidatos: [] };
}

function totaisImportacao(linhas, possuiIdioma) {
  return linhas.reduce((acc, linha) => {
    acc.linhas += 1;
    const situacao = ['ausente', 'descartada'].includes(texto(linha?.situacaoAplicacao).toLowerCase())
      ? texto(linha.situacaoAplicacao).toLowerCase()
      : 'presente';
    if (situacao === 'descartada') {
      acc.descartadas += 1;
      return acc;
    }
    if (situacao === 'ausente') {
      acc.ausentes += 1;
      if (['automatico', 'manual'].includes(linha.vinculoStatus) && linha.aluno) acc.prontas += 1;
      else if (linha.vinculoStatus === 'ambiguo') acc.ambiguas += 1;
      else if (linha.vinculoStatus === 'duplicado') acc.duplicadas += 1;
      else acc.naoLocalizadas += 1;
      return acc;
    }
    if (['automatico', 'manual'].includes(linha.vinculoStatus)) acc.prontas += 1;
    if (linha.vinculoStatus === 'ambiguo') acc.ambiguas += 1;
    if (linha.vinculoStatus === 'nao_localizado') acc.naoLocalizadas += 1;
    if (linha.vinculoStatus === 'duplicado') acc.duplicadas += 1;
    const idiomaAplicavel = typeof possuiIdioma === 'function' ? Boolean(possuiIdioma(linha)) : Boolean(possuiIdioma);
    if (idiomaAplicavel && linha.idiomaEstrangeiro === 'NAO_INFORMADO') acc.idiomasPendentes += 1;
    if (idiomaAplicavel && linha.idiomaEstrangeiro === 'NAO_MARCADO') acc.idiomasNaoMarcados += 1;
    if (linha.fonte === 'cartao_pdf' || linha.omr?.status && linha.omr.status !== 'nao_aplicavel') {
      if (linha.omr?.revisaoObrigatoria) acc.omrPendentes += 1;
      else acc.omrProntas += 1;
    }
    return acc;
  }, {
    linhas: 0,
    prontas: 0,
    ambiguas: 0,
    naoLocalizadas: 0,
    duplicadas: 0,
    idiomasPendentes: 0,
    idiomasNaoMarcados: 0,
    omrPendentes: 0,
    omrProntas: 0,
    ausentes: 0,
    descartadas: 0,
    processadas: 0,
  });
}

function analisarRespostas({ tabela, simulado, alunos }) {
  const faltantes = ['NOME', 'TURMA'].filter((item) => !tabela.cabecalhos.includes(item));
  if (faltantes.length) throw new Error(`Colunas obrigatórias ausentes: ${faltantes.join(', ')}.`);
  const codigosQuestoes = (simulado.questoes || []).map((item) => texto(item.codigo).toUpperCase());
  if (!codigosQuestoes.length) throw new Error('Cadastre a matriz de questões antes de importar respostas.');
  const presentes = codigosQuestoes.filter((codigo) => tabela.cabecalhos.includes(normalizarChave(codigo)));
  if (!presentes.length) throw new Error('Nenhuma coluna de resposta corresponde aos códigos da matriz do simulado.');

  const indice = indexarAlunos(alunos);
  const possuiIdioma = simuladoTemIdioma(simulado);
  const avisosGerais = [];
  const linhas = tabela.linhas.map((linha) => {
    const vinculo = localizarAluno(linha, indice);
    const idioma = normalizarIdioma(linha.IDIOMA, { aplicavel: possuiIdioma });
    const respostas = {};
    const avisos = [];
    for (const codigo of codigosQuestoes) {
      const valor = linha[normalizarChave(codigo)];
      if (valor === undefined) continue;
      const resposta = normalizarResposta(valor);
      if (resposta.invalida) avisos.push(`${codigo}: resposta inválida “${texto(valor)}”.`);
      if (resposta.informada) respostas[codigo] = resposta.resposta || 'BRANCO';
    }
    if (possuiIdioma && idioma === 'NAO_INFORMADO') avisos.push('Língua estrangeira pendente; as questões de idioma não serão pontuadas até a confirmação.');
    return {
      numeroLinha: linha.__linha,
      alunoIdInformado: texto(linha.ALUNO_ID).slice(0, 120),
      codigoInformado: texto(linha.CODIGO_ACESSO).slice(0, 120),
      nomeInformado: texto(linha.NOME).slice(0, 300),
      turmaInformada: texto(linha.TURMA).slice(0, 100),
      idiomaEstrangeiro: idioma,
      idiomaOrigem: idioma === 'NAO_INFORMADO' ? 'nao_informado' : 'planilha',
      aluno: vinculo.aluno?._id || null,
      vinculoStatus: vinculo.status,
      candidatos: vinculo.candidatos.map(alunoView),
      respostas,
      avisos,
    };
  });

  const porAluno = new Map();
  for (const linha of linhas) {
    if (!linha.aluno) continue;
    const chave = texto(linha.aluno);
    const grupo = porAluno.get(chave) || [];
    grupo.push(linha);
    porAluno.set(chave, grupo);
  }
  for (const grupo of porAluno.values()) {
    if (grupo.length < 2) continue;
    grupo.forEach((linha) => {
      linha.vinculoStatus = 'duplicado';
      linha.avisos.push('O mesmo aluno aparece mais de uma vez neste arquivo.');
    });
  }
  if (presentes.length < codigosQuestoes.length) {
    avisosGerais.push(`${codigosQuestoes.length - presentes.length} questão(ões) da matriz não possuem coluna no arquivo; serão registradas como não importadas.`);
  }
  return { linhas, totais: totaisImportacao(linhas, possuiIdioma), avisos: avisosGerais };
}

function estiloCabecalho(sheet, colunas) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(colunas).letter}1` };
}

function adicionarOrientacoes(workbook, titulo, itens) {
  const sheet = workbook.addWorksheet('LEIA-ME');
  sheet.getColumn(1).width = 115;
  sheet.getCell('A1').value = titulo;
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F766E' } };
  itens.forEach((item, indice) => {
    const cell = sheet.getCell(indice + 3, 1);
    cell.value = `${indice + 1}. ${item}`;
    cell.alignment = { wrapText: true, vertical: 'top' };
  });
}

function adicionarReferenciaEnem(workbook) {
  const nome = workbook.getWorksheet('REFERENCIA_ENEM') ? `REFERENCIA_ENEM_${workbook.worksheets.length + 1}` : 'REFERENCIA_ENEM';
  const sheet = workbook.addWorksheet(nome);
  sheet.columns = [
    { header: 'AREA_CODIGO', key: 'areaCodigo', width: 18 },
    { header: 'AREA', key: 'areaNome', width: 34 },
    { header: 'COMPETENCIA', key: 'competenciaCodigo', width: 15 },
    { header: 'DESCRICAO_COMPETENCIA', key: 'competenciaDescricao', width: 70 },
    { header: 'HABILIDADE', key: 'habilidadeCodigo', width: 14 },
    { header: 'DESCRICAO_HABILIDADE', key: 'habilidadeDescricao', width: 90 },
    { header: 'FONTE', key: 'fonte', width: 24 },
  ];
  sheet.addRows(listarReferenciaEnem());
  estiloCabecalho(sheet, 7);
  sheet.eachRow({ includeEmpty: false }, (row, index) => {
    if (index === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
  });
  return sheet;
}

async function gerarModeloMapeamentoEnem(simulado) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Axoriin — Diagnóstico de Simulados';
  const sheet = workbook.addWorksheet('MAPEAMENTO_ENEM');
  sheet.columns = [
    { header: 'CODIGO', key: 'CODIGO', width: 16 },
    { header: 'VARIANTE', key: 'VARIANTE', width: 14 },
    { header: 'AREA', key: 'AREA', width: 30 },
    { header: 'COMPONENTE', key: 'COMPONENTE', width: 26 },
    { header: 'CONTEUDO', key: 'CONTEUDO', width: 48 },
    { header: 'HABILIDADE_ATUAL', key: 'HABILIDADE_ATUAL', width: 48 },
    { header: 'HABILIDADE_ENEM', key: 'HABILIDADE_ENEM', width: 18 },
    { header: 'CONFIANCA_ENEM', key: 'CONFIANCA_ENEM', width: 20 },
  ];
  for (const questao of simulado?.questoes || []) {
    for (const item of questao.variantes || []) {
      sheet.addRow({
        CODIGO: questao.codigo,
        VARIANTE: item.codigo,
        AREA: questao.area,
        COMPONENTE: item.componente,
        CONTEUDO: item.conteudo,
        HABILIDADE_ATUAL: item.habilidade,
        HABILIDADE_ENEM: item.habilidadeEnem || '',
        CONFIANCA_ENEM: item.habilidadeEnem ? (item.habilidadeEnemConfianca || 'direta').toUpperCase() : '',
      });
    }
  }
  const fimMapeamento = Math.max(sheet.rowCount + 500, 600);
  sheet.dataValidations.add(`G2:G${fimMapeamento}`, { type: 'list', allowBlank: true, formulae: [`"${Array.from({ length: 30 }, (_, i) => `H${i + 1}`).join(',')}"`] });
  sheet.dataValidations.add(`H2:H${fimMapeamento}`, { type: 'list', allowBlank: true, formulae: ['"DIRETA,APROXIMADA"'] });
  estiloCabecalho(sheet, 8);
  sheet.getColumn('A').protection = { locked: true };
  sheet.getColumn('B').protection = { locked: true };
  sheet.getColumn('C').protection = { locked: true };
  sheet.getColumn('D').protection = { locked: true };
  sheet.getColumn('E').protection = { locked: true };
  sheet.getColumn('F').protection = { locked: true };
  adicionarReferenciaEnem(workbook);
  adicionarOrientacoes(workbook, 'MAPEAMENTO DE HABILIDADES ENEM', [
    'Preencha HABILIDADE_ENEM com H1 a H30. Use CONFIANCA_ENEM=DIRETA quando o vínculo é claro e APROXIMADA quando for o melhor encaixe pedagógico disponível na Matriz ENEM.',
    `A referência incorporada é ${FONTE_MATRIZ_ENEM.titulo} — ${FONTE_MATRIZ_ENEM.orgao}, ${FONTE_MATRIZ_ENEM.ano}.`,
    'O mesmo código H pode significar habilidades diferentes em áreas distintas; por isso o Axoriin valida HABILIDADE_ENEM junto com AREA.',
    'O Axoriin não faz inferência automática pelo assunto ou pelo gabarito. Quando a Matriz ENEM não tiver uma habilidade específica para o conteúdo, é possível registrar o melhor encaixe como APROXIMADA, mantendo essa transparência no relatório.',
    'Após a importação, os resultados existentes são recalculados apenas para enriquecer o diagnóstico; as respostas originais e o gabarito não são substituídos.',
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function analisarMapeamentoEnem(tabela, simulado) {
  const faltantes = ['CODIGO', 'VARIANTE', 'HABILIDADE_ENEM'].filter((item) => !tabela.cabecalhos.includes(item));
  if (faltantes.length) return { atualizacoes: [], erros: [`Colunas obrigatórias ausentes: ${faltantes.join(', ')}.`], avisos: [] };
  const indice = new Map();
  for (const questao of simulado?.questoes || []) {
    for (const item of questao.variantes || []) indice.set(`${texto(questao.codigo).toUpperCase()}::${texto(item.codigo).toUpperCase()}`, { questao, variante: item });
  }
  const atualizacoes = [];
  const erros = [];
  const avisos = [];
  const vistos = new Set();
  for (const linha of tabela.linhas || []) {
    const codigo = texto(linha.CODIGO).toUpperCase();
    const varianteCodigo = texto(linha.VARIANTE).toUpperCase() || 'PADRAO';
    const habilidade = texto(linha.HABILIDADE_ENEM).toUpperCase();
    const confianca = confiancaEnem(linha.CONFIANCA_ENEM, habilidade);
    const chave = `${codigo}::${varianteCodigo}`;
    if (!codigo) { erros.push(`Linha ${linha.__linha}: CODIGO vazio.`); continue; }
    if (vistos.has(chave)) { erros.push(`Linha ${linha.__linha}: ${codigo}/${varianteCodigo} está repetida.`); continue; }
    vistos.add(chave);
    const alvo = indice.get(chave);
    if (!alvo) { erros.push(`Linha ${linha.__linha}: ${codigo}/${varianteCodigo} não existe na matriz atual.`); continue; }
    if (!habilidade) {
      atualizacoes.push({ codigo, variante: varianteCodigo, habilidadeEnem: '', habilidadeEnemConfianca: 'nao_informada' });
      continue;
    }
    const enem = resolverHabilidadeEnem(alvo.questao.area, habilidade);
    if (!enem) {
      erros.push(`Linha ${linha.__linha}: ${habilidade} não é válida para a área “${alvo.questao.area}” em ${codigo}/${varianteCodigo}.`);
      continue;
    }
    atualizacoes.push({
      codigo,
      variante: varianteCodigo,
      habilidadeEnem: enem.habilidadeCodigo,
      habilidadeEnemConfianca: confianca,
      areaCodigo: enem.areaCodigo,
      competenciaCodigo: enem.competenciaCodigo,
    });
  }
  if (!atualizacoes.length && !erros.length) avisos.push('Nenhuma linha de mapeamento foi encontrada.');
  return { atualizacoes, erros: [...new Set(erros)], avisos: [...new Set(avisos)] };
}

async function gerarModeloMatriz(simulado) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Axoriin — Diagnóstico de Simulados';
  const sheet = workbook.addWorksheet('MATRIZ');
  const larguras = [16, 10, 8, 15, 28, 14, 12, 25, 32, 38, 45, 18, 20, 38, 28, 16, 10, 12, 35];
  sheet.columns = CABECALHOS_MATRIZ.map((header, indice) => ({ header, key: header, width: larguras[indice] }));

  const existentes = [];
  for (const questao of simulado.questoes || []) {
    for (const item of questao.variantes || []) {
      existentes.push({
        CODIGO: questao.codigo, NUMERO: questao.numero, DIA: questao.dia,
        ORDEM_GLOBAL: questao.ordemGlobal, AREA: questao.area, VARIANTE: item.codigo,
        GABARITO: item.gabarito, COMPONENTE: item.componente, MACROCONTEUDO: item.macroconteudo, CONTEUDO: item.conteudo,
        HABILIDADE: item.habilidade, HABILIDADE_ENEM: item.habilidadeEnem || '', CONFIANCA_ENEM: item.habilidadeEnem ? (item.habilidadeEnemConfianca || 'direta').toUpperCase() : '', COMPETENCIA: item.competencia, DESCRITOR: item.descritor,
        DIFICULDADE: item.dificuldade === 'nao_informada' ? '' : item.dificuldade.toUpperCase(),
        PESO: questao.peso, ANULADA: questao.anulada ? 'SIM' : 'NAO', OBSERVACAO: questao.observacao,
      });
    }
  }
  sheet.addRows(existentes.length ? existentes : [
    { CODIGO: 'D1Q1', NUMERO: 1, DIA: 1, ORDEM_GLOBAL: 1, AREA: 'Linguagens', VARIANTE: 'INGLES', GABARITO: 'A', COMPONENTE: 'Língua Inglesa', MACROCONTEUDO: 'Leitura e interpretação', CONTEUDO: 'Exemplo — substitua', HABILIDADE: 'Exemplo — substitua', HABILIDADE_ENEM: '', CONFIANCA_ENEM: '', DIFICULDADE: 'MEDIA', PESO: 1, ANULADA: 'NAO' },
    { CODIGO: 'D1Q1', NUMERO: 1, DIA: 1, ORDEM_GLOBAL: 1, AREA: 'Linguagens', VARIANTE: 'ESPANHOL', GABARITO: 'C', COMPONENTE: 'Língua Espanhola', MACROCONTEUDO: 'Leitura e interpretação', CONTEUDO: 'Exemplo — substitua', HABILIDADE: 'Exemplo — substitua', HABILIDADE_ENEM: '', CONFIANCA_ENEM: '', DIFICULDADE: 'MEDIA', PESO: 1, ANULADA: 'NAO' },
    { CODIGO: 'D1Q5', NUMERO: 5, DIA: 1, ORDEM_GLOBAL: 5, AREA: 'Linguagens', VARIANTE: 'PADRAO', GABARITO: 'B', COMPONENTE: 'Língua Portuguesa', MACROCONTEUDO: 'Leitura e análise textual', CONTEUDO: 'Exemplo — substitua', HABILIDADE: 'Exemplo — substitua', HABILIDADE_ENEM: '', CONFIANCA_ENEM: '', DIFICULDADE: 'MEDIA', PESO: 1, ANULADA: 'NAO' },
  ]);
  estiloCabecalho(sheet, CABECALHOS_MATRIZ.length);
  sheet.dataValidations.add(`F2:F${Math.max(sheet.rowCount + 500, 600)}`, { type: 'list', allowBlank: false, formulae: ['"PADRAO,INGLES,ESPANHOL"'] });
  sheet.dataValidations.add(`G2:G${Math.max(sheet.rowCount + 500, 600)}`, { type: 'list', allowBlank: false, formulae: ['"A,B,C,D,E"'] });
  sheet.dataValidations.add(`L2:L${Math.max(sheet.rowCount + 500, 600)}`, { type: 'list', allowBlank: true, formulae: [`"${Array.from({ length: 30 }, (_, i) => `H${i + 1}`).join(',')}"`] });
  sheet.dataValidations.add(`O2:O${Math.max(sheet.rowCount + 500, 600)}`, { type: 'list', allowBlank: true, formulae: ['"FACIL,MEDIA,DIFICIL"'] });
  sheet.dataValidations.add(`Q2:Q${Math.max(sheet.rowCount + 500, 600)}`, { type: 'list', allowBlank: false, formulae: ['"NAO,SIM"'] });
  adicionarOrientacoes(workbook, 'MATRIZ PEDAGÓGICA DO SIMULADO', [
    'Mantenha um código único por questão. Em provas de dois dias, prefira D1Q1, D1Q2, D2Q1 etc.',
    'Para questão comum, use uma linha com VARIANTE = PADRAO.',
    'Para cada questão de língua estrangeira, use duas linhas com o mesmo código: uma INGLES e outra ESPANHOL.',
    'Nunca tente descobrir a língua pelo padrão de respostas. Ela será informada por aluno na importação.',
    'MACROCONTEUDO permite agrupar várias questões em um eixo pedagógico comum. Quando estiver vazio, o Axoriin usa COMPONENTE como eixo de fallback, sem inventar uma classificação.',
    'Conteúdo e HABILIDADE são campos internos de planejamento. HABILIDADE_ENEM é separado e recebe H1 a H30; CONFIANCA_ENEM registra DIRETA ou APROXIMADA para tornar o vínculo pedagógico transparente.',
    `Para HABILIDADE_ENEM, use a referência oficial ${FONTE_MATRIZ_ENEM.titulo} (${FONTE_MATRIZ_ENEM.orgao}, ${FONTE_MATRIZ_ENEM.ano}). O Axoriin valida o código pela área e não deduz a habilidade apenas pelo conteúdo.`,
    'Apague as linhas de exemplo antes de importar a matriz real.',
  ]);
  adicionarReferenciaEnem(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function gerarModeloRespostas(simulado, alunos = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Axoriin — Diagnóstico de Simulados';
  const sheet = workbook.addWorksheet('RESPOSTAS');
  const codigos = (simulado.questoes || []).map((item) => texto(item.codigo).toUpperCase());
  sheet.columns = [
    { header: 'ALUNO_ID', key: 'ALUNO_ID', width: 26 },
    { header: 'CODIGO_ACESSO', key: 'CODIGO_ACESSO', width: 18 },
    { header: 'NOME', key: 'NOME', width: 38 },
    { header: 'TURMA', key: 'TURMA', width: 16 },
    { header: 'IDIOMA', key: 'IDIOMA', width: 16 },
    ...codigos.map((codigo) => ({ header: codigo, key: codigo, width: 11 })),
  ];
  alunos.forEach((aluno) => sheet.addRow({
    ALUNO_ID: texto(aluno._id), CODIGO_ACESSO: texto(aluno.codigoAcesso),
    NOME: texto(aluno.nome), TURMA: texto(aluno.turma), IDIOMA: '',
  }));
  estiloCabecalho(sheet, CABECALHOS_ALUNO.length + codigos.length);
  const fim = Math.max(sheet.rowCount + 500, 600);
  sheet.dataValidations.add(`E2:E${fim}`, { type: 'list', allowBlank: true, formulae: ['"INGLES,ESPANHOL"'] });
  codigos.forEach((_codigo, indice) => {
    const letra = sheet.getColumn(CABECALHOS_ALUNO.length + indice + 1).letter;
    sheet.dataValidations.add(`${letra}2:${letra}${fim}`, { type: 'list', allowBlank: true, formulae: ['"A,B,C,D,E"'] });
  });
  sheet.getColumn('A').hidden = true;
  adicionarOrientacoes(workbook, 'RESPOSTAS DOS ALUNOS', [
    'Não altere ALUNO_ID, CODIGO_ACESSO, NOME ou TURMA nas linhas já preenchidas.',
    'Em IDIOMA, informe INGLES ou ESPANHOL para cada aluno que realizou questões de língua estrangeira.',
    'Deixe a célula da questão vazia quando a resposta não estiver disponível no arquivo-fonte.',
    'Para registrar que o aluno marcou a questão em branco, escreva BRANCO.',
    'As respostas válidas são A, B, C, D e E.',
    'O Axoriin fará uma conferência antes de gravar qualquer resultado.',
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = {
  MIME_XLSX,
  CABECALHOS_MATRIZ,
  CABECALHOS_ALUNO,
  detectarFormato,
  sha256,
  lerTabela,
  analisarMatriz,
  analisarRespostas,
  totaisImportacao,
  gerarModeloMatriz,
  gerarModeloMapeamentoEnem,
  analisarMapeamentoEnem,
  gerarModeloRespostas,
};
