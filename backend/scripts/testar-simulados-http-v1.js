'use strict';

const assert = require('assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-apenas-para-teste-local';

const Usuario = require('../models/Usuario');
const Aluno = require('../models/Aluno');
const Simulado = require('../models/Simulado');
const SimuladoResultado = require('../models/SimuladoResultado');
const SimuladoImportacao = require('../models/SimuladoImportacao');
const Log = require('../models/Log');
const simuladosRouter = require('../routes/api/simulados');

function query(data) {
  const api = {
    sort() { return api; },
    select() { return api; },
    limit() { return api; },
    skip() { return api; },
    lean() { return Promise.resolve(data); },
    catch(handler) { return Promise.resolve(data).catch(handler); },
  };
  return api;
}

async function executar() {
  const instituicao = new mongoose.Types.ObjectId().toString();
  const usuarioId = new mongoose.Types.ObjectId().toString();
  let perfil = 'admin';
  let ultimoFiltroSimulado = null;
  const simuladoId = new mongoose.Types.ObjectId();
  const importacaoId = new mongoose.Types.ObjectId();
  const conferencia = {
    _id: importacaoId,
    status: 'analisada',
    arquivo: { nomeOriginal: 'cartoes.pdf', formato: 'pdf', turma: '3º A', dia: 1, sha256: 'c'.repeat(64) },
    linhas: [{ numeroLinha: 1, nomeInformado: 'Aluno de teste' }],
    totais: {
      linhas: 1,
      prontas: 0,
      naoLocalizadas: 1,
      toObject() { return { linhas: this.linhas, prontas: this.prontas, naoLocalizadas: this.naoLocalizadas }; },
    },
    avisos: ['Conferência interrompida'],
    erro: '',
    async save() { this.updatedAt = new Date(); return this; },
  };

  const originais = {
    usuarioFindById: Usuario.findById,
    alunoDistinct: Aluno.distinct,
    simuladoFind: Simulado.find,
    simuladoFindOne: Simulado.findOne,
    resultadoAggregate: SimuladoResultado.aggregate,
    importacaoAggregate: SimuladoImportacao.aggregate,
    importacaoFind: SimuladoImportacao.find,
    importacaoFindOne: SimuladoImportacao.findOne,
    logCreate: Log.create,
  };

  Usuario.findById = () => query({
    _id: usuarioId,
    nome: 'Usuário de Teste',
    email: 'teste@axoriin.local',
    tipo: perfil,
    instituicao,
    tenantId: instituicao,
    turmas: perfil === 'professor' ? ['3º A'] : [],
    ativo: true,
  });
  Aluno.distinct = async () => ['3º A', '3º B'];
  Simulado.find = (filtro) => {
    ultimoFiltroSimulado = filtro;
    return query([{
      _id: simuladoId, codigo: 'SIM-2026', titulo: 'Simulado Teste',
      anoLetivo: 2026, etapa: 'Ensino Médio', turmas: ['3º A'], questoes: [],
      status: 'rascunho', versaoMatriz: 1, configuracaoAnalise: {},
    }]);
  };
  const simuladoDocumento = {
    _id: simuladoId,
    codigo: 'SIM-2026',
    titulo: 'Simulado ENEM Teste',
    tipo: 'interno',
    status: 'rascunho',
    turmas: ['3º A'],
    series: [],
    questoes: [],
    configuracaoAnalise: {},
    atualizadoPor: null,
    async save() { return this; },
  };
  Simulado.findOne = async () => simuladoDocumento;
  SimuladoResultado.aggregate = async () => [];
  SimuladoImportacao.aggregate = async () => [{ _id: simuladoId, pendentes: 1, ultimaAtualizacao: new Date() }];
  SimuladoImportacao.find = () => query([{
    _id: importacaoId,
    arquivo: { nomeOriginal: 'cartoes.pdf', formato: 'pdf', turma: '3º A', dia: 1 },
    status: 'analisada',
    totais: { linhas: 30, prontas: 12, naoLocalizadas: 18 },
    updatedAt: new Date(),
  }]);
  SimuladoImportacao.findOne = async () => conferencia;
  Log.create = async () => ({});

  const app = express();
  app.use(express.json());
  app.use('/api/simulados', simuladosRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const semToken = await fetch(`${base}/api/simulados/bootstrap`);
    assert.equal(semToken.status, 401);

    const token = (tipo) => jwt.sign({ id: usuarioId, instituicao, tipo }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const cabecalho = (tipo) => ({ Authorization: `Bearer ${token(tipo)}` });

    perfil = 'admin';
    const admin = await fetch(`${base}/api/simulados/bootstrap`, { headers: cabecalho('admin') });
    assert.equal(admin.status, 200);
    const adminBody = await admin.json();
    assert.equal(adminBody.permissoes.gestao, true);
    assert.deepEqual(adminBody.turmas, ['3º A', '3º B']);
    assert.equal(adminBody.versao, '1.12.5');
    assert.equal(adminBody.regras.retomadaAutomatica, true);
    assert.equal(adminBody.regras.idiomaNaoMarcadoZeraQuestoes, true);
    assert.equal(adminBody.regras.recuperaVinculosDiagnosticoAnterior, true);
    assert.equal(adminBody.regras.substituicaoDiagnosticoSemDuplicidade, true);
    assert.equal(adminBody.regras.habilidadesEnemOficiais, true);
    assert.equal(adminBody.regras.mapeamentoEnemExplicito, true);
    assert.equal(adminBody.regras.habilidadeEnemNaoInferidaPorConteudo, true);
    assert.equal(adminBody.regras.relatorioEspecificoHabilidadesEnemPdf, true);
    assert.equal(adminBody.regras.revisaoParticipacaoPosProcessamento, true);
    assert.equal(adminBody.regras.ausenciaPosProcessamentoPreservaRespostas, true);
    assert.equal(adminBody.regras.idiomaAusenteNaoGeraPendencia, true);
    assert.equal(adminBody.regras.idiomaConfirmadoPreservadoNaAusencia, true);
    assert.equal(adminBody.regras.participacaoParcialSeparadaDeBaseIncompleta, true);
    assert.equal(adminBody.regras.restauracaoDiaAusente, true);

    const lista = await fetch(`${base}/api/simulados`, { headers: cabecalho('admin') });
    assert.equal(lista.status, 200);
    const listaBody = await lista.json();
    assert.equal(listaBody.simulados.length, 1);
    assert.equal(listaBody.simulados[0].importacoesPendentes, 1);

    const ativarEnem = await fetch(`${base}/api/simulados/${simuladoId}`, {
      method: 'PATCH',
      headers: { ...cabecalho('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'enem' }),
    });
    assert.equal(ativarEnem.status, 200);
    assert.equal(simuladoDocumento.tipo, 'enem', 'A ativação ENEM deve alterar apenas o metadado tipo do simulado.');

    const pendentes = await fetch(`${base}/api/simulados/${simuladoId}/importacoes?status=analisada`, { headers: cabecalho('admin') });
    assert.equal(pendentes.status, 200);
    const pendentesBody = await pendentes.json();
    assert.equal(pendentesBody.importacoes.length, 1);
    assert.equal(pendentesBody.importacoes[0].status, 'analisada');

    const excluir = await fetch(`${base}/api/simulados/${simuladoId}/importacoes/${importacaoId}`, {
      method: 'DELETE',
      headers: cabecalho('admin'),
    });
    assert.equal(excluir.status, 200);
    assert.equal(conferencia.status, 'cancelada');
    assert.deepEqual(conferencia.linhas, []);
    assert.equal(conferencia.totais.linhas, 0);
    assert.equal(conferencia.avisos.length, 0);

    const excluirNovamente = await fetch(`${base}/api/simulados/${simuladoId}/importacoes/${importacaoId}`, {
      method: 'DELETE',
      headers: cabecalho('admin'),
    });
    assert.equal(excluirNovamente.status, 409, 'Uma conferência já descartada não pode ser excluída novamente.');

    perfil = 'professor';
    const professor = await fetch(`${base}/api/simulados/bootstrap`, { headers: cabecalho('professor') });
    assert.equal(professor.status, 200);
    const professorBody = await professor.json();
    assert.equal(professorBody.permissoes.somenteLeitura, true);
    assert.deepEqual(professorBody.turmas, ['3º A']);
    assert.ok(Array.isArray(ultimoFiltroSimulado.$or), 'O filtro de professor deve restringir os simulados por turma.');

    perfil = 'monitor';
    const monitor = await fetch(`${base}/api/simulados/bootstrap`, { headers: cabecalho('monitor') });
    assert.equal(monitor.status, 403);

    console.log('Simulados V1.12.5: autenticação, participação parcial separada de base incompleta, idioma e performance aprovados.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Usuario.findById = originais.usuarioFindById;
    Aluno.distinct = originais.alunoDistinct;
    Simulado.find = originais.simuladoFind;
    Simulado.findOne = originais.simuladoFindOne;
    SimuladoResultado.aggregate = originais.resultadoAggregate;
    SimuladoImportacao.aggregate = originais.importacaoAggregate;
    SimuladoImportacao.find = originais.importacaoFind;
    SimuladoImportacao.findOne = originais.importacaoFindOne;
    Log.create = originais.logCreate;
  }
}

executar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
