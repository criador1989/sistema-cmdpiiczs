'use strict';

const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');

const AlamarProcesso = require('../../models/AlamarProcesso');
const AlamarResultado = require('../../models/AlamarResultado');
const Aluno = require('../../models/Aluno');
const { requireTenant } = require('../../middleware/tenantScope');
const { lerArquivosNotas, normalizarNome, normalizarTurma } = require('../../utils/alamarImport');
const { REGRAS_PADRAO, normalizarChaveComponente } = require('../../utils/alamarRules');
const {
  criarProcessoImportacao,
  reprocessarProcesso,
  vincularResultado,
  configurarComponentesProcesso,
} = require('../../services/alamarService');
const { registrarAuditoriaAlamar } = require('../../services/alamarAudit');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const nome = String(file.originalname || '').toLowerCase();
    const aceito = nome.endsWith('.csv') || nome.endsWith('.xlsx') || nome.endsWith('.txt') || nome.endsWith('.pdf');
    cb(aceito ? null : new Error('Envie CSV, XLSX ou PDF do SIMAED.'), aceito);
  },
});

function permitirModuloAlamar(req, res, next) {
  const tipo = String(req.usuario?.tipo || '').toLowerCase();
  const permitidos = ['admin', 'monitor', 'professor', 'secretaria', 'master', 'superadmin'];
  if (permitidos.includes(tipo)) return next();
  return res.status(403).json({ mensagem: 'Este perfil não possui acesso ao módulo Alamar.' });
}

router.use(permitirModuloAlamar, requireTenant);

function idValido(value) {
  return mongoose.isValidObjectId(String(value || ''));
}

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dataReferenciaPadrao(anoLetivo, semestre) {
  return semestre === 2
    ? new Date(Number(anoLetivo), 11, 31, 23, 59, 59, 999)
    : new Date(Number(anoLetivo), 5, 30, 23, 59, 59, 999);
}

function escapeCsv(value) {
  const texto = String(value ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

function nomeMotivo(codigo) {
  const labels = {
    MEDIA_GLOBAL_INFERIOR_A_8_5: 'Média global inferior a 8,5',
    DISCIPLINA_COM_MEDIA_SEMESTRAL_INFERIOR_A_8: 'Disciplina com média semestral inferior a 8,0',
    RECUPERACAO_NO_SEMESTRE: 'Recuperação identificada durante o semestre',
    DADOS_ACADEMICOS_INCOMPLETOS: 'Dados acadêmicos incompletos',
    ALUNO_NAO_LOCALIZADO_NO_AXORIIN: 'Aluno não localizado no Axoriin',
    NOTA_DISCIPLINAR_INDISPONIVEL: 'Nota disciplinar indisponível',
    NOTA_DISCIPLINAR_INFERIOR_A_7: 'Nota disciplinar inferior a 7,0',
    NENHUM_COMPONENTE_SELECIONADO: 'Nenhum componente foi selecionado para o cálculo',
  };
  return labels[codigo] || codigo;
}

async function carregarProcessoTenant(req, res, next) {
  try {
    if (!idValido(req.params.processoId)) return res.status(400).json({ mensagem: 'Processo inválido.' });
    const processo = await AlamarProcesso.findOne({ _id: req.params.processoId, instituicao: req.instituicaoId });
    if (!processo) return res.status(404).json({ mensagem: 'Processo do Alamar não encontrado.' });
    req.processoAlamar = processo;
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/regras', (_req, res) => {
  res.json({
    regras: REGRAS_PADRAO,
    explicacao: {
      elegibilidade: 'Média global mínima de 8,5; média semestral mínima de 8,0 em todos os componentes selecionados; nenhuma recuperação nos componentes selecionados; nota disciplinar igual ou superior a 7,0.',
      notaDisciplinar: 'A nota disciplinar é somente requisito de habilitação e não entra no cálculo ou na classificação.',
      classificacao: 'A classificação dos alunos aptos usa exclusivamente a média global dos componentes selecionados.',
    },
  });
});

router.get('/modelo.xlsx', async (req, res, next) => {
  try {
    const semestre = Number(req.query.semestre) === 2 ? 2 : 1;
    const bimestres = semestre === 2 ? [3, 4] : [1, 2];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Axoriin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Notas');
    sheet.columns = [
      { header: 'MATRICULA', key: 'matricula', width: 16 },
      { header: 'ALUNO', key: 'aluno', width: 34 },
      { header: 'TURMA', key: 'turma', width: 14 },
      { header: 'DISCIPLINA', key: 'disciplina', width: 28 },
      { header: `${bimestres[0]}º BIMESTRE`, key: 'nota1', width: 16 },
      { header: `${bimestres[1]}º BIMESTRE`, key: 'nota2', width: 16 },
      { header: 'RECUPERACAO', key: 'recuperacao', width: 18 },
    ];
    sheet.addRows([
      { matricula: '20260001', aluno: 'ALUNO EXEMPLO', turma: '7º A', disciplina: 'Língua Portuguesa', nota1: 8.7, nota2: 9.0, recuperacao: 'NÃO' },
      { matricula: '20260001', aluno: 'ALUNO EXEMPLO', turma: '7º A', disciplina: 'Matemática', nota1: 8.2, nota2: 8.8, recuperacao: 'NÃO' },
    ]);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19324D' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'G1' };

    const info = workbook.addWorksheet('Orientações');
    info.getColumn(1).width = 110;
    [
      'MODELO DE IMPORTAÇÃO DO ALAMAR',
      'Use uma linha por aluno e por disciplina.',
      `Este modelo corresponde ao ${semestre}º semestre e utiliza o ${bimestres[0]}º e o ${bimestres[1]}º bimestres.`,
      'RECUPERACAO deve ser preenchida com SIM ou NÃO.',
      'A coluna MATRÍCULA é recomendada, mas o sistema também tenta localizar o aluno por nome e turma.',
      'Não substitua as notas originais por notas obtidas após recuperação.',
    ].forEach((texto, index) => { info.getCell(index + 1, 1).value = texto; });
    info.getCell(1, 1).font = { bold: true, size: 14 };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="modelo-alamar-${semestre}-semestre.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
});

router.post('/importar', upload.fields([
  { name: 'arquivos', maxCount: 20 },
  { name: 'arquivo', maxCount: 1 },
]), async (req, res) => {
  try {
    const arquivos = [
      ...(req.files?.arquivos || []),
      ...(req.files?.arquivo || []),
    ];
    if (!arquivos.length) return res.status(400).json({ mensagem: 'Selecione o arquivo de notas.' });

    const anoLetivo = Number(req.body.anoLetivo);
    const semestre = Number(req.body.semestre);
    if (!Number.isInteger(anoLetivo) || anoLetivo < 2020 || anoLetivo > 2100) {
      return res.status(400).json({ mensagem: 'Ano letivo inválido.' });
    }
    if (![1, 2].includes(semestre)) return res.status(400).json({ mensagem: 'Semestre inválido.' });

    const dataReferencia = parseDate(req.body.dataReferencia) || dataReferenciaPadrao(anoLetivo, semestre);
    const importacao = await lerArquivosNotas({ arquivos, semestre });

    const processo = await criarProcessoImportacao({
      instituicaoId: req.instituicaoId,
      usuarioId: req.usuario.id || req.usuario._id,
      arquivos,
      importacao,
      anoLetivo,
      semestre,
      dataReferencia,
      regras: REGRAS_PADRAO,
    });

    await registrarAuditoriaAlamar(req, {
      acao: 'IMPORTAR_NOTAS',
      entidadeId: processo._id,
      entidadeNome: `${anoLetivo}/${semestre}º semestre`,
      detalhes: {
        arquivos: arquivos.map(item => item.originalname),
        formato: importacao.formato,
        bimestresDetectados: importacao.bimestresDetectados || [],
        totalAlunos: importacao.alunos.length,
        totais: processo.totais,
      },
    });

    return res.status(201).json({
      mensagem: 'Notas importadas e apuração concluída.',
      processo,
      diagnostico: {
        formato: importacao.formato,
        planilha: importacao.planilha,
        linhaCabecalho: importacao.linhaCabecalho,
        cabecalhos: importacao.cabecalhos,
        bimestresDetectados: importacao.bimestresDetectados || [],
        avisos: importacao.avisos,
      },
    });
  } catch (error) {
    console.error('[alamar/importar] erro:', error);
    return res.status(400).json({ mensagem: error.message || 'Falha ao importar as notas.' });
  }
});

router.get('/processos', async (req, res, next) => {
  try {
    const filtro = { instituicao: req.instituicaoId };
    if (req.query.anoLetivo) filtro.anoLetivo = Number(req.query.anoLetivo);
    if ([1, 2].includes(Number(req.query.semestre))) filtro.semestre = Number(req.query.semestre);
    const processos = await AlamarProcesso.find(filtro)
      .sort({ anoLetivo: -1, semestre: -1, createdAt: -1 })
      .limit(50)
      .populate('criadoPor', 'nome tipo')
      .populate('homologadoPor', 'nome tipo')
      .lean();
    return res.json({ processos });
  } catch (error) {
    return next(error);
  }
});

router.get('/processos/:processoId', carregarProcessoTenant, async (req, res) => {
  return res.json({ processo: req.processoAlamar });
});

router.get('/processos/:processoId/resultados', carregarProcessoTenant, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    const filtro = { processo: req.processoAlamar._id };
    if (['APTO', 'NAO_APTO', 'PENDENTE'].includes(req.query.status)) filtro.status = req.query.status;
    if (req.query.turma) filtro.turmaNormalizada = normalizarTurma(req.query.turma);
    if (req.query.q) {
      const q = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro.$or = [
        { nomeImportado: new RegExp(q, 'i') },
        { matriculaImportada: new RegExp(q, 'i') },
      ];
    }

    const [total, resultados, turmas] = await Promise.all([
      AlamarResultado.countDocuments(filtro),
      AlamarResultado.find(filtro)
        .sort({ status: 1, posicaoGeral: 1, mediaGlobal: -1, nomeImportado: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('aluno', 'nome turma comportamento')
        .lean(),
      AlamarResultado.distinct('turmaImportada', { processo: req.processoAlamar._id }),
    ]);

    return res.json({ total, page, limit, resultados, turmas: turmas.filter(Boolean).sort() });
  } catch (error) {
    return next(error);
  }
});

router.get('/processos/:processoId/resultados/:resultadoId', carregarProcessoTenant, async (req, res, next) => {
  try {
    if (!idValido(req.params.resultadoId)) return res.status(400).json({ mensagem: 'Resultado inválido.' });
    const resultado = await AlamarResultado.findOne({
      _id: req.params.resultadoId,
      processo: req.processoAlamar._id,
      instituicao: req.instituicaoId,
    }).populate('aluno', 'nome turma comportamento').lean();
    if (!resultado) return res.status(404).json({ mensagem: 'Resultado não encontrado.' });
    return res.json({ resultado });
  } catch (error) {
    return next(error);
  }
});

router.get('/alunos/buscar', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const turma = String(req.query.turma || '').trim();
    const filtro = { instituicao: req.instituicaoId };
    if (q) filtro.nome = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (turma) filtro.turma = new RegExp(`^${turma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const alunos = await Aluno.find(filtro).select('_id nome turma comportamento').sort({ turma: 1, nome: 1 }).limit(40).lean();
    return res.json({ alunos });
  } catch (error) {
    return next(error);
  }
});

router.patch('/processos/:processoId/resultados/:resultadoId/vincular', carregarProcessoTenant, async (req, res, next) => {
  try {
    if (!idValido(req.params.resultadoId) || !idValido(req.body.alunoId)) {
      return res.status(400).json({ mensagem: 'Resultado ou aluno inválido.' });
    }
    if (req.processoAlamar.status === 'homologado') {
      return res.status(409).json({ mensagem: 'O processo homologado não pode ser alterado. Reabra uma nova apuração.' });
    }

    const [resultado, aluno] = await Promise.all([
      AlamarResultado.findOne({ _id: req.params.resultadoId, processo: req.processoAlamar._id, instituicao: req.instituicaoId }),
      Aluno.findOne({ _id: req.body.alunoId, instituicao: req.instituicaoId }).lean(),
    ]);
    if (!resultado) return res.status(404).json({ mensagem: 'Resultado não encontrado.' });
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });

    const antes = { aluno: resultado.aluno, vinculo: resultado.vinculo, status: resultado.status };
    await vincularResultado({
      resultado: resultado.toObject(),
      aluno,
      usuarioId: req.usuario.id || req.usuario._id,
      processo: req.processoAlamar,
    });

    await registrarAuditoriaAlamar(req, {
      acao: 'VINCULAR_ALUNO',
      entidade: 'AlamarResultado',
      entidadeId: resultado._id,
      entidadeNome: resultado.nomeImportado,
      antes,
      depois: { aluno: aluno._id, nome: aluno.nome, turma: aluno.turma },
    });

    return res.json({ mensagem: 'Aluno vinculado e resultado recalculado.' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/processos/:processoId/componentes', carregarProcessoTenant, async (req, res, next) => {
  try {
    if (req.processoAlamar.status === 'homologado') {
      return res.status(409).json({ mensagem: 'O processo homologado não pode ter os componentes alterados.' });
    }

    const solicitados = Array.isArray(req.body?.componentesExcluidos) ? req.body.componentesExcluidos : [];
    const resultados = await AlamarResultado.find({ processo: req.processoAlamar._id })
      .select('disciplinas.nome')
      .lean();

    const detectados = new Map();
    resultados.forEach(resultado => {
      (resultado.disciplinas || []).forEach(disciplina => {
        const nome = String(disciplina?.nome || '').trim();
        const chave = normalizarChaveComponente(nome);
        if (chave && !detectados.has(chave)) detectados.set(chave, nome);
      });
    });

    if (!detectados.size) {
      return res.status(409).json({ mensagem: 'Nenhum componente acadêmico foi encontrado nesta apuração.' });
    }

    const excluidos = [...new Set(solicitados.map(normalizarChaveComponente).filter(chave => detectados.has(chave)))];
    const considerados = [...detectados.keys()].filter(chave => !excluidos.includes(chave));
    if (!considerados.length) {
      return res.status(400).json({ mensagem: 'Selecione pelo menos um componente para o cálculo do Alamar.' });
    }

    const antes = { componentesExcluidos: req.processoAlamar.componentesExcluidos || [] };
    const { totais } = await configurarComponentesProcesso({
      processo: req.processoAlamar,
      componentesExcluidos: excluidos,
      usuarioId: req.usuario.id || req.usuario._id,
    });

    await registrarAuditoriaAlamar(req, {
      acao: 'CONFIGURAR_COMPONENTES',
      entidadeId: req.processoAlamar._id,
      entidadeNome: `${req.processoAlamar.anoLetivo}/${req.processoAlamar.semestre}º semestre`,
      antes,
      depois: {
        componentesExcluidos: excluidos,
        componentesConsiderados: considerados,
      },
      detalhes: { totais },
    });

    return res.json({
      mensagem: 'Componentes atualizados e apuração recalculada.',
      componentesExcluidos: excluidos,
      componentesConsiderados: considerados,
      totais,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/processos/:processoId/reprocessar', carregarProcessoTenant, async (req, res, next) => {
  try {
    if (req.processoAlamar.status === 'homologado') {
      return res.status(409).json({ mensagem: 'O processo homologado não pode ser reprocessado.' });
    }
    const totais = await reprocessarProcesso({
      processo: req.processoAlamar,
      usuarioId: req.usuario.id || req.usuario._id,
    });
    await registrarAuditoriaAlamar(req, {
      acao: 'REPROCESSAR',
      entidadeId: req.processoAlamar._id,
      entidadeNome: `${req.processoAlamar.anoLetivo}/${req.processoAlamar.semestre}º semestre`,
      detalhes: { totais },
    });
    return res.json({ mensagem: 'Apuração reprocessada.', totais });
  } catch (error) {
    return next(error);
  }
});

router.post('/processos/:processoId/homologar', carregarProcessoTenant, async (req, res, next) => {
  try {
    if (req.processoAlamar.totais?.pendentes > 0) {
      return res.status(409).json({ mensagem: 'Existem pendências. Resolva os vínculos e dados incompletos antes de homologar.' });
    }
    const antes = { status: req.processoAlamar.status };
    req.processoAlamar.status = 'homologado';
    req.processoAlamar.homologadoPor = req.usuario.id || req.usuario._id;
    req.processoAlamar.homologadoEm = new Date();
    req.processoAlamar.atualizadoPor = req.usuario.id || req.usuario._id;
    await req.processoAlamar.save();

    await registrarAuditoriaAlamar(req, {
      acao: 'HOMOLOGAR',
      entidadeId: req.processoAlamar._id,
      entidadeNome: `${req.processoAlamar.anoLetivo}/${req.processoAlamar.semestre}º semestre`,
      antes,
      depois: { status: 'homologado', homologadoEm: req.processoAlamar.homologadoEm },
      severidade: 'aviso',
    });
    return res.json({ mensagem: 'Resultado homologado com sucesso.', processo: req.processoAlamar });
  } catch (error) {
    return next(error);
  }
});

async function obterResultadosExportacao(processo) {
  return AlamarResultado.find({ processo: processo._id })
    .sort({ status: 1, posicaoGeral: 1, mediaGlobal: -1, nomeImportado: 1 })
    .lean();
}

router.get('/processos/:processoId/exportar.csv', carregarProcessoTenant, async (req, res, next) => {
  try {
    const resultados = await obterResultadosExportacao(req.processoAlamar);
    const headers = ['POSICAO_GERAL', 'POSICAO_TURMA', 'ALUNO', 'TURMA', 'MATRICULA', 'MEDIA_GLOBAL', 'MENOR_MEDIA', 'DISCIPLINA_MENOR_MEDIA', 'RECUPERACAO', 'NOTA_DISCIPLINAR', 'HABILITADO_DISCIPLINAR', 'STATUS', 'MOTIVOS'];
    const rows = resultados.map(item => [
      item.posicaoGeral || '', item.posicaoTurma || '', item.nomeImportado, item.turmaImportada, item.matriculaImportada,
      item.mediaGlobal ?? '', item.menorMediaSemestral ?? '', item.disciplinaMenorMedia || '', item.teveRecuperacao ? 'SIM' : 'NÃO',
      item.notaDisciplinar ?? '', !item.criterios?.notaDisciplinarDisponivel ? 'PENDENTE' : (item.criterios?.notaDisciplinarMinima ? 'SIM' : 'NÃO'), item.status,
      (item.motivos || []).map(nomeMotivo).join(' | '),
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsv).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="alamar-${req.processoAlamar.anoLetivo}-${req.processoAlamar.semestre}-semestre.csv"`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

router.get('/processos/:processoId/exportar.xlsx', carregarProcessoTenant, async (req, res, next) => {
  try {
    const resultados = await obterResultadosExportacao(req.processoAlamar);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Axoriin';
    const sheet = workbook.addWorksheet('Resultado Alamar');
    sheet.columns = [
      { header: 'POSIÇÃO GERAL', key: 'posicaoGeral', width: 15 },
      { header: 'POSIÇÃO TURMA', key: 'posicaoTurma', width: 15 },
      { header: 'ALUNO', key: 'aluno', width: 34 },
      { header: 'TURMA', key: 'turma', width: 13 },
      { header: 'MATRÍCULA', key: 'matricula', width: 16 },
      { header: 'MÉDIA GLOBAL', key: 'mediaGlobal', width: 15 },
      { header: 'MENOR MÉDIA', key: 'menorMedia', width: 15 },
      { header: 'DISCIPLINA DA MENOR MÉDIA', key: 'disciplinaMenor', width: 30 },
      { header: 'RECUPERAÇÃO', key: 'recuperacao', width: 15 },
      { header: 'NOTA DISCIPLINAR', key: 'notaDisciplinar', width: 18 },
      { header: 'HABILITADO DISCIPLINAR', key: 'habilitadoDisciplinar', width: 22 },
      { header: 'STATUS', key: 'status', width: 15 },
      { header: 'MOTIVOS', key: 'motivos', width: 55 },
    ];
    resultados.forEach(item => sheet.addRow({
      posicaoGeral: item.posicaoGeral || '',
      posicaoTurma: item.posicaoTurma || '',
      aluno: item.nomeImportado,
      turma: item.turmaImportada,
      matricula: item.matriculaImportada,
      mediaGlobal: item.mediaGlobal,
      menorMedia: item.menorMediaSemestral,
      disciplinaMenor: item.disciplinaMenorMedia,
      recuperacao: item.teveRecuperacao ? 'SIM' : 'NÃO',
      notaDisciplinar: item.notaDisciplinar,
      habilitadoDisciplinar: !item.criterios?.notaDisciplinarDisponivel ? 'PENDENTE' : (item.criterios?.notaDisciplinarMinima ? 'SIM' : 'NÃO'),
      status: item.status,
      motivos: (item.motivos || []).map(nomeMotivo).join(' | '),
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF19324D' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'M1' };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="alamar-${req.processoAlamar.anoLetivo}-${req.processoAlamar.semestre}-semestre.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
});

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: 'Um dos arquivos ultrapassa 15 MB.',
      LIMIT_FILE_COUNT: 'Foram enviados arquivos demais. O limite é 20 por importação.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado ou limite de arquivos excedido.',
    };
    return res.status(400).json({ mensagem: mensagens[error.code] || error.message });
  }
  console.error('[alamar] erro não tratado:', error);
  return res.status(500).json({ mensagem: error.message || 'Erro interno no módulo Alamar.' });
});

module.exports = router;
