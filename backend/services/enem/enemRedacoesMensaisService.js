'use strict';

const mongoose = require('mongoose');
const RedacaoTema = require('../../models/RedacaoTema');
const RedacaoCiclo = require('../../models/RedacaoCiclo');
const { selecionarTemasDoMes } = require('./enemTemasMensaisPool');
const { CODIGO_TEMA_DIAGNOSTICO } = require('./enemDiagnosticoService');

const GRADE_REFERENCIA = 'ENEM-2025-grade-especifica-v7-c2-repertorio-auditado';
const QTD_TEMAS_MENSAIS = 2;

function texto(v) { return String(v || '').trim(); }
function valor(v) { return v && typeof v === 'object' ? (v._id || v.id || v.slug || v) : v; }
function mesReferencia(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}
function inicioDoMes(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), 1, 0, 0, 0, 0);
}
function fimDoMes(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth() + 1, 1, 0, 0, 0, 0);
}
function candidatos(v) {
  const bruto = valor(v);
  if (bruto === null || bruto === undefined || texto(bruto) === '') return [];
  const s = texto(bruto);
  const out = [s];
  if (mongoose.Types.ObjectId.isValid(s)) out.push(new mongoose.Types.ObjectId(s));
  return out;
}
function filtroInstituicao(v) {
  const c = candidatos(v);
  return c.length ? { instituicao: { $in: c } } : null;
}


function copiarTemaMensal(base, instituicao, mesRef, ordem, criadoPor = null) {
  return {
    instituicao: valor(instituicao),
    codigoBanco: `AXR-MENSAL-${mesRef}-${ordem}-${texto(base.codigoBanco)}`,
    titulo: texto(base.titulo),
    proposta: texto(base.proposta),
    eixoTematico: texto(base.eixoTematico) || 'Redação ENEM',
    palavrasChave: Array.isArray(base.palavrasChave) ? base.palavrasChave : [],
    textosMotivadores: Array.isArray(base.textosMotivadores) ? base.textosMotivadores : [],
    modalidade: 'trilha_orientada',
    destaquePraticaLivre: false,
    ordemPraticaLivre: 0,
    turmasDestinadas: [],
    publicoAlvo: 'Ensino Médio',
    orientacoesProfessor: `Tema formativo mensal gerado a partir do banco institucional (${texto(base.codigoBanco)}). Diferente da produção diagnóstica.`,
    tempoSugeridoMinutos: Math.max(60, Number(base.tempoSugeridoMinutos) || 70),
    minimoPalavras: Math.max(120, Number(base.minimoPalavras) || 120),
    maximoPalavras: Math.max(300, Number(base.maximoPalavras) || 450),
    status: 'inativo',
    dataInicio: inicioDoMes(),
    dataFim: fimDoMes(),
    criadoPor
  };
}

async function garantirTemaMensal({ instituicao, base, mesRef, ordem, criadoPor = null }) {
  const fInst = filtroInstituicao(instituicao);
  if (!fInst) throw new Error('Instituição não identificada para a agenda mensal de redação.');
  const codigoBanco = `AXR-MENSAL-${mesRef}-${ordem}-${texto(base.codigoBanco)}`;
  let tema = await RedacaoTema.findOne({ ...fInst, codigoBanco });
  if (!tema) {
    tema = await RedacaoTema.create(copiarTemaMensal(base, instituicao, mesRef, ordem, criadoPor));
  } else {
    tema.titulo = texto(base.titulo);
    tema.proposta = texto(base.proposta);
    tema.eixoTematico = texto(base.eixoTematico) || 'Redação ENEM';
    tema.palavrasChave = Array.isArray(base.palavrasChave) ? base.palavrasChave : [];
    tema.textosMotivadores = Array.isArray(base.textosMotivadores) ? base.textosMotivadores : [];
    tema.modalidade = 'trilha_orientada';
    tema.status = tema.status === 'arquivado' ? 'inativo' : tema.status;
    tema.dataInicio = inicioDoMes();
    tema.dataFim = fimDoMes();
    await tema.save();
  }
  return tema;
}

async function garantirCicloMensal({ instituicao, tema, mesRef, ordem, criadoPor = null }) {
  const fInst = filtroInstituicao(instituicao);
  if (!fInst) throw new Error('Instituição não identificada para a agenda mensal de redação.');
  let ciclo = await RedacaoCiclo.findOne({
    ...fInst,
    modalidade: 'trilha_orientada',
    natureza: 'formativo',
    mesReferencia: mesRef,
    ordemMensal: ordem,
    geradoAutomaticamente: true
  });

  const dados = {
    instituicao: valor(instituicao),
    nome: `Redação formativa ${ordem} — ${mesRef}`,
    modalidade: 'trilha_orientada',
    natureza: 'formativo',
    gradeReferencia: GRADE_REFERENCIA,
    temaId: tema._id,
    turmasDestinadas: [],
    publicoAlvo: 'Ensino Médio',
    status: 'ativo',
    dataInicio: inicioDoMes(),
    dataFim: fimDoMes(),
    maxEnviosPorAluno: 2, // produção inicial + reescrita; a reescrita não consome nova vaga mensal
    permiteReescrita: true,
    assistenteDuranteEscrita: true,
    cronometroObrigatorio: false,
    tempoLimiteMinutos: Math.max(60, Number(tema.tempoSugeridoMinutos) || 70),
    mostrarTextosMotivadores: true,
    instrucoesAluno: 'Produção formativa mensal. O acompanhamento da escrita está ativo e não fornece respostas prontas. Após a correção, a reescrita será orientada pela devolutiva.',
    mesReferencia: mesRef,
    ordemMensal: ordem,
    geradoAutomaticamente: true,
    atualizadoPor: criadoPor
  };

  if (!ciclo) {
    ciclo = await RedacaoCiclo.create({ ...dados, criadoPor });
  } else {
    Object.assign(ciclo, dados);
    await ciclo.save();
  }
  return ciclo;
}

async function garantirRedacoesMensais({ instituicao, criadoPor = null, data = new Date(), quantidade = QTD_TEMAS_MENSAIS }) {
  const fInst = filtroInstituicao(instituicao);
  if (!fInst) throw new Error('Instituição não identificada para a agenda mensal de redação.');
  const mesRef = mesReferencia(data);
  const quantidadeDesejada = Math.max(
    QTD_TEMAS_MENSAIS,
    Math.min(20, Number(quantidade) || QTD_TEMAS_MENSAIS)
  );

  const diagnostico = await RedacaoTema.findOne({ ...fInst, codigoBanco: CODIGO_TEMA_DIAGNOSTICO }).select('_id codigoBanco titulo').lean();
  const ciclosExistentes = await RedacaoCiclo.find({
    ...fInst,
    modalidade: 'trilha_orientada',
    natureza: 'formativo',
    status: 'ativo',
    $and: [
      { $or: [{ dataInicio: null }, { dataInicio: { $exists: false } }, { dataInicio: { $lt: fimDoMes(data) } }] },
      { $or: [{ dataFim: null }, { dataFim: { $exists: false } }, { dataFim: { $gte: inicioDoMes(data) } }] }
    ]
  }).populate('temaId').sort({ geradoAutomaticamente: 1, ordemMensal: 1, createdAt: 1 }).lean();

  const validosExistentes = ciclosExistentes.filter((c) => {
    const tema = c.temaId || {};
    if (diagnostico && String(tema._id || '') === String(diagnostico._id)) return false;
    if (texto(tema.codigoBanco) === CODIGO_TEMA_DIAGNOSTICO) return false;
    if (diagnostico && texto(tema.titulo).toLocaleLowerCase('pt-BR') === texto(diagnostico.titulo).toLocaleLowerCase('pt-BR')) return false;
    return true;
  });

  const codigosExcluir = validosExistentes.map((c) => texto(c.temaId?.codigoBanco)).filter(Boolean);
  const faltam = Math.max(0, quantidadeDesejada - validosExistentes.length);
  const selecionados = selecionarTemasDoMes(data, faltam, codigosExcluir);
  const criados = [];

  for (let i = 0; i < selecionados.length; i += 1) {
    const ordem = validosExistentes.length + i + 1;
    const tema = await garantirTemaMensal({ instituicao, base: selecionados[i], mesRef, ordem, criadoPor });
    const ciclo = await garantirCicloMensal({ instituicao, tema, mesRef, ordem, criadoPor });
    criados.push(ciclo);
  }

  const finais = await RedacaoCiclo.find({
    ...fInst,
    modalidade: 'trilha_orientada',
    natureza: 'formativo',
    status: 'ativo',
    $and: [
      { $or: [{ dataInicio: null }, { dataInicio: { $exists: false } }, { dataInicio: { $lte: data } }] },
      { $or: [{ dataFim: null }, { dataFim: { $exists: false } }, { dataFim: { $gte: data } }] }
    ]
  }).populate('temaId').sort({ geradoAutomaticamente: 1, ordemMensal: 1, createdAt: 1 }).lean();

  const semDiagnostico = finais.filter((c) => {
    const tema = c.temaId || {};
    return texto(tema.codigoBanco) !== CODIGO_TEMA_DIAGNOSTICO &&
      (!diagnostico || String(tema._id || '') !== String(diagnostico._id)) &&
      (!diagnostico || texto(tema.titulo).toLocaleLowerCase('pt-BR') !== texto(diagnostico.titulo).toLocaleLowerCase('pt-BR'));
  });

  return {
    mesReferencia: mesRef,
    quantidadeDesejada,
    ciclos: semDiagnostico,
    criados: criados.length
  };
}

module.exports = {
  GRADE_REFERENCIA,
  QTD_TEMAS_MENSAIS,
  mesReferencia,
  selecionarTemasDoMes,
  garantirRedacoesMensais
};
