'use strict';

const mongoose = require('mongoose');
const RedacaoTema = require('../../models/RedacaoTema');
const RedacaoCiclo = require('../../models/RedacaoCiclo');

const CODIGO_TEMA_DIAGNOSTICO = 'AXR-DIAG-ENEM-2025-01';
const NOME_CICLO_DIAGNOSTICO = 'Diagnóstico inicial ENEM 2025';
const GRADE_REFERENCIA = 'ENEM-2025-grade-especifica-v5-calibrada';

function texto(v) {
  return String(v || '').trim();
}

function valor(v) {
  return v && typeof v === 'object' ? (v._id || v.id || v.slug || v) : v;
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

function temaPadrao(instituicao, criadoPor = null) {
  return {
    instituicao: valor(instituicao),
    codigoBanco: CODIGO_TEMA_DIAGNOSTICO,
    titulo: 'Desafios para o uso ético da inteligência artificial na educação brasileira',
    proposta:
      'Redija um texto dissertativo-argumentativo, em modalidade escrita formal da língua portuguesa, sobre o tema “Desafios para o uso ético da inteligência artificial na educação brasileira”, apresentando proposta de intervenção que respeite os direitos humanos. Selecione, organize e relacione argumentos e fatos para defender seu ponto de vista.',
    eixoTematico: 'Educação e tecnologia',
    palavrasChave: [
      'inteligência artificial',
      'educação',
      'ética',
      'autonomia',
      'privacidade'
    ],
    textosMotivadores: [
      {
        titulo: 'Tecnologia centrada no ser humano',
        conteudo:
          'A adoção de inteligência artificial na educação deve preservar a agência humana, a inclusão, a segurança e a formação crítica de estudantes e professores.',
        fonte: 'UNESCO — Guidance for generative AI in education and research',
        fonteUrl: 'https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research',
        acessadoEm: 'julho de 2026',
        tipo: 'conceito'
      },
      {
        titulo: 'Formação e regras institucionais',
        conteudo:
          'O uso pedagógico responsável exige políticas claras, capacitação docente e critérios para transparência, proteção de dados e avaliação das ferramentas.',
        fonte: 'UNESCO — Guidance for generative AI in education and research',
        fonteUrl: 'https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research',
        acessadoEm: 'julho de 2026',
        tipo: 'estudo'
      },
      {
        titulo: 'Autoria e aprendizagem',
        conteudo:
          'Ferramentas generativas podem apoiar estudo e revisão, mas o processo de aprendizagem precisa preservar a participação intelectual e a autoria do estudante.',
        fonte: 'UNESCO — Guidance for generative AI in education and research',
        fonteUrl: 'https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research',
        acessadoEm: 'julho de 2026',
        tipo: 'conceito'
      }
    ],
    modalidade: 'trilha_orientada',
    destaquePraticaLivre: false,
    ordemPraticaLivre: 0,
    turmasDestinadas: [],
    publicoAlvo: 'Ensino Médio',
    orientacoesProfessor:
      'Tema diagnóstico institucional do Axoriin. Não é apresentado como tema oficial do Enem. Utilizar apenas para estabelecer o ponto de partida do estudante nas cinco competências.',
    tempoSugeridoMinutos: 70,
    minimoPalavras: 120,
    maximoPalavras: 450,
    status: 'inativo',
    dataInicio: new Date(),
    dataFim: null,
    criadoPor
  };
}

async function garantirTemaDiagnostico({ instituicao, criadoPor = null }) {
  const fInst = filtroInstituicao(instituicao);
  if (!fInst) throw new Error('Instituição não identificada para o diagnóstico.');

  let tema = await RedacaoTema.findOne({
    ...fInst,
    codigoBanco: CODIGO_TEMA_DIAGNOSTICO
  });

  if (!tema) {
    try {
      tema = await RedacaoTema.create(temaPadrao(instituicao, criadoPor));
    } catch (e) {
      // Proteção simples contra duas aberturas simultâneas do diagnóstico.
      if (e?.code !== 11000) throw e;
      tema = await RedacaoTema.findOne({
        ...fInst,
        codigoBanco: CODIGO_TEMA_DIAGNOSTICO
      });
      if (!tema) throw e;
    }
  } else {
    let alterou = false;
    if (tema.status === 'arquivado') {
      tema.status = 'inativo';
      alterou = true;
    }
    if (tema.modalidade !== 'trilha_orientada') {
      tema.modalidade = 'trilha_orientada';
      alterou = true;
    }
    if (alterou) await tema.save();
  }

  return tema;
}

async function garantirCicloDiagnostico({ instituicao, temaId, criadoPor = null }) {
  const fInst = filtroInstituicao(instituicao);
  if (!fInst) throw new Error('Instituição não identificada para o diagnóstico.');

  let ciclo = await RedacaoCiclo.findOne({
    ...fInst,
    modalidade: 'trilha_orientada',
    natureza: 'diagnostico',
    nome: NOME_CICLO_DIAGNOSTICO
  }).sort({ updatedAt: -1, createdAt: -1 });

  if (!ciclo) {
    ciclo = await RedacaoCiclo.create({
      instituicao: valor(instituicao),
      nome: NOME_CICLO_DIAGNOSTICO,
      modalidade: 'trilha_orientada',
      natureza: 'diagnostico',
      gradeReferencia: GRADE_REFERENCIA,
      temaId,
      turmasDestinadas: [],
      publicoAlvo: 'Ensino Médio',
      status: 'ativo',
      dataInicio: new Date(),
      dataFim: null,
      maxEnviosPorAluno: 1,
      permiteReescrita: false,
      assistenteDuranteEscrita: false,
      cronometroObrigatorio: false,
      tempoLimiteMinutos: 90,
      mostrarTextosMotivadores: true,
      instrucoesAluno:
        'Esta é sua produção diagnóstica. Faça o texto com autonomia. O apoio automático durante a escrita fica desativado para que o resultado represente seu ponto de partida real.',
      criadoPor,
      atualizadoPor: criadoPor
    });
  } else {
    ciclo.temaId = temaId;
    ciclo.gradeReferencia = GRADE_REFERENCIA;
    ciclo.status = 'ativo';
    ciclo.dataInicio = ciclo.dataInicio || new Date();
    ciclo.dataFim = null;
    ciclo.maxEnviosPorAluno = 1;
    ciclo.permiteReescrita = false;
    ciclo.assistenteDuranteEscrita = false;
    ciclo.cronometroObrigatorio = false;
    ciclo.tempoLimiteMinutos = 90;
    ciclo.mostrarTextosMotivadores = true;
    ciclo.atualizadoPor = criadoPor;
    await ciclo.save();
  }

  return ciclo;
}

async function garantirDiagnostico({ instituicao, criadoPor = null }) {
  const tema = await garantirTemaDiagnostico({ instituicao, criadoPor });
  const ciclo = await garantirCicloDiagnostico({
    instituicao,
    temaId: tema._id,
    criadoPor
  });

  return {
    tema: tema.toObject ? tema.toObject() : tema,
    ciclo: ciclo.toObject ? ciclo.toObject() : ciclo
  };
}

module.exports = {
  CODIGO_TEMA_DIAGNOSTICO,
  NOME_CICLO_DIAGNOSTICO,
  GRADE_REFERENCIA,
  garantirDiagnostico,
  garantirTemaDiagnostico,
  garantirCicloDiagnostico
};
