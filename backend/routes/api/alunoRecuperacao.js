'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const router = express.Router();

const Usuario = require('../../models/Usuario');
const Aluno = require('../../models/Aluno');
const AlunoRecuperacao = require('../../models/AlunoRecuperacao');
const { autenticar } = require('../../middleware/autenticacao');

let validatePasswordStrength = null;
try {
  ({ validatePasswordStrength } = require('../../utils/passwordPolicy'));
} catch {
  validatePasswordStrength = null;
}

const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const SITE_BASE = String(
  process.env.PUBLIC_SITE_URL ||
  process.env.CLIENT_URL ||
  'https://www.axoriin.com.br'
).replace(/\/+$/, '');

// Endereço público oficial usado nos links enviados aos alunos.
// Mantido separado do backend do Render para nunca expor a API como página.
const PORTAL_PUBLIC_BASE = String(
  process.env.AXORIIN_PORTAL_PUBLIC_URL ||
  'https://www.axoriin.com.br'
).replace(/\/+$/, '');

const resetRequestsByIp = new Map();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCodigo(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@')) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) &&
    /^[a-z0-9.-]+$/i.test(domain) &&
    !domain.includes('..');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function pickBackendBaseUrl(req) {
  const env =
    process.env.PUBLIC_API_URL ||
    process.env.APP_API_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (env) return String(env).replace(/\/+$/, '');

  const proto = String(
    req.headers['x-forwarded-proto'] ||
    req.protocol ||
    'https'
  ).split(',')[0].trim();

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

function checkResetRate(req) {
  const key = String(
    req.headers['x-forwarded-for'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 8;

  const recent = (resetRequestsByIp.get(key) || []).filter((ts) => now - ts < windowMs);
  recent.push(now);
  resetRequestsByIp.set(key, recent);

  return recent.length <= max;
}

function genericResetResponse(res) {
  return res.json({
    ok: true,
    mensagem:
      'Se o código e o e-mail corresponderem a uma conta com recuperação confirmada, enviaremos um link para redefinir a senha.'
  });
}

async function sendEmailBestEffort({ to, subject, html, text }) {
  try {
    const m = global.mensageria;
    if (m) {
      if (typeof m.sendEmail === 'function') {
        return await m.sendEmail({ to, subject, html, text });
      }
      if (m.email && typeof m.email.send === 'function') {
        return await m.email.send({ to, subject, html, text });
      }
      if (m.email && typeof m.email.sendMail === 'function') {
        return await m.email.sendMail({ to, subject, html, text });
      }
    }
  } catch (e) {
    console.warn('[aluno-recuperacao][mail] falha via mensageria:', e?.message || e);
  }

  try {
    const mailer = require('../../utils/mailer');
    if (mailer) {
      if (typeof mailer.sendMail === 'function') {
        return await mailer.sendMail({ to, subject, html, text });
      }
      if (typeof mailer.send === 'function') {
        return await mailer.send({ to, subject, html, text });
      }
      if (typeof mailer.sendEmail === 'function') {
        return await mailer.sendEmail({ to, subject, html, text });
      }
    }
  } catch (e) {
    console.warn('[aluno-recuperacao][mail] utils/mailer indisponível:', e?.message || e);
  }

  console.warn('[aluno-recuperacao][mail] nenhum provedor de e-mail disponível.');
  return { ok: false, fallback: true };
}

function passwordValidationMessage(password) {
  if (typeof validatePasswordStrength === 'function') {
    try {
      const result = validatePasswordStrength(String(password || ''));
      if (result === true || result?.ok === true || result?.valid === true) {
        return null;
      }

      if (typeof result === 'string') return result;
      if (result?.message) return result.message;
      if (result?.reason) return result.reason;
      if (Array.isArray(result?.errors) && result.errors.length) {
        return result.errors.join(' ');
      }

      return 'A nova senha não atende aos requisitos de segurança.';
    } catch (e) {
      return e?.message || 'A nova senha não atende aos requisitos de segurança.';
    }
  }

  if (String(password || '').length < 8) {
    return 'A nova senha deve ter pelo menos 8 caracteres.';
  }

  return null;
}

async function getAuthenticatedStudent(req) {
  if (!req.usuario?.id || req.usuario?.tipo !== 'aluno') {
    return null;
  }

  const usuario = await Usuario.findOne({
    _id: req.usuario.id,
    tipo: 'aluno',
    $or: [{ ativo: true }, { ativo: { $exists: false } }]
  }).select('+senha _id nome email tipo portal alunoId instituicao tenantId ativo');

  if (!usuario) return null;

  const alunoId = usuario.alunoId || req.usuario.alunoId;
  const instituicaoId = usuario.instituicao || usuario.tenantId || req.usuario.instituicao;

  if (!alunoId || !instituicaoId) return null;

  const aluno = await Aluno.findOne({
    _id: alunoId,
    $or: [
      { instituicao: instituicaoId },
      { tenantId: instituicaoId }
    ]
  }).select('_id nome turma codigoAcesso usuarioId instituicao tenantId');

  if (!aluno) return null;

  return {
    usuario,
    aluno,
    alunoId: aluno._id,
    instituicaoId
  };
}

async function resolveStudentUser(aluno) {
  if (!aluno) return null;

  const instituicaoId = aluno.instituicao || aluno.tenantId;

  if (aluno.usuarioId) {
    const byId = await Usuario.findOne({
      _id: aluno.usuarioId,
      tipo: 'aluno',
      $or: [
        { instituicao: instituicaoId },
        { tenantId: instituicaoId }
      ]
    }).select('+senha _id alunoId instituicao tenantId tipo portal ativo');

    if (byId) return byId;
  }

  return await Usuario.findOne({
    alunoId: aluno._id,
    tipo: 'aluno',
    $and: [
      {
        $or: [
          { instituicao: instituicaoId },
          { tenantId: instituicaoId }
        ]
      },
      {
        $or: [
          { ativo: true },
          { ativo: { $exists: false } }
        ]
      }
    ]
  }).select('+senha _id alunoId instituicao tenantId tipo portal ativo');
}

/**
 * GET /api/aluno-recuperacao/status
 * Mostra somente o estado de segurança da conta do aluno autenticado.
 */
router.get('/status', autenticar, async (req, res) => {
  try {
    const ctx = await getAuthenticatedStudent(req);

    if (!ctx) {
      return res.status(403).json({
        mensagem: 'Esta área é exclusiva para contas de aluno.'
      });
    }

    const rec = await AlunoRecuperacao.findOne({
      instituicao: ctx.instituicaoId,
      alunoId: ctx.alunoId
    }).lean();

    return res.json({
      ok: true,
      configurado: Boolean(rec?.emailRecuperacao),
      verificado: Boolean(rec?.emailRecuperacao && rec?.emailRecuperacaoVerificadoEm),
      emailRecuperacao: rec?.emailRecuperacao || null,
      emailMascarado: rec?.emailRecuperacao ? maskEmail(rec.emailRecuperacao) : null,
      emailPendente: rec?.emailPendente || null,
      emailPendenteMascarado: rec?.emailPendente ? maskEmail(rec.emailPendente) : null,
      verificadoEm: rec?.emailRecuperacaoVerificadoEm || null,
      codigoAcesso: ctx.aluno.codigoAcesso || null
    });
  } catch (error) {
    console.error('[aluno-recuperacao][status]', error);
    return res.status(500).json({
      mensagem: 'Não foi possível consultar a segurança da conta.'
    });
  }
});

/**
 * POST /api/aluno-recuperacao/email
 * O aluno autenticado informa um e-mail próprio ou de responsável.
 * Exige a senha atual antes de alterar o endereço de recuperação.
 */
router.post('/email', autenticar, async (req, res) => {
  const email = normalizeEmail(
    req.body?.emailRecuperacao ||
    req.body?.email ||
    req.body?.recoveryEmail
  );
  const senhaAtual = String(
    req.body?.senhaAtual ||
    req.body?.senha ||
    req.body?.password ||
    ''
  );

  if (!isValidEmail(email)) {
    return res.status(400).json({
      mensagem: 'Informe um e-mail válido.'
    });
  }

  if (!senhaAtual) {
    return res.status(400).json({
      mensagem: 'Informe sua senha atual para confirmar esta alteração.'
    });
  }

  try {
    const ctx = await getAuthenticatedStudent(req);

    if (!ctx) {
      return res.status(403).json({
        mensagem: 'Esta ação é exclusiva para contas de aluno.'
      });
    }

    const senhaValida = await bcrypt.compare(senhaAtual, ctx.usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({
        mensagem: 'Senha atual incorreta.'
      });
    }

    const existente = await AlunoRecuperacao.findOne({
      instituicao: ctx.instituicaoId,
      alunoId: ctx.alunoId
    });

    if (
      existente?.emailRecuperacao &&
      normalizeEmail(existente.emailRecuperacao) === email &&
      existente.emailRecuperacaoVerificadoEm
    ) {
      return res.json({
        ok: true,
        verificado: true,
        mensagem: 'Este e-mail já está confirmado como endereço de recuperação.'
      });
    }

    const rawToken = randomToken();
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + CONFIRM_TTL_MS);

    const rec = existente || new AlunoRecuperacao({
      instituicao: ctx.instituicaoId,
      alunoId: ctx.alunoId,
      usuarioId: ctx.usuario._id
    });

    rec.usuarioId = ctx.usuario._id;
    rec.emailPendente = email;
    rec.tokenConfirmacaoHash = tokenHash;
    rec.tokenConfirmacaoExpiraEm = expiraEm;

    await rec.save();

    // O e-mail abre uma página pública do portal. O código usa o parâmetro
    // `c` (e não `token`) para não colidir com mecanismos legados de JWT.
    const link =
      `${PORTAL_PUBLIC_BASE}/confirmar-recuperacao-aluno.html` +
      `?c=${encodeURIComponent(rawToken)}`;

    const subject = 'Confirme seu e-mail de recuperação — Axoriin';
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#122">
        <h2 style="margin:0 0 12px">Proteção da conta do aluno</h2>
        <p>Olá, <b>${String(ctx.aluno.nome || 'Aluno')}</b>.</p>
        <p>
          Este endereço foi informado para recuperação de acesso no
          <b>Axoriin • Portal do Aluno</b>.
        </p>
        <p style="margin:18px 0">
          <a href="${link}"
             style="display:inline-block;padding:12px 16px;border-radius:10px;
                    background:#6f58ff;color:#fff;text-decoration:none;font-weight:700;">
            Confirmar e-mail de recuperação
          </a>
        </p>
        <p>O link expira em 24 horas.</p>
        <p style="color:#667;font-size:12px">
          Se você não reconhece esta solicitação, ignore esta mensagem.
        </p>
      </div>
    `;

    const mail = await sendEmailBestEffort({
      to: email,
      subject,
      html,
      text:
        `Confirme o e-mail de recuperação da conta do aluno ${ctx.aluno.nome}: ${link}`
    });

    if (mail?.fallback === true && mail?.ok === false) {
      return res.status(503).json({
        ok: false,
        mensagem:
          'O endereço foi preparado, mas o serviço de e-mail não está disponível neste momento. Tente novamente mais tarde.'
      });
    }

    return res.json({
      ok: true,
      verificado: false,
      emailMascarado: maskEmail(email),
      mensagem:
        'Enviamos um link de confirmação. Abra o e-mail informado para concluir a proteção da conta.'
    });
  } catch (error) {
    console.error('[aluno-recuperacao][email]', error);
    return res.status(500).json({
      mensagem: 'Não foi possível cadastrar o e-mail de recuperação.'
    });
  }
});

/**
 * Confirma um código de recuperação de uso único.
 * Retorna um objeto simples para permitir uso tanto pelo POST público
 * quanto pelo GET legado.
 */
async function confirmarEmailRecuperacao(rawToken) {
  const tokenLimpo = String(rawToken || '').trim();

  // Tokens gerados por este módulo são 32 bytes em hexadecimal = 64 caracteres.
  if (!/^[a-f0-9]{64}$/i.test(tokenLimpo)) {
    return { ok: false, motivo: 'invalido' };
  }

  const tokenHash = hashToken(tokenLimpo);

  const rec = await AlunoRecuperacao.findOne({
    tokenConfirmacaoHash: tokenHash,
    tokenConfirmacaoExpiraEm: { $gt: new Date() },
    emailPendente: { $nin: [null, ''] }
  }).select('+tokenConfirmacaoHash');

  if (!rec) {
    return { ok: false, motivo: 'expirado_ou_substituido' };
  }

  rec.emailRecuperacao = normalizeEmail(rec.emailPendente);
  rec.emailRecuperacaoVerificadoEm = new Date();
  rec.emailPendente = null;
  rec.tokenConfirmacaoHash = null;
  rec.tokenConfirmacaoExpiraEm = null;
  rec.resetTokenHash = null;
  rec.resetTokenExpiraEm = null;

  await rec.save();

  return {
    ok: true,
    emailMascarado: maskEmail(rec.emailRecuperacao)
  };
}

/**
 * POST /api/aluno-recuperacao/confirmar-email
 * Endpoint público usado pela página oficial de confirmação.
 * O código viaja no corpo JSON, não na query string.
 */
router.post('/confirmar-email', async (req, res) => {
  const rawToken = String(
    req.body?.codigoConfirmacao ||
    req.body?.codigo ||
    req.body?.token ||
    ''
  ).trim();

  try {
    const result = await confirmarEmailRecuperacao(rawToken);

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        code: 'RECOVERY_CONFIRMATION_INVALID',
        mensagem:
          'Este link de confirmação é inválido, expirou ou foi substituído por um link mais recente.'
      });
    }

    return res.json({
      ok: true,
      emailMascarado: result.emailMascarado || null,
      mensagem: 'E-mail de recuperação confirmado com sucesso.'
    });
  } catch (error) {
    console.error('[aluno-recuperacao][confirmar-email-post]', error);
    return res.status(500).json({
      ok: false,
      mensagem: 'Não foi possível confirmar o e-mail de recuperação.'
    });
  }
});

/**
 * GET legado: mantido somente para links antigos já enviados.
 * Novos e-mails NÃO usam mais ?token=... no endpoint da API.
 */
router.get('/confirmar-email', async (req, res) => {
  const rawToken = String(req.query?.c || req.query?.token || '').trim();

  try {
    const result = await confirmarEmailRecuperacao(rawToken);

    if (!result.ok) {
      return res.redirect(
        `${PORTAL_PUBLIC_BASE}/confirmar-recuperacao-aluno.html?estado=invalido`
      );
    }

    return res.redirect(
      `${PORTAL_PUBLIC_BASE}/confirmar-recuperacao-aluno.html?estado=confirmado`
    );
  } catch (error) {
    console.error('[aluno-recuperacao][confirmar-email-get]', error);
    return res.redirect(
      `${PORTAL_PUBLIC_BASE}/confirmar-recuperacao-aluno.html?estado=erro`
    );
  }
});

/**
 * POST /api/aluno-recuperacao/solicitar-reset
 * Público. Exige código de acesso + e-mail de recuperação confirmado.
 * A resposta é propositalmente genérica para evitar enumeração de contas.
 */
router.post('/solicitar-reset', async (req, res) => {
  const codigoAcesso = normalizeCodigo(
    req.body?.codigoAcesso ||
    req.body?.codigo ||
    req.body?.login
  );
  const email = normalizeEmail(
    req.body?.emailRecuperacao ||
    req.body?.email
  );

  if (!checkResetRate(req)) {
    return res.status(429).json({
      mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    });
  }

  if (!codigoAcesso || !isValidEmail(email)) {
    return genericResetResponse(res);
  }

  try {
    const candidatos = await Aluno.find({
      codigoAcesso
    }).select('_id nome turma codigoAcesso usuarioId instituicao tenantId').limit(10).lean();

    const correspondencias = [];

    for (const aluno of candidatos || []) {
      const instituicaoId = aluno.instituicao || aluno.tenantId;
      if (!instituicaoId) continue;

      const rec = await AlunoRecuperacao.findOne({
        instituicao: instituicaoId,
        alunoId: aluno._id,
        emailRecuperacao: email,
        emailRecuperacaoVerificadoEm: { $ne: null }
      }).lean();

      if (rec) {
        correspondencias.push({ aluno, rec });
      }
    }

    // Só prossegue se código + e-mail identificarem uma única conta.
    if (correspondencias.length !== 1) {
      return genericResetResponse(res);
    }

    const { aluno, rec } = correspondencias[0];
    const usuario = await resolveStudentUser(aluno);

    if (!usuario) {
      return genericResetResponse(res);
    }

    const rawToken = randomToken();
    const tokenHash = hashToken(rawToken);
    const expiraEm = new Date(Date.now() + RESET_TTL_MS);

    await AlunoRecuperacao.updateOne(
      { _id: rec._id },
      {
        $set: {
          usuarioId: usuario._id,
          resetTokenHash: tokenHash,
          resetTokenExpiraEm: expiraEm
        }
      }
    );

    const link =
      `${SITE_BASE}/redefinir-senha-aluno.html` +
      `?token=${encodeURIComponent(rawToken)}`;

    const subject = 'Redefinição de senha — Axoriin Portal do Aluno';
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#122">
        <h2 style="margin:0 0 12px">Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha de <b>${String(aluno.nome || 'um aluno')}</b>.</p>
        <p style="margin:18px 0">
          <a href="${link}"
             style="display:inline-block;padding:12px 16px;border-radius:10px;
                    background:#6f58ff;color:#fff;text-decoration:none;font-weight:700;">
            Criar nova senha
          </a>
        </p>
        <p>Este link expira em 30 minutos e poderá ser utilizado uma única vez.</p>
        <p style="color:#667;font-size:12px">
          Se você não solicitou a redefinição, ignore esta mensagem.
        </p>
      </div>
    `;

    await sendEmailBestEffort({
      to: email,
      subject,
      html,
      text: `Redefina a senha do Portal do Aluno: ${link}`
    });

    return genericResetResponse(res);
  } catch (error) {
    console.error('[aluno-recuperacao][solicitar-reset]', error);
    // Também mantém resposta genérica em falhas de busca.
    return genericResetResponse(res);
  }
});

/**
 * POST /api/aluno-recuperacao/redefinir
 * Público, autorizado pelo token de uso único enviado ao e-mail confirmado.
 */
router.post('/redefinir', async (req, res) => {
  const rawToken = String(req.body?.token || '');
  const novaSenha = String(
    req.body?.novaSenha ||
    req.body?.senha ||
    ''
  );

  if (!rawToken) {
    return res.status(400).json({
      mensagem: 'Link de redefinição inválido.'
    });
  }

  const passwordError = passwordValidationMessage(novaSenha);
  if (passwordError) {
    return res.status(400).json({
      mensagem: passwordError
    });
  }

  try {
    const tokenHash = hashToken(rawToken);

    const rec = await AlunoRecuperacao.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiraEm: { $gt: new Date() },
      emailRecuperacaoVerificadoEm: { $ne: null }
    }).select('+resetTokenHash');

    if (!rec) {
      return res.status(400).json({
        mensagem: 'Este link é inválido ou expirou. Solicite uma nova recuperação.'
      });
    }

    const aluno = await Aluno.findOne({
      _id: rec.alunoId,
      $or: [
        { instituicao: rec.instituicao },
        { tenantId: rec.instituicao }
      ]
    }).select('_id usuarioId instituicao tenantId codigoAcesso');

    if (!aluno) {
      return res.status(400).json({
        mensagem: 'Conta do aluno não encontrada.'
      });
    }

    const usuario = await resolveStudentUser(aluno);

    if (!usuario) {
      return res.status(400).json({
        mensagem: 'Acesso do aluno não está vinculado corretamente.'
      });
    }

    usuario.senha = novaSenha;
    await usuario.save();

    rec.usuarioId = usuario._id;
    rec.resetTokenHash = null;
    rec.resetTokenExpiraEm = null;
    await rec.save();

    return res.json({
      ok: true,
      mensagem: 'Senha alterada com sucesso. Você já pode entrar no Portal do Aluno.'
    });
  } catch (error) {
    console.error('[aluno-recuperacao][redefinir]', error);
    return res.status(500).json({
      mensagem: 'Não foi possível redefinir a senha.'
    });
  }
});

module.exports = router;
