'use strict';

const mongoose = require('mongoose');
const RedacaoEnem = require('../../models/RedacaoEnem');
const EnemConteudo = require('../../models/EnemConteudo');
const AlunoEnemPerfil = require('../../models/AlunoEnemPerfil');
const AlunoEnemProgresso = require('../../models/AlunoEnemProgresso');

function texto(v) { return String(v || '').trim(); }
function valor(v) { return v && typeof v === 'object' ? (v._id || v.id || v.slug || v) : v; }

function candidatos(v) {
  const bruto = valor(v);
  if (bruto === null || bruto === undefined || texto(bruto) === '') return [];
  const t = texto(bruto);
  const out = [t];
  if (mongoose.Types.ObjectId.isValid(t)) out.push(new mongoose.Types.ObjectId(t));
  return out;
}

function filtroInstituicao(v) {
  const c = candidatos(v);
  return c.length ? { instituicao: { $in: c } } : null;
}

function filtroAluno(v) {
  const c = candidatos(v);
  return c.length ? { aluno: { $in: c } } : null;
}

function correcaoEfetiva(redacao) {
  const prof = redacao?.correcaoProfessor;
  if (prof && ['validada', 'ajustada'].includes(prof.status)) {
    return {
      origem: 'professor',
      notaTotal: Number(prof.notaTotal) || 0,
      competencias: prof.competencias || {},
      validadaPorProfessor: true
    };
  }
  const ia = redacao?.correcaoIA || {};
  return {
    origem: 'ia',
    notaTotal: Number(ia.notaTotal) || 0,
    competencias: ia.competencias || {},
    validadaPorProfessor: false
  };
}

function competenciaExtrema(comps = {}, modo = 'min') {
  const pares = ['c1','c2','c3','c4','c5'].map((k) => [k.toUpperCase(), Number(comps[k]) || 0]);
  const validos = pares.filter(([, v]) => Number.isFinite(v));
  if (!validos.length) return 'GERAL';
  validos.sort((a, b) => modo === 'max' ? b[1] - a[1] : a[1] - b[1]);
  return validos[0][0];
}

function fragilidadesDaRedacao(redacao, competenciaPrioritaria) {
  const ia = redacao?.correcaoIA || {};
  const estruturada = ia.recomendacaoEstruturada || {};
  const lista = [];
  if (estruturada.codigoFragilidade) lista.push(texto(estruturada.codigoFragilidade));
  const chave = texto(competenciaPrioritaria).toLowerCase();
  const feedback = ia.feedbackCompetencias?.[chave];
  if (feedback?.codigoFragilidade) lista.push(texto(feedback.codigoFragilidade));
  return [...new Set(lista.filter(Boolean))].slice(0, 5);
}

function metaPorCompetencia(c) {
  const mapa = {
    C1: 'Fortalecer estrutura sintática e reduzir desvios formais em uma atividade curta.',
    C2: 'Treinar recorte temático e uso produtivo de repertório antes da próxima redação.',
    C3: 'Aprofundar tese, projeto de texto e desenvolvimento dos argumentos.',
    C4: 'Melhorar a articulação entre períodos e parágrafos, com menos repetições.',
    C5: 'Construir uma intervenção completa com agente, ação, meio, finalidade e detalhamento.',
    GERAL: 'Concluir a próxima atividade da trilha ENEM.'
  };
  return mapa[c] || mapa.GERAL;
}

async function conteudosDisponiveis(instituicao) {
  const inst = candidatos(instituicao);
  const filtros = [{ instituicao: 'global' }];
  if (inst.length) filtros.push({ instituicao: { $in: inst } });
  const itens = await EnemConteudo.find({
    status: 'ativo',
    $or: filtros
  }).sort({ ordemUnidade: 1, ordem: 1, createdAt: 1 }).lean();

  // Um conteúdo institucional com o mesmo código substitui a versão global.
  const porCodigo = new Map();
  for (const item of itens) {
    const codigo = texto(item.codigo).toUpperCase();
    const atual = porCodigo.get(codigo);
    const especifico = texto(item.instituicao).toLowerCase() !== 'global';
    const atualEspecifico = atual && texto(atual.instituicao).toLowerCase() !== 'global';
    if (!atual || (especifico && !atualEspecifico)) porCodigo.set(codigo, item);
  }
  return [...porCodigo.values()].sort((a, b) =>
    (Number(a.ordemUnidade) || 0) - (Number(b.ordemUnidade) || 0) ||
    (Number(a.ordem) || 0) - (Number(b.ordem) || 0) ||
    texto(a.titulo).localeCompare(texto(b.titulo), 'pt-BR')
  );
}

async function proximoConteudo({ instituicao, aluno, competencia, fragilidades = [] }) {
  const conteudos = await conteudosDisponiveis(instituicao);
  if (!conteudos.length) return null;
  const progresso = await AlunoEnemProgresso.find({
    ...(filtroInstituicao(instituicao) || {}),
    ...(filtroAluno(aluno) || {}),
    status: 'concluido'
  }).select('conteudoId codigoConteudo').lean();
  const concluidos = new Set(progresso.flatMap((p) => [String(p.conteudoId || ''), texto(p.codigoConteudo)]));
  const candidatosConteudo = conteudos.filter((c) => !concluidos.has(String(c._id)) && !concluidos.has(texto(c.codigo)));
  if (!candidatosConteudo.length) return null;

  const fragSet = new Set(fragilidades);
  const pontuar = (c) => {
    let score = 0;
    if (c.competencia === competencia) score += 10;
    if (c.competencia === 'GERAL') score += 2;
    if ((c.fragilidades || []).some((f) => fragSet.has(f))) score += 12;
    if (c.tipo === 'diagnostico' && competencia === 'GERAL') score += 6;
    return score - (Number(c.ordemUnidade) || 0) * 0.001 - (Number(c.ordem) || 0) * 0.0001;
  };

  return candidatosConteudo.sort((a, b) => pontuar(b) - pontuar(a))[0] || candidatosConteudo[0];
}


async function concluirDiagnosticoAutomaticamente({ instituicao, aluno, redacao }) {
  if (!redacao || redacao.naturezaCiclo !== 'diagnostico') return null;

  const conteudos = await conteudosDisponiveis(instituicao);
  const item = conteudos.find((c) => texto(c.codigo).toUpperCase() === 'ENEM-DIAG-01' || c.tipo === 'diagnostico');
  if (!item) return null;

  const filtro = {
    ...(filtroInstituicao(instituicao) || {}),
    ...(filtroAluno(aluno) || {}),
    conteudoId: item._id
  };

  const existente = await AlunoEnemProgresso.findOne(filtro).select('_id iniciadoEm').lean();
  const agora = new Date();
  const update = {
    instituicao: valor(instituicao),
    aluno: valor(aluno),
    conteudoId: item._id,
    codigoConteudo: item.codigo,
    status: 'concluido',
    percentual: 100,
    iniciadoEm: existente?.iniciadoEm || redacao.createdAt || agora,
    concluidoEm: redacao.updatedAt || agora,
    resultado: {
      redacaoId: redacao._id,
      notaTotal: correcaoEfetiva(redacao).notaTotal,
      natureza: 'diagnostico'
    },
    origem: 'redacao'
  };

  if (existente?._id) {
    return AlunoEnemProgresso.findByIdAndUpdate(existente._id, { $set: update }, { new: true, runValidators: true }).lean();
  }

  try {
    const criado = await AlunoEnemProgresso.create(update);
    return criado.toObject();
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const concorrente = await AlunoEnemProgresso.findOne(filtro).select('_id').lean();
    if (!concorrente?._id) throw e;
    return AlunoEnemProgresso.findByIdAndUpdate(concorrente._id, { $set: update }, { new: true, runValidators: true }).lean();
  }
}


async function corrigirConclusaoDiagnosticoSemRedacao({ instituicao, aluno }) {
  const conteudos = await conteudosDisponiveis(instituicao);
  const item = conteudos.find((c) => texto(c.codigo).toUpperCase() === 'ENEM-DIAG-01' || c.tipo === 'diagnostico');
  if (!item) return null;

  const filtro = {
    ...(filtroInstituicao(instituicao) || {}),
    ...(filtroAluno(aluno) || {}),
    conteudoId: item._id
  };

  const progresso = await AlunoEnemProgresso.findOne(filtro).lean();
  if (!progresso || progresso.status !== 'concluido' || progresso.origem === 'redacao') return progresso;

  return AlunoEnemProgresso.findByIdAndUpdate(
    progresso._id,
    {
      $set: {
        status: progresso.iniciadoEm ? 'em_andamento' : 'nao_iniciado',
        percentual: progresso.iniciadoEm ? 10 : 0,
        concluidoEm: null,
        resultado: null,
        origem: 'trilha'
      }
    },
    { new: true, runValidators: true }
  ).lean();
}

async function calcularProgresso({ instituicao, aluno }) {
  const [conteudos, progressos] = await Promise.all([
    conteudosDisponiveis(instituicao),
    AlunoEnemProgresso.find({
      ...(filtroInstituicao(instituicao) || {}),
      ...(filtroAluno(aluno) || {}),
      status: 'concluido'
    }).select('conteudoId codigoConteudo').lean()
  ]);
  const obrigatorios = conteudos.filter((c) => c.obrigatorio !== false);
  if (!obrigatorios.length) return 0;
  const concluidos = new Set(progressos.flatMap((p) => [String(p.conteudoId || ''), texto(p.codigoConteudo).toUpperCase()]));
  const qtd = obrigatorios.filter((c) => concluidos.has(String(c._id)) || concluidos.has(texto(c.codigo).toUpperCase())).length;
  return Math.max(0, Math.min(100, Math.round((qtd / obrigatorios.length) * 100)));
}

async function sincronizarPerfilAluno({ instituicao, aluno, turma = null, fonte = 'redacao' }) {
  const fInst = filtroInstituicao(instituicao);
  const fAluno = filtroAluno(aluno);
  if (!fInst || !fAluno) return null;

  const redacoes = await RedacaoEnem.find({
    ...fInst,
    ...fAluno,
    $or: [
      { status: { $in: ['corrigida', 'apoio_professor_solicitado', 'apoio_professor_respondido'] } },
      { 'correcaoProfessor.status': { $in: ['validada', 'ajustada'] } }
    ]
  }).sort({ createdAt: 1 }).limit(100).lean();

  const diagnostica = redacoes.find((r) => r.naturezaCiclo === 'diagnostico') || null;
  const ultima = redacoes[redacoes.length - 1] || null;
  const diagnosticoRealizado = Boolean(diagnostica);

  if (diagnostica) {
    await concluirDiagnosticoAutomaticamente({ instituicao, aluno, redacao: diagnostica });
  } else {
    // Corrige eventual conclusão manual feita na v4.0 antes do hotfix.
    await corrigirConclusaoDiagnosticoSemRedacao({ instituicao, aluno });
  }

  const corrDiag = correcaoEfetiva(diagnostica);
  const corrAtual = correcaoEfetiva(ultima);
  const competenciaPrioritaria = diagnosticoRealizado && ultima ? competenciaExtrema(corrAtual.competencias, 'min') : 'GERAL';
  const competenciaMaisForte = diagnosticoRealizado && ultima ? competenciaExtrema(corrAtual.competencias, 'max') : 'GERAL';
  const fragilidades = diagnosticoRealizado && ultima ? fragilidadesDaRedacao(ultima, competenciaPrioritaria) : [];
  const progressoPercentual = await calcularProgresso({ instituicao, aluno });
  const proximo = await proximoConteudo({ instituicao, aluno, competencia: competenciaPrioritaria, fragilidades });

  const doc = {
    instituicao: valor(instituicao),
    aluno: valor(aluno),
    turma: valor(turma || ultima?.turma || null),
    diagnosticoRealizado,
    diagnostico: corrDiag.competencias || {},
    atual: corrAtual.competencias || {},
    notaDiagnostico: Number(corrDiag.notaTotal) || 0,
    notaAtual: Number(corrAtual.notaTotal) || 0,
    evolucaoTotal: diagnosticoRealizado ? (Number(corrAtual.notaTotal) || 0) - (Number(corrDiag.notaTotal) || 0) : 0,
    competenciaPrioritaria,
    competenciaMaisForte,
    fragilidades,
    metaSemanal: diagnosticoRealizado ? metaPorCompetencia(competenciaPrioritaria) : 'Realize a redação diagnóstica para definir seu ponto de partida nas cinco competências.',
    proximoConteudoId: proximo?._id || null,
    proximoConteudoCodigo: proximo?.codigo || '',
    progressoPercentual,
    ultimaRedacaoId: ultima?._id || null,
    ultimaAtualizacaoFonte: fonte,
    recalculadoEm: new Date()
  };

  const existente = await AlunoEnemPerfil.findOne({ ...fInst, ...fAluno }).select('_id').lean();
  if (existente?._id) {
    return AlunoEnemPerfil.findByIdAndUpdate(existente._id, { $set: doc }, { new: true, runValidators: true }).lean();
  }

  try {
    const criado = await AlunoEnemPerfil.create(doc);
    return criado.toObject();
  } catch (e) {
    // Protege contra corrida de duas requisições recalculando o mesmo perfil.
    if (e?.code === 11000) {
      const concorrente = await AlunoEnemPerfil.findOne({ ...fInst, ...fAluno }).select('_id').lean();
      if (concorrente?._id) {
        return AlunoEnemPerfil.findByIdAndUpdate(concorrente._id, { $set: doc }, { new: true, runValidators: true }).lean();
      }
    }
    throw e;
  }
}

async function carregarPainelAluno({ instituicao, aluno, turma = null }) {
  const perfil = await sincronizarPerfilAluno({ instituicao, aluno, turma, fonte: 'manual' });
  const conteudos = await conteudosDisponiveis(instituicao);
  const progressos = await AlunoEnemProgresso.find({
    ...(filtroInstituicao(instituicao) || {}),
    ...(filtroAluno(aluno) || {})
  }).lean();
  const mapa = new Map(progressos.map((p) => [String(p.conteudoId), p]));
  const trilha = conteudos.map((c) => ({
    _id: c._id,
    codigo: c.codigo,
    unidade: c.unidade,
    ordemUnidade: c.ordemUnidade,
    ordem: c.ordem,
    tipo: c.tipo,
    titulo: c.titulo,
    resumo: c.resumo,
    competencia: c.competencia,
    duracaoMinutos: c.duracaoMinutos,
    rotaAcao: c.rotaAcao,
    rotuloAcao: c.rotuloAcao,
    obrigatorio: c.obrigatorio,
    progresso: mapa.get(String(c._id)) || null
  }));

  const proximo = perfil?.proximoConteudoId
    ? trilha.find((c) => String(c._id) === String(perfil.proximoConteudoId)) || null
    : trilha.find((c) => c.progresso?.status !== 'concluido') || null;

  return { perfil, proximo, trilha };
}

module.exports = {
  correcaoEfetiva,
  sincronizarPerfilAluno,
  carregarPainelAluno,
  conteudosDisponiveis,
  filtroInstituicao,
  filtroAluno,
  valor
};
