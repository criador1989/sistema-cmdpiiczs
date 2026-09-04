'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const PortalAlunoAtividade = require('../../models/PortalAlunoAtividade');
const { autenticar } = require('../../middleware/autenticacao');

const router = express.Router();

function somenteAdmin(req, res, next) {
  const tipo = String(req.usuario?.tipo || '').trim().toLowerCase();
  if (tipo !== 'admin') {
    return res.status(403).json({
      ok: false,
      mensagem: 'Este observatório é exclusivo do perfil ADMIN.',
    });
  }
  return next();
}

router.use(autenticar, somenteAdmin);

function oid(valor) {
  if (!valor) return null;
  if (valor instanceof mongoose.Types.ObjectId) return valor;
  return mongoose.Types.ObjectId.isValid(String(valor))
    ? new mongoose.Types.ObjectId(String(valor))
    : null;
}

function inicioPeriodo(chave) {
  const agora = new Date();
  const inicio = new Date(agora);

  if (chave === 'hoje') {
    inicio.setHours(0, 0, 0, 0);
    return inicio;
  }
  if (chave === '7d') {
    inicio.setDate(inicio.getDate() - 7);
    return inicio;
  }
  if (chave === '30d') {
    inicio.setDate(inicio.getDate() - 30);
    return inicio;
  }
  return null;
}

function statusAluno(atividade) {
  if (!atividade?.primeiroAcessoPortalEm) return 'nunca_acessou';
  if (!atividade?.primeiroAcessoSimuladosEm) return 'so_portal';
  if (!atividade?.primeiroSimuladoAbertoEm) return 'abriu_simulados';

  const p = atividade?.progressoAtual || {};
  if (p?.resultadoId && p?.concluido === true) return 'concluido';
  if (p?.resultadoId) return 'em_andamento';

  if (Array.isArray(atividade?.revisoesConcluidas) && atividade.revisoesConcluidas.length) {
    return 'concluido';
  }
  return 'iniciou';
}

function rotuloEvento(tipo) {
  return {
    portal_acesso: 'acessou o Portal do Aluno',
    simulados_abriu: 'abriu o módulo de Simulados',
    simulado_abriu: 'abriu um resultado de simulado',
    questao_abriu: 'abriu uma questão para revisão',
    revisao_questao: 'atualizou a revisão de uma questão',
    revisao_conteudo: 'atualizou o plano de revisão',
    revisao_concluida: 'concluiu a revisão de um simulado',
  }[tipo] || 'realizou uma atividade no Portal';
}

router.get('/resumo', async (req, res) => {
  try {
    const instituicaoId = oid(req.usuario?.instituicao || req.usuario?.tenantId);
    if (!instituicaoId) {
      return res.status(400).json({ ok: false, mensagem: 'Instituição não identificada.' });
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    const turma = String(req.query.turma || '').trim();
    const situacao = String(req.query.status || '').trim();
    const periodo = String(req.query.periodo || 'todos').trim().toLowerCase();
    const inicio = inicioPeriodo(periodo);

    const usuarios = await Usuario.find({
      tipo: 'aluno',
      ativo: { $ne: false },
      alunoId: { $ne: null },
      $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
    })
      .select('alunoId')
      .lean();

    const alunoIds = [...new Set(
      usuarios.map((u) => String(u.alunoId || '')).filter((id) => mongoose.Types.ObjectId.isValid(id))
    )].map((id) => new mongoose.Types.ObjectId(id));

    const [alunos, atividades] = await Promise.all([
      Aluno.find({
        _id: { $in: alunoIds },
        $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
      })
        .select('_id nome turma codigoAcesso')
        .sort({ turma: 1, nome: 1 })
        .lean(),
      PortalAlunoAtividade.find({
        instituicao: instituicaoId,
        aluno: { $in: alunoIds },
      })
        .select(
          'aluno alunoNomeSnapshot alunoTurmaSnapshot alunoCodigoSnapshot ' +
          'primeiroAcessoPortalEm ultimoAcessoPortalEm totalAcessosPortal ' +
          'primeiroAcessoSimuladosEm ultimoAcessoSimuladosEm totalAberturasSimulados ' +
          'primeiroSimuladoAbertoEm ultimoSimuladoAbertoEm resultadosAbertos revisoesConcluidas ' +
          'progressoAtual ultimaAtividadeEm ultimaAtividadeTipo eventosRecentes'
        )
        .lean(),
    ]);

    const atividadePorAluno = new Map(
      atividades.map((a) => [String(a.aluno), a])
    );

    const agora = new Date();
    const seteDias = new Date(agora);
    seteDias.setDate(seteDias.getDate() - 7);

    const base = alunos.map((aluno) => {
      const atividade = atividadePorAluno.get(String(aluno._id)) || null;
      const status = statusAluno(atividade);
      const resultadosAbertos = Array.isArray(atividade?.resultadosAbertos) ? atividade.resultadosAbertos.length : 0;
      const concluidos = Array.isArray(atividade?.revisoesConcluidas) ? atividade.revisoesConcluidas.length : 0;
      const progresso = atividade?.progressoAtual || {};

      return {
        alunoId: String(aluno._id),
        nome: aluno.nome || atividade?.alunoNomeSnapshot || '',
        turma: aluno.turma || atividade?.alunoTurmaSnapshot || '',
        codigo: aluno.codigoAcesso || atividade?.alunoCodigoSnapshot || '',
        status,
        primeiroAcessoPortalEm: atividade?.primeiroAcessoPortalEm || null,
        ultimoAcessoPortalEm: atividade?.ultimoAcessoPortalEm || null,
        totalAcessosPortal: Number(atividade?.totalAcessosPortal || 0),
        primeiroAcessoSimuladosEm: atividade?.primeiroAcessoSimuladosEm || null,
        ultimoAcessoSimuladosEm: atividade?.ultimoAcessoSimuladosEm || null,
        simuladosIniciados: resultadosAbertos,
        simuladosConcluidos: concluidos,
        progressoAtual: {
          titulo: progresso?.titulo || '',
          revisadas: Number(progresso?.revisadas || 0),
          total: Number(progresso?.totalQuestoesRevisao || 0),
          percentual: Number(progresso?.percentual || 0),
          concluido: progresso?.concluido === true,
        },
        ultimaAtividadeEm: atividade?.ultimaAtividadeEm || null,
        ultimaAtividadeTipo: atividade?.ultimaAtividadeTipo || '',
      };
    });

    const metricas = {
      alunosComConta: base.length,
      acessaramPortal: base.filter((a) => a.primeiroAcessoPortalEm).length,
      nuncaAcessaram: base.filter((a) => !a.primeiroAcessoPortalEm).length,
      acessaramUltimos7Dias: base.filter((a) => a.ultimoAcessoPortalEm && new Date(a.ultimoAcessoPortalEm) >= seteDias).length,
      abriramSimulados: base.filter((a) => a.primeiroAcessoSimuladosEm).length,
      iniciaramAtividade: base.filter((a) => a.simuladosIniciados > 0).length,
      emAndamento: base.filter((a) => a.status === 'em_andamento' || a.status === 'iniciou').length,
      concluiramRevisao: base.filter((a) => a.simuladosConcluidos > 0).length,
    };

    let filtrados = base.filter((a) => {
      if (turma && a.turma !== turma) return false;
      if (situacao && situacao !== 'todos' && a.status !== situacao) return false;
      if (q && !`${a.nome} ${a.turma} ${a.codigo}`.toLowerCase().includes(q)) return false;

      if (inicio && situacao !== 'nunca_acessou') {
        if (!a.ultimaAtividadeEm || new Date(a.ultimaAtividadeEm) < inicio) return false;
      }
      return true;
    });

    filtrados = filtrados.sort((a, b) => {
      const ta = a.ultimaAtividadeEm ? new Date(a.ultimaAtividadeEm).getTime() : 0;
      const tb = b.ultimaAtividadeEm ? new Date(b.ultimaAtividadeEm).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });

    const atividadesRecentes = [];
    for (const doc of atividades) {
      const aluno = base.find((a) => a.alunoId === String(doc.aluno));
      if (!aluno) continue;

      for (const ev of Array.isArray(doc.eventosRecentes) ? doc.eventosRecentes : []) {
        if (inicio && ev.em && new Date(ev.em) < inicio) continue;
        atividadesRecentes.push({
          alunoId: aluno.alunoId,
          nome: aluno.nome,
          turma: aluno.turma,
          tipo: ev.tipo,
          rotulo: rotuloEvento(ev.tipo),
          em: ev.em,
          simuladoTitulo: ev.simuladoTitulo || '',
          detalhe: ev.detalhe || '',
        });
      }
    }

    atividadesRecentes.sort((a, b) => new Date(b.em || 0) - new Date(a.em || 0));

    const turmas = [...new Set(base.map((a) => a.turma).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    return res.json({
      ok: true,
      geradoEm: agora,
      metricas,
      funil: [
        { chave: 'conta', rotulo: 'Com conta', valor: metricas.alunosComConta },
        { chave: 'portal', rotulo: 'Acessaram o Portal', valor: metricas.acessaramPortal },
        { chave: 'simulados', rotulo: 'Abriram Simulados', valor: metricas.abriramSimulados },
        { chave: 'iniciaram', rotulo: 'Iniciaram atividade', valor: metricas.iniciaramAtividade },
        { chave: 'concluiram', rotulo: 'Concluíram revisão', valor: metricas.concluiramRevisao },
      ],
      alertas: {
        nuncaAcessaram: metricas.nuncaAcessaram,
        acessaramSemSimulados: base.filter((a) => a.primeiroAcessoPortalEm && !a.primeiroAcessoSimuladosEm).length,
        abriramSemIniciar: base.filter((a) => a.primeiroAcessoSimuladosEm && a.simuladosIniciados === 0).length,
        emAndamento: metricas.emAndamento,
      },
      filtros: { turmas, periodo, turma, status: situacao, q },
      alunos: filtrados,
      atividadeRecente: atividadesRecentes.slice(0, 60),
      observacao:
        'O Portal atual registra acesso, abertura dos Simulados e ações de revisão. ' +
        'As respostas originais do simulado vêm do resultado importado e não são tratadas como cliques do aluno no Portal. ' +
        'O histórico de acesso começa a ser registrado a partir da implantação desta versão.',
    });
  } catch (erro) {
    console.error('[OBS-PORTAL-ALUNO] GET /resumo:', erro);
    return res.status(500).json({
      ok: false,
      mensagem: 'Não foi possível carregar o Observatório do Portal do Aluno.',
    });
  }
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, modulo: 'observatorio-portal-aluno', versao: '1.0.0' });
});

module.exports = router;
