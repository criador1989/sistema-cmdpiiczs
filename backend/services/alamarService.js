'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const Aluno = require('../models/Aluno');
const Notificacao = require('../models/Notificacao');
const ConfiguracaoDisciplinar = require('../models/ConfiguracaoDisciplinar');
const AlamarProcesso = require('../models/AlamarProcesso');
const AlamarResultado = require('../models/AlamarResultado');
const AlamarVinculoSimaed = require('../models/AlamarVinculoSimaed');
const calcularNotaTSMD = require('../utils/calculoNota');
const { normalizarValorPorNatureza } = require('../utils/recalculoComportamento');
const { normalizarNome, normalizarTurma, normalizarTexto } = require('../utils/alamarImport');
const { avaliarAlunoAlamar, normalizarRegras, normalizarChaveComponente, arredondar } = require('../utils/alamarRules');

function fimDoDia(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function objectId(value) {
  return mongoose.isValidObjectId(String(value || '')) ? new mongoose.Types.ObjectId(String(value)) : null;
}

function hashArquivo(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashArquivos(arquivos = []) {
  const hash = crypto.createHash('sha256');
  arquivos.forEach(arquivo => {
    hash.update(String(arquivo?.originalname || ''));
    hash.update('\0');
    hash.update(arquivo?.buffer || Buffer.alloc(0));
    hash.update('\0');
  });
  return hash.digest('hex');
}

function possiveisIdentificadoresAluno(aluno) {
  const values = [
    aluno?.matricula,
    aluno?.numeroMatricula,
    aluno?.ra,
    aluno?.codigoSimaed,
    aluno?.integracoes?.simaed?.id,
    aluno?.integracoes?.simaed?.matricula,
  ];
  return [...new Set(values.map(value => normalizarTexto(value)).filter(Boolean))];
}

async function carregarBaseVinculos(instituicaoId) {
  const [alunos, vinculos] = await Promise.all([
    Aluno.find({ instituicao: instituicaoId })
      .select('_id nome turma dataEntrada comportamento matricula numeroMatricula ra codigoSimaed integracoes')
      .lean(),
    AlamarVinculoSimaed.find({ instituicao: instituicaoId, ativo: true }).lean(),
  ]);

  const byIdExterno = new Map();
  const byNomeTurma = new Map();
  const byNome = new Map();
  const alunosById = new Map();

  for (const aluno of alunos) {
    alunosById.set(String(aluno._id), aluno);
    possiveisIdentificadoresAluno(aluno).forEach(id => byIdExterno.set(id, aluno));
    const nome = normalizarNome(aluno.nome);
    const turma = normalizarTurma(aluno.turma);
    if (nome && turma) {
      const key = `${nome}|${turma}`;
      const list = byNomeTurma.get(key) || [];
      list.push(aluno);
      byNomeTurma.set(key, list);
    }
    if (nome) {
      const list = byNome.get(nome) || [];
      list.push(aluno);
      byNome.set(nome, list);
    }
  }

  for (const vinculo of vinculos) {
    const aluno = alunosById.get(String(vinculo.aluno));
    if (!aluno) continue;
    if (vinculo.matricula) byIdExterno.set(normalizarTexto(vinculo.matricula), aluno);
    if (vinculo.simaedId) byIdExterno.set(normalizarTexto(vinculo.simaedId), aluno);
    if (vinculo.nomeNormalizado && vinculo.turmaNormalizada) {
      byNomeTurma.set(`${vinculo.nomeNormalizado}|${vinculo.turmaNormalizada}`, [aluno]);
    }
  }

  return { alunos, alunosById, byIdExterno, byNomeTurma, byNome };
}

function vincularAlunoImportado(importado, base) {
  const ids = [importado.matricula, importado.simaedId].map(normalizarTexto).filter(Boolean);
  for (const id of ids) {
    const aluno = base.byIdExterno.get(id);
    if (aluno) return { aluno, status: 'automatico', criterio: 'identificador_simaed', confianca: 1 };
  }

  const nome = normalizarNome(importado.nome);
  const turma = normalizarTurma(importado.turma);
  const exact = base.byNomeTurma.get(`${nome}|${turma}`) || [];
  if (exact.length === 1) return { aluno: exact[0], status: 'automatico', criterio: 'nome_e_turma', confianca: 0.98 };

  const sameName = base.byNome.get(nome) || [];
  if (!turma && sameName.length === 1) return { aluno: sameName[0], status: 'automatico', criterio: 'nome_unico', confianca: 0.9 };

  return { aluno: null, status: 'pendente', criterio: 'nao_localizado', confianca: 0 };
}

async function calcularNotasDisciplinaresEmLote({ instituicaoId, alunos, dataReferencia }) {
  const ids = alunos.map(aluno => objectId(aluno?._id)).filter(Boolean);
  const resultado = new Map();
  if (!ids.length) return resultado;

  const limite = fimDoDia(dataReferencia);
  const [config, notificacoes] = await Promise.all([
    ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean(),
    Notificacao.find({
      instituicao: instituicaoId,
      aluno: { $in: ids },
      ativo: { $ne: false },
      arquivada: { $ne: true },
      $or: [
        { data: { $lte: limite } },
        { data: { $exists: false }, createdAt: { $lte: limite } },
        { data: null, createdAt: { $lte: limite } },
      ],
    }).sort({ data: 1, createdAt: 1 }).lean(),
  ]);

  const porAluno = new Map();
  notificacoes.forEach(notificacao => {
    const key = String(notificacao.aluno);
    const list = porAluno.get(key) || [];
    list.push({ ...notificacao, valorNumerico: normalizarValorPorNatureza(notificacao) });
    porAluno.set(key, list);
  });

  for (const aluno of alunos) {
    const key = String(aluno._id);
    try {
      const nota = calcularNotaTSMD(
        aluno.dataEntrada || aluno.dataMatricula || aluno.createdAt || new Date(2000, 0, 1),
        limite,
        porAluno.get(key) || [],
        config
      );
      resultado.set(key, {
        nota: arredondar(nota),
        data: limite,
        origem: 'recalculo_historico_ate_data_referencia',
      });
    } catch (error) {
      const fallback = Number(aluno.comportamento);
      resultado.set(key, {
        nota: Number.isFinite(fallback) ? arredondar(fallback) : null,
        data: limite,
        origem: Number.isFinite(fallback) ? 'comportamento_atual_fallback' : 'indisponivel',
        aviso: `Falha ao recalcular a nota disciplinar histórica: ${error.message}`,
      });
    }
  }

  return resultado;
}

function montarDocumentoResultado({ instituicaoId, processoId, importado, vinculo, notaDisc, regras, componentesExcluidos = [] }) {
  const avaliacao = avaliarAlunoAlamar({
    disciplinas: importado.disciplinas,
    alunoVinculado: Boolean(vinculo.aluno),
    notaDisciplinar: notaDisc?.nota ?? null,
    regras,
    componentesExcluidos,
  });

  return {
    instituicao: instituicaoId,
    tenantId: instituicaoId,
    processo: processoId,
    aluno: vinculo.aluno?._id || null,
    nomeImportado: importado.nome,
    nomeNormalizado: normalizarNome(importado.nome),
    turmaImportada: importado.turma || '',
    turmaNormalizada: normalizarTurma(importado.turma),
    matriculaImportada: importado.matricula || '',
    simaedIdImportado: importado.simaedId || '',
    vinculo: {
      status: vinculo.status,
      criterio: vinculo.criterio,
      confianca: vinculo.confianca,
    },
    disciplinas: avaliacao.disciplinas,
    mediaGlobal: avaliacao.mediaGlobal,
    menorMediaSemestral: avaliacao.menorMediaSemestral,
    disciplinaMenorMedia: avaliacao.disciplinaMenorMedia,
    teveRecuperacao: avaliacao.teveRecuperacao,
    notasAbaixoCorte: avaliacao.notasAbaixoCorte,
    notaDisciplinar: avaliacao.notaDisciplinar,
    dataNotaDisciplinar: notaDisc?.data || null,
    origemNotaDisciplinar: notaDisc?.origem || '',
    pontuacaoClassificacao: avaliacao.pontuacaoClassificacao,
    elegibilidadeAcademica: avaliacao.elegibilidadeAcademica,
    status: avaliacao.status,
    criterios: avaliacao.criterios,
    motivos: avaliacao.motivos,
    avisos: [...new Set([...(importado.avisos || []), ...(avaliacao.avisos || []), notaDisc?.aviso].filter(Boolean))],
    linhasOrigem: importado.linhasOrigem || [],
  };
}

async function atualizarPosicoesEProcesso(processoId) {
  const resultados = await AlamarResultado.find({ processo: processoId })
    .select('_id status turmaNormalizada pontuacaoClassificacao mediaGlobal nomeImportado vinculo.status')
    .lean();

  // A nota disciplinar apenas habilita (mínimo 7,0). A classificação é
  // exclusivamente acadêmica e usa a média global das disciplinas.
  const aptos = resultados.filter(item => item.status === 'APTO').sort((a, b) => {
    return Number(b.mediaGlobal ?? -Infinity) - Number(a.mediaGlobal ?? -Infinity)
      || String(a.nomeImportado).localeCompare(String(b.nomeImportado), 'pt-BR');
  });

  const turmaCounters = new Map();
  const ops = [];
  aptos.forEach((item, index) => {
    const turma = item.turmaNormalizada || 'sem-turma';
    const posTurma = (turmaCounters.get(turma) || 0) + 1;
    turmaCounters.set(turma, posTurma);
    ops.push({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { posicaoGeral: index + 1, posicaoTurma: posTurma } },
      },
    });
  });

  const nonAptos = resultados.filter(item => item.status !== 'APTO');
  nonAptos.forEach(item => {
    ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: { posicaoGeral: null, posicaoTurma: null } } } });
  });
  if (ops.length) await AlamarResultado.bulkWrite(ops, { ordered: false });

  const totais = {
    importados: resultados.length,
    aptos: resultados.filter(item => item.status === 'APTO').length,
    naoAptos: resultados.filter(item => item.status === 'NAO_APTO').length,
    pendentes: resultados.filter(item => item.status === 'PENDENTE').length,
    vinculadosAutomaticamente: resultados.filter(item => item.vinculo?.status === 'automatico').length,
    vinculadosManualmente: resultados.filter(item => item.vinculo?.status === 'manual').length,
    naoLocalizados: resultados.filter(item => item.vinculo?.status === 'pendente').length,
  };

  await AlamarProcesso.updateOne({ _id: processoId }, { $set: { totais } });
  return totais;
}

async function criarProcessoImportacao({ instituicaoId, usuarioId, arquivo, arquivos, importacao, anoLetivo, semestre, dataReferencia, regras }) {
  const cfg = normalizarRegras(regras);
  const listaArquivos = (Array.isArray(arquivos) && arquivos.length ? arquivos : [arquivo]).filter(Boolean);
  if (!listaArquivos.length) throw new Error('Nenhum arquivo foi recebido para registrar a apuração.');

  const nomesOriginais = listaArquivos.map(item => item.originalname).filter(Boolean);
  const mimeTypes = [...new Set(listaArquivos.map(item => item.mimetype).filter(Boolean))];
  const processo = await AlamarProcesso.create({
    instituicao: instituicaoId,
    tenantId: instituicaoId,
    anoLetivo,
    semestre,
    dataReferencia,
    regras: cfg,
    arquivo: {
      nomeOriginal: nomesOriginais.join(' + '),
      nomesOriginais,
      quantidadeArquivos: listaArquivos.length,
      mimeType: mimeTypes.length === 1 ? mimeTypes[0] : 'multipart/mixed',
      tamanhoBytes: listaArquivos.reduce((total, item) => total + Number(item.size || item.buffer?.length || 0), 0),
      sha256: hashArquivos(listaArquivos),
      formatoDetectado: importacao.formato,
      planilha: importacao.planilha,
      linhaCabecalho: importacao.linhaCabecalho,
      cabecalhos: importacao.cabecalhos,
      bimestresDetectados: importacao.bimestresDetectados || [],
    },
    avisosImportacao: importacao.avisos || [],
    componentesExcluidos: [],
    criadoPor: usuarioId,
    atualizadoPor: usuarioId,
  });

  const base = await carregarBaseVinculos(instituicaoId);
  const vinculos = importacao.alunos.map(importado => ({ importado, vinculo: vincularAlunoImportado(importado, base) }));
  const matched = [...new Map(vinculos.filter(item => item.vinculo.aluno).map(item => [String(item.vinculo.aluno._id), item.vinculo.aluno])).values()];
  const notasDisciplinares = await calcularNotasDisciplinaresEmLote({ instituicaoId, alunos: matched, dataReferencia });

  const documentos = vinculos.map(({ importado, vinculo }) => montarDocumentoResultado({
    instituicaoId,
    processoId: processo._id,
    importado,
    vinculo,
    notaDisc: vinculo.aluno ? notasDisciplinares.get(String(vinculo.aluno._id)) : null,
    regras: cfg,
    componentesExcluidos: processo.componentesExcluidos || [],
  }));

  if (documentos.length) await AlamarResultado.insertMany(documentos, { ordered: false });
  const totais = await atualizarPosicoesEProcesso(processo._id);
  processo.totais = totais;
  return processo;
}

async function reprocessarProcesso({ processo, usuarioId }) {
  const resultados = await AlamarResultado.find({ processo: processo._id }).lean();
  const alunoIds = [...new Set(resultados.map(item => String(item.aluno || '')).filter(Boolean))];
  const alunos = await Aluno.find({ instituicao: processo.instituicao, _id: { $in: alunoIds } })
    .select('_id nome turma dataEntrada comportamento')
    .lean();
  const alunoMap = new Map(alunos.map(aluno => [String(aluno._id), aluno]));
  const notas = await calcularNotasDisciplinaresEmLote({
    instituicaoId: processo.instituicao,
    alunos,
    dataReferencia: processo.dataReferencia,
  });

  const ops = resultados.map(item => {
    const aluno = alunoMap.get(String(item.aluno || '')) || null;
    const notaDisc = aluno ? notas.get(String(aluno._id)) : null;
    const avaliacao = avaliarAlunoAlamar({
      disciplinas: item.disciplinas,
      alunoVinculado: Boolean(aluno),
      notaDisciplinar: notaDisc?.nota ?? null,
      regras: processo.regras,
      componentesExcluidos: processo.componentesExcluidos || [],
    });
    return {
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            disciplinas: avaliacao.disciplinas,
            mediaGlobal: avaliacao.mediaGlobal,
            menorMediaSemestral: avaliacao.menorMediaSemestral,
            disciplinaMenorMedia: avaliacao.disciplinaMenorMedia,
            teveRecuperacao: avaliacao.teveRecuperacao,
            notasAbaixoCorte: avaliacao.notasAbaixoCorte,
            notaDisciplinar: avaliacao.notaDisciplinar,
            dataNotaDisciplinar: notaDisc?.data || null,
            origemNotaDisciplinar: notaDisc?.origem || '',
            pontuacaoClassificacao: avaliacao.pontuacaoClassificacao,
            elegibilidadeAcademica: avaliacao.elegibilidadeAcademica,
            status: avaliacao.status,
            criterios: avaliacao.criterios,
            motivos: avaliacao.motivos,
            avisos: [...new Set([...(item.avisos || []), ...(avaliacao.avisos || []), notaDisc?.aviso].filter(Boolean))],
          },
        },
      },
    };
  });

  if (ops.length) await AlamarResultado.bulkWrite(ops, { ordered: false });
  const totais = await atualizarPosicoesEProcesso(processo._id);
  await AlamarProcesso.updateOne({ _id: processo._id }, { $set: { atualizadoPor: usuarioId, totais } });
  return totais;
}

async function vincularResultado({ resultado, aluno, usuarioId, processo }) {
  const notaMap = await calcularNotasDisciplinaresEmLote({
    instituicaoId: resultado.instituicao,
    alunos: [aluno],
    dataReferencia: processo.dataReferencia,
  });
  const notaDisc = notaMap.get(String(aluno._id));
  const avaliacao = avaliarAlunoAlamar({
    disciplinas: resultado.disciplinas,
    alunoVinculado: true,
    notaDisciplinar: notaDisc?.nota ?? null,
    regras: processo.regras,
    componentesExcluidos: processo.componentesExcluidos || [],
  });

  await AlamarResultado.updateOne({ _id: resultado._id }, {
    $set: {
      aluno: aluno._id,
      vinculo: {
        status: 'manual',
        criterio: 'vinculo_manual',
        confianca: 1,
        vinculadoPor: usuarioId,
        vinculadoEm: new Date(),
      },
      disciplinas: avaliacao.disciplinas,
      mediaGlobal: avaliacao.mediaGlobal,
      menorMediaSemestral: avaliacao.menorMediaSemestral,
      disciplinaMenorMedia: avaliacao.disciplinaMenorMedia,
      teveRecuperacao: avaliacao.teveRecuperacao,
      notasAbaixoCorte: avaliacao.notasAbaixoCorte,
      notaDisciplinar: avaliacao.notaDisciplinar,
      dataNotaDisciplinar: notaDisc?.data || null,
      origemNotaDisciplinar: notaDisc?.origem || '',
      pontuacaoClassificacao: avaliacao.pontuacaoClassificacao,
      elegibilidadeAcademica: avaliacao.elegibilidadeAcademica,
      status: avaliacao.status,
      criterios: avaliacao.criterios,
      motivos: avaliacao.motivos,
      avisos: [...new Set([...(resultado.avisos || []), ...(avaliacao.avisos || []), notaDisc?.aviso].filter(Boolean))],
    },
  });

  const mapping = {
    instituicao: resultado.instituicao,
    tenantId: resultado.instituicao,
    aluno: aluno._id,
    matricula: resultado.matriculaImportada || '',
    simaedId: resultado.simaedIdImportado || '',
    nomeNormalizado: resultado.nomeNormalizado,
    turmaNormalizada: resultado.turmaNormalizada,
    ativo: true,
    criadoPor: usuarioId,
    atualizadoPor: usuarioId,
  };

  const filter = mapping.matricula
    ? { instituicao: resultado.instituicao, matricula: mapping.matricula }
    : (mapping.simaedId
      ? { instituicao: resultado.instituicao, simaedId: mapping.simaedId }
      : { instituicao: resultado.instituicao, nomeNormalizado: mapping.nomeNormalizado, turmaNormalizada: mapping.turmaNormalizada });

  await AlamarVinculoSimaed.findOneAndUpdate(filter, { $set: mapping }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await atualizarPosicoesEProcesso(processo._id);
}


async function configurarComponentesProcesso({ processo, componentesExcluidos = [], usuarioId }) {
  const unicos = [...new Set((componentesExcluidos || [])
    .map(normalizarChaveComponente)
    .filter(Boolean))]
    .slice(0, 100);

  processo.componentesExcluidos = unicos;
  processo.atualizadoPor = usuarioId;
  await processo.save();

  const totais = await reprocessarProcesso({ processo, usuarioId });
  return { processo, totais };
}

module.exports = {
  hashArquivo,
  hashArquivos,
  carregarBaseVinculos,
  vincularAlunoImportado,
  calcularNotasDisciplinaresEmLote,
  criarProcessoImportacao,
  atualizarPosicoesEProcesso,
  reprocessarProcesso,
  vincularResultado,
  configurarComponentesProcesso,
};
