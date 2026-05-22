'use strict';

const express = require('express');
const mongoose = require('mongoose');

const RedacaoTema = require('../../models/RedacaoTema');
const RedacaoEnem = require('../../models/RedacaoEnem');
const { limparTexto, contarPalavras, corrigirRedacaoEnem } = require('../../services/redacaoEnemService');
const { autenticar } = require('../../middleware/autenticacao');
const multer = require('multer');
const { uploadFotoRedacao } = require('../../utils/s3RedacaoUpload');

const router = express.Router();

const uploadRedacao = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 8 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Envie apenas imagens.'));
    }

    cb(null, true);
  }
});

/* =========================
   HELPERS
   ========================= */
function toObjectIdSeValido(valor) {
  if (!valor) return valor;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  if (mongoose.Types.ObjectId.isValid(valor)) return new mongoose.Types.ObjectId(valor);
  return valor;
}

function normalizarTexto(s) {
  return String(s || '').trim();
}

function getUsuarioReq(req) {
  return req.usuario || null;
}

function getAlunoId(req) {
  const u = getUsuarioReq(req);
  return u?.alunoId || u?._id || u?.id || null;
}

function getUsuarioId(req) {
  const u = getUsuarioReq(req);
  return u?._id || u?.id || null;
}

function getTurmaId(req) {
  const u = getUsuarioReq(req);
  return u?.turma || u?.turmaId || null;
}

function getInstituicaoRaw(req) {
  const u = getUsuarioReq(req);

  return (
    req.query?.t ||
    req.query?.tenant ||
    req.tenantSlug ||
    req.instituicaoId ||
    req.tenantId ||
    u?.instituicao ||
    u?.instituicaoId ||
    null
  );
}

function getInstituicaoRawValue(v) {
  if (!v) return null;
  if (typeof v === 'object') {
    if (v._id) return v._id;
    if (v.id) return v.id;
    if (v.slug) return v.slug;
  }
  return v;
}

/**
 * Tenta casar instituição tanto por ObjectId quanto por string/slug.
 */
function buildInstituicaoMatch(instituicaoRaw) {
  const valor = getInstituicaoRawValue(instituicaoRaw);

  if (!valor) return null;

  const candidatos = [];
  const texto = String(valor).trim();

  if (texto) candidatos.push(texto);

  if (mongoose.Types.ObjectId.isValid(texto)) {
    candidatos.push(new mongoose.Types.ObjectId(texto));
  }

  return { instituicao: { $in: candidatos } };
}

function isAdminLike(req) {
  const u = getUsuarioReq(req) || {};
  const role = String(u.tipo || u.perfil || u.role || u.cargo || '').toLowerCase();
  return role.includes('admin') || role.includes('coord') || role.includes('dire');
}

function isProfessorLike(req) {
  const u = getUsuarioReq(req) || {};
  const role = String(u.tipo || u.perfil || u.role || u.cargo || '').toLowerCase();
  return role.includes('prof');
}

function respostaErro(res, status, erro, extra = {}) {
  return res.status(status).json({ ok: false, erro, ...extra });
}

function formatarTemaResponse(tema) {
  if (!tema) return null;

  return {
    _id: tema._id,
    titulo: tema.titulo,
    proposta: tema.proposta,
    eixoTematico: tema.eixoTematico || 'Redação ENEM',
    palavrasChave: Array.isArray(tema.palavrasChave) ? tema.palavrasChave : [],
    textosMotivadores: Array.isArray(tema.textosMotivadores) ? tema.textosMotivadores : [],
    tempoSugeridoMinutos: Number(tema.tempoSugeridoMinutos) || 60,
    minimoPalavras: Number(tema.minimoPalavras) || 120,
    maximoPalavras: Number(tema.maximoPalavras) || 400,
    status: tema.status || 'ativo',
    dataInicio: tema.dataInicio || null,
    dataFim: tema.dataFim || null,
    createdAt: tema.createdAt || null,
    updatedAt: tema.updatedAt || null
  };
}

function getMesReferencia(date = new Date()) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function getInicioMesAtual() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
}

function getFimMesAtual() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
}

function extrairFocoPrincipal(correcaoIA) {
  if (!correcaoIA) return '';

  if (normalizarTexto(correcaoIA.focoPrincipal)) {
    return normalizarTexto(correcaoIA.focoPrincipal);
  }

  const pontos = Array.isArray(correcaoIA.pontosMelhorar) ? correcaoIA.pontosMelhorar : [];
  return normalizarTexto(pontos[0] || '');
}

function extrairPlanoEstudo(correcaoIA) {
  if (!correcaoIA) return [];

  if (Array.isArray(correcaoIA.planoEstudoSugerido) && correcaoIA.planoEstudoSugerido.length) {
    return correcaoIA.planoEstudoSugerido.map(normalizarTexto).filter(Boolean);
  }

  const recomendacoes = Array.isArray(correcaoIA.recomendacoes) ? correcaoIA.recomendacoes : [];
  return recomendacoes.map(normalizarTexto).filter(Boolean).slice(0, 5);
}

function formatarResumoMensal(usadas, limite) {
  return {
    usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    atingiuLimite: usadas >= limite
  };
}

/* =========================
   AUTH
   ========================= */
router.use(autenticar);

/* =========================
   GET /api/redacao/tema/ativo
   Tema ativo da instituição
   ========================= */
router.get('/tema/ativo', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    if (!matchInstituicao) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    const agora = new Date();

    const tema = await RedacaoTema.findOne({
      ...matchInstituicao,
      status: 'ativo',
      $and: [
        {
          $or: [
            { dataInicio: null },
            { dataInicio: { $exists: false } },
            { dataInicio: { $lte: agora } }
          ]
        },
        {
          $or: [
            { dataFim: null },
            { dataFim: { $exists: false } },
            { dataFim: { $gte: agora } }
          ]
        }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      tema: formatarTemaResponse(tema)
    });
  } catch (error) {
    console.error('GET /api/redacao/tema/ativo:', error);
    return respostaErro(res, 500, 'Erro ao buscar tema ativo.');
  }
});

/* =========================
   GET /api/redacao/resumo-mensal
   Controle das 2 redações por mês
   ========================= */
router.get('/resumo-mensal', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!alunoId) {
      return respostaErro(res, 400, 'Aluno não identificado.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);
    const inicioMes = getInicioMesAtual();
    const fimMes = getFimMesAtual();
    const limiteMensal = 2;

    const usadas = await RedacaoEnem.countDocuments({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId),
      createdAt: { $gte: inicioMes, $lte: fimMes }
    });

    return res.json({
      ok: true,
      resumoMensal: formatarResumoMensal(usadas, limiteMensal),
      periodo: {
        inicio: inicioMes,
        fim: fimMes,
        mesReferencia: getMesReferencia(inicioMes)
      }
    });
  } catch (error) {
    console.error('GET /api/redacao/resumo-mensal:', error);
    return respostaErro(res, 500, 'Erro ao carregar resumo mensal.');
  }
});

/* =========================
   GET /api/redacao/historico
   Histórico do aluno logado
   ========================= */
router.get('/historico', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!alunoId) {
      return respostaErro(res, 400, 'Aluno não identificado.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const historico = await RedacaoEnem.find({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select({
        temaTituloSnapshot: 1,
        quantidadePalavras: 1,
        tempoGastoSegundos: 1,
        status: 1,
        tentativa: 1,
        createdAt: 1,
        correcaoIA: 1,
        apoioProfessor: 1,
        mesReferencia: 1
      })
      .lean();

    return res.json({
      ok: true,
      historico: Array.isArray(historico)
        ? historico.map((item) => ({
            ...item,
            focoPrincipal: extrairFocoPrincipal(item.correcaoIA),
            planoEstudoSugerido: extrairPlanoEstudo(item.correcaoIA)
          }))
        : []
    });
  } catch (error) {
    console.error('GET /api/redacao/historico:', error);
    return respostaErro(res, 500, 'Erro ao carregar histórico de redações.');
  }
});

/* =========================
   GET /api/redacao/:id
   Buscar redação específica do aluno
   ========================= */
router.get('/:id', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const redacaoId = req.params.id;

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!alunoId) {
      return respostaErro(res, 400, 'Aluno não identificado.');
    }

    if (!mongoose.Types.ObjectId.isValid(redacaoId)) {
      return respostaErro(res, 400, 'ID da redação inválido.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const redacao = await RedacaoEnem.findOne({
      _id: new mongoose.Types.ObjectId(redacaoId),
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    }).lean();

    if (!redacao) {
      return respostaErro(res, 404, 'Redação não encontrada.');
    }

    return res.json({
      ok: true,
      redacao: {
        ...redacao,
        focoPrincipal: extrairFocoPrincipal(redacao.correcaoIA),
        planoEstudoSugerido: extrairPlanoEstudo(redacao.correcaoIA)
      }
    });
  } catch (error) {
    console.error('GET /api/redacao/:id:', error);
    return respostaErro(res, 500, 'Erro ao buscar redação.');
  }
});

/* =========================
   POST /api/redacao/enviar
   Envio da redação + correção IA
   Limite: 2 redações por mês
   ========================= */
router.post(
  '/enviar',
  uploadRedacao.single('fotoManuscrita'),
  async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const usuarioAlunoId = getUsuarioId(req);
    const turmaId = getTurmaId(req);

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!alunoId) {
      return respostaErro(res, 400, 'Aluno não identificado.');
    }

    const {
      temaId,
      texto,
      tempoGastoSegundos = 0,
      cronometroUtilizado = false
    } = req.body || {};

    let fotoManuscrita = null;

if (req.file) {
  const tenantId =
    req.instituicaoId ||
    req.tenantId ||
    req.usuario?.instituicao ||
    req.usuario?.instituicaoId ||
    req.query?.t ||
    'sem-tenant';

  fotoManuscrita = await uploadFotoRedacao({
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    tenantId,
    alunoId
  });
}

    if (!temaId || !mongoose.Types.ObjectId.isValid(temaId)) {
      return respostaErro(res, 400, 'Tema inválido.');
    }

    const textoNormalizado = limparTexto(texto);
    const quantidadePalavras = contarPalavras(textoNormalizado);

    if (!textoNormalizado) {
      return respostaErro(res, 400, 'A redação está vazia.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);
    const inicioMes = getInicioMesAtual();
    const fimMes = getFimMesAtual();
    const limiteMensal = 2;

    const usadasNoMes = await RedacaoEnem.countDocuments({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId),
      createdAt: { $gte: inicioMes, $lte: fimMes }
    });

    if (usadasNoMes >= limiteMensal) {
      return respostaErro(
        res,
        400,
        'Você já utilizou suas 2 redações deste mês.',
        {
          resumoMensal: formatarResumoMensal(usadasNoMes, limiteMensal)
        }
      );
    }

    const tema = await RedacaoTema.findOne({
      _id: new mongoose.Types.ObjectId(temaId),
      ...matchInstituicao,
      status: 'ativo'
    }).lean();

    if (!tema) {
      return respostaErro(res, 404, 'Tema não encontrado ou indisponível.');
    }

    const minimoPalavras = Number(tema.minimoPalavras) || 120;
    const maximoPalavras = Number(tema.maximoPalavras) || 400;

    if (quantidadePalavras < minimoPalavras) {
      return respostaErro(
        res,
        400,
        `A redação precisa ter pelo menos ${minimoPalavras} palavras.`
      );
    }

    if (maximoPalavras > 0 && quantidadePalavras > maximoPalavras * 4) {
      return respostaErro(
        res,
        400,
        'A redação ultrapassou o limite operacional permitido para envio.'
      );
    }

    const ultimaTentativa = await RedacaoEnem.findOne({
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId),
      temaId: tema._id
    })
      .sort({ tentativa: -1, createdAt: -1 })
      .select({ tentativa: 1 })
      .lean();

    const tentativa = (Number(ultimaTentativa?.tentativa) || 0) + 1;

    const payload = {
      instituicao: getInstituicaoRawValue(instituicaoRaw),
      aluno: toObjectIdSeValido(alunoId),
      usuarioAluno: usuarioAlunoId ? toObjectIdSeValido(usuarioAlunoId) : null,
      turma: turmaId ? toObjectIdSeValido(turmaId) : null,
      temaId: tema._id,
      temaTituloSnapshot: normalizarTexto(tema.titulo),
      propostaSnapshot: normalizarTexto(tema.proposta),
      texto: textoNormalizado,
      textoNormalizado,
      quantidadePalavras,
      tempoGastoSegundos: Math.max(0, Number(tempoGastoSegundos) || 0),
      cronometroUtilizado: Boolean(cronometroUtilizado),
      fotoManuscrita: fotoManuscrita ? {
  key: fotoManuscrita.key,
  url: fotoManuscrita.url,
  bucket: fotoManuscrita.bucket,
  originalname: req.file?.originalname,
  mimetype: req.file?.mimetype,
  size: req.file?.size,
  enviadaEm: new Date()
} : null,

evidenciaAutoria: {
  fotoManuscritaInformada: !!fotoManuscrita,
  colagensDetectadas: Number(req.body.colagensDetectadas || 0),
  colagemGrandeDetectada:
    String(req.body.colagemGrandeDetectada) === 'true',
  cronometroUtilizado:
    String(req.body.cronometroUtilizado) === 'true'
},
      status: 'corrigindo_ia',
      tentativa,
      mesReferencia: getMesReferencia()
    };

    const redacao = await RedacaoEnem.create(payload);

    try {
      const correcaoIA = await corrigirRedacaoEnem({
        temaTitulo: tema.titulo,
        proposta: tema.proposta,
        textosMotivadores: Array.isArray(tema.textosMotivadores) ? tema.textosMotivadores : [],
        redacaoAluno: textoNormalizado
      });

      const focoPrincipal = extrairFocoPrincipal(correcaoIA);
      const planoEstudoSugerido = extrairPlanoEstudo(correcaoIA);

      redacao.correcaoIA = {
        ...correcaoIA,
        focoPrincipal,
        planoEstudoSugerido
      };

      redacao.status = 'corrigida';
      redacao.erroCorrecao = '';
      await redacao.save();
    } catch (erroIA) {
      console.error('Erro ao corrigir redação com IA:', erroIA);
      redacao.status = 'erro_correcao';
      redacao.erroCorrecao = String(erroIA.message || erroIA);
      await redacao.save();
    }

    const redacaoAtualizada = await RedacaoEnem.findById(redacao._id).lean();

    const usadasDepoisDoEnvio = usadasNoMes + 1;

    return res.status(201).json({
      ok: true,
      mensagem: 'Redação enviada com sucesso.',
      redacao: {
        ...redacaoAtualizada,
        focoPrincipal: extrairFocoPrincipal(redacaoAtualizada?.correcaoIA),
        planoEstudoSugerido: extrairPlanoEstudo(redacaoAtualizada?.correcaoIA)
      },
      resumoMensal: formatarResumoMensal(usadasDepoisDoEnvio, limiteMensal)
    });
  } catch (error) {
    console.error('POST /api/redacao/enviar:', error);
    return respostaErro(res, 500, 'Erro ao enviar redação.');
  }
});

/* =========================
   POST /api/redacao/:id/solicitar-apoio
   Aluno pede orientação curta do professor
   ========================= */
router.post('/:id/solicitar-apoio', async (req, res) => {
  try {
    const instituicaoRaw = getInstituicaoRaw(req);
    const alunoId = getAlunoId(req);
    const redacaoId = req.params.id;
    const { focoTema } = req.body || {};

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!alunoId) {
      return respostaErro(res, 400, 'Aluno não identificado.');
    }

    if (!mongoose.Types.ObjectId.isValid(redacaoId)) {
      return respostaErro(res, 400, 'ID da redação inválido.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const redacao = await RedacaoEnem.findOne({
      _id: new mongoose.Types.ObjectId(redacaoId),
      ...matchInstituicao,
      aluno: toObjectIdSeValido(alunoId)
    });

    if (!redacao) {
      return respostaErro(res, 404, 'Redação não encontrada.');
    }

    const focoFinal = normalizarTexto(focoTema) || extrairFocoPrincipal(redacao.correcaoIA);

    redacao.apoioProfessor = {
      ...(redacao.apoioProfessor || {}),
      solicitado: true,
      status: 'solicitado',
      focoTema: focoFinal
    };

    redacao.status = 'apoio_professor_solicitado';

    await redacao.save();

    return res.json({
      ok: true,
      mensagem: 'Solicitação de apoio registrada com sucesso.',
      redacao: {
        ...redacao.toObject(),
        focoPrincipal: extrairFocoPrincipal(redacao.correcaoIA),
        planoEstudoSugerido: extrairPlanoEstudo(redacao.correcaoIA)
      }
    });
  } catch (error) {
    console.error('POST /api/redacao/:id/solicitar-apoio:', error);
    return respostaErro(res, 500, 'Erro ao solicitar apoio do professor.');
  }
});

/* =========================
   POST /api/redacao/:id/responder-apoio
   Professor/admin responde de forma objetiva
   ========================= */
router.post('/:id/responder-apoio', async (req, res) => {
  try {
    if (!isProfessorLike(req) && !isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    const redacaoId = req.params.id;
    const usuario = getUsuarioReq(req);
    const { observacaoProfessor } = req.body || {};

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    if (!mongoose.Types.ObjectId.isValid(redacaoId)) {
      return respostaErro(res, 400, 'ID da redação inválido.');
    }

    const textoObservacao = normalizarTexto(observacaoProfessor);
    if (!textoObservacao) {
      return respostaErro(res, 400, 'Escreva uma orientação para o aluno.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const redacao = await RedacaoEnem.findOne({
      _id: new mongoose.Types.ObjectId(redacaoId),
      ...matchInstituicao
    });

    if (!redacao) {
      return respostaErro(res, 404, 'Redação não encontrada.');
    }

    redacao.apoioProfessor = {
      ...(redacao.apoioProfessor || {}),
      solicitado: true,
      status: 'respondido',
      observacaoProfessor: textoObservacao,
      professorId: usuario?._id || usuario?.id || null,
      professorNome: usuario?.nome || '',
      respondidoEm: new Date()
    };

    redacao.status = 'apoio_professor_respondido';

    await redacao.save();

    return res.json({
      ok: true,
      mensagem: 'Orientação registrada com sucesso.',
      redacao: {
        ...redacao.toObject(),
        focoPrincipal: extrairFocoPrincipal(redacao.correcaoIA),
        planoEstudoSugerido: extrairPlanoEstudo(redacao.correcaoIA)
      }
    });
  } catch (error) {
    console.error('POST /api/redacao/:id/responder-apoio:', error);
    return respostaErro(res, 500, 'Erro ao registrar orientação.');
  }
});

/* =========================
   GET /api/redacao/apoios/pendentes
   Lista leve para professor/admin
   ========================= */
router.get('/apoios/pendentes', async (req, res) => {
  try {
    if (!isProfessorLike(req) && !isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const lista = await RedacaoEnem.find({
      ...matchInstituicao,
      'apoioProfessor.status': 'solicitado'
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select({
        aluno: 1,
        turma: 1,
        temaTituloSnapshot: 1,
        createdAt: 1,
        apoioProfessor: 1,
        correcaoIA: 1,
        status: 1
      })
      .lean();

    return res.json({
      ok: true,
      pendentes: Array.isArray(lista)
        ? lista.map((item) => ({
            ...item,
            focoPrincipal: extrairFocoPrincipal(item.correcaoIA)
          }))
        : []
    });
  } catch (error) {
    console.error('GET /api/redacao/apoios/pendentes:', error);
    return respostaErro(res, 500, 'Erro ao listar apoios pendentes.');
  }
});

/* =========================
   POST /api/redacao/tema
   Criar tema (admin/coord)
   ========================= */
router.post('/tema', async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    const usuario = getUsuarioReq(req);

    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    const {
      titulo,
      proposta,
      eixoTematico,
      palavrasChave,
      textosMotivadores,
      tempoSugeridoMinutos,
      minimoPalavras,
      maximoPalavras,
      status,
      dataInicio,
      dataFim
    } = req.body || {};

    if (!normalizarTexto(titulo)) {
      return respostaErro(res, 400, 'Título do tema é obrigatório.');
    }

    if (!normalizarTexto(proposta)) {
      return respostaErro(res, 400, 'Proposta do tema é obrigatória.');
    }

    const tema = await RedacaoTema.create({
      instituicao: getInstituicaoRawValue(instituicaoRaw),
      titulo: normalizarTexto(titulo),
      proposta: normalizarTexto(proposta),
      eixoTematico: normalizarTexto(eixoTematico) || 'Redação ENEM',
      palavrasChave: Array.isArray(palavrasChave) ? palavrasChave.map(normalizarTexto).filter(Boolean) : [],
      textosMotivadores: Array.isArray(textosMotivadores)
        ? textosMotivadores.map((t) => ({
            titulo: normalizarTexto(t?.titulo),
            conteudo: normalizarTexto(t?.conteudo),
            fonte: normalizarTexto(t?.fonte)
          }))
        : [],
      tempoSugeridoMinutos: Number(tempoSugeridoMinutos) || 60,
      minimoPalavras: Number(minimoPalavras) || 120,
      maximoPalavras: Number(maximoPalavras) || 400,
      status: ['ativo', 'inativo', 'arquivado'].includes(status) ? status : 'ativo',
      dataInicio: dataInicio ? new Date(dataInicio) : null,
      dataFim: dataFim ? new Date(dataFim) : null,
      criadoPor: usuario?._id || usuario?.id || null
    });

    return res.status(201).json({
      ok: true,
      mensagem: 'Tema criado com sucesso.',
      tema: formatarTemaResponse(tema.toObject())
    });
  } catch (error) {
    console.error('POST /api/redacao/tema:', error);
    return respostaErro(res, 500, 'Erro ao criar tema.');
  }
});

/* =========================
   GET /api/redacao/temas
   Lista temas da instituição (admin/coord)
   ========================= */
router.get('/temas', async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return respostaErro(res, 403, 'Acesso negado.');
    }

    const instituicaoRaw = getInstituicaoRaw(req);
    if (!instituicaoRaw) {
      return respostaErro(res, 400, 'Instituição não identificada.');
    }

    const matchInstituicao = buildInstituicaoMatch(instituicaoRaw);

    const temas = await RedacaoTema.find(matchInstituicao)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      temas: Array.isArray(temas) ? temas.map(formatarTemaResponse) : []
    });
  } catch (error) {
    console.error('GET /api/redacao/temas:', error);
    return respostaErro(res, 500, 'Erro ao listar temas.');
  }
});

module.exports = router;