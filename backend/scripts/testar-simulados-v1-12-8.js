'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

function ler(root, ...partes) {
  return fs.readFileSync(path.join(root, ...partes), 'utf8');
}

async function executar() {
  const root = path.resolve(__dirname, '..');
  const rota = ler(root, 'routes', 'api', 'simulados.js');
  const frontend = ler(root, 'public', 'simulados', 'simulados.js');
  const html = ler(root, 'public', 'simulados.html');
  const pdfServiceSrc = ler(root, 'services', 'simulados', 'simuladoPdfService.js');
  const relatorio = ler(root, 'pdf', 'gerar_relatorio_diagnostico.py');

  assert.match(html, /simulados\.js\?v=1\.12\.8/, 'O HTML deve forcar o JS V1.12.8.');
  assert.match(rota, /versao:\s*'1\.12\.8'/, 'O bootstrap deve anunciar V1.12.8.');

  // Protecoes de memoria herdadas da V1.12.6.
  assert.match(rota, /dashboardCompactoCacheado/, 'O cache do dashboard deve permanecer compacto.');
  assert.match(rota, /dadosDashboard\(req, \{ pdfGeral: true \}\)/, 'O PDF gerencial deve usar consulta reduzida.');
  assert.match(rota, /resultadosCompactosPdf\(dados\.resultados\)/, 'O payload individual do gerencial deve permanecer compacto.');
  assert.match(rota, /dados\.resultados = null;/, 'A colecao grande deve ser liberada antes do Python.');
  assert.match(rota, /res\.sendFile\(arquivo\.caminho/, 'PDF deve ser enviado por arquivo/stream.');
  assert.match(pdfServiceSrc, /let geracaoPdfAtiva = false;/, 'Deve existir trava de concorrencia de PDF.');
  assert.match(pdfServiceSrc, /resultados: \[\]/, 'Visual/Habilidades nao devem receber resultados individuais.');
  assert.match(frontend, /button\.dataset\.baixando = '1'/, 'Clique duplicado deve continuar bloqueado.');

  // Clareza dos relatorios V1.12.8.
  assert.match(relatorio, /Estudantes no recorte/, 'Os PDFs devem usar Estudantes no recorte.');
  assert.match(relatorio, /Cobertura das respostas/, 'Os PDFs devem esclarecer cobertura de respostas.');
  assert.match(relatorio, /Classificação individual/, 'Os PDFs devem nomear a classificacao individual.');
  assert.match(relatorio, /Base incompleta/, 'O estudante com base insuficiente deve ser nomeado Base incompleta.');
  assert.match(relatorio, /Distribuição do desempenho individual/, 'O histograma deve ter titulo autoexplicativo.');
  assert.match(relatorio, /Universo do gráfico/, 'O PDF Visual deve explicar quem entra no histograma.');
  assert.match(relatorio, /legenda_classificacao_alunos/, 'O PDF Visual deve ter legenda superior das faixas.');
  assert.match(relatorio, /Desempenho confirmado \(%\)/, 'O eixo do histograma deve informar a metrica.');
  assert.match(relatorio, /Evidência insuficiente.*QUESTÕES/s, 'A secao de itens deve distinguir evidencia insuficiente de base individual.');
  assert.match(relatorio, /Situação dos estudantes no diagnóstico/, 'O gerencial deve separar faixas de desempenho de situacoes de dados.');
  assert.match(relatorio, /nivel_aluno_label/, 'O relatorio deve possuir rotulo contextual para estudantes.');


  // Explicacao metodologica V1.12.8.
  assert.match(relatorio, /Como o Axoriin interpreta os resultados/, 'O PDF Visual deve possuir uma secao metodologica propria.');
  assert.match(relatorio, /Intervenção imediata/, 'O rotulo estudantil critico deve ser apresentado como acao pedagogica.');
  assert.match(relatorio, /Como ler este gráfico/, 'Graficos centrais devem trazer caixa de leitura.');
  assert.match(relatorio, /média geral deste recorte/, 'A media do grafico de turmas deve ser definida explicitamente.');
  assert.match(relatorio, /O que significam as faixas das questões/, 'O PDF deve explicar as faixas de itens.');
  assert.match(relatorio, /tabela_parametros_diagnostico/, 'Os tres PDFs devem documentar parametros e finalidades.');
  assert.match(relatorio, /Subfaixas abaixo da prioridade/, 'O relatorio deve explicar a derivacao das subfaixas abaixo de 50%.');
  assert.match(relatorio, /Prioridade pedagógica/, 'A leitura de turma/habilidade deve evitar rotulo generico pouco explicativo.');
  assert.match(relatorio, /Faixa da turma/, 'A tabela de turmas deve nomear explicitamente a coluna de classificacao.');
  assert.match(relatorio, /Não é média do ENEM, do Brasil, do Acre ou do município/, 'A referencia interna de media deve ser delimitada.');

  // Smoke real do PDF Visual com os numeros que motivaram a melhoria.
  const pdfService = require('../services/simulados/simuladoPdfService');
  const simulado = { titulo: 'Smoke PDF V1.12.8', codigo: 'SMOKE127', anoLetivo: 2026, tipo: 'enem' };
  const dashboard = {
    resumo: {
      participantes: 114,
      turmas: 3,
      percentualPontuacao: 36.3,
      percentualAcerto: 36.5,
      coberturaPercentual: 99.5,
      observadas: 17440,
      aplicaveis: 17520,
      alunosBaseAdequada: 104,
      alunosParticipacaoParcial: 9,
      alunosBaseIncompleta: 1,
      naoInformadas: 80,
      alunosIdiomaPendente: 0,
      alunosSemOpcaoIdioma: 1,
    },
    configuracao: {
      percentualAtencao: 50,
      percentualConsolidado: 70,
      minimoCoberturaIndividual: 80,
      minimoQuestoesIndicador: 2,
      minimoRespondentesQuestao: 5,
      minimoAlunosGrupo: 2,
    },
    analiseVisual: {
      histogramaDesempenho: [
        { inicio: 0, alunos: 0 }, { inicio: 10, alunos: 1 }, { inicio: 20, alunos: 30 },
        { inicio: 30, alunos: 36 }, { inicio: 40, alunos: 28 }, { inicio: 50, alunos: 6 },
        { inicio: 60, alunos: 2 }, { inicio: 70, alunos: 1 }, { inicio: 80, alunos: 0 },
        { inicio: 90, alunos: 0 },
      ],
      distribuicaoFaixas: [
        { nivel: 'critico', quantidade: 11 },
        { nivel: 'prioridade_alta', quantidade: 56 },
        { nivel: 'em_atencao', quantidade: 28 },
        { nivel: 'em_desenvolvimento', quantidade: 8 },
        { nivel: 'consolidado', quantidade: 1 },
        { nivel: 'participacao_parcial', quantidade: 9 },
        { nivel: 'evidencia_insuficiente', quantidade: 1 },
      ],
      porArea: [
        { rotulo: 'Matemática', percentualPontuacao: 27.4 },
        { rotulo: 'Linguagens', percentualPontuacao: 48.1 },
      ],
      porTurma: [
        { turma: '3ºA', alunos: 37, percentualPontuacao: 37.2, coberturaPercentual: 98.6, nivel: 'prioritario' },
        { turma: '3ºB', alunos: 41, percentualPontuacao: 38.3, coberturaPercentual: 100, nivel: 'prioritario' },
      ],
      participacaoPorDia: [
        { dia: 1, previstos: 114, presentes: 110, ausentes: 4 },
        { dia: 2, previstos: 114, presentes: 109, ausentes: 5 },
      ],
      faixasQuestoes: [
        { rotulo: 'Muito baixo', quantidade: 34 }, { rotulo: 'Baixo', quantidade: 60 },
        { rotulo: 'Intermediário', quantidade: 48 }, { rotulo: 'Alto', quantidade: 20 },
        { rotulo: 'Muito alto', quantidade: 2 }, { rotulo: 'Evidência insuficiente', quantidade: 4 },
      ],
    },
    porArea: [
      { rotulo: 'Matemática', percentualPontuacao: 27.4 },
      { rotulo: 'Linguagens', percentualPontuacao: 48.1 },
    ],
    porTurma: [
      { turma: '3ºA', alunos: 37, percentualPontuacao: 37.2, coberturaPercentual: 98.6, nivel: 'prioritario' },
      { turma: '3ºB', alunos: 41, percentualPontuacao: 38.3, coberturaPercentual: 100, nivel: 'prioritario' },
    ],
    participacaoPorDia: [
      { dia: 1, previstos: 114, presentes: 110, ausentes: 4 },
      { dia: 2, previstos: 114, presentes: 109, ausentes: 5 },
    ],
    porHabilidadeEnem: [], prioridadesPedagogicas: [],
  };

  const visual = await pdfService.gerarRelatorioVisualPdfArquivo({ simulado, dashboard, comparacao: null, turma: '' });
  try {
    assert.ok(visual.tamanho > 2500, 'O smoke deve gerar PDF Visual valido com legenda e explicacoes.');
    assert.ok(fs.existsSync(visual.caminho), 'O PDF temporario deve existir ate o envio.');
  } finally {
    await visual.limpar();
  }

  console.log('Simulados V1.12.8: PDFs guiados, metodologia explicada, nomenclaturas claras e exportacoes leves aprovados.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
