'use strict';

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

const Usuario = require('../../models/Usuario');
const UsuarioVinculoInstituicao = require('../../models/UsuarioVinculoInstituicao');
const Instituicao = require('../../models/Instituicao');
const TermoCompromissoProfessor = require('../../models/TermoCompromissoProfessor');
const AceiteTermoProfessor = require('../../models/AceiteTermoProfessor');
const { autenticar, apenasProfessor } = require('../../middleware/autenticacao');
const { validatePasswordStrength } = require('../../utils/passwordPolicy');
const { obterEstadoOnboardingProfessor, obterTermoVigente } = require('../../services/onboardingProfessor');
const { gerarComprovanteTermoProfessor } = require('../../utils/comprovanteTermoProfessorPdf');
const { logAction } = require('../../utils/audit');

function apenasAdmin(req, res, next) {
  const tipo = String(req.usuario?.tipo || '').toLowerCase();
  if (['admin', 'master', 'superadmin'].includes(tipo)) return next();
  return res.status(403).json({ mensagem: 'Acesso permitido apenas a administradores.' });
}

function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}

function getForwardedFor(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (Array.isArray(xff)) return xff.join(', ');
  return typeof xff === 'string' ? xff : null;
}

function parseUserAgent(userAgent = '') {
  const ua = String(userAgent || '');
  const low = ua.toLowerCase();
  let navegador = null;
  let sistema = null;
  let dispositivo = 'Desktop';

  if (low.includes('edg/')) navegador = 'Edge';
  else if (low.includes('opr/') || low.includes('opera')) navegador = 'Opera';
  else if (low.includes('chrome/')) navegador = 'Chrome';
  else if (low.includes('firefox/')) navegador = 'Firefox';
  else if (low.includes('safari/')) navegador = 'Safari';

  if (low.includes('windows')) sistema = 'Windows';
  else if (low.includes('android')) sistema = 'Android';
  else if (low.includes('iphone') || low.includes('ipad') || low.includes('ios')) sistema = 'iOS';
  else if (low.includes('mac os') || low.includes('macintosh')) sistema = 'macOS';
  else if (low.includes('linux')) sistema = 'Linux';

  if (low.includes('ipad') || low.includes('tablet')) dispositivo = 'Tablet';
  else if (low.includes('mobile') || low.includes('android') || low.includes('iphone')) dispositivo = 'Mobile';

  return { navegador, sistema, dispositivo };
}

function randomCode() {
  return `TCP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function hashAcceptance({
  usuarioId,
  instituicaoId,
  usuarioNome,
  usuarioEmail,
  instituicaoNome,
  termo,
  aceitoEm,
  codigo,
}) {
  return crypto.createHash('sha256').update([
    String(usuarioId),
    String(instituicaoId),
    String(usuarioNome || ''),
    String(usuarioEmail || ''),
    String(instituicaoNome || ''),
    String(termo._id),
    String(termo.versao),
    String(termo.conteudoHash),
    new Date(aceitoEm).toISOString(),
    String(codigo),
  ].join('|'), 'utf8').digest('hex');
}

function sanitizeTermo(termo, includeContent = false) {
  if (!termo) return null;
  return {
    id: String(termo._id),
    titulo: termo.titulo,
    versao: termo.versao,
    conteudoHash: termo.conteudoHash,
    publicadoEm: termo.publicadoEm,
    conteudo: includeContent ? termo.conteudo : undefined,
  };
}

async function carregarComprovante(aceiteId, instituicaoId, usuarioId = null) {
  const filtro = { _id: aceiteId, instituicao: instituicaoId };
  if (usuarioId) filtro.usuario = usuarioId;

  const aceite = await AceiteTermoProfessor.findOne(filtro).lean();
  if (!aceite) return null;

  const [professorAtual, instituicaoAtual] = await Promise.all([
    Usuario.findById(aceite.usuario).select('nome email').lean(),
    Instituicao.findById(instituicaoId).select('nome nomeExibicao sigla slug').lean(),
  ]);

  const professor = {
    nome: aceite.usuarioNome || professorAtual?.nome || 'Professor não localizado',
    email: aceite.usuarioEmail || professorAtual?.email || null,
  };
  const instituicao = {
    ...(instituicaoAtual || {}),
    nome: aceite.instituicaoNome || instituicaoAtual?.nomeExibicao || instituicaoAtual?.nome || instituicaoAtual?.sigla || 'Instituição não localizada',
  };

  const hashEsperado = hashAcceptance({
    usuarioId: aceite.usuario,
    instituicaoId: aceite.instituicao,
    usuarioNome: professor.nome,
    usuarioEmail: professor.email,
    instituicaoNome: instituicao.nome,
    termo: {
      _id: aceite.termo,
      versao: aceite.termoVersao,
      conteudoHash: aceite.termoConteudoHash,
    },
    aceitoEm: aceite.aceitoEm,
    codigo: aceite.comprovanteCodigo,
  });

  return {
    aceite,
    professor,
    instituicao,
    integridadeValida: hashEsperado === aceite.comprovanteHash,
  };
}

router.get('/status', autenticar, apenasProfessor, async (req, res) => {
  try {
    const estado = await obterEstadoOnboardingProfessor(req.usuario, {
      instituicaoId: req.usuario.instituicao,
      incluirConteudo: true,
    });
    return res.json(estado);
  } catch (error) {
    console.error('[termosProfessor/status]', error);
    return res.status(error.statusCode || 500).json({ mensagem: error.message || 'Erro ao verificar primeiro acesso.' });
  }
});

router.post('/alterar-senha', autenticar, apenasProfessor, async (req, res) => {
  try {
    const senhaAtual = String(req.body?.senhaAtual || '');
    const novaSenha = String(req.body?.novaSenha || '');
    const confirmarSenha = String(req.body?.confirmarSenha || '');

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return res.status(400).json({ mensagem: 'Preencha a senha atual, a nova senha e a confirmação.' });
    }
    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({ mensagem: 'A confirmação não corresponde à nova senha.' });
    }

    const check = validatePasswordStrength(novaSenha);
    if (!check.ok) return res.status(400).json({ mensagem: check.message });

    const usuario = await Usuario.findById(req.usuario.id).select('+senha onboardingProfessor tipo ativo nome email instituicao tenantId');
    if (!usuario || usuario.ativo === false || String(req.usuario.tipo) !== 'professor') {
      return res.status(404).json({ mensagem: 'Professor não encontrado ou inativo.' });
    }

    const senhaAtualValida = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaAtualValida) {
      await logAction({
        req,
        acao: 'PROFESSOR_TROCA_SENHA_NEGADA',
        entidade: 'Usuario',
        entidadeId: String(usuario._id),
        entidadeNome: usuario.nome,
        modulo: 'primeiro-acesso-professor',
        categoria: 'seguranca',
        severidade: 'aviso',
        status: 'negado',
        motivo: 'Senha atual incorreta',
      });
      return res.status(401).json({ mensagem: 'A senha atual está incorreta.' });
    }

    const mesmaSenha = await bcrypt.compare(novaSenha, usuario.senha);
    if (mesmaSenha) {
      return res.status(400).json({ mensagem: 'A nova senha deve ser diferente da senha atual.' });
    }

    usuario.senha = novaSenha;
    usuario.onboardingProfessor = usuario.onboardingProfessor || {};
    usuario.onboardingProfessor.obrigarTrocaSenha = false;
    usuario.onboardingProfessor.senhaAlteradaEm = new Date();
    await usuario.save();

    await logAction({
      req,
      acao: 'PROFESSOR_SENHA_ALTERADA',
      entidade: 'Usuario',
      entidadeId: String(usuario._id),
      entidadeNome: usuario.nome,
      modulo: 'primeiro-acesso-professor',
      categoria: 'seguranca',
      severidade: 'info',
      status: 'sucesso',
      extra: { primeiroAcesso: true },
    });

    const estado = await obterEstadoOnboardingProfessor(req.usuario, {
      instituicaoId: req.usuario.instituicao,
      incluirConteudo: true,
    });
    return res.json({ mensagem: 'Senha alterada com sucesso.', onboarding: estado });
  } catch (error) {
    console.error('[termosProfessor/alterar-senha]', error);
    return res.status(500).json({ mensagem: 'Não foi possível alterar a senha.' });
  }
});

router.post('/aceitar', autenticar, apenasProfessor, async (req, res) => {
  try {
    const declaracaoLeitura = req.body?.declaracaoLeitura === true;
    const declaracaoCompromisso = req.body?.declaracaoCompromisso === true;

    if (!declaracaoLeitura || !declaracaoCompromisso) {
      return res.status(400).json({ mensagem: 'Marque as duas declarações para registrar o aceite.' });
    }

    const usuario = await Usuario.findById(req.usuario.id)
      .select('nome email tipo ativo instituicao tenantId onboardingProfessor')
      .lean();
    if (!usuario || usuario.ativo === false) return res.status(404).json({ mensagem: 'Professor não encontrado.' });
    if (usuario.onboardingProfessor?.obrigarTrocaSenha === true) {
      return res.status(409).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        mensagem: 'Altere sua senha antes de aceitar o termo.',
      });
    }

    const instituicaoId = req.usuario.instituicao;
    const termo = await obterTermoVigente(instituicaoId).lean();
    if (!termo) {
      return res.status(409).json({
        code: 'NO_ACTIVE_TERM',
        mensagem: 'Ainda não há Termo de Compromisso vigente para esta instituição.',
      });
    }

    const existente = await AceiteTermoProfessor.findOne({
      instituicao: instituicaoId,
      usuario: req.usuario.id,
      termo: termo._id,
      revogadoEm: null,
    }).lean();

    if (existente) {
      const estadoExistente = await obterEstadoOnboardingProfessor(req.usuario, {
        instituicaoId,
        incluirConteudo: true,
      });
      return res.json({ mensagem: 'Este termo já foi aceito.', aceite: existente, onboarding: estadoExistente });
    }

    const instituicao = await Instituicao.findById(instituicaoId)
      .select('nome nomeExibicao sigla')
      .lean();
    const usuarioNome = String(usuario.nome || 'Professor').trim();
    const usuarioEmail = String(usuario.email || '').trim().toLowerCase() || null;
    const instituicaoNome = String(
      instituicao?.nomeExibicao || instituicao?.nome || instituicao?.sigla || 'Instituição de Ensino'
    ).trim();
    const aceitoEm = new Date();
    const comprovanteCodigo = randomCode();
    const comprovanteHash = hashAcceptance({
      usuarioId: req.usuario.id,
      instituicaoId,
      usuarioNome,
      usuarioEmail,
      instituicaoNome,
      termo,
      aceitoEm,
      codigo: comprovanteCodigo,
    });
    const userAgent = String(req.headers?.['user-agent'] || '');
    const parsed = parseUserAgent(userAgent);

    const aceite = await AceiteTermoProfessor.create({
      instituicao: instituicaoId,
      tenantId: instituicaoId,
      usuario: req.usuario.id,
      usuarioNome,
      usuarioEmail,
      usuarioTipo: 'professor',
      instituicaoNome,
      termo: termo._id,
      termoTitulo: termo.titulo,
      termoVersao: termo.versao,
      termoConteudo: termo.conteudo,
      termoConteudoHash: termo.conteudoHash,
      aceitoEm,
      declaracaoLeitura,
      declaracaoCompromisso,
      comprovanteCodigo,
      comprovanteHash,
      ip: getClientIp(req),
      forwardedFor: getForwardedFor(req),
      userAgent,
      navegador: parsed.navegador,
      sistema: parsed.sistema,
      dispositivo: parsed.dispositivo,
      requestId: req.requestId || req.headers?.['x-request-id'] || null,
      sessionId: req.sessionIdAudit || req.headers?.['x-session-id'] || `actor:${req.usuario.id}`,
      origem: 'primeiro-acesso',
    });

    await logAction({
      req,
      acao: 'PROFESSOR_TERMO_ACEITO',
      entidade: 'AceiteTermoProfessor',
      entidadeId: String(aceite._id),
      entidadeNome: termo.titulo,
      modulo: 'primeiro-acesso-professor',
      categoria: 'termo-compromisso',
      severidade: 'info',
      status: 'sucesso',
      extra: {
        termoId: String(termo._id),
        versao: termo.versao,
        conteudoHash: termo.conteudoHash,
        comprovanteCodigo,
        comprovanteHash,
      },
    });

    const estado = await obterEstadoOnboardingProfessor(req.usuario, {
      instituicaoId,
      incluirConteudo: true,
    });

    return res.status(201).json({
      mensagem: 'Termo aceito e comprovante registrado com sucesso.',
      aceite: {
        id: String(aceite._id),
        aceitoEm: aceite.aceitoEm,
        comprovanteCodigo: aceite.comprovanteCodigo,
        comprovanteUrl: `/api/termos-professor/me/comprovante.pdf?aceite=${encodeURIComponent(String(aceite._id))}`,
      },
      onboarding: estado,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ mensagem: 'O aceite deste termo já está registrado.' });
    }
    console.error('[termosProfessor/aceitar]', error);
    return res.status(500).json({ mensagem: 'Não foi possível registrar o aceite do termo.' });
  }
});

router.get('/me/aceites', autenticar, apenasProfessor, async (req, res) => {
  try {
    const items = await AceiteTermoProfessor.find({
      instituicao: req.usuario.instituicao,
      usuario: req.usuario.id,
    }).select('-termoConteudo -userAgent').sort({ aceitoEm: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ mensagem: 'Não foi possível consultar seus termos.' });
  }
});

router.get('/me/comprovante.pdf', autenticar, apenasProfessor, async (req, res) => {
  try {
    let aceiteId = String(req.query?.aceite || '').trim();
    if (!aceiteId) {
      const ultimo = await AceiteTermoProfessor.findOne({
        instituicao: req.usuario.instituicao,
        usuario: req.usuario.id,
      }).sort({ aceitoEm: -1 }).select('_id').lean();
      aceiteId = ultimo?._id ? String(ultimo._id) : '';
    }
    if (!mongoose.isValidObjectId(aceiteId)) return res.status(400).json({ mensagem: 'Comprovante inválido.' });

    const data = await carregarComprovante(aceiteId, req.usuario.instituicao, req.usuario.id);
    if (!data) return res.status(404).json({ mensagem: 'Comprovante não encontrado.' });
    return gerarComprovanteTermoProfessor(res, data);
  } catch (error) {
    console.error('[termosProfessor/me/comprovante]', error);
    return res.status(500).json({ mensagem: 'Não foi possível gerar o comprovante.' });
  }
});

router.get('/admin/resumo', autenticar, apenasAdmin, async (req, res) => {
  try {
    const instituicaoId = req.usuario.instituicao;
    const termo = await obterTermoVigente(instituicaoId).lean();

    const [primarios, vinculos] = await Promise.all([
      Usuario.find({
        tipo: 'professor',
        ativo: { $ne: false },
        $or: [{ instituicao: instituicaoId }, { tenantId: instituicaoId }],
      }).select('_id nome email ativo onboardingProfessor').lean(),
      UsuarioVinculoInstituicao.find({
        instituicao: instituicaoId,
        tipoInstitucional: 'professor',
        ativo: true,
      }).select('usuario').lean(),
    ]);

    const ids = new Set(primarios.map((u) => String(u._id)));
    const vinculadosIds = vinculos.map((v) => String(v.usuario)).filter((id) => !ids.has(id));
    const vinculados = vinculadosIds.length
      ? await Usuario.find({ _id: { $in: vinculadosIds }, ativo: { $ne: false } })
        .select('_id nome email ativo onboardingProfessor').lean()
      : [];
    const professores = [...primarios, ...vinculados].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    let aceites = [];
    if (termo?._id && professores.length) {
      aceites = await AceiteTermoProfessor.find({
        instituicao: instituicaoId,
        termo: termo._id,
        usuario: { $in: professores.map((p) => p._id) },
        revogadoEm: null,
      }).select('_id usuario aceitoEm comprovanteCodigo comprovanteHash termoVersao').lean();
    }
    const byUser = new Map(aceites.map((a) => [String(a.usuario), a]));

    const items = professores.map((professor) => {
      const aceite = byUser.get(String(professor._id));
      return {
        id: String(professor._id),
        nome: professor.nome,
        email: professor.email,
        precisaTrocarSenha: professor.onboardingProfessor?.obrigarTrocaSenha === true,
        termoAceito: Boolean(aceite),
        aceitoEm: aceite?.aceitoEm || null,
        aceiteId: aceite?._id ? String(aceite._id) : null,
        comprovanteCodigo: aceite?.comprovanteCodigo || null,
        situacao: professor.onboardingProfessor?.obrigarTrocaSenha === true
          ? 'AGUARDANDO_TROCA_SENHA'
          : aceite
            ? 'CONCLUIDO'
            : termo
              ? 'AGUARDANDO_TERMO'
              : 'SEM_TERMO_VIGENTE',
      };
    });

    const historico = await AceiteTermoProfessor.find({
      instituicao: instituicaoId,
    })
      .select('_id usuario usuarioNome usuarioEmail termoTitulo termoVersao termoConteudoHash aceitoEm comprovanteCodigo comprovanteHash revogadoEm')
      .sort({ aceitoEm: -1 })
      .limit(1000)
      .lean();

    return res.json({
      termo: sanitizeTermo(termo, true),
      totais: {
        professores: items.length,
        concluidos: items.filter((i) => i.situacao === 'CONCLUIDO').length,
        aguardandoSenha: items.filter((i) => i.situacao === 'AGUARDANDO_TROCA_SENHA').length,
        aguardandoTermo: items.filter((i) => i.situacao === 'AGUARDANDO_TERMO').length,
        aceitesArmazenados: historico.length,
      },
      items,
      historico: historico.map((aceite) => ({
        id: String(aceite._id),
        professorId: String(aceite.usuario || ''),
        nome: aceite.usuarioNome || 'Professor não localizado',
        email: aceite.usuarioEmail || '',
        titulo: aceite.termoTitulo,
        versao: aceite.termoVersao,
        conteudoHash: aceite.termoConteudoHash,
        aceitoEm: aceite.aceitoEm,
        comprovanteCodigo: aceite.comprovanteCodigo,
        comprovanteHash: aceite.comprovanteHash,
        revogadoEm: aceite.revogadoEm || null,
      })),
      historicoLimitado: historico.length >= 1000,
    });
  } catch (error) {
    console.error('[termosProfessor/admin/resumo]', error);
    return res.status(500).json({ mensagem: 'Não foi possível consultar os termos dos professores.' });
  }
});

router.get('/admin/aceites/:id/comprovante.pdf', autenticar, apenasAdmin, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensagem: 'Comprovante inválido.' });
    const data = await carregarComprovante(req.params.id, req.usuario.instituicao);
    if (!data) return res.status(404).json({ mensagem: 'Comprovante não encontrado nesta instituição.' });
    return gerarComprovanteTermoProfessor(res, data);
  } catch (error) {
    console.error('[termosProfessor/admin/comprovante]', error);
    return res.status(500).json({ mensagem: 'Não foi possível gerar o comprovante.' });
  }
});

router.get('/admin/termo-atual.pdf', autenticar, apenasAdmin, async (req, res) => {
  try {
    const termo = await obterTermoVigente(req.usuario.instituicao).lean();
    if (!termo) return res.status(404).json({ mensagem: 'Nenhum termo vigente.' });

    const instituicao = await Instituicao.findById(req.usuario.instituicao).select('nome nomeExibicao sigla').lean();
    const fakeAceite = {
      ...termo,
      instituicao: req.usuario.instituicao,
      termoTitulo: termo.titulo,
      termoVersao: termo.versao,
      termoConteudo: termo.conteudo,
      termoConteudoHash: termo.conteudoHash,
      aceitoEm: null,
      comprovanteCodigo: `MODELO-${termo.versao}`,
      comprovanteHash: termo.conteudoHash,
    };
    return gerarComprovanteTermoProfessor(res, {
      aceite: fakeAceite,
      professor: { nome: 'MODELO DO TERMO', email: 'Sem aceite individual' },
      instituicao: { ...instituicao, nome: instituicao?.nomeExibicao || instituicao?.nome || instituicao?.sigla },
    });
  } catch (error) {
    console.error('[termosProfessor/admin/termo-atual.pdf]', error);
    return res.status(500).json({ mensagem: 'Não foi possível gerar o modelo do termo.' });
  }
});

module.exports = router;
