'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { autenticar } = require('../../middleware/autenticacao');
const Aluno = require('../../models/Aluno');
const EnemConteudo = require('../../models/EnemConteudo');
const AlunoEnemProgresso = require('../../models/AlunoEnemProgresso');
const AlunoEnemPerfil = require('../../models/AlunoEnemPerfil');
const RedacaoEnem = require('../../models/RedacaoEnem');
const RepertorioEnem = require('../../models/RepertorioEnem');
const {
  carregarPainelAluno,
  sincronizarPerfilAluno,
  conteudosDisponiveis,
  filtroInstituicao,
  filtroAluno,
  valor
} = require('../../services/enem/enemTrilhaService');
const { garantirDiagnostico } = require('../../services/enem/enemDiagnosticoService');

const router = express.Router();
router.use(autenticar);

function t(v) { return String(v || '').trim(); }
function u(req) { return req.usuario || {}; }
function alunoId(req) { return u(req).alunoId || (t(u(req).tipo).toLowerCase() === 'aluno' ? (u(req)._id || u(req).id) : null); }
function usuarioId(req) { return u(req)._id || u(req).id || null; }
function instituicao(req) { return u(req).instituicao || u(req).tenantId || req.tenantId || req.instituicaoId || req.tenant?._id || null; }
function turma(req) { return u(req).turma || u(req).turmaId || (Array.isArray(u(req).turmas) ? u(req).turmas[0] : null) || null; }
function perfil(req) { return t(u(req).tipo || u(req).perfil || u(req).role || u(req).cargo || u(req).funcao).toLowerCase(); }
function gestor(req) { const p = perfil(req); return ['admin','master','superadmin','coorden','diretor','direcao','professor'].some((x) => p.includes(x)); }
function estudante(req) { return perfil(req) === 'aluno'; }
function erro(res, status, mensagem) { return res.status(status).json({ ok: false, erro: mensagem }); }

function candidatos(v) {
  const raw = valor(v);
  if (!raw) return [];
  const s = t(raw);
  const out = [s];
  if (mongoose.Types.ObjectId.isValid(s)) out.push(new mongoose.Types.ObjectId(s));
  return out;
}

function escopoConteudo(req) {
  const inst = candidatos(instituicao(req));
  return { $or: [{ instituicao: 'global' }, ...(inst.length ? [{ instituicao: { $in: inst } }] : [])] };
}

async function buscarConteudoAtivo(req, codigo) {
  const itens = await EnemConteudo.find({ codigo, status: 'ativo', ...escopoConteudo(req) }).limit(5).lean();
  if (!itens.length) return null;
  return itens.find((item) => t(item.instituicao).toLowerCase() !== 'global') || itens[0];
}



router.post('/diagnostico/preparar', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');

    const inst = instituicao(req);
    const aluno = alunoId(req);
    if (!inst || !aluno) return erro(res, 400, 'Aluno ou instituição não identificado.');

    const existente = await RedacaoEnem.findOne({
      ...(filtroInstituicao(inst) || {}),
      ...(filtroAluno(aluno) || {}),
      naturezaCiclo: 'diagnostico',
      status: { $in: ['corrigida', 'apoio_professor_solicitado', 'apoio_professor_respondido'] }
    }).sort({ createdAt: -1 }).select('_id cicloId temaId status').lean();

    if (existente) {
      await sincronizarPerfilAluno({ instituicao: inst, aluno, turma: turma(req), fonte: 'redacao' });
      return res.json({
        ok: true,
        diagnosticoRealizado: true,
        mensagem: 'Seu diagnóstico inicial já foi realizado. A trilha foi atualizada com base no resultado.',
        redacaoId: existente._id
      });
    }

    const preparado = await garantirDiagnostico({
      instituicao: inst,
      criadoPor: usuarioId(req)
    });

    return res.json({
      ok: true,
      diagnosticoRealizado: false,
      tema: preparado.tema,
      ciclo: preparado.ciclo,
      url: `/aluno-redacao.html?modo=diagnostico&ciclo=${encodeURIComponent(String(preparado.ciclo._id))}`
    });
  } catch (e) {
    console.error('[ENEM PORTAL] preparar diagnostico', e);
    return erro(res, 500, 'Não foi possível preparar a redação diagnóstica.');
  }
});

router.get('/painel', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');
    const inst = instituicao(req);
    const aluno = alunoId(req);
    if (!inst || !aluno) return erro(res, 400, 'Aluno ou instituição não identificado.');
    const dados = await carregarPainelAluno({ instituicao: inst, aluno, turma: turma(req) });
    return res.json({ ok: true, ...dados });
  } catch (e) {
    console.error('[ENEM PORTAL] painel', e);
    return erro(res, 500, 'Não foi possível carregar a trilha ENEM.');
  }
});

router.get('/trilha', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');
    const dados = await carregarPainelAluno({ instituicao: instituicao(req), aluno: alunoId(req), turma: turma(req) });
    return res.json({ ok: true, perfil: dados.perfil, trilha: dados.trilha, proximo: dados.proximo });
  } catch (e) {
    console.error('[ENEM PORTAL] trilha', e);
    return erro(res, 500, 'Erro ao carregar a trilha.');
  }
});

router.get('/conteudos/:codigo', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');
    const codigo = t(req.params.codigo).toUpperCase();
    const item = await buscarConteudoAtivo(req, codigo);
    if (!item) return erro(res, 404, 'Conteúdo não encontrado.');
    const progresso = await AlunoEnemProgresso.findOne({
      ...(filtroInstituicao(instituicao(req)) || {}),
      ...(filtroAluno(alunoId(req)) || {}),
      conteudoId: item._id
    }).lean();
    return res.json({ ok: true, conteudo: item, progresso });
  } catch (e) {
    return erro(res, 500, 'Erro ao carregar o conteúdo.');
  }
});

async function atualizarProgresso(req, status) {
  const codigo = t(req.params.codigo).toUpperCase();
  const item = await buscarConteudoAtivo(req, codigo);
  if (!item) return null;
  const agora = new Date();
  const update = {
    instituicao: valor(instituicao(req)),
    aluno: valor(alunoId(req)),
    conteudoId: item._id,
    codigoConteudo: item.codigo,
    status,
    percentual: status === 'concluido' ? 100 : 10,
    origem: 'trilha'
  };
  if (status === 'em_andamento') update.iniciadoEm = agora;
  if (status === 'concluido') {
    update.iniciadoEm = agora;
    update.concluidoEm = agora;
    update.resultado = req.body?.resultado || null;
  }
  const filtro = {
    ...(filtroInstituicao(instituicao(req)) || {}),
    ...(filtroAluno(alunoId(req)) || {}),
    conteudoId: item._id
  };
  const existente = await AlunoEnemProgresso.findOne(filtro).select('_id iniciadoEm').lean();
  if (existente?.iniciadoEm && status === 'concluido') update.iniciadoEm = existente.iniciadoEm;

  let progresso;
  if (existente?._id) {
    progresso = await AlunoEnemProgresso.findByIdAndUpdate(existente._id, { $set: update }, { new: true, runValidators: true }).lean();
  } else {
    try {
      const criado = await AlunoEnemProgresso.create(update);
      progresso = criado.toObject();
    } catch (e) {
      if (e?.code !== 11000) throw e;
      const concorrente = await AlunoEnemProgresso.findOne(filtro).select('_id').lean();
      if (!concorrente?._id) throw e;
      progresso = await AlunoEnemProgresso.findByIdAndUpdate(concorrente._id, { $set: update }, { new: true, runValidators: true }).lean();
    }
  }
  await sincronizarPerfilAluno({ instituicao: instituicao(req), aluno: alunoId(req), turma: turma(req), fonte: 'progresso' });
  return { item, progresso };
}

router.post('/progresso/:codigo/iniciar', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');
    const r = await atualizarProgresso(req, 'em_andamento');
    if (!r) return erro(res, 404, 'Conteúdo não encontrado.');
    return res.json({ ok: true, progresso: r.progresso });
  } catch (e) {
    console.error('[ENEM PORTAL] iniciar', e);
    return erro(res, 500, 'Erro ao iniciar a atividade.');
  }
});

router.post('/progresso/:codigo/concluir', async (req, res) => {
  try {
    if (!estudante(req)) return erro(res, 403, 'Esta rota é exclusiva do aluno.');

    const codigo = t(req.params.codigo).toUpperCase();
    const item = await buscarConteudoAtivo(req, codigo);
    if (!item) return erro(res, 404, 'Conteúdo não encontrado.');

    if (item.tipo === 'diagnostico') {
      return erro(
        res,
        409,
        'A redação diagnóstica é concluída automaticamente após o envio e a correção. Faça a redação para registrar seu diagnóstico.'
      );
    }

    const r = await atualizarProgresso(req, 'concluido');
    if (!r) return erro(res, 404, 'Conteúdo não encontrado.');
    const painel = await carregarPainelAluno({ instituicao: instituicao(req), aluno: alunoId(req), turma: turma(req) });
    return res.json({ ok: true, mensagem: 'Atividade concluída.', progresso: r.progresso, perfil: painel.perfil, proximo: painel.proximo });
  } catch (e) {
    console.error('[ENEM PORTAL] concluir', e);
    return erro(res, 500, 'Erro ao concluir a atividade.');
  }
});

router.get('/repertorios', async (req, res) => {
  try {
    if (!estudante(req) && !gestor(req)) return erro(res, 403, 'Acesso negado.');
    const inst = candidatos(instituicao(req));
    const consulta = {
      status: 'ativo',
      $or: [{ instituicao: 'global' }, ...(inst.length ? [{ instituicao: { $in: inst } }] : [])]
    };
    if (t(req.query.area)) consulta.area = t(req.query.area);
    const itens = await RepertorioEnem.find(consulta).sort({ area: 1, titulo: 1 }).limit(300).lean();
    const porCodigo = new Map();
    itens.forEach((item) => {
      const codigo = t(item.codigo).toUpperCase();
      const atual = porCodigo.get(codigo);
      const especifico = t(item.instituicao).toLowerCase() !== 'global';
      const atualEspecifico = atual && t(atual.instituicao).toLowerCase() !== 'global';
      if (!atual || (especifico && !atualEspecifico)) porCodigo.set(codigo, item);
    });
    const repertorios = [...porCodigo.values()].sort((a, b) => t(a.area).localeCompare(t(b.area), 'pt-BR') || t(a.titulo).localeCompare(t(b.titulo), 'pt-BR'));
    return res.json({ ok: true, repertorios });
  } catch (e) {
    return erro(res, 500, 'Erro ao carregar repertórios.');
  }
});

router.get('/gestao/resumo', async (req, res) => {
  try {
    if (!gestor(req)) return erro(res, 403, 'Acesso negado.');
    const fInst = filtroInstituicao(instituicao(req));
    if (!fInst) return erro(res, 400, 'Instituição não identificada.');
    const perfis = await AlunoEnemPerfil.find(fInst).sort({ notaAtual: 1 }).limit(1000).lean();
    const ids = perfis.map((p) => String(p.aluno)).filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const alunos = ids.length ? await Aluno.find({ _id: { $in: ids } }).select('nome turma').lean() : [];
    const mapa = new Map(alunos.map((a) => [String(a._id), a]));
    const medias = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
    perfis.forEach((p) => Object.keys(medias).forEach((k) => { medias[k] += Number(p.atual?.[k]) || 0; }));
    const n = perfis.length || 1;
    Object.keys(medias).forEach((k) => { medias[k] = Math.round(medias[k] / n); });
    const prioridades = {};
    perfis.forEach((p) => { prioridades[p.competenciaPrioritaria] = (prioridades[p.competenciaPrioritaria] || 0) + 1; });
    return res.json({
      ok: true,
      resumo: {
        alunosComPerfil: perfis.length,
        mediaNotaAtual: perfis.length ? Math.round(perfis.reduce((s, p) => s + (Number(p.notaAtual) || 0), 0) / perfis.length) : 0,
        mediaEvolucao: perfis.length ? Math.round(perfis.reduce((s, p) => s + (Number(p.evolucaoTotal) || 0), 0) / perfis.length) : 0,
        mediasCompetencias: medias,
        prioridades
      },
      alunosPrioritarios: perfis.slice(0, 50).map((p) => ({
        aluno: mapa.get(String(p.aluno)) || { _id: p.aluno, nome: 'Aluno', turma: p.turma || '' },
        notaAtual: p.notaAtual,
        evolucaoTotal: p.evolucaoTotal,
        competenciaPrioritaria: p.competenciaPrioritaria,
        progressoPercentual: p.progressoPercentual
      }))
    });
  } catch (e) {
    console.error('[ENEM PORTAL] gestao resumo', e);
    return erro(res, 500, 'Erro ao carregar indicadores ENEM.');
  }
});

router.get('/admin/conteudos', async (req, res) => {
  try {
    if (!gestor(req)) return erro(res, 403, 'Acesso negado.');
    const itens = await conteudosDisponiveis(instituicao(req));
    return res.json({ ok: true, conteudos: itens });
  } catch (e) { return erro(res, 500, 'Erro ao listar conteúdos.'); }
});

router.post('/admin/conteudos', async (req, res) => {
  try {
    if (!gestor(req)) return erro(res, 403, 'Acesso negado.');
    const b = req.body || {};
    if (!t(b.codigo) || !t(b.titulo) || !t(b.unidade)) return erro(res, 400, 'Código, título e unidade são obrigatórios.');
    const item = await EnemConteudo.create({
      instituicao: valor(instituicao(req)), codigo: t(b.codigo).toUpperCase(), curso: t(b.curso) || 'Redação ENEM', unidade: t(b.unidade),
      ordemUnidade: Number(b.ordemUnidade) || 0, ordem: Number(b.ordem) || 0,
      tipo: ['diagnostico','aula','oficina','atividade','checklist','leitura','simulado'].includes(b.tipo) ? b.tipo : 'aula',
      titulo: t(b.titulo), resumo: t(b.resumo), conteudo: t(b.conteudo),
      competencia: ['C1','C2','C3','C4','C5','GERAL'].includes(b.competencia) ? b.competencia : 'GERAL',
      fragilidades: Array.isArray(b.fragilidades) ? b.fragilidades.map(t).filter(Boolean) : [],
      duracaoMinutos: Math.max(1, Number(b.duracaoMinutos) || 10), preRequisitos: Array.isArray(b.preRequisitos) ? b.preRequisitos : [],
      rotaAcao: t(b.rotaAcao), rotuloAcao: t(b.rotuloAcao) || 'Abrir atividade', obrigatorio: b.obrigatorio !== false,
      fonte: b.fonte || {}, status: ['ativo','inativo','arquivado'].includes(b.status) ? b.status : 'ativo', criadoPor: usuarioId(req)
    });
    return res.status(201).json({ ok: true, conteudo: item });
  } catch (e) {
    if (e?.code === 11000) return erro(res, 409, 'Já existe conteúdo com esse código para a instituição.');
    return erro(res, 500, 'Erro ao criar conteúdo.');
  }
});

router.patch('/admin/conteudos/:id', async (req, res) => {
  try {
    if (!gestor(req)) return erro(res, 403, 'Acesso negado.');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return erro(res, 400, 'Conteúdo inválido.');
    const inst = candidatos(instituicao(req));
    const item = await EnemConteudo.findOne({ _id: req.params.id, instituicao: { $in: inst } });
    if (!item) return erro(res, 404, 'Conteúdo institucional não encontrado. Conteúdo global não pode ser editado por esta rota.');
    const b = req.body || {};
    ['titulo','resumo','conteudo','unidade','rotaAcao','rotuloAcao'].forEach((k) => { if (b[k] !== undefined) item[k] = t(b[k]); });
    ['ordemUnidade','ordem','duracaoMinutos'].forEach((k) => { if (b[k] !== undefined) item[k] = Number(b[k]) || 0; });
    if (Array.isArray(b.fragilidades)) item.fragilidades = b.fragilidades.map(t).filter(Boolean);
    if (Array.isArray(b.preRequisitos)) item.preRequisitos = b.preRequisitos;
    if (b.status && ['ativo','inativo','arquivado'].includes(b.status)) item.status = b.status;
    if (b.competencia && ['C1','C2','C3','C4','C5','GERAL'].includes(b.competencia)) item.competencia = b.competencia;
    if (b.tipo && ['diagnostico','aula','oficina','atividade','checklist','leitura','simulado'].includes(b.tipo)) item.tipo = b.tipo;
    if (b.obrigatorio !== undefined) item.obrigatorio = Boolean(b.obrigatorio);
    item.atualizadoPor = usuarioId(req);
    await item.save();
    return res.json({ ok: true, conteudo: item });
  } catch (e) { return erro(res, 500, 'Erro ao atualizar conteúdo.'); }
});

module.exports = router;
