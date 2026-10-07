'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Aluno = require('../../models/Aluno');
const CorridaCredito = require('../../models/eventos/CorridaCredito');
const CorridaAlunoAlias = require('../../models/eventos/CorridaAlunoAlias');
const { autenticar } = require('../../middleware/autenticacao');
const {
  EVENT_SLUG,
  normalizarTexto,
  normalizarTurma,
  rankearCandidatos,
  scopeInstituicao,
  tenantFromActor,
  registrarAliasConfirmado,
  sincronizarTodosConfirmados,
} = require('../../services/corridaCreditosService');

const router = express.Router();
router.use(autenticar);

const CONFIG_PATH = path.join(__dirname, '../../configs/corrida-creditos-2026.json');

function lerConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    console.error('[corrida-creditos/config]', e?.message || e);
    return { eventSlug: EVENT_SLUG, ativo: false, disciplinas: {} };
  }
}

function tipoUsuario(req) {
  return String(req.usuario?.tipo || '').trim().toLowerCase();
}

function somenteAluno(req, res, next) {
  if (tipoUsuario(req) === 'aluno' && req.usuario?.alunoId) return next();
  return res.status(403).json({ mensagem: 'Acesso exclusivo do aluno.' });
}

function somenteProfessorOuGestao(req, res, next) {
  const t = tipoUsuario(req);
  if (['professor', 'admin', 'master', 'superadmin'].includes(t)) return next();
  return res.status(403).json({ mensagem: 'Acesso permitido a professores ou gestão.' });
}

function somenteMonitoriaOuGestao(req, res, next) {
  const t = tipoUsuario(req);
  if (['monitor', 'admin', 'master', 'superadmin'].includes(t)) return next();
  return res.status(403).json({ mensagem: 'Acesso permitido à monitoria ou gestão.' });
}

function somenteGestao(req, res, next) {
  const t = tipoUsuario(req);
  if (['admin', 'master', 'superadmin'].includes(t)) return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas à gestão.' });
}

function actor(req) {
  return {
    _id: req.usuario?._id || req.usuario?.id || null,
    id: req.usuario?.id || req.usuario?._id || null,
    nome: req.usuario?.nome || req.usuario?.email || '',
    email: req.usuario?.email || '',
    tipo: tipoUsuario(req),
    instituicao: req.usuario?.instituicao || req.usuario?.tenantId || null,
    tenantId: req.usuario?.tenantId || req.usuario?.instituicao || null,
  };
}

function nowAfter(value) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && Date.now() > d.getTime();
}

function inferirEtapaETurno(turma) {
  const n = normalizarTurma(turma);
  const m = n.match(/^(\d)/);
  const numero = m ? Number(m[1]) : null;
  if (numero >= 6 && numero <= 9) return { etapa: 'fundamental2', turno: 'manha' };
  if (numero >= 1 && numero <= 3) return { etapa: `${numero}serie`, turno: 'tarde' };
  return { etapa: 'fundamental2', turno: 'manha' };
}

function labelTurno(turno) {
  return turno === 'manha' ? 'Manhã' : turno === 'tarde' ? 'Tarde' : String(turno || '');
}

function chaveDisciplina(_turno, _turma, disciplina) {
  // O limite e por disciplina, independentemente de eventual troca de turma.
  // Turno e turma continuam gravados no destino para roteamento ao professor.
  return `DISCIPLINA|${normalizarTexto(disciplina)}`;
}

function actorAudit(req, acao, detalhes) {
  return {
    acao,
    em: new Date(),
    usuarioId: req.usuario?._id || req.usuario?.id || null,
    usuarioNome: String(req.usuario?.nome || req.usuario?.email || '').slice(0, 140),
    usuarioTipo: tipoUsuario(req),
    detalhes: detalhes || null,
  };
}

async function alunoAtual(req) {
  const tenantId = tenantFromActor(actor(req));
  if (!tenantId) return null;
  return Aluno.findOne({
    _id: req.usuario.alunoId,
    ...scopeInstituicao(tenantId),
  }).select('_id nome turma instituicao tenantId').lean();
}

async function listaTurmas(tenantId) {
  const docs = await Aluno.find(scopeInstituicao(tenantId)).select('turma').lean();
  const unicas = [...new Set(docs.map((a) => String(a.turma || '').trim()).filter(Boolean))];
  return unicas.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

router.get('/contexto', async (req, res) => {
  try {
    const cfg = lerConfig();
    const tenantId = tenantFromActor(actor(req));
    if (!tenantId) return res.status(400).json({ mensagem: 'Instituição não identificada.' });

    const turmas = await listaTurmas(tenantId);
    const porTurno = { manha: [], tarde: [] };
    for (const turma of turmas) {
      const { turno } = inferirEtapaETurno(turma);
      if (!porTurno[turno]) porTurno[turno] = [];
      porTurno[turno].push(turma);
    }

    const payload = {
      ok: true,
      evento: EVENT_SLUG,
      ativo: cfg.ativo !== false,
      prazoDestinacao: cfg.prazoDestinacao || null,
      prazoProcessamento: cfg.prazoProcessamento || null,
      turnos: [
        { valor: 'manha', nome: 'Manhã', turmas: porTurno.manha || [] },
        { valor: 'tarde', nome: 'Tarde', turmas: porTurno.tarde || [] },
      ],
      disciplinas: cfg.disciplinas || {},
      usuario: { tipo: tipoUsuario(req), nome: req.usuario?.nome || '' },
    };

    if (tipoUsuario(req) === 'aluno') {
      const aluno = await alunoAtual(req);
      if (!aluno) return res.status(404).json({ mensagem: 'Aluno vinculado não encontrado.' });
      const info = inferirEtapaETurno(aluno.turma);
      payload.aluno = {
        id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        turno: info.turno,
        turnoNome: labelTurno(info.turno),
        etapa: info.etapa,
        disciplinas: Array.isArray(cfg.disciplinas?.[info.etapa]) ? cfg.disciplinas[info.etapa] : [],
      };
    }

    return res.json(payload);
  } catch (e) {
    console.error('[corrida-creditos/contexto]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar as opções dos pontos da Corrida.' });
  }
});

router.get('/aluno/resumo', somenteAluno, async (req, res) => {
  try {
    const aluno = await alunoAtual(req);
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno vinculado não encontrado.' });
    const tenantId = tenantFromActor(actor(req));

    const creditos = await CorridaCredito.find({
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      beneficiarioAlunoId: aluno._id,
      status: { $nin: ['revogado', 'revogado_processado', 'pendente_vinculo'] },
    }).sort({ deferidaEm: 1, createdAt: 1 }).lean();

    const total = creditos.length;
    const disponiveis = creditos.filter((c) => c.status === 'disponivel').length;
    const destinados = creditos.filter((c) => c.status === 'destinado').length;
    const processados = creditos.filter((c) => c.status === 'processado').length;

    return res.json({
      ok: true,
      aluno: { id: aluno._id, nome: aluno.nome, turma: aluno.turma },
      saldo: { total, disponiveis, destinados, processados, utilizados: destinados + processados },
      creditos: creditos.map((c) => ({
        id: c._id,
        origem: c.origem,
        origemParticipante: c.sourceParticipanteNome,
        vinculo: c.sourceVinculo,
        status: c.status,
        deferidaEm: c.deferidaEm,
        destino: c.destino || null,
        processamento: c.processamento || null,
      })),
    });
  } catch (e) {
    console.error('[corrida-creditos/aluno/resumo]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar seus créditos.' });
  }
});

router.post('/aluno/destinar', somenteAluno, async (req, res) => {
  try {
    const cfg = lerConfig();
    if (cfg.ativo === false) return res.status(403).json({ mensagem: 'A destinação dos pontos ainda não está liberada.' });
    if (nowAfter(cfg.prazoDestinacao)) return res.status(403).json({ mensagem: 'O prazo para destinar os pontos da Corrida foi encerrado.' });

    const aluno = await alunoAtual(req);
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno vinculado não encontrado.' });
    const tenantId = tenantFromActor(actor(req));
    const info = inferirEtapaETurno(aluno.turma);

    const tipo = String(req.body?.tipo || '').trim().toLowerCase();
    let destino;

    if (tipo === 'disciplinar') {
      destino = {
        tipo: 'disciplinar',
        chave: 'DISCIPLINAR',
        turno: info.turno,
        turma: aluno.turma,
        disciplina: 'Nota Disciplinar',
        destinadoEm: new Date(),
      };
    } else if (tipo === 'disciplina') {
      const turno = String(req.body?.turno || '').trim().toLowerCase();
      const turma = String(req.body?.turma || '').trim();
      const disciplina = String(req.body?.disciplina || '').trim();
      const permitidas = Array.isArray(cfg.disciplinas?.[info.etapa]) ? cfg.disciplinas[info.etapa] : [];

      if (turno !== info.turno || normalizarTurma(turma) !== normalizarTurma(aluno.turma)) {
        return res.status(400).json({ mensagem: 'Turno ou turma não correspondem ao cadastro oficial do aluno.' });
      }
      const disciplinaOficial = permitidas.find((d) => normalizarTexto(d) === normalizarTexto(disciplina));
      if (!disciplinaOficial) return res.status(400).json({ mensagem: 'Selecione uma disciplina válida da lista oficial.' });

      destino = {
        tipo: 'disciplina',
        chave: chaveDisciplina(info.turno, aluno.turma, disciplinaOficial),
        turno: info.turno,
        turma: aluno.turma,
        disciplina: disciplinaOficial,
        destinadoEm: new Date(),
      };
    } else {
      return res.status(400).json({ mensagem: 'Destino inválido.' });
    }

    const duplicado = await CorridaCredito.exists({
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      beneficiarioAlunoId: aluno._id,
      'destino.chave': destino.chave,
      status: { $in: ['destinado', 'processado'] },
    });
    if (duplicado) {
      return res.status(409).json({
        mensagem: destino.tipo === 'disciplinar'
          ? 'Você já destinou um ponto para a Nota Disciplinar.'
          : `Você já destinou um ponto para ${destino.disciplina}. Não é permitido acumular dois pontos na mesma disciplina.`,
      });
    }

    let credito;
    try {
      credito = await CorridaCredito.findOneAndUpdate(
        {
          eventSlug: EVENT_SLUG,
          instituicao: tenantId,
          beneficiarioAlunoId: aluno._id,
          status: 'disponivel',
        },
        {
          $set: { status: 'destinado', destino },
          $push: { auditoria: actorAudit(req, 'credito_destinado', { destino }) },
        },
        { new: true, sort: { deferidaEm: 1, createdAt: 1 }, runValidators: true }
      );
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ mensagem: 'Já existe um ponto destinado para este mesmo destino.' });
      }
      throw e;
    }

    if (!credito) return res.status(409).json({ mensagem: 'Você não possui crédito disponível para realizar esta destinação.' });
    return res.json({ ok: true, credito, mensagem: 'Ponto destinado com sucesso.' });
  } catch (e) {
    console.error('[corrida-creditos/aluno/destinar]', e);
    return res.status(500).json({ mensagem: 'Não foi possível destinar o ponto.' });
  }
});

router.get('/professor/solicitacoes', somenteProfessorOuGestao, async (req, res) => {
  try {
    const cfg = lerConfig();
    const tenantId = tenantFromActor(actor(req));
    const turno = String(req.query.turno || '').trim().toLowerCase();
    const turma = String(req.query.turma || '').trim();
    const disciplina = String(req.query.disciplina || '').trim();
    if (!turno || !turma || !disciplina) return res.status(400).json({ mensagem: 'Selecione turno, turma e disciplina.' });

    // A API tambem valida a selecao contra as listas oficiais/pre-configuradas.
    // Assim nao basta alterar manualmente os parametros no navegador.
    const turmasOficiais = await listaTurmas(tenantId);
    const turmaOficial = turmasOficiais.find((t) => normalizarTurma(t) === normalizarTurma(turma));
    if (!turmaOficial) return res.status(400).json({ mensagem: 'Turma invalida para esta instituicao.' });

    const info = inferirEtapaETurno(turmaOficial);
    if (turno !== info.turno) return res.status(400).json({ mensagem: 'Turno nao corresponde a turma selecionada.' });

    const permitidas = Array.isArray(cfg.disciplinas?.[info.etapa]) ? cfg.disciplinas[info.etapa] : [];
    const disciplinaOficial = permitidas.find((d) => normalizarTexto(d) === normalizarTexto(disciplina));
    if (!disciplinaOficial) return res.status(400).json({ mensagem: 'Disciplina invalida para a turma selecionada.' });

    const creditos = await CorridaCredito.find({
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      status: 'destinado',
      'destino.tipo': 'disciplina',
      'destino.turno': info.turno,
      'destino.turma': turmaOficial,
      'destino.disciplina': disciplinaOficial,
    }).sort({ 'destino.destinadoEm': 1 }).lean();

    return res.json({
      ok: true,
      solicitacoes: creditos.map((c) => ({
        id: c._id,
        alunoId: c.beneficiarioAlunoId,
        aluno: c.beneficiarioNome,
        turma: c.beneficiarioTurma,
        disciplina: c.destino?.disciplina,
        turno: c.destino?.turno,
        destinadoEm: c.destino?.destinadoEm,
        ponto: 1,
      })),
    });
  } catch (e) {
    console.error('[corrida-creditos/professor/lista]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar as solicitações.' });
  }
});

router.post('/professor/solicitacoes/:id/confirmar', somenteProfessorOuGestao, async (req, res) => {
  try {
    const cfg = lerConfig();
    if (nowAfter(cfg.prazoProcessamento)) return res.status(403).json({ mensagem: 'O prazo de processamento dos pontos foi encerrado.' });
    const tenantId = tenantFromActor(actor(req));
    const now = new Date();
    const credito = await CorridaCredito.findOneAndUpdate(
      {
        _id: req.params.id,
        eventSlug: EVENT_SLUG,
        instituicao: tenantId,
        status: 'destinado',
        'destino.tipo': 'disciplina',
      },
      {
        $set: {
          status: 'processado',
          'processamento.confirmadoEm': now,
          'processamento.confirmadoPorId': req.usuario?._id || req.usuario?.id || null,
          'processamento.confirmadoPorNome': String(req.usuario?.nome || req.usuario?.email || '').slice(0, 140),
          'processamento.confirmadoPorTipo': tipoUsuario(req),
          'processamento.observacao': String(req.body?.observacao || '').slice(0, 300),
        },
        $push: { auditoria: actorAudit(req, 'lancamento_confirmado_professor', { observacao: req.body?.observacao || '' }) },
      },
      { new: true, runValidators: true }
    );
    if (!credito) return res.status(409).json({ mensagem: 'Solicitação não encontrada, já processada ou inválida.' });
    return res.json({ ok: true, credito, mensagem: 'Lançamento confirmado.' });
  } catch (e) {
    console.error('[corrida-creditos/professor/confirmar]', e);
    return res.status(500).json({ mensagem: 'Não foi possível confirmar o lançamento.' });
  }
});

router.get('/monitoria/solicitacoes', somenteMonitoriaOuGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    const creditos = await CorridaCredito.find({
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      status: 'destinado',
      'destino.tipo': 'disciplinar',
    }).sort({ 'destino.destinadoEm': 1 }).lean();
    return res.json({
      ok: true,
      solicitacoes: creditos.map((c) => ({
        id: c._id,
        alunoId: c.beneficiarioAlunoId,
        aluno: c.beneficiarioNome,
        turma: c.beneficiarioTurma,
        destinadoEm: c.destino?.destinadoEm,
        ponto: 1,
      })),
    });
  } catch (e) {
    console.error('[corrida-creditos/monitoria/lista]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar as solicitações da monitoria.' });
  }
});

router.post('/monitoria/solicitacoes/:id/confirmar', somenteMonitoriaOuGestao, async (req, res) => {
  try {
    const cfg = lerConfig();
    if (nowAfter(cfg.prazoProcessamento)) return res.status(403).json({ mensagem: 'O prazo de processamento dos pontos foi encerrado.' });
    const tenantId = tenantFromActor(actor(req));
    const now = new Date();
    const credito = await CorridaCredito.findOneAndUpdate(
      {
        _id: req.params.id,
        eventSlug: EVENT_SLUG,
        instituicao: tenantId,
        status: 'destinado',
        'destino.tipo': 'disciplinar',
      },
      {
        $set: {
          status: 'processado',
          'processamento.confirmadoEm': now,
          'processamento.confirmadoPorId': req.usuario?._id || req.usuario?.id || null,
          'processamento.confirmadoPorNome': String(req.usuario?.nome || req.usuario?.email || '').slice(0, 140),
          'processamento.confirmadoPorTipo': tipoUsuario(req),
          'processamento.observacao': String(req.body?.observacao || '').slice(0, 300),
        },
        $push: { auditoria: actorAudit(req, 'lancamento_confirmado_monitoria', { observacao: req.body?.observacao || '' }) },
      },
      { new: true, runValidators: true }
    );
    if (!credito) return res.status(409).json({ mensagem: 'Solicitação não encontrada, já processada ou inválida.' });
    return res.json({ ok: true, credito, mensagem: 'Nota disciplinar confirmada.' });
  } catch (e) {
    console.error('[corrida-creditos/monitoria/confirmar]', e);
    return res.status(500).json({ mensagem: 'Não foi possível confirmar a Nota Disciplinar.' });
  }
});

router.post('/admin/sincronizar', somenteGestao, async (req, res) => {
  try {
    const resumo = await sincronizarTodosConfirmados(actor(req));
    return res.json({ ok: true, resumo, mensagem: 'Sincronização das inscrições deferidas concluída.' });
  } catch (e) {
    console.error('[corrida-creditos/admin/sincronizar]', e);
    return res.status(500).json({ mensagem: e?.message || 'Não foi possível sincronizar as inscrições.' });
  }
});

router.get('/admin/pendentes-vinculo', somenteGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    const [docs, alunos] = await Promise.all([
      CorridaCredito.find({
        eventSlug: EVENT_SLUG,
        instituicao: tenantId,
        status: 'pendente_vinculo',
      }).sort({ createdAt: 1 }).lean(),
      Aluno.find(scopeInstituicao(tenantId))
        .select('_id nome turma nascimento')
        .limit(5000)
        .lean(),
    ]);

    const pendentes = docs.map((c) => ({
      ...c,
      sugestoes: rankearCandidatos(alunos, {
        nome: c.referenciaAlunoNome,
        turma: c.referenciaAlunoTurma,
        nascimento: c.referenciaAlunoNascimento,
        limit: 5,
      }).slice(0, 5),
    }));
    return res.json({ ok: true, pendentes });
  } catch (e) {
    console.error('[corrida-creditos/admin/pendentes]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar os vínculos pendentes.' });
  }
});

router.get('/admin/alunos', somenteGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    const qNorm = normalizarTexto(req.query.q || '');
    const turmaNorm = normalizarTurma(req.query.turma || '');
    let alunos = await Aluno.find(scopeInstituicao(tenantId))
      .select('_id nome turma nascimento')
      .limit(5000)
      .lean();
    if (qNorm) alunos = alunos.filter((a) => normalizarTexto(a.nome).includes(qNorm));
    if (turmaNorm) alunos = alunos.filter((a) => normalizarTurma(a.turma) === turmaNorm);
    alunos = alunos
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' }))
      .slice(0, 50);
    return res.json({ ok: true, alunos });
  } catch (e) {
    console.error('[corrida-creditos/admin/alunos]', e);
    return res.status(500).json({ mensagem: 'Não foi possível pesquisar alunos.' });
  }
});

router.post('/admin/creditos/:id/vincular-aluno', somenteGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    const alunoId = String(req.body?.alunoId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(alunoId)) return res.status(400).json({ mensagem: 'Aluno inválido.' });
    const aluno = await Aluno.findOne({ _id: alunoId, ...scopeInstituicao(tenantId) }).select('_id nome turma nascimento').lean();
    if (!aluno) return res.status(404).json({ mensagem: 'Aluno não encontrado nesta instituição.' });

    const credito = await CorridaCredito.findOne({
      _id: req.params.id,
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      status: 'pendente_vinculo',
    });
    if (!credito) return res.status(404).json({ mensagem: 'Crédito pendente não encontrado.' });

    const alias = await registrarAliasConfirmado({
      tenantId,
      nome: credito.referenciaAlunoNome,
      turma: credito.referenciaAlunoTurma,
      aluno,
      actor: actor(req),
      creditoId: credito._id,
    });

    if (alias?.conflito) {
      return res.status(409).json({
        mensagem: `Esta mesma variação de nome/turma já foi aprendida para ${alias.alias.alunoNome} (${alias.alias.alunoTurma}). Exclua o aprendizado anterior antes de reassociar.`,
        aliasConflito: {
          id: alias.alias._id,
          alunoId: alias.alias.alunoId,
          aluno: alias.alias.alunoNome,
          turma: alias.alias.alunoTurma,
        },
      });
    }

    credito.beneficiarioAlunoId = aluno._id;
    credito.beneficiarioNome = aluno.nome;
    credito.beneficiarioTurma = aluno.turma;
    credito.status = 'disponivel';
    credito.motivoPendencia = '';
    credito.conciliacao = {
      metodo: 'manual_confirmado',
      score: credito.conciliacao?.score || 0,
      margem: credito.conciliacao?.margem || 0,
      segundoScore: credito.conciliacao?.segundoScore || 0,
      nivel: 'exata',
      candidatoAlunoId: aluno._id,
      candidatoNome: aluno.nome,
      candidatoTurma: aluno.turma,
      nascimentoCoincide: false,
      turmaCoincide: normalizarTurma(aluno.turma) === normalizarTurma(credito.referenciaAlunoTurma),
      aliasId: alias?.alias?._id || null,
      atualizadoEm: new Date(),
    };
    credito.auditoria.push(actorAudit(req, 'vinculo_manual_confirmado', {
      alunoId: aluno._id,
      aluno: aluno.nome,
      turma: aluno.turma,
      aliasId: alias?.alias?._id || null,
      aliasCriado: Boolean(alias?.criado),
    }));
    await credito.save();
    return res.json({
      ok: true,
      credito,
      aliasAprendido: alias?.alias ? {
        id: alias.alias._id,
        nomeDigitado: credito.referenciaAlunoNome,
        turmaDigitada: credito.referenciaAlunoTurma,
        aluno: aluno.nome,
        turma: aluno.turma,
      } : null,
      mensagem: alias?.alias
        ? 'Crédito vinculado e variação de nome aprendida para próximas inscrições.'
        : 'Crédito vinculado ao aluno com sucesso.',
    });
  } catch (e) {
    console.error('[corrida-creditos/admin/vincular]', e);
    return res.status(500).json({ mensagem: 'Não foi possível vincular o crédito ao aluno.' });
  }
});

router.get('/admin/aliases', somenteGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    const aliases = await CorridaAlunoAlias.find({
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      ativo: true,
    }).sort({ updatedAt: -1 }).limit(250).lean();
    return res.json({ ok: true, aliases });
  } catch (e) {
    console.error('[corrida-creditos/admin/aliases]', e);
    return res.status(500).json({ mensagem: 'Não foi possível carregar os vínculos aprendidos.' });
  }
});

router.delete('/admin/aliases/:id', somenteGestao, async (req, res) => {
  try {
    const tenantId = tenantFromActor(actor(req));
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ''))) {
      return res.status(400).json({ mensagem: 'Aprendizado inválido.' });
    }
    const alias = await CorridaAlunoAlias.findOne({
      _id: req.params.id,
      eventSlug: EVENT_SLUG,
      instituicao: tenantId,
      ativo: true,
    });
    if (!alias) return res.status(404).json({ mensagem: 'Aprendizado não encontrado.' });
    alias.ativo = false;
    alias.ultimaConfirmacaoEm = new Date();
    await alias.save();
    return res.json({ ok: true, mensagem: 'Aprendizado removido. Créditos já vinculados não foram alterados.' });
  } catch (e) {
    console.error('[corrida-creditos/admin/aliases/excluir]', e);
    return res.status(500).json({ mensagem: 'Não foi possível remover o aprendizado.' });
  }
});

module.exports = router;
