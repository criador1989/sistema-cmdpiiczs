'use strict';

const express = require('express');
const router = express.Router();

const Aluno = require('../../models/Aluno');
const Notificacao = require('../../models/Notificacao');
const Observacao = require('../../models/Observacao');
const { autenticar } = require('../../middleware/autenticacao');
const { logAction, attachActor } = require('../../utils/audit');

let calcularNotaTSMD;
try {
  calcularNotaTSMD = require('../../utils/calculoNota');
} catch {
  calcularNotaTSMD = null;
}

function toPublicUrl(p) {
  if (!p) return null;
  let s = String(p).trim().replace(/\\/g, '/');
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
  if (!/^\/?uploads\//i.test(s)) s = 'uploads/' + s.replace(/^\/+/, '');
  return '/' + s.replace(/^\/+/, '');
}

function normalizarTurma(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getTenantId(req) {
  return (
    req.tenantId ||
    req.instituicaoId ||
    req.tenant?._id ||
    req.tenant?.id ||
    req.usuario?.tenantId ||
    req.user?.tenantId ||
    req.usuario?.instituicao ||
    req.user?.instituicao ||
    null
  );
}

async function safeAudit(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit][ficha] falha ao gravar log:', e?.message || e);
  }
}

const PROJ_ALUNO =
  'nome turma dataEntrada nascimento nomePai nomeMae telefone endereco foto fotoOriginal fotoMedium fotoThumb fotoMeta fotoCaminho instituicao updatedAt createdAt codigoAcesso comportamento contatos';

const PROJ_NOTIF =
  '_id data tipo tipoMedida natureza motivo valorNumerico artigo inciso classificacaoRegulamento quantidadeDias observacoes createdAt ativo arquivada status notaAnterior notaAtual classificacaoAnterior classificacaoAtual numeroSequencial';

const PROJ_OBS =
  '_id texto autor criadoEm createdAt anexos attachments files';

function filtroNotificacoesVisiveis(alunoId, instituicao) {
  return {
    aluno: alunoId,
    instituicao,
    ativo: { $ne: false },
    arquivada: { $ne: true }
  };
}

router.get('/:id', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario || {};
    const instituicao = getTenantId(req);

    if (!instituicao) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const aluno = await Aluno.findOne({ _id: id, instituicao }).select(PROJ_ALUNO).lean();
    if (!aluno) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    const isProfessor = usuario.tipo === 'professor';
    
    const isResponsavel = usuario.tipo === 'responsavel';

if (isResponsavel) {
  const alunoIdToken = usuario.alunoId ? String(usuario.alunoId) : null;

  if (!alunoIdToken) {
    return res.status(403).json({
      erro: 'Responsável sem aluno vinculado.'
    });
  }

  if (String(id) !== alunoIdToken) {
    return res.status(403).json({
      erro: 'Responsável sem permissão para acessar este aluno.'
    });
  }
}

if (isResponsavel) {
  const alunoIdToken = usuario.alunoId ? String(usuario.alunoId) : null;

  if (!alunoIdToken) {
    return res.status(403).json({
      erro: 'Responsável sem aluno vinculado.'
    });
  }

  if (String(id) !== alunoIdToken) {
    return res.status(403).json({
      erro: 'Responsável sem permissão para acessar este aluno.'
    });
  }
}

    const turmasProfessor = Array.isArray(usuario.turmas) ? usuario.turmas : [];
    if (isProfessor && turmasProfessor.length) {
      const turmaAluno = normalizarTurma(aluno.turma);
      const permitidas = turmasProfessor.map(normalizarTurma);
      if (!permitidas.includes(turmaAluno)) {
        return res.status(403).json({ erro: 'Professor sem permissão para acessar aluno desta turma.' });
      }
    }

    const notificacoes = await Notificacao.find(
      filtroNotificacoesVisiveis(aluno._id, instituicao)
    )
      .sort({ data: 1, createdAt: 1, _id: 1 })
      .select(PROJ_NOTIF)
      .lean();

    const instStr = String(instituicao);
    const observacoes = await Observacao.find({ aluno: aluno._id, instituicao: instStr })
      .sort({ criadoEm: -1, createdAt: -1 })
      .select(PROJ_OBS)
      .lean();

    const ultimaNotifComNota = [...(notificacoes || [])]
  .reverse()
  .find((n) => typeof n.notaAtual === 'number');

let notaComportamento =
  typeof aluno.comportamento === 'number'
    ? aluno.comportamento
    : typeof ultimaNotifComNota?.notaAtual === 'number'
      ? ultimaNotifComNota.notaAtual
      : 8.0;

notaComportamento = Number((+notaComportamento || 0).toFixed(2));

    const fotoUrl = toPublicUrl(aluno.fotoOriginal || aluno.foto || aluno.fotoThumb || null);
    const fotoThumbUrl = toPublicUrl(aluno.fotoThumb || aluno.fotoOriginal || aluno.foto || null);
    const contatos = aluno.contatos || {};

    await safeAudit({
      req,
      event: 'FICHA_ALUNO_VISUALIZADA',
      targetType: 'Aluno',
      targetId: aluno._id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        turma: aluno.turma,
        perfilSolicitante: usuario.tipo || null
      }
    });

    res.set('Cache-Control', 'no-store');

    if (isProfessor) {
      return res.json({
        aluno: {
          _id: aluno._id,
          nome: aluno.nome || null,
          turma: aluno.turma || null,
          dataEntrada: aluno.dataEntrada || null,
          comportamento: notaComportamento,
          notaComportamental: notaComportamento,

          nascimento: null,
          nomePai: null,
          nomeMae: null,
          telefone: null,
          endereco: null,
          codigoAcesso: null,
          foto: null,
          fotoOriginal: null,
          fotoMedium: null,
          fotoThumb: null,
          fotoUrl: null,
          fotoThumbUrl: null,
          fotoMeta: null,
          contatos: {
            emailResponsavel: null,
            whatsapp: null,
            telegramChatId: null,
          },
        },
        notificacoes: (notificacoes || []).map((n) => ({
          _id: n._id,
          data: n.data || null,
          createdAt: n.createdAt || null,
          tipo: n.tipo || null,
          tipoMedida: n.tipoMedida || null,
          natureza: n.natureza || null,
          motivo: n.motivo || null,
          valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : null,
          artigo: n.artigo || null,
          inciso: n.inciso || null,
          classificacaoRegulamento: n.classificacaoRegulamento || null,
          quantidadeDias: n.quantidadeDias || null,
          observacoes: n.observacoes || null,
        })),
        observacoes: (observacoes || []).map((o) => ({
          _id: o._id,
          texto: o.texto || '',
          autor: o.autor || 'Não informado',
          criadoEm: o.criadoEm || o.createdAt || null,
          createdAt: o.createdAt || null,
          anexos: [],
          attachments: [],
          files: [],
        })),
      });
    }

    if (isResponsavel) {
  return res.json({
    aluno: {
      _id: aluno._id,
      nome: aluno.nome || null,
      turma: aluno.turma || null,
      dataEntrada: aluno.dataEntrada || null,
      comportamento: notaComportamento,
      notaComportamental: notaComportamento,

      nascimento: null,
      nomePai: null,
      nomeMae: null,
      telefone: null,
      endereco: null,
      codigoAcesso: null,

      foto: aluno.foto || null,
      fotoOriginal: aluno.fotoOriginal || aluno.foto || null,
      fotoMedium: aluno.fotoMedium || null,
      fotoThumb: aluno.fotoThumb || null,
      fotoUrl,
      fotoThumbUrl,
      fotoMeta: aluno.fotoMeta || null,

      contatos: {
        emailResponsavel: null,
        whatsapp: null,
        telegramChatId: null,
      },
    },

    notificacoes: (notificacoes || []).map((n) => ({
      _id: n._id,
      data: n.data || null,
      createdAt: n.createdAt || null,
      tipo: n.tipo || null,
      tipoMedida: n.tipoMedida || null,
      natureza: n.natureza || null,
      motivo: n.motivo || null,
      valorNumerico: typeof n.valorNumerico === 'number' ? n.valorNumerico : null,
      artigo: n.artigo || null,
      inciso: n.inciso || null,
      classificacaoRegulamento: n.classificacaoRegulamento || null,
      quantidadeDias: n.quantidadeDias || null,
      observacoes: n.observacoes || null,
      notaAnterior: typeof n.notaAnterior === 'number' ? n.notaAnterior : null,
      notaAtual: typeof n.notaAtual === 'number' ? n.notaAtual : null,
      classificacaoAnterior: n.classificacaoAnterior || null,
      classificacaoAtual: n.classificacaoAtual || null,
      numeroSequencial: n.numeroSequencial || null,
      status: n.status || null,
    })),

    observacoes: (observacoes || []).map((o) => ({
      _id: o._id,
      texto: o.texto || '',
      autor: o.autor || 'Não informado',
      criadoEm: o.criadoEm || o.createdAt || null,
      createdAt: o.createdAt || null,
      anexos: [],
      attachments: [],
      files: [],
    })),
  });
}

    return res.json({
      aluno: {
        _id: aluno._id,
        nome: aluno.nome,
        turma: aluno.turma,
        dataEntrada: aluno.dataEntrada || null,
        nascimento: aluno.nascimento || null,
        nomePai: aluno.nomePai || null,
        nomeMae: aluno.nomeMae || null,
        telefone: aluno.telefone || null,
        endereco: aluno.endereco || null,
        codigoAcesso: aluno.codigoAcesso || null,
        comportamento: notaComportamento,
        notaComportamental: notaComportamento,
        foto: aluno.foto || null,
        fotoOriginal: aluno.fotoOriginal || aluno.foto || null,
        fotoMedium: aluno.fotoMedium || null,
        fotoThumb: aluno.fotoThumb || null,
        fotoUrl,
        fotoThumbUrl,
        fotoMeta: aluno.fotoMeta || null,
        contatos: {
          emailResponsavel: contatos.emailResponsavel || null,
          whatsapp: contatos.whatsapp || null,
          telegramChatId: contatos.telegramChatId || null,
        },
      },
      notificacoes,
      observacoes,
    });
  } catch (erro) {
    console.error('Erro ao montar ficha do aluno:', erro);
    res.status(500).json({ erro: 'Erro ao montar ficha do aluno.' });
  }
});

router.post('/salvar/:id', autenticar, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    const usuario = req.usuario || {};
    const instituicao = getTenantId(req);
    const autor = usuario.nome || usuario.email || 'Sistema';

    if (!instituicao) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    if (!texto || String(texto).trim().length === 0) {
      return res.status(400).json({ erro: 'Texto da observação é obrigatório.' });
    }

    const alunoBase = await Aluno.findOne({ _id: id, instituicao }).select('nome turma').lean();
    if (!alunoBase) {
      return res.status(404).json({ erro: 'Aluno não encontrado nesta instituição.' });
    }

    if (usuario.tipo === 'professor' && Array.isArray(usuario.turmas) && usuario.turmas.length) {
      const turmaAluno = normalizarTurma(alunoBase.turma);
      const permitidas = usuario.turmas.map(normalizarTurma);

      if (!permitidas.includes(turmaAluno)) {
        return res.status(403).json({ erro: 'Professor sem permissão para registrar observação nesta turma.' });
      }
    }

    const novaObs = await Observacao.create({
      aluno: id,
      instituicao: String(instituicao),
      texto: String(texto).trim(),
      autor,
    });

    await safeAudit({
      req,
      event: 'OBSERVACAO_CRIADA',
      targetType: 'Aluno',
      targetId: id,
      entidadeNome: alunoBase.nome,
      alunoNome: alunoBase.nome,
      meta: {
        turma: alunoBase.turma,
        observacaoId: novaObs._id,
        tamanhoTexto: String(texto).trim().length,
        perfilSolicitante: usuario.tipo || null
      }
    });

    res.json({
      mensagem: 'Observação salva com sucesso.',
      observacao: {
        _id: novaObs._id,
        texto: novaObs.texto,
        autor: novaObs.autor,
        criadoEm: novaObs.criadoEm,
      },
    });
  } catch (erro) {
    console.error('Erro ao salvar observação:', erro);
    res.status(500).json({ erro: 'Erro ao salvar observação.' });
  }
});

module.exports = router;