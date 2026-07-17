// backend/routes/api/controleNotificacoes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const { autenticar } = require('../../middleware/autenticacao');

let Instituicao = null;
let ConfiguracaoDisciplinar = null;

try {
  Instituicao = require('../../models/Instituicao');
} catch (_) {
  Instituicao = null;
}

try {
  ConfiguracaoDisciplinar = require('../../models/ConfiguracaoDisciplinar');
} catch (_) {
  ConfiguracaoDisciplinar = null;
}

/* ============================================================
   🔹 Mensageria opcional
   ============================================================ */
let mensageria = null;
try {
  mensageria = require('../../services/mensageria');
  console.log('[CTRL-NOTIF] mensageria carregada.');
} catch (_) {
  console.log('[CTRL-NOTIF] mensageria NÃO encontrada (ok por enquanto).');
}

/* ============================================================
   🔹 UTILITÁRIOS
   ============================================================ */

function filtroInstituicaoDoUsuario(usuario) {
  const inst = (usuario && usuario.instituicao) ? String(usuario.instituicao) : null;
  if (!inst) return { _id: null };
  return { instituicao: inst };
}

function normalizarTexto(v) {
  return String(v || '').trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = normalizarTexto(v);
    if (s) return s;
  }
  return '';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notaEstaNaFaixaNP(nota) {
  const n = Number(nota);
  return Number.isFinite(n) && n >= 5.0 && n <= 6.99;
}

async function carregarContextoInstitucional(instituicaoId) {
  const fallback = {
    nomeInstituicao: 'Colégio Militar Dom Pedro II/CZS',
    siglaInstituicao: 'CMDPII/CZS',
    instituicaoLabel: 'CMDPII/CZS',
    setorResponsavel: 'Coordenação',
    setorEnsino: 'Coordenação de Ensino',
    assinatura: 'Coordenação — Colégio Militar Dom Pedro II/CZS',
    mensagemAutomatica: 'Mensagem automática do Sistema Escolar – CMDPII/CZS.',
    subtituloEmail: 'Comunicado de Notificação Deferida'
  };

  if (!instituicaoId) return fallback;

  let instituicaoDoc = null;
  let configDoc = null;

  try {
    if (Instituicao) {
      instituicaoDoc = await Instituicao.findById(instituicaoId).lean();
    }
  } catch (e) {
    console.warn('[CTRL-NOTIF] Falha ao carregar Instituicao:', e?.message || e);
  }

  try {
    if (ConfiguracaoDisciplinar) {
      configDoc = await ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean();
    }
  } catch (e) {
    console.warn('[CTRL-NOTIF] Falha ao carregar ConfiguracaoDisciplinar:', e?.message || e);
  }

  const nomeInstituicao = firstNonEmpty(
    instituicaoDoc?.nome,
    instituicaoDoc?.nomeExibicao,
    instituicaoDoc?.nomeColegio,
    instituicaoDoc?.razaoSocial,
    fallback.nomeInstituicao
  );

  const siglaInstituicao = firstNonEmpty(
    instituicaoDoc?.sigla,
    instituicaoDoc?.slug,
    '',
  );

  // ✅ caminho correto do schema
  const cabecalhoCfg = firstNonEmpty(
    configDoc?.regulamento?.textos?.cabecalho
  );

  const setorResponsavel = firstNonEmpty(
    cabecalhoCfg && cabecalhoCfg.includes('–') ? cabecalhoCfg.split('–').slice(1).join('–').trim() : '',
    cabecalhoCfg && cabecalhoCfg.includes('-') ? cabecalhoCfg.split('-').slice(1).join('-').trim() : '',
    fallback.setorResponsavel
  );

  const instituicaoLabel = firstNonEmpty(
    nomeInstituicao,
    cabecalhoCfg && (cabecalhoCfg.split('–')[0] || cabecalhoCfg.split('-')[0]),
    siglaInstituicao,
    fallback.instituicaoLabel
  );

  return {
    nomeInstituicao,
    siglaInstituicao,
    instituicaoLabel: normalizarTexto(instituicaoLabel) || fallback.instituicaoLabel,
    setorResponsavel,
    setorEnsino: firstNonEmpty(setorResponsavel, fallback.setorEnsino),
    assinatura: `${firstNonEmpty(setorResponsavel, fallback.setorResponsavel)} — ${nomeInstituicao}`,
    mensagemAutomatica: `Mensagem automática do Sistema Escolar – ${nomeInstituicao || siglaInstituicao || fallback.nomeInstituicao}.`,
    subtituloEmail: fallback.subtituloEmail
  };
}

function assuntoDeferido(aluno, _notif, contexto = {}) {
  const nome = aluno?.nome || 'Aluno';
  const prefixo = contexto?.nomeInstituicao || contexto?.siglaInstituicao || 'Instituição';
  return `Notificação deferida | ${nome} | ${prefixo}`;
}

function htmlDeferido(aluno, notif, contexto = {}, linkCiencia = '') {
  const nome = aluno?.nome || '';
  const turma = aluno?.turma || '';
  const tipo = notif?.tipo || notif?.tipoMedida || '—';
  const motivo = notif?.motivo || '—';
  const num = notif?.numeroSequencial || '—';

  const cabecalho = `${contexto?.instituicaoLabel || 'Instituição'} – ${contexto?.setorEnsino || 'Coordenação'}`;
  const subtitulo = contexto?.subtituloEmail || 'Comunicado de Notificação Deferida';
  const assinatura = contexto?.assinatura || 'Coordenação — Instituição';
  const mensagemAutomatica = contexto?.mensagemAutomatica || 'Mensagem automática do Sistema Escolar.';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Notificação deferida</title>
</head>
<body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:620px;max-width:100%;background:#ffffff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.06);overflow:hidden;border:1px solid #eceff3;">
          <tr>
            <td style="background:#8B0000;padding:16px 22px;color:#fff;">
              <div style="font-weight:700;font-size:18px;letter-spacing:.2px;">${escapeHtml(cabecalho)}</div>
              <div style="opacity:.92;font-size:13px;">${escapeHtml(subtitulo)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px;">
              <p style="margin:0 0 10px 0;font-size:16px;">
                Prezada família do(a) aluno(a) <strong>${escapeHtml(nome)}</strong> (${escapeHtml(turma)}),
              </p>

              <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">
                Informamos que foi <strong>deferida</strong> uma notificação disciplinar referente ao(à) estudante.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:14px 0 16px 0;">
                <tr>
                  <td style="background:#fff7f7;border:1px solid #f3d1d1;border-radius:10px;padding:14px;">
                    <div style="font-size:14px;color:#5a0c0d;font-weight:700;margin-bottom:6px;">Resumo</div>
                    <ul style="margin:0;padding-left:18px;font-size:14px;color:#5a0c0d;line-height:1.6;">
                      <li><b>Tipo/Medida:</b> ${escapeHtml(tipo)}</li>
                      <li><b>Motivo:</b> ${escapeHtml(motivo)}</li>
                      <li><b>Nº Sequencial:</b> ${escapeHtml(num)}</li>
                    </ul>
                  </td>
                </tr>
              </table>

              ${linkCiencia ? `
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(linkCiencia)}"
                       style="display:inline-block;background:#8B0000;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:700;">
                      Visualizar e confirmar ciência
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 14px 0;font-size:13px;line-height:1.5;color:#6b6f76;">
                Este link é individual e possui validade temporária. Ao acessar, o sistema registrará a visualização e permitirá a confirmação de ciência pelo responsável.
              </p>
              ` : ''}

              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
                Estamos à disposição para quaisquer esclarecimentos.
              </p>

              <p style="margin:0 0 6px 0;font-size:14px;color:#444;">
                Atenciosamente,<br><b>${escapeHtml(assinatura)}</b>
              </p>

              <p style="margin:16px 0 0 0;font-size:13px;color:#6b6f76;">
                ${escapeHtml(mensagemAutomatica)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function textoCurtoDeferido(aluno, notif, contexto = {}) {
  const nome = aluno?.nome || '';
  const turma = aluno?.turma || '';
  const tipo = notif?.tipo || notif?.tipoMedida || '—';
  const num = notif?.numeroSequencial || '—';
  const assinatura = contexto?.assinatura || 'Coordenação — Instituição';

  return [
    'COMUNICADO — Notificação deferida',
    `Aluno(a): ${nome} (${turma})`,
    `Tipo/Medida: ${tipo}`,
    `Nº: ${num}`,
    `Estamos à disposição. — ${assinatura}`
  ].join('\n');
}

function getBaseUrl(req) {
  const envUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.BASE_URL ||
    '';

  if (envUrl) return String(envUrl).replace(/\/+$/, '');

  return `${req.protocol}://${req.get('host')}`;
}

function gerarTokenResponsavel() {
  return crypto.randomBytes(32).toString('hex');
}

function gerarExpiracaoToken(dias = 15) {
  const expira = new Date();
  expira.setDate(expira.getDate() + Number(dias || 15));
  expira.setHours(23, 59, 59, 999);
  return expira;
}

function montarLinkCienciaNotificacao(req, token) {
  return `${getBaseUrl(req)}/notificacao-responsavel.html?token=${encodeURIComponent(token)}`;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.connection?.remoteAddress || '';
}

/* ============================================================
   🔹 ROTAS PÚBLICAS — Ciência digital da notificação
   ============================================================ */
router.get('/publico/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();

    if (!token) {
      return res.status(400).json({ message: 'Token ausente.' });
    }

    const notificacao = await Notificacao.findOne({
      tokenResponsavel: token,
      ativo: { $ne: false }
    })
      .populate('aluno', 'nome turma')
      .lean();

    if (!notificacao) {
      return res.status(404).json({ message: 'Link inválido ou não encontrado.' });
    }

    if (
      notificacao.tokenResponsavelExpiraEm &&
      new Date(notificacao.tokenResponsavelExpiraEm) < new Date()
    ) {
      return res.status(410).json({ message: 'Este link expirou.' });
    }

    let responsavelCiencia = notificacao.responsavelCiencia || {};

    if (!responsavelCiencia.visualizou) {
      responsavelCiencia = {
        ...responsavelCiencia,
        visualizou: true,
        visualizouEm: new Date()
      };

      await Notificacao.updateOne(
        { _id: notificacao._id },
        {
          $set: {
            'responsavelCiencia.visualizou': true,
            'responsavelCiencia.visualizouEm': responsavelCiencia.visualizouEm
          }
        }
      );
    }

    return res.json({
      ok: true,
      notificacao: {
        _id: notificacao._id,
        numeroSequencial: notificacao.numeroSequencial,
        natureza: notificacao.natureza,
        status: notificacao.status,
        data: notificacao.data,
        tipo: notificacao.tipo,
        tipoMedida: notificacao.tipoMedida,
        motivo: notificacao.motivo,
        observacao: notificacao.observacao,
        artigo: notificacao.artigo,
        paragrafo: notificacao.paragrafo,
        inciso: notificacao.inciso,
        aluno: notificacao.aluno,
        responsavelCiencia
      }
    });
  } catch (err) {
    console.error('[CTRL-NOTIF][PUBLICO][GET]', err);
    return res.status(500).json({ message: 'Erro ao consultar notificação.' });
  }
});

router.post('/publico/:token/confirmar-ciencia', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const resposta = String(req.body?.resposta || '').trim();

    if (!token) {
      return res.status(400).json({ message: 'Token ausente.' });
    }

    const notificacao = await Notificacao.findOne({
      tokenResponsavel: token,
      ativo: { $ne: false }
    });

    if (!notificacao) {
      return res.status(404).json({ message: 'Link inválido.' });
    }

    if (
      notificacao.tokenResponsavelExpiraEm &&
      new Date(notificacao.tokenResponsavelExpiraEm) < new Date()
    ) {
      return res.status(410).json({ message: 'Este link expirou.' });
    }

    const visualizouEmAtual =
      notificacao.responsavelCiencia?.visualizouEm ||
      new Date();

    notificacao.responsavelCiencia = {
      ...(notificacao.responsavelCiencia || {}),
      visualizou: true,
      visualizouEm: visualizouEmAtual,
      confirmouCiencia: true,
      confirmouCienciaEm: new Date(),
      resposta: resposta || notificacao.responsavelCiencia?.resposta || '',
      ipCiencia: getClientIp(req),
      userAgentCiencia: req.headers['user-agent'] || ''
    };

    notificacao.tokenResponsavelUsadoEm = new Date();

    await notificacao.save();

    return res.json({ ok: true, message: 'Ciência confirmada com sucesso.' });
  } catch (err) {
    console.error('[CTRL-NOTIF][PUBLICO][CIENCIA]', err);
    return res.status(500).json({ message: 'Erro ao confirmar ciência.' });
  }
});

/* ============================================================
   🔹 LISTAR notificações para controle
   ============================================================ */
router.get('/resumo-validacao', autenticar, async (req, res) => {
  try {
    const instituicao = filtroInstituicaoDoUsuario(req.usuario);
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date();
    fimHoje.setHours(23, 59, 59, 999);

    const [pendentes, devolvidas, deferidasHoje, arquivadas, total] = await Promise.all([
      Notificacao.countDocuments({ ...instituicao, status: 'pendente' }),
      Notificacao.countDocuments({ ...instituicao, status: 'revisao_solicitada' }),
      Notificacao.countDocuments({
        ...instituicao,
        status: 'deferido',
        $or: [
          { deferidoEm: { $gte: inicioHoje, $lte: fimHoje } },
          { deferidoEm: null, updatedAt: { $gte: inicioHoje, $lte: fimHoje } }
        ]
      }),
      Notificacao.countDocuments({ ...instituicao, status: 'arquivado' }),
      Notificacao.countDocuments(instituicao)
    ]);

    return res.json({
      ok: true,
      pendentes,
      devolvidas,
      deferidasHoje,
      arquivadas,
      total,
      aguardandoAnalise: pendentes + devolvidas
    });
  } catch (err) {
    console.error('[CTRL-NOTIF][RESUMO]', err);
    return res.status(500).json({ erro: 'Erro ao carregar o resumo de validação.' });
  }
});

router.get('/filtros-validacao', autenticar, async (req, res) => {
  try {
    const instituicao = filtroInstituicaoDoUsuario(req.usuario);

    const [tipos, medidas, turmas] = await Promise.all([
      Notificacao.distinct('tipo', instituicao),
      Notificacao.distinct('tipoMedida', instituicao),
      Aluno.distinct('turma', instituicao)
    ]);

    const opcoesTipo = Array.from(new Set([
      ...(tipos || []),
      ...(medidas || [])
    ].map(normalizarTexto).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const opcoesTurma = Array.from(new Set((turmas || []).map(normalizarTexto).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    return res.json({ ok: true, tipos: opcoesTipo, turmas: opcoesTurma });
  } catch (err) {
    console.error('[CTRL-NOTIF][FILTROS]', err);
    return res.status(500).json({ erro: 'Erro ao carregar filtros.' });
  }
});

router.get('/', autenticar, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 50);
    const skip = (page - 1) * limit;

    const q = normalizarTexto(req.query.q);
    const tipo = normalizarTexto(req.query.tipo);
    const turma = normalizarTexto(req.query.turma);
    const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const rawStatus = normalizarTexto(req.query.status);

    let statuses;
    if (!rawStatus || rawStatus === 'fila') {
      statuses = ['pendente', 'revisao_solicitada'];
    } else if (['todos', 'all', '*'].includes(rawStatus.toLowerCase())) {
      statuses = ['pendente', 'deferido', 'revisao_solicitada', 'arquivado'];
    } else {
      statuses = rawStatus.split(',').map(normalizarTexto).filter(Boolean);
    }

    const instituicao = filtroInstituicaoDoUsuario(req.usuario);
    const clausulas = [instituicao, { status: { $in: statuses } }];

    const inicioRaw = req.query.inicio || req.query.data;
    const fimRaw = req.query.fim || req.query.data;
    const inicio = inicioRaw ? new Date(inicioRaw) : null;
    const fim = fimRaw ? new Date(fimRaw) : null;

    if (inicio && !Number.isNaN(inicio.getTime())) {
      inicio.setHours(0, 0, 0, 0);
    }
    if (fim && !Number.isNaN(fim.getTime())) {
      fim.setHours(23, 59, 59, 999);
    }
    if (inicio && !Number.isNaN(inicio.getTime()) || fim && !Number.isNaN(fim.getTime())) {
      const faixa = {};
      if (inicio && !Number.isNaN(inicio.getTime())) faixa.$gte = inicio;
      if (fim && !Number.isNaN(fim.getTime())) faixa.$lte = fim;
      clausulas.push({ createdAt: faixa });
    }

    if (tipo && tipo.toLowerCase() !== 'todos') {
      const tipoRegex = new RegExp(tipo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      clausulas.push({
        $or: [
          { tipo: tipoRegex },
          { tipoMedida: tipoRegex },
          { natureza: tipoRegex }
        ]
      });
    }

    let idsAlunosPorTurma = null;
    if (turma && turma.toLowerCase() !== 'todas') {
      const turmaRegex = new RegExp(`^${turma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      idsAlunosPorTurma = await Aluno.find({
        ...instituicao,
        turma: turmaRegex
      }).distinct('_id');
      clausulas.push({ aluno: { $in: idsAlunosPorTurma } });
    }

    if (q) {
      const textRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const idsAlunosBusca = await Aluno.find({
        ...instituicao,
        $or: [
          { nome: textRegex },
          { turma: textRegex }
        ]
      }).distinct('_id');

      clausulas.push({
        $or: [
          { motivo: textRegex },
          { tipo: textRegex },
          { tipoMedida: textRegex },
          { numeroSequencial: textRegex },
          { observacao: textRegex },
          { aluno: { $in: idsAlunosBusca } }
        ]
      });
    }

    const filtro = clausulas.length === 1 ? clausulas[0] : { $and: clausulas };

    const [total, docs] = await Promise.all([
      Notificacao.countDocuments(filtro),
      Notificacao.find(filtro)
        .populate('aluno', 'nome turma instituicao contatos comportamento')
        .sort({ createdAt: order, _id: order })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return res.json({ data: docs, page, limit, total, totalPages });
  } catch (err) {
    console.error('Erro ao buscar notificações para controle:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

/* ============================================================
   🔹 DEFERIR notificação
   ============================================================ */
router.put('/:id/deferir', autenticar, async (req, res) => {
  try {
    console.log('[CTRL-NOTIF] deferir chamado para id =', req.params.id);

    const notificacao = await Notificacao.findOneAndUpdate(
      {
        _id: req.params.id,
        ...filtroInstituicaoDoUsuario(req.usuario)
      },
      {
        status: 'deferido',
        avaliador: req.usuario._id,
        comentarioMonitor: ''
      },
      { new: true }
    ).populate('aluno', 'nome turma contatos instituicao comportamento alertas');

    if (!notificacao) {
      console.log('[CTRL-NOTIF] não encontrado:', req.params.id);
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    console.log('[CTRL-NOTIF] deferido OK. Aluno:', notificacao.aluno?.nome || '(sem aluno)');
    console.log('[CTRL-NOTIF] mensageria disponível?', !!mensageria);

    let comunicacao = { tentou: false, resultados: {} };

    const aluno = notificacao.aluno || {};
    const instituicaoEfetiva = aluno?.instituicao || req.usuario?.instituicao || null;
    const contexto = await carregarContextoInstitucional(instituicaoEfetiva);

    const emailResponsavel = String(aluno?.contatos?.emailResponsavel || '').trim();
    const telefoneResponsavel = firstNonEmpty(
      aluno?.contatos?.telefoneResponsavel,
      aluno?.contatos?.whatsapp,
      aluno?.telefone
    );

    const tokenResponsavel = gerarTokenResponsavel();
    const tokenResponsavelExpiraEm = gerarExpiracaoToken(15);
    const linkCiencia = montarLinkCienciaNotificacao(req, tokenResponsavel);

    notificacao.tokenResponsavel = tokenResponsavel;
    notificacao.tokenResponsavelExpiraEm = tokenResponsavelExpiraEm;
    notificacao.tokenResponsavelUsadoEm = null;
    notificacao.deferidoEm = notificacao.deferidoEm || new Date();

    notificacao.responsavelCiencia = {
      ...(notificacao.responsavelCiencia || {}),
      telefone: notificacao.responsavelCiencia?.telefone || telefoneResponsavel || '',
      email: emailResponsavel || notificacao.responsavelCiencia?.email || '',
      notificado: Boolean(emailResponsavel),
      notificadoEm: emailResponsavel
        ? new Date()
        : notificacao.responsavelCiencia?.notificadoEm || null,
      visualizou: false,
      visualizouEm: null,
      confirmouCiencia: false,
      confirmouCienciaEm: null,
      resposta: '',
      ipCiencia: '',
      userAgentCiencia: ''
    };

    notificacao.mensagemEnviada = Boolean(emailResponsavel);
    notificacao.mensagemEnviadaEm = emailResponsavel
      ? new Date()
      : notificacao.mensagemEnviadaEm || null;

    await notificacao.save();

    try {
      if (mensageria && aluno) {
        comunicacao.tentou = true;

        const assunto = assuntoDeferido(aluno, notificacao, contexto);
        const html = htmlDeferido(aluno, notificacao, contexto, linkCiencia);
        const texto = [
          textoCurtoDeferido(aluno, notificacao, contexto),
          '',
          'Para visualizar e confirmar ciência, acesse:',
          linkCiencia
        ].join('\n');

        if (emailResponsavel) {
          try {
            comunicacao.resultados.email = await mensageria.enviarEmail(
              { ...aluno, instituicao: instituicaoEfetiva },
              'Deferido',
              html,
              emailResponsavel,
              assunto
            );
          } catch (e) {
            comunicacao.resultados.email = { ok: false, erro: e.message };
          }
        } else {
          comunicacao.resultados.email = { ok: false, motivo: 'sem emailResponsavel' };
        }

        if (aluno?.contatos?.telegramChatId) {
          try {
            comunicacao.resultados.telegram = await mensageria.enviarTelegram(
              { ...aluno, instituicao: instituicaoEfetiva },
              'Deferido',
              aluno.contatos.telegramChatId,
              texto
            );
          } catch (e) {
            comunicacao.resultados.telegram = { ok: false, erro: e.message };
          }
        } else {
          comunicacao.resultados.telegram = { ok: false, motivo: 'sem telegramChatId' };
        }

        if (aluno?.contatos?.telefoneResponsavel) {
          try {
            const tel = String(aluno.contatos.telefoneResponsavel || '').replace(/\D/g, '');
            comunicacao.resultados.whatsappLink = mensageria.linkWhatsApp(
              { ...aluno, instituicao: instituicaoEfetiva },
              'Deferido',
              tel,
              texto
            );
          } catch (_e) {
            comunicacao.resultados.whatsappLink = null;
          }
        } else {
          comunicacao.resultados.whatsappLink = null;
        }
      }
    } catch (e) {
      comunicacao.erro = e.message;
      console.warn('[CTRL-NOTIF] Falha ao enviar comunicação:', e);
    }

    // 🔥 DISPARO DIRETO DO NP SEM DEPENDER DE IMPORT DE OUTRA ROTA
    try {
      if (
        mensageria &&
        typeof mensageria.enviarNPEncaminhamento === 'function' &&
        aluno &&
        instituicaoEfetiva
      ) {
        const alunoAtualizado = await Aluno.findById(aluno._id);

        if (alunoAtualizado) {
          const notaAtual = Number(alunoAtualizado.comportamento);

          console.log('[NP][DEBUG] aluno=', alunoAtualizado.nome);
          console.log('[NP][DEBUG] notaAtual=', notaAtual);
          console.log('[NP][DEBUG] instituicao=', instituicaoEfetiva);

          if (notaEstaNaFaixaNP(notaAtual)) {
            const jaEnviadoEm = alunoAtualizado?.alertas?.npRegularEnviadoAt || null;
            const ultimaNota = typeof alunoAtualizado?.alertas?.npRegularUltimaNota === 'number'
              ? alunoAtualizado.alertas.npRegularUltimaNota
              : null;

            const precisaEnviar =
              !jaEnviadoEm ||
              ultimaNota === null ||
              Math.abs(Number(ultimaNota) - notaAtual) >= 0.01;

            console.log('[NP][DEBUG] jaEnviadoEm=', jaEnviadoEm);
            console.log('[NP][DEBUG] ultimaNota=', ultimaNota);
            console.log('[NP][DEBUG] precisaEnviar=', precisaEnviar);

            if (precisaEnviar) {
              const resultadoNP = await mensageria.enviarNPEncaminhamento({
                alunoId: alunoAtualizado._id,
                notaAtual,
                instituicao: instituicaoEfetiva,
                tenantId: instituicaoEfetiva,
                linkAgendamento: process.env.NP_AGENDAMENTO_URL || '',
                contatoEscola: process.env.CONTATO_ESCOLA || '',
                preferenciaCanais: ['email', 'telegram']
              });

              comunicacao.resultados.np = resultadoNP;

              alunoAtualizado.alertas = alunoAtualizado.alertas || {};
              alunoAtualizado.alertas.npRegularEnviadoAt = new Date();
              alunoAtualizado.alertas.npRegularUltimaNota = notaAtual;
              await alunoAtualizado.save();

              console.log('[NP][DEBUG] envio NP resultado=', resultadoNP);
            } else {
              comunicacao.resultados.np = {
                ok: false,
                motivo: 'np_ja_enviado_para_essa_faixa'
              };
            }
          } else {
            comunicacao.resultados.np = {
              ok: false,
              motivo: `nota_fora_da_faixa_np (${Number.isFinite(notaAtual) ? notaAtual.toFixed(2) : 'inválida'})`
            };
          }
        } else {
          comunicacao.resultados.np = { ok: false, motivo: 'aluno_nao_encontrado_para_np' };
        }
      } else {
        comunicacao.resultados.np = { ok: false, motivo: 'mensageria_np_indisponivel' };
      }
    } catch (e) {
      comunicacao.resultados.np = { ok: false, erro: e.message };
      console.warn('[NP][DEFERIR] Falha ao verificar/enviar NP:', e.message);
    }

    console.log('[CTRL-NOTIF] comunicacao:', comunicacao);
    res.json({ ...(notificacao.toObject?.() || notificacao), comunicacao });
  } catch (err) {
    console.error('Erro ao deferir notificação:', err);
    res.status(500).json({ erro: 'Erro ao deferir notificação' });
  }
});

/* ============================================================
   🔹 Solicitar revisão
   ============================================================ */
router.put('/:id/revisar', autenticar, async (req, res) => {
  try {
    const { comentario } = req.body;

    const notificacao = await Notificacao.findOneAndUpdate(
      {
        _id: req.params.id,
        ...filtroInstituicaoDoUsuario(req.usuario)
      },
      {
  status: 'revisao_solicitada',
  avaliador: req.usuario._id,
  comentarioRevisao: comentario || '',
  comentarioMonitor: comentario || '', 
      },
      { new: true }
    );

    if (!notificacao) {
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao solicitar revisão' });
  }
});

/* ============================================================
   🔹 Arquivar notificação
   ============================================================ */
router.put('/:id/arquivar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOneAndUpdate(
      {
        _id: req.params.id,
        ...filtroInstituicaoDoUsuario(req.usuario)
      },
      { status: 'arquivado', avaliador: req.usuario._id },
      { new: true }
    );

    if (!notificacao) {
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    res.json(notificacao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao arquivar notificação' });
  }
});

/* ============================================================
   🔹 Reenviar notificação
   ============================================================ */
router.put('/:id/reenviar', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOne({
      _id: req.params.id,
      ...filtroInstituicaoDoUsuario(req.usuario),
    });

    if (!notificacao) {
      return res.status(404).json({ erro: 'Notificação não encontrada.' });
    }

    notificacao.status = 'pendente';
    await notificacao.save();

    res.json({ mensagem: 'Notificação reenviada com sucesso' });
  } catch (err) {
    console.error('Erro ao reenviar notificação:', err);
    res.status(500).json({ erro: 'Erro ao reenviar notificação' });
  }
});

/* ============================================================
   🔹 Excluir notificação
   ============================================================ */
router.delete('/:id', autenticar, async (req, res) => {
  try {
    const notificacao = await Notificacao.findOneAndDelete({
      _id: req.params.id,
      ...filtroInstituicaoDoUsuario(req.usuario)
    });

    if (!notificacao) {
      return res.status(404).json({ erro: 'Notificação não encontrada' });
    }

    res.json({ mensagem: 'Notificação excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir notificação' });
  }
});

/* ============================================================
   🔹 Painel e relatórios
   ============================================================ */

router.get('/contador/painel', autenticar, async (req, res) => {
  try {
    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      status: { $in: ['pendente', 'revisao_solicitada'] },
    };
    const total = await Notificacao.countDocuments(filtro);
    res.json({ total });
  } catch (err) {
    console.error('Erro ao contar notificações pendentes (painel):', err);
    res.status(500).json({ erro: 'Erro interno ao contar notificações' });
  }
});

router.get('/estatisticas', autenticar, async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filtro = {
      ...filtroInstituicaoDoUsuario(req.usuario),
      createdAt: { $gte: inicio, $lte: hoje },
    };

    const porStatus = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porNatureza = await Notificacao.aggregate([
      { $match: filtro },
      { $group: { _id: '$natureza', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    const porDia = await Notificacao.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
          total: { $sum: 1 },
        },
      },
      { $sort: { '_id.dia': 1 } },
    ]);

    res.json({
      intervalo: { inicio, fim: hoje },
      porStatus,
      porNatureza,
      porDia,
    });
  } catch (err) {
    console.error('Erro ao gerar estatísticas do controle:', err);
    res.status(500).json({ erro: 'Erro interno ao gerar estatísticas' });
  }
});

/* ============================================================
   🔹 Contagens compatíveis com o painel
   ============================================================ */
async function contarNotificacoes(req, res) {
  try {
    const filtro = { ...filtroInstituicaoDoUsuario(req.usuario) };

    if (req.query.status) {
      const sts = String(req.query.status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (sts.length) filtro.status = { $in: sts };
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      const ini = from && !isNaN(from) ? from : new Date('1970-01-01');
      const fim = to && !isNaN(to) ? new Date(to) : new Date();
      if (!isNaN(fim)) fim.setHours(23, 59, 59, 999);
      filtro.createdAt = { $gte: ini, $lte: fim };
    }

    const total = await Notificacao.countDocuments(filtro);
    return res.json({ total });
  } catch (e) {
    console.error('[CTRL-NOTIF] contagem falhou:', e);
    return res.status(500).json({ erro: 'Erro ao contar notificações' });
  }
}

router.get('/emitidas/contagem', autenticar, contarNotificacoes);
router.get('/contagem', autenticar, contarNotificacoes);

module.exports = router;