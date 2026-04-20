'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Notificacao = require('../../models/Notificacao');
const Aluno = require('../../models/Aluno');
const Counter = require('../../models/Counter'); // pode ficar aqui, mesmo sem uso direto

const calcularNotaTSMD = require('../../utils/calculoNota');

let enviarWhatsapp = null;
try {
  enviarWhatsapp = require('../../utils/twilio');
} catch (_) {
  enviarWhatsapp = null;
}

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const { obterDadosDoRegulamento } = require('../../utils/regulamento');
const { addBusinessDays } = require('../../utils/businessDays');
const { logAction, attachActor } = require('../../utils/audit');
const {
  getConfigDisciplinar,
  getClassificacaoComportamento
} = require('../../utils/configuracaoDisciplinar');
// 🚀 Serviços de mensageria (telegram + NP)
const { enviarTelegram, enviarNPEncaminhamento } = require('../../services/mensageria');

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

/* =========================================================
   ===== HELPERS MULTI-TENANT ==============================
   ========================================================= */

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

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId
  };
}

function buildTenantMatch(tenantId, campo = 'tenantId') {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr }
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function buildInstMatch(inst) {
  return buildTenantMatch(inst, 'tenantId');
}

function buildAlunoMatch(inst) {
  return buildTenantMatch(inst, 'tenantId');
}

function scopedFilter(req, extra = {}) {
  return {
    ...buildTenantMatch(getTenantId(req)),
    ...extra
  };
}

/* =========================================================
   ===== HELPERS DE SEGURANÇA / AUDITORIA ==================
   ========================================================= */

async function safeLogAction(payload) {
  try {
    await logAction(payload);
  } catch (e) {
    console.warn('[audit] erro ao gravar log:', e?.message || e);
  }
}

/* =========================================================
   ===== HELPERS REGULAMENTO DINÂMICO ======================
   ========================================================= */

function normalizeRuleText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarCategoriaRegulamento(value) {
  const txt = normalizeRuleText(value);

  if (txt === 'leve') return 'leve';
  if (txt === 'medio' || txt === 'médio') return 'medio';
  if (txt === 'grave') return 'grave';
  if (txt === 'gravissimo' || txt === 'gravíssimo') return 'gravissimo';
  if (txt === 'elogio' || txt === 'positivo' || txt === 'positiva') return 'elogio';

  return String(value || '').trim();
}

function montarDadosRegulamentoBase({ artigo, paragrafo, inciso, classificacaoRegulamento, motivo }) {
  return {
    artigo: String(artigo || '').trim(),
    paragrafo: String(paragrafo || '').trim(),
    inciso: String(inciso || '').trim(),
    classificacao: String(classificacaoRegulamento || '').trim(),
    texto: String(motivo || '').trim()
  };
}

function encontrarIncisoNaConfiguracao(
  configDoc,
  { artigo, paragrafo, inciso, motivo, classificacaoRegulamento } = {}
) {
  const artigos = Array.isArray(configDoc?.regulamento?.artigos)
    ? configDoc.regulamento.artigos
    : [];

  if (!artigos.length) return null;

  const artigoStr = String(artigo || '').trim();
  const paragrafoStr = String(paragrafo || '').trim();
  const incisoStr = String(inciso || '').trim();
  const motivoNorm = normalizeRuleText(motivo);
  const classificacaoNorm = normalizarCategoriaRegulamento(classificacaoRegulamento);

  // 1) Prioridade máxima: _id do inciso
  if (incisoStr && mongoose.isValidObjectId(incisoStr)) {
    for (const art of artigos) {
      for (const inc of art?.incisos || []) {
        if (String(inc?._id) === incisoStr) {
          return {
            artigo: String(art?.numero || '').trim(),
            paragrafo: String(art?.titulo || '').trim(),
            inciso: String(inc?.codigo || '').trim() || incisoStr,
            classificacao: normalizarCategoriaRegulamento(inc?.categoria),
            texto: String(inc?.texto || '').trim()
          };
        }
      }
    }
  }

  // 2) Artigo + parágrafo + código do inciso + classificação
  if (incisoStr) {
    for (const art of artigos) {
      const artNumero = String(art?.numero || '').trim();
      const artTitulo = String(art?.titulo || '').trim();

      if (artigoStr && artNumero !== artigoStr) continue;
      if (paragrafoStr && artTitulo !== paragrafoStr) continue;

      for (const inc of art?.incisos || []) {
        const codigoInc = String(inc?.codigo || '').trim();
        const categoriaInc = normalizarCategoriaRegulamento(inc?.categoria);

        if (codigoInc !== incisoStr) continue;
        if (classificacaoNorm && categoriaInc !== classificacaoNorm) continue;

        return {
          artigo: artNumero,
          paragrafo: artTitulo,
          inciso: codigoInc,
          classificacao: categoriaInc,
          texto: String(inc?.texto || '').trim()
        };
      }
    }
  }

  // 3) Busca por texto/motivo editado + classificação
  if (motivoNorm) {
    for (const art of artigos) {
      const artNumero = String(art?.numero || '').trim();
      const artTitulo = String(art?.titulo || '').trim();

      for (const inc of art?.incisos || []) {
        const textoInciso = String(inc?.texto || '').trim();
        const categoriaInc = normalizarCategoriaRegulamento(inc?.categoria);

        if (normalizeRuleText(textoInciso) !== motivoNorm) continue;
        if (artigoStr && artNumero !== artigoStr) continue;
        if (paragrafoStr && artTitulo !== paragrafoStr) continue;
        if (classificacaoNorm && categoriaInc !== classificacaoNorm) continue;

        return {
          artigo: artNumero,
          paragrafo: artTitulo,
          inciso: String(inc?.codigo || '').trim(),
          classificacao: categoriaInc,
          texto: textoInciso
        };
      }
    }
  }

  return null;
}

async function resolverDadosRegulamentoDaInstituicao(inst, payload = {}) {
  const base = montarDadosRegulamentoBase(payload);

  if (!ConfiguracaoDisciplinar || !inst) {
    return resolverDadosRegulamentoFallback(base);
  }

  try {
    const configDoc = await ConfiguracaoDisciplinar.findOne({ instituicao: inst }).lean();

    if (configDoc) {
      const encontrado = encontrarIncisoNaConfiguracao(configDoc, payload);
      if (encontrado) return encontrado;
    }
  } catch (e) {
    console.warn('[NOTIFICACOES] Falha ao consultar ConfiguracaoDisciplinar:', e?.message || e);
  }

  return resolverDadosRegulamentoFallback(base);
}

function resolverDadosRegulamentoFallback(base) {
  const fallback = obterDadosDoRegulamento(base.texto || '');

  return {
    artigo: base.artigo || String(fallback?.artigo || '').trim() || 'Art. —',
    paragrafo: base.paragrafo || String(fallback?.paragrafo || '').trim() || '',
    inciso: base.inciso || String(fallback?.inciso || '').trim() || '',
    classificacao:
      base.classificacao ||
      String(fallback?.classificacao || '').trim() ||
      '',
    texto: base.texto || String(fallback?.motivo || '').trim() || '—'
  };
}

/* =========================================================
   ===== NOVOS HELPERS: Mensageria / E-mail Deferido =======
   ========================================================= */

function getMensageria(req) {
  return req.app?.locals?.mensageria || global.mensageria || null;
}

function getChatIdsFromAlunoDoc(alunoDoc) {
  if (!alunoDoc) return [];
  if (typeof alunoDoc.getAllChatIds === 'function') {
    return (alunoDoc.getAllChatIds() || []).filter(Boolean);
  }
  const set = new Set(
    [
      ...(alunoDoc.chatIdsResponsaveis || []),
      alunoDoc.chatIdResponsavel || '',
      alunoDoc?.contatos?.telegramChatId || ''
    ]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  );
  return Array.from(set);
}

function normalizarTextoInstitucional(v) {
  return String(v || '').trim();
}

function firstNonEmptyInstitucional(...values) {
  for (const v of values) {
    const s = normalizarTextoInstitucional(v);
    if (s) return s;
  }
  return '';
}

async function carregarContextoInstitucional(instituicaoId) {
  const fallback = {
    nomeInstituicao: 'Colégio Militar Dom Pedro II/CZS',
    siglaInstituicao: 'CMDPII/CZS',
    instituicaoLabel: 'CMDPII/CZS',
    setorResponsavel: 'Coordenação de Ensino',
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
    console.warn('[NOTIFICACOES] Falha ao carregar Instituicao:', e?.message || e);
  }

  try {
    if (ConfiguracaoDisciplinar) {
      configDoc = await ConfiguracaoDisciplinar.findOne({ instituicao: instituicaoId }).lean();
    }
  } catch (e) {
    console.warn('[NOTIFICACOES] Falha ao carregar ConfiguracaoDisciplinar:', e?.message || e);
  }

  const nomeInstituicao = firstNonEmptyInstitucional(
    instituicaoDoc?.nome,
    instituicaoDoc?.nomeExibicao,
    instituicaoDoc?.sigla,
    fallback.nomeInstituicao
  );

  const siglaInstituicao = firstNonEmptyInstitucional(
    instituicaoDoc?.sigla,
    instituicaoDoc?.slug,
    nomeInstituicao,
    fallback.siglaInstituicao
  );

  const cabecalhoCfg = firstNonEmptyInstitucional(
    configDoc?.regulamento?.textos?.cabecalho
  );

  const setorResponsavel = firstNonEmptyInstitucional(
    cabecalhoCfg && cabecalhoCfg.includes('–') ? cabecalhoCfg.split('–').slice(1).join('–').trim() : '',
    cabecalhoCfg && cabecalhoCfg.includes('-') ? cabecalhoCfg.split('-').slice(1).join('-').trim() : '',
    fallback.setorResponsavel
  );

  const instituicaoLabel = firstNonEmptyInstitucional(
    nomeInstituicao,
    cabecalhoCfg && cabecalhoCfg.includes('–') ? cabecalhoCfg.split('–')[0].trim() : '',
    cabecalhoCfg && cabecalhoCfg.includes('-') ? cabecalhoCfg.split('-')[0].trim() : '',
    siglaInstituicao,
    fallback.instituicaoLabel
  );

  return {
    nomeInstituicao,
    siglaInstituicao,
    instituicaoLabel,
    setorResponsavel,
    setorEnsino: setorResponsavel || fallback.setorEnsino,
    assinatura: `${setorResponsavel || fallback.setorResponsavel} — ${nomeInstituicao}`,
    mensagemAutomatica: `Mensagem automática do Sistema Escolar – ${nomeInstituicao || siglaInstituicao}.`,
    subtituloEmail: fallback.subtituloEmail
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDataBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDataHoraBr(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${formatDataBr(d)} ${hh}:${mi}`;
}

function montarEmailDeferido({ aluno, notif, contexto }) {
  const nome = aluno?.nome || 'Aluno(a)';
  const turma = aluno?.turma || '—';
  const numero = notif?.numeroSequencial || '—';
  const dataStr = notif?.data ? formatDataBr(notif.data) : formatDataBr(new Date());
  const inciso = (notif?.inciso || '').trim();
  const motivo = (notif?.motivo || '').trim() || '—';
  const medida = notif?.tipoMedida || notif?.tipo || '—';
  const dias =
    notif?.quantidadeDias && notif.quantidadeDias > 1
      ? ` (${notif.quantidadeDias} dias)`
      : '';

  const assunto = `Nova Notificação Disciplinar DEFERIDA — ${nome} (${turma}) — Nº ${numero} — ${contexto?.nomeInstituicao || contexto?.siglaInstituicao || 'Instituição'}`;

  const text = [
    'Prezada família,',
    '',
    `Informamos que foi DEFERIDA uma Notificação Disciplinar referente a ${nome} (turma ${turma}).`,
    `Data: ${dataStr}`,
    `Medida: ${medida}${dias}`,
    inciso ? `Inciso: ${inciso}` : null,
    `Motivo/Descrição: ${motivo}`,
    `Nº: ${numero}`,
    '',
    `Este é um comunicado automático do ${contexto?.siglaInstituicao || contexto?.nomeInstituicao || 'Sistema Escolar'}.`
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html>
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
              <div style="font-weight:700;font-size:18px;letter-spacing:.2px;">${escapeHtml((contexto?.instituicaoLabel || 'Instituição') + ' – ' + (contexto?.setorEnsino || 'Coordenação de Ensino'))}</div>
              <div style="opacity:.92;font-size:13px;">${escapeHtml(contexto?.subtituloEmail || 'Comunicado de Notificação Deferida')}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px;">
              <p style="margin:0 0 10px 0;font-size:16px;">
                Prezada família do(a) aluno(a) <strong>${escapeHtml(nome)}</strong> (${escapeHtml(turma)}),
              </p>

              <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">
                Informamos que foi <strong>DEFERIDA</strong> uma Notificação Disciplinar referente ao(à) estudante.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:14px 0 16px 0;">
                <tr>
                  <td style="background:#fff7f7;border:1px solid #f3d1d1;border-radius:10px;padding:14px;">
                    <div style="font-size:14px;color:#5a0c0d;font-weight:700;margin-bottom:6px;">Resumo</div>
                    <ul style="margin:0;padding-left:18px;font-size:14px;color:#5a0c0d;line-height:1.6;">
                      <li><b>Data:</b> ${escapeHtml(dataStr)}</li>
                      <li><b>Medida:</b> ${escapeHtml(medida + dias)}</li>
                      ${inciso ? `<li><b>Inciso:</b> ${escapeHtml(inciso)}</li>` : ''}
                      <li><b>Motivo/Descrição:</b> ${escapeHtml(motivo)}</li>
                      <li><b>Nº:</b> ${escapeHtml(numero)}</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
                Estamos à disposição para quaisquer esclarecimentos.
              </p>

              <p style="margin:0 0 6px 0;font-size:14px;color:#444;">
                Atenciosamente,<br><b>${escapeHtml(contexto?.assinatura || 'Coordenação — Instituição')}</b>
              </p>

              <p style="margin:16px 0 0 0;font-size:13px;color:#6b6f76;">
                ${escapeHtml(contexto?.mensagemAutomatica || 'Mensagem automática do Sistema Escolar.')}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: assunto, text, html };
}

async function enviarAvisoDeferidoIfNeeded({ req, notifId }) {
  const mensageria = getMensageria(req);
  const tenantId = getTenantId(req);

  const notif = await Notificacao.findOne({
    _id: notifId,
    ...buildInstMatch(tenantId)
  }).lean();

  if (!notif) return { skipped: true, reason: 'notificação não encontrada' };
  if (notif.status !== 'deferido') return { skipped: true, reason: 'status não é deferido' };
  if (notif.mensagemEnviada) return { skipped: true, reason: 'mensagem já enviada' };

  const aluno = await Aluno.findOne({
    _id: notif.aluno,
    ...buildAlunoMatch(tenantId)
  }).lean();

  const contexto = await carregarContextoInstitucional(notif.instituicao || tenantId);
  const { subject, text, html } = montarEmailDeferido({ aluno, notif, contexto });

  if (mensageria && typeof mensageria.enfileirarParaResponsaveis === 'function') {
    try {
      await mensageria.enfileirarParaResponsaveis({
        alunoId: aluno?._id,
        instituicao: notif.instituicao || tenantId,
        tenantId,
        preferenciaCanais: ['email', 'telegram'],
        titulo: subject,
        texto: text,
        html,
        meta: { tipo: 'NOTIFICACAO_DEFERIDA', notifId: String(notif._id) }
      });
    } catch (e) {
      console.warn('[deferido] falha no enfileirarParaResponsaveis:', e?.message || e);
      const chatIds = getChatIdsFromAlunoDoc(aluno);
      if (chatIds.length) {
        const msgTG = [
          `🔔 ${contexto?.siglaInstituicao || contexto?.nomeInstituicao || 'Instituição'} — Notificação DEFERIDA`,
          `Aluno(a): ${aluno?.nome || '—'} (${aluno?.turma || '—'})`,
          `Medida: ${notif?.tipoMedida || notif?.tipo || '—'}${
            notif?.quantidadeDias > 1 ? ` (${notif.quantidadeDias} dias)` : ''
          }`,
          `Nº: ${notif?.numeroSequencial || '—'}`,
          `Data: ${notif?.data ? formatDataBr(notif.data) : formatDataBr(new Date())}`
        ].join('\n');
        for (const cid of chatIds) {
          try {
            await enviarTelegram(
              {
                nome: aluno?.nome,
                turma: aluno?.turma,
                instituicao: notif.instituicao || tenantId
              },
              'Notificação',
              cid,
              msgTG
            );
          } catch {}
        }
      }
    }
  }

  await Notificacao.findOneAndUpdate(
    {
      _id: notifId,
      ...buildInstMatch(tenantId)
    },
    {
      $set: {
        mensagemEnviada: true,
        mensagemEnviadaEm: new Date(),
        deferidoEm: notif.deferidoEm || new Date()
      }
    }
  );

  return { ok: true };
}

// ------------------ Mapas de valores ------------------
const MAPA_NEGATIVOS = {
  'Advertência Escrita': -0.3,
  Repreensão: -0.5,
  'A.E.C.D.E': -0.7,
  'A.I.A': -1.2
};

const MAPA_ELOGIOS = {
  elogioVerbal: 0.15,
  boletimInternoIndividual: 0.6,
  boletimInternoColetivo: 0.2,
  mediaAlta: 0.4
};

const PRECISA_DIAS = new Set(['A.E.C.D.E', 'A.I.A']);

const NP_AGENDAMENTO_URL = process.env.NP_AGENDAMENTO_URL || '';
const CONTATO_ESCOLA = process.env.CONTATO_ESCOLA || '';

function parseDateOnlyLocal(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return new Date();
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function toDayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDayEnd(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNota(n) {
  const valor = Number(n);
  if (!Number.isFinite(valor)) return 0;
  return Math.max(0, Math.min(10, Number(valor.toFixed(2))));
}

function classificarComportamento(nota) {
  const n = Number(nota || 0);
  if (n >= 9.5) return 'Excepcional';
  if (n >= 8.5) return 'Ótimo';
  if (n >= 7.0) return 'Bom';
  if (n >= 5.0) return 'Regular';
  if (n >= 3.0) return 'Insuficiente';
  return 'Incompatível';
}

function normalizarValorPorNatureza(natureza, valor) {
  const bruto = toNumber(valor, 0);
  return normalizeText(natureza) === 'elogio' ? Math.abs(bruto) : -Math.abs(bruto);
}

async function enriquecerClassificacao(notif, instituicao) {
  if (!notif || typeof notif !== 'object') return notif;

  const config = await getConfigDisciplinar(instituicao);

  const notaAnteriorNum =
    notif.notaAnterior === null || notif.notaAnterior === undefined || notif.notaAnterior === ''
      ? null
      : toNumber(notif.notaAnterior, null);

  const notaAtualNum =
    notif.notaAtual === null || notif.notaAtual === undefined || notif.notaAtual === ''
      ? null
      : toNumber(notif.notaAtual, null);

  return {
    ...notif,
    notaAnterior: notaAnteriorNum,
    notaAtual: notaAtualNum,
    classificacaoAnterior:
      notif.classificacaoAnterior ||
      (notaAnteriorNum === null ? null : getClassificacaoComportamento(notaAnteriorNum, config)),
    classificacaoAtual:
      notif.classificacaoAtual ||
      (notaAtualNum === null ? null : getClassificacaoComportamento(notaAtualNum, config))
  };
}

function ehElogioNotif(n) {
  const natureza = normalizeText(n?.natureza);
  const tipo = normalizeText(n?.tipo);
  const tipoMedida = normalizeText(n?.tipoMedida);

  return (
    natureza === 'elogio' ||
    tipo === 'elogio' ||
    tipoMedida === 'elogio'
  );
}

function ehIndisciplinaNotif(n) {
  const natureza = normalizeText(n?.natureza);
  const tipo = normalizeText(n?.tipo);
  const tipoMedida = normalizeText(n?.tipoMedida);
  const motivo = normalizeText(n?.motivo);
  const valorNumerico = toNumber(n?.valorNumerico, 0);

  const ehElogio = ehElogioNotif(n);

  return (
    natureza === 'indisciplina' ||
    (!ehElogio && valorNumerico < 0) ||
    tipo.includes('advertencia') ||
    tipo.includes('advertência') ||
    tipo.includes('repreensao') ||
    tipo.includes('repreensão') ||
    tipoMedida.includes('a.i.a') ||
    tipoMedida.includes('a.e.c.d.e') ||
    motivo.includes('indisciplina')
  );
}

function estaFaixaRegular(nota) {
  const n = Number(nota);
  return isFinite(n) && n >= 5.0 && n <= 6.99;
}

async function recomputarResumoAlunoAteAgora(alunoId, instituicao) {
  const instMatch = buildInstMatch(instituicao);
  const aluno = await Aluno.findOne({ _id: alunoId, ...buildAlunoMatch(instituicao) });
  if (!aluno) return null;

  const historico = await Notificacao.find({
    aluno: alunoId,
    ...instMatch,
    ativo: { $ne: false },
    arquivada: { $ne: true }
  })
    .select('data valorNumerico createdAt quantidadeDias tipoMedida natureza tipo motivo status')
    .sort({ data: 1, createdAt: 1, _id: 1 });

  const historicoNormalizado = historico.map((n) => ({
    ...n.toObject(),
    valorNumerico: normalizarValorPorNatureza(n.natureza, n.valorNumerico)
  }));

  const notaFinal = calcularNotaTSMD(aluno.dataEntrada, new Date(), historicoNormalizado);

  let elogios = 0;
  let atosIndisciplina = 0;
  let notificacoesNegativas = 0;

  for (const n of historico) {
    const isElogio = ehElogioNotif(n);
    const isIndisciplina = ehIndisciplinaNotif(n);
    const status = normalizeText(n?.status);

    if (isElogio) elogios += 1;
    if (isIndisciplina) atosIndisciplina += 1;
    if (isIndisciplina && status !== 'arquivado') notificacoesNegativas += 1;
  }

  aluno.comportamento = +Number(notaFinal).toFixed(2);
  aluno.elogios = elogios;
  aluno.atosIndisciplina = atosIndisciplina;
  aluno.notificacoesNegativas = notificacoesNegativas;
  aluno.ultimaAtualizacaoComportamento = new Date();

  await aluno.save();
  return aluno;
}

async function recomputarNotaAlunoAteAgora(alunoId, instituicao) {
  return recomputarResumoAlunoAteAgora(alunoId, instituicao);
}

async function getAlunoInfo(alunoId, instituicao) {
  if (!alunoId) return { alunoNome: '—', alunoTurma: '—' };
  const a = await Aluno.findOne({ _id: alunoId, ...buildAlunoMatch(instituicao) })
    .select('nome turma')
    .lean();
  return { alunoNome: a?.nome || '—', alunoTurma: a?.turma || '—' };
}

async function verificarEnvioNP(alunoDoc, instituicao) {
  if (!alunoDoc) return;

  const nota = Number(alunoDoc.comportamento);
  if (!estaFaixaRegular(nota)) return;

  console.log('[NP] Verificando envio...', {
    aluno: alunoDoc.nome,
    nota
  });

  try {
    console.log('[NP] Enviando encaminhamento...');

    const resultado = await enviarNPEncaminhamento({
      alunoId: alunoDoc._id,
      notaAtual: nota,
      instituicao,
      tenantId: instituicao,
      linkAgendamento: NP_AGENDAMENTO_URL,
      contatoEscola: CONTATO_ESCOLA,
      preferenciaCanais: ['email', 'telegram']
    });

    console.log('[NP] Resultado envio:', resultado);

    alunoDoc.alertas = alunoDoc.alertas || {};
    alunoDoc.alertas.npRegularEnviadoAt = new Date();
    alunoDoc.alertas.npRegularUltimaNota = nota;
    await alunoDoc.save();

    console.log('[NP] Enviado com sucesso!');
  } catch (e) {
    console.warn('[NP] Falha ao enviar encaminhamento:', e.message);
  }
}

async function getMaxSequenceForYear(ano, instituicao) {
  const result = await Notificacao.aggregate([
    {
      $match: {
        ...buildInstMatch(instituicao),
        numeroSequencial: {
          $regex: `/${ano}$`
        }
      }
    },
    {
      $project: {
        seq: {
          $convert: {
            input: { $arrayElemAt: [{ $split: ['$numeroSequencial', '/'] }, 0] },
            to: 'int',
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        maxSeq: { $max: '$seq' }
      }
    }
  ]);

  return result && result.length ? result[0].maxSeq || 0 : 0;
}

async function getNextNumeroSequencialAtomic(instituicao, dataRef = new Date()) {
  const ano = dataRef instanceof Date
    ? dataRef.getFullYear()
    : new Date().getFullYear();

  const pad = 4;
  const chave = `notificacao:${instituicao}:${ano}`;

  // 1) incrementa atomicamente o contador
  let counter = await Counter.findOneAndUpdate(
    { chave },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        chave,
        instituicao,
        tenantId: instituicao
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: false
    }
  );

  let seq = Number(counter?.seq || 0);
  let numeroSequencial = `${String(seq).padStart(pad, '0')}/${ano}`;

  // 2) se já existir notificação com esse número, sincroniza com o maior existente
  const jaExiste = await Notificacao.findOne({
    ...buildInstMatch(instituicao),
    numeroSequencial
  })
    .select('_id numeroSequencial')
    .lean();

  if (!jaExiste) {
    return { ano, seq, numeroSequencial };
  }

  // 3) pega o maior sequencial já existente no histórico da instituição/ano
  const maxSeqExistente = await getMaxSequenceForYear(ano, instituicao);
  const seqCorrigido = Math.max(seq, maxSeqExistente) + 1;

  // 4) força o counter para frente, nunca para trás
  counter = await Counter.findOneAndUpdate(
    {
      chave,
      seq: { $lt: seqCorrigido }
    },
    {
      $set: {
        seq: seqCorrigido,
        atualizadoEm: new Date()
      }
    },
    {
      new: true
    }
  );

  seq = Number(counter?.seq || seqCorrigido);
  numeroSequencial = `${String(seq).padStart(pad, '0')}/${ano}`;

  return { ano, seq, numeroSequencial };
}

async function recomputarCamposNotaDaNotificacao(notif, instituicao) {
  try {
    const alunoDoc = await Aluno.findOne({
      _id: notif.aluno,
      ...buildAlunoMatch(instituicao)
    })
      .select('dataEntrada')
      .lean();

    if (!alunoDoc) return;

    const instMatch = buildInstMatch(instituicao);

    const todas = await Notificacao.find({
      aluno: notif.aluno,
      ...instMatch,
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select('_id data valorNumerico createdAt quantidadeDias tipoMedida natureza')
      .sort({ data: 1, createdAt: 1, _id: 1 });

    const normalizadas = todas.map((n) => ({
      _id: String(n._id),
      data: n.data || n.createdAt || new Date(),
      createdAt: n.createdAt || n.data || new Date(),
      valorNumerico: normalizarValorPorNatureza(n.natureza, n.valorNumerico),
      quantidadeDias: n.quantidadeDias ?? 1,
      tipoMedida: n.tipoMedida,
      natureza: n.natureza
    }));

    const idx = normalizadas.findIndex((n) => String(n._id) === String(notif._id));
    if (idx === -1) return;

    const anteriores = normalizadas.slice(0, idx);
    const ateAtual = normalizadas.slice(0, idx + 1);

    const instanteAnterior = new Date((normalizadas[idx].createdAt || normalizadas[idx].data).getTime() - 1);
    const instanteAtual = normalizadas[idx].createdAt || normalizadas[idx].data;

    const notaAnterior = calcularNotaTSMD(
      alunoDoc.dataEntrada,
      instanteAnterior,
      anteriores
    );

    const notaAtual = calcularNotaTSMD(
      alunoDoc.dataEntrada,
      instanteAtual,
      ateAtual
    );

    const notaAnteriorFmt = clampNota(notaAnterior);
    const notaAtualFmt = clampNota(notaAtual);

    const config = await getConfigDisciplinar(instituicao);

    await Notificacao.findByIdAndUpdate(notif._id, {
      $set: {
        valorNumerico: normalizarValorPorNatureza(notif.natureza, notif.valorNumerico),
        notaAnterior: notaAnteriorFmt,
        notaAtual: notaAtualFmt,
        classificacaoAnterior: getClassificacaoComportamento(notaAnteriorFmt, config),
        classificacaoAtual: getClassificacaoComportamento(notaAtualFmt, config)
      }
    });
  } catch (e) {
    console.warn('[recomputarCamposNotaDaNotificacao] falha:', e?.message || e);
  }
}

async function recomputarSnapshotsPosterioresDoAluno(alunoId, instituicao) {
  try {
    const instMatch = buildInstMatch(instituicao);

    const notificacoes = await Notificacao.find({
      aluno: alunoId,
      ...instMatch,
      ativo: { $ne: false },
      arquivada: { $ne: true }
    })
      .select('_id aluno natureza valorNumerico data createdAt quantidadeDias tipoMedida')
      .sort({ data: 1, createdAt: 1, _id: 1 });

    for (const notif of notificacoes) {
      await recomputarCamposNotaDaNotificacao(notif, instituicao);
    }
  } catch (e) {
    console.warn('[recomputarSnapshotsPosterioresDoAluno] falha:', e?.message || e);
  }
}

function isObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

router.get('/novas', autenticar, requireTenant, attachActor, async (_req, res) => {
  res.json({ mensagem: 'Funcionalidade em desenvolvimento' });
});

router.get('/pendencias/devolucao/contador', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const instMatch = buildInstMatch(tenantId);
    const agora = new Date();

    const total = await Notificacao.countDocuments({
      ...instMatch,
      status: 'deferido',
      entregue: true,
      devolvidoPeloAluno: { $ne: true },
      arquivada: { $ne: true },
      ativo: { $ne: false },
      prazoDevolucao: { $ne: null, $lt: agora }
    });

    res.json({ total });
  } catch (err) {
    console.error('Erro contador pendências:', err);
    res.status(500).json({ error: 'Erro ao calcular contador de pendências.' });
  }
});

async function handlerPendenciasDevolucao(req, res) {
  try {
    const tenantId = getTenantId(req);
    const instMatch = buildInstMatch(tenantId);
    const alunoMatch = buildAlunoMatch(tenantId);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const agora = new Date();

    const itens = await Notificacao.find({
  ...instMatch,
  status: 'deferido',
  entregue: true,
  devolvidoPeloAluno: { $ne: true },
  arquivada: { $ne: true },
  ativo: { $ne: false },
  prazoDevolucao: { $ne: null, $lt: agora }
})
      .sort({ prazoDevolucao: 1 })
      .limit(limit)
      .select('aluno entregue entregueEm prazoDevolucao devolvidoPeloAluno numeroSequencial tipo tipoMedida data')
      .populate({ path: 'aluno', select: 'nome turma instituicao tenantId', match: alunoMatch })
      .lean();

    const filtrados = (itens || []).filter((i) => i.aluno);
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro pendências:', err);
    res.status(500).json({ error: 'Erro ao buscar pendências de devolução.' });
  }
}

router.get('/pendencias/devolucao', autenticar, requireTenant, attachActor, handlerPendenciasDevolucao);
router.get('/pendentes-devolucao', autenticar, requireTenant, attachActor, handlerPendenciasDevolucao);

router.get('/pendentes', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const instMatch = buildInstMatch(tenantId);
    const alunoMatch = buildAlunoMatch(tenantId);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);

    const itens = await Notificacao.find({
      ...instMatch,
      status: 'pendente',
      devolvidoPeloAluno: { $ne: true }
    })
      .sort({ data: -1, createdAt: -1 })
      .limit(limit)
      .select('aluno numeroSequencial tipo tipoMedida data status natureza')
      .populate({ path: 'aluno', select: 'nome turma instituicao tenantId', match: alunoMatch })
      .lean();

    const filtrados = (itens || []).filter((i) => i.aluno);
    res.json({ total: filtrados.length, itens: filtrados });
  } catch (err) {
    console.error('Erro listar pendentes:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações pendentes.' });
  }
});

router.get('/', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.max(parseInt(req.query.limit || '10', 10), 1);

    const tenantId = getTenantId(req);
    const instMatch = buildInstMatch(tenantId);
    const alunoMatch = buildAlunoMatch(tenantId);

    const q = (req.query.q || '').trim();
    const turma = (req.query.turma || '').trim();
    const modo = String(req.query.modo || 'principal').trim().toLowerCase();

    const filtroBase = {
      ...instMatch,
      ativo: { $ne: false }
    };

    const limiteHistorico = new Date('2026-01-01T00:00:00.000Z');

    if (modo === 'antigas') {
      filtroBase.data = { $lt: limiteHistorico };
    } else if (modo === 'arquivadas') {
      filtroBase.data = { $gte: limiteHistorico };
      filtroBase.devolvidoPeloAluno = true;
    } else if (modo === 'pendentes') {
      filtroBase.data = { $gte: limiteHistorico };
      filtroBase.status = 'pendente';
      filtroBase.devolvidoPeloAluno = { $ne: true };
      filtroBase.arquivada = { $ne: true };
    } else {
      filtroBase.data = { $gte: limiteHistorico };
      filtroBase.devolvidoPeloAluno = { $ne: true };
      filtroBase.arquivada = { $ne: true };
      filtroBase.status = { $ne: 'arquivado' };
    }

    if (req.query.from || req.query.to) {
      const faixaData = {};

      if (modo === 'antigas') {
        faixaData.$lt = new Date('2026-01-01T00:00:00.000Z');
      } else {
        faixaData.$gte = new Date('2026-01-01T00:00:00.000Z');
      }

      if (req.query.from) {
        const de = toDayStart(parseDateOnlyLocal(req.query.from));
        faixaData.$gte = de;
      }

      if (req.query.to) {
        const ate = toDayEnd(parseDateOnlyLocal(req.query.to));
        faixaData.$lte = ate;
      }

      filtroBase.data = faixaData;
    }

    if (q || turma) {
      const alunoFiltro = { ...buildAlunoMatch(tenantId) };

      if (q) {
        alunoFiltro.nome = {
          $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i'
        };
      }

      if (turma) alunoFiltro.turma = turma;

      const alunos = await Aluno.find(alunoFiltro).select('_id').lean();
      const ids = alunos.map((a) => a._id);

      if (ids.length === 0) {
        return res.json({ total: 0, page, totalPages: 0, modo, data: [] });
      }

      filtroBase.aluno = { $in: ids };
    }

    const total = await Notificacao.countDocuments(filtroBase);
    const totalPages = Math.ceil(total / limit) || 0;

    const notificacoes = await Notificacao.find(filtroBase)
      .sort({ data: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(`
        aluno tipo tipoMedida data status valorNumerico quantidadeDias
        notaAnterior notaAtual classificacaoAnterior classificacaoAtual
        comentarioMonitor numeroSequencial entregue prazoDevolucao
        devolvidoPeloAluno devolvidaEm entregueEm natureza mensagemEnviada
        deferidoEm arquivada ativo artigo paragrafo inciso classificacaoRegulamento motivo
      `)
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao tenantId',
        match: alunoMatch
      })
      .lean();

    const dataRaw = (notificacoes || []).filter((n) => n.aluno);

    const data = await Promise.all(
      dataRaw.map((n) => {
        const valorTotal = Number(n.valorNumerico || 0);
        const valorUnitario = valorTotal;
        return enriquecerClassificacao(
          { ...n, valorTotal, valorUnitario },
          tenantId
        );
      })
    );

    res.json({ total, page, totalPages, modo, data });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

router.get('/:id', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const tenantId = getTenantId(req);

    const notificacao = await Notificacao.findOne({
      _id: id,
      ...buildInstMatch(tenantId)
    })
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao tenantId',
        match: buildAlunoMatch(tenantId)
      })
      .lean();

    if (!notificacao || !notificacao.aluno) {
      return res.status(404).json({ message: 'Notificação não encontrada' });
    }

    const valorTotal = Number(notificacao.valorNumerico || 0);
    const valorUnitario = valorTotal;

    const enriched = await enriquecerClassificacao(
      {
        ...notificacao,
        valorTotal,
        valorUnitario
      },
      tenantId
    );

    return res.json(enriched);
  } catch (err) {
    console.error('Erro ao carregar notificação:', err);
    return res.status(500).json({ message: 'Erro ao carregar notificação.' });
  }
});

router.post('/', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const inst = getTenantId(req);
    if (!inst) {
      return res.status(401).json({ message: 'Não autenticado.' });
    }

    const {
      aluno,
      natureza,
      tipo,
      tipoMedida,
      tipoElogio,
      motivo,
      quantidadeDias,
      valorNumerico,
      observacao,
      data,
      artigo,
      paragrafo,
      inciso,
      classificacaoRegulamento,
      comentarioMonitor
    } = req.body || {};

    if (!aluno || !mongoose.isValidObjectId(aluno)) {
      return res.status(400).json({ message: 'Aluno inválido/ausente.' });
    }

    const alunoDoc = await Aluno.findOne({
      _id: aluno,
      ...buildAlunoMatch(inst)
    })
      .select('nome turma instituicao tenantId')
      .lean();

    if (!alunoDoc) {
      return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    const ehElogio = natureza === 'elogio';
    const config = await getConfigDisciplinar(inst);
    let tituloMedida = ehElogio ? 'Elogio' : (tipoMedida || tipo || '').trim();

    let dias = 1;
    if (!ehElogio && PRECISA_DIAS.has(tituloMedida)) {
      const d = parseInt(quantidadeDias, 10);
      dias = Number.isInteger(d) && d > 0 ? d : 1;
    }

    let valor = 0;

    if (ehElogio) {
      let valorBase = 0;

      if (tipoElogio === 'elogioVerbal') {
        valorBase = config.recompensas.elogioVerbal;
      } else if (tipoElogio === 'boletimInternoIndividual') {
        valorBase = config.recompensas.elogioIndividual;
      } else if (tipoElogio === 'boletimInternoColetivo') {
        valorBase = config.recompensas.elogioColetivo;
      } else if (tipoElogio === 'mediaAlta') {
        valorBase = config.recompensas.mediaAlta;
      }

      valor = typeof valorNumerico === 'number' ? valorNumerico : valorBase;
      valor = normalizarValorPorNatureza('elogio', valor);
    } else {
      let valorBase = 0;

      const tipoNorm = String(tituloMedida || '').toLowerCase();

      if (tipoNorm.includes('advert')) {
        valorBase = config.medidas.advertenciaEscrita;
      } else if (tipoNorm.includes('repre')) {
        valorBase = config.medidas.repreensao;
      } else if (tipoNorm.includes('a.e.c.d.e') || tipoNorm.includes('aecde')) {
        valorBase = config.medidas.aecdePorDia;
      } else if (tipoNorm.includes('a.i.a') || tipoNorm.includes('aia')) {
        valorBase = config.medidas.aiaPorDia;
      }

      valor = typeof valorNumerico === 'number'
        ? valorNumerico
        : Number(valorBase.toFixed(2));

      valor = normalizarValorPorNatureza('indisciplina', valor);
    }

    const dataBase = data ? parseDateOnlyLocal(data) : new Date();

    let prazoDevolucao = null;
    if (!ehElogio) {
      const diasUteis = config?.tsmd?.diasParaDevolucao ?? 2;
      prazoDevolucao = addBusinessDays(new Date(), diasUteis);
    }

    const seqInfo = await getNextNumeroSequencialAtomic(inst, dataBase);

    let dadosRegulamento = montarDadosRegulamentoBase({
      artigo,
      paragrafo,
      inciso,
      classificacaoRegulamento,
      motivo
    });

    if (!ehElogio) {
      dadosRegulamento = await resolverDadosRegulamentoDaInstituicao(inst, {
        artigo,
        paragrafo,
        inciso,
        classificacaoRegulamento,
        motivo
      });
    }

    const nova = new Notificacao(
      tenantData(req, {
        aluno,
        natureza,
        tipo,
        tipoMedida: tituloMedida,
        tipoElogio: ehElogio ? tipoElogio : undefined,
        motivo: dadosRegulamento.texto || motivo,
        quantidadeDias: dias,
        valorNumerico: valor,
        observacao,
        data: dataBase,
        prazoDevolucao,
        status: 'pendente',
        numeroSequencial: seqInfo.numeroSequencial,
        artigo: dadosRegulamento.artigo,
        paragrafo: dadosRegulamento.paragrafo,
        inciso: dadosRegulamento.inciso,
        classificacaoRegulamento: dadosRegulamento.classificacao,
        comentarioMonitor,
        criadoPor: req.usuario?.id,
        mensagemEnviada: false
      })
    );

    await nova.save();

    const enrichedBefore = await enriquecerClassificacao(nova.toObject(), inst);

    await recomputarCamposNotaDaNotificacao(nova, inst);
    await recomputarSnapshotsPosterioresDoAluno(nova.aluno, inst);

    const alunoAtualizado = await recomputarResumoAlunoAteAgora(nova.aluno, inst);

    await verificarEnvioNP(alunoAtualizado, inst);

    await safeLogAction({
  req,
  event: 'NOTIFICACAO_CRIADA',
  targetType: 'Notificacao',
  targetId: nova._id,
  entidadeNome: alunoAtualizado?.nome || alunoDoc?.nome || null,
  alunoNome: alunoAtualizado?.nome || alunoDoc?.nome || null,
  meta: {
    aluno: alunoAtualizado?.nome || alunoDoc?.nome,
    turma: alunoAtualizado?.turma || alunoDoc?.turma,
    natureza,
    tipoMedida: tituloMedida,
    valor,
    quantidadeDias: dias,
    numeroSequencial: nova.numeroSequencial,
    notaAnterior: enrichedBefore.notaAnterior,
    notaAtual: enrichedBefore.notaAtual,
    artigo: dadosRegulamento.artigo,
    paragrafo: dadosRegulamento.paragrafo,
    inciso: dadosRegulamento.inciso,
    classificacaoRegulamento: dadosRegulamento.classificacao
  }
});

    const created = await Notificacao.findById(nova._id)
      .populate({
        path: 'aluno',
        select: 'nome turma instituicao tenantId',
        match: buildAlunoMatch(inst)
      })
      .lean();

    return res.status(201).json(created);
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    return res.status(500).json({ message: 'Erro ao criar notificação' });
  }
});

router.delete('/:id', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const inst = getTenantId(req);
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const existente = await Notificacao.findOne({
      _id: id,
      ...buildInstMatch(inst)
    }).lean();

    if (!existente) {
      return res.status(404).json({ message: 'Notificação não encontrada' });
    }

    const alunoId = existente.aluno;

    await Notificacao.deleteOne({
      _id: id,
      ...buildInstMatch(inst)
    });

    await recomputarSnapshotsPosterioresDoAluno(alunoId, inst);
    const alunoAtualizado = await recomputarResumoAlunoAteAgora(alunoId, inst);

    await verificarEnvioNP(alunoAtualizado, inst);

    await safeLogAction({
  req,
  event: 'NOTIFICACAO_EXCLUIDA',
  targetType: 'Notificacao',
  targetId: id,
  entidadeNome: alunoAtualizado?.nome || null,
  alunoNome: alunoAtualizado?.nome || null,
  meta: { aluno: alunoAtualizado?.nome, turma: alunoAtualizado?.turma }
});

    return res.json({ message: 'Notificação excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir notificação:', error);
    return res.status(500).json({ message: 'Erro ao excluir notificação' });
  }
});

router.post('/:id/entregar', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const inst = getTenantId(req);
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const n = await Notificacao.findOne({
      _id: id,
      ...buildInstMatch(inst)
    });

    if (!n) {
      return res.status(404).json({ error: 'Notificação não encontrada.' });
    }

    if (n.status !== 'deferido') {
      return res.status(400).json({ error: 'Somente notificações deferidas podem ser entregues.' });
    }

    if (n.entregue) {
      return res.json({ ok: true, message: 'Já estava entregue.' });
    }

    n.entregue = true;
    n.entregueEm = new Date();

    const config = await getConfigDisciplinar(inst);
    const diasUteis = config?.tsmd?.diasParaDevolucao ?? 2;
    n.prazoDevolucao = addBusinessDays(new Date(), diasUteis);

    await n.save();

    await safeLogAction({
  req,
  event: 'NOTIFICACAO_ENTREGUE',
  targetType: 'Notificacao',
  targetId: id,
  entidadeNome: alunoInfo.alunoNome,
  alunoNome: alunoInfo.alunoNome,
  meta: {
    prazoDevolucao: n.prazoDevolucao,
    turma: alunoInfo.alunoTurma
  }
});

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao marcar entregue:', err);
    res.status(500).json({ error: 'Erro ao marcar ENTREGUE.' });
  }
});

router.post('/:id/devolver', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const inst = getTenantId(req);
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const n = await Notificacao.findOne({
      _id: id,
      ...buildInstMatch(inst)
    });

    if (!n) {
      return res.status(404).json({ error: 'Notificação não encontrada.' });
    }

    if (!n.entregue) {
      return res.status(400).json({ error: 'Marque como ENTREGUE antes de DEVOLVIDA.' });
    }

    if (n.devolvidoPeloAluno) {
      return res.json({ ok: true, message: 'Já estava devolvida.' });
    }

    n.devolvidoPeloAluno = true;
    n.devolvidaEm = new Date();
    n.arquivada = true;
    n.status = 'arquivado';

    await n.save();

    await safeLogAction({
  req,
  event: 'NOTIFICACAO_DEVOLVIDA',
  targetType: 'Notificacao',
  targetId: id,
  entidadeNome: alunoInfo.alunoNome,
  alunoNome: alunoInfo.alunoNome,
  meta: {
    turma: alunoInfo.alunoTurma
  }
});

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao marcar devolvida:', err);
    res.status(500).json({ error: 'Erro ao marcar DEVOLVIDA.' });
  }
});
// ✏️ Atualizar notificação
router.put('/:id',
  autenticar,
  requireTenant,
  async (req, res) => {
    try {
      const { id } = req.params;

      const inst = getTenantId(req);

      const notif = await Notificacao.findOne({
        _id: id,
        ...buildTenantMatch(inst)
      });

      if (!notif) {
        return res.status(404).json({ message: 'Notificação não encontrada.' });
      }

      // 🔥 Atualiza campos permitidos
      const campos = [
        'natureza',
        'status',
        'data',
        'tipoElogio',
        'tipoMedida',
        'motivo',
        'valorNumerico',
        'quantidadeDias',
        'classificacaoRegulamento',
        'artigo',
        'paragrafo',
        'inciso',
        'observacao',
        'aluno'
      ];

      campos.forEach(c => {
        if (req.body[c] !== undefined) {
          notif[c] = req.body[c];
        }
      });

      // 🔥 Regra importante: se foi corrigido, limpa revisão
      if (notif.status === 'revisao_solicitada') {
        notif.status = 'pendente';
        notif.alertaAtivo = false;
      }

      await notif.save();

      return res.json({
        message: 'Notificação atualizada com sucesso.',
        notificacao: notif
      });

    } catch (err) {
      console.error('[NOTIFICACOES][UPDATE]', err);
      return res.status(500).json({
        message: 'Erro ao atualizar notificação.'
      });
    }
  }
);
// =========================
// 🚨 RESUMO DE REVISÕES PENDENTES
// =========================
router.get('/revisoes/pendentes',
  autenticar,
  requireTenant,
  async (req, res) => {
    try {
      const inst = getTenantId(req);

      const lista = await Notificacao.find({
        ...buildTenantMatch(inst),
        status: 'revisao_solicitada',
        ativo: { $ne: false }
      })
        .populate('aluno', 'nome turma')
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();

      const itens = lista.map(n => ({
        _id: n._id,
        numeroSequencial: n.numeroSequencial || '',
        motivo: n.motivo || '',
        comentarioRevisao: n.comentarioRevisao || '',
        updatedAt: n.updatedAt,
        aluno: {
          nome: n.aluno?.nome || 'Aluno',
          turma: n.aluno?.turma || '—'
        }
      }));

      return res.json({
        total: itens.length,
        itens: itens.slice(0, 8)
      });
    } catch (err) {
      console.error('[NOTIFICACOES][REVISOES_PENDENTES]', err);
      return res.status(500).json({
        message: 'Erro ao buscar revisões pendentes.'
      });
    }
  }
);
module.exports = router;