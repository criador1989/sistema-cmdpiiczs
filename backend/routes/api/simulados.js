'use strict';

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');

const Simulado = require('../../models/Simulado');
const SimuladoResultado = require('../../models/SimuladoResultado');
const SimuladoImportacao = require('../../models/SimuladoImportacao');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const {
  acessoPedagogico,
  apenasGestaoPedagogica,
  ehGestaoPedagogica,
} = require('../../middleware/pedagogicoAccess');
const { attachActor, logAction } = require('../../utils/audit');
const {
  texto,
  normalizarChave,
  normalizarIdioma,
  normalizarResposta,
  questaoTemIdioma,
  simuladoTemIdioma,
  contextoIdiomaResultado,
  avaliarResultado,
  agregarDashboard,
  compararResultados,
} = require('../../services/simulados/simuladoAnaliseService');
const {
  MIME_XLSX,
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
} = require('../../services/simulados/simuladoImportService');
const {
  gerarRelatorioDiagnostico,
  nomeSeguro,
} = require('../../services/simulados/simuladoExportService');
const {
  MIME_PDF,
  gerarRelatorioDiagnosticoPdf,
  gerarRelatorioVisualPdf,
  gerarRelatorioHabilidadesEnemPdf,
} = require('../../services/simulados/simuladoPdfService');
const {
  MAX_PDF_BYTES,
  questoesDoDia,
  diaTemIdioma,
  analisarPdfCartoes,
} = require('../../services/simulados/simuladoOmrService');
const {
  recuperarVinculos,
  respostasConfirmadas,
  mesclarRespostas,
} = require('../../services/simulados/simuladoSubstituicaoService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const formato = detectarFormato(file.originalname, file.mimetype);
    cb(formato ? null : new Error('Envie um arquivo XLSX, CSV ou JSON.'), Boolean(formato));
  },
});
const uploadCartoes = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const nome = texto(file.originalname).toLowerCase();
    const valido = nome.endsWith('.pdf') || texto(file.mimetype).toLowerCase() === 'application/pdf';
    cb(valido ? null : new Error('Envie um arquivo PDF com os cartões escaneados.'), valido);
  },
});

router.use(autenticar, requireTenant, acessoPedagogico, attachActor);

function idValido(value) {
  return mongoose.isValidObjectId(texto(value));
}

function ehProfessor(req) {
  return texto(req.usuario?.tipo).toLowerCase() === 'professor';
}

function ator(req) {
  return req.usuario?.id || req.usuario?._id || null;
}

function listaTexto(value, limite = 100, tamanho = 100) {
  const lista = Array.isArray(value) ? value : (texto(value) ? String(value).split(',') : []);
  return [...new Set(lista.map((item) => texto(item).slice(0, tamanho)).filter(Boolean))].slice(0, limite);
}

function turmasProfessor(req) {
  return listaTexto(req.usuario?.turmas, 200, 100);
}

function turmaPermitida(req, turma) {
  if (!ehProfessor(req)) return true;
  const alvo = normalizarChave(turma);
  return turmasProfessor(req).some((item) => normalizarChave(item) === alvo);
}

function linhaTemIdioma(simulado, linha) {
  if (!linha?.dia) return simuladoTemIdioma(simulado);
  const questoes = (simulado?.questoes || []).filter((item) => Number(item.dia || 1) === Number(linha.dia));
  return diaTemIdioma(questoes);
}

function totaisDaImportacao(linhas, simulado) {
  return totaisImportacao(linhas, (linha) => linhaTemIdioma(simulado, linha));
}

function situacaoAplicacaoLinha(linha) {
  const valor = texto(linha?.situacaoAplicacao).toLowerCase();
  return ['ausente', 'descartada'].includes(valor) ? valor : 'presente';
}

function diasAplicacaoSimulado(simulado) {
  return [...new Set((simulado?.questoes || [])
    .map((questao) => Number(questao?.dia || 1))
    .filter((dia) => Number.isInteger(dia) && dia >= 1 && dia <= 10))]
    .sort((a, b) => a - b);
}

function respostaPreservada(item) {
  return {
    codigoQuestao: texto(item?.codigoQuestao).toUpperCase(),
    numero: Number(item?.numero) || 0,
    dia: Number(item?.dia) || 1,
    resposta: texto(item?.resposta).toUpperCase(),
    respostaInformada: Boolean(item?.respostaInformada),
  };
}

function respostasParaRecalculo(resultado) {
  const respostas = {};
  const porCodigo = new Map();

  for (const item of (resultado?.respostasPreservadasAusencia || [])) {
    const normalizada = respostaPreservada(item);
    if (normalizada.codigoQuestao) porCodigo.set(normalizada.codigoQuestao, normalizada);
  }
  for (const item of (resultado?.respostas || [])) {
    const normalizada = respostaPreservada(item);
    if (normalizada.codigoQuestao) porCodigo.set(normalizada.codigoQuestao, normalizada);
  }

  for (const item of porCodigo.values()) {
    if (item.respostaInformada) respostas[item.codigoQuestao] = item.resposta || 'BRANCO';
  }
  return respostas;
}

function respostasPreservadasParaDias(resultado, diasAusentes = []) {
  const ausentes = new Set((diasAusentes || []).map(Number).filter(Boolean));
  const porCodigo = new Map();

  for (const item of (resultado?.respostasPreservadasAusencia || [])) {
    const normalizada = respostaPreservada(item);
    if (normalizada.codigoQuestao) porCodigo.set(normalizada.codigoQuestao, normalizada);
  }
  for (const item of (resultado?.respostas || [])) {
    const normalizada = respostaPreservada(item);
    if (normalizada.codigoQuestao) porCodigo.set(normalizada.codigoQuestao, normalizada);
  }

  return [...porCodigo.values()]
    .filter((item) => ausentes.has(Number(item.dia)))
    .sort((a, b) => Number(a.dia) - Number(b.dia) || Number(a.numero) - Number(b.numero));
}

function camposDiagnostico(diagnostico) {
  return {
    idiomaEstrangeiro: diagnostico.idiomaEstrangeiro,
    idiomaConfirmado: diagnostico.idiomaEstrangeiro !== 'NAO_INFORMADO',
    diasAusentes: diagnostico.diasAusentes || [],
    respostas: diagnostico.respostas,
    resumoGeral: diagnostico.resumoGeral,
    porDia: diagnostico.porDia,
    porArea: diagnostico.porArea,
    porComponente: diagnostico.porComponente,
    porEixo: diagnostico.porEixo,
    porConteudo: diagnostico.porConteudo,
    porHabilidade: diagnostico.porHabilidade,
    porHabilidadeEnem: diagnostico.porHabilidadeEnem,
    porCompetenciaEnem: diagnostico.porCompetenciaEnem,
    porCompetencia: diagnostico.porCompetencia,
    porDescritor: diagnostico.porDescritor,
    porDificuldade: diagnostico.porDificuldade,
    avisos: diagnostico.avisos,
    versaoDiagnostico: 5,
  };
}

function resultadoComIdiomaEfetivo(simulado, resultado) {
  const base = resultado?.toObject ? resultado.toObject() : { ...(resultado || {}) };
  return { ...base, ...contextoIdiomaResultado(simulado, base) };
}

function filtroLeituraSimulado(req, extra = {}) {
  const filtro = { instituicao: req.instituicaoId, ...extra };
  if (!ehProfessor(req)) return filtro;
  const permitidas = turmasProfessor(req);
  if (!permitidas.length) return { ...filtro, _id: null };
  return {
    ...filtro,
    $or: [
      { turmas: { $exists: false } },
      { turmas: { $size: 0 } },
      { turmas: { $in: permitidas } },
    ],
  };
}

function filtroResultados(req, simuladoId, turma = '') {
  const filtro = { instituicao: req.instituicaoId, simulado: simuladoId };
  const solicitada = texto(turma).slice(0, 100);
  if (solicitada) {
    if (!turmaPermitida(req, solicitada)) return { ...filtro, _id: null };
    filtro.alunoTurmaSnapshot = solicitada;
    return filtro;
  }
  if (ehProfessor(req)) {
    const permitidas = turmasProfessor(req);
    if (!permitidas.length) return { ...filtro, _id: null };
    filtro.alunoTurmaSnapshot = { $in: permitidas };
  }
  return filtro;
}

function resumoSimulado(item) {
  return {
    _id: item._id,
    codigo: item.codigo,
    titulo: item.titulo,
    descricao: item.descricao,
    tipo: item.tipo,
    anoLetivo: item.anoLetivo,
    etapa: item.etapa,
    series: item.series || [],
    turmas: item.turmas || [],
    dias: item.dias || [],
    totalQuestoes: (item.questoes || []).length,
    possuiIdioma: simuladoTemIdioma(item),
    status: item.status,
    versaoMatriz: item.versaoMatriz,
    simuladoReferencia: item.simuladoReferencia || null,
    configuracaoAnalise: item.configuracaoAnalise,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function erro(res, status, mensagem, extra = {}) {
  return res.status(status).json({ ok: false, mensagem, ...extra });
}

async function auditar(req, acao, entidadeId, entidadeNome, extra = {}) {
  return logAction({
    req,
    acao,
    entidade: 'Simulado',
    entidadeId,
    entidadeNome,
    modulo: 'simulados',
    categoria: 'pedagogico',
    extra,
  });
}

async function carregarSimulado(req, res, next) {
  try {
    if (!idValido(req.params.simuladoId)) return erro(res, 400, 'Simulado inválido.');
    const simulado = await Simulado.findOne(filtroLeituraSimulado(req, { _id: req.params.simuladoId }));
    if (!simulado) return erro(res, 404, 'Simulado não encontrado ou não disponível para o seu perfil.');
    req.simuladoDiagnostico = simulado;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function carregarImportacao(req, res, next) {
  try {
    if (!idValido(req.params.importacaoId)) return erro(res, 400, 'Importação inválida.');
    const importacao = await SimuladoImportacao.findOne({
      _id: req.params.importacaoId,
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    });
    if (!importacao) return erro(res, 404, 'Importação não encontrada.');
    req.importacaoSimulado = importacao;
    return next();
  } catch (error) {
    return next(error);
  }
}

function resumoSubstituicao(importacao) {
  if (!importacao) return null;
  const linhas = importacao.linhas || [];
  const vinculosDisponiveis = linhas.filter((linha) => linha?.aluno
    && ['automatico', 'manual'].includes(texto(linha.vinculoStatus))).length;
  return {
    importacaoId: importacao._id,
    arquivo: importacao.arquivo?.nomeOriginal || '',
    turma: importacao.arquivo?.turma || '',
    dia: importacao.arquivo?.dia || null,
    processadoEm: importacao.processadoEm || importacao.updatedAt || importacao.createdAt || null,
    resultados: Number(importacao.totais?.processadas || vinculosDisponiveis || 0),
    vinculosDisponiveis,
  };
}

async function buscarImportacaoAnterior(req, importacao, idExplicito = '') {
  const idAnterior = texto(idExplicito || importacao?.substituiImportacao);
  const filtro = {
    instituicao: req.instituicaoId,
    simulado: req.simuladoDiagnostico._id,
    status: 'processada',
  };
  if (idAnterior) {
    if (!idValido(idAnterior)) return null;
    filtro._id = idAnterior;
    return SimuladoImportacao.findOne(filtro).lean();
  }

  const hash = texto(importacao?.arquivo?.sha256);
  if (!hash) return null;
  filtro._id = { $ne: importacao?._id };
  filtro['arquivo.sha256'] = hash;
  filtro['arquivo.formato'] = importacao?.arquivo?.formato;
  if (importacao?.arquivo?.formato === 'pdf') {
    filtro['arquivo.turma'] = importacao?.arquivo?.turma;
    filtro['arquivo.dia'] = importacao?.arquivo?.dia;
  }
  return SimuladoImportacao.findOne(filtro).sort({ processadoEm: -1, updatedAt: -1 }).lean();
}

async function aplicarVinculosAnteriores(req, importacao, anterior) {
  if (!anterior || importacao?.arquivo?.formato !== 'pdf') {
    return { recuperados: 0, indisponiveis: 0 };
  }
  const ids = [...new Set((anterior.linhas || [])
    .map((linha) => texto(linha?.aluno))
    .filter((id) => idValido(id)))];
  const alunos = ids.length
    ? await Aluno.find({ _id: { $in: ids }, instituicao: req.instituicaoId })
      .select('_id nome turma codigoAcesso').lean()
    : [];
  return recuperarVinculos({
    linhasAtuais: importacao.linhas || [],
    linhasAnteriores: anterior.linhas || [],
    alunos,
  });
}

router.get('/bootstrap', async (req, res, next) => {
  try {
    let turmas = await Aluno.distinct('turma', { instituicao: req.instituicaoId });
    turmas = listaTexto(turmas, 500, 100).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (ehProfessor(req)) {
      const permitidas = new Set(turmasProfessor(req).map(normalizarChave));
      turmas = turmas.filter((item) => permitidas.has(normalizarChave(item)));
    }
    const referencias = await Simulado.find(filtroLeituraSimulado(req, { status: { $ne: 'arquivado' } }))
      .sort({ anoLetivo: -1, createdAt: -1 })
      .select('codigo titulo anoLetivo turmas status')
      .limit(100)
      .lean();
    return res.json({
      ok: true,
      versao: '1.12.3',
      usuario: { nome: req.usuario?.nome || '', tipo: req.usuario?.tipo || '', turmas: turmasProfessor(req) },
      permissoes: { gestao: ehGestaoPedagogica(req), somenteLeitura: !ehGestaoPedagogica(req) },
      turmas,
      referencias,
      anoAtual: new Date().getFullYear(),
      formatosImportacao: ['xlsx', 'csv', 'json', 'pdf_escaneado'],
      regras: {
        idiomaExplicito: true,
        idiomaInferido: false,
        leituraOmrLocal: true,
        revisaoAmbiguidadeObrigatoria: true,
        brancosSeparados: true,
        respostasAusentesSeparadas: true,
        retomadaAutomatica: true,
        ausenciaConfirmadaNaoContabiliza: true,
        descarteReversivelAntesDaConfirmacao: true,
        diagnosticoExplicado: true,
        habilidadesEnemOficiais: true,
        mapeamentoEnemExplicito: true,
        habilidadeEnemNaoInferidaPorConteudo: true,
        relatorioEspecificoHabilidadesEnemPdf: true,
        classificacaoPorDesempenhoConfirmado: true,
        idiomaNaoMarcadoZeraQuestoes: true,
        idiomaNaoMarcadoNaoEhInferido: true,
        recuperaVinculosDiagnosticoAnterior: true,
        substituicaoDiagnosticoSemDuplicidade: true,
        revisaoIdiomaPosProcessamento: true,
        revisaoIdiomaLotePreservaRespostas: true,
        revisaoParticipacaoPosProcessamento: true,
        ausenciaPosProcessamentoPreservaRespostas: true,
        idiomaAusenteNaoGeraPendencia: true,
        idiomaConfirmadoPreservadoNaAusencia: true,
        participacaoParcialSeparadaDeBaseIncompleta: true,
        restauracaoDiaAusente: true,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/alunos/buscar', apenasGestaoPedagogica, async (req, res, next) => {
  try {
    const busca = texto(req.query.q).slice(0, 100);
    const turma = texto(req.query.turma).slice(0, 100);
    const filtro = { instituicao: req.instituicaoId };
    if (turma) filtro.turma = turma;
    if (busca) {
      const seguro = busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro.$or = [
        { nome: { $regex: seguro, $options: 'i' } },
        { codigoAcesso: { $regex: seguro, $options: 'i' } },
      ];
    }
    const alunos = await Aluno.find(filtro).select('_id nome turma codigoAcesso').sort({ turma: 1, nome: 1 }).limit(30).lean();
    return res.json({ ok: true, alunos });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const filtro = filtroLeituraSimulado(req);
    if (texto(req.query.status)) filtro.status = texto(req.query.status).slice(0, 40);
    if (Number.isInteger(Number(req.query.anoLetivo))) filtro.anoLetivo = Number(req.query.anoLetivo);
    const itens = await Simulado.find(filtro).sort({ anoLetivo: -1, updatedAt: -1 }).limit(200).lean();
    const ids = itens.map((item) => item._id);
    const [contagens, importacoesPendentes] = ids.length ? await Promise.all([
      SimuladoResultado.aggregate([
        { $match: { instituicao: new mongoose.Types.ObjectId(req.instituicaoId), simulado: { $in: ids } } },
        { $group: { _id: '$simulado', resultados: { $sum: 1 } } },
      ]),
      SimuladoImportacao.aggregate([
        { $match: { instituicao: new mongoose.Types.ObjectId(req.instituicaoId), simulado: { $in: ids }, status: 'analisada' } },
        { $group: { _id: '$simulado', pendentes: { $sum: 1 }, ultimaAtualizacao: { $max: '$updatedAt' } } },
      ]),
    ]) : [[], []];
    const porId = new Map(contagens.map((item) => [String(item._id), item.resultados]));
    const pendentesPorId = new Map(importacoesPendentes.map((item) => [String(item._id), item]));
    return res.json({ ok: true, simulados: itens.map((item) => {
      const pendencia = pendentesPorId.get(String(item._id));
      return {
        ...resumoSimulado(item),
        resultados: porId.get(String(item._id)) || 0,
        importacoesPendentes: pendencia?.pendentes || 0,
        ultimaImportacaoPendenteEm: pendencia?.ultimaAtualizacao || null,
      };
    }) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', apenasGestaoPedagogica, async (req, res, next) => {
  try {
    const titulo = texto(req.body?.titulo).slice(0, 240);
    const anoLetivo = Number(req.body?.anoLetivo);
    if (!titulo) return erro(res, 400, 'Informe o título do simulado.');
    if (!Number.isInteger(anoLetivo) || anoLetivo < 2000 || anoLetivo > 2200) return erro(res, 400, 'Ano letivo inválido.');
    const codigoBase = texto(req.body?.codigo) || `${anoLetivo}-${normalizarChave(titulo).slice(0, 40)}`;
    const codigo = normalizarChave(codigoBase).slice(0, 60);
    if (!codigo) return erro(res, 400, 'Informe um código válido para o simulado.');
    const tipo = ['enem', 'saeb', 'interno', 'olimpiada', 'outro'].includes(req.body?.tipo) ? req.body.tipo : 'interno';
    const turmas = listaTexto(req.body?.turmas, 500, 100);
    const series = listaTexto(req.body?.series, 100, 100);
    let simuladoReferencia = null;
    if (idValido(req.body?.simuladoReferencia)) {
      const existe = await Simulado.exists({ _id: req.body.simuladoReferencia, instituicao: req.instituicaoId });
      if (!existe) return erro(res, 400, 'O simulado de referência não pertence a esta instituição.');
      simuladoReferencia = req.body.simuladoReferencia;
    }
    const simulado = await Simulado.create({
      instituicao: req.instituicaoId,
      tenantId: req.instituicaoId,
      codigo,
      titulo,
      descricao: texto(req.body?.descricao).slice(0, 4000),
      tipo,
      anoLetivo,
      etapa: texto(req.body?.etapa).slice(0, 120) || 'Ensino Médio',
      series,
      turmas,
      dias: [{ numero: 1, titulo: 'Dia 1' }],
      configuracaoAnalise: {
        percentualConsolidado: Number(req.body?.configuracaoAnalise?.percentualConsolidado) || 70,
        percentualAtencao: Number(req.body?.configuracaoAnalise?.percentualAtencao) || 50,
        minimoQuestoesIndicador: Number(req.body?.configuracaoAnalise?.minimoQuestoesIndicador) || 2,
        minimoRespondentesQuestao: Number(req.body?.configuracaoAnalise?.minimoRespondentesQuestao) || 5,
        minimoAlunosGrupo: Number(req.body?.configuracaoAnalise?.minimoAlunosGrupo) || 2,
        minimoCoberturaIndividual: Number(req.body?.configuracaoAnalise?.minimoCoberturaIndividual) || 80,
      },
      simuladoReferencia,
      criadoPor: ator(req),
      atualizadoPor: ator(req),
    });
    await auditar(req, 'CRIAR', simulado._id, simulado.titulo, { codigo, anoLetivo, turmas });
    return res.status(201).json({ ok: true, mensagem: 'Simulado criado. Agora importe a matriz pedagógica.', simulado: resumoSimulado(simulado) });
  } catch (error) {
    if (error?.code === 11000) return erro(res, 409, 'Já existe um simulado com esse código nesta instituição.');
    return next(error);
  }
});

router.get('/:simuladoId/modelo-matriz.xlsx', carregarSimulado, async (req, res, next) => {
  try {
    const buffer = await gerarModeloMatriz(req.simuladoDiagnostico.toObject());
    res.setHeader('Content-Type', MIME_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="matriz-${nomeSeguro(req.simuladoDiagnostico.codigo)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/modelo-mapeamento-enem.xlsx', carregarSimulado, async (req, res, next) => {
  try {
    if (req.simuladoDiagnostico.tipo !== 'enem') return erro(res, 409, 'O mapeamento oficial de habilidades está disponível para simulados do tipo ENEM.');
    if (!req.simuladoDiagnostico.questoes?.length) return erro(res, 409, 'Importe a matriz antes de gerar o mapeamento ENEM.');
    const buffer = await gerarModeloMapeamentoEnem(req.simuladoDiagnostico.toObject());
    res.setHeader('Content-Type', MIME_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="mapeamento-enem-${nomeSeguro(req.simuladoDiagnostico.codigo)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/mapeamento-enem/importar', apenasGestaoPedagogica, carregarSimulado, upload.single('arquivo'), async (req, res, next) => {
  try {
    if (req.simuladoDiagnostico.tipo !== 'enem') return erro(res, 409, 'Este simulado não está configurado como ENEM.');
    if (!req.file) return erro(res, 400, 'Selecione a planilha de mapeamento ENEM.');
    if (!req.simuladoDiagnostico.questoes?.length) return erro(res, 409, 'Importe a matriz antes do mapeamento ENEM.');
    const tabela = await lerTabela({ buffer: req.file.buffer, nomeArquivo: req.file.originalname, mimeType: req.file.mimetype });
    if (tabela.linhas.length > 1200) return erro(res, 413, 'O mapeamento ultrapassa o limite de 1.200 linhas.');
    const analise = analisarMapeamentoEnem(tabela, req.simuladoDiagnostico.toObject());
    if (analise.erros.length) return erro(res, 422, 'O mapeamento ENEM possui inconsistências e não foi aplicado.', analise);

    const porChave = new Map(analise.atualizacoes.map((item) => [`${item.codigo}::${item.variante}`, item]));
    let alteradas = 0;
    for (const questao of req.simuladoDiagnostico.questoes || []) {
      for (const item of questao.variantes || []) {
        const atualizacao = porChave.get(`${texto(questao.codigo).toUpperCase()}::${texto(item.codigo).toUpperCase()}`);
        if (!atualizacao) continue;
        const anterior = texto(item.habilidadeEnem).toUpperCase();
        const confiancaAnteriorBruta = texto(item.habilidadeEnemConfianca).toLowerCase();
        const confiancaAnterior = anterior && (!confiancaAnteriorBruta || confiancaAnteriorBruta === 'nao_informada')
          ? 'direta'
          : (confiancaAnteriorBruta || 'nao_informada');
        const confiancaNova = texto(atualizacao.habilidadeEnemConfianca).toLowerCase() || (atualizacao.habilidadeEnem ? 'direta' : 'nao_informada');
        if (anterior !== atualizacao.habilidadeEnem || confiancaAnterior !== confiancaNova) {
          item.habilidadeEnem = atualizacao.habilidadeEnem;
          item.habilidadeEnemConfianca = confiancaNova;
          alteradas += 1;
        }
      }
    }
    if (alteradas) {
      req.simuladoDiagnostico.versaoMatriz = Number(req.simuladoDiagnostico.versaoMatriz || 0) + 1;
      req.simuladoDiagnostico.atualizadoPor = ator(req);
      req.simuladoDiagnostico.markModified('questoes');
      await req.simuladoDiagnostico.save();
    }

    const resultados = alteradas ? await SimuladoResultado.find({ instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id }).lean() : [];
    let recalculados = 0;
    if (resultados.length) {
      const simuladoObjeto = req.simuladoDiagnostico.toObject();
      const agora = new Date();
      const operacoes = resultados.map((resultado) => {
        const diagnostico = avaliarResultado(simuladoObjeto, {
          respostas: respostasParaRecalculo(resultado),
          idiomaEstrangeiro: resultado.idiomaEstrangeiro,
          diasAusentes: resultado.diasAusentes || [],
        });
        return {
          updateOne: {
            filter: { _id: resultado._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
            update: { $set: {
              ...camposDiagnostico(diagnostico),
              versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
              processadoPor: ator(req),
              processadoEm: agora,
            } },
          },
        };
      });
      await SimuladoResultado.bulkWrite(operacoes, { ordered: true });
      recalculados = operacoes.length;
    }

    await auditar(req, 'MAPEAR_HABILIDADES_ENEM', req.simuladoDiagnostico._id, req.simuladoDiagnostico.titulo, {
      arquivo: req.file.originalname,
      sha256: sha256(req.file.buffer),
      linhas: analise.atualizacoes.length,
      variantesAlteradas: alteradas,
      resultadosRecalculados: recalculados,
      versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
      versaoDiagnostico: 5,
    });
    return res.json({
      ok: true,
      mensagem: alteradas
        ? `${alteradas} variante(s) tiveram o mapeamento ENEM atualizado e ${recalculados} resultado(s) foram recalculados sem alterar respostas ou gabarito.`
        : 'O arquivo foi validado, mas não havia mudanças no mapeamento ENEM.',
      variantesAlteradas: alteradas,
      resultadosRecalculados: recalculados,
      avisos: analise.avisos,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/matriz/importar', apenasGestaoPedagogica, carregarSimulado, upload.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return erro(res, 400, 'Selecione a planilha da matriz.');
    const resultadosExistentes = await SimuladoResultado.countDocuments({ instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id });
    if (resultadosExistentes) {
      return erro(res, 409, 'A matriz não pode ser substituída depois que há resultados. Crie outro simulado para preservar o histórico.');
    }
    const tabela = await lerTabela({ buffer: req.file.buffer, nomeArquivo: req.file.originalname, mimeType: req.file.mimetype });
    if (tabela.linhas.length > 1200) return erro(res, 413, 'A matriz ultrapassa o limite de 1.200 linhas.');
    const analise = analisarMatriz(tabela);
    if (analise.erros.length) return erro(res, 422, 'A matriz possui inconsistências e não foi gravada.', analise);

    const dias = [...new Set(analise.questoes.map((item) => item.dia))].sort((a, b) => a - b).map((dia) => ({
      numero: dia,
      titulo: `Dia ${dia}`,
      quantidadeQuestoes: analise.questoes.filter((item) => item.dia === dia).length,
    }));
    const primeiraMatriz = !req.simuladoDiagnostico.questoes?.length;
    req.simuladoDiagnostico.questoes = analise.questoes;
    req.simuladoDiagnostico.dias = dias;
    req.simuladoDiagnostico.status = 'matriz_pronta';
    req.simuladoDiagnostico.versaoMatriz = primeiraMatriz
      ? Math.max(1, Number(req.simuladoDiagnostico.versaoMatriz) || 1)
      : Number(req.simuladoDiagnostico.versaoMatriz || 0) + 1;
    req.simuladoDiagnostico.atualizadoPor = ator(req);
    await req.simuladoDiagnostico.save();
    await auditar(req, 'IMPORTAR_MATRIZ', req.simuladoDiagnostico._id, req.simuladoDiagnostico.titulo, {
      arquivo: req.file.originalname,
      sha256: sha256(req.file.buffer),
      questoes: analise.questoes.length,
      variantes: analise.questoes.reduce((total, item) => total + item.variantes.length, 0),
      avisos: analise.avisos.length,
    });
    return res.json({
      ok: true,
      mensagem: `Matriz importada com ${analise.questoes.length} questão(ões).`,
      avisos: analise.avisos,
      simulado: resumoSimulado(req.simuladoDiagnostico),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/modelo-respostas.xlsx', carregarSimulado, async (req, res, next) => {
  try {
    if (!req.simuladoDiagnostico.questoes?.length) return erro(res, 409, 'Importe a matriz antes de gerar o modelo de respostas.');
    let turmas = listaTexto(req.query.turmas, 500, 100);
    if (!turmas.length) turmas = req.simuladoDiagnostico.turmas || [];
    if (ehProfessor(req)) {
      const permitidas = turmasProfessor(req);
      turmas = turmas.length ? turmas.filter((item) => turmaPermitida(req, item)) : permitidas;
    }
    const filtro = { instituicao: req.instituicaoId };
    if (turmas.length) filtro.turma = { $in: turmas };
    const alunos = await Aluno.find(filtro).select('_id nome turma codigoAcesso').sort({ turma: 1, nome: 1 }).lean();
    const buffer = await gerarModeloRespostas(req.simuladoDiagnostico.toObject(), alunos);
    res.setHeader('Content-Type', MIME_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="respostas-${nomeSeguro(req.simuladoDiagnostico.codigo)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/importacoes/analisar', apenasGestaoPedagogica, carregarSimulado, upload.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) return erro(res, 400, 'Selecione o arquivo de respostas.');
    if (!req.simuladoDiagnostico.questoes?.length) return erro(res, 409, 'Importe a matriz antes das respostas.');
    const tabela = await lerTabela({ buffer: req.file.buffer, nomeArquivo: req.file.originalname, mimeType: req.file.mimetype });
    if (tabela.linhas.length > 1000) return erro(res, 413, 'O arquivo possui mais de 1.000 alunos. Divida a importação por turma.');

    const filtroAlunos = { instituicao: req.instituicaoId };
    if (req.simuladoDiagnostico.turmas?.length) filtroAlunos.turma = { $in: req.simuladoDiagnostico.turmas };
    const alunos = await Aluno.find(filtroAlunos).select('_id nome turma codigoAcesso').lean();
    const analise = analisarRespostas({ tabela, simulado: req.simuladoDiagnostico.toObject(), alunos });
    if (Buffer.byteLength(JSON.stringify(analise.linhas), 'utf8') > 12 * 1024 * 1024) {
      return erro(res, 413, 'A importação estruturada ficou grande demais. Divida o arquivo por turma.');
    }
    const hash = sha256(req.file.buffer);
    const repetida = await SimuladoImportacao.findOne({
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
      'arquivo.sha256': hash,
      status: { $ne: 'cancelada' },
    }).sort({ updatedAt: -1 }).lean();
    if (repetida?.status === 'analisada') {
      return res.json({
        ok: true,
        retomada: true,
        mensagem: 'Este arquivo já possuía uma conferência em andamento. O progresso salvo foi retomado.',
        importacao: repetida,
      });
    }
    if (repetida) analise.avisos.push(`Este mesmo arquivo já foi analisado em ${new Date(repetida.createdAt).toLocaleString('pt-BR')}.`);

    const importacao = await SimuladoImportacao.create({
      instituicao: req.instituicaoId,
      tenantId: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
      arquivo: {
        nomeOriginal: texto(req.file.originalname).slice(0, 255),
        mimeType: texto(req.file.mimetype).slice(0, 120),
        tamanhoBytes: req.file.size,
        sha256: hash,
        formato: tabela.formato,
        planilha: tabela.planilha,
      },
      status: 'analisada',
      linhas: analise.linhas,
      totais: analise.totais,
      avisos: analise.avisos,
      criadoPor: ator(req),
    });
    await auditar(req, 'ANALISAR_IMPORTACAO', importacao._id, req.simuladoDiagnostico.titulo, {
      simulado: req.simuladoDiagnostico._id,
      arquivo: req.file.originalname,
      hash,
      totais: analise.totais,
    });
    return res.status(201).json({
      ok: true,
      mensagem: 'Arquivo analisado. Confira os vínculos e as línguas antes de confirmar.',
      importacao,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/cartoes/analisar', apenasGestaoPedagogica, carregarSimulado, uploadCartoes.single('cartoes'), async (req, res, next) => {
  try {
    if (!req.file) return erro(res, 400, 'Selecione o PDF escaneado dos cartões-resposta.');
    if (!req.simuladoDiagnostico.questoes?.length) return erro(res, 409, 'Importe a matriz antes dos cartões-resposta.');
    const turma = texto(req.body?.turma).slice(0, 100);
    const dia = Number(req.body?.dia);
    if (!turma) return erro(res, 400, 'Selecione a turma dos cartões.');
    if (!turmaPermitida(req, turma)) return erro(res, 403, 'Esta turma não está disponível para o seu perfil.');
    if (req.simuladoDiagnostico.turmas?.length && !req.simuladoDiagnostico.turmas
      .some((item) => normalizarChave(item) === normalizarChave(turma))) {
      return erro(res, 409, 'A turma selecionada não participa deste simulado.');
    }
    if (![1, 2].includes(dia)) return erro(res, 400, 'Selecione o dia 1 ou o dia 2.');

    const analise = await analisarPdfCartoes({
      arquivo: req.file,
      simulado: req.simuladoDiagnostico.toObject(),
      turma,
      dia,
    });
    analise.totais = totaisDaImportacao(analise.linhas, req.simuladoDiagnostico);
    const tamanhoEstruturado = Buffer.byteLength(JSON.stringify(analise.linhas), 'utf8');
    if (tamanhoEstruturado > 13 * 1024 * 1024) {
      return erro(res, 413, 'A prévia dos cartões ultrapassou o limite seguro. Divida o PDF em duas partes.');
    }

    const hash = sha256(req.file.buffer);
    const repetida = await SimuladoImportacao.findOne({
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
      'arquivo.sha256': hash,
      status: { $in: ['analisada', 'processada'] },
    }).sort({ updatedAt: -1 }).lean();
    if (repetida?.status === 'analisada') {
      const anterior = await buscarImportacaoAnterior(req, repetida);
      return res.json({
        ok: true,
        retomada: true,
        mensagem: 'Este PDF já possuía uma conferência em andamento. O progresso salvo foi retomado.',
        importacao: repetida,
        substituicao: resumoSubstituicao(anterior),
      });
    }
    if (repetida) analise.avisos.push(`Este mesmo PDF já foi analisado em ${new Date(repetida.createdAt).toLocaleString('pt-BR')}.`);

    const anterior = repetida?.status === 'processada' ? repetida : null;
    let recuperacao = { recuperados: 0, indisponiveis: 0 };
    if (anterior) {
      recuperacao = await aplicarVinculosAnteriores(req, {
        arquivo: { formato: 'pdf', sha256: hash, turma, dia },
        linhas: analise.linhas,
      }, anterior);
      analise.totais = totaisDaImportacao(analise.linhas, req.simuladoDiagnostico);
      if (recuperacao.recuperados) {
        analise.avisos.push(`${recuperacao.recuperados} vínculo(s) de aluno foram recuperados do diagnóstico anterior. As respostas e a língua desta nova leitura foram preservadas.`);
      }
      if (recuperacao.indisponiveis) {
        analise.avisos.push(`${recuperacao.indisponiveis} vínculo(s) anterior(es) não puderam ser reutilizados e precisam de conferência.`);
      }
    }

    const importacao = await SimuladoImportacao.create({
      instituicao: req.instituicaoId,
      tenantId: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
      arquivo: {
        nomeOriginal: texto(req.file.originalname).slice(0, 255),
        mimeType: texto(req.file.mimetype).slice(0, 120),
        tamanhoBytes: req.file.size,
        sha256: hash,
        formato: 'pdf',
        planilha: '',
        turma,
        dia,
        motorLeitura: analise.motor,
      },
      status: 'analisada',
      linhas: analise.linhas,
      totais: analise.totais,
      avisos: analise.avisos,
      criadoPor: ator(req),
      substituiImportacao: anterior?._id || null,
      vinculosRecuperados: recuperacao.recuperados,
      vinculosRecuperadosEm: recuperacao.recuperados ? new Date() : null,
    });
    await auditar(req, 'ANALISAR_CARTOES_OMR', importacao._id, req.simuladoDiagnostico.titulo, {
      simulado: req.simuladoDiagnostico._id,
      arquivo: req.file.originalname,
      hash,
      turma,
      dia,
      paginas: analise.linhas.length,
      totais: analise.totais,
    });
    return res.status(201).json({
      ok: true,
      mensagem: `${analise.linhas.length} cartão(ões) lido(s). Vincule os alunos e confira as marcações sinalizadas.`,
      importacao,
      substituicao: resumoSubstituicao(anterior),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/importacoes', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    const statusSolicitado = texto(req.query.status).toLowerCase();
    const statusPermitidos = ['analisada', 'processando', 'processada', 'substituida', 'erro', 'cancelada'];
    const filtro = {
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    };
    filtro.status = statusPermitidos.includes(statusSolicitado) ? statusSolicitado : 'analisada';
    const limite = Math.min(50, Math.max(1, Number(req.query.limite) || 20));
    const importacoes = await SimuladoImportacao.find(filtro)
      .select('arquivo status totais avisos erro criadoPor processadoPor processadoEm substituiImportacao vinculosRecuperados vinculosRecuperadosEm substituidaPorImportacao substituidaEm createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limite)
      .lean();
    return res.json({ ok: true, importacoes });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/importacoes/:importacaoId', apenasGestaoPedagogica, carregarSimulado, carregarImportacao, async (req, res, next) => {
  try {
    const anterior = req.importacaoSimulado.status === 'analisada'
      ? await buscarImportacaoAnterior(req, req.importacaoSimulado)
      : null;
    return res.json({
      ok: true,
      importacao: req.importacaoSimulado,
      substituicao: resumoSubstituicao(anterior),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/importacoes/:importacaoId/recuperar-vinculos', apenasGestaoPedagogica, carregarSimulado, carregarImportacao, async (req, res, next) => {
  try {
    if (req.importacaoSimulado.status !== 'analisada') {
      return erro(res, 409, 'Somente uma conferência ainda não processada pode recuperar vínculos.');
    }
    if (req.importacaoSimulado.arquivo?.formato !== 'pdf') {
      return erro(res, 409, 'A recuperação de vínculos anteriores está disponível para cartões em PDF.');
    }
    const anterior = await buscarImportacaoAnterior(req, req.importacaoSimulado);
    if (!anterior) {
      return erro(res, 404, 'Não foi encontrado um diagnóstico anterior processado a partir deste mesmo PDF.');
    }

    const recuperacao = await aplicarVinculosAnteriores(req, req.importacaoSimulado, anterior);
    req.importacaoSimulado.substituiImportacao = anterior._id;
    req.importacaoSimulado.vinculosRecuperados = Number(req.importacaoSimulado.vinculosRecuperados || 0) + recuperacao.recuperados;
    if (recuperacao.recuperados) req.importacaoSimulado.vinculosRecuperadosEm = new Date();
    req.importacaoSimulado.totais = totaisDaImportacao(req.importacaoSimulado.linhas, req.simuladoDiagnostico);
    const aviso = `${recuperacao.recuperados} vínculo(s) recuperado(s) do diagnóstico anterior. Idiomas e respostas permaneceram os desta nova conferência.`;
    if (recuperacao.recuperados && !req.importacaoSimulado.avisos.includes(aviso)) {
      req.importacaoSimulado.avisos.push(aviso);
    }
    req.importacaoSimulado.markModified('linhas');
    await req.importacaoSimulado.save();

    await auditar(req, 'RECUPERAR_VINCULOS_DIAGNOSTICO', req.importacaoSimulado._id, req.simuladoDiagnostico.titulo, {
      simulado: req.simuladoDiagnostico._id,
      importacaoAnterior: anterior._id,
      recuperados: recuperacao.recuperados,
      indisponiveis: recuperacao.indisponiveis,
    });
    return res.json({
      ok: true,
      mensagem: recuperacao.recuperados
        ? `${recuperacao.recuperados} vínculo(s) recuperado(s). Confira somente as pendências restantes.`
        : 'Nenhum vínculo adicional pôde ser recuperado. Os vínculos já confirmados foram preservados.',
      recuperados: recuperacao.recuperados,
      indisponiveis: recuperacao.indisponiveis,
      importacao: req.importacaoSimulado,
      substituicao: resumoSubstituicao(anterior),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:simuladoId/importacoes/:importacaoId', apenasGestaoPedagogica, carregarSimulado, carregarImportacao, async (req, res, next) => {
  try {
    if (req.importacaoSimulado.status !== 'analisada') {
      return erro(res, 409, 'Somente conferências ainda não processadas podem ser excluídas.');
    }

    const totaisAnteriores = req.importacaoSimulado.totais?.toObject?.()
      || { ...(req.importacaoSimulado.totais || {}) };
    const nomeArquivo = texto(req.importacaoSimulado.arquivo?.nomeOriginal) || 'Importação sem nome';
    const hashArquivo = texto(req.importacaoSimulado.arquivo?.sha256);

    req.importacaoSimulado.status = 'cancelada';
    req.importacaoSimulado.linhas = [];
    req.importacaoSimulado.totais = {
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
    };
    req.importacaoSimulado.avisos = [];
    req.importacaoSimulado.erro = '';
    req.importacaoSimulado.processadoPor = ator(req);
    req.importacaoSimulado.processadoEm = new Date();
    await req.importacaoSimulado.save();

    await auditar(req, 'EXCLUIR_CONFERENCIA_IMPORTACAO', req.importacaoSimulado._id, nomeArquivo, {
      simulado: req.simuladoDiagnostico._id,
      arquivo: nomeArquivo,
      hash: hashArquivo,
      totaisAnteriores,
    });

    return res.json({
      ok: true,
      mensagem: 'Conferência excluída. Ela não aparecerá mais entre os trabalhos em andamento.',
      importacaoId: req.importacaoSimulado._id,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:simuladoId/importacoes/:importacaoId/linhas/:numeroLinha', apenasGestaoPedagogica, carregarSimulado, carregarImportacao, async (req, res, next) => {
  try {
    if (req.importacaoSimulado.status !== 'analisada') return erro(res, 409, 'Somente importações ainda não confirmadas podem ser corrigidas.');
    const numeroLinha = Number(req.params.numeroLinha);
    const linha = req.importacaoSimulado.linhas.find((item) => item.numeroLinha === numeroLinha);
    if (!linha) return erro(res, 404, 'Linha da importação não encontrada.');

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'alunoId')) {
      const alunoId = texto(req.body.alunoId);
      if (!idValido(alunoId)) return erro(res, 400, 'Selecione um aluno válido.');
      const aluno = await Aluno.findOne({ _id: alunoId, instituicao: req.instituicaoId }).select('_id nome turma codigoAcesso').lean();
      if (!aluno) return erro(res, 404, 'Aluno não encontrado nesta instituição.');
      if (req.simuladoDiagnostico.turmas?.length && !req.simuladoDiagnostico.turmas.includes(aluno.turma)) {
        return erro(res, 409, 'O aluno não pertence a uma turma selecionada para este simulado.');
      }
      if (linha.fonte === 'cartao_pdf' && normalizarChave(aluno.turma) !== normalizarChave(linha.turmaInformada)) {
        return erro(res, 409, `Selecione um aluno da turma ${linha.turmaInformada}.`);
      }
      linha.aluno = aluno._id;
      linha.vinculoStatus = 'manual';
      linha.candidatos = [];
      if (linha.fonte === 'cartao_pdf') {
        linha.nomeInformado = aluno.nome;
        linha.turmaInformada = aluno.turma;
        linha.codigoInformado = aluno.codigoAcesso || '';
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'idiomaEstrangeiro')) {
      linha.idiomaEstrangeiro = normalizarIdioma(req.body.idiomaEstrangeiro, { aplicavel: simuladoTemIdioma(req.simuladoDiagnostico) });
      const origens = ['manual', 'lista', 'cartao', 'prova'];
      linha.idiomaOrigem = origens.includes(req.body.idiomaOrigem) ? req.body.idiomaOrigem : 'manual';
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'situacaoAplicacao')) {
      const situacao = texto(req.body.situacaoAplicacao).toLowerCase();
      if (!['presente', 'ausente', 'descartada'].includes(situacao)) {
        return erro(res, 400, 'Situação da aplicação inválida.');
      }
      if (situacao === 'ausente' && !linha.aluno) {
        return erro(res, 409, 'Selecione o aluno antes de registrar a ausência.');
      }
      linha.situacaoAplicacao = situacao;
      linha.situacaoAplicacaoMotivo = texto(req.body.situacaoAplicacaoMotivo || (situacao === 'ausente' ? 'Ausência confirmada na aplicação.' : '')).slice(0, 500);
      linha.situacaoAplicacaoPor = ator(req);
      linha.situacaoAplicacaoEm = new Date();
      if (situacao === 'ausente' && !linha.avisos.includes('Ausência confirmada: as questões deste dia não entrarão no diagnóstico do aluno.')) {
        linha.avisos.push('Ausência confirmada: as questões deste dia não entrarão no diagnóstico do aluno.');
      }
      if (situacao === 'descartada' && !linha.avisos.includes('Página descartada da importação; os dados foram preservados para permitir restauração antes da confirmação.')) {
        linha.avisos.push('Página descartada da importação; os dados foram preservados para permitir restauração antes da confirmação.');
      }
      if (situacao === 'presente') {
        linha.avisos = (linha.avisos || []).filter((aviso) => !/Ausência confirmada:|Página descartada da importação/i.test(aviso));
      }
      req.importacaoSimulado.markModified('linhas');
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'respostas') || req.body?.confirmarOmr === true) {
      if (req.importacaoSimulado.arquivo?.formato !== 'pdf' || linha.fonte !== 'cartao_pdf') {
        return erro(res, 409, 'A revisão visual de respostas está disponível somente para cartões em PDF.');
      }
      const dia = Number(linha.dia || req.importacaoSimulado.arquivo?.dia);
      const { questoes } = questoesDoDia(req.simuladoDiagnostico.toObject(), dia);
      const permitidas = new Set(questoes.map((item) => texto(item.codigo).toUpperCase()));
      const respostasAtuais = linha.respostas && typeof linha.respostas.toObject === 'function'
        ? linha.respostas.toObject()
        : { ...(linha.respostas || {}) };
      if (req.body?.respostas && (typeof req.body.respostas !== 'object' || Array.isArray(req.body.respostas))) {
        return erro(res, 400, 'As respostas revisadas não possuem um formato válido.');
      }
      for (const [codigoOriginal, valor] of Object.entries(req.body?.respostas || {})) {
        const codigo = texto(codigoOriginal).toUpperCase();
        if (!permitidas.has(codigo)) return erro(res, 400, `A questão ${codigo || 'sem código'} não pertence ao dia ${dia}.`);
        const resposta = normalizarResposta(valor);
        if (!resposta.informada) return erro(res, 400, `Informe A, B, C, D, E ou BRANCO em ${codigo}.`);
        respostasAtuais[codigo] = resposta.resposta || 'BRANCO';
      }
      linha.respostas = respostasAtuais;

      if (req.body?.confirmarOmr === true) {
        const faltantes = questoes
          .map((item) => texto(item.codigo).toUpperCase())
          .filter((codigo) => !Object.prototype.hasOwnProperty.call(respostasAtuais, codigo));
        if (faltantes.length) {
          return erro(res, 409, `Revise todas as 80 questões. Ainda faltam ${faltantes.length}: ${faltantes.slice(0, 10).join(', ')}${faltantes.length > 10 ? '…' : ''}.`);
        }
        linha.omr.status = 'conferido_manual';
        linha.omr.revisaoObrigatoria = false;
        linha.omr.revisada = true;
        linha.omr.ambiguidades = 0;
        linha.omr.respostasReconhecidas = Object.values(respostasAtuais).filter((item) => item !== 'BRANCO').length;
        linha.omr.brancosReconhecidos = Object.values(respostasAtuais).filter((item) => item === 'BRANCO').length;
        (linha.omr.marcacoes || []).forEach((marcacao) => {
          if (!Object.prototype.hasOwnProperty.call(respostasAtuais, marcacao.codigoQuestao)) return;
          marcacao.status = 'conferida_manual';
          marcacao.resposta = respostasAtuais[marcacao.codigoQuestao];
          marcacao.confianca = 1;
        });
        if (!linha.avisos.includes('As respostas desta página foram conferidas manualmente.')) {
          linha.avisos.push('As respostas desta página foram conferidas manualmente.');
        }
      }
      req.importacaoSimulado.markModified('linhas');
    }

    const porAluno = new Map();
    req.importacaoSimulado.linhas.forEach((item) => {
      if (!item.aluno || situacaoAplicacaoLinha(item) === 'descartada') return;
      const chave = String(item.aluno);
      const grupo = porAluno.get(chave) || [];
      grupo.push(item);
      porAluno.set(chave, grupo);
    });
    porAluno.forEach((grupo) => {
      if (grupo.length > 1) grupo.forEach((item) => { item.vinculoStatus = 'duplicado'; });
      else if (grupo[0].vinculoStatus === 'duplicado') grupo[0].vinculoStatus = 'manual';
    });
    req.importacaoSimulado.totais = totaisDaImportacao(req.importacaoSimulado.linhas, req.simuladoDiagnostico);
    await req.importacaoSimulado.save();
    return res.json({
      ok: true,
      mensagem: 'Progresso salvo.',
      linha,
      totais: req.importacaoSimulado.totais,
      salvoEm: req.importacaoSimulado.updatedAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:simuladoId/importacoes/:importacaoId/confirmar', apenasGestaoPedagogica, carregarSimulado, carregarImportacao, async (req, res, next) => {
  const importacaoId = req.importacaoSimulado._id;
  try {
    if (req.importacaoSimulado.status !== 'analisada') {
      return erro(res, 409, 'Esta importação já foi confirmada ou está sendo processada.');
    }
    const linhasConfirmaveis = req.importacaoSimulado.linhas.filter((item) => situacaoAplicacaoLinha(item) !== 'descartada');
    const pendencias = linhasConfirmaveis.filter((item) => !['automatico', 'manual'].includes(item.vinculoStatus));
    if (pendencias.length) {
      return erro(res, 409, 'Resolva alunos não localizados, ambíguos ou duplicados antes de confirmar.', {
        pendencias: pendencias.map((item) => ({ numeroLinha: item.numeroLinha, status: item.vinculoStatus, nome: item.nomeInformado })),
      });
    }
    if (req.importacaoSimulado.arquivo?.formato === 'pdf') {
      const omrPendentes = linhasConfirmaveis.filter((item) => situacaoAplicacaoLinha(item) === 'presente' && item.omr?.revisaoObrigatoria);
      if (omrPendentes.length) {
        return erro(res, 409, 'Revise as marcações ambíguas antes de confirmar. O sistema não escolherá respostas sem evidência suficiente.', {
          pendencias: omrPendentes.map((item) => ({ numeroLinha: item.numeroLinha, pagina: item.pagina, ambiguidades: item.omr?.ambiguidades || 0 })),
        });
      }
    }
    const idiomasPendentes = linhasConfirmaveis
      .filter((item) => situacaoAplicacaoLinha(item) === 'presente' && linhaTemIdioma(req.simuladoDiagnostico, item) && item.idiomaEstrangeiro === 'NAO_INFORMADO');
    if (idiomasPendentes.length) {
      return erro(res, 409, 'Confirme Inglês, Espanhol ou “Não marcou nenhuma língua”. O sistema não escolherá uma opção aleatoriamente.', {
        pendencias: idiomasPendentes.map((item) => ({ numeroLinha: item.numeroLinha, pagina: item.pagina })),
      });
    }

    const anterior = await buscarImportacaoAnterior(req, req.importacaoSimulado);
    if (anterior && req.body?.substituirAnterior !== true) {
      return erro(res, 409, 'Este PDF já gerou um diagnóstico. Confirme a substituição para recalcular sem duplicar resultados.', {
        requerSubstituicao: true,
        substituicao: resumoSubstituicao(anterior),
      });
    }
    if (req.importacaoSimulado.substituiImportacao && !anterior) {
      return erro(res, 409, 'O diagnóstico anterior já foi substituído ou não está mais disponível. Atualize a página antes de continuar.');
    }

    const bloqueada = await SimuladoImportacao.findOneAndUpdate({
      _id: importacaoId,
      instituicao: req.instituicaoId,
      status: 'analisada',
    }, { $set: { status: 'processando' } }, { new: true });
    if (!bloqueada) return erro(res, 409, 'Esta importação já foi confirmada ou está sendo processada.');

    const linhasProcessaveis = bloqueada.linhas.filter((item) => situacaoAplicacaoLinha(item) !== 'descartada');
    const ids = linhasProcessaveis.map((item) => item.aluno).filter(Boolean);
    const alunos = await Aluno.find({ _id: { $in: ids }, instituicao: req.instituicaoId }).select('_id nome turma codigoAcesso').lean();
    const porId = new Map(alunos.map((item) => [String(item._id), item]));
    if (porId.size !== new Set(ids.map(String)).size) throw new Error('Um dos alunos vinculados não está mais disponível nesta instituição.');

    const idsAnteriores = anterior
      ? [...new Set((anterior.linhas || []).map((item) => texto(item?.aluno)).filter((id) => idValido(id)))]
      : [];
    const idsConsulta = [...new Set([...ids.map(String), ...idsAnteriores])];
    const existentes = await SimuladoResultado.find({
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
      aluno: { $in: idsConsulta },
    }).lean();
    const existentePorAluno = new Map(existentes.map((item) => [String(item.aluno), item]));
    const simuladoObjeto = req.simuladoDiagnostico.toObject();
    const diaProcessado = bloqueada.arquivo?.formato === 'pdf' ? Number(bloqueada.arquivo?.dia || 0) : 0;
    const questoesProcessadas = diaProcessado
      ? (simuladoObjeto.questoes || []).filter((item) => Number(item.dia || 1) === diaProcessado)
      : [];
    const codigosProcessados = new Set(questoesProcessadas.map((item) => texto(item.codigo).toUpperCase()));
    const diaProcessadoTemIdioma = questoesProcessadas.some((item) =>
      (item.variantes || []).some((variante) => ['INGLES', 'ESPANHOL'].includes(texto(variante.codigo).toUpperCase())));
    const idiomasConfirmados = ['INGLES', 'ESPANHOL', 'NAO_MARCADO'];
    const agora = new Date();

    const operacoes = linhasProcessaveis.map((linha) => {
      const aluno = porId.get(String(linha.aluno));
      const resultadoAnterior = existentePorAluno.get(String(linha.aluno));
      const ausente = situacaoAplicacaoLinha(linha) === 'ausente';
      const baseAnterior = respostasConfirmadas(resultadoAnterior, codigosProcessados);
      const respostasCombinadas = mesclarRespostas(baseAnterior, ausente ? {} : linha.respostas);
      const diasAusentes = new Set((resultadoAnterior?.diasAusentes || []).map(Number).filter(Boolean));
      if (diaProcessado) diasAusentes.delete(diaProcessado);
      if (ausente && diaProcessado) diasAusentes.add(diaProcessado);
      const idiomaLinha = texto(linha.idiomaEstrangeiro).toUpperCase();
      const idiomaAnterior = texto(resultadoAnterior?.idiomaEstrangeiro).toUpperCase();
      const idiomaDiagnostico = (!ausente && idiomasConfirmados.includes(idiomaLinha))
        ? idiomaLinha
        : (diaProcessadoTemIdioma
          ? 'NAO_INFORMADO'
          : (idiomasConfirmados.includes(idiomaAnterior) ? idiomaAnterior : 'NAO_INFORMADO'));
      const origemIdioma = (!ausente && idiomasConfirmados.includes(idiomaLinha))
        ? linha.idiomaOrigem
        : (diaProcessadoTemIdioma ? 'nao_informado' : (resultadoAnterior?.idiomaOrigem || 'nao_informado'));
      const diagnostico = avaliarResultado(simuladoObjeto, {
        respostas: respostasCombinadas,
        idiomaEstrangeiro: idiomaDiagnostico,
        diasAusentes: [...diasAusentes],
      });
      return {
        updateOne: {
          filter: { instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id, aluno: aluno._id },
          update: { $set: {
            tenantId: req.instituicaoId,
            alunoNomeSnapshot: aluno.nome,
            alunoTurmaSnapshot: aluno.turma,
            alunoCodigoSnapshot: aluno.codigoAcesso,
            idiomaEstrangeiro: diagnostico.idiomaEstrangeiro,
            idiomaOrigem: origemIdioma,
            idiomaConfirmado: diagnostico.idiomaEstrangeiro !== 'NAO_INFORMADO',
            diasAusentes: diagnostico.diasAusentes || [],
            respostas: diagnostico.respostas,
            resumoGeral: diagnostico.resumoGeral,
            porDia: diagnostico.porDia,
            porArea: diagnostico.porArea,
            porComponente: diagnostico.porComponente,
            porEixo: diagnostico.porEixo,
            porConteudo: diagnostico.porConteudo,
            porHabilidade: diagnostico.porHabilidade,
            porHabilidadeEnem: diagnostico.porHabilidadeEnem,
            porCompetenciaEnem: diagnostico.porCompetenciaEnem,
            porCompetencia: diagnostico.porCompetencia,
            porDescritor: diagnostico.porDescritor,
            porDificuldade: diagnostico.porDificuldade,
            avisos: diagnostico.avisos,
            versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
            versaoDiagnostico: 5,
            fonte: 'importacao',
            importacao: bloqueada._id,
            processadoPor: ator(req),
            processadoEm: agora,
          }, $setOnInsert: {
            instituicao: req.instituicaoId,
            simulado: req.simuladoDiagnostico._id,
            aluno: aluno._id,
          } },
          upsert: true,
        },
      };
    });

    const novosIds = new Set(ids.map(String));
    let resultadosRemovidos = 0;
    idsAnteriores.filter((id) => !novosIds.has(String(id))).forEach((alunoId) => {
      const resultadoAnterior = existentePorAluno.get(String(alunoId));
      if (!resultadoAnterior) return;
      const respostasRestantes = respostasConfirmadas(resultadoAnterior, codigosProcessados);
      if (!Object.keys(respostasRestantes).length) {
        operacoes.push({
          deleteOne: {
            filter: { _id: resultadoAnterior._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
          },
        });
        resultadosRemovidos += 1;
        return;
      }
      const idiomaRestante = diaProcessadoTemIdioma
        ? 'NAO_INFORMADO'
        : texto(resultadoAnterior.idiomaEstrangeiro).toUpperCase();
      const diasAusentesRestantes = (resultadoAnterior.diasAusentes || []).map(Number).filter((dia) => dia && dia !== diaProcessado);
      const diagnostico = avaliarResultado(simuladoObjeto, {
        respostas: respostasRestantes,
        idiomaEstrangeiro: idiomaRestante,
        diasAusentes: diasAusentesRestantes,
      });
      operacoes.push({
        updateOne: {
          filter: { _id: resultadoAnterior._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
          update: { $set: {
            ...camposDiagnostico(diagnostico),
            idiomaOrigem: diaProcessadoTemIdioma ? 'nao_informado' : resultadoAnterior.idiomaOrigem,
            processadoPor: ator(req),
            processadoEm: agora,
          } },
        },
      });
    });
    if (operacoes.length) await SimuladoResultado.bulkWrite(operacoes, { ordered: true });

    bloqueada.status = 'processada';
    bloqueada.totais = { ...bloqueada.totais.toObject(), processadas: linhasProcessaveis.length };
    bloqueada.processadoPor = ator(req);
    bloqueada.processadoEm = agora;
    bloqueada.erro = '';
    if (anterior) bloqueada.substituiImportacao = anterior._id;
    await bloqueada.save();
    if (anterior) {
      await SimuladoImportacao.updateOne({
        _id: anterior._id,
        instituicao: req.instituicaoId,
        simulado: req.simuladoDiagnostico._id,
        status: 'processada',
      }, { $set: {
        status: 'substituida',
        substituidaPorImportacao: bloqueada._id,
        substituidaPor: ator(req),
        substituidaEm: agora,
      } });
    }
    req.simuladoDiagnostico.status = 'com_resultados';
    req.simuladoDiagnostico.atualizadoPor = ator(req);
    await req.simuladoDiagnostico.save();
    await auditar(req, anterior ? 'SUBSTITUIR_DIAGNOSTICO_IMPORTACAO' : 'CONFIRMAR_IMPORTACAO', bloqueada._id, req.simuladoDiagnostico.titulo, {
      simulado: req.simuladoDiagnostico._id,
      resultados: linhasProcessaveis.length,
      ausentes: Number(bloqueada.totais?.ausentes || 0),
      descartadas: Number(bloqueada.totais?.descartadas || 0),
      idiomasPendentes: bloqueada.totais.idiomasPendentes,
      importacaoAnterior: anterior?._id || null,
      diaSubstituido: diaProcessado || null,
      resultadosRemovidos,
    });
    return res.json({
      ok: true,
      mensagem: anterior
        ? `${linhasProcessaveis.length} resultado(s) recalculado(s). O diagnóstico anterior foi substituído sem criar duplicidade.`
        : `${linhasProcessaveis.length} resultado(s) processado(s).`,
      resultados: linhasProcessaveis.length,
      ausentes: Number(bloqueada.totais?.ausentes || 0),
      descartadas: Number(bloqueada.totais?.descartadas || 0),
      substituiuAnterior: Boolean(anterior),
      resultadosRemovidos,
      idiomasPendentes: bloqueada.totais.idiomasPendentes,
    });
  } catch (error) {
    await SimuladoImportacao.updateOne({ _id: importacaoId, instituicao: req.instituicaoId, status: 'processando' }, {
      $set: { status: 'analisada', erro: texto(error.message).slice(0, 2000) },
    }).catch(() => null);
    return next(error);
  }
});

router.post('/:simuladoId/resultados/recalcular', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    const resultados = await SimuladoResultado.find({
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    }).lean();
    if (!resultados.length) return res.json({ ok: true, mensagem: 'Ainda não há resultados para recalcular.', resultados: 0 });
    const simuladoObjeto = req.simuladoDiagnostico.toObject();
    const agora = new Date();
    const operacoes = resultados.map((resultado) => {
      const diagnostico = avaliarResultado(simuladoObjeto, {
        respostas: respostasParaRecalculo(resultado),
        idiomaEstrangeiro: resultado.idiomaEstrangeiro,
        diasAusentes: resultado.diasAusentes || [],
      });
      return {
        updateOne: {
          filter: { _id: resultado._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
          update: { $set: {
            ...camposDiagnostico(diagnostico),
            versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
            processadoPor: ator(req),
            processadoEm: agora,
          } },
        },
      };
    });
    await SimuladoResultado.bulkWrite(operacoes, { ordered: true });
    await auditar(req, 'RECALCULAR_DIAGNOSTICO', req.simuladoDiagnostico._id, req.simuladoDiagnostico.titulo, {
      resultados: operacoes.length,
      versaoDiagnostico: 5,
    });
    return res.json({
      ok: true,
      mensagem: `${operacoes.length} resultado(s) recalculado(s) com a metodologia explicada.`,
      resultados: operacoes.length,
    });
  } catch (error) {
    return next(error);
  }
});


router.patch('/:simuladoId/resultados/participacao', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    const alteracoes = Array.isArray(req.body?.alteracoes) ? req.body.alteracoes.slice(0, 100) : [];
    if (!alteracoes.length) return erro(res, 400, 'Informe ao menos uma revisão de participação.');

    const diasValidos = diasAplicacaoSimulado(req.simuladoDiagnostico);
    const conjuntoDiasValidos = new Set(diasValidos);
    if (!diasValidos.length) return erro(res, 409, 'O simulado não possui dias de aplicação configurados.');

    const ids = [];
    const mapa = new Map();
    for (const item of alteracoes) {
      const resultadoId = texto(item?.resultadoId);
      if (!idValido(resultadoId)) return erro(res, 400, 'Há um resultado inválido na revisão de participação.');
      if (mapa.has(resultadoId)) return erro(res, 400, 'O mesmo aluno foi enviado mais de uma vez na revisão de participação.');

      const diasRecebidos = Array.isArray(item?.diasAusentes) ? item.diasAusentes.map(Number).filter(Number.isFinite) : [];
      if (diasRecebidos.some((dia) => !conjuntoDiasValidos.has(dia))) {
        return erro(res, 400, `Há dia de aplicação inválido. Dias permitidos: ${diasValidos.join(', ')}.`);
      }
      const diasAusentes = [...new Set(diasRecebidos)].sort((a, b) => a - b);
      ids.push(resultadoId);
      mapa.set(resultadoId, { diasAusentes });
    }

    const resultados = await SimuladoResultado.find({
      _id: { $in: ids },
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    });
    if (resultados.length !== ids.length) {
      return erro(res, 404, 'Um ou mais resultados não foram encontrados. Nenhuma alteração foi aplicada.');
    }

    const simuladoObjeto = req.simuladoDiagnostico.toObject();
    const diasIdioma = new Set((req.simuladoDiagnostico.questoes || [])
      .filter((questao) => questaoTemIdioma(questao))
      .map((questao) => Number(questao.dia || 1)));
    const agora = new Date();
    const operacoes = [];
    const auditoria = [];

    for (const resultado of resultados) {
      const chave = String(resultado._id);
      const nova = mapa.get(chave);
      const anteriores = [...new Set((resultado.diasAusentes || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
      const novos = nova.diasAusentes;
      if (anteriores.join(',') === novos.join(',')) continue;

      const respostas = respostasParaRecalculo(resultado);
      const preservadas = respostasPreservadasParaDias(resultado, novos);

      let idiomaParaRecalculo = resultado.idiomaEstrangeiro || 'NAO_INFORMADO';
      const restaurouDiaIdioma = anteriores.some((dia) => diasIdioma.has(dia) && !novos.includes(dia));
      if (restaurouDiaIdioma && idiomaParaRecalculo === 'NAO_APLICAVEL') {
        idiomaParaRecalculo = 'NAO_INFORMADO';
      }

      const diagnostico = avaliarResultado(simuladoObjeto, {
        respostas,
        idiomaEstrangeiro: idiomaParaRecalculo,
        diasAusentes: novos,
      });

      const todosDiasIdiomaAusentes = diasIdioma.size > 0 && [...diasIdioma].every((dia) => novos.includes(dia));
      const idiomaPersistido = todosDiasIdiomaAusentes && ['INGLES', 'ESPANHOL', 'NAO_MARCADO', 'NAO_INFORMADO'].includes(resultado.idiomaEstrangeiro)
        ? resultado.idiomaEstrangeiro
        : diagnostico.idiomaEstrangeiro;
      const idiomaConfirmadoPersistido = todosDiasIdiomaAusentes
        ? Boolean(resultado.idiomaConfirmado)
        : diagnostico.idiomaEstrangeiro !== 'NAO_INFORMADO';

      operacoes.push({
        updateOne: {
          filter: { _id: resultado._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
          update: { $set: {
            ...camposDiagnostico(diagnostico),
            idiomaEstrangeiro: idiomaPersistido,
            idiomaConfirmado: idiomaConfirmadoPersistido,
            respostasPreservadasAusencia: preservadas,
            versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
            processadoPor: ator(req),
            processadoEm: agora,
          } },
        },
      });

      auditoria.push({
        resultadoId: chave,
        aluno: resultado.alunoNomeSnapshot,
        turma: resultado.alunoTurmaSnapshot,
        diasAusentesAntes: anteriores,
        diasAusentesDepois: novos,
        respostasPreservadas: preservadas.length,
      });
    }

    if (!operacoes.length) {
      return res.json({ ok: true, mensagem: 'Nenhuma mudança de participação foi necessária.', atualizados: 0, alteracoes: [] });
    }

    await SimuladoResultado.bulkWrite(operacoes, { ordered: true });
    await auditar(req, 'CORRIGIR_PARTICIPACAO_LOTE', req.simuladoDiagnostico._id, req.simuladoDiagnostico.titulo, {
      total: operacoes.length,
      alteracoes: auditoria,
      preservouVinculos: true,
      preservouRespostas: true,
      restauracaoReversivel: true,
    });

    return res.json({
      ok: true,
      mensagem: `${operacoes.length} participação(ões) atualizada(s). Respostas, vínculos e a conferência original de língua foram preservados; quando o estudante esteve ausente em todo o dia de idioma, a língua passa a ser exibida como não aplicável e deixa de gerar pendência.`,
      atualizados: operacoes.length,
      alteracoes: auditoria,
    });
  } catch (error) {
    return next(error);
  }
});


router.patch('/:simuladoId/resultados/:resultadoId/idioma', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    if (!idValido(req.params.resultadoId)) return erro(res, 400, 'Resultado inválido.');
    if (!simuladoTemIdioma(req.simuladoDiagnostico)) return erro(res, 409, 'Este simulado não possui questões de língua estrangeira.');
    const resultado = await SimuladoResultado.findOne({
      _id: req.params.resultadoId,
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    });
    if (!resultado) return erro(res, 404, 'Resultado não encontrado.');
    const idioma = normalizarIdioma(req.body?.idiomaEstrangeiro, { aplicavel: true });
    if (!['INGLES', 'ESPANHOL', 'NAO_MARCADO'].includes(idioma)) {
      return erro(res, 400, 'Informe Inglês, Espanhol ou confirme que o aluno não marcou a língua.');
    }
    const diasIdioma = new Set((req.simuladoDiagnostico.questoes || [])
      .filter((questao) => questaoTemIdioma(questao))
      .map((questao) => Number(questao.dia || 1)));
    if ((resultado.diasAusentes || []).map(Number).some((dia) => diasIdioma.has(dia))) {
      return erro(res, 409, 'O estudante está registrado como ausente no dia que contém a língua estrangeira. Revise a participação antes de alterar o idioma.');
    }
    const diagnostico = avaliarResultado(req.simuladoDiagnostico.toObject(), {
      respostas: respostasParaRecalculo(resultado),
      idiomaEstrangeiro: idioma,
      diasAusentes: resultado.diasAusentes || [],
    });
    const origem = ['manual', 'lista', 'cartao', 'prova'].includes(req.body?.idiomaOrigem) ? req.body.idiomaOrigem : 'manual';
    Object.assign(resultado, {
      idiomaEstrangeiro: idioma,
      idiomaOrigem: origem,
      idiomaConfirmado: true,
      diasAusentes: diagnostico.diasAusentes || [],
      respostas: diagnostico.respostas,
      resumoGeral: diagnostico.resumoGeral,
      porDia: diagnostico.porDia,
      porArea: diagnostico.porArea,
      porComponente: diagnostico.porComponente,
      porEixo: diagnostico.porEixo,
      porConteudo: diagnostico.porConteudo,
      porHabilidade: diagnostico.porHabilidade,
      porHabilidadeEnem: diagnostico.porHabilidadeEnem,
      porCompetenciaEnem: diagnostico.porCompetenciaEnem,
      porCompetencia: diagnostico.porCompetencia,
      porDescritor: diagnostico.porDescritor,
      porDificuldade: diagnostico.porDificuldade,
      avisos: diagnostico.avisos,
      versaoDiagnostico: 5,
      processadoPor: ator(req),
      processadoEm: new Date(),
    });
    await resultado.save();
    await auditar(req, 'CORRIGIR_IDIOMA', resultado._id, resultado.alunoNomeSnapshot, { idioma, origem, simulado: req.simuladoDiagnostico._id });
    return res.json({ ok: true, mensagem: 'Língua confirmada e diagnóstico recalculado.', resultado });
  } catch (error) {
    return next(error);
  }
});


router.patch('/:simuladoId/resultados/idiomas', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    if (!simuladoTemIdioma(req.simuladoDiagnostico)) return erro(res, 409, 'Este simulado não possui questões de língua estrangeira.');
    const alteracoes = Array.isArray(req.body?.alteracoes) ? req.body.alteracoes.slice(0, 100) : [];
    if (!alteracoes.length) return erro(res, 400, 'Informe ao menos uma correção de língua.');

    const ids = [];
    const mapa = new Map();
    for (const item of alteracoes) {
      const resultadoId = texto(item?.resultadoId);
      if (!idValido(resultadoId)) return erro(res, 400, 'Há um resultado inválido na revisão de línguas.');
      if (mapa.has(resultadoId)) return erro(res, 400, 'O mesmo aluno foi enviado mais de uma vez na revisão de línguas.');
      const idioma = normalizarIdioma(item?.idiomaEstrangeiro, { aplicavel: true });
      if (!['INGLES', 'ESPANHOL', 'NAO_MARCADO'].includes(idioma)) {
        return erro(res, 400, 'Cada correção deve informar Inglês, Espanhol ou “Não marcou nenhuma língua”.');
      }
      const origem = ['manual', 'lista', 'cartao', 'prova'].includes(item?.idiomaOrigem) ? item.idiomaOrigem : 'prova';
      ids.push(resultadoId);
      mapa.set(resultadoId, { idioma, origem });
    }

    const resultados = await SimuladoResultado.find({
      _id: { $in: ids },
      instituicao: req.instituicaoId,
      simulado: req.simuladoDiagnostico._id,
    });
    if (resultados.length !== ids.length) return erro(res, 404, 'Um ou mais resultados não foram encontrados. Nenhuma correção foi aplicada.');

    const diasIdioma = new Set((req.simuladoDiagnostico.questoes || [])
      .filter((questao) => (questao.variantes || []).some((variante) => ['INGLES', 'ESPANHOL'].includes(texto(variante?.codigo).toUpperCase())))
      .map((questao) => Number(questao.dia || 1)));

    const simuladoObjeto = req.simuladoDiagnostico.toObject();
    const agora = new Date();
    const operacoes = [];
    const auditoria = [];

    for (const resultado of resultados) {
      const chave = String(resultado._id);
      const nova = mapa.get(chave);
      const ausenteIdioma = (resultado.diasAusentes || []).map(Number).some((dia) => diasIdioma.has(dia));
      if (ausenteIdioma) {
        return erro(res, 409, `${resultado.alunoNomeSnapshot} está registrado como ausente no dia que contém a língua estrangeira. Revise a ausência antes de alterar o idioma. Nenhuma correção foi aplicada.`);
      }
      const diagnostico = avaliarResultado(simuladoObjeto, {
        respostas: respostasParaRecalculo(resultado),
        idiomaEstrangeiro: nova.idioma,
        diasAusentes: resultado.diasAusentes || [],
      });
      operacoes.push({
        updateOne: {
          filter: { _id: resultado._id, instituicao: req.instituicaoId, simulado: req.simuladoDiagnostico._id },
          update: { $set: {
            ...camposDiagnostico(diagnostico),
            idiomaOrigem: nova.origem,
            versaoMatriz: req.simuladoDiagnostico.versaoMatriz,
            processadoPor: ator(req),
            processadoEm: agora,
          } },
        },
      });
      auditoria.push({
        resultadoId: chave,
        aluno: resultado.alunoNomeSnapshot,
        turma: resultado.alunoTurmaSnapshot,
        anterior: resultado.idiomaEstrangeiro,
        novo: nova.idioma,
        origem: nova.origem,
      });
    }

    await SimuladoResultado.bulkWrite(operacoes, { ordered: true });
    await auditar(req, 'CORRIGIR_IDIOMAS_LOTE', req.simuladoDiagnostico._id, req.simuladoDiagnostico.titulo, {
      total: operacoes.length,
      alteracoes: auditoria,
      preservouVinculos: true,
      preservouRespostasMarcadas: true,
    });
    return res.json({
      ok: true,
      mensagem: `${operacoes.length} língua(s) atualizada(s). Vínculos e respostas marcadas foram preservados; somente a variante de idioma e o diagnóstico foram recalculados.`,
      atualizados: operacoes.length,
      alteracoes: auditoria,
    });
  } catch (error) {
    return next(error);
  }
});

async function dadosDashboard(req) {
  const filtro = filtroResultados(req, req.simuladoDiagnostico._id, req.query.turma);
  const resultadosBrutos = await SimuladoResultado.find(filtro).select('-respostasPreservadasAusencia').lean();
  const resultados = resultadosBrutos.map((item) => resultadoComIdiomaEfetivo(req.simuladoDiagnostico, item));
  const dashboard = agregarDashboard(req.simuladoDiagnostico.toObject(), resultados);
  dashboard.recalculoNecessario = resultados.filter((item) => Number(item.versaoDiagnostico || 1) < 5).length;
  let comparacao = null;
  if (req.simuladoDiagnostico.simuladoReferencia && idValido(req.simuladoDiagnostico.simuladoReferencia)) {
    const idsAlunos = resultados.map((item) => item.aluno);
    const filtroAnterior = filtroResultados(req, req.simuladoDiagnostico.simuladoReferencia, req.query.turma);
    filtroAnterior.aluno = { $in: idsAlunos };
    const anteriores = await SimuladoResultado.find(filtroAnterior).lean();
    comparacao = compararResultados(resultados, anteriores, dashboard.configuracao || {});
  }
  return { resultados, dashboard, comparacao };
}

router.get('/:simuladoId/dashboard', carregarSimulado, async (req, res, next) => {
  try {
    const { dashboard, comparacao } = await dadosDashboard(req);
    return res.json({ ok: true, simulado: resumoSimulado(req.simuladoDiagnostico), dashboard, comparacao });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/exportar.xlsx', carregarSimulado, async (req, res, next) => {
  try {
    const { resultados, dashboard, comparacao } = await dadosDashboard(req);
    const buffer = await gerarRelatorioDiagnostico({ simulado: req.simuladoDiagnostico.toObject(), dashboard, resultados, comparacao });
    res.setHeader('Content-Type', MIME_XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="diagnostico-${nomeSeguro(req.simuladoDiagnostico.codigo)}.xlsx"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/exportar.pdf', carregarSimulado, async (req, res, next) => {
  try {
    const { resultados, dashboard, comparacao } = await dadosDashboard(req);
    const turma = texto(req.query.turma);
    const buffer = await gerarRelatorioDiagnosticoPdf({
      simulado: req.simuladoDiagnostico.toObject(),
      dashboard,
      resultados,
      comparacao,
      turma,
    });
    const sufixoTurma = turma ? `-${nomeSeguro(turma)}` : '';
    res.setHeader('Content-Type', MIME_PDF);
    res.setHeader('Content-Disposition', `attachment; filename="diagnostico-${nomeSeguro(req.simuladoDiagnostico.codigo)}${sufixoTurma}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/exportar-visual.pdf', carregarSimulado, async (req, res, next) => {
  try {
    const { resultados, dashboard, comparacao } = await dadosDashboard(req);
    const turma = texto(req.query.turma);
    const buffer = await gerarRelatorioVisualPdf({
      simulado: req.simuladoDiagnostico.toObject(),
      dashboard,
      resultados,
      comparacao,
      turma,
    });
    const sufixoTurma = turma ? `-${nomeSeguro(turma)}` : '';
    res.setHeader('Content-Type', MIME_PDF);
    res.setHeader('Content-Disposition', `attachment; filename="painel-visual-${nomeSeguro(req.simuladoDiagnostico.codigo)}${sufixoTurma}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/exportar-habilidades-enem.pdf', carregarSimulado, async (req, res, next) => {
  try {
    if (texto(req.simuladoDiagnostico.tipo).toLowerCase() !== 'enem') {
      return erro(res, 409, 'O relatório específico de habilidades está disponível somente para simulados ENEM.');
    }
    const { resultados, dashboard, comparacao } = await dadosDashboard(req);
    const turma = texto(req.query.turma);
    const buffer = await gerarRelatorioHabilidadesEnemPdf({
      simulado: req.simuladoDiagnostico.toObject(),
      dashboard,
      resultados,
      comparacao,
      turma,
    });
    const sufixoTurma = turma ? `-${nomeSeguro(turma)}` : '';
    res.setHeader('Content-Type', MIME_PDF);
    res.setHeader('Content-Disposition', `attachment; filename="habilidades-enem-${nomeSeguro(req.simuladoDiagnostico.codigo)}${sufixoTurma}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/resultados', carregarSimulado, async (req, res, next) => {
  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const limite = Math.min(100, Math.max(10, Number(req.query.limite) || 50));
    const filtro = filtroResultados(req, req.simuladoDiagnostico._id, req.query.turma);
    const busca = texto(req.query.busca).slice(0, 120);
    if (busca) filtro.alunoNomeSnapshot = { $regex: busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [itens, total] = await Promise.all([
      SimuladoResultado.find(filtro)
        .select('-respostas -respostasPreservadasAusencia -porComponente -porConteudo -porHabilidade -porCompetencia -porDescritor -porDificuldade')
        .sort({ alunoTurmaSnapshot: 1, alunoNomeSnapshot: 1 })
        .allowDiskUse(true)
        .skip((pagina - 1) * limite).limit(limite).lean(),
      SimuladoResultado.countDocuments(filtro),
    ]);
    const resultados = itens.map((item) => resultadoComIdiomaEfetivo(req.simuladoDiagnostico, item));
    return res.json({ ok: true, resultados, paginacao: { pagina, limite, total, paginas: Math.ceil(total / limite) } });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId/resultados/:resultadoId', carregarSimulado, async (req, res, next) => {
  try {
    if (!idValido(req.params.resultadoId)) return erro(res, 400, 'Resultado inválido.');
    const filtro = filtroResultados(req, req.simuladoDiagnostico._id, '');
    filtro._id = req.params.resultadoId;
    const resultado = await SimuladoResultado.findOne(filtro).select('-respostasPreservadasAusencia').lean();
    if (!resultado) return erro(res, 404, 'Resultado não encontrado ou indisponível para o seu perfil.');
    return res.json({ ok: true, resultado: resultadoComIdiomaEfetivo(req.simuladoDiagnostico, resultado) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:simuladoId', apenasGestaoPedagogica, carregarSimulado, async (req, res, next) => {
  try {
    const item = req.simuladoDiagnostico;
    if (req.body?.configuracaoAnalise) {
      const resultadosExistentes = await SimuladoResultado.countDocuments({ instituicao: req.instituicaoId, simulado: item._id });
      if (resultadosExistentes) {
        return erro(res, 409, 'Os critérios de classificação não podem ser alterados após o processamento de resultados, pois isso mudaria o diagnóstico histórico.');
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titulo')) {
      const titulo = texto(req.body.titulo).slice(0, 240);
      if (!titulo) return erro(res, 400, 'O título não pode ficar vazio.');
      item.titulo = titulo;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'descricao')) item.descricao = texto(req.body.descricao).slice(0, 4000);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tipo')) {
      const novoTipo = texto(req.body.tipo).toLowerCase();
      if (!['enem', 'saeb', 'interno', 'olimpiada', 'outro'].includes(novoTipo)) return erro(res, 400, 'Tipo de simulado inválido.');
      item.tipo = novoTipo;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'turmas')) item.turmas = listaTexto(req.body.turmas, 500, 100);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'series')) item.series = listaTexto(req.body.series, 100, 100);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'simuladoReferencia')) {
      const referencia = texto(req.body.simuladoReferencia);
      if (!referencia) item.simuladoReferencia = null;
      else {
        if (!idValido(referencia) || referencia === String(item._id)) return erro(res, 400, 'Simulado de referência inválido.');
        const existe = await Simulado.exists({ _id: referencia, instituicao: req.instituicaoId });
        if (!existe) return erro(res, 400, 'O simulado de referência não pertence a esta instituição.');
        item.simuladoReferencia = referencia;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      const status = texto(req.body.status);
      if (!['rascunho', 'matriz_pronta', 'com_resultados', 'finalizado', 'arquivado'].includes(status)) return erro(res, 400, 'Status inválido.');
      item.status = status;
    }
    if (req.body?.configuracaoAnalise) {
      const cfg = req.body.configuracaoAnalise;
      ['percentualConsolidado', 'percentualAtencao', 'minimoQuestoesIndicador', 'minimoRespondentesQuestao', 'minimoAlunosGrupo', 'minimoCoberturaIndividual']
        .forEach((campo) => {
          if (Number.isFinite(Number(cfg[campo]))) item.configuracaoAnalise[campo] = Number(cfg[campo]);
        });
    }
    item.atualizadoPor = ator(req);
    await item.save();
    await auditar(req, 'ATUALIZAR', item._id, item.titulo, { status: item.status, tipo: item.tipo, turmas: item.turmas });
    return res.json({ ok: true, mensagem: 'Simulado atualizado.', simulado: resumoSimulado(item) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:simuladoId', carregarSimulado, async (req, res) => {
  const totalResultados = await SimuladoResultado.countDocuments(filtroResultados(req, req.simuladoDiagnostico._id));
  return res.json({ ok: true, simulado: req.simuladoDiagnostico, totalResultados });
});

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const limite = error.field === 'cartoes' ? '120 MB' : '10 MB';
    return erro(res, 400, error.code === 'LIMIT_FILE_SIZE' ? `O arquivo ultrapassa ${limite}.` : error.message);
  }
  if (error?.name === 'ValidationError') return erro(res, 422, error.message);
  console.error('[simulados] erro não tratado:', error);
  return erro(res, 500, error.message || 'Erro interno no módulo de simulados.');
});

module.exports = router;
