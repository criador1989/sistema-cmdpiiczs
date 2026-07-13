'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const RedacaoEnem = require('../../models/RedacaoEnem');
const RedacaoCiclo = require('../../models/RedacaoCiclo');
const { autenticar } = require('../../middleware/autenticacao');

const router = express.Router();

function t(valor) {
  return String(valor || '').trim();
}

function normalizar(valor) {
  return t(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function oid(valor) {
  if (!valor) return valor;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  return mongoose.Types.ObjectId.isValid(valor)
    ? new mongoose.Types.ObjectId(valor)
    : valor;
}

function usuario(req) {
  return req.usuario || {};
}

function usuarioId(req) {
  const u = usuario(req);
  return u._id || u.id || null;
}

function perfil(req) {
  const u = usuario(req);
  return normalizar(
    u.tipo ||
    u.perfil ||
    u.role ||
    u.cargo ||
    u.funcao
  );
}

function isProfessor(req) {
  const p = perfil(req);
  return p === 'professor' || p.includes('professor');
}

function isAdmin(req) {
  const p = perfil(req);

  return [
    'admin',
    'master',
    'superadmin',
    'coordenador',
    'coordenacao',
    'diretor',
    'direcao'
  ].some((papel) => p === papel || p.includes(papel));
}

function podeAcessar(req) {
  return isProfessor(req) || isAdmin(req);
}

function instituicaoRaw(req) {
  const u = usuario(req);

  // Prioriza sempre a instituição confirmada pela autenticação.
  // Isso evita que o slug visual da URL, como ?t=cmdpii, seja usado
  // em campos MongoDB do tipo ObjectId.
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

function valor(valorBruto) {
  if (valorBruto && typeof valorBruto === 'object') {
    return (
      valorBruto._id ||
      valorBruto.id ||
      valorBruto.slug ||
      valorBruto
    );
  }

  return valorBruto;
}

function candidatosInstituicaoRedacao(req) {
  const bruto = valor(instituicaoRaw(req));
  const candidatos = [];

  function adicionar(valorCandidato) {
    if (
      valorCandidato === null ||
      valorCandidato === undefined ||
      String(valorCandidato).trim() === ''
    ) {
      return;
    }

    const texto = String(valorCandidato).trim();

    if (!candidatos.some((item) => String(item) === texto)) {
      candidatos.push(texto);
    }

    if (
      mongoose.Types.ObjectId.isValid(texto) &&
      !candidatos.some(
        (item) =>
          item instanceof mongoose.Types.ObjectId &&
          String(item) === texto
      )
    ) {
      candidatos.push(new mongoose.Types.ObjectId(texto));
    }
  }

  // Formato atual: ID da instituição confirmado pela autenticação.
  adicionar(bruto);

  // Compatibilidade com redações criadas antes do Hotfix V3.3.2,
  // quando o slug visual da URL podia ser salvo em RedacaoEnem.instituicao.
  adicionar(req.query?.t);
  adicionar(req.query?.tenant);
  adicionar(req.tenantSlug);
  adicionar(req.tenant?.slug);

  return candidatos;
}

function instituicaoObjectId(req) {
  const bruto = valor(instituicaoRaw(req));

  if (!bruto || !mongoose.Types.ObjectId.isValid(bruto)) {
    return null;
  }

  return new mongoose.Types.ObjectId(bruto);
}

function filtroInstituicaoRedacao(req) {
  const candidatos = candidatosInstituicaoRedacao(req);

  if (!candidatos.length) return null;

  return {
    instituicao: {
      $in: candidatos
    }
  };
}

function filtroInstituicaoAluno(req) {
  const instituicaoId = instituicaoObjectId(req);

  if (!instituicaoId) return null;

  // Aluno.instituicao e Aluno.tenantId são ObjectId.
  // Nunca inserir slug textual nesse filtro.
  return {
    $or: [
      { instituicao: instituicaoId },
      { tenantId: instituicaoId }
    ]
  };
}

function idVariants(valorId) {
  const lista = [];

  if (!valorId) return lista;

  lista.push(String(valorId));

  if (mongoose.Types.ObjectId.isValid(valorId)) {
    lista.push(new mongoose.Types.ObjectId(valorId));
  }

  return lista;
}

function erro(res, status, mensagem, extra = {}) {
  return res.status(status).json({
    ok: false,
    erro: mensagem,
    ...extra
  });
}

function garantirAcesso(req, res, next) {
  if (!podeAcessar(req)) {
    return erro(
      res,
      403,
      'Acesso permitido somente a professores e administradores.'
    );
  }

  return next();
}

function nota(redacao) {
  return Number(redacao?.correcaoIA?.notaTotal) || null;
}

function competencias(redacao) {
  return redacao?.correcaoIA?.competencias || {};
}

function resumoAluno(aluno) {
  if (!aluno) return null;

  return {
    _id: aluno._id,
    nome: aluno.nome,
    turma: aluno.turma,
    foto: aluno.fotoThumb || aluno.foto || null
  };
}

function resumoRedacao(redacao, aluno) {
  return {
    _id: redacao._id,
    aluno: resumoAluno(aluno),
    temaTitulo: redacao.temaTituloSnapshot || 'Redação ENEM',
    modalidade: redacao.modalidade || 'legado',
    etapaCiclo: redacao.etapaCiclo || 'legado',
    cicloId: redacao.cicloId || null,
    status: redacao.status,
    notaTotal: nota(redacao),
    competencias: competencias(redacao),
    focoPrincipal:
      redacao.correcaoIA?.focoPrincipal ||
      redacao.correcaoIA?.pontosMelhorar?.[0] ||
      '',
    quantidadePalavras: Number(redacao.quantidadePalavras) || 0,
    createdAt: redacao.createdAt,
    updatedAt: redacao.updatedAt,
    apoioProfessor: redacao.apoioProfessor || null,
    nivelAtencao:
      redacao.evidenciaAutoria?.nivelAtencao || 'baixo',
    proporcaoTextoColado:
      Number(redacao.evidenciaAutoria?.proporcaoTextoColado) || 0,
    evolucao: redacao.evolucao || null
  };
}

async function buscarAlunoInstituicao(req, alunoId) {
  const filtroInst = filtroInstituicaoAluno(req);

  if (!filtroInst || !mongoose.Types.ObjectId.isValid(alunoId)) {
    return null;
  }

  return Aluno.findOne({
    _id: oid(alunoId),
    ...filtroInst
  })
    .select('nome turma foto fotoThumb instituicao tenantId')
    .lean();
}

async function mapaAlunos(req, ids) {
  const filtroInst = filtroInstituicaoAluno(req);

  if (!filtroInst || !ids.length) return new Map();

  const objectIds = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => oid(id));

  if (!objectIds.length) return new Map();

  const alunos = await Aluno.find({
    _id: { $in: objectIds },
    ...filtroInst
  })
    .select('nome turma foto fotoThumb')
    .lean();

  return new Map(
    alunos.map((aluno) => [String(aluno._id), aluno])
  );
}

async function idsAlunosDaTurma(req, turma) {
  const filtroInst = filtroInstituicaoAluno(req);

  if (!filtroInst || !t(turma)) return [];

  const alunos = await Aluno.find({
    ...filtroInst,
    turma: t(turma)
  })
    .select('_id')
    .lean();

  return alunos.map((aluno) => aluno._id);
}

router.use(autenticar);
router.use(garantirAcesso);

/**
 * Contexto do painel.
 * Professores e administradores enxergam as turmas da instituição.
 * Monitores, secretaria, alunos e responsáveis recebem 403.
 */
router.get('/contexto', async (req, res) => {
  try {
    const filtroAluno = filtroInstituicaoAluno(req);
    const filtroRedacao = filtroInstituicaoRedacao(req);

    if (!filtroAluno || !filtroRedacao) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    const [turmasBrutas, ciclos] = await Promise.all([
      Aluno.distinct('turma', filtroAluno),
      RedacaoCiclo.find(filtroRedacao)
        .populate('temaId')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    const turmas = turmasBrutas
      .map(t)
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b, 'pt-BR', {
          numeric: true,
          sensitivity: 'base'
        })
      );

    return res.json({
      ok: true,
      usuario: {
        id: usuarioId(req),
        nome: usuario(req).nome || 'Usuário',
        perfil: isAdmin(req) ? 'admin' : 'professor',
        podeGerenciar: true,
        podeAcompanharAlunos: true
      },
      turmas,
      ciclos: ciclos.map((ciclo) => ({
        _id: ciclo._id,
        nome: ciclo.nome,
        modalidade: ciclo.modalidade,
        status: ciclo.status,
        tema: ciclo.temaId
          ? {
              _id: ciclo.temaId._id,
              titulo: ciclo.temaId.titulo
            }
          : null,
        dataInicio: ciclo.dataInicio || null,
        dataFim: ciclo.dataFim || null
      }))
    });
  } catch (error) {
    console.error('[redacao gestao contexto]', error);
    return erro(res, 500, 'Erro ao carregar o painel de redação.');
  }
});

router.get('/alunos', async (req, res) => {
  try {
    const turma = t(req.query.turma);
    const filtroInst = filtroInstituicaoAluno(req);

    if (!filtroInst) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    if (!turma) {
      return res.json({
        ok: true,
        alunos: []
      });
    }

    const alunos = await Aluno.find({
      ...filtroInst,
      turma
    })
      .select('nome turma foto fotoThumb')
      .sort({ nome: 1 })
      .lean();

    return res.json({
      ok: true,
      alunos: alunos.map(resumoAluno)
    });
  } catch (error) {
    console.error('[redacao gestao alunos]', error);
    return erro(res, 500, 'Erro ao listar alunos.');
  }
});

router.get('/redacoes', async (req, res) => {
  try {
    const filtroInst = filtroInstituicaoRedacao(req);

    if (!filtroInst) {
      return erro(res, 400, 'Instituição não identificada.');
    }

    const turma = t(req.query.turma);
    const alunoId = t(req.query.alunoId);
    const cicloId = t(req.query.cicloId);
    const modalidade = t(req.query.modalidade);
    const status = t(req.query.status);
    const limite = Math.min(
      200,
      Math.max(1, Number(req.query.limit) || 100)
    );

    const consulta = {
      ...filtroInst
    };

    if (alunoId) {
      const aluno = await buscarAlunoInstituicao(req, alunoId);

      if (!aluno) {
        return erro(res, 404, 'Aluno não encontrado.');
      }

      consulta.aluno = {
        $in: idVariants(aluno._id)
      };
    } else if (turma) {
      const ids = await idsAlunosDaTurma(req, turma);

      if (!ids.length) {
        return res.json({
          ok: true,
          redacoes: [],
          resumo: {
            total: 0,
            corrigidas: 0,
            media: 0,
            apoiosPendentes: 0
          }
        });
      }

      consulta.aluno = {
        $in: ids.flatMap(idVariants)
      };
    }

    if (cicloId && mongoose.Types.ObjectId.isValid(cicloId)) {
      consulta.cicloId = oid(cicloId);
    }

    if (
      modalidade &&
      [
        'trilha_orientada',
        'pratica_livre',
        'avaliacao_institucional',
        'legado'
      ].includes(modalidade)
    ) {
      consulta.modalidade = modalidade;
    }

    if (status) {
      consulta.status = status;
    }

    const redacoes = await RedacaoEnem.find(consulta)
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();

    const idsAlunos = [
      ...new Set(
        redacoes
          .map((item) => String(item.aluno || ''))
          .filter(Boolean)
      )
    ];

    const alunos = await mapaAlunos(req, idsAlunos);

    const lista = redacoes
      .map((item) => ({
        redacao: item,
        aluno: alunos.get(String(item.aluno))
      }))
      .filter((item) => item.aluno)
      .map((item) =>
        resumoRedacao(item.redacao, item.aluno)
      );

    const notas = lista
      .map((item) => item.notaTotal)
      .filter((valorNota) => Number.isFinite(valorNota));

    return res.json({
      ok: true,
      redacoes: lista,
      resumo: {
        total: lista.length,
        corrigidas: lista.filter(
          (item) =>
            item.status === 'corrigida' ||
            item.status === 'apoio_professor_solicitado' ||
            item.status === 'apoio_professor_respondido'
        ).length,
        media: notas.length
          ? Math.round(
              notas.reduce((soma, valorNota) => soma + valorNota, 0) /
              notas.length
            )
          : 0,
        apoiosPendentes: lista.filter(
          (item) =>
            item.apoioProfessor?.status === 'solicitado'
        ).length
      }
    });
  } catch (error) {
    console.error('[redacao gestao listagem]', error);
    return erro(res, 500, 'Erro ao listar redações.');
  }
});

router.get('/redacoes/:id', async (req, res) => {
  try {
    const filtroInst = filtroInstituicaoRedacao(req);

    if (
      !filtroInst ||
      !mongoose.Types.ObjectId.isValid(req.params.id)
    ) {
      return erro(res, 400, 'Redação inválida.');
    }

    const redacao = await RedacaoEnem.findOne({
      _id: oid(req.params.id),
      ...filtroInst
    }).lean();

    if (!redacao) {
      return erro(res, 404, 'Redação não encontrada.');
    }

    const aluno = await buscarAlunoInstituicao(
      req,
      String(redacao.aluno)
    );

    if (!aluno) {
      return erro(res, 404, 'Aluno não encontrado.');
    }

    return res.json({
      ok: true,
      aluno: resumoAluno(aluno),
      redacao: {
        ...redacao,
        notaTotal: nota(redacao),
        competencias: competencias(redacao)
      }
    });
  } catch (error) {
    console.error('[redacao gestao detalhe]', error);
    return erro(res, 500, 'Erro ao carregar a redação.');
  }
});

router.post('/redacoes/:id/orientacao', async (req, res) => {
  try {
    const filtroInst = filtroInstituicaoRedacao(req);

    if (
      !filtroInst ||
      !mongoose.Types.ObjectId.isValid(req.params.id)
    ) {
      return erro(res, 400, 'Redação inválida.');
    }

    const observacao = t(req.body?.observacaoProfessor);

    if (!observacao) {
      return erro(res, 400, 'Escreva uma orientação.');
    }

    if (observacao.length > 3000) {
      return erro(
        res,
        400,
        'A orientação deve ter no máximo 3.000 caracteres.'
      );
    }

    const redacao = await RedacaoEnem.findOne({
      _id: oid(req.params.id),
      ...filtroInst
    });

    if (!redacao) {
      return erro(res, 404, 'Redação não encontrada.');
    }

    const aluno = await buscarAlunoInstituicao(
      req,
      String(redacao.aluno)
    );

    if (!aluno) {
      return erro(res, 404, 'Aluno não encontrado.');
    }

    redacao.apoioProfessor = {
      solicitado:
        redacao.apoioProfessor?.solicitado || true,
      status: 'respondido',
      focoTema:
        redacao.apoioProfessor?.focoTema ||
        redacao.correcaoIA?.focoPrincipal ||
        '',
      observacaoProfessor: observacao,
      professorId: usuarioId(req),
      professorNome: usuario(req).nome || '',
      respondidoEm: new Date()
    };

    redacao.status = 'apoio_professor_respondido';
    await redacao.save();

    return res.json({
      ok: true,
      mensagem: 'Orientação do professor registrada.',
      apoioProfessor: redacao.apoioProfessor
    });
  } catch (error) {
    console.error('[redacao gestao orientação]', error);
    return erro(res, 500, 'Erro ao registrar a orientação.');
  }
});

module.exports = router;
