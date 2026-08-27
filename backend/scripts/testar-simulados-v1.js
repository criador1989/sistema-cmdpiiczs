'use strict';

const assert = require('assert/strict');
const {
  normalizarIdioma,
  normalizarResposta,
  contextoIdiomaResultado,
  avaliarResultado,
  agregarDashboard,
  compararResultados,
  serieDaTurma,
  configuracao,
  classificarFaixaOperacional,
} = require('../services/simulados/simuladoAnaliseService');
const {
  recuperarVinculos,
  respostasConfirmadas,
  mesclarRespostas,
} = require('../services/simulados/simuladoSubstituicaoService');

const simulado = {
  configuracaoAnalise: {
    percentualConsolidado: 70,
    percentualAtencao: 50,
    minimoQuestoesIndicador: 1,
    minimoRespondentesQuestao: 1,
    minimoAlunosGrupo: 1,
  },
  questoes: [
    {
      codigo: 'D1Q1', numero: 1, dia: 1, area: 'Linguagens', peso: 1,
      variantes: [
        { codigo: 'INGLES', gabarito: 'A', componente: 'Língua Inglesa', conteudo: 'Leitura', habilidade: 'Inferir sentido' },
        { codigo: 'ESPANHOL', gabarito: 'C', componente: 'Língua Espanhola', conteudo: 'Lectura', habilidade: 'Inferir sentido' },
      ],
    },
    {
      codigo: 'D1Q2', numero: 2, dia: 1, area: 'Linguagens', peso: 1,
      variantes: [
        { codigo: 'INGLES', gabarito: 'B', componente: 'Língua Inglesa', conteudo: 'Vocabulário', habilidade: 'Reconhecer vocabulário' },
        { codigo: 'ESPANHOL', gabarito: 'D', componente: 'Língua Espanhola', conteudo: 'Vocabulario', habilidade: 'Reconhecer vocabulário' },
      ],
    },
    {
      codigo: 'D1Q5', numero: 5, dia: 1, area: 'Matemática', peso: 2,
      variantes: [{ codigo: 'PADRAO', gabarito: 'E', componente: 'Matemática', macroconteudo: 'Raciocínio quantitativo', conteudo: 'Porcentagem', habilidade: 'Resolver porcentagem' }],
    },
    {
      codigo: 'D1Q6', numero: 6, dia: 1, area: 'Matemática', peso: 1,
      variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Matemática', macroconteudo: 'Raciocínio quantitativo', conteudo: 'Geometria', habilidade: 'Calcular área' }],
    },
  ],
};

assert.equal(normalizarIdioma('inglês'), 'INGLES');
assert.equal(normalizarIdioma('español'), 'ESPANHOL');
assert.equal(normalizarIdioma('não marcou'), 'NAO_MARCADO');
assert.equal(normalizarIdioma('nenhuma'), 'NAO_MARCADO');
assert.deepEqual(normalizarResposta('branco'), { informada: true, resposta: '' });
assert.deepEqual(normalizarResposta(''), { informada: false, resposta: '' });
assert.equal(normalizarResposta('Z').invalida, true);
assert.equal(serieDaTurma('3º A', simulado), '3º ano/série');

const semIdioma = avaliarResultado(simulado, {
  idiomaEstrangeiro: '',
  respostas: { D1Q1: 'A', D1Q2: 'B', D1Q5: 'E', D1Q6: 'BRANCO' },
});
assert.equal(semIdioma.resumoGeral.pendentesIdioma, 2, 'Questões de idioma devem ficar pendentes.');
assert.equal(semIdioma.resumoGeral.pontuaveis, 2, 'Idioma pendente não pode entrar no denominador.');
assert.equal(semIdioma.resumoGeral.acertos, 1);
assert.equal(semIdioma.resumoGeral.brancos, 1);
assert.equal(semIdioma.resumoGeral.pontosPossiveis, 3);
assert.equal(semIdioma.resumoGeral.pontosObtidos, 2);
assert.equal(semIdioma.respostas[0].situacao, 'IDIOMA_PENDENTE');
assert.ok(semIdioma.avisos.some((item) => item.includes('língua estrangeira')));

const ingles = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'INGLES',
  respostas: { D1Q1: 'A', D1Q2: 'B', D1Q5: 'E' },
});
assert.equal(ingles.resumoGeral.acertos, 3);
assert.equal(ingles.resumoGeral.naoInformadas, 1);
assert.equal(ingles.resumoGeral.percentualAcerto, 100);
assert.equal(ingles.resumoGeral.percentualPontuacao, 100, 'Dado ausente não pode ser tratado como erro.');
assert.equal(ingles.resumoGeral.coberturaPercentual, 75, 'A cobertura deve revelar o dado ausente.');
assert.equal(ingles.respostas[0].variante, 'INGLES');

const espanhol = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'ESPANHOL',
  respostas: { D1Q1: 'A', D1Q2: 'B', D1Q5: 'E', D1Q6: '' },
});
assert.equal(espanhol.resumoGeral.acertos, 1);
assert.equal(espanhol.resumoGeral.erros, 2);
assert.equal(espanhol.resumoGeral.naoInformadas, 1);
assert.equal(espanhol.respostas[0].gabarito, 'C');

const linguaNaoMarcada = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'NAO_MARCADO',
  respostas: { D1Q1: 'A', D1Q2: 'B', D1Q5: 'E', D1Q6: 'A' },
});
assert.equal(linguaNaoMarcada.idiomaEstrangeiro, 'NAO_MARCADO');
assert.equal(linguaNaoMarcada.resumoGeral.semOpcaoIdioma, 2);
assert.equal(linguaNaoMarcada.resumoGeral.observadas, 4);
assert.equal(linguaNaoMarcada.resumoGeral.pontosPossiveis, 5);
assert.equal(linguaNaoMarcada.resumoGeral.pontosObtidos, 3);
assert.equal(linguaNaoMarcada.resumoGeral.percentualPontuacao, 60);
assert.ok(linguaNaoMarcada.respostas.slice(0, 2).every((item) => item.situacao === 'IDIOMA_NAO_MARCADO'));
assert.ok(linguaNaoMarcada.respostas.slice(0, 2).every((item) => item.variante === 'SEM_OPCAO'));
assert.ok(linguaNaoMarcada.respostas.slice(0, 2).every((item) => !/Inglesa|Espanhola/.test(item.componente)));

const respostasPreservadasAposProcessamento = {};
linguaNaoMarcada.respostas.forEach((item) => {
  if (item.respostaInformada) respostasPreservadasAposProcessamento[item.codigoQuestao] = item.resposta || 'BRANCO';
});
const linguaCorrigidaDepois = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'INGLES',
  respostas: respostasPreservadasAposProcessamento,
});
assert.equal(linguaCorrigidaDepois.respostas[0].resposta, 'A', 'A correção posterior de idioma deve preservar a resposta já marcada.');
assert.equal(linguaCorrigidaDepois.respostas[1].resposta, 'B', 'A correção posterior de idioma deve preservar a segunda resposta já marcada.');
assert.equal(linguaCorrigidaDepois.respostas[0].variante, 'INGLES', 'A resposta preservada deve ser reavaliada pela variante confirmada depois.');
assert.equal(linguaCorrigidaDepois.resumoGeral.semOpcaoIdioma, 0, 'Após confirmar a língua, o zero procedimental por falta de opção deve desaparecer.');
assert.equal(linguaCorrigidaDepois.resumoGeral.acertos, 4, 'O diagnóstico deve ser recalculado a partir das respostas preservadas e do novo idioma.');

const brancoExplicito = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'INGLES',
  respostas: { D1Q1: 'BRANCO', D1Q2: 'B' },
});
assert.equal(brancoExplicito.resumoGeral.brancos, 1);
assert.equal(brancoExplicito.resumoGeral.percentualAcerto, 100, 'A taxa de acerto marcada usa somente alternativas A–E.');
assert.equal(brancoExplicito.resumoGeral.percentualPontuacao, 50, 'Branco explícito deve valer zero no desempenho.');
assert.equal(brancoExplicito.resumoGeral.coberturaPercentual, 50);

const resultados = [
  { _id: 'r1', aluno: 'a1', alunoNomeSnapshot: 'Ana', alunoTurmaSnapshot: '3º A', ...ingles },
  { _id: 'r2', aluno: 'a2', alunoNomeSnapshot: 'Bruno', alunoTurmaSnapshot: '3º A', ...espanhol },
];
const dashboard = agregarDashboard(simulado, resultados);
assert.equal(dashboard.resumo.participantes, 2);
assert.equal(dashboard.resumo.turmas, 1);
assert.equal(dashboard.porSerie[0].serie, '3º ano/série');
assert.ok(dashboard.porArea.some((item) => item.rotulo === 'Matemática'));
assert.ok(dashboard.questoes.some((item) => item.codigoQuestao === 'D1Q1' && item.variante === 'INGLES'));
assert.ok(dashboard.questoes.some((item) => item.codigoQuestao === 'D1Q1' && item.variante === 'ESPANHOL'));
assert.equal(dashboard.metodologia.versao, 5);
assert.equal(dashboard.metodologia.classificacaoUsa, 'percentualPontuacao');
assert.ok(dashboard.alertasIntegridade.some((item) => item.tipo === 'qualidade_dados'));
assert.equal(dashboard.acoesGestao.some((item) => item.tipo === 'qualidade_dados'), false, 'Integridade não deve competir com prioridade pedagógica.');
assert.ok(dashboard.porEixo.some((item) => item.rotulo === 'Raciocínio quantitativo'));
assert.equal(dashboard.alunosIntervencaoIndividual.length, 0, 'Cobertura individual abaixo do mínimo não pode gerar conclusão crítica individual.');
assert.ok(dashboard.analiseVisual, 'O dashboard deve expor a camada visual sem recalcular dados no navegador.');
assert.equal(dashboard.analiseVisual.histogramaDesempenho.length, 10, 'O histograma visual deve usar dez faixas de desempenho.');
assert.ok(Array.isArray(dashboard.analiseVisual.faixasQuestoes), 'A distribuição visual das questões deve estar disponível.');

const dashboardSemLingua = agregarDashboard(simulado, [
  { _id: 'r3', aluno: 'a3', alunoNomeSnapshot: 'Carla', alunoTurmaSnapshot: '3º B', ...linguaNaoMarcada },
]);
assert.equal(dashboardSemLingua.resumo.alunosSemOpcaoIdioma, 1);
assert.equal(dashboardSemLingua.resumo.semOpcaoIdioma, 2);
assert.ok(dashboardSemLingua.alertasIntegridade.some((item) => item.tipo === 'lingua_nao_marcada'));
assert.equal(dashboardSemLingua.acoesGestao.some((item) => item.tipo === 'lingua_nao_marcada'), false);
assert.equal(dashboardSemLingua.porComponente.some((item) => /Inglesa|Espanhola/.test(item.rotulo)), false);
assert.equal(dashboardSemLingua.prioridadesConteudo.some((item) => /língua.*não marcada/i.test(item.rotulo)), false);
assert.equal(dashboardSemLingua.prioridadesEixo.some((item) => /língua.*não marcada/i.test(item.rotulo)), false);
assert.equal(dashboardSemLingua.questoesPrioritarias.some((item) => item.variante === 'SEM_OPCAO'), false);
assert.ok(dashboardSemLingua.questoes.filter((item) => item.variante === 'SEM_OPCAO').every((item) => item.naturezaEvidencia === 'procedimental'));


const cfgOperacional = configuracao(simulado);
assert.equal(classificarFaixaOperacional(20, { evidenciaSuficiente: true, coberturaPercentual: 100 }, cfgOperacional), 'critico');
assert.equal(classificarFaixaOperacional(30, { evidenciaSuficiente: true, coberturaPercentual: 100 }, cfgOperacional), 'prioridade_alta');
assert.equal(classificarFaixaOperacional(45, { evidenciaSuficiente: true, coberturaPercentual: 100 }, cfgOperacional), 'em_atencao');
assert.equal(classificarFaixaOperacional(55, { evidenciaSuficiente: true, coberturaPercentual: 100 }, cfgOperacional), 'em_desenvolvimento');
assert.equal(classificarFaixaOperacional(75, { evidenciaSuficiente: true, coberturaPercentual: 100 }, cfgOperacional), 'consolidado');
assert.equal(classificarFaixaOperacional(20, { evidenciaSuficiente: true, coberturaPercentual: 70 }, cfgOperacional), 'evidencia_insuficiente');

const desempenhoCritico = avaliarResultado(simulado, {
  idiomaEstrangeiro: 'INGLES',
  respostas: { D1Q1: 'B', D1Q2: 'A', D1Q5: 'A', D1Q6: 'B' },
});
const dashboardCritico = agregarDashboard(simulado, [
  { _id: 'r4', aluno: 'a4', alunoNomeSnapshot: 'Diego', alunoTurmaSnapshot: '3º C', ...desempenhoCritico },
]);
assert.equal(dashboardCritico.alunosIntervencaoIndividual.length, 1);
assert.equal(dashboardCritico.alunosIntervencaoIndividual[0].faixaOperacional, 'critico');

const simuladoEvidenciaColetiva = {
  ...simulado,
  configuracaoAnalise: { ...simulado.configuracaoAnalise, minimoRespondentesQuestao: 3 },
};
const dashboardPoucaEvidencia = agregarDashboard(simuladoEvidenciaColetiva, resultados);
assert.ok(dashboardPoucaEvidencia.porArea.every((item) => item.nivel === 'evidencia_insuficiente'));

const simuladoEnem = {
  tipo: 'enem',
  configuracaoAnalise: {
    percentualConsolidado: 70,
    percentualAtencao: 50,
    minimoQuestoesIndicador: 2,
    minimoRespondentesQuestao: 2,
    minimoAlunosGrupo: 2,
    minimoCoberturaIndividual: 80,
  },
  questoes: [
    { codigo: 'M1', numero: 1, dia: 2, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', habilidadeEnem: 'H16', habilidadeEnemConfianca: 'direta', conteudo: 'Proporcionalidade' }] },
    { codigo: 'M2', numero: 2, dia: 2, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'B', habilidadeEnem: 'H16', habilidadeEnemConfianca: 'aproximada', conteudo: 'Variação de grandezas' }] },
    { codigo: 'M3', numero: 3, dia: 2, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'C', habilidadeEnem: 'H25', conteudo: 'Gráficos' }] },
    { codigo: 'M4', numero: 4, dia: 2, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'D', conteudo: 'Item ainda sem mapeamento oficial' }] },
  ],
};
const resultadosEnem = [
  ['e1', 'Elisa', { M1: 'A', M2: 'A', M3: 'C', M4: 'D' }],
  ['e2', 'Fábio', { M1: 'B', M2: 'A', M3: 'A', M4: 'D' }],
  ['e3', 'Gabi', { M1: 'B', M2: 'B', M3: 'A', M4: 'A' }],
].map(([aluno, nome, respostas]) => ({ aluno, alunoNomeSnapshot: nome, alunoTurmaSnapshot: '3º A', ...avaliarResultado(simuladoEnem, { respostas, idiomaEstrangeiro: 'NAO_APLICAVEL' }) }));
const dashboardEnem = agregarDashboard(simuladoEnem, resultadosEnem);
const h16 = dashboardEnem.porHabilidadeEnem.find((item) => item.codigo === 'H16');
const h25 = dashboardEnem.porHabilidadeEnem.find((item) => item.codigo === 'H25');
assert.ok(h16, 'H16 deve aparecer no diagnóstico oficial.');
assert.equal(h16.competenciaCodigo, 'CA4');
assert.equal(h16.evidenciaSuficiente, true, 'H16 tem dois itens e deve poder receber diagnóstico sustentado.');
assert.equal(h16.questoesAproximadas, 1, 'O agregado deve preservar quantas questões usam mapeamento aproximado.');
assert.equal(h16.confiancaMapeamento, 'mista', 'Habilidade com vínculos direto e aproximado deve ser identificada como mista.');
assert.ok(resultadosEnem[0].respostas.find((item) => item.codigoQuestao === 'M1').habilidadeEnemRotulo.startsWith('MAT-H16 - '), 'O rótulo persistido por resposta deve qualificar H16 pela área para evitar ambiguidade.');
assert.equal(h25.leituraEvidencia, 'indicativa_um_item', 'Uma habilidade medida por apenas um item deve permanecer indicativa.');
assert.equal(dashboardEnem.coberturaEnem.variantesMapeadas, 3);
assert.equal(dashboardEnem.coberturaEnem.variantesSemMapeamento, 1);
assert.ok(dashboardEnem.alertasIntegridade.some((item) => item.tipo === 'mapeamento_enem_incompleto'));
assert.equal(dashboardEnem.prioridadesHabilidadeEnem.some((item) => item.codigo === 'H25'), false, 'Um único item não pode virar prioridade conclusiva de habilidade ENEM.');
assert.ok(dashboardEnem.prioridadesPedagogicas.some((item) => item.tipo === 'retomada_habilidade_enem' && item.nivelIntervencao === 'turma'), 'Habilidade que atinge 60% ou mais deve gerar retomada coletiva, não pequeno grupo.');
assert.equal(dashboardEnem.gruposIntervencao.length, 0, 'Uma necessidade compartilhada por toda a turma não deve aparecer como pequeno grupo.');
assert.equal(dashboardEnem.metodologia.versao, 5);


const simuladoAusencia = {
  configuracaoAnalise: {
    percentualConsolidado: 70,
    percentualAtencao: 50,
    minimoQuestoesIndicador: 1,
    minimoRespondentesQuestao: 1,
    minimoAlunosGrupo: 1,
    minimoCoberturaIndividual: 80,
  },
  questoes: [
    { codigo: 'A1', numero: 1, dia: 1, area: 'Linguagens', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Português', habilidade: 'Leitura' }] },
    { codigo: 'A2', numero: 2, dia: 1, area: 'Humanas', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'B', componente: 'História', habilidade: 'Análise histórica' }] },
    { codigo: 'B1', numero: 1, dia: 2, area: 'Natureza', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'C', componente: 'Biologia', habilidade: 'Interpretar fenômenos' }] },
    { codigo: 'B2', numero: 2, dia: 2, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'D', componente: 'Matemática', habilidade: 'Resolver problemas' }] },
  ],
};
const resultadoAusenteDia2 = avaliarResultado(simuladoAusencia, {
  respostas: { A1: 'A', A2: 'B' },
  idiomaEstrangeiro: 'NAO_APLICAVEL',
  diasAusentes: [2],
});
assert.deepEqual(resultadoAusenteDia2.diasAusentes, [2]);
assert.equal(resultadoAusenteDia2.resumoGeral.totalQuestoes, 2, 'Questões do dia ausente não devem compor o universo aplicável.');
assert.equal(resultadoAusenteDia2.resumoGeral.pontuaveis, 2);
assert.equal(resultadoAusenteDia2.resumoGeral.observadas, 2);
assert.equal(resultadoAusenteDia2.resumoGeral.naoInformadas, 0, 'Ausência não pode virar dado não importado.');
assert.equal(resultadoAusenteDia2.resumoGeral.percentualPontuacao, 100);
assert.equal(resultadoAusenteDia2.resumoGeral.coberturaPercentual, 100, 'Cobertura deve considerar apenas os dias efetivamente realizados.');
assert.equal(resultadoAusenteDia2.respostas.some((item) => item.dia === 2), false, 'Questões de dia ausente não devem gerar resposta diagnóstica.');
assert.ok(resultadoAusenteDia2.avisos.some((item) => item.includes('Ausência confirmada')));
const dashboardAusencia = agregarDashboard(simuladoAusencia, [
  { _id: 'ra1', aluno: 'aa1', alunoNomeSnapshot: 'Aluno Ausente', alunoTurmaSnapshot: '3º C', diasAusentes: [2], ...resultadoAusenteDia2 },
]);
assert.equal(dashboardAusencia.resumo.ausenciasConfirmadas, 1);
assert.equal(dashboardAusencia.resumo.alunosComAusencia, 1);
assert.equal(dashboardAusencia.resumo.alunosBaseAdequada, 0, 'Participação parcial não pode ser tratada como base global completa só porque o dia realizado tem 100% de cobertura.');
assert.equal(dashboardAusencia.resumo.alunosParticipacaoParcial, 1);
assert.equal(dashboardAusencia.resumo.alunosBaseIncompleta, 0, 'Ausência confirmada não pode ser contabilizada como base realmente incompleta.');
assert.equal(dashboardAusencia.resumo.alunosDiagnosticoProvisorio, 0, 'O campo legado de diagnóstico provisório deve representar somente base realmente incompleta.');
assert.equal(dashboardAusencia.participacaoPorDia.find((item) => item.dia === 2).ausentes, 1);
assert.equal(dashboardAusencia.alunosParticipacaoParcial.length, 1);
assert.equal(dashboardAusencia.alunosParticipacaoParcial[0].faixaOperacional, 'participacao_parcial');
assert.equal(dashboardAusencia.alunosParticipacaoParcial[0].diagnosticoProvisorio, false);
assert.equal(dashboardAusencia.distribuicaoAlunos.find((item) => item.nivel === 'participacao_parcial').quantidade, 1);
assert.equal(dashboardAusencia.distribuicaoAlunos.find((item) => item.nivel === 'evidencia_insuficiente').quantidade, 0);
assert.ok(dashboardAusencia.alertasIntegridade.some((item) => item.tipo === 'ausencias_aplicacao'));

const resultadoBaseIncompleta = avaliarResultado(simuladoAusencia, {
  respostas: { A1: 'A', A2: 'B' },
  idiomaEstrangeiro: 'NAO_APLICAVEL',
  diasAusentes: [],
});
const dashboardBaseIncompleta = agregarDashboard(simuladoAusencia, [
  { _id: 'rb1', aluno: 'ab1', alunoNomeSnapshot: 'Aluno Base Incompleta', alunoTurmaSnapshot: '3º A', diasAusentes: [], ...resultadoBaseIncompleta },
]);
assert.equal(dashboardBaseIncompleta.resumo.alunosParticipacaoParcial, 0);
assert.equal(dashboardBaseIncompleta.resumo.alunosBaseIncompleta, 1);
assert.equal(dashboardBaseIncompleta.resumo.alunosDiagnosticoProvisorio, 1);
assert.equal(dashboardBaseIncompleta.distribuicaoAlunos.find((item) => item.nivel === 'evidencia_insuficiente').quantidade, 1);

// V1.12.2: ausência em todo o dia de língua torna o idioma efetivamente não aplicável,
// sem apagar a conferência original armazenada.
const simuladoIdiomaAusencia = {
  configuracaoAnalise: {
    percentualConsolidado: 70,
    percentualAtencao: 50,
    minimoQuestoesIndicador: 1,
    minimoRespondentesQuestao: 1,
    minimoAlunosGrupo: 1,
    minimoCoberturaIndividual: 80,
  },
  questoes: [
    { codigo: 'L1', numero: 1, dia: 1, area: 'Linguagens', peso: 1, variantes: [
      { codigo: 'INGLES', gabarito: 'A', componente: 'Língua Inglesa', habilidade: 'Leitura' },
      { codigo: 'ESPANHOL', gabarito: 'B', componente: 'Língua Espanhola', habilidade: 'Lectura' },
    ] },
    { codigo: 'M1', numero: 1, dia: 2, area: 'Matemática', peso: 1, variantes: [
      { codigo: 'PADRAO', gabarito: 'C', componente: 'Matemática', habilidade: 'Resolver problemas' },
    ] },
  ],
};
const diagnosticoSemDiaIdioma = avaliarResultado(simuladoIdiomaAusencia, {
  respostas: { M1: 'C' },
  idiomaEstrangeiro: 'NAO_INFORMADO',
  diasAusentes: [1],
});
assert.equal(diagnosticoSemDiaIdioma.idiomaEstrangeiro, 'NAO_APLICAVEL');
assert.equal(diagnosticoSemDiaIdioma.resumoGeral.pendentesIdioma, 0, 'Ausência no dia de idioma não pode gerar pendência de língua.');
assert.equal(diagnosticoSemDiaIdioma.resumoGeral.coberturaPercentual, 100);

const contextoPendentePreservado = contextoIdiomaResultado(simuladoIdiomaAusencia, {
  idiomaEstrangeiro: 'NAO_INFORMADO',
  idiomaOrigem: 'nao_informado',
  diasAusentes: [1],
});
assert.equal(contextoPendentePreservado.idiomaEstrangeiroEfetivo, 'NAO_APLICAVEL');
assert.equal(contextoPendentePreservado.idiomaEstrangeiroPreservado, 'NAO_INFORMADO');
assert.equal(contextoPendentePreservado.idiomaNaoAplicavelPorAusencia, true);

const contextoConfirmadoPreservado = contextoIdiomaResultado(simuladoIdiomaAusencia, {
  idiomaEstrangeiro: 'INGLES',
  idiomaOrigem: 'prova',
  diasAusentes: [1],
});
assert.equal(contextoConfirmadoPreservado.idiomaEstrangeiroEfetivo, 'NAO_APLICAVEL');
assert.equal(contextoConfirmadoPreservado.idiomaEstrangeiroPreservado, 'INGLES', 'A língua conferida manualmente deve permanecer preservada.');
assert.equal(contextoConfirmadoPreservado.idiomaOrigemPreservada, 'prova');

const contextoRestaurado = contextoIdiomaResultado(simuladoIdiomaAusencia, {
  idiomaEstrangeiro: 'INGLES',
  idiomaOrigem: 'prova',
  diasAusentes: [],
});
assert.equal(contextoRestaurado.idiomaEstrangeiroEfetivo, 'INGLES', 'Ao desfazer a ausência, a língua confirmada deve voltar a ser efetiva.');

// V1.12.1: volume absoluto também importa. 66 de 114 estudantes não pode ser chamado de pequeno grupo.
const simuladoGrupoAmplo = {
  configuracaoAnalise: {
    percentualConsolidado: 70,
    percentualAtencao: 50,
    minimoQuestoesIndicador: 2,
    minimoRespondentesQuestao: 5,
    minimoAlunosGrupo: 5,
    minimoCoberturaIndividual: 80,
  },
  questoes: [
    { codigo: 'G1', numero: 1, dia: 1, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Matemática', habilidade: 'Habilidade focal' }] },
    { codigo: 'G2', numero: 2, dia: 1, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Matemática', habilidade: 'Habilidade focal' }] },
    { codigo: 'G3', numero: 3, dia: 1, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Matemática', habilidade: 'Outra habilidade' }] },
    { codigo: 'G4', numero: 4, dia: 1, area: 'Matemática', peso: 1, variantes: [{ codigo: 'PADRAO', gabarito: 'A', componente: 'Matemática', habilidade: 'Outra habilidade' }] },
  ],
};
const resultadosGrupoAmplo = Array.from({ length: 114 }, (_item, index) => {
  const dificuldade = index < 66;
  const diagnostico = avaliarResultado(simuladoGrupoAmplo, {
    idiomaEstrangeiro: 'NAO_APLICAVEL',
    respostas: { G1: dificuldade ? 'B' : 'A', G2: dificuldade ? 'B' : 'A', G3: 'A', G4: 'A' },
  });
  return {
    _id: `ga${index}`,
    aluno: `aga${index}`,
    alunoNomeSnapshot: `Aluno ${index + 1}`,
    alunoTurmaSnapshot: ['3º A', '3º B', '3º C'][index % 3],
    ...diagnostico,
  };
});
const dashboardGrupoAmplo = agregarDashboard(simuladoGrupoAmplo, resultadosGrupoAmplo);
const alvoAmplo = dashboardGrupoAmplo.intervencoesAmplas.find((item) => item.rotulo === 'Habilidade focal');
assert.ok(alvoAmplo, 'Uma necessidade de 66 estudantes deve aparecer como intervenção ampla.');
assert.equal(alvoAmplo.alunos.length, 66);
assert.equal(alvoAmplo.alcanceIntervencao, 'ampla');
assert.equal(dashboardGrupoAmplo.gruposIntervencao.some((item) => item.rotulo === 'Habilidade focal'), false, '66 estudantes não podem aparecer em pequenos grupos.');

const resultadosComparacaoAtual = resultados.map((item, index) => ({
  ...item,
  diasAusentes: [],
  resumoGeral: { ...(item.resumoGeral || {}), coberturaPercentual: 100, pendentesIdioma: 0 },
  porArea: [{ chave: 'MATEMATICA', rotulo: 'Matemática', pontosObtidos: index ? 7 : 5, pontosPossiveis: 10 }],
}));
const comparacao = compararResultados(resultadosComparacaoAtual, [
  { aluno: 'a1', diasAusentes: [], resumoGeral: { percentualPontuacao: 60, coberturaPercentual: 100, pendentesIdioma: 0 }, porArea: [{ chave: 'MATEMATICA', rotulo: 'Matemática', pontosObtidos: 4, pontosPossiveis: 10 }] },
  { aluno: 'a2', diasAusentes: [], resumoGeral: { percentualPontuacao: 60, coberturaPercentual: 100, pendentesIdioma: 0 }, porArea: [{ chave: 'MATEMATICA', rotulo: 'Matemática', pontosObtidos: 6, pontosPossiveis: 10 }] },
]);
assert.equal(comparacao.alunosComparados, 2);
assert.equal(comparacao.melhoraram, 1);
assert.equal(comparacao.reduziram, 1);
assert.equal(comparacao.porArea.length, 1, 'A comparação visual deve detalhar áreas em comum.');
assert.equal(comparacao.porArea[0].rotulo, 'Matemática');
assert.equal(comparacao.porArea[0].variacao, 10, 'A evolução por área deve usar os pontos possíveis dos mesmos estudantes.');

const comparacaoComParcial = compararResultados([
  {
    aluno: 'cp1',
    alunoNomeSnapshot: 'Aluno Parcial',
    alunoTurmaSnapshot: '3º A',
    diasAusentes: [2],
    resumoGeral: { percentualPontuacao: 80, coberturaPercentual: 100, pendentesIdioma: 0 },
    porArea: [{ chave: 'HUMANAS', rotulo: 'Humanas', pontosObtidos: 8, pontosPossiveis: 10 }],
  },
], [
  {
    aluno: 'cp1',
    alunoNomeSnapshot: 'Aluno Parcial',
    alunoTurmaSnapshot: '3º A',
    diasAusentes: [],
    resumoGeral: { percentualPontuacao: 60, coberturaPercentual: 100, pendentesIdioma: 0 },
    porArea: [{ chave: 'HUMANAS', rotulo: 'Humanas', pontosObtidos: 6, pontosPossiveis: 10 }],
  },
], { minimoCoberturaIndividual: 80 });
assert.equal(comparacaoComParcial.alunosComparados, 0, 'Participação parcial não pode entrar na comparação global longitudinal.');
assert.equal(comparacaoComParcial.porArea.length, 1, 'A evolução de área comum realizada pode continuar disponível.');
assert.equal(comparacaoComParcial.porArea[0].variacao, 20);

const linhasNovas = [
  { numeroLinha: 1, pagina: 1, dia: 1, turmaInformada: '3º A', idiomaEstrangeiro: 'INGLES', respostas: { D1Q1: 'B' }, vinculoStatus: 'nao_localizado' },
  { numeroLinha: 2, pagina: 2, dia: 1, turmaInformada: '3º A', idiomaEstrangeiro: 'NAO_MARCADO', respostas: { D1Q1: 'C' }, vinculoStatus: 'nao_localizado' },
];
const linhasAntigas = [
  { numeroLinha: 1, pagina: 1, dia: 1, aluno: 'a1', nomeInformado: 'Nome antigo A', turmaInformada: '3º A', idiomaEstrangeiro: 'ESPANHOL', vinculoStatus: 'manual' },
  { numeroLinha: 2, pagina: 2, dia: 1, aluno: 'a2', nomeInformado: 'Nome antigo B', turmaInformada: '3º A', idiomaEstrangeiro: 'INGLES', vinculoStatus: 'manual' },
];
const recuperacao = recuperarVinculos({
  linhasAtuais: linhasNovas,
  linhasAnteriores: linhasAntigas,
  alunos: [
    { _id: 'a1', nome: 'Ana Atual', turma: '3º A', codigoAcesso: 'A1' },
    { _id: 'a2', nome: 'Beatriz Atual', turma: '3º A', codigoAcesso: 'A2' },
  ],
});
assert.equal(recuperacao.recuperados, 2);
assert.equal(linhasNovas[0].aluno, 'a1');
assert.equal(linhasNovas[1].aluno, 'a2');
assert.equal(linhasNovas[0].idiomaEstrangeiro, 'INGLES', 'A língua nova não pode ser substituída pela anterior.');
assert.equal(linhasNovas[1].idiomaEstrangeiro, 'NAO_MARCADO', 'Língua não marcada deve ser preservada.');
assert.deepEqual(linhasNovas[0].respostas, { D1Q1: 'B' }, 'As respostas da nova leitura devem ser preservadas.');

const respostasAnteriores = {
  respostas: [
    { codigoQuestao: 'D1Q1', resposta: 'A', respostaInformada: true },
    { codigoQuestao: 'D2Q1', resposta: 'D', respostaInformada: true },
  ],
};
const baseSemDia1 = respostasConfirmadas(respostasAnteriores, new Set(['D1Q1']));
assert.deepEqual(baseSemDia1, { D2Q1: 'D' }, 'A substituição deve retirar somente as respostas do dia corrigido.');
assert.deepEqual(mesclarRespostas(baseSemDia1, { D1Q1: 'C' }), { D2Q1: 'D', D1Q1: 'C' });

console.log('Simulados V1.12.3: participação parcial separada de base incompleta, habilidades ENEM, ausências e idioma preservados aprovados.');
