'use strict';

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const { autenticar } = require('../../middleware/autenticacao');
const Instituicao = require('../../models/Instituicao');
const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
let Usuario = null;
try { Usuario = require('../../models/Usuario'); } catch { Usuario = null; }

const { buildPeriodoFromQuery, timezonePorUF } = require('../../utils/dateOnly');

/* =========================================================
   OBSERVATÓRIO EDUCACIONAL AXORIIN
   VERSÃO CORRIGIDA - CLASSIFICAÇÃO ESTRATÉGICA SEGURA

   PRINCÍPIO CENTRAL:
   - O painel da Secretaria NÃO deve interpretar regras regimentais
     internas como violência, bullying ou crime.
   - Não há mais classificação por palavras-chave amplas.
   - Uma ocorrência só entra como estratégica quando:
     1) possui flag explícita no registro; OU
     2) possui mapeamento local exato e seguro do regulamento.

   LGPD:
   - Não retorna nomes de estudantes.
   - Não retorna histórico individualizado.
========================================================= */

const PERFIS_OBSERVATORIO = new Set(['secretaria', 'admin', 'master', 'superadmin']);

const CATEGORIAS_ESTRATEGICAS = [
  { chave: 'bullying', rotulo: 'Bullying/Cyberbullying' },
  { chave: 'violencia_fisica', rotulo: 'Agressão física' },
  { chave: 'violencia_moral_digital', rotulo: 'Violência moral/digital' },
  { chave: 'risco_conflito', rotulo: 'Incitação/risco de conflito' },
  { chave: 'dano_patrimonial', rotulo: 'Depredação/dano patrimonial' },
  { chave: 'substancia_proibida', rotulo: 'Produto/substância não permitida' },
  { chave: 'arma_objeto_perigoso', rotulo: 'Arma/objeto perigoso' },
  { chave: 'ato_infracional', rotulo: 'Ato infracional/crime' },
  { chave: 'encaminhamento_externo', rotulo: 'Encaminhamentos externos' },
  { chave: 'elogios', rotulo: 'Elogios e reconhecimentos' },
];

// Evita classificar como crítica uma escola recém-criada, de teste ou com base estatística frágil.
// A escola continua visível no Observatório, mas não entra no índice geral da rede.
const MIN_ALUNOS_CLASSIFICACAO = 30;
const MIN_REGISTROS_CLASSIFICACAO = 10;


const UF_NOMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

function nomeUf(uf) {
  const sigla = String(uf || '').trim().toUpperCase();
  return UF_NOMES[sigla] || sigla || null;
}

function rotuloRede(rede) {
  const r = normalizeText(rede);
  if (r === 'estadual') return 'Rede estadual';
  if (r === 'municipal') return 'Rede municipal';
  if (r === 'federal') return 'Rede federal';
  if (r === 'privada') return 'Rede privada';
  return r ? `Rede ${r}` : 'Rede';
}

function oid(v) {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (mongoose.isValidObjectId(String(v))) return new mongoose.Types.ObjectId(String(v));
  return null;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeToken(value) {
  return normalizeText(value)
    .replace(/[§º°.,;:()\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInciso(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim();
}


function normalizeParagrafo(value) {
  const t = normalizeToken(value);
  if (!t) return '';
  const m = t.match(/\d+/);
  return m ? String(Number(m[0])) : t;
}

const ROMANO_PARA_NUMERO = {
  I: '1',
  II: '2',
  III: '3',
  IV: '4',
  V: '5',
  VI: '6',
  VII: '7',
  VIII: '8',
  IX: '9',
  X: '10',
  XI: '11',
  XII: '12',
  XIII: '13',
  XIV: '14',
  XV: '15',
  XVI: '16',
  XVII: '17',
  XVIII: '18',
  XIX: '19',
  XX: '20',
};

const NUMERO_PARA_ROMANO = Object.fromEntries(
  Object.entries(ROMANO_PARA_NUMERO).map(([romano, numero]) => [numero, romano])
);

function variantesInciso(value) {
  const raw = normalizeInciso(value);
  const out = new Set();
  if (raw) out.add(raw);
  if (ROMANO_PARA_NUMERO[raw]) out.add(ROMANO_PARA_NUMERO[raw]);
  if (NUMERO_PARA_ROMANO[raw]) out.add(NUMERO_PARA_ROMANO[raw]);
  return out;
}

function incisoEh(value, ...esperados) {
  const vars = variantesInciso(value);
  for (const esperado of esperados) {
    for (const v of variantesInciso(esperado)) {
      if (vars.has(v)) return true;
    }
  }
  return false;
}

function normalizeClassificacao(value) {
  const t = normalizeText(value);
  if (t.includes('gravissimo')) return 'gravissimo';
  if (t.includes('grave')) return 'grave';
  if (t.includes('medio')) return 'medio';
  if (t.includes('leve')) return 'leve';
  return t;
}

function clamp(n, min = 0, max = 100) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function percent(part, total) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  if (!t) return 0;
  return Number(((p / t) * 100).toFixed(1));
}

function per100(part, total) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  if (!t) return 0;
  return Number(((p / t) * 100).toFixed(2));
}


function timezoneObservatorio(req) {
  return req?.usuario?.escopoObservatorio?.timezone
    || req?.usuario?.timezone
    || timezonePorUF(req?.usuario?.escopoObservatorio?.estado || req?.usuario?.estado || 'AC');
}

function parsePeriodo(req) {
  return buildPeriodoFromQuery(req.query || {}, {
    timeZone: timezoneObservatorio(req),
    defaultToAnoLetivo: true,
  });
}

function instOrTenantMatch(instIds) {
  const ids = (instIds || []).map(oid).filter(Boolean);
  if (!ids.length) return { _id: null };
  return {
    $or: [
      { instituicao: { $in: ids } },
      { tenantId: { $in: ids } }
    ]
  };
}

function calcularIndiceConvivencia({ alunos = 0, graves = 0, violencia = 0, danoPatrimonial = 0, substanciaProibida = 0, arma = 0, encaminhamentos = 0, elogios = 0 }) {
  const base = 100;

  const graves100 = per100(graves, alunos);
  const violencia100 = per100(violencia, alunos);
  const dano100 = per100(danoPatrimonial, alunos);
  const subst100 = per100(substanciaProibida, alunos);
  const arma100 = per100(arma, alunos);
  const enc100 = per100(encaminhamentos, alunos);
  const elogios100 = per100(elogios, alunos);

  const desconto =
    graves100 * 1.6 +
    violencia100 * 4.0 +
    dano100 * 2.5 +
    subst100 * 5.0 +
    arma100 * 6.0 +
    enc100 * 2.0;

  const bonus = Math.min(elogios100 * 0.8, 8);

  return Number(clamp(base - desconto + bonus, 0, 100).toFixed(1));
}

function classificarStatus(indice) {
  const n = Number(indice || 0);
  if (n >= 90) return { chave: 'excelente', rotulo: 'Excelente' };
  if (n >= 75) return { chave: 'bom', rotulo: 'Bom' };
  if (n >= 60) return { chave: 'atencao', rotulo: 'Atenção' };
  return { chave: 'critico', rotulo: 'Crítico' };
}

function avaliarSuficienciaDados({ alunos = 0, notificacoes = 0 } = {}) {
  const qtdAlunos = Number(alunos || 0);
  const qtdRegistros = Number(notificacoes || 0);
  const motivos = [];

  if (qtdAlunos < MIN_ALUNOS_CLASSIFICACAO) {
    motivos.push(`menos de ${MIN_ALUNOS_CLASSIFICACAO} alunos cadastrados`);
  }

  if (qtdRegistros < MIN_REGISTROS_CLASSIFICACAO) {
    motivos.push(`menos de ${MIN_REGISTROS_CLASSIFICACAO} registros no período`);
  }

  const suficiente = motivos.length === 0;

  return {
    suficiente,
    minimoAlunos: MIN_ALUNOS_CLASSIFICACAO,
    minimoRegistros: MIN_REGISTROS_CLASSIFICACAO,
    motivos,
    mensagem: suficiente
      ? 'Base suficiente para classificação proporcional.'
      : `Dados insuficientes para classificar a escola. Motivo: ${motivos.join(' e ')}. A unidade permanece visível, mas não entra no índice geral da rede.`
  };
}

function statusDadosInsuficientes() {
  return { chave: 'dados_insuficientes', rotulo: 'Dados insuficientes' };
}

function interpretarCulturaRegistro({ alunos = 0, notificacoes = 0 }) {
  const taxa = per100(notificacoes, alunos);

  if (!alunos) {
    return {
      nivel: 'sem_base',
      taxaRegistrosPor100Alunos: 0,
      mensagem: 'Não há alunos suficientes cadastrados para interpretar o volume de registros.'
    };
  }

  if (taxa < 1) {
    return {
      nivel: 'possivel_subnotificacao',
      taxaRegistrosPor100Alunos: taxa,
      mensagem: 'Volume muito baixo de registros. Pode indicar boa convivência ou possível subnotificação.'
    };
  }

  if (taxa > 35) {
    return {
      nivel: 'volume_alto',
      taxaRegistrosPor100Alunos: taxa,
      mensagem: 'Volume alto de registros. Recomenda-se analisar contexto, porte da escola e cultura de registro antes de qualquer conclusão.'
    };
  }

  return {
    nivel: 'compativel',
    taxaRegistrosPor100Alunos: taxa,
    mensagem: 'Volume de registros compatível com análise proporcional ao porte da escola.'
  };
}

async function carregarUsuarioAtual(req) {
  const id = req.usuario?.id || req.usuario?._id;
  if (!id || !Usuario?.findById) return req.usuario || null;

  const usuarioDb = await Usuario.findById(id)
    .select('nome email tipo instituicao tenantId escopoObservatorio ativo')
    .lean()
    .catch(() => null);

  return usuarioDb || req.usuario || null;
}

async function requireObservatorio(req, res, next) {
  try {
    const usuario = await carregarUsuarioAtual(req);
    const tipo = normalizeText(usuario?.tipo || req.usuario?.tipo);

    if (!PERFIS_OBSERVATORIO.has(tipo)) {
      return res.status(403).json({
        ok: false,
        mensagem: 'Acesso permitido apenas a usuários autorizados do Observatório.'
      });
    }

    if (usuario?.ativo === false) {
      return res.status(403).json({ ok: false, mensagem: 'Usuário inativo.' });
    }

    req.observatorioUsuario = usuario;
    return next();
  } catch (e) {
    return res.status(500).json({
      ok: false,
      mensagem: 'Erro ao validar acesso ao Observatório.',
      erro: String(e.message || e)
    });
  }
}

function montarFiltroInstituicoesPorEscopo(usuario) {
  const tipo = normalizeText(usuario?.tipo);
  const escopo = usuario?.escopoObservatorio || {};

  if (tipo === 'admin') {
    const id = oid(usuario?.instituicao || usuario?.tenantId);
    return id ? { _id: id } : { _id: null };
  }

  if (tipo === 'master' || tipo === 'superadmin') return {};

  const nivel = normalizeText(escopo?.nivel || 'instituicoes');
  const instituicoesPermitidas = Array.isArray(escopo?.instituicoesPermitidas)
    ? escopo.instituicoesPermitidas.map(oid).filter(Boolean)
    : [];

  if (nivel === 'nacional') return {};

  if (nivel === 'estadual' && escopo?.estado) {
    return { estado: String(escopo.estado).trim().toUpperCase() };
  }

  if (nivel === 'municipal' && escopo?.estado && escopo?.municipio) {
    return {
      estado: String(escopo.estado).trim().toUpperCase(),
      municipio: new RegExp(`^${escapeRegex(String(escopo.municipio).trim())}$`, 'i')
    };
  }

  if (nivel === 'instituicoes' && instituicoesPermitidas.length) {
    return { _id: { $in: instituicoesPermitidas } };
  }

  const id = oid(usuario?.instituicao || usuario?.tenantId);
  return id ? { _id: id } : { _id: null };
}

function montarFiltroProtecaoObservatorio(usuario) {
  const tipo = normalizeText(usuario?.tipo);
  const escopo = usuario?.escopoObservatorio || {};

  // Admin escolar vê somente a própria escola, mesmo que ainda não esteja habilitada para Secretaria.
  if (tipo === 'admin') return {};

  // SuperAdmin/Master pode auditar tudo no Observatório.
  if (tipo === 'master' || tipo === 'superadmin') return {};

  const filtro = {
    observatorioAtivo: true,
    visivelParaSecretaria: true,
    ambienteTeste: { $ne: true },
  };

  if (escopo?.podeVerPrivadas !== true) {
    filtro.redeEnsino = { $ne: 'privada' };
    filtro.tipoEscola = { $ne: 'privada' };
  }

  const redesPermitidas = Array.isArray(escopo?.redesPermitidas)
    ? escopo.redesPermitidas.map(r => normalizeText(r)).filter(Boolean)
    : [];

  if (redesPermitidas.length) {
    filtro.redeEnsino = { $in: redesPermitidas };
  } else if (escopo?.rede) {
    filtro.redeEnsino = normalizeText(escopo.rede);
  }

  return filtro;
}

async function listarInstituicoesPermitidas(req) {
  const usuario = req.observatorioUsuario || req.usuario || {};
  const filtroEscopo = montarFiltroInstituicoesPorEscopo(usuario);

  const filtroProtecao = montarFiltroProtecaoObservatorio(usuario);

  const filtro = {
    ...filtroEscopo,
    ...filtroProtecao,
    $and: [
      {
        $or: [
          { ativo: true },
          { ativa: true },
          { ativo: { $exists: false }, ativa: { $exists: false } }
        ]
      }
    ]
  };

  return Instituicao.find(filtro)
    .select('_id nome nomeExibicao sigla slug municipio estado redeEnsino tipoEscola observatorioAtivo visivelParaSecretaria ambienteTeste ativo ativa logoUrl codigo createdAt updatedAt')
    .sort({ estado: 1, municipio: 1, nome: 1 })
    .lean();
}

async function aggregateAlunosPorInstituicao(instIds) {
  const match = instOrTenantMatch(instIds);

  const rows = await Aluno.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $ifNull: ['$instituicao', '$tenantId'] },
        total: { $sum: 1 },
        mediaComportamento: { $avg: '$comportamento' }
      }
    }
  ]);

  return new Map(rows.map(r => [String(r._id), {
    total: Number(r.total || 0),
    mediaComportamento: Number(Number(r.mediaComportamento || 0).toFixed(2))
  }]));
}

function getInstIdFromNotif(n) {
  return String(n?.instituicao || n?.tenantId || '');
}

function isCmdpii(inst) {
  const txt = normalizeText(`${inst?.slug || ''} ${inst?.sigla || ''} ${inst?.nome || ''}`);
  return txt.includes('cmdpii') || txt.includes('dom pedro ii');
}

function isArtigo54(n) {
  const artigo = normalizeToken(n?.artigo);
  return artigo === '54' || artigo === 'art 54' || artigo.includes('54');
}

function addCat(categorias, chave) {
  if (!categorias.includes(chave)) categorias.push(chave);
}

/**
 * Mapeamento local, seguro e EXATO para o regulamento do CMDPII.
 * Não usa palavras-chave amplas.
 * Itens regimentais leves/médios, como uniforme, cabelo, conversa em forma
 * e portar-se de maneira inconveniente, NÃO entram no Observatório.
 */
function mapearRegulamentoCmdpii(n, inst) {
  const categorias = [];

  if (!isCmdpii(inst)) return categorias;
  if (!isArtigo54(n)) return categorias;

  const classificacao = normalizeClassificacao(n?.classificacaoRegulamento || n?.classificacaoOcorrencia || '');
  const paragrafo = normalizeParagrafo(n?.paragrafo);

  // Importante:
  // O banco salva incisos como número em alguns fluxos (ex.: "9") e não como romano ("IX").
  // Por isso a comparação precisa aceitar as duas formas, mas sempre combinando parágrafo + classificação.
  const ehParagrafo3 = !paragrafo || paragrafo === '3';
  const ehParagrafo4 = !paragrafo || paragrafo === '4';

  // Art. 54, §4º - Gravíssimo.
  // Aqui entram apenas casos inequivocamente estratégicos para o Observatório.
  if (classificacao === 'gravissimo' && ehParagrafo4) {
    if (incisoEh(n?.inciso, 'I', '1')) addCat(categorias, 'arma_objeto_perigoso');
    if (incisoEh(n?.inciso, 'II', '2')) addCat(categorias, 'substancia_proibida');
    if (incisoEh(n?.inciso, 'V', '5')) addCat(categorias, 'violencia_fisica');
    if (incisoEh(n?.inciso, 'VI', '6')) addCat(categorias, 'ato_infracional');
    if (incisoEh(n?.inciso, 'VII', '7')) addCat(categorias, 'substancia_proibida');
    if (incisoEh(n?.inciso, 'IX', '9')) addCat(categorias, 'bullying');
  }

  // Art. 54, §3º - Grave, somente itens claramente estratégicos.
  // Não inclui regra regimental genérica, atraso, uniforme, cabelo ou conversa em forma.
  if (classificacao === 'grave' && ehParagrafo3) {
    if (incisoEh(n?.inciso, 'X', '10')) addCat(categorias, 'violencia_moral_digital');
    if (incisoEh(n?.inciso, 'XIII', '13')) addCat(categorias, 'risco_conflito');
    if (incisoEh(n?.inciso, 'XVII', '17')) addCat(categorias, 'dano_patrimonial');
    if (incisoEh(n?.inciso, 'XVIII', '18')) addCat(categorias, 'risco_conflito');
  }

  return categorias;
}

function classificarNotificacaoEstrategica(n, inst) {
  const categorias = [];
  const natureza = normalizeText(n?.natureza);

  if (natureza === 'elogio') {
    return {
      isElogio: true,
      estrategica: false,
      categorias: ['elogios']
    };
  }

  // 1) Campos explícitos do cadastro/fluxo disciplinar.
  if (n?.possuiViolencia === true || n?.possuiLesao === true) addCat(categorias, 'violencia_fisica');
  if (n?.possuiDanoPatrimonial === true) addCat(categorias, 'dano_patrimonial');
  if (n?.possuiSubstanciaIlicita === true) addCat(categorias, 'substancia_proibida');
  if (n?.possuiArmaOuObjetoPerigoso === true) addCat(categorias, 'arma_objeto_perigoso');
  if (n?.exigeEncaminhamentoExterno === true) addCat(categorias, 'encaminhamento_externo');

  // 2) Mapeamento local exato do regulamento, quando houver.
  for (const cat of mapearRegulamentoCmdpii(n, inst)) addCat(categorias, cat);

  return {
    isElogio: false,
    estrategica: categorias.length > 0,
    categorias
  };
}

async function carregarNotificacoesPermitidas(instIds, periodo) {
  if (!instIds.length) return [];

  return Notificacao.find({
    ...instOrTenantMatch(instIds),
    ativo: { $ne: false },
    ...periodo.match
  })
    .select([
      'instituicao tenantId natureza tipo tipoMedida tipoElogio motivo observacao data',
      'classificacaoRegulamento classificacaoOcorrencia artigo paragrafo inciso',
      'possuiViolencia possuiLesao possuiDanoPatrimonial possuiSubstanciaIlicita possuiArmaOuObjetoPerigoso',
      'exigeEncaminhamentoExterno orgaoEncaminhamento mensagemEnviada lida entregue devolvidoPeloAluno status'
    ].join(' '))
    .lean();
}

function novaStatsNotif() {
  return {
    total: 0,
    elogios: 0,
    condecoracoes: 0,
    ocorrenciasEstrategicas: 0,
    violenciaFisica: 0,
    violenciaMoralDigital: 0,
    bullying: 0,
    riscoConflito: 0,
    danoPatrimonial: 0,
    substanciaProibida: 0,
    armaOuObjetoPerigoso: 0,
    atoInfracional: 0,
    encaminhamentosExternos: 0,
    mensagensEnviadas: 0,
    lidas: 0,
    entregues: 0,
    devolvidas: 0,
    categorias: Object.fromEntries(CATEGORIAS_ESTRATEGICAS.map(c => [c.chave, 0])),
  };
}

function aplicarCategoria(stats, cat) {
  stats.categorias[cat] = Number(stats.categorias[cat] || 0) + 1;

  if (cat === 'bullying') stats.bullying += 1;
  if (cat === 'violencia_fisica') stats.violenciaFisica += 1;
  if (cat === 'violencia_moral_digital') stats.violenciaMoralDigital += 1;
  if (cat === 'risco_conflito') stats.riscoConflito += 1;
  if (cat === 'dano_patrimonial') stats.danoPatrimonial += 1;
  if (cat === 'substancia_proibida') stats.substanciaProibida += 1;
  if (cat === 'arma_objeto_perigoso') stats.armaOuObjetoPerigoso += 1;
  if (cat === 'ato_infracional') stats.atoInfracional += 1;
  if (cat === 'encaminhamento_externo') stats.encaminhamentosExternos += 1;
}

function aggregateNotificacoesEmMemoria(notificacoes, instMap) {
  const map = new Map();

  for (const n of notificacoes || []) {
    const key = getInstIdFromNotif(n);
    if (!key) continue;

    if (!map.has(key)) map.set(key, novaStatsNotif());

    const stats = map.get(key);
    const inst = instMap.get(key) || null;
    const classificacao = classificarNotificacaoEstrategica(n, inst);

    stats.total += 1;

    if (normalizeText(n?.natureza) === 'elogio') {
      stats.elogios += 1;
      stats.categorias.elogios += 1;

      if (['boletimInternoIndividual', 'boletimInternoColetivo', 'mediaAlta'].includes(n?.tipoElogio)) {
        stats.condecoracoes += 1;
      }
    }

    if (classificacao.estrategica) {
      stats.ocorrenciasEstrategicas += 1;
      for (const cat of classificacao.categorias) aplicarCategoria(stats, cat);
    }

    if (n?.mensagemEnviada === true) stats.mensagensEnviadas += 1;
    if (n?.lida === true) stats.lidas += 1;
    if (n?.entregue === true) stats.entregues += 1;
    if (n?.devolvidoPeloAluno === true) stats.devolvidas += 1;
  }

  return map;
}

function montarResumoEscola(inst, alunosStats, notifStats) {
  const alunos = alunosStats?.total || 0;
  const notificacoes = notifStats?.total || 0;
  const elogios = notifStats?.elogios || 0;
  const ocorrenciasEstrategicas = notifStats?.ocorrenciasEstrategicas || 0;
  const violenciaFisica = notifStats?.violenciaFisica || 0;
  const danoPatrimonial = notifStats?.danoPatrimonial || 0;
  const substanciaProibida = notifStats?.substanciaProibida || 0;
  const arma = notifStats?.armaOuObjetoPerigoso || 0;
  const encaminhamentos = notifStats?.encaminhamentosExternos || 0;

  const suficienciaDados = avaliarSuficienciaDados({ alunos, notificacoes });

  const indiceCalculado = calcularIndiceConvivencia({
    alunos,
    graves: ocorrenciasEstrategicas,
    violencia: violenciaFisica,
    danoPatrimonial,
    substanciaProibida,
    arma,
    encaminhamentos,
    elogios
  });

  const status = suficienciaDados.suficiente
    ? classificarStatus(indiceCalculado)
    : statusDadosInsuficientes();

  const indiceConvivencia = suficienciaDados.suficiente ? indiceCalculado : null;

  const ciencias = Math.max(
    notifStats?.lidas || 0,
    notifStats?.entregues || 0,
    notifStats?.devolvidas || 0
  );

  return {
    id: String(inst._id),
    nome: inst.nomeExibicao || inst.nome || 'Instituição',
    sigla: inst.sigla || '',
    slug: inst.slug || '',
    municipio: inst.municipio || '',
    estado: inst.estado || '',
    codigo: inst.codigo || '',
    redeEnsino: inst.redeEnsino || '',
    tipoEscola: inst.tipoEscola || '',
    observatorioAtivo: !!inst.observatorioAtivo,
    visivelParaSecretaria: !!inst.visivelParaSecretaria,
    ambienteTeste: !!inst.ambienteTeste,
    alunos,
    mediaComportamental: alunosStats?.mediaComportamento || 0,
    notificacoes,
    indicadores: {
      elogios,
      condecoracoes: notifStats?.condecoracoes || 0,
      ocorrenciasGraves: ocorrenciasEstrategicas,
      ocorrenciasEstrategicas,
      violencia: violenciaFisica,
      violenciaFisica,
      violenciaMoralDigital: notifStats?.violenciaMoralDigital || 0,
      bullying: notifStats?.bullying || 0,
      riscoConflito: notifStats?.riscoConflito || 0,
      lesao: 0,
      danoPatrimonial,
      substanciaIlicita: substanciaProibida,
      substanciaProibida,
      armaOuObjetoPerigoso: arma,
      atoInfracional: notifStats?.atoInfracional || 0,
      encaminhamentosExternos: encaminhamentos,
      categorias: notifStats?.categorias || {}
    },
    taxas: {
      notificacoesPor100Alunos: per100(notificacoes, alunos),
      ocorrenciasGravesPor100Alunos: per100(ocorrenciasEstrategicas, alunos),
      violenciaPor100Alunos: per100(violenciaFisica, alunos),
      elogiosPor100Alunos: per100(elogios, alunos)
    },
    familia: {
      mensagensEnviadas: notifStats?.mensagensEnviadas || 0,
      registrosComCiencia: ciencias,
      percentualCiencia: percent(ciencias, notifStats?.mensagensEnviadas || notificacoes)
    },
    indiceConvivencia,
    indiceConvivenciaCalculado: indiceCalculado,
    classificavel: suficienciaDados.suficiente,
    suficienciaDados,
    status,
    culturaRegistro: interpretarCulturaRegistro({ alunos, notificacoes })
  };
}

function somarResumo(escolas) {
  const total = {
    escolas: escolas.length,
    escolasClassificadas: 0,
    escolasDadosInsuficientes: 0,
    alunos: 0,
    notificacoes: 0,
    elogios: 0,
    condecoracoes: 0,
    ocorrenciasGraves: 0,
    ocorrenciasEstrategicas: 0,
    violencia: 0,
    violenciaFisica: 0,
    violenciaMoralDigital: 0,
    bullying: 0,
    riscoConflito: 0,
    lesao: 0,
    danoPatrimonial: 0,
    substanciaIlicita: 0,
    substanciaProibida: 0,
    armaOuObjetoPerigoso: 0,
    atoInfracional: 0,
    encaminhamentosExternos: 0,
    mensagensEnviadas: 0,
    registrosComCiencia: 0
  };

  for (const e of escolas) {
    if (e.classificavel) total.escolasClassificadas += 1;
    else total.escolasDadosInsuficientes += 1;

    total.alunos += e.alunos || 0;
    total.notificacoes += e.notificacoes || 0;
    total.elogios += e.indicadores?.elogios || 0;
    total.condecoracoes += e.indicadores?.condecoracoes || 0;
    total.ocorrenciasGraves += e.indicadores?.ocorrenciasGraves || 0;
    total.ocorrenciasEstrategicas += e.indicadores?.ocorrenciasEstrategicas || 0;
    total.violencia += e.indicadores?.violenciaFisica || 0;
    total.violenciaFisica += e.indicadores?.violenciaFisica || 0;
    total.violenciaMoralDigital += e.indicadores?.violenciaMoralDigital || 0;
    total.bullying += e.indicadores?.bullying || 0;
    total.riscoConflito += e.indicadores?.riscoConflito || 0;
    total.danoPatrimonial += e.indicadores?.danoPatrimonial || 0;
    total.substanciaIlicita += e.indicadores?.substanciaProibida || 0;
    total.substanciaProibida += e.indicadores?.substanciaProibida || 0;
    total.armaOuObjetoPerigoso += e.indicadores?.armaOuObjetoPerigoso || 0;
    total.atoInfracional += e.indicadores?.atoInfracional || 0;
    total.encaminhamentosExternos += e.indicadores?.encaminhamentosExternos || 0;
    total.mensagensEnviadas += e.familia?.mensagensEnviadas || 0;
    total.registrosComCiencia += e.familia?.registrosComCiencia || 0;
  }

  const classificaveis = escolas.filter(e => e.classificavel && Number.isFinite(Number(e.indiceConvivencia)));

  const indiceMedio = classificaveis.length
    ? Number((classificaveis.reduce((s, e) => s + Number(e.indiceConvivencia || 0), 0) / classificaveis.length).toFixed(1))
    : null;

  return {
    ...total,
    indiceConvivenciaGeral: indiceMedio,
    statusGeral: indiceMedio === null ? statusDadosInsuficientes() : classificarStatus(indiceMedio),
    criterioSuficiencia: {
      minimoAlunos: MIN_ALUNOS_CLASSIFICACAO,
      minimoRegistros: MIN_REGISTROS_CLASSIFICACAO,
      regra: 'Escolas abaixo de qualquer mínimo permanecem visíveis, mas não entram na classificação de saúde nem no índice geral da rede.'
    },
    taxas: {
      notificacoesPor100Alunos: per100(total.notificacoes, total.alunos),
      ocorrenciasGravesPor100Alunos: per100(total.ocorrenciasGraves, total.alunos),
      violenciaPor100Alunos: per100(total.violenciaFisica, total.alunos),
      elogiosPor100Alunos: per100(total.elogios, total.alunos)
    },
    familia: {
      mensagensEnviadas: total.mensagensEnviadas,
      registrosComCiencia: total.registrosComCiencia,
      percentualCiencia: percent(total.registrosComCiencia, total.mensagensEnviadas || total.notificacoes)
    }
  };
}

function montarEscopoResposta(usuario, instituicoes = []) {
  const escopo = usuario?.escopoObservatorio || {};
  const tipo = normalizeText(usuario?.tipo);

  const estados = Array.from(new Set((instituicoes || [])
    .map(i => String(i?.estado || '').trim().toUpperCase())
    .filter(Boolean)));

  const redes = Array.from(new Set((instituicoes || [])
    .map(i => normalizeText(i?.redeEnsino))
    .filter(Boolean)));

  const estado = String(escopo?.estado || (estados.length === 1 ? estados[0] : '')).trim().toUpperCase();
  const redeEscopo = Array.isArray(escopo?.redesPermitidas) && escopo.redesPermitidas.length
    ? normalizeText(escopo.redesPermitidas[0])
    : normalizeText(escopo?.rede || (redes.length === 1 ? redes[0] : ''));

  let descricao = 'Observatório';
  const nivel = normalizeText(escopo?.nivel || (tipo === 'admin' ? 'instituicao' : ''));

  if (tipo === 'admin') {
    descricao = 'Instituição escolar';
  } else if (nivel === 'estadual' && estado) {
    descricao = `${rotuloRede(redeEscopo || 'estadual')} • ${nomeUf(estado) || estado}`;
  } else if (nivel === 'municipal' && estado && escopo?.municipio) {
    descricao = `${rotuloRede(redeEscopo || 'municipal')} • ${escopo.municipio}/${estado}`;
  } else if (nivel === 'nacional') {
    descricao = redeEscopo ? `${rotuloRede(redeEscopo)} • Nacional` : 'Observatório Nacional';
  } else if (redeEscopo) {
    descricao = rotuloRede(redeEscopo);
  }

  return {
    nivel: escopo?.nivel || null,
    estado: estado || null,
    estadoNome: estado ? nomeUf(estado) : (estados.length > 1 ? 'Vários estados' : null),
    municipio: escopo?.municipio || null,
    rede: redeEscopo || null,
    descricao,
    escolasNoEscopo: instituicoes.length
  };
}

async function montarDadosBase(req) {
  const periodo = parsePeriodo(req);
  const instituicoes = await listarInstituicoesPermitidas(req);
  const instIds = instituicoes.map(i => i._id);
  const instMap = new Map(instituicoes.map(i => [String(i._id), i]));

  const [alunosMap, notificacoes] = await Promise.all([
    aggregateAlunosPorInstituicao(instIds),
    carregarNotificacoesPermitidas(instIds, periodo)
  ]);

  const notifMap = aggregateNotificacoesEmMemoria(notificacoes, instMap);

  const escolas = instituicoes.map(inst => montarResumoEscola(
    inst,
    alunosMap.get(String(inst._id)) || {},
    notifMap.get(String(inst._id)) || novaStatsNotif()
  ));

  const usuario = req.observatorioUsuario || req.usuario || {};
  const escopoResposta = montarEscopoResposta(usuario, instituicoes);

  return { periodo, instituicoes, instIds, instMap, escolas, notificacoes, notifMap, usuario, escopoResposta };
}

function montarTiposEstrategicos(notificacoes, instMap) {
  const totais = Object.fromEntries(CATEGORIAS_ESTRATEGICAS.map(c => [c.chave, 0]));

  for (const n of notificacoes || []) {
    const inst = instMap.get(getInstIdFromNotif(n)) || null;
    const info = classificarNotificacaoEstrategica(n, inst);

    if (normalizeText(n?.natureza) === 'elogio') {
      totais.elogios += 1;
      continue;
    }

    for (const cat of info.categorias || []) {
      if (cat in totais) totais[cat] += 1;
    }
  }

  return CATEGORIAS_ESTRATEGICAS
    .map(c => ({ ...c, total: Number(totais[c.chave] || 0) }))
    .sort((a, b) => b.total - a.total);
}

function montarEvolucaoMensal(notificacoes, instMap) {
  const map = new Map();

  for (const n of notificacoes || []) {
    const d = n?.data ? new Date(n.data) : null;
    if (!d || Number.isNaN(d.getTime())) continue;

    const ano = d.getFullYear();
    const mes = d.getMonth() + 1;
    const key = `${ano}-${String(mes).padStart(2, '0')}`;

    if (!map.has(key)) {
      map.set(key, {
        ano,
        mes,
        label: `${String(mes).padStart(2, '0')}/${ano}`,
        notificacoes: 0,
        elogios: 0,
        ocorrenciasGraves: 0
      });
    }

    const row = map.get(key);
    const inst = instMap.get(getInstIdFromNotif(n)) || null;
    const info = classificarNotificacaoEstrategica(n, inst);

    row.notificacoes += 1;
    if (normalizeText(n?.natureza) === 'elogio') row.elogios += 1;
    if (info.estrategica) row.ocorrenciasGraves += 1;
  }

  return Array.from(map.values()).sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
}

function montarAlertas(escolas) {
  const alertas = [];

  for (const e of escolas) {
    if (e.status?.chave === 'dados_insuficientes') {
      alertas.push({
        nivel: 'informativo',
        tipo: 'dados_insuficientes',
        escolaId: e.id,
        escola: e.nome,
        mensagem: `${e.nome} possui dados insuficientes para classificação. A escola aparece no Observatório, mas não entra no índice geral da rede até atingir a base mínima.`
      });
      continue;
    }

    if (e.status?.chave === 'critico') {
      alertas.push({
        nivel: 'critico',
        tipo: 'indice_convivencia',
        escolaId: e.id,
        escola: e.nome,
        mensagem: `${e.nome} está com sinalização crítica no Índice de Convivência (${e.indiceConvivencia}). Analisar contexto antes de decisões administrativas.`
      });
    }

    if (e.culturaRegistro?.nivel === 'possivel_subnotificacao') {
      alertas.push({
        nivel: 'atencao',
        tipo: 'possivel_subnotificacao',
        escolaId: e.id,
        escola: e.nome,
        mensagem: `${e.nome} possui volume muito baixo de registros. Pode haver subnotificação ou ausência real de ocorrências.`
      });
    }

    if ((e.indicadores?.violenciaFisica || 0) > 0 || (e.indicadores?.substanciaProibida || 0) > 0 || (e.indicadores?.armaOuObjetoPerigoso || 0) > 0) {
      alertas.push({
        nivel: 'alto',
        tipo: 'seguranca_escolar',
        escolaId: e.id,
        escola: e.nome,
        mensagem: `${e.nome} possui registros estratégicos de segurança escolar no período.`
      });
    }
  }

  return alertas.slice(0, 20);
}

router.use(autenticar, requireObservatorio);

router.get('/resumo', async (req, res) => {
  try {
    const { periodo, instMap, escolas, notificacoes, escopoResposta } = await montarDadosBase(req);
    const resumo = somarResumo(escolas);
    const tiposEstrategicos = montarTiposEstrategicos(notificacoes, instMap);
    const evolucaoMensal = montarEvolucaoMensal(notificacoes, instMap);

    const statusEscolas = escolas.reduce((acc, e) => {
      const k = e.status?.chave || 'sem_status';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      ok: true,
      modo: 'rede',
      periodo: {
        inicio: periodo.inicio?.toISOString?.() || null,
        fim: periodo.fim?.toISOString?.() || null,
        inicioDateOnly: periodo.inicioDateOnly || null,
        fimDateOnly: periodo.fimDateOnly || null,
        timezone: periodo.timeZone || null,
        label: periodo.label,
        labelBR: periodo.labelBR
      },
      escopo: escopoResposta,
      avisoInterpretativo: 'Os indicadores são agregados e devem ser analisados proporcionalmente ao número de alunos, à cultura de registro e à suficiência da base estatística de cada escola. Esta versão não classifica regra regimental interna como violência, bullying ou crime sem mapeamento estratégico explícito.',
      lgpd: 'Este painel não retorna nomes de estudantes nem histórico individualizado.',
      criterioClassificacao: {
        regra: 'Sem inferência por palavras-chave amplas.',
        fontesValidas: [
          'flags explícitas no registro da notificação',
          'mapeamento local exato do regulamento da instituição'
        ],
        observacao: 'Ocorrências não mapeadas aparecem apenas como notificações totais, não como casos estratégicos.'
      },
      resumo,
      statusEscolas,
      tiposEstrategicos,
      evolucaoMensal,
      rankingEscolas: [...escolas]
        .filter(e => e.classificavel)
        .sort((a, b) => Number(b.indiceConvivencia || 0) - Number(a.indiceConvivencia || 0))
        .slice(0, 10),
      escolasCriticas: escolas
        .filter(e => e.status?.chave === 'critico')
        .sort((a, b) => Number(a.indiceConvivencia || 0) - Number(b.indiceConvivencia || 0))
        .slice(0, 10),
      alertas: montarAlertas(escolas)
    });
  } catch (e) {
    console.error('[observatorio][resumo]', e);
    return res.status(500).json({
      ok: false,
      mensagem: 'Erro ao carregar resumo do Observatório.',
      erro: String(e.message || e)
    });
  }
});

router.get('/escolas', async (req, res) => {
  try {
    const q = normalizeText(req.query?.q || '');
    const { periodo, escolas, escopoResposta } = await montarDadosBase(req);

    const filtradas = q
      ? escolas.filter(e => normalizeText(`${e.nome} ${e.sigla} ${e.municipio} ${e.estado}`).includes(q))
      : escolas;

    return res.json({
      ok: true,
      periodo: {
        inicio: periodo.inicio?.toISOString?.() || null,
        fim: periodo.fim?.toISOString?.() || null,
        inicioDateOnly: periodo.inicioDateOnly || null,
        fimDateOnly: periodo.fimDateOnly || null,
        timezone: periodo.timeZone || null,
        label: periodo.label,
        labelBR: periodo.labelBR
      },
      escopo: escopoResposta,
      total: filtradas.length,
      escolas: filtradas
    });
  } catch (e) {
    console.error('[observatorio][escolas]', e);
    return res.status(500).json({
      ok: false,
      mensagem: 'Erro ao listar escolas do Observatório.',
      erro: String(e.message || e)
    });
  }
});

router.get('/escolas/:id/resumo', async (req, res) => {
  try {
    const escolaId = String(req.params.id || '').trim();
    if (!mongoose.isValidObjectId(escolaId)) {
      return res.status(400).json({ ok: false, mensagem: 'Escola inválida.' });
    }

    const { periodo, instIds, instMap, escolas, notificacoes, escopoResposta } = await montarDadosBase(req);
    const permitida = instIds.some(id => String(id) === escolaId);

    if (!permitida) {
      return res.status(403).json({ ok: false, mensagem: 'Esta escola não está no escopo do seu Observatório.' });
    }

    const escola = escolas.find(e => e.id === escolaId);
    if (!escola) {
      return res.status(404).json({ ok: false, mensagem: 'Escola não encontrada.' });
    }

    const filtradas = notificacoes.filter(n => getInstIdFromNotif(n) === escolaId);
    const tiposEstrategicos = montarTiposEstrategicos(filtradas, instMap);
    const evolucaoMensal = montarEvolucaoMensal(filtradas, instMap);

    return res.json({
      ok: true,
      modo: 'escola',
      periodo: {
        inicio: periodo.inicio?.toISOString?.() || null,
        fim: periodo.fim?.toISOString?.() || null,
        inicioDateOnly: periodo.inicioDateOnly || null,
        fimDateOnly: periodo.fimDateOnly || null,
        timezone: periodo.timeZone || null,
        label: periodo.label,
        labelBR: periodo.labelBR
      },
      escopo: escopoResposta,
      avisoInterpretativo: 'Dashboard individual da escola com dados agregados. Não há exposição de nomes de alunos. Regras regimentais internas não são tratadas como violência sem mapeamento estratégico explícito.',
      lgpd: 'Este painel não retorna dados individualizados de estudantes.',
      criterioClassificacao: {
        regra: 'Sem inferência por palavras-chave amplas.',
        fontesValidas: [
          'flags explícitas no registro da notificação',
          'mapeamento local exato do regulamento da instituição'
        ]
      },
      escola,
      tiposEstrategicos,
      evolucaoMensal,
      alertas: montarAlertas([escola])
    });
  } catch (e) {
    console.error('[observatorio][escola-resumo]', e);
    return res.status(500).json({
      ok: false,
      mensagem: 'Erro ao carregar resumo da escola.',
      erro: String(e.message || e)
    });
  }
});

module.exports = router;
