'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const QuestionarioTentativa = require('../../models/QuestionarioTentativa');
const { autenticar } = require('../../middleware/autenticacao');
const { extrairSerie } = require('../../services/portalAlunoService');

const router = express.Router();
router.use(autenticar);

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    return String(valor._id || valor.id || valor.slug || valor.codigo || valor.nome || valor);
  }
  return String(valor).trim();
}

function normalizar(valor) {
  return texto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°ª]/g, ' ')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

function candidatos(valor) {
  const valorTexto = texto(valor);
  if (!valorTexto) return [];
  const lista = [valorTexto];
  if (mongoose.Types.ObjectId.isValid(valorTexto)) {
    lista.unshift(new mongoose.Types.ObjectId(valorTexto));
  }
  return lista;
}

function usuario(req) {
  return req.usuario || {};
}

function alunoAtualId(req) {
  const u = usuario(req);
  return u.alunoId || null;
}

function instituicaoDoUsuario(req) {
  const u = usuario(req);
  return u.instituicao || u.instituicaoId || u.tenantId || req.instituicaoId || req.tenantId || null;
}

function diasRecentes(quantidade = 7) {
  const dias = [];
  const agora = new Date();
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const data = new Date(agora.getTime() - i * 86400000);
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Rio_Branco',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(data);
    const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
    dias.push(`${mapa.year}-${mapa.month}-${mapa.day}`);
  }
  return [...new Set(dias)];
}

function rotuloDia(dia) {
  const [ano, mes, data] = String(dia).split('-').map(Number);
  const valor = new Date(Date.UTC(ano, Math.max(0, (mes || 1) - 1), data || 1, 15));
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    timeZone: 'America/Rio_Branco'
  }).format(valor).replace('.', '');
}

function idsParticipantes(participantes) {
  return participantes.flatMap((aluno) => candidatos(aluno?._id));
}

function filtroInstituicaoRaw(valor) {
  const refs = candidatos(valor);
  if (!refs.length) return null;
  return {
    $or: [
      { instituicao: { $in: refs } },
      { tenantId: { $in: refs } }
    ]
  };
}

function fotoAluno(aluno) {
  return aluno?.fotoOriginal || aluno?.fotoMedium || aluno?.fotoThumb || aluno?.foto || null;
}

function urlFoto(aluno) {
  return aluno?._id ? `/api/imagens/thumb/${aluno._id}` : null;
}

async function localizarAlunoAtual(req) {
  const id = alunoAtualId(req);
  const refs = candidatos(id);
  if (!refs.length) return null;

  return Aluno.collection.findOne(
    { _id: { $in: refs } },
    {
      projection: {
        _id: 1,
        nome: 1,
        turma: 1,
        foto: 1,
        fotoOriginal: 1,
        fotoMedium: 1,
        fotoThumb: 1,
        instituicao: 1,
        tenantId: 1,
        ativo: 1
      }
    }
  );
}

async function carregarParticipantes({ alunoAtual, instituicao, escopo }) {
  const filtroInstituicao = filtroInstituicaoRaw(instituicao);
  const filtro = {
    ativo: { $ne: false },
    ...(filtroInstituicao || {})
  };

  // Não ordenar no MongoDB aqui. Como a consulta aceita mais de um formato
  // de instituição/tenant, o banco pode precisar executar uma ordenação ampla
  // sem índice e ultrapassar o limite interno de memória. A lista da escola é
  // pequena o suficiente para ser ordenada com segurança no Node.js.
  let todos = await Aluno.collection.find(filtro, {
    projection: {
      _id: 1,
      nome: 1,
      turma: 1,
      foto: 1,
      fotoOriginal: 1,
      fotoMedium: 1,
      fotoThumb: 1,
      instituicao: 1,
      tenantId: 1,
      ativo: 1
    }
  })
    .batchSize(500)
    .limit(10000)
    .toArray();

  if (!todos.length) todos = [alunoAtual];

  todos.sort((a, b) =>
    texto(a?.nome).localeCompare(texto(b?.nome), 'pt-BR', { sensitivity: 'base' })
  );

  const turmaAtual = normalizar(alunoAtual.turma);
  let participantes = todos.filter((aluno) => {
    if (escopo === 'turma') return normalizar(aluno.turma) === turmaAtual;
    const serie = extrairSerie(texto(aluno.turma));
    return Number(serie) >= 6 && Number(serie) <= 9;
  });

  if (!participantes.some((aluno) => String(aluno._id) === String(alunoAtual._id))) {
    participantes.push(alunoAtual);
  }

  return participantes;
}

function filtroTentativas({ instituicao, participantes }) {
  const alunoRefs = idsParticipantes(participantes);
  const instRefs = candidatos(instituicao);
  const filtro = {
    aluno: { $in: alunoRefs },
    origemExperiencia: 'arena_diaria',
    status: 'finalizado'
  };
  if (instRefs.length) filtro.instituicao = { $in: instRefs };
  return filtro;
}

async function reduzirTentativasEmMemoria(filtro) {
  const tentativas = await QuestionarioTentativa.collection.find(filtro, {
    projection: {
      aluno: 1,
      xpGanho: 1,
      moedasGanhas: 1,
      totalQuestoes: 1,
      acertos: 1,
      updatedAt: 1,
      diaReferencia: 1
    }
  }).toArray();

  const mapa = new Map();
  for (const tentativa of tentativas) {
    const chave = String(tentativa.aluno);
    const atual = mapa.get(chave) || {
      _id: chave,
      xp: 0,
      moedas: 0,
      missoes: 0,
      questoes: 0,
      acertos: 0,
      atualizadoEm: null
    };
    atual.xp += Number(tentativa.xpGanho || 0);
    atual.moedas += Number(tentativa.moedasGanhas || 0);
    atual.missoes += 1;
    atual.questoes += Number(tentativa.totalQuestoes || 0);
    atual.acertos += Number(tentativa.acertos || 0);
    if (!atual.atualizadoEm || new Date(tentativa.updatedAt || 0) > new Date(atual.atualizadoEm || 0)) {
      atual.atualizadoEm = tentativa.updatedAt || null;
    }
    mapa.set(chave, atual);
  }
  return mapa;
}

async function agregarProgresso({ instituicao, participantes }) {
  if (!participantes.length) return new Map();

  const filtroComInstituicao = filtroTentativas({ instituicao, participantes });
  let mapa = await reduzirTentativasEmMemoria(filtroComInstituicao);

  // Compatibilidade com registros antigos em que a instituição não foi gravada
  // no mesmo formato do cadastro do aluno. Os IDs dos alunos continuam sendo o
  // critério seguro de vínculo.
  if (![...mapa.values()].some((item) => Number(item.xp || 0) > 0)) {
    const filtroSemInstituicao = {
      aluno: { $in: idsParticipantes(participantes) },
      origemExperiencia: 'arena_diaria',
      status: 'finalizado'
    };
    mapa = await reduzirTentativasEmMemoria(filtroSemInstituicao);
  }

  return mapa;
}

async function carregarTentativasAluno({ alunoId, instituicao, dias = null }) {
  const alunoRefs = candidatos(alunoId);
  const instRefs = candidatos(instituicao);
  const base = {
    aluno: { $in: alunoRefs },
    origemExperiencia: 'arena_diaria',
    status: 'finalizado'
  };
  if (Array.isArray(dias)) base.diaReferencia = { $in: dias };
  if (instRefs.length) base.instituicao = { $in: instRefs };

  let registros = await QuestionarioTentativa.collection.find(base, {
    projection: { diaReferencia: 1, xpGanho: 1, updatedAt: 1 }
  }).sort({ diaReferencia: -1, updatedAt: -1 }).toArray();

  if (!registros.length && instRefs.length) {
    delete base.instituicao;
    registros = await QuestionarioTentativa.collection.find(base, {
      projection: { diaReferencia: 1, xpGanho: 1, updatedAt: 1 }
    }).sort({ diaReferencia: -1, updatedAt: -1 }).toArray();
  }

  return registros;
}

async function carregarTrajetoria({ instituicao, alunoId, xpTotal }) {
  const dias = diasRecentes(7);
  const tentativas = await carregarTentativasAluno({ alunoId, instituicao, dias });
  const porDia = new Map();

  for (const tentativa of tentativas) {
    const dia = texto(tentativa.diaReferencia);
    if (!dia) continue;
    porDia.set(dia, (porDia.get(dia) || 0) + Number(tentativa.xpGanho || 0));
  }

  const xpNaJanela = dias.reduce((soma, dia) => soma + Number(porDia.get(dia) || 0), 0);
  let acumulado = Math.max(0, Number(xpTotal || 0) - xpNaJanela);

  return dias.map((dia) => {
    const xpDia = Number(porDia.get(dia) || 0);
    acumulado += xpDia;
    return {
      dia,
      rotulo: rotuloDia(dia),
      xpDia,
      xpAcumulado: acumulado
    };
  });
}

async function calcularSequencia({ instituicao, alunoId }) {
  const registros = await carregarTentativasAluno({ alunoId, instituicao });
  const diasAtivos = new Set(registros.map((item) => texto(item.diaReferencia)).filter(Boolean));
  let sequencia = 0;
  for (const dia of diasRecentes(90).reverse()) {
    if (!diasAtivos.has(dia)) break;
    sequencia += 1;
  }
  return sequencia;
}

router.get('/', async (req, res) => {
  let etapa = 'início';
  try {
    const tipo = texto(usuario(req).tipo).toLowerCase();
    if (tipo && tipo !== 'aluno') {
      return res.status(403).json({ ok: false, mensagem: 'Esta rota é exclusiva do Portal do Aluno.' });
    }

    etapa = 'identificação do aluno';
    const alunoAtual = await localizarAlunoAtual(req);
    if (!alunoAtual || alunoAtual.ativo === false) {
      return res.status(404).json({ ok: false, mensagem: 'Aluno não encontrado ou inativo.' });
    }

    const instituicao = alunoAtual.instituicao || alunoAtual.tenantId || instituicaoDoUsuario(req);
    if (!instituicao) {
      return res.status(400).json({ ok: false, mensagem: 'A instituição do aluno não foi identificada.' });
    }

    const escopoSolicitado = texto(req.query.escopo).toLowerCase();
    const escopo = escopoSolicitado === 'geral' ? 'geral' : 'turma';

    etapa = 'carregamento dos participantes';
    const participantes = await carregarParticipantes({ alunoAtual, instituicao, escopo });

    etapa = 'cálculo do progresso';
    const progresso = await agregarProgresso({ instituicao, participantes });

    const ranking = participantes.map((aluno) => {
      const dados = progresso.get(String(aluno._id)) || {};
      const questoes = Number(dados.questoes || 0);
      const acertos = Number(dados.acertos || 0);
      return {
        alunoId: String(aluno._id),
        nome: texto(aluno.nome) || 'Aluno',
        turma: texto(aluno.turma),
        foto: fotoAluno(aluno),
        fotoThumbUrl: urlFoto(aluno),
        xp: Number(dados.xp || 0),
        moedas: Number(dados.moedas || 0),
        missoes: Number(dados.missoes || 0),
        questoes,
        acertos,
        percentualAcerto: questoes ? Math.round((acertos / questoes) * 100) : 0,
        atualizadoEm: dados.atualizadoEm || null
      };
    })
      .sort((a, b) =>
        b.xp - a.xp ||
        b.missoes - a.missoes ||
        b.moedas - a.moedas ||
        a.nome.localeCompare(b.nome, 'pt-BR')
      )
      .map((item, index) => ({ ...item, posicao: index + 1 }));

    const atual = ranking.find((item) => item.alunoId === String(alunoAtual._id)) || {
      alunoId: String(alunoAtual._id),
      nome: texto(alunoAtual.nome) || 'Aluno',
      turma: texto(alunoAtual.turma),
      foto: fotoAluno(alunoAtual),
      fotoThumbUrl: urlFoto(alunoAtual),
      xp: 0,
      moedas: 0,
      missoes: 0,
      questoes: 0,
      acertos: 0,
      percentualAcerto: 0,
      posicao: ranking.length + 1
    };

    etapa = 'trajetória e sequência';
    const [trajetoria, sequencia] = await Promise.all([
      carregarTrajetoria({ instituicao, alunoId: alunoAtual._id, xpTotal: atual.xp }),
      calcularSequencia({ instituicao, alunoId: alunoAtual._id })
    ]);

    return res.json({
      ok: true,
      escopo,
      temporada: {
        ano: new Date().getFullYear(),
        rotulo: `Temporada Fundamental II · ${new Date().getFullYear()}`
      },
      alunoAtual: { ...atual, sequencia },
      resumo: {
        xp: atual.xp,
        moedas: atual.moedas,
        missoes: atual.missoes,
        questoes: atual.questoes,
        percentualAcerto: atual.percentualAcerto,
        posicao: atual.posicao,
        totalParticipantes: ranking.length,
        sequencia
      },
      top5: ranking.slice(0, 5),
      ranking,
      trajetoria,
      atualizadoEm: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[RANKING-ARENA] Falha na etapa "${etapa}":`, error);
    const local = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
    return res.status(500).json({
      ok: false,
      mensagem: local
        ? `Não foi possível carregar o ranking real da Arena. Etapa: ${etapa}. ${error?.message || error}`
        : 'Não foi possível carregar o ranking real da Arena.'
    });
  }
});

module.exports = router;
