'use strict';

const assert = require('assert/strict');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const Simulado = require('../models/Simulado');
const SimuladoResultado = require('../models/SimuladoResultado');
const SimuladoImportacao = require('../models/SimuladoImportacao');
const {
  lerTabela,
  analisarMatriz,
  analisarRespostas,
  gerarModeloMatriz,
  gerarModeloMapeamentoEnem,
  analisarMapeamentoEnem,
  gerarModeloRespostas,
} = require('../services/simulados/simuladoImportService');
const { avaliarResultado, agregarDashboard } = require('../services/simulados/simuladoAnaliseService');
const { gerarRelatorioDiagnostico } = require('../services/simulados/simuladoExportService');
const { gerarRelatorioDiagnosticoPdf, gerarRelatorioVisualPdf, gerarRelatorioHabilidadesEnemPdf } = require('../services/simulados/simuladoPdfService');

async function executar() {
  const instituicao = new mongoose.Types.ObjectId();
  const aluno1 = { _id: new mongoose.Types.ObjectId(), nome: 'Ana Souza', turma: '3º A', codigoAcesso: 'A100' };
  const aluno2 = { _id: new mongoose.Types.ObjectId(), nome: 'Bruno Lima', turma: '3º A', codigoAcesso: 'B200' };
  const base = {
    codigo: 'TESTE-2026',
    titulo: 'Teste de integração',
    anoLetivo: 2026,
    tipo: 'enem',
    questoes: [],
    configuracaoAnalise: { percentualConsolidado: 70, percentualAtencao: 50, minimoQuestoesIndicador: 2, minimoRespondentesQuestao: 1 },
  };

  const matrizBuffer = await gerarModeloMatriz(base);
  assert.ok(matrizBuffer.length > 5000, 'O modelo XLSX da matriz deve ser gerado.');
  const matrizWorkbook = new ExcelJS.Workbook();
  await matrizWorkbook.xlsx.load(matrizBuffer);
  const matrizSheet = matrizWorkbook.getWorksheet('MATRIZ');
  const hEnemColumn = matrizSheet.getRow(1).values.findIndex((value) => value === 'HABILIDADE_ENEM');
  assert.ok(hEnemColumn > 0, 'O modelo da matriz deve expor HABILIDADE_ENEM.');
  const confiancaEnemColumn = matrizSheet.getRow(1).values.findIndex((value) => value === 'CONFIANCA_ENEM');
  assert.ok(confiancaEnemColumn > 0, 'O modelo da matriz deve expor CONFIANCA_ENEM.');
  matrizSheet.getCell(2, hEnemColumn).value = 'H5';
  matrizSheet.getCell(3, hEnemColumn).value = 'H5';
  matrizSheet.getCell(4, hEnemColumn).value = 'H16';
  matrizSheet.getCell(4, confiancaEnemColumn).value = 'APROXIMADA';
  const matrizComEnem = Buffer.from(await matrizWorkbook.xlsx.writeBuffer());
  const tabelaMatriz = await lerTabela({
    buffer: matrizComEnem,
    nomeArquivo: 'matriz.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const matriz = analisarMatriz(tabelaMatriz);
  assert.deepEqual(matriz.erros, []);
  assert.equal(matriz.questoes.length, 2);
  assert.equal(matriz.questoes[0].variantes.length, 2);
  assert.equal(matriz.questoes[0].variantes[0].habilidadeEnem, 'H5');
  assert.equal(matriz.questoes[1].variantes[0].habilidadeEnem, 'H16');
  assert.equal(matriz.questoes[1].variantes[0].habilidadeEnemConfianca, 'aproximada');

  const simuladoObjeto = { ...base, questoes: matriz.questoes };
  const mapaBuffer = await gerarModeloMapeamentoEnem(simuladoObjeto);
  const mapaWorkbook = new ExcelJS.Workbook();
  await mapaWorkbook.xlsx.load(mapaBuffer);
  assert.ok(mapaWorkbook.getWorksheet('MAPEAMENTO_ENEM'));
  assert.ok(mapaWorkbook.getWorksheet('REFERENCIA_ENEM'));
  assert.ok(mapaWorkbook.getWorksheet('MAPEAMENTO_ENEM').getRow(1).values.includes('CONFIANCA_ENEM'));
  const tabelaMapa = await lerTabela({ buffer: mapaBuffer, nomeArquivo: 'mapeamento.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const mapa = analisarMapeamentoEnem(tabelaMapa, simuladoObjeto);
  assert.deepEqual(mapa.erros, []);
  assert.ok(mapa.atualizacoes.some((item) => item.habilidadeEnem === 'H16'));
  const respostasBuffer = await gerarModeloRespostas(simuladoObjeto, [aluno1, aluno2]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(respostasBuffer);
  const sheet = workbook.getWorksheet('RESPOSTAS');
  sheet.getCell('E2').value = 'INGLES';
  sheet.getCell('F2').value = 'A';
  sheet.getCell('G2').value = 'BRANCO';
  sheet.getCell('E3').value = 'ESPANHOL';
  sheet.getCell('F3').value = '';
  sheet.getCell('G3').value = 'B';
  const preenchida = Buffer.from(await workbook.xlsx.writeBuffer());
  const tabelaRespostas = await lerTabela({ buffer: preenchida, nomeArquivo: 'respostas.xlsx', mimeType: '' });
  const conferencia = analisarRespostas({ tabela: tabelaRespostas, simulado: simuladoObjeto, alunos: [aluno1, aluno2] });
  assert.equal(conferencia.totais.linhas, 2);
  assert.equal(conferencia.totais.prontas, 2);
  assert.equal(conferencia.totais.idiomasPendentes, 0);
  assert.equal(conferencia.linhas[0].respostas.D1Q1, 'A');
  assert.equal(conferencia.linhas[0].respostas.D1Q5, 'BRANCO');
  assert.equal(Object.prototype.hasOwnProperty.call(conferencia.linhas[1].respostas, 'D1Q1'), false, 'Célula vazia não pode virar branco.');

  const simuladoDoc = new Simulado({
    instituicao,
    tenantId: instituicao,
    ...base,
    questoes: matriz.questoes,
  });
  await simuladoDoc.validate();
  assert.equal(simuladoDoc.questoes.length, 2);

  const resultadoDoc = new SimuladoResultado({
    instituicao,
    tenantId: instituicao,
    simulado: simuladoDoc._id,
    aluno: aluno1._id,
    alunoNomeSnapshot: aluno1.nome,
    alunoTurmaSnapshot: aluno1.turma,
    idiomaEstrangeiro: 'NAO_MARCADO',
    idiomaConfirmado: true,
    respostas: [{ codigoQuestao: 'D1Q1', numero: 1, variante: 'SEM_OPCAO', situacao: 'IDIOMA_NAO_MARCADO', correta: null }],
    porDia: [{ chave: 'DIA_1', rotulo: 'Dia 1', observadas: 1, semOpcaoIdioma: 1, nivel: 'prioritario', evidenciaSuficiente: true }],
    versaoDiagnostico: 5,
  });
  await resultadoDoc.validate();
  assert.equal(resultadoDoc.respostas[0].correta, null);
  assert.equal(resultadoDoc.idiomaEstrangeiro, 'NAO_MARCADO');
  assert.equal(resultadoDoc.porDia[0].semOpcaoIdioma, 1);

  const importacaoDoc = new SimuladoImportacao({
    instituicao,
    tenantId: instituicao,
    simulado: simuladoDoc._id,
    arquivo: { nomeOriginal: 'respostas.xlsx', formato: 'xlsx', sha256: 'a'.repeat(64) },
    linhas: conferencia.linhas,
    totais: conferencia.totais,
    substituiImportacao: new mongoose.Types.ObjectId(),
    vinculosRecuperados: 2,
  });
  await importacaoDoc.validate();
  assert.equal(importacaoDoc.linhas.length, 2);
  assert.equal(importacaoDoc.vinculosRecuperados, 2);

  const importacaoSubstituida = new SimuladoImportacao({
    instituicao,
    tenantId: instituicao,
    simulado: simuladoDoc._id,
    arquivo: { nomeOriginal: 'cartoes-antigos.pdf', formato: 'pdf', sha256: 'c'.repeat(64), dia: 1, turma: '3º A' },
    status: 'substituida',
    substituidaPorImportacao: importacaoDoc._id,
    substituidaEm: new Date(),
  });
  await importacaoSubstituida.validate();
  assert.equal(importacaoSubstituida.status, 'substituida');

  const importacaoSemLingua = new SimuladoImportacao({
    instituicao,
    tenantId: instituicao,
    simulado: simuladoDoc._id,
    arquivo: { nomeOriginal: 'cartoes.pdf', formato: 'pdf', sha256: 'b'.repeat(64), dia: 1, turma: '3º A' },
    linhas: [{
      numeroLinha: 1,
      pagina: 1,
      dia: 1,
      fonte: 'cartao_pdf',
      idiomaEstrangeiro: 'NAO_MARCADO',
      idiomaOrigem: 'cartao',
      aluno: aluno1._id,
      vinculoStatus: 'manual',
      omr: { status: 'pronto' },
    }],
    totais: { linhas: 1, prontas: 1, idiomasNaoMarcados: 1 },
  });
  await importacaoSemLingua.validate();
  assert.equal(importacaoSemLingua.totais.idiomasNaoMarcados, 1);

  const avaliacao1 = avaliarResultado(simuladoObjeto, {
    idiomaEstrangeiro: 'INGLES',
    respostas: conferencia.linhas[0].respostas,
  });
  const avaliacao2 = avaliarResultado(simuladoObjeto, {
    idiomaEstrangeiro: 'ESPANHOL',
    respostas: conferencia.linhas[1].respostas,
  });
  const resultados = [
    { aluno: aluno1._id, alunoNomeSnapshot: aluno1.nome, alunoTurmaSnapshot: aluno1.turma, ...avaliacao1 },
    { aluno: aluno2._id, alunoNomeSnapshot: aluno2.nome, alunoTurmaSnapshot: aluno2.turma, ...avaliacao2 },
  ];
  const dashboard = agregarDashboard(simuladoObjeto, resultados);
  const relatorio = await gerarRelatorioDiagnostico({ simulado: simuladoObjeto, dashboard, resultados });
  assert.ok(relatorio.length > 10000, 'O relatório diagnóstico XLSX deve ser gerado.');
  const relatorioWorkbook = new ExcelJS.Workbook();
  await relatorioWorkbook.xlsx.load(relatorio);
  ['RESUMO', 'ALUNOS', 'TURMAS', 'SÉRIES', 'DIAS', 'ÁREAS', 'COMPONENTES', 'EIXOS PEDAGÓGICOS', 'CONTEÚDOS', 'HABILIDADES', 'COMPETÊNCIAS', 'DESCRITORES', 'DIFICULDADE', 'HABILIDADES ENEM', 'COMPETÊNCIAS ENEM', 'COBERTURA ENEM', 'ENEM NÃO MAPEADO', 'QUESTÕES', 'GRUPOS DE INTERVENÇÃO', 'ALERTAS DE INTEGRIDADE', 'PRIORIDADES PEDAGÓGICAS', 'ALUNOS PRIORITÁRIOS']
    .forEach((nome) => assert.ok(relatorioWorkbook.getWorksheet(nome), `A aba ${nome} deve existir.`));

  const relatorioPdf = await gerarRelatorioDiagnosticoPdf({ simulado: simuladoObjeto, dashboard, resultados, turma: '3º A' });
  assert.ok(relatorioPdf.length > 5000, 'O relatório diagnóstico PDF deve ser gerado.');
  assert.equal(relatorioPdf.subarray(0, 5).toString('ascii'), '%PDF-', 'O relatório PDF deve possuir assinatura válida.');

  const relatorioVisualPdf = await gerarRelatorioVisualPdf({ simulado: simuladoObjeto, dashboard, resultados, turma: '3º A' });
  assert.ok(relatorioVisualPdf.length > 4000, 'O relatório visual PDF deve ser gerado.');
  assert.equal(relatorioVisualPdf.subarray(0, 5).toString('ascii'), '%PDF-', 'O relatório visual PDF deve possuir assinatura válida.');

  const relatorioHabilidadesPdf = await gerarRelatorioHabilidadesEnemPdf({ simulado: simuladoObjeto, dashboard, resultados, turma: '3º A' });
  assert.ok(relatorioHabilidadesPdf.length > 4000, 'O relatório específico de habilidades ENEM deve ser gerado.');
  assert.equal(relatorioHabilidadesPdf.subarray(0, 5).toString('ascii'), '%PDF-', 'O PDF de habilidades ENEM deve possuir assinatura válida.');

  const router = require('../routes/api/simulados');
  assert.equal(typeof router, 'function', 'A rota Express deve carregar com as dependências do projeto.');

  console.log('Simulados V1.12.3: XLSX/PDF geral + PDF visual, separação entre participação parcial e base incompleta validadas.');
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
