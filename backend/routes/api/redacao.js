'use strict';

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const RedacaoTema = require('../../models/RedacaoTema');
const RedacaoCiclo = require('../../models/RedacaoCiclo');
const RedacaoEnem = require('../../models/RedacaoEnem');
const { limparTexto, contarPalavras, corrigirRedacaoEnem } = require('../../services/redacaoEnemService');
const { analisarIntegridade } = require('../../services/redacaoIntegridadeService');
const { autenticar } = require('../../middleware/autenticacao');
const { uploadFotoRedacao } = require('../../utils/s3RedacaoUpload');

const router = express.Router();
const uploadRedacao = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => file.mimetype?.startsWith('image/') ? cb(null, true) : cb(new Error('Envie apenas imagens.'))
});

function t(v) { return String(v || '').trim(); }
function oid(v) { if (!v) return v; if (v instanceof mongoose.Types.ObjectId) return v; return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v; }
function usuario(req) { return req.usuario || {}; }
function alunoId(req) { const u = usuario(req); return u.alunoId || (u.tipo === 'aluno' ? (u._id || u.id) : null); }
function usuarioId(req) { const u = usuario(req); return u._id || u.id || null; }
function turmaId(req) { const u = usuario(req); return u.turma || u.turmaId || (Array.isArray(u.turmas) ? u.turmas[0] : null) || null; }
function instituicaoRaw(req) {
  const u = usuario(req);

  // A instituição da sessão autenticada é a fonte de verdade.
  // O slug ?t=... serve apenas para navegação visual e nunca deve
  // substituir o tenant validado no token.
  return (
    u.instituicao ||
    u.tenantId ||
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.query?.tenantId ||
    req.query?.t ||
    req.query?.tenant ||
    req.tenantSlug ||
    null
  );
}
function valor(v) { if (v && typeof v === 'object') return v._id || v.id || v.slug || v; return v; }
function matchInstituicao(v) { const x = valor(v); if (!x) return null; const a = [String(x)]; if (mongoose.Types.ObjectId.isValid(x)) a.push(new mongoose.Types.ObjectId(x)); return { instituicao: { $in: a } }; }

function adicionarCandidato(lista, candidato) {
  if (
    candidato === null ||
    candidato === undefined ||
    String(candidato).trim() === ''
  ) {
    return;
  }

  const texto = String(valor(candidato)).trim();

  if (!lista.some((item) => String(item) === texto)) {
    lista.push(texto);
  }

  if (
    mongoose.Types.ObjectId.isValid(texto) &&
    !lista.some(
      (item) =>
        item instanceof mongoose.Types.ObjectId &&
        String(item) === texto
    )
  ) {
    lista.push(new mongoose.Types.ObjectId(texto));
  }
}

function candidatosInstituicaoHistorico(req) {
  const candidatos = [];

  // Formato atual: instituição confirmada pela sessão autenticada.
  adicionarCandidato(candidatos, instituicaoRaw(req));

  // Compatibilidade com redações antigas que receberam o slug visual.
  adicionarCandidato(candidatos, req.query?.t);
  adicionarCandidato(candidatos, req.query?.tenant);
  adicionarCandidato(candidatos, req.tenantSlug);
  adicionarCandidato(candidatos, req.tenant?.slug);

  return candidatos;
}

function matchInstituicaoHistorico(req) {
  const candidatos = candidatosInstituicaoHistorico(req);

  if (!candidatos.length) return null;

  return {
    instituicao: {
      $in: candidatos
    }
  };
}

function candidatosAlunoHistorico(req) {
  const candidatos = [];
  adicionarCandidato(candidatos, alunoId(req));
  return candidatos;
}

function matchAlunoHistorico(req) {
  const candidatos = candidatosAlunoHistorico(req);

  if (!candidatos.length) return null;

  return {
    aluno: {
      $in: candidatos
    }
  };
}
function isAdmin(req) { const r = t(usuario(req).tipo || usuario(req).perfil || usuario(req).role).toLowerCase(); return ['admin','master','superadmin','coordenador','coordenacao','diretor','direcao'].some(x => r.includes(x)); }
function isProfessor(req) { return t(usuario(req).tipo || usuario(req).perfil || usuario(req).role).toLowerCase().includes('prof'); }
function acessoGestaoRedacao(req) {
  return isAdmin(req) || isProfessor(req);
}

function acessoRedacao(req) {
  return acessoGestaoRedacao(req);
}
function erro(res, status, mensagem, extra = {}) { return res.status(status).json({ ok: false, erro: mensagem, ...extra }); }
function mesRef(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function inicioMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }
function fimMes() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 1); }
function limiteMensal() {
  return Math.max(1, Number(process.env.REDACAO_LIMITE_MENSAL) || 2);
}

function limitePraticaLivre() {
  return Math.max(
    0,
    Number(process.env.REDACAO_PRATICA_LIVRE_LIMITE_MENSAL) || 2
  );
}
function resumo(usadas) { const limite = limiteMensal(); return { usadas, limite, restantes: Math.max(0, limite-usadas), atingiuLimite: usadas >= limite }; }
function formatarTema(x) {
  if (!x) return null;

  return {
    _id: x._id,
    codigoBanco: x.codigoBanco || '',
    titulo: x.titulo,
    proposta: x.proposta,
    eixoTematico: x.eixoTematico || 'Redação ENEM',
    palavrasChave: x.palavrasChave || [],
    textosMotivadores: x.textosMotivadores || [],
    modalidade: x.modalidade || 'trilha_orientada',
    destaquePraticaLivre: Boolean(x.destaquePraticaLivre),
    ordemPraticaLivre: Number(x.ordemPraticaLivre) || 0,
    tempoSugeridoMinutos: Number(x.tempoSugeridoMinutos) || 60,
    minimoPalavras: Math.max(120, Number(x.minimoPalavras) || 120),
    maximoPalavras: Math.max(300, Number(x.maximoPalavras) || 450),
    status: x.status,
    dataInicio: x.dataInicio || null,
    dataFim: x.dataFim || null
  };
}

function formatarCiclo(x) {
  if (!x) return null;

  const tema = x.temaId && typeof x.temaId === 'object'
    ? formatarTema(x.temaId)
    : null;

  return {
    _id: x._id,
    nome: x.nome,
    modalidade: x.modalidade,
    temaId: tema || x.temaId,
    tema,
    turmasDestinadas: x.turmasDestinadas || [],
    publicoAlvo: x.publicoAlvo || 'Ensino Médio',
    status: x.status,
    dataInicio: x.dataInicio || null,
    dataFim: x.dataFim || null,
    maxEnviosPorAluno: Number(x.maxEnviosPorAluno) || 1,
    permiteReescrita: Boolean(x.permiteReescrita),
    assistenteDuranteEscrita: x.assistenteDuranteEscrita !== false,
    cronometroObrigatorio: Boolean(x.cronometroObrigatorio),
    tempoLimiteMinutos: Number(x.tempoLimiteMinutos) || 60,
    mostrarTextosMotivadores: x.mostrarTextosMotivadores !== false,
    instrucoesAluno: x.instrucoesAluno || ''
  };
}
function plano(c) { return Array.isArray(c?.planoEstudoSugerido) ? c.planoEstudoSugerido : []; }
function foco(c) { return t(c?.focoPrincipal || c?.pontosMelhorar?.[0]); }
async function usadasMes(req) {
  const m = matchInstituicaoHistorico(req);
  const a = matchAlunoHistorico(req);

  if (!m || !a) return 0;

  return RedacaoEnem.countDocuments({
    ...m,
    ...a,
    createdAt: {
      $gte: inicioMes(),
      $lt: fimMes()
    }
  });
}
function turmaCandidates(req) { const x=turmaId(req); const a=[]; if(x){a.push(String(x)); if(mongoose.Types.ObjectId.isValid(x)) a.push(new mongoose.Types.ObjectId(x));} return a; }
function temaTurmaMatch(req) { const a=turmaCandidates(req); return a.length ? { $or:[{turmasDestinadas:{$exists:false}},{turmasDestinadas:{$size:0}},{turmasDestinadas:{$in:a}}] } : { $or:[{turmasDestinadas:{$exists:false}},{turmasDestinadas:{$size:0}}] }; }
function publicRedacao(r) {
  return {
    ...r,
    focoPrincipal: foco(r.correcaoIA),
    planoEstudoSugerido: plano(r.correcaoIA)
  };
}

function dentroPeriodoQuery(agora = new Date()) {
  return [
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
  ];
}

async function cicloAtivo(req, modalidade) {
  const m = matchInstituicao(instituicaoRaw(req));
  if (!m) return null;

  return RedacaoCiclo.findOne({
    ...m,
    modalidade,
    status: 'ativo',
    $and: [
      temaTurmaMatch(req),
      ...dentroPeriodoQuery()
    ]
  })
    .populate('temaId')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

async function usoCiclo(req, ciclo) {
  if (!ciclo) {
    return {
      usadas: 0,
      limite: 0,
      restantes: 0,
      atingiuLimite: true,
      etapaSeguinte: null
    };
  }

  const m = matchInstituicaoHistorico(req);
  const a = matchAlunoHistorico(req);

  const usadas = !m || !a
    ? 0
    : await RedacaoEnem.countDocuments({
        ...m,
        ...a,
        cicloId: oid(ciclo._id)
      });

  const limite = Math.max(1, Number(ciclo.maxEnviosPorAluno) || 1);
  const modalidade = ciclo.modalidade;

  let etapaSeguinte = null;

  if (usadas < limite) {
    if (modalidade === 'avaliacao_institucional') {
      etapaSeguinte = 'avaliacao';
    } else {
      etapaSeguinte = usadas === 0 ? 'producao_inicial' : 'reescrita';
    }
  }

  return {
    usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    atingiuLimite: usadas >= limite,
    etapaSeguinte
  };
}

async function usoPraticaLivre(req) {
  const m = matchInstituicaoHistorico(req);
  const a = matchAlunoHistorico(req);
  const limite = limitePraticaLivre();

  const usadas = !m || !a
    ? 0
    : await RedacaoEnem.countDocuments({
        ...m,
        ...a,
        modalidade: 'pratica_livre',
        createdAt: {
          $gte: inicioMes(),
          $lt: fimMes()
        }
      });

  return {
    usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    atingiuLimite: limite === 0 || usadas >= limite,
    etapaSeguinte: limite === 0 || usadas >= limite ? null : 'pratica'
  };
}

function evolucaoEntre(anterior, atual) {
  if (!anterior?.correcaoIA || !atual?.correcaoIA) return null;

  const a = anterior.correcaoIA.competencias || {};
  const b = atual.correcaoIA.competencias || {};

  return {
    notaAnterior: Number(anterior.correcaoIA.notaTotal) || 0,
    notaAtual: Number(atual.correcaoIA.notaTotal) || 0,
    diferencaTotal:
      (Number(atual.correcaoIA.notaTotal) || 0) -
      (Number(anterior.correcaoIA.notaTotal) || 0),
    competencias: {
      c1: (Number(b.c1) || 0) - (Number(a.c1) || 0),
      c2: (Number(b.c2) || 0) - (Number(a.c2) || 0),
      c3: (Number(b.c3) || 0) - (Number(a.c3) || 0),
      c4: (Number(b.c4) || 0) - (Number(a.c4) || 0),
      c5: (Number(b.c5) || 0) - (Number(a.c5) || 0)
    }
  };
}

router.use(autenticar);


router.get('/contexto', async (req, res) => {
  try {
    const m = matchInstituicao(instituicaoRaw(req));

    if (!m) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    const [trilha, avaliacao, temasPratica, usoLivre] = await Promise.all([
      cicloAtivo(req, 'trilha_orientada'),
      cicloAtivo(req, 'avaliacao_institucional'),
      RedacaoTema.find({
        ...m,
        status: 'ativo',
        modalidade: 'pratica_livre'
      })
        .sort({
          destaquePraticaLivre: -1,
          ordemPraticaLivre: 1,
          createdAt: -1
        })
        .limit(50)
        .lean(),
      usoPraticaLivre(req)
    ]);

    const [usoTrilha, usoAvaliacao] = await Promise.all([
      usoCiclo(req, trilha),
      usoCiclo(req, avaliacao)
    ]);

    return res.json({
      ok: true,
      trilhaOrientada: trilha
        ? {
            ciclo: formatarCiclo(trilha),
            tema: formatarTema(trilha.temaId),
            uso: usoTrilha
          }
        : null,
      praticaLivre: {
        temas: temasPratica.map(formatarTema),
        uso: usoLivre
      },
      avaliacaoInstitucional: avaliacao
        ? {
            ciclo: formatarCiclo(avaliacao),
            tema: formatarTema(avaliacao.temaId),
            uso: usoAvaliacao
          }
        : null,
      modalidadePadrao: trilha
        ? 'trilha_orientada'
        : avaliacao
          ? 'avaliacao_institucional'
          : temasPratica.length
            ? 'pratica_livre'
            : null
    });
  } catch (e) {
    console.error('[redacao contexto]', e);
    return erro(res, 500, 'Erro ao carregar modalidades de redação.');
  }
});


router.get('/tema/ativo', async (req, res) => {
  try {
    const ciclo = await cicloAtivo(req, 'trilha_orientada');

    if (ciclo) {
      const uso = await usoCiclo(req, ciclo);

      return res.json({
        ok: true,
        tema: formatarTema(ciclo.temaId),
        ciclo: formatarCiclo(ciclo),
        limiteMensal: uso
      });
    }

    const m = matchInstituicao(instituicaoRaw(req));
    if (!m) return erro(res, 400, 'Instituição não identificada.');

    const agora = new Date();
    const turmaMatch = temaTurmaMatch(req);

    const tema = await RedacaoTema.findOne({
      ...m,
      status: 'ativo',
      $and: [
        {
          $or: [
            { modalidade: 'trilha_orientada' },
            { modalidade: { $exists: false } }
          ]
        },
        turmaMatch,
        ...dentroPeriodoQuery(agora)
      ]
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const usadas = await usadasMes(req);

    return res.json({
      ok: true,
      tema: formatarTema(tema),
      ciclo: null,
      limiteMensal: resumo(usadas)
    });
  } catch (e) {
    console.error('tema ativo', e);
    return erro(res, 500, 'Erro ao buscar tema ativo.');
  }
});

router.get('/temas/pratica', async (req,res) => {
  try { const m=matchInstituicao(instituicaoRaw(req)); if(!m)return erro(res,400,'Instituição não identificada.');
    const temas=await RedacaoTema.find({...m,status:'ativo',modalidade:'pratica_livre'}).sort({destaquePraticaLivre:-1,ordemPraticaLivre:1,createdAt:-1}).limit(50).lean();
    return res.json({ok:true,temas:temas.map(formatarTema)});
  } catch(e){ return erro(res,500,'Erro ao listar temas de prática.'); }
});

router.get('/resumo-mensal', async (req,res) => { try { return res.json({ok:true,resumoMensal:resumo(await usadasMes(req)),periodo:{inicio:inicioMes(),fim:fimMes(),mesReferencia:mesRef()}}); } catch(e){return erro(res,500,'Erro ao carregar resumo mensal.');} });

router.get('/historico', async (req, res) => {
  try {
    const m = matchInstituicaoHistorico(req);
    const a = matchAlunoHistorico(req);

    if (!m || !a) {
      return erro(
        res,
        400,
        'Aluno ou instituição não identificado.'
      );
    }

    const itens = await RedacaoEnem.find({
      ...m,
      ...a
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .select(
        'temaTituloSnapshot quantidadePalavras tempoGastoSegundos ' +
        'status tentativa createdAt correcaoIA apoioProfessor ' +
        'mesReferencia evidenciaAutoria modalidade etapaCiclo ' +
        'cicloId evolucao versaoAnteriorId'
      )
      .lean();

    return res.json({
      ok: true,
      historico: itens.map(publicRedacao)
    });
  } catch (e) {
    console.error('[redacao historico aluno]', e);
    return erro(
      res,
      500,
      'Erro ao carregar histórico de redações.'
    );
  }
});

router.get('/apoios/pendentes', async (req,res) => {
  try { if(!acessoRedacao(req))return erro(res,403,'Acesso permitido somente a professores e administradores.'); const m=matchInstituicao(instituicaoRaw(req)); if(!m)return erro(res,400,'Instituição não identificada.');
    const lista=await RedacaoEnem.find({...m,'apoioProfessor.status':'solicitado'}).sort({updatedAt:-1}).limit(50).select('aluno turma temaTituloSnapshot texto createdAt apoioProfessor correcaoIA status evidenciaAutoria').lean();
    return res.json({ok:true,pendentes:lista.map(publicRedacao)});
  } catch(e){return erro(res,500,'Erro ao listar apoios pendentes.');}
});


router.get('/admin/ciclos', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    const m = matchInstituicao(instituicaoRaw(req));

    if (!m) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    const ciclos = await RedacaoCiclo.find(m)
      .populate('temaId')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      ciclos: ciclos.map(formatarCiclo)
    });
  } catch (e) {
    console.error('[redacao admin ciclos]', e);
    return erro(res, 500, 'Erro ao listar ciclos de redação.');
  }
});

router.post('/admin/ciclos', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    const inst = instituicaoRaw(req);
    const m = matchInstituicao(inst);
    const b = req.body || {};

    if (!m) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    if (!t(b.nome)) {
      return erro(res, 400, 'Informe o nome do ciclo.');
    }

    if (!['trilha_orientada', 'avaliacao_institucional'].includes(b.modalidade)) {
      return erro(res, 400, 'Modalidade inválida.');
    }

    if (!mongoose.Types.ObjectId.isValid(b.temaId)) {
      return erro(res, 400, 'Selecione um tema válido.');
    }

    const tema = await RedacaoTema.findOne({
      _id: oid(b.temaId),
      ...m
    }).lean();

    if (!tema) {
      return erro(res, 404, 'Tema não encontrado.');
    }

    const maxPadrao = b.modalidade === 'avaliacao_institucional' ? 1 : 2;

    const ciclo = await RedacaoCiclo.create({
      instituicao: valor(inst),
      nome: t(b.nome),
      modalidade: b.modalidade,
      temaId: tema._id,
      turmasDestinadas: Array.isArray(b.turmasDestinadas)
        ? b.turmasDestinadas
        : [],
      publicoAlvo: t(b.publicoAlvo) || 'Ensino Médio',
      status: ['rascunho', 'ativo'].includes(b.status)
        ? b.status
        : 'rascunho',
      dataInicio: b.dataInicio ? new Date(b.dataInicio) : null,
      dataFim: b.dataFim ? new Date(b.dataFim) : null,
      maxEnviosPorAluno:
        Math.max(1, Number(b.maxEnviosPorAluno) || maxPadrao),
      permiteReescrita:
        b.modalidade === 'trilha_orientada'
          ? b.permiteReescrita !== false
          : false,
      assistenteDuranteEscrita:
        b.modalidade === 'avaliacao_institucional'
          ? Boolean(b.assistenteDuranteEscrita)
          : b.assistenteDuranteEscrita !== false,
      cronometroObrigatorio:
        b.modalidade === 'avaliacao_institucional'
          ? b.cronometroObrigatorio !== false
          : Boolean(b.cronometroObrigatorio),
      tempoLimiteMinutos:
        Math.max(10, Number(b.tempoLimiteMinutos) || 60),
      mostrarTextosMotivadores: b.mostrarTextosMotivadores !== false,
      instrucoesAluno: t(b.instrucoesAluno),
      criadoPor: usuarioId(req),
      atualizadoPor: usuarioId(req)
    });

    const completo = await RedacaoCiclo.findById(ciclo._id)
      .populate('temaId')
      .lean();

    return res.status(201).json({
      ok: true,
      mensagem: 'Ciclo criado com sucesso.',
      ciclo: formatarCiclo(completo)
    });
  } catch (e) {
    console.error('[redacao criar ciclo]', e);
    return erro(res, 500, 'Erro ao criar ciclo de redação.');
  }
});

router.patch('/admin/ciclos/:id', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return erro(res, 400, 'Ciclo inválido.');
    }

    const m = matchInstituicao(instituicaoRaw(req));
    const ciclo = await RedacaoCiclo.findOne({
      _id: oid(req.params.id),
      ...m
    });

    if (!ciclo) {
      return erro(res, 404, 'Ciclo não encontrado.');
    }

    const b = req.body || {};

    [
      'nome',
      'publicoAlvo',
      'instrucoesAluno'
    ].forEach((campo) => {
      if (b[campo] !== undefined) ciclo[campo] = t(b[campo]);
    });

    [
      'permiteReescrita',
      'assistenteDuranteEscrita',
      'cronometroObrigatorio',
      'mostrarTextosMotivadores'
    ].forEach((campo) => {
      if (b[campo] !== undefined) ciclo[campo] = Boolean(b[campo]);
    });

    if (b.maxEnviosPorAluno !== undefined) {
      ciclo.maxEnviosPorAluno = Math.max(
        1,
        Number(b.maxEnviosPorAluno) || 1
      );
    }

    if (b.tempoLimiteMinutos !== undefined) {
      ciclo.tempoLimiteMinutos = Math.max(
        10,
        Number(b.tempoLimiteMinutos) || 60
      );
    }

    if (Array.isArray(b.turmasDestinadas)) {
      ciclo.turmasDestinadas = b.turmasDestinadas;
    }

    if (b.dataInicio !== undefined) {
      ciclo.dataInicio = b.dataInicio ? new Date(b.dataInicio) : null;
    }

    if (b.dataFim !== undefined) {
      ciclo.dataFim = b.dataFim ? new Date(b.dataFim) : null;
    }

    ciclo.atualizadoPor = usuarioId(req);
    await ciclo.save();

    const completo = await RedacaoCiclo.findById(ciclo._id)
      .populate('temaId')
      .lean();

    return res.json({
      ok: true,
      mensagem: 'Ciclo atualizado.',
      ciclo: formatarCiclo(completo)
    });
  } catch (e) {
    return erro(res, 500, 'Erro ao atualizar ciclo.');
  }
});

router.post('/admin/ciclos/:id/ativar', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return erro(res, 400, 'Ciclo inválido.');
    }

    const m = matchInstituicao(instituicaoRaw(req));
    const ciclo = await RedacaoCiclo.findOne({
      _id: oid(req.params.id),
      ...m
    });

    if (!ciclo) {
      return erro(res, 404, 'Ciclo não encontrado.');
    }

    const alvos = Array.isArray(ciclo.turmasDestinadas)
      ? ciclo.turmasDestinadas
      : [];

    const conflito = {
      ...m,
      _id: { $ne: ciclo._id },
      modalidade: ciclo.modalidade,
      status: 'ativo'
    };

    if (alvos.length) {
      conflito.$or = [
        { turmasDestinadas: { $exists: false } },
        { turmasDestinadas: { $size: 0 } },
        { turmasDestinadas: { $in: alvos } }
      ];
    }

    await RedacaoCiclo.updateMany(
      conflito,
      {
        $set: {
          status: 'encerrado',
          dataFim: new Date(),
          atualizadoPor: usuarioId(req)
        }
      }
    );

    ciclo.status = 'ativo';
    ciclo.dataInicio = ciclo.dataInicio || new Date();
    ciclo.atualizadoPor = usuarioId(req);
    await ciclo.save();

    const completo = await RedacaoCiclo.findById(ciclo._id)
      .populate('temaId')
      .lean();

    return res.json({
      ok: true,
      mensagem: 'Ciclo ativado para os alunos.',
      ciclo: formatarCiclo(completo)
    });
  } catch (e) {
    console.error('[redacao ativar ciclo]', e);
    return erro(res, 500, 'Erro ao ativar ciclo.');
  }
});

router.post('/admin/ciclos/:id/encerrar', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    const m = matchInstituicao(instituicaoRaw(req));

    const ciclo = await RedacaoCiclo.findOneAndUpdate(
      {
        _id: oid(req.params.id),
        ...m
      },
      {
        $set: {
          status: 'encerrado',
          dataFim: new Date(),
          atualizadoPor: usuarioId(req)
        }
      },
      { new: true }
    )
      .populate('temaId')
      .lean();

    if (!ciclo) {
      return erro(res, 404, 'Ciclo não encontrado.');
    }

    return res.json({
      ok: true,
      mensagem: 'Ciclo encerrado.',
      ciclo: formatarCiclo(ciclo)
    });
  } catch (e) {
    return erro(res, 500, 'Erro ao encerrar ciclo.');
  }
});


router.get('/temas', async (req,res) => { try { if(!acessoGestaoRedacao(req))return erro(res,403,'Acesso negado.'); const m=matchInstituicao(instituicaoRaw(req)); if(!m)return erro(res,400,'Instituição não identificada.'); const x=await RedacaoTema.find(m).sort({createdAt:-1}).lean(); return res.json({ok:true,temas:x.map(formatarTema)}); } catch(e){return erro(res,500,'Erro ao listar temas.');} });

router.post('/tema', async (req,res) => {
  try { if(!acessoGestaoRedacao(req))return erro(res,403,'Acesso negado.'); const inst=instituicaoRaw(req); if(!inst)return erro(res,400,'Instituição não identificada.'); const b=req.body||{}; if(!t(b.titulo)||!t(b.proposta))return erro(res,400,'Título e proposta são obrigatórios.');
    const tema=await RedacaoTema.create({ instituicao:valor(inst), codigoBanco:t(b.codigoBanco), titulo:t(b.titulo), proposta:t(b.proposta), eixoTematico:t(b.eixoTematico)||'Redação ENEM',
      palavrasChave:Array.isArray(b.palavrasChave)?b.palavrasChave.map(t).filter(Boolean):[], textosMotivadores:Array.isArray(b.textosMotivadores)?b.textosMotivadores:[],
      modalidade:['trilha_orientada','pratica_livre'].includes(b.modalidade)?b.modalidade:'trilha_orientada', turmasDestinadas:Array.isArray(b.turmasDestinadas)?b.turmasDestinadas:[],
      orientacoesProfessor:t(b.orientacoesProfessor), tempoSugeridoMinutos:Number(b.tempoSugeridoMinutos)||60, minimoPalavras:Number(b.minimoPalavras)||120, maximoPalavras:Number(b.maximoPalavras)||450,
      status:['ativo','inativo','arquivado'].includes(b.status)?b.status:'inativo', dataInicio:b.dataInicio?new Date(b.dataInicio):null, dataFim:b.dataFim?new Date(b.dataFim):null, criadoPor:usuarioId(req) });
    return res.status(201).json({ok:true,mensagem:'Tema criado com sucesso.',tema:formatarTema(tema.toObject())});
  } catch(e){console.error(e);return erro(res,500,'Erro ao criar tema.');}
});


router.patch('/tema/:id', async (req, res) => {
  try {
    if (!acessoGestaoRedacao(req)) {
      return erro(res, 403, 'Acesso negado.');
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return erro(res, 400, 'Tema inválido.');
    }

    const m = matchInstituicao(instituicaoRaw(req));
    const tema = await RedacaoTema.findOne({
      _id: oid(req.params.id),
      ...m
    });

    if (!tema) {
      return erro(res, 404, 'Tema não encontrado.');
    }

    const b = req.body || {};

    if (b.modalidade !== undefined) {
      if (!['trilha_orientada', 'pratica_livre'].includes(b.modalidade)) {
        return erro(res, 400, 'Modalidade do tema inválida.');
      }
      tema.modalidade = b.modalidade;
    }

    if (b.status !== undefined) {
      if (!['ativo', 'inativo', 'arquivado'].includes(b.status)) {
        return erro(res, 400, 'Status inválido.');
      }
      tema.status = b.status;
    }

    if (b.destaquePraticaLivre !== undefined) {
      tema.destaquePraticaLivre = Boolean(b.destaquePraticaLivre);
    }

    if (b.ordemPraticaLivre !== undefined) {
      tema.ordemPraticaLivre = Number(b.ordemPraticaLivre) || 0;
    }

    if (b.titulo !== undefined) tema.titulo = t(b.titulo);
    if (b.proposta !== undefined) tema.proposta = t(b.proposta);
    if (b.eixoTematico !== undefined) tema.eixoTematico = t(b.eixoTematico);
    if (Array.isArray(b.palavrasChave)) tema.palavrasChave = b.palavrasChave;
    if (Array.isArray(b.textosMotivadores)) tema.textosMotivadores = b.textosMotivadores;

    await tema.save();

    return res.json({
      ok: true,
      mensagem: 'Tema atualizado.',
      tema: formatarTema(tema.toObject())
    });
  } catch (e) {
    return erro(res, 500, 'Erro ao atualizar tema.');
  }
});


router.post('/tema/:id/ativar', async (req,res) => {
  try { if(!acessoGestaoRedacao(req))return erro(res,403,'Acesso negado.'); if(!mongoose.Types.ObjectId.isValid(req.params.id))return erro(res,400,'Tema inválido.'); const m=matchInstituicao(instituicaoRaw(req)); const tema=await RedacaoTema.findOne({_id:oid(req.params.id),...m}); if(!tema)return erro(res,404,'Tema não encontrado.');
    if(tema.modalidade==='trilha_orientada') await RedacaoTema.updateMany({...m,status:'ativo',$or:[{modalidade:'trilha_orientada'},{modalidade:{$exists:false}}]},{$set:{status:'inativo'}});
    tema.status='ativo'; tema.dataInicio=req.body?.dataInicio?new Date(req.body.dataInicio):new Date(); tema.dataFim=req.body?.dataFim?new Date(req.body.dataFim):null; if(Array.isArray(req.body?.turmasDestinadas))tema.turmasDestinadas=req.body.turmasDestinadas; await tema.save();
    return res.json({ok:true,mensagem:'Tema comum ativado para a trilha orientada.',tema:formatarTema(tema.toObject())});
  } catch(e){return erro(res,500,'Erro ao ativar tema.');}
});

router.post('/enviar', uploadRedacao.single('fotoManuscrita'), async (req, res) => {
  try {
    const inst = instituicaoRaw(req);
    const a = alunoId(req);
    const m = matchInstituicao(inst);
    const mHistorico = matchInstituicaoHistorico(req);
    const aHistorico = matchAlunoHistorico(req);

    if (!m || !a || !mHistorico || !aHistorico) {
      return erro(res, 400, 'Aluno ou instituição não identificado.');
    }

    if (!mongoose.Types.ObjectId.isValid(req.body?.temaId)) {
      return erro(res, 400, 'Tema inválido.');
    }

    const modalidadeSolicitada = [
      'trilha_orientada',
      'pratica_livre',
      'avaliacao_institucional'
    ].includes(req.body?.modalidade)
      ? req.body.modalidade
      : 'legado';

    const texto = limparTexto(req.body?.texto);
    const palavras = contarPalavras(texto);

    if (!texto) {
      return erro(res, 400, 'A redação está vazia.');
    }

    let ciclo = null;
    let uso = null;
    let etapaCiclo = 'legado';
    let tema = null;
    let anterior = null;

    if (
      modalidadeSolicitada === 'trilha_orientada' ||
      modalidadeSolicitada === 'avaliacao_institucional'
    ) {
      if (!mongoose.Types.ObjectId.isValid(req.body?.cicloId)) {
        return erro(res, 400, 'Ciclo de redação inválido.');
      }

      ciclo = await RedacaoCiclo.findOne({
        _id: oid(req.body.cicloId),
        ...m,
        modalidade: modalidadeSolicitada,
        status: 'ativo',
        $and: [
          temaTurmaMatch(req),
          ...dentroPeriodoQuery()
        ]
      })
        .populate('temaId')
        .lean();

      if (!ciclo) {
        return erro(res, 404, 'Ciclo não encontrado ou indisponível.');
      }

      uso = await usoCiclo(req, ciclo);

      if (uso.atingiuLimite) {
        return erro(
          res,
          400,
          'Você já concluiu as entregas disponíveis neste ciclo.',
          { resumoUso: uso }
        );
      }

      tema = ciclo.temaId;

      if (String(tema?._id) !== String(req.body.temaId)) {
        return erro(res, 400, 'O tema não pertence ao ciclo selecionado.');
      }

      etapaCiclo = uso.etapaSeguinte;

      anterior = await RedacaoEnem.findOne({
        ...mHistorico,
        ...aHistorico,
        cicloId: oid(ciclo._id)
      })
        .sort({ createdAt: -1 })
        .lean();
    } else if (modalidadeSolicitada === 'pratica_livre') {
      uso = await usoPraticaLivre(req);

      if (uso.atingiuLimite) {
        return erro(
          res,
          400,
          'O limite mensal de correções da prática livre foi atingido.',
          { resumoUso: uso }
        );
      }

      tema = await RedacaoTema.findOne({
        _id: oid(req.body.temaId),
        ...m,
        status: 'ativo',
        modalidade: 'pratica_livre'
      }).lean();

      if (!tema) {
        return erro(res, 404, 'Tema de prática livre indisponível.');
      }

      etapaCiclo = 'pratica';
    } else {
      const usadas = await usadasMes(req);

      if (usadas >= limiteMensal()) {
        return erro(
          res,
          400,
          `Você já utilizou suas ${limiteMensal()} redações deste mês.`,
          { resumoMensal: resumo(usadas) }
        );
      }

      tema = await RedacaoTema.findOne({
        _id: oid(req.body.temaId),
        ...m,
        status: 'ativo'
      }).lean();

      uso = resumo(usadas);
    }

    if (!tema) {
      return erro(res, 404, 'Tema não encontrado ou indisponível.');
    }

    const min = Math.max(120, Number(tema.minimoPalavras) || 120);

    if (palavras < min) {
      return erro(
        res,
        400,
        `A redação precisa ter pelo menos ${min} palavras.`
      );
    }

    if (ciclo?.cronometroObrigatorio) {
      const tempo = Number(req.body.tempoGastoSegundos) || 0;

      if (tempo <= 0 || String(req.body.cronometroUtilizado) !== 'true') {
        return erro(
          res,
          400,
          'Esta avaliação exige o uso do cronômetro.'
        );
      }
    }

    let foto = null;

    if (req.file) {
      foto = await uploadFotoRedacao({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        tenantId: valor(inst),
        alunoId: a
      });
    }

    const anteriores = await RedacaoEnem.find({
      ...mHistorico,
      ...aHistorico
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('texto textoNormalizado')
      .lean();

    const evidencia = analisarIntegridade({
      texto,
      textosMotivadores: tema.textosMotivadores || [],
      redacoesAnteriores: anteriores,
      telemetria: req.body || {},
      fotoInformada: Boolean(foto)
    });

    const ultima = await RedacaoEnem.findOne({
      ...mHistorico,
      ...aHistorico,
      temaId: tema._id
    })
      .sort({ tentativa: -1 })
      .select('tentativa')
      .lean();

    const redacao = await RedacaoEnem.create({
      instituicao: valor(inst),
      aluno: oid(a),
      usuarioAluno: oid(usuarioId(req)),
      turma: oid(turmaId(req)),
      temaId: tema._id,
      cicloId: ciclo?._id || null,
      modalidade: modalidadeSolicitada,
      etapaCiclo,
      versaoAnteriorId: anterior?._id || null,
      temaTituloSnapshot: t(tema.titulo),
      propostaSnapshot: t(tema.proposta),
      textosMotivadoresSnapshot:
        ciclo && ciclo.mostrarTextosMotivadores === false
          ? []
          : tema.textosMotivadores || [],
      texto,
      textoNormalizado: texto,
      quantidadePalavras: palavras,
      tempoGastoSegundos: Number(req.body.tempoGastoSegundos) || 0,
      cronometroUtilizado:
        String(req.body.cronometroUtilizado) === 'true',
      fotoManuscrita: foto
        ? {
            ...foto,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            enviadaEm: new Date()
          }
        : null,
      evidenciaAutoria: evidencia,
      status: 'corrigindo_ia',
      tentativa: (Number(ultima?.tentativa) || 0) + 1,
      mesReferencia: mesRef(),
      tentativasCorrecaoIA: 1,
      ultimaTentativaCorrecaoEm: new Date()
    });

    try {
      redacao.correcaoIA = await corrigirRedacaoEnem({
        temaTitulo: tema.titulo,
        proposta: tema.proposta,
        textosMotivadores:
          ciclo && ciclo.mostrarTextosMotivadores === false
            ? []
            : tema.textosMotivadores || [],
        redacaoAluno: texto
      });

      redacao.status = 'corrigida';
      redacao.erroCorrecao = '';

      if (
        modalidadeSolicitada === 'trilha_orientada' &&
        anterior?.correcaoIA
      ) {
        redacao.evolucao = evolucaoEntre(anterior, redacao);
      }
    } catch (e) {
      console.error('[redacao IA]', e);
      redacao.status = 'erro_correcao';
      redacao.erroCorrecao = t(e.message || e);
    }

    await redacao.save();

    const out = await RedacaoEnem.findById(redacao._id).lean();

    let resumoUso = null;

    if (ciclo) {
      resumoUso = await usoCiclo(req, ciclo);
    } else if (modalidadeSolicitada === 'pratica_livre') {
      resumoUso = await usoPraticaLivre(req);
    } else {
      resumoUso = resumo((uso?.usadas || 0) + 1);
    }

    return res.status(201).json({
      ok: true,
      mensagem:
        redacao.status === 'corrigida'
          ? 'Redação corrigida com sucesso.'
          : 'Redação salva; a correção poderá ser tentada novamente.',
      redacao: publicRedacao(out),
      resumoUso
    });
  } catch (e) {
    console.error('enviar redação', e);

    if (e instanceof multer.MulterError) {
      return erro(res, 400, e.message);
    }

    return erro(res, 500, 'Erro ao enviar redação.');
  }
});

router.post('/:id/corrigir', async (req, res) => {
  try {
    const m = matchInstituicaoHistorico(req);
    const a = matchAlunoHistorico(req);

    if (!m || !a) {
      return erro(
        res,
        400,
        'Aluno ou instituição não identificado.'
      );
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return erro(res, 400, 'ID inválido.');
    }

    const r = await RedacaoEnem.findOne({
      _id: oid(req.params.id),
      ...m,
      ...a
    });

    if (!r) {
      return erro(res, 404, 'Redação não encontrada.');
    } if(r.status==='corrigindo_ia')return erro(res,409,'A correção já está em andamento.'); if(r.status==='corrigida'&&!req.body?.forcar)return res.json({ok:true,redacao:publicRedacao(r.toObject())});
    r.status='corrigindo_ia'; r.tentativasCorrecaoIA=(r.tentativasCorrecaoIA||0)+1; r.ultimaTentativaCorrecaoEm=new Date(); await r.save();
    try { r.correcaoIA=await corrigirRedacaoEnem({temaTitulo:r.temaTituloSnapshot,proposta:r.propostaSnapshot,textosMotivadores:r.textosMotivadoresSnapshot||[],redacaoAluno:r.texto}); r.status='corrigida'; r.erroCorrecao=''; }
    catch(e){r.status='erro_correcao';r.erroCorrecao=t(e.message||e);} await r.save(); return res.json({ok:r.status==='corrigida',redacao:publicRedacao(r.toObject()),erro:r.status==='erro_correcao'?r.erroCorrecao:undefined});
  } catch(e){return erro(res,500,'Erro ao corrigir redação.');}
});

router.post('/:id/solicitar-apoio', async (req, res) => {
  try {
    const m = matchInstituicaoHistorico(req);
    const a = matchAlunoHistorico(req);

    if (
      !m ||
      !a ||
      !mongoose.Types.ObjectId.isValid(req.params.id)
    ) {
      return erro(res, 400, 'Dados inválidos.');
    }

    const r = await RedacaoEnem.findOne({
      _id: oid(req.params.id),
      ...m,
      ...a
    });

    if (!r) {
      return erro(res, 404, 'Redação não encontrada.');
    }
    r.apoioProfessor={...(r.apoioProfessor?.toObject?.()||r.apoioProfessor||{}),solicitado:true,status:'solicitado',focoTema:t(req.body?.focoTema||req.body?.foco)||foco(r.correcaoIA)}; r.status='apoio_professor_solicitado'; await r.save(); return res.json({ok:true,mensagem:'Solicitação enviada ao orientador de redação.',redacao:publicRedacao(r.toObject())});
  } catch(e){return erro(res,500,'Erro ao solicitar apoio.');}
});

router.post('/:id/responder-apoio', async (req,res) => {
  try { if(!acessoRedacao(req))return erro(res,403,'Acesso permitido somente a professores e administradores.'); const m=matchInstituicao(instituicaoRaw(req)); if(!m||!mongoose.Types.ObjectId.isValid(req.params.id))return erro(res,400,'Dados inválidos.'); const obs=t(req.body?.observacaoProfessor); if(!obs)return erro(res,400,'Escreva uma orientação.'); const r=await RedacaoEnem.findOne({_id:oid(req.params.id),...m}); if(!r)return erro(res,404,'Redação não encontrada.');
    r.apoioProfessor={solicitado:true,status:'respondido',focoTema:r.apoioProfessor?.focoTema||'',observacaoProfessor:obs,professorId:usuarioId(req),professorNome:usuario(req).nome||'',respondidoEm:new Date()}; r.status='apoio_professor_respondido'; await r.save(); return res.json({ok:true,mensagem:'Orientação registrada.',redacao:publicRedacao(r.toObject())});
  } catch(e){return erro(res,500,'Erro ao registrar orientação.');}
});

router.get('/:id', async (req, res) => {
  try {
    const m = matchInstituicaoHistorico(req);
    const a = matchAlunoHistorico(req);

    if (
      !m ||
      !a ||
      !mongoose.Types.ObjectId.isValid(req.params.id)
    ) {
      return erro(res, 400, 'Dados inválidos.');
    }

    const r = await RedacaoEnem.findOne({
      _id: oid(req.params.id),
      ...m,
      ...a
    }).lean();

    if (!r) {
      return erro(res, 404, 'Redação não encontrada.');
    }

    return res.json({
      ok: true,
      redacao: publicRedacao(r)
    });
  } catch (e) {
    console.error('[redacao detalhe aluno]', e);
    return erro(res, 500, 'Erro ao buscar redação.');
  }
});

module.exports = router;
