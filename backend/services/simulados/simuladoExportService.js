'use strict';

const ExcelJS = require('exceljs');
const { texto } = require('./simuladoAnaliseService');

const CORES = {
  cabecalho: 'FF0F766E',
  escuro: 'FF0F172A',
  claro: 'FFF0FDFA',
  prioridade: 'FFFEE2E2',
  desenvolvimento: 'FFFFF7ED',
  consolidado: 'FFECFDF5',
};

function percentual(value) {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero / 100 : 0;
}

function formatarPlanilha(sheet) {
  if (!sheet.columnCount) return;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CORES.cabecalho } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
  });
}

function pintarNivel(row, nivel) {
  const cor = {
    prioritario: CORES.prioridade,
    em_desenvolvimento: CORES.desenvolvimento,
    consolidado: CORES.consolidado,
  }[nivel];
  if (cor) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
}

function colunaPercentual(sheet, keys) {
  keys.forEach((key) => {
    const column = sheet.getColumn(key);
    column.numFmt = '0.0%';
  });
}

function adicionarMetricas(workbook, nome, metricas = []) {
  const sheet = workbook.addWorksheet(nome);
  sheet.columns = [
    { header: 'ITEM', key: 'item', width: 42 },
    { header: 'NÍVEL', key: 'nivel', width: 24 },
    { header: 'QUESTÕES', key: 'questoes', width: 12 },
    { header: 'QUESTÕES COM MAPEAMENTO APROX.', key: 'questoesAproximadas', width: 30 },
    { header: 'CONFIANÇA DO MAPEAMENTO', key: 'confiancaMapeamento', width: 24 },
    { header: 'ESTUDANTES', key: 'estudantes', width: 14 },
    { header: 'EVIDÊNCIAS', key: 'evidencias', width: 14 },
    { header: '% ACERTO NAS RESPOSTAS MARCADAS', key: 'acerto', width: 25 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'pontuacao', width: 27 },
    { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'ACERTOS', key: 'acertos', width: 12 },
    { header: 'ERROS', key: 'erros', width: 12 },
    { header: 'BRANCOS', key: 'brancos', width: 12 },
    { header: 'NÃO IMPORTADAS', key: 'naoInformadas', width: 18 },
    { header: 'IDIOMA PENDENTE', key: 'pendentesIdioma', width: 18 },
    { header: 'SEM OPÇÃO DE LÍNGUA', key: 'semOpcaoIdioma', width: 21 },
  ];
  metricas.forEach((item) => {
    const row = sheet.addRow({
      item: item.rotulo,
      nivel: String(item.nivel || '').replaceAll('_', ' '),
      questoes: item.questoes ?? item.totalQuestoes,
      estudantes: item.estudantes ?? item.estudantesComEvidencia,
      evidencias: item.evidencias ?? item.observadas,
      acerto: percentual(item.percentualAcerto),
      pontuacao: percentual(item.percentualPontuacao),
      cobertura: percentual(item.coberturaPercentual),
      acertos: item.acertos,
      erros: item.erros,
      brancos: item.brancos,
      naoInformadas: item.naoInformadas,
      pendentesIdioma: item.pendentesIdioma,
      semOpcaoIdioma: item.semOpcaoIdioma,
    });
    pintarNivel(row, item.nivel);
  });
  formatarPlanilha(sheet);
  colunaPercentual(sheet, ['acerto', 'pontuacao', 'cobertura']);
  return sheet;
}

function adicionarDiagnosticoEnem(workbook, dashboard) {
  const habilidades = workbook.addWorksheet('HABILIDADES ENEM');
  habilidades.columns = [
    { header: 'ÁREA', key: 'area', width: 34 },
    { header: 'COMPETÊNCIA', key: 'competencia', width: 16 },
    { header: 'DESCRIÇÃO DA COMPETÊNCIA', key: 'descricaoCompetencia', width: 68 },
    { header: 'HABILIDADE', key: 'habilidade', width: 14 },
    { header: 'DESCRIÇÃO DA HABILIDADE', key: 'descricaoHabilidade', width: 88 },
    { header: 'QUESTÕES', key: 'questoes', width: 12 },
    { header: 'ESTUDANTES', key: 'estudantes', width: 14 },
    { header: 'EVIDÊNCIAS', key: 'evidencias', width: 14 },
    { header: '% ACERTO NAS MARCADAS', key: 'acerto', width: 23 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'desempenho', width: 27 },
    { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'LEITURA DA EVIDÊNCIA', key: 'leitura', width: 25 },
  ];
  (dashboard.porHabilidadeEnem || []).forEach((item) => habilidades.addRow({
    area: item.areaNome,
    competencia: item.competenciaCodigo,
    descricaoCompetencia: item.competenciaDescricao,
    habilidade: item.codigo || item.habilidadeCodigo,
    descricaoHabilidade: item.descricao || item.habilidadeDescricao,
    questoes: item.questoes,
    questoesAproximadas: item.questoesAproximadas || 0,
    confiancaMapeamento: String(item.confiancaMapeamento || 'direta').replaceAll('_', ' '),
    estudantes: item.estudantesComEvidencia,
    evidencias: item.evidencias,
    acerto: percentual(item.percentualAcerto),
    desempenho: percentual(item.percentualPontuacao),
    cobertura: percentual(item.coberturaPercentual),
    leitura: item.leituraEvidencia === 'indicativa_um_item' ? 'indicativa — 1 item' : String(item.nivel || item.leituraEvidencia || '').replaceAll('_', ' '),
  }));
  formatarPlanilha(habilidades);
  colunaPercentual(habilidades, ['acerto', 'desempenho', 'cobertura']);

  const competencias = workbook.addWorksheet('COMPETÊNCIAS ENEM');
  competencias.columns = [
    { header: 'ÁREA', key: 'area', width: 34 },
    { header: 'COMPETÊNCIA', key: 'competencia', width: 16 },
    { header: 'DESCRIÇÃO', key: 'descricao', width: 88 },
    { header: 'HABILIDADES TRABALHADAS', key: 'habilidades', width: 24 },
    { header: 'QUESTÕES', key: 'questoes', width: 12 },
    { header: 'ESTUDANTES', key: 'estudantes', width: 14 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'desempenho', width: 27 },
    { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'LEITURA', key: 'leitura', width: 24 },
  ];
  (dashboard.porCompetenciaEnem || []).forEach((item) => competencias.addRow({
    area: item.areaNome,
    competencia: item.codigo || item.competenciaCodigo,
    descricao: item.descricao || item.competenciaDescricao,
    habilidades: item.habilidades,
    questoes: item.questoes,
    estudantes: item.estudantesComEvidencia,
    desempenho: percentual(item.percentualPontuacao),
    cobertura: percentual(item.coberturaPercentual),
    leitura: item.leituraEvidencia === 'indicativa_um_item' ? 'indicativa — 1 item' : String(item.nivel || item.leituraEvidencia || '').replaceAll('_', ' '),
  }));
  formatarPlanilha(competencias);
  colunaPercentual(competencias, ['desempenho', 'cobertura']);

  const cobertura = workbook.addWorksheet('COBERTURA ENEM');
  cobertura.columns = [
    { header: 'ÁREA', key: 'area', width: 34 },
    { header: 'HABILIDADES TRABALHADAS', key: 'habilidades', width: 24 },
    { header: 'TOTAL HABILIDADES DA MATRIZ', key: 'total', width: 28 },
    { header: '% DA MATRIZ DE HABILIDADES', key: 'percentualMatriz', width: 28 },
    { header: 'COMPETÊNCIAS TRABALHADAS', key: 'competencias', width: 27 },
    { header: 'QUESTÕES MAPEADAS', key: 'questoes', width: 20 },
    { header: 'VARIANTES MAPEADAS', key: 'variantes', width: 20 },
    { header: 'VÍNCULOS DIRETOS', key: 'diretas', width: 18 },
    { header: 'VÍNCULOS APROXIMADOS', key: 'aproximadas', width: 22 },
  ];
  (dashboard.coberturaEnem?.areas || []).forEach((item) => cobertura.addRow({
    area: item.areaNome,
    habilidades: item.habilidadesTrabalhadas,
    total: item.totalHabilidadesMatriz,
    percentualMatriz: percentual(item.percentualHabilidadesMatriz),
    competencias: item.competenciasTrabalhadas,
    questoes: item.questoesMapeadas,
    variantes: item.variantesMapeadas,
    diretas: item.variantesMapeadasDiretas || 0,
    aproximadas: item.variantesMapeadasAproximadas || 0,
  }));
  formatarPlanilha(cobertura);
  colunaPercentual(cobertura, ['percentualMatriz']);

  const naoMapeadas = workbook.addWorksheet('ENEM NÃO MAPEADO');
  naoMapeadas.columns = [
    { header: 'QUESTÃO', key: 'questao', width: 16 },
    { header: 'VARIANTE', key: 'variante', width: 14 },
    { header: 'ÁREA', key: 'area', width: 30 },
    { header: 'COMPONENTE', key: 'componente', width: 26 },
    { header: 'CONTEÚDO', key: 'conteudo', width: 58 },
  ];
  (dashboard.coberturaEnem?.naoMapeadas || []).forEach((item) => naoMapeadas.addRow({
    questao: item.codigoQuestao, variante: item.variante, area: item.area, componente: item.componente, conteudo: item.conteudo,
  }));
  formatarPlanilha(naoMapeadas);
}

async function gerarRelatorioDiagnostico({ simulado, dashboard, resultados = [], comparacao = null }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Axoriin — Diagnóstico de Simulados';
  workbook.company = 'Axoriin';
  workbook.created = new Date();

  const resumo = workbook.addWorksheet('RESUMO');
  resumo.columns = [
    { header: 'INDICADOR', key: 'indicador', width: 40 },
    { header: 'VALOR', key: 'valor', width: 42 },
  ];
  const r = dashboard.resumo || {};
  [
    ['Simulado', simulado.titulo],
    ['Código', simulado.codigo],
    ['Ano letivo', simulado.anoLetivo],
    ['Participantes', r.participantes],
    ['Turmas', r.turmas],
    ['% de desempenho confirmado', `${Number(r.percentualPontuacao || 0).toFixed(1)}%`],
    ['% de acerto nas respostas marcadas', `${Number(r.percentualAcerto || 0).toFixed(1)}%`],
    ['Cobertura dos dados', `${Number(r.coberturaPercentual || 0).toFixed(1)}%`],
    ['Respostas observadas', `${r.observadas || 0} de ${r.aplicaveis || 0} aplicáveis`],
    ['Respostas em branco', r.brancos],
    ['Respostas não importadas', r.naoInformadas],
    ['Participação completa + base adequada', r.alunosBaseAdequada],
    ['Participação parcial confirmada', r.alunosParticipacaoParcial],
    ['Base realmente incompleta', r.alunosBaseIncompleta],
    ['Alunos com língua pendente', r.alunosIdiomaPendente],
    ['Alunos que não marcaram língua', r.alunosSemOpcaoIdioma],
    ['Critério consolidado', `A partir de ${dashboard.configuracao.percentualConsolidado}%`],
    ['Critério prioritário', `Abaixo de ${dashboard.configuracao.percentualAtencao}%`],
    ['Fórmula do desempenho', 'Pontos obtidos ÷ pontos possíveis nas respostas confirmadas. Branco vale zero; dado ausente não entra na conta e reduz a cobertura.'],
    ['Observação', 'Brancos, respostas ausentes, língua pendente e língua não marcada são separados. Os percentuais são acertos brutos para diagnóstico e não representam a TRI oficial do ENEM.'],
    ...(simulado.tipo === 'enem' ? [
      ['Matriz ENEM', dashboard.coberturaEnem?.fonte ? `${dashboard.coberturaEnem.fonte.titulo} — ${dashboard.coberturaEnem.fonte.orgao}, ${dashboard.coberturaEnem.fonte.ano}` : 'Matriz de Referência ENEM'],
      ['Mapeamento ENEM', `${dashboard.coberturaEnem?.variantesMapeadas || 0} de ${dashboard.coberturaEnem?.variantesElegiveis || 0} variantes mapeadas; ${dashboard.coberturaEnem?.variantesMapeadasDiretas || 0} diretas e ${dashboard.coberturaEnem?.variantesMapeadasAproximadas || 0} aproximadas`],
    ] : []),
  ].forEach(([indicador, valor]) => resumo.addRow({ indicador, valor }));
  formatarPlanilha(resumo);

  const alunos = workbook.addWorksheet('ALUNOS');
  alunos.columns = [
    { header: 'ALUNO', key: 'aluno', width: 38 },
    { header: 'TURMA', key: 'turma', width: 16 },
    { header: 'IDIOMA', key: 'idioma', width: 24 },
    { header: 'PARTICIPAÇÃO', key: 'participacao', width: 24 },
    { header: 'DIAS AUSENTES', key: 'diasAusentes', width: 18 },
    { header: 'SITUAÇÃO DA BASE', key: 'situacaoBase', width: 42 },
    { header: 'ACERTOS', key: 'acertos', width: 12 },
    { header: 'RESPONDIDAS', key: 'respondidas', width: 14 },
    { header: 'BRANCOS', key: 'brancos', width: 12 },
    { header: 'SEM OPÇÃO DE LÍNGUA', key: 'semOpcaoIdioma', width: 21 },
    { header: 'NÃO IMPORTADAS', key: 'naoInformadas', width: 18 },
    { header: '% ACERTO NAS RESPOSTAS MARCADAS', key: 'acerto', width: 25 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'pontuacao', width: 27 },
    { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'PRIORIDADES', key: 'prioridades', width: 56 },
    { header: 'AVISOS', key: 'avisos', width: 56 },
  ];
  resultados.forEach((item) => {
    const prioridades = [...(item.porHabilidadeEnem || []), ...(item.porHabilidade || []), ...(item.porConteudo || [])]
      .filter((metrica) => metrica.nivel === 'prioritario' && metrica.evidenciaSuficiente && metrica.chave !== 'NAO_CLASSIFICADO')
      .sort((a, b) => a.percentualPontuacao - b.percentualPontuacao)
      .slice(0, 5)
      .map((metrica) => `${metrica.rotulo} (${Number(metrica.percentualPontuacao).toFixed(1)}%; ${metrica.observadas || metrica.totalQuestoes || 0} evidências)`)
      .join(' | ');
    const diasAusentes = (item.diasAusentes || []).map(Number).filter(Boolean).sort((a, b) => a - b);
    const cobertura = Number(item.resumoGeral?.coberturaPercentual || 0);
    const idiomaPendente = Number(item.resumoGeral?.pendentesIdioma || 0) > 0;
    const participacaoParcial = diasAusentes.length > 0;
    const minimoCobertura = Number(dashboard.configuracao?.minimoCoberturaIndividual || 80);
    const baseAdequadaNoEscopo = !idiomaPendente && cobertura >= minimoCobertura;
    const baseAdequadaGlobal = !participacaoParcial && baseAdequadaNoEscopo;
    const situacaoBase = participacaoParcial
      ? (baseAdequadaNoEscopo
        ? 'Participação parcial confirmada — dias/áreas realizados com base adequada'
        : 'Participação parcial confirmada + base do realizado incompleta — conferir antes de concluir')
      : (baseAdequadaGlobal ? 'Participação completa — base adequada para classificação global' : 'Base realmente incompleta — conferir antes de conclusão global');
    alunos.addRow({
      aluno: item.alunoNomeSnapshot,
      turma: item.alunoTurmaSnapshot,
      idioma: item.idiomaEstrangeiroEfetivo || item.idiomaEstrangeiro,
      participacao: participacaoParcial ? 'Parcial confirmada' : 'Completa',
      diasAusentes: diasAusentes.map((dia) => `${dia}º dia`).join(', '),
      situacaoBase,
      acertos: item.resumoGeral?.acertos || 0,
      respondidas: item.resumoGeral?.respondidas || 0,
      brancos: item.resumoGeral?.brancos || 0,
      semOpcaoIdioma: item.resumoGeral?.semOpcaoIdioma || 0,
      naoInformadas: item.resumoGeral?.naoInformadas || 0,
      acerto: percentual(item.resumoGeral?.percentualAcerto),
      pontuacao: percentual(item.resumoGeral?.percentualPontuacao),
      cobertura: percentual(item.resumoGeral?.coberturaPercentual),
      prioridades,
      avisos: (item.avisos || []).join(' | '),
    });
  });
  formatarPlanilha(alunos);
  colunaPercentual(alunos, ['acerto', 'pontuacao', 'cobertura']);

  const turmas = workbook.addWorksheet('TURMAS');
  turmas.columns = [
    { header: 'TURMA', key: 'turma', width: 20 },
    { header: 'ALUNOS', key: 'alunos', width: 12 },
    { header: '% ACERTO NAS RESPOSTAS MARCADAS', key: 'acerto', width: 25 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'pontuacao', width: 27 },
    { header: 'COBERTURA MÉDIA', key: 'cobertura', width: 20 },
    { header: 'NÍVEL', key: 'nivel', width: 24 },
  ];
  (dashboard.porTurma || []).forEach((item) => {
    const row = turmas.addRow({
      turma: item.turma, alunos: item.alunos, acerto: percentual(item.percentualAcerto),
      pontuacao: percentual(item.percentualPontuacao), cobertura: percentual(item.coberturaPercentual),
      nivel: String(item.nivel || '').replaceAll('_', ' '),
    });
    pintarNivel(row, item.nivel);
  });
  formatarPlanilha(turmas);
  colunaPercentual(turmas, ['acerto', 'pontuacao', 'cobertura']);

  const series = workbook.addWorksheet('SÉRIES');
  series.columns = [
    { header: 'SÉRIE', key: 'serie', width: 24 },
    { header: 'ALUNOS', key: 'alunos', width: 12 },
    { header: '% ACERTO NAS RESPOSTAS MARCADAS', key: 'acerto', width: 25 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'pontuacao', width: 27 },
    { header: 'COBERTURA MÉDIA', key: 'cobertura', width: 20 },
    { header: 'NÍVEL', key: 'nivel', width: 24 },
  ];
  (dashboard.porSerie || []).forEach((item) => {
    const row = series.addRow({
      serie: item.serie, alunos: item.alunos, acerto: percentual(item.percentualAcerto),
      pontuacao: percentual(item.percentualPontuacao), cobertura: percentual(item.coberturaPercentual),
      nivel: String(item.nivel || '').replaceAll('_', ' '),
    });
    pintarNivel(row, item.nivel);
  });
  formatarPlanilha(series);
  colunaPercentual(series, ['acerto', 'pontuacao', 'cobertura']);

  adicionarMetricas(workbook, 'DIAS', dashboard.porDia);
  adicionarMetricas(workbook, 'ÁREAS', dashboard.porArea);
  adicionarMetricas(workbook, 'COMPONENTES', dashboard.porComponente);
  adicionarMetricas(workbook, 'EIXOS PEDAGÓGICOS', dashboard.porEixo);
  adicionarMetricas(workbook, 'CONTEÚDOS', dashboard.porConteudo);
  adicionarMetricas(workbook, 'HABILIDADES', dashboard.porHabilidade);
  adicionarMetricas(workbook, 'COMPETÊNCIAS', dashboard.porCompetencia);
  adicionarMetricas(workbook, 'DESCRITORES', dashboard.porDescritor);
  adicionarMetricas(workbook, 'DIFICULDADE', dashboard.porDificuldade);

  if (simulado.tipo === 'enem' || dashboard.coberturaEnem) adicionarDiagnosticoEnem(workbook, dashboard);

  const questoes = workbook.addWorksheet('QUESTÕES');
  questoes.columns = [
    { header: 'CÓDIGO', key: 'codigo', width: 16 }, { header: 'DIA', key: 'dia', width: 8 },
    { header: 'NÚMERO', key: 'numero', width: 10 }, { header: 'VARIANTE', key: 'variante', width: 14 },
    { header: 'ÁREA', key: 'area', width: 28 }, { header: 'COMPONENTE', key: 'componente', width: 25 },
    { header: 'MACROCONTEÚDO', key: 'macroconteudo', width: 30 }, { header: 'EIXO PEDAGÓGICO', key: 'eixo', width: 30 },
    { header: 'CONTEÚDO', key: 'conteudo', width: 38 }, { header: 'HABILIDADE', key: 'habilidade', width: 48 },
    { header: 'HABILIDADE ENEM', key: 'habilidadeEnem', width: 18 }, { header: 'DESCRIÇÃO HABILIDADE ENEM', key: 'habilidadeEnemDescricao', width: 72 },
    { header: 'CONFIANÇA ENEM', key: 'habilidadeEnemConfianca', width: 20 },
    { header: 'COMPETÊNCIA ENEM', key: 'competenciaEnem', width: 18 }, { header: 'DESCRIÇÃO COMPETÊNCIA ENEM', key: 'competenciaEnemDescricao', width: 72 },
    { header: 'GABARITO', key: 'gabarito', width: 12 }, { header: 'RESPONDENTES', key: 'respondentes', width: 16 },
    { header: 'ACERTOS', key: 'acertos', width: 12 }, { header: 'ERROS', key: 'erros', width: 12 },
    { header: 'BRANCOS', key: 'brancos', width: 12 }, { header: 'NÃO IMPORTADAS', key: 'naoInformadas', width: 18 },
    { header: 'SEM OPÇÃO DE LÍNGUA', key: 'semOpcaoIdioma', width: 21 },
    { header: '% ACERTO NAS RESPOSTAS MARCADAS', key: 'precisao', width: 25 },
    { header: '% DESEMPENHO CONFIRMADO', key: 'percentual', width: 27 },
    { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'DISTRATOR DOMINANTE', key: 'distrator', width: 21 },
    { header: '% DOS ERROS NO DISTRATOR', key: 'concentracao', width: 25 },
    { header: 'FAIXA DE ACERTO DO ITEM', key: 'faixaItem', width: 24 },
    { header: 'DISCRIMINAÇÃO (P.P.)', key: 'discriminacao', width: 22 },
    { header: 'LEITURA DA DISCRIMINAÇÃO', key: 'leituraDiscriminacao', width: 25 },
    { header: 'NATUREZA DA EVIDÊNCIA', key: 'natureza', width: 23 },
  ];
  (dashboard.questoes || []).forEach((item) => {
    const row = questoes.addRow({
      codigo: item.codigoQuestao, dia: item.dia, numero: item.numero, variante: item.variante,
      area: item.area, componente: item.componente, macroconteudo: item.macroconteudo, eixo: item.eixoPedagogico, conteudo: item.conteudo, habilidade: item.habilidade,
      habilidadeEnem: item.habilidadeEnemCodigo, habilidadeEnemDescricao: item.habilidadeEnemDescricao,
      habilidadeEnemConfianca: item.habilidadeEnemConfianca ? String(item.habilidadeEnemConfianca).toUpperCase() : '',
      competenciaEnem: item.competenciaEnemCodigo, competenciaEnemDescricao: item.competenciaEnemDescricao,
      gabarito: item.gabarito, respondentes: item.respondentes, acertos: item.acertos, erros: item.erros,
      brancos: item.brancos, naoInformadas: item.naoInformadas, semOpcaoIdioma: item.semOpcaoIdioma,
      precisao: percentual(item.percentualAcerto), percentual: percentual(item.percentualPontuacao),
      cobertura: percentual(item.coberturaPercentual), distrator: item.distratorDominante,
      concentracao: percentual(item.concentracaoDistrator), faixaItem: String(item.leituraQuestao || '').replaceAll('_', ' '),
      discriminacao: item.discriminacao?.disponivel ? Number(item.discriminacao.indice || 0) : '',
      leituraDiscriminacao: item.discriminacao?.disponivel ? String(item.discriminacao.leitura || '').replaceAll('_', ' ') : 'amostra insuficiente',
      natureza: item.naturezaEvidencia === 'procedimental' ? 'procedimental' : 'pedagógica',
    });
  });
  formatarPlanilha(questoes);
  colunaPercentual(questoes, ['precisao', 'percentual', 'cobertura', 'concentracao']);

  const grupos = workbook.addWorksheet('GRUPOS DE INTERVENÇÃO');
  grupos.columns = [
    { header: 'ALCANCE', key: 'alcance', width: 28 },
    { header: 'HABILIDADE / CONTEÚDO', key: 'alvo', width: 52 },
    { header: 'QUANTIDADE', key: 'quantidade', width: 14 },
    { header: '% DO RECORTE', key: 'percentual', width: 16 },
    { header: 'ALUNOS', key: 'alunos', width: 90 },
  ];
  const agrupamentosExport = [
    ...(dashboard.intervencoesAmplas || []).map((grupo) => ({ ...grupo, alcanceRotulo: 'Intervenção ampla / por turma' })),
    ...(dashboard.gruposIntervencao || []).map((grupo) => ({ ...grupo, alcanceRotulo: 'Pequeno grupo' })),
  ];
  agrupamentosExport.forEach((grupo) => grupos.addRow({
    alcance: grupo.alcanceRotulo,
    alvo: grupo.rotulo,
    quantidade: grupo.alunos.length,
    percentual: percentual(grupo.percentualParticipantes),
    alunos: grupo.alunos.map((aluno) => `${aluno.nome} — ${aluno.turma} (${Number(aluno.percentualPontuacao).toFixed(1)}%; ${aluno.evidencias || 0} evidências)`).join(' | '),
  }));
  formatarPlanilha(grupos);

  const alertas = workbook.addWorksheet('ALERTAS DE INTEGRIDADE');
  alertas.columns = [
    { header: 'TIPO', key: 'tipo', width: 28 }, { header: 'SEVERIDADE', key: 'severidade', width: 16 },
    { header: 'ALERTA', key: 'titulo', width: 46 }, { header: 'MENSAGEM', key: 'mensagem', width: 78 },
    { header: 'AÇÃO SUGERIDA', key: 'acao', width: 78 }, { header: 'BASE DA EVIDÊNCIA', key: 'evidencia', width: 78 },
  ];
  (dashboard.alertasIntegridade || []).forEach((item) => alertas.addRow({
    tipo: item.tipo, severidade: item.severidade, titulo: item.titulo, mensagem: item.mensagem,
    acao: item.acaoSugerida, evidencia: item.evidencia,
  }));
  formatarPlanilha(alertas);

  const acoes = workbook.addWorksheet('PRIORIDADES PEDAGÓGICAS');
  acoes.columns = [
    { header: 'PRIORIDADE', key: 'prioridade', width: 12 }, { header: 'FOCO', key: 'foco', width: 38 },
    { header: 'POR QUÊ', key: 'porque', width: 70 }, { header: 'AÇÃO SUGERIDA', key: 'acao', width: 70 },
    { header: 'BASE DA EVIDÊNCIA', key: 'evidencia', width: 70 },
  ];
  (dashboard.prioridadesPedagogicas || dashboard.acoesGestao || []).forEach((item) => acoes.addRow({
    prioridade: item.prioridade, foco: item.titulo, porque: item.porQue,
    acao: item.acaoSugerida, evidencia: item.evidencia,
  }));
  formatarPlanilha(acoes);

  const prioritarios = workbook.addWorksheet('ALUNOS PRIORITÁRIOS');
  prioritarios.columns = [
    { header: 'ALUNO', key: 'aluno', width: 38 }, { header: 'TURMA', key: 'turma', width: 16 },
    { header: 'DESEMPENHO CONFIRMADO', key: 'desempenho', width: 27 }, { header: 'COBERTURA', key: 'cobertura', width: 14 },
    { header: 'ALVOS PRIORITÁRIOS', key: 'alvos', width: 90 },
  ];
  (dashboard.alunosPrioritarios || []).forEach((item) => prioritarios.addRow({
    aluno: item.nome, turma: item.turma, desempenho: percentual(item.percentualPontuacao),
    cobertura: percentual(item.coberturaPercentual),
    alvos: (item.necessidades || []).map((alvo) => `${alvo.rotulo} (${Number(alvo.percentualPontuacao).toFixed(1)}%)`).join(' | '),
  }));
  formatarPlanilha(prioritarios);
  colunaPercentual(prioritarios, ['desempenho', 'cobertura']);

  if (comparacao?.alunosComparados) {
    const evolucao = workbook.addWorksheet('EVOLUÇÃO');
    evolucao.columns = [
      { header: 'ALUNO', key: 'aluno', width: 38 }, { header: 'TURMA', key: 'turma', width: 16 },
      { header: 'ANTERIOR', key: 'anterior', width: 14 }, { header: 'ATUAL', key: 'atual', width: 14 },
      { header: 'VARIAÇÃO', key: 'variacao', width: 14 },
    ];
    comparacao.alunos.forEach((item) => evolucao.addRow({
      aluno: item.nome, turma: item.turma, anterior: percentual(item.anterior),
      atual: percentual(item.atual), variacao: Number(item.variacao) / 100,
    }));
    formatarPlanilha(evolucao);
    colunaPercentual(evolucao, ['anterior', 'atual', 'variacao']);
  }

  workbook.worksheets.forEach((sheet) => {
    sheet.properties.defaultRowHeight = 20;
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function nomeSeguro(value) {
  return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'simulado';
}

module.exports = { gerarRelatorioDiagnostico, nomeSeguro };
