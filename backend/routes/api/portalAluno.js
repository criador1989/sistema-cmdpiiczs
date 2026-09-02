'use strict';

const express = require('express');
const mongoose = require('mongoose');
const sharp = require('sharp');

const Aluno = require('../../models/Aluno');
const Instituicao = require('../../models/Instituicao');
const Usuario = require('../../models/Usuario');
const Simulado = require('../../models/Simulado');
const SimuladoResultado = require('../../models/SimuladoResultado');
const SimuladoCaderno = require('../../models/SimuladoCaderno');
const { autenticar } = require('../../middleware/autenticacao');
const { montarContextoPortal } = require('../../services/portalAlunoService');
const { getObjectFromS3 } = require('../../services/s3');

const router = express.Router();

router.use(autenticar);

function idUsuario(req) {
  return req.usuario?.id || req.usuario?._id || null;
}

function idAluno(req) {
  return req.usuario?.alunoId || null;
}

function idInstituicao(req) {
  return req.usuario?.instituicao || req.usuario?.tenantId || null;
}

function filtroInstituicao(valor) {
  if (!valor) return null;

  const candidatos = [String(valor).trim()].filter(Boolean);
  if (mongoose.Types.ObjectId.isValid(String(valor))) {
    candidatos.push(new mongoose.Types.ObjectId(String(valor)));
  }

  return {
    $or: [
      { instituicao: { $in: candidatos } },
      { tenantId: { $in: candidatos } }
    ]
  };
}


/* ARENA_AVATAR_V5517_HELPERS */
const AVATARES_ARENA = new Set(['cadete-azul', 'exploradora']);

function referenciaMongo(valor) {
  if (!valor) return null;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  return mongoose.Types.ObjectId.isValid(String(valor))
    ? new mongoose.Types.ObjectId(String(valor))
    : valor;
}

async function carregarAvatarArena(usuarioId, alunoId) {
  const usuarioRef = referenciaMongo(usuarioId);
  const alunoRef = referenciaMongo(alunoId);
  let avatar = null;

  if (usuarioRef) {
    const usuario = await Usuario.collection.findOne(
      { _id: usuarioRef },
      { projection: { 'arena.avatar': 1 } }
    ).catch(() => null);
    avatar = usuario?.arena?.avatar || null;
  }

  if (!AVATARES_ARENA.has(avatar) && alunoRef) {
    const aluno = await Aluno.collection.findOne(
      { _id: alunoRef },
      { projection: { 'arena.avatar': 1 } }
    ).catch(() => null);
    avatar = aluno?.arena?.avatar || null;
  }

  return AVATARES_ARENA.has(avatar) ? avatar : null;
}

router.get('/contexto', async (req, res) => {
  try {
    const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);

    if (tipo !== 'aluno') {
      return res.status(403).json({
        ok: false,
        mensagem: 'Esta rota é exclusiva do portal do aluno.'
      });
    }

    if (!alunoId || !instituicaoId) {
      return res.status(400).json({
        ok: false,
        mensagem: 'O vínculo do aluno ou da instituição não foi identificado.'
      });
    }

    const avatarArena = await carregarAvatarArena(idUsuario(req), alunoId);

    const escopo = filtroInstituicao(instituicaoId);
    const aluno = await Aluno.findOne({
      _id: alunoId,
      ...(escopo || {})
    })
      .select('_id nome turma codigoAcesso foto fotoOriginal fotoMedium fotoThumb instituicao tenantId ativo')
      .lean();

    if (!aluno || aluno.ativo === false) {
      return res.status(404).json({
        ok: false,
        mensagem: 'Aluno não encontrado ou inativo.'
      });
    }

    let instituicao = null;
    const instRef = aluno.instituicao || aluno.tenantId || instituicaoId;

    if (mongoose.Types.ObjectId.isValid(String(instRef))) {
      instituicao = await Instituicao.findById(instRef)
        .select('_id nome sigla slug')
        .lean()
        .catch(() => null);
    }

    const portal = montarContextoPortal(aluno.turma);
    const usuarioAluno = await Usuario.findById(idUsuario(req)).select('arena.avatar').lean().catch(() => null);
    const avatar = usuarioAluno?.arena?.avatar || 'cadete-azul';

    return res.json({
      ok: true,
      portal,
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        codigoAcesso: aluno.codigoAcesso || null,
        avatar: avatarArena || null,
        foto: aluno.fotoOriginal || aluno.fotoMedium || aluno.fotoThumb || aluno.foto || null,
        fotoThumbUrl: `/api/imagens/thumb/${aluno._id}`,
        avatar
      },
      instituicao: instituicao
        ? {
            _id: instituicao._id,
            nome: instituicao.nome,
            sigla: instituicao.sigla || null,
            slug: instituicao.slug || null
          }
        : {
            _id: String(instituicaoId),
            nome: null,
            sigla: null,
            slug: null
          },
      jogador: { avatar },
      sessao: {
        usuarioId: idUsuario(req),
        tipo
      }
    });
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET /contexto:', error);
    return res.status(500).json({
      ok: false,
      mensagem: 'Não foi possível carregar o contexto do portal do aluno.'
    });
  }
});

/* ARENA_AVATAR_V5517_ROUTE */
router.patch('/avatar', async (req, res) => {
  try {
    const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();
    if (tipo !== 'aluno') {
      return res.status(403).json({ ok: false, mensagem: 'Esta rota é exclusiva do aluno.' });
    }

    const avatar = String(req.body?.avatar || '').trim();
    if (!AVATARES_ARENA.has(avatar)) {
      return res.status(400).json({ ok: false, mensagem: 'Avatar inválido.' });
    }

    const usuarioRef = referenciaMongo(idUsuario(req));
    const alunoRef = referenciaMongo(idAluno(req));
    const atualizadoEm = new Date();
    const operacoes = [];

    if (usuarioRef) {
      operacoes.push(Usuario.collection.updateOne(
        { _id: usuarioRef },
        { $set: { 'arena.avatar': avatar, 'arena.avatarAtualizadoEm': atualizadoEm } }
      ));
    }

    if (alunoRef) {
      operacoes.push(Aluno.collection.updateOne(
        { _id: alunoRef },
        { $set: { 'arena.avatar': avatar, 'arena.avatarAtualizadoEm': atualizadoEm } }
      ));
    }

    if (!operacoes.length) {
      return res.status(400).json({ ok: false, mensagem: 'O vínculo do aluno não foi identificado.' });
    }

    await Promise.all(operacoes);
    return res.json({ ok: true, avatar });
  } catch (error) {
    console.error('[PORTAL-ALUNO] PATCH /avatar:', error);
    return res.status(500).json({ ok: false, mensagem: 'Não foi possível salvar o avatar do aluno.' });
  }
});



function somenteAluno(req, res) {
  const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();
  if (tipo === 'aluno') return true;
  res.status(403).json({ ok: false, mensagem: 'Esta rota é exclusiva do portal do aluno.' });
  return false;
}


function normalizarChaveRevisao(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function catalogoRevisao(item) {
  const mapa = new Map();

  const adicionar = (titulo, area) => {
    const t = String(titulo || '').trim();
    const a = String(area || '').trim();
    if (!t) return;
    const chave = normalizarChaveRevisao(`${a}__${t}`);
    if (!chave || mapa.has(chave)) return;
    mapa.set(chave, { chave, titulo: t, area: a });
  };

  (Array.isArray(item?.porConteudo) ? item.porConteudo : []).forEach((m) => {
    adicionar(
      m?.rotulo || m?.nome || m?.chave || m?.conteudo,
      m?.areaNome || m?.area || m?.componente || m?.eixoPedagogico
    );
  });

  (Array.isArray(item?.respostas) ? item.respostas : [])
    .filter((q) => q && q.situacao === 'ERRO')
    .forEach((q) => {
      adicionar(
        q.conteudo || q.macroconteudo || q.eixoPedagogico || q.componente || q.area || q.areaEnemNome,
        q.area || q.areaEnemNome || q.componente
      );
    });

  return mapa;
}

function resumoResultadoPortal(item) {
  const simulado = item.simulado || {};
  const resumo = item.resumoGeral || {};
  return {
    _id: item._id,
    simulado: {
      _id: simulado._id || item.simulado,
      titulo: simulado.titulo || 'Simulado',
      codigo: simulado.codigo || '',
      tipo: simulado.tipo || '',
      anoLetivo: simulado.anoLetivo || null,
      dias: Array.isArray(simulado.dias) ? simulado.dias : [],
    },
    turma: item.alunoTurmaSnapshot || '',
    idiomaEstrangeiro: item.idiomaEstrangeiro || 'NAO_INFORMADO',
    diasAusentes: Array.isArray(item.diasAusentes) ? item.diasAusentes : [],
    resumoGeral: resumo,
    porArea: Array.isArray(item.porArea) ? item.porArea : [],
    processadoEm: item.processadoEm || item.createdAt || null,
    versaoDiagnostico: item.versaoDiagnostico || null,
  };
}

router.get('/simulados', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    if (!alunoId || !instituicaoId) {
      return res.status(400).json({ ok: false, mensagem: 'O vínculo do aluno ou da instituição não foi identificado.' });
    }

    const resultados = await SimuladoResultado.find({
      aluno: alunoId,
      instituicao: instituicaoId,
    })
      .select('simulado alunoTurmaSnapshot idiomaEstrangeiro diasAusentes resumoGeral porArea processadoEm createdAt versaoDiagnostico')
      .populate({ path: 'simulado', model: Simulado, select: '_id titulo codigo tipo anoLetivo dias status' })
      .sort({ processadoEm: -1, createdAt: -1 })
      .lean();

    const itens = resultados
      .filter((item) => item.simulado && item.simulado.status !== 'arquivado')
      .map(resumoResultadoPortal);

    return res.json({ ok: true, resultados: itens, total: itens.length });
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET /simulados:', error);
    return res.status(500).json({ ok: false, mensagem: 'Não foi possível carregar os resultados dos simulados.' });
  }
});


function varianteVisualResultado(resultado, resposta) {
  const explicita = String(resposta?.variante || '').trim().toUpperCase();
  if (['INGLES', 'ESPANHOL', 'PADRAO'].includes(explicita)) return explicita;
  const idioma = String(resultado?.idiomaEstrangeiro || '').trim().toUpperCase();
  if (Number(resposta?.numero) <= 4 && ['INGLES', 'ESPANHOL'].includes(idioma)) return idioma;
  return 'PADRAO';
}

function chaveRevisaoQuestao(resposta) {
  return `${String(resposta?.codigoQuestao || '').trim().toUpperCase()}::${Number(resposta?.dia || 1)}`;
}

function mapaRevisoesQuestao(resultado) {
  const map = new Map();
  (Array.isArray(resultado?.revisoesQuestao) ? resultado.revisoesQuestao : []).forEach((item) => {
    const chave = `${String(item?.codigoQuestao || '').trim().toUpperCase()}::${Number(item?.dia || 1)}`;
    map.set(chave, item);
  });
  return map;
}

function localizarVisualQuestao(cadernosPorDia, resultado, resposta) {
  const dia = Number(resposta?.dia || 1);
  const caderno = cadernosPorDia.get(dia);
  if (!caderno) return { disponivel: false, paginas: [], variante: varianteVisualResultado(resultado, resposta) };
  const variante = varianteVisualResultado(resultado, resposta);
  const numero = Number(resposta?.numero);
  const visual = (caderno.questoes || []).find((item) => Number(item.numero) === numero && String(item.variante || 'PADRAO').toUpperCase() === variante)
    || (caderno.questoes || []).find((item) => Number(item.numero) === numero && String(item.variante || 'PADRAO').toUpperCase() === 'PADRAO');
  if (!visual) return { disponivel: false, paginas: [], variante };
  return {
    disponivel: true,
    paginas: Array.isArray(visual.paginas) ? visual.paginas.map(Number).filter(Boolean) : [],
    paginaInicial: Number(visual.paginaInicial || 0) || null,
    paginaFinal: Number(visual.paginaFinal || 0) || null,
    variante: String(visual.variante || variante).toUpperCase(),
    recortes: Array.isArray(visual.recortes)
      ? visual.recortes.map((r) => ({
          pagina: Number(r.pagina),
          coluna: Number(r.coluna || 0),
          x0: Number(r.x0), y0: Number(r.y0), x1: Number(r.x1), y1: Number(r.y1),
        })).filter((r) => Number.isInteger(r.pagina) && [r.x0,r.y0,r.x1,r.y1].every(Number.isFinite))
      : [],
  };
}

router.get('/simulados/:resultadoId', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    const resultadoId = String(req.params.resultadoId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(resultadoId)) {
      return res.status(400).json({ ok: false, mensagem: 'Resultado de simulado inválido.' });
    }

    const item = await SimuladoResultado.findOne({
      _id: resultadoId,
      aluno: alunoId,
      instituicao: instituicaoId,
    })
      .select('-respostasPreservadasAusencia -processadoPor')
      .populate({ path: 'simulado', model: Simulado, select: '_id titulo codigo tipo anoLetivo dias status configuracaoAnalise' })
      .lean();

    if (!item || !item.simulado || item.simulado.status === 'arquivado') {
      return res.status(404).json({ ok: false, mensagem: 'Resultado não encontrado para este aluno.' });
    }

    const cadernos = await SimuladoCaderno.find({
      instituicao: instituicaoId,
      simulado: item.simulado._id,
      status: 'pronto',
    }).select('dia questoes resumo').lean();
    const cadernosPorDia = new Map(cadernos.map((caderno) => [Number(caderno.dia), caderno]));
    const revisoesQuestao = mapaRevisoesQuestao(item);

    return res.json({
      ok: true,
      resultado: {
        ...resumoResultadoPortal(item),
        porDia: item.porDia || [],
        porComponente: item.porComponente || [],
        porEixo: item.porEixo || [],
        porConteudo: item.porConteudo || [],
        porHabilidade: item.porHabilidade || [],
        porHabilidadeEnem: item.porHabilidadeEnem || [],
        porCompetenciaEnem: item.porCompetenciaEnem || [],
        revisoesConteudo: Array.isArray(item.revisoesConteudo) ? item.revisoesConteudo : [],
        revisoesQuestao: Array.isArray(item.revisoesQuestao) ? item.revisoesQuestao : [],
        cadernosDisponiveis: cadernos.map((caderno) => ({ dia: Number(caderno.dia), resumo: caderno.resumo || {} })),
        questoesErradas: (Array.isArray(item.respostas) ? item.respostas : [])
          .filter((q) => q && q.situacao === 'ERRO')
          .map((q) => {
            const revisao = revisoesQuestao.get(chaveRevisaoQuestao(q)) || null;
            return {
            numero: q.numero,
            dia: q.dia,
            codigoQuestao: q.codigoQuestao || '',
            variante: varianteVisualResultado(item, q),
            resposta: q.resposta || '',
            gabarito: q.gabarito || '',
            area: q.area || q.areaEnemNome || '',
            componente: q.componente || '',
            macroconteudo: q.macroconteudo || '',
            eixoPedagogico: q.eixoPedagogico || '',
            conteudo: q.conteudo || '',
            habilidade: q.habilidade || '',
            habilidadeEnemCodigo: q.habilidadeEnemCodigo || '',
            habilidadeEnemDescricao: q.habilidadeEnemDescricao || '',
            competenciaEnemCodigo: q.competenciaEnemCodigo || '',
            competenciaEnemDescricao: q.competenciaEnemDescricao || '',
            visual: localizarVisualQuestao(cadernosPorDia, item, q),
            revisada: revisao?.revisada === true,
            revisadaEm: revisao?.revisadaEm || null,
          }})
          .sort((a, b) => (Number(a.dia || 0) - Number(b.dia || 0)) || (Number(a.numero || 0) - Number(b.numero || 0))),
        avisos: item.avisos || [],
      }
    });
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET /simulados/:resultadoId:', error);
    return res.status(500).json({ ok: false, mensagem: 'Não foi possível carregar o detalhamento do simulado.' });
  }
});




async function corpoS3ParaBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  if (body[Symbol.asyncIterator]) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return Buffer.from(body);
}

function limitarInteiro(valor, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(valor || 0))));
}

router.get('/simulados/:resultadoId/questoes/:dia/:numero/recortes/:indice', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    const resultadoId = String(req.params.resultadoId || '').trim();
    const dia = Number(req.params.dia);
    const numero = Number(req.params.numero);
    const indice = Number(req.params.indice);

    if (!mongoose.Types.ObjectId.isValid(resultadoId) || !Number.isInteger(dia) || !Number.isInteger(numero) || !Number.isInteger(indice) || indice < 0) {
      return res.status(400).json({ ok: false, mensagem: 'Questão ou recorte inválido.' });
    }

    const resultado = await SimuladoResultado.findOne({ _id: resultadoId, aluno: alunoId, instituicao: instituicaoId })
      .select('simulado idiomaEstrangeiro respostas')
      .lean();
    if (!resultado) return res.status(404).json({ ok: false, mensagem: 'Resultado não encontrado.' });

    const resposta = (resultado.respostas || []).find((q) => Number(q.dia || 1) === dia && Number(q.numero) === numero && q.situacao === 'ERRO');
    if (!resposta) return res.status(404).json({ ok: false, mensagem: 'Esta questão não pertence à revisão deste aluno.' });

    const caderno = await SimuladoCaderno.findOne({
      instituicao: instituicaoId,
      simulado: resultado.simulado,
      dia: Number(resposta.dia || 1),
      status: 'pronto',
    }).select('paginas questoes').lean();
    if (!caderno) return res.status(404).json({ ok: false, mensagem: 'O caderno desta prova ainda não foi publicado.' });

    const variante = varianteVisualResultado(resultado, resposta);
    const indiceQuestao = (caderno.questoes || []).find((q) => Number(q.numero) === numero && String(q.variante || 'PADRAO').toUpperCase() === variante)
      || (caderno.questoes || []).find((q) => Number(q.numero) === numero && String(q.variante || 'PADRAO').toUpperCase() === 'PADRAO');
    const recorte = indiceQuestao?.recortes?.[indice];
    if (!recorte) {
      return res.status(404).json({ ok: false, mensagem: 'O recorte preciso ainda não existe para esta questão. Reprocesse o caderno no módulo de Simulados.' });
    }

    const paginaInfo = (caderno.paginas || []).find((p) => Number(p.numero) === Number(recorte.pagina));
    if (!paginaInfo?.storageKey) return res.status(404).json({ ok: false, mensagem: 'Imagem da página não encontrada.' });

    const object = await getObjectFromS3({ key: paginaInfo.storageKey });
    const input = await corpoS3ParaBuffer(object.Body);
    const image = sharp(input, { failOn: 'none' });
    const metadata = await image.metadata();
    const largura = Number(metadata.width || paginaInfo.largura || 0);
    const altura = Number(metadata.height || paginaInfo.altura || 0);
    if (!largura || !altura) throw new Error('A página não possui dimensões válidas.');

    const left = limitarInteiro(Number(recorte.x0) * largura, 0, Math.max(0, largura - 2));
    const top = limitarInteiro(Number(recorte.y0) * altura, 0, Math.max(0, altura - 2));
    const right = limitarInteiro(Number(recorte.x1) * largura, left + 2, largura);
    const bottom = limitarInteiro(Number(recorte.y1) * altura, top + 2, altura);

    const buffer = await sharp(input, { failOn: 'none' })
      .extract({ left, top, width: right - left, height: bottom - top })
      .trim(8)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="questao-${numero}-trecho-${indice + 1}.jpg"`);
    return res.end(buffer);
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET recorte questão:', error);
    if (!res.headersSent) return res.status(500).json({ ok: false, mensagem: 'Não foi possível carregar o recorte da questão.' });
    return res.end();
  }
});

router.get('/simulados/:resultadoId/questoes/:dia/:numero/paginas/:pagina', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    const resultadoId = String(req.params.resultadoId || '').trim();
    const dia = Number(req.params.dia);
    const numero = Number(req.params.numero);
    const pagina = Number(req.params.pagina);
    if (!mongoose.Types.ObjectId.isValid(resultadoId) || !Number.isInteger(dia) || !Number.isInteger(numero) || !Number.isInteger(pagina)) {
      return res.status(400).json({ ok: false, mensagem: 'Questão ou página inválida.' });
    }

    const resultado = await SimuladoResultado.findOne({ _id: resultadoId, aluno: alunoId, instituicao: instituicaoId })
      .select('simulado idiomaEstrangeiro respostas')
      .lean();
    if (!resultado) return res.status(404).json({ ok: false, mensagem: 'Resultado não encontrado.' });

    const resposta = (resultado.respostas || []).find((q) => Number(q.dia || 1) === dia && Number(q.numero) === numero && q.situacao === 'ERRO');
    if (!resposta) return res.status(404).json({ ok: false, mensagem: 'Esta questão não pertence à revisão deste aluno.' });

    const caderno = await SimuladoCaderno.findOne({
      instituicao: instituicaoId,
      simulado: resultado.simulado,
      dia: Number(resposta.dia || 1),
      status: 'pronto',
    }).select('paginas questoes').lean();
    if (!caderno) return res.status(404).json({ ok: false, mensagem: 'O caderno desta prova ainda não foi publicado.' });

    const variante = varianteVisualResultado(resultado, resposta);
    const indiceQuestao = (caderno.questoes || []).find((q) => Number(q.numero) === numero && String(q.variante || 'PADRAO').toUpperCase() === variante)
      || (caderno.questoes || []).find((q) => Number(q.numero) === numero && String(q.variante || 'PADRAO').toUpperCase() === 'PADRAO');
    if (!indiceQuestao || !(indiceQuestao.paginas || []).map(Number).includes(pagina)) {
      return res.status(404).json({ ok: false, mensagem: 'Página não disponível para esta questão.' });
    }

    const paginaInfo = (caderno.paginas || []).find((p) => Number(p.numero) === pagina);
    if (!paginaInfo?.storageKey) return res.status(404).json({ ok: false, mensagem: 'Imagem da página não encontrada.' });

    const object = await getObjectFromS3({ key: paginaInfo.storageKey });
    res.setHeader('Content-Type', object.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="questao-${numero}-pagina-${pagina}.jpg"`);
    if (object.Body?.pipe) return object.Body.pipe(res);
    const bytes = await object.Body.transformToByteArray();
    return res.end(Buffer.from(bytes));
  } catch (error) {
    console.error('[PORTAL-ALUNO] GET pagina caderno:', error);
    if (!res.headersSent) return res.status(500).json({ ok: false, mensagem: 'Não foi possível carregar a página da prova.' });
    return res.end();
  }
});

router.patch('/simulados/:resultadoId/revisoes-questao', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;
    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    const resultadoId = String(req.params.resultadoId || '').trim();
    const codigoQuestao = String(req.body?.codigoQuestao || '').trim().toUpperCase();
    const dia = Number(req.body?.dia || 1);
    const revisada = req.body?.revisada === true;

    if (!mongoose.Types.ObjectId.isValid(resultadoId) || !codigoQuestao || !Number.isInteger(dia)) {
      return res.status(400).json({ ok: false, mensagem: 'A questão de revisão não foi identificada.' });
    }

    const item = await SimuladoResultado.findOne({ _id: resultadoId, aluno: alunoId, instituicao: instituicaoId })
      .select('respostas revisoesQuestao idiomaEstrangeiro')
      .lean();
    if (!item) return res.status(404).json({ ok: false, mensagem: 'Resultado não encontrado.' });

    const resposta = (item.respostas || []).find((q) => String(q.codigoQuestao || '').toUpperCase() === codigoQuestao && Number(q.dia || 1) === dia && q.situacao === 'ERRO');
    if (!resposta) return res.status(400).json({ ok: false, mensagem: 'Esta questão não pertence à lista de erros deste resultado.' });

    const agora = new Date();
    const atuais = Array.isArray(item.revisoesQuestao) ? item.revisoesQuestao : [];
    const indice = atuais.findIndex((r) => String(r?.codigoQuestao || '').toUpperCase() === codigoQuestao && Number(r?.dia || 1) === dia);
    const registro = {
      codigoQuestao,
      numero: Number(resposta.numero || 0),
      dia,
      variante: varianteVisualResultado(item, resposta),
      revisada,
      revisadaEm: revisada ? agora : null,
      atualizadoEm: agora,
    };

    const update = indice >= 0
      ? { $set: { [`revisoesQuestao.${indice}`]: registro } }
      : { $push: { revisoesQuestao: registro } };
    const atualizado = await SimuladoResultado.findOneAndUpdate(
      { _id: resultadoId, aluno: alunoId, instituicao: instituicaoId },
      update,
      { new: true }
    ).select('revisoesQuestao').lean();

    return res.json({ ok: true, revisao: registro, revisoesQuestao: atualizado?.revisoesQuestao || [] });
  } catch (error) {
    console.error('[PORTAL-ALUNO] PATCH revisoes-questao:', error);
    return res.status(500).json({ ok: false, mensagem: 'Não foi possível atualizar a revisão da questão.' });
  }
});

router.patch('/simulados/:resultadoId/revisoes-conteudo', async (req, res) => {
  try {
    if (!somenteAluno(req, res)) return;

    const alunoId = idAluno(req);
    const instituicaoId = idInstituicao(req);
    const resultadoId = String(req.params.resultadoId || '').trim();
    const chave = String(req.body?.chave || '').trim();
    const revisado = req.body?.revisado === true;

    if (!mongoose.Types.ObjectId.isValid(resultadoId)) {
      return res.status(400).json({ ok: false, mensagem: 'Resultado de simulado inválido.' });
    }
    if (!chave) {
      return res.status(400).json({ ok: false, mensagem: 'O conteúdo de revisão não foi identificado.' });
    }

    const item = await SimuladoResultado.findOne({
      _id: resultadoId,
      aluno: alunoId,
      instituicao: instituicaoId,
    })
      .select('porConteudo respostas revisoesConteudo')
      .lean();

    if (!item) {
      return res.status(404).json({ ok: false, mensagem: 'Resultado não encontrado para este aluno.' });
    }

    const catalogo = catalogoRevisao(item);
    const permitido = catalogo.get(chave);
    if (!permitido) {
      return res.status(400).json({ ok: false, mensagem: 'Este conteúdo não pertence ao plano de revisão deste resultado.' });
    }

    const agora = new Date();
    const atuais = Array.isArray(item.revisoesConteudo) ? item.revisoesConteudo : [];
    const indice = atuais.findIndex((r) => String(r?.chave || '') === chave);
    const registro = {
      chave,
      titulo: permitido.titulo,
      area: permitido.area,
      revisado,
      revisadoEm: revisado ? agora : null,
      atualizadoEm: agora,
    };

    let update;
    if (indice >= 0) {
      update = {
        $set: {
          [`revisoesConteudo.${indice}`]: registro,
        }
      };
    } else {
      update = { $push: { revisoesConteudo: registro } };
    }

    const atualizado = await SimuladoResultado.findOneAndUpdate(
      { _id: resultadoId, aluno: alunoId, instituicao: instituicaoId },
      update,
      { new: true }
    ).select('revisoesConteudo').lean();

    return res.json({
      ok: true,
      revisao: registro,
      revisoesConteudo: Array.isArray(atualizado?.revisoesConteudo) ? atualizado.revisoesConteudo : [],
    });
  } catch (error) {
    console.error('[PORTAL-ALUNO] PATCH /simulados/:resultadoId/revisoes-conteudo:', error);
    return res.status(500).json({ ok: false, mensagem: 'Não foi possível atualizar o controle de revisão.' });
  }
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, modulo: 'portal-aluno', versao: '1.0.0' });
});

module.exports = router;
