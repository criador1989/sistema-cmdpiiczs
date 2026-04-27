'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { autenticar } = require('../../middleware/autenticacao');
const { requireTenant } = require('../../middleware/tenantScope');
const AphAtendimento = require('../../models/AphAtendimento');
const Aluno = require('../../models/Aluno');
const { logAction, attachActor } = require('../../utils/audit');

const { sendMail } = require('../../utils/mailer');

/* -------------------- helpers multi-tenant -------------------- */
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

function buildTenantMatch(tenantId) {
  if (!tenantId) return { _id: null };

  const asStr = String(tenantId);
  const or = [
    { tenantId: asStr },
    { instituicao: asStr },
  ];

  if (mongoose.isValidObjectId(asStr)) {
    const oid = new mongoose.Types.ObjectId(asStr);
    or.push({ tenantId: oid });
    or.push({ instituicao: oid });
  }

  return { $or: or };
}

function tenantData(req, extra = {}) {
  const tenantId = getTenantId(req);
  return {
    ...extra,
    tenantId,
    instituicao: tenantId,
  };
}

/* -------------------- utils -------------------- */
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateOnlyLocal(v) {
  if (!v) return new Date();

  if (typeof v === 'string') {
    const iso = /^\d{4}-\d{2}-\d{2}/.test(v);
    const br = /^\d{2}\/\d{2}\/\d{4}$/.test(v);

    if (iso) return new Date(v + (v.length === 10 ? 'T00:00:00' : ''));

    if (br) {
      const [dd, mm, yyyy] = v.split('/').map(Number);
      return new Date(yyyy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
    }
  }

  const t = Date.parse(v);
  return Number.isNaN(t) ? new Date() : new Date(t);
}

function formatDateBR(dateValue) {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
}

function simNao(value) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  const v = String(value || '').trim();
  return v === 'Sim' ? 'Sim' : 'Não';
}

function str(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(strValue = '') {
  return String(strValue)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withTimeout(promise, ms = 30000, label = 'operação') {
  let t;
  const timer = new Promise((resolve) => {
    t = setTimeout(() => {
      resolve({ __timeout: true, ok: false, erro: `Timeout ${label} (${ms}ms)` });
    }, ms);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    timer,
  ]);
}

function getActorName(req) {
  return (
    req.actor?.nome ||
    req.usuario?.nome ||
    req.user?.nome ||
    req.usuario?.login ||
    req.user?.login ||
    ''
  );
}

function getActorRole(req) {
  return (
    req.usuario?.tipo ||
    req.user?.tipo ||
    req.usuario?.perfil ||
    req.user?.perfil ||
    req.usuario?.funcao ||
    req.user?.funcao ||
    ''
  );
}

async function gerarNumeroRegistro({ tenantId, data }) {
  const d = data ? new Date(data) : new Date();
  const ano = d.getFullYear();

  const filtro = {
    ...buildTenantMatch(tenantId),
    data: {
      $gte: new Date(ano, 0, 1, 0, 0, 0, 0),
      $lte: new Date(ano, 11, 31, 23, 59, 59, 999),
    },
  };

  const totalAno = await AphAtendimento.countDocuments(filtro);
  const seq = String(totalAno + 1).padStart(4, '0');

  return `APH-${ano}-${seq}`;
}

function extractPossibleEmailsFromValue(value, set) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => extractPossibleEmailsFromValue(item, set));
    return;
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => extractPossibleEmailsFromValue(item, set));
    return;
  }

  const raw = String(value || '').trim();
  if (!raw) return;

  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (matches) matches.forEach((m) => set.add(m.trim().toLowerCase()));
}

function getEmailsResponsaveis(aluno) {
  const set = new Set();

  extractPossibleEmailsFromValue(aluno?.emailResponsavel, set);
  extractPossibleEmailsFromValue(aluno?.emailMae, set);
  extractPossibleEmailsFromValue(aluno?.emailPai, set);
  extractPossibleEmailsFromValue(aluno?.email, set);
  extractPossibleEmailsFromValue(aluno?.contatos, set);
  extractPossibleEmailsFromValue(aluno?.responsaveis, set);
  extractPossibleEmailsFromValue(aluno?.responsavel, set);

  return [...set];
}

function montarMensagemAPH({ aluno, at }) {
  const nome = aluno?.nome || at?.alunoNomeSnapshot || 'Aluno(a)';
  const turma = aluno?.turma || at?.alunoTurmaSnapshot || '—';

  const dataStr = formatDateBR(at?.data);
  const horaInicio = at?.horaInicioAtendimento || at?.hora || '—';
  const local = at?.local || '—';

  const classificacoes = Array.isArray(at?.classificacoes) && at.classificacoes.length
    ? at.classificacoes.join(', ')
    : (Array.isArray(at?.tipos) && at.tipos.length ? at.tipos.join(', ') : '—');

  const providencias = Array.isArray(at?.providenciasAdotadas) && at.providenciasAdotadas.length
    ? at.providenciasAdotadas.join(', ')
    : '—';

  const fatos = str(at?.descricaoFatos || at?.observacoes || at?.observacao || '', 2000);
  const sinais = str(at?.sinaisESintomas || at?.queixaAluno || '', 2000);
  const desfecho = at?.desfecho || at?.descricaoDesfecho || '—';

  const titulo = `Comunicação de ocorrência/intercorrência — ${nome}`;

  const texto = [
    `Prezado(a) responsável,`,
    ``,
    `Comunicamos que o(a) aluno(a) ${nome}, da turma ${turma}, apresentou ocorrência/intercorrência no ambiente escolar.`,
    ``,
    `Dados principais:`,
    `• Data: ${dataStr}`,
    `• Horário: ${horaInicio}`,
    `• Local: ${local}`,
    `• Classificação: ${classificacoes}`,
    ...(sinais ? [`• Sinais/queixa: ${sinais}`] : []),
    ...(fatos ? [`• Síntese objetiva dos fatos: ${fatos}`] : []),
    `• Providências adotadas: ${providencias}`,
    `• Desfecho: ${desfecho}`,
    ``,
    `Esta comunicação tem caráter informativo e de ciência formal. Permanecemos à disposição para os esclarecimentos necessários.`,
    ``,
    `Atenciosamente,`,
    `Coordenação — CMDPII/CZS`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222">
      <p>Prezado(a) responsável,</p>
      <p>
        Comunicamos que o(a) aluno(a) <strong>${escapeHtml(nome)}</strong>,
        da turma <strong>${escapeHtml(turma)}</strong>, apresentou ocorrência/intercorrência no ambiente escolar.
      </p>

      <p><strong>Dados principais:</strong></p>
      <ul>
        <li><strong>Data:</strong> ${escapeHtml(dataStr)}</li>
        <li><strong>Horário:</strong> ${escapeHtml(horaInicio)}</li>
        <li><strong>Local:</strong> ${escapeHtml(local)}</li>
        <li><strong>Classificação:</strong> ${escapeHtml(classificacoes)}</li>
        ${sinais ? `<li><strong>Sinais/queixa:</strong> ${escapeHtml(sinais)}</li>` : ''}
        ${fatos ? `<li><strong>Síntese objetiva dos fatos:</strong> ${escapeHtml(fatos)}</li>` : ''}
        <li><strong>Providências adotadas:</strong> ${escapeHtml(providencias)}</li>
        <li><strong>Desfecho:</strong> ${escapeHtml(desfecho)}</li>
      </ul>

      <p>Esta comunicação tem caráter informativo e de ciência formal. Permanecemos à disposição para os esclarecimentos necessários.</p>
      <p>Atenciosamente,<br>Coordenação — CMDPII/CZS</p>
    </div>
  `;

  return { titulo, texto, html };
}

async function enviarComunicadoAPH({ aluno, at, tenantId }) {
  const emails = getEmailsResponsaveis(aluno);

  if (!emails.length) {
    return {
      ok: false,
      motivo: 'sem_email_responsavel',
      to: [],
    };
  }

  const { titulo, texto, html } = montarMensagemAPH({ aluno, at });

  console.log('[APH][MAIL] destinatarios =', emails.join(', '));
  console.log('[APH][MAIL] tenant =', String(tenantId || ''));
  console.log('[APH][MAIL] subject =', titulo);

  const result = await withTimeout(
    sendMail({
      to: emails,
      subject: titulo,
      html,
      text: texto,
    }),
    30000,
    'envio email APH'
  );

  if (result?.__timeout) {
    return {
      ok: false,
      motivo: 'timeout_envio_email',
      to: emails,
    };
  }

  return {
    ok: true,
    canal: 'email',
    to: emails,
    result,
  };
}

function montarPayloadAPH({ req, aluno, numeroRegistroExistente = '' }) {
  const body = req.body || {};
  const actorName = getActorName(req);
  const actorRole = getActorRole(req);

  const data = parseDateOnlyLocal(body.data);

  const comunicacaoPais = body.comunicacaoPais || {};
  const responsavelContato = body.responsavelContato || {};
  const assinaturas = body.assinaturas || {};

  const classificacoes = normalizeArray(body.classificacoes?.length ? body.classificacoes : body.tipos);
  const tipos = normalizeArray(body.tipos?.length ? body.tipos : classificacoes);

  const horaInicioAtendimento = str(body.horaInicioAtendimento || body.hora, 10);
  const hora = str(body.hora || horaInicioAtendimento, 10);

  const responsavelNome =
    str(body.servidorResponsavelRegistro || body.responsavel || actorName, 120);

  const responsaveisInformados = simNao(
    body.responsaveisInformados ||
    comunicacaoPais.houveComunicacao
  );

  const meiosUtilizados = normalizeArray(comunicacaoPais.meiosUtilizados);

  const meioComunicacao = str(
    body.meioComunicacao ||
    (meiosUtilizados.length ? meiosUtilizados.join(', ') : ''),
    80
  );

  return tenantData(req, {
    alunoId: aluno._id,

    numeroRegistro: str(body.numeroRegistro || numeroRegistroExistente, 40),
    data,

    hora,
    horaInicioAtendimento,
    horaEncerramentoAtendimento: str(body.horaEncerramentoAtendimento, 10),

    local: str(body.local, 120),
    localOutro: str(body.localOutro, 120),

    responsavel: responsavelNome,
    servidorResponsavelRegistro: responsavelNome,
    funcaoServidorResponsavel: str(body.funcaoServidorResponsavel || actorRole, 120),

    alunoNomeSnapshot: str(aluno.nome, 180),
    alunoTurmaSnapshot: str(aluno.turma, 80),
    alunoMatriculaSnapshot: str(aluno.matricula || aluno.codigoAcesso || '', 80),
    alunoNascimentoSnapshot: aluno.nascimento || aluno.dataNascimento || null,

    responsavelContato: {
      nome: str(responsavelContato.nome || body.nomeResponsavel || aluno.nomeResponsavel || aluno.nomeMae || aluno.nomePai || '', 180),
      vinculo: str(responsavelContato.vinculo || body.vinculoResponsavel || '', 80),
      telefonePrincipal: str(responsavelContato.telefonePrincipal || body.telefonePrincipal || aluno.telefone || aluno.contatos?.whatsapp || '', 40),
      telefoneSecundario: str(responsavelContato.telefoneSecundario || body.telefoneSecundario || '', 40),
    },

    tipos,
    classificacoes,
    classificacaoOutro: str(body.classificacaoOutro, 160),

    descricaoFatos: str(body.descricaoFatos || body.observacoes || '', 8000),

    sinaisESintomas: str(body.sinaisESintomas || body.queixaAluno || '', 4000),
    queixaAluno: str(body.queixaAluno, 4000),

    materiais: normalizeArray(body.materiais),
    procedimentos: str(body.procedimentos, 4000),

    providenciasAdotadas: normalizeArray(body.providenciasAdotadas),
    providenciaOutro: str(body.providenciaOutro, 160),
    descricaoProvidencias: str(body.descricaoProvidencias || body.procedimentos || '', 8000),

    tempoObservacao: str(body.tempoObservacao, 120),
    evolucaoQuadro: str(body.evolucaoQuadro, 80),
    evolucaoOutro: str(body.evolucaoOutro, 160),
    descricaoEvolucao: str(body.descricaoEvolucao, 8000),

    responsaveisInformados,
    meioComunicacao,

    comunicacaoPais: {
      houveComunicacao: simNao(comunicacaoPais.houveComunicacao || responsaveisInformados),
      dataContato: comunicacaoPais.dataContato ? parseDateOnlyLocal(comunicacaoPais.dataContato) : null,
      horaContato: str(comunicacaoPais.horaContato, 10),
      meiosUtilizados,
      nomePessoaContatada: str(comunicacaoPais.nomePessoaContatada, 180),
      vinculoComAluno: str(comunicacaoPais.vinculoComAluno, 80),
      houveExitoContato: simNao(comunicacaoPais.houveExitoContato ?? 'Sim'),
      sinteseInformacaoPrestada: str(comunicacaoPais.sinteseInformacaoPrestada, 8000),
      orientacoesTransmitidas: normalizeArray(comunicacaoPais.orientacoesTransmitidas),
      orientacaoOutro: str(comunicacaoPais.orientacaoOutro, 160),
    },

    houveEncaminhamento: Boolean(body.houveEncaminhamento),
    encaminhamento: str(body.encaminhamento, 4000),

    desfecho: str(body.desfecho, 160),
    desfechoOutro: str(body.desfechoOutro, 160),
    descricaoDesfecho: str(body.descricaoDesfecho, 8000),

    observacoes: str(body.observacoes, 8000),
    observacao: str(body.observacao || body.observacoes, 8000),

    assinaturas: {
      servidorResponsavelNome: str(assinaturas.servidorResponsavelNome || responsavelNome, 180),
      servidorResponsavelFuncao: str(assinaturas.servidorResponsavelFuncao || body.funcaoServidorResponsavel || actorRole, 120),
      vistoDirecaoCoordenacaoNome: str(assinaturas.vistoDirecaoCoordenacaoNome, 180),
      vistoDirecaoCoordenacaoFuncao: str(assinaturas.vistoDirecaoCoordenacaoFuncao, 120),
    },

    statusRegistro: str(body.statusRegistro || 'finalizado', 30),
    criadoPor: str(actorName, 120),
    atualizadoPor: str(actorName, 120),
  });
}

/* =========================================================
   STATUS
========================================================= */
router.get('/status', (_req, res) => {
  res.json({ ok: true, service: 'aph' });
});

/* =========================================================
   LISTAGEM
========================================================= */
router.get('/atendimentos', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);

    const filtro = {
      ...buildTenantMatch(tenantId),
    };

    if (req.query.alunoId && mongoose.isValidObjectId(req.query.alunoId)) {
      filtro.alunoId = new mongoose.Types.ObjectId(req.query.alunoId);
    }

    const { dtIni, dtFim } = req.query;
    if (dtIni || dtFim) {
      const dataFiltro = {};
      if (dtIni && !Number.isNaN(Date.parse(dtIni))) dataFiltro.$gte = new Date(dtIni);
      if (dtFim && !Number.isNaN(Date.parse(dtFim))) dataFiltro.$lte = endOfDay(dtFim);
      if (Object.keys(dataFiltro).length) filtro.data = dataFiltro;
    }

    const q = str(req.query.q, 120);
    if (q) {
      const regex = new RegExp(q, 'i');
      filtro.$and = filtro.$and || [];
      filtro.$and.push({
        $or: [
          { numeroRegistro: regex },
          { responsavel: regex },
          { servidorResponsavelRegistro: regex },
          { local: regex },
          { tipos: regex },
          { classificacoes: regex },
          { materiais: regex },
          { observacoes: regex },
          { descricaoFatos: regex },
          { sinaisESintomas: regex },
          { queixaAluno: regex },
          { procedimentos: regex },
          { descricaoProvidencias: regex },
          { desfecho: regex },
          { descricaoDesfecho: regex },
          { alunoNomeSnapshot: regex },
          { alunoTurmaSnapshot: regex },
        ],
      });
    }

    const skip = (page - 1) * limit;

    const [total, list] = await Promise.all([
      AphAtendimento.countDocuments(filtro),
      AphAtendimento.find(filtro)
        .sort({ data: -1, horaInicioAtendimento: -1, hora: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: list,
      itens: list,
    });
  } catch (err) {
    console.error('[APH] GET /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao listar atendimentos.' });
  }
});

/* Alias de listagem por aluno */
router.get('/atendimentos/aluno/:alunoId', autenticar, requireTenant, (req, res, next) => {
  const q = [];
  q.push(`alunoId=${encodeURIComponent(req.params.alunoId)}`);
  if (req.query.page) q.push(`page=${encodeURIComponent(req.query.page)}`);
  if (req.query.limit) q.push(`limit=${encodeURIComponent(req.query.limit)}`);
  if (req.query.dtIni) q.push(`dtIni=${encodeURIComponent(req.query.dtIni)}`);
  if (req.query.dtFim) q.push(`dtFim=${encodeURIComponent(req.query.dtFim)}`);
  if (req.query.q) q.push(`q=${encodeURIComponent(req.query.q)}`);

  req.url = `/atendimentos?${q.join('&')}`;
  next();
});

/* Alias compatível com front antigo: /api/aph/listar */
router.get('/listar', autenticar, requireTenant, (req, res, next) => {
  const q = [];
  if (req.query.alunoId) q.push(`alunoId=${encodeURIComponent(req.query.alunoId)}`);
  if (req.query.page) q.push(`page=${encodeURIComponent(req.query.page)}`);
  if (req.query.limit) q.push(`limit=${encodeURIComponent(req.query.limit)}`);
  if (req.query.dtIni) q.push(`dtIni=${encodeURIComponent(req.query.dtIni)}`);
  if (req.query.dtFim) q.push(`dtFim=${encodeURIComponent(req.query.dtFim)}`);
  if (req.query.q) q.push(`q=${encodeURIComponent(req.query.q)}`);

  req.url = `/atendimentos${q.length ? '?' + q.join('&') : ''}`;
  next();
});

/* Contador para ficha */
router.get('/atendimentos/count/:alunoId', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { alunoId } = req.params;
    if (!mongoose.isValidObjectId(alunoId)) return res.json({ total: 0, count: 0 });

    const total = await AphAtendimento.countDocuments({
      ...buildTenantMatch(tenantId),
      alunoId,
    });

    res.json({ total, count: total });
  } catch (e) {
    console.warn('[APH] count falhou:', e?.message || e);
    res.json({ total: 0, count: 0 });
  }
});

/* Detalhe */
router.get('/atendimentos/:id', autenticar, requireTenant, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const _id = req.params.id;
    if (!mongoose.isValidObjectId(_id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const doc = await AphAtendimento.findOne({
      _id,
      ...buildTenantMatch(tenantId),
    }).lean();

    if (!doc) return res.status(404).json({ message: 'Registro não encontrado.' });

    res.json(doc);
  } catch (err) {
    console.error('[APH] GET /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao carregar atendimento.' });
  }
});

/* Alias compatível */
router.get('/atendimento/:id', autenticar, requireTenant, (req, res, next) => {
  req.url = `/atendimentos/${req.params.id}`;
  next();
});

/* =========================================================
   CRIAR
========================================================= */
router.post('/atendimentos', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const alunoId = req.body?.alunoId;
    if (!alunoId || !mongoose.isValidObjectId(alunoId)) {
      return res.status(400).json({ message: 'alunoId inválido/ausente.' });
    }

    const aluno = await Aluno.findOne({
      _id: alunoId,
      ...buildTenantMatch(tenantId),
    })
      .select('nome turma matricula codigoAcesso nascimento dataNascimento instituicao tenantId contatos responsaveis responsavel nomeResponsavel nomeMae nomePai telefone email emailResponsavel emailMae emailPai')
      .lean();

    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    const dataRegistro = parseDateOnlyLocal(req.body?.data);
    const numeroRegistro = str(req.body?.numeroRegistro) || await gerarNumeroRegistro({
      tenantId,
      data: dataRegistro,
    });

    const payload = montarPayloadAPH({
      req: {
        ...req,
        body: {
          ...req.body,
          data: dataRegistro,
          numeroRegistro,
        },
      },
      aluno,
    });

    const novo = await AphAtendimento.create(payload);

    await logAction({
      req,
      event: 'APH_ATENDIMENTO_CRIADO',
      targetType: 'APH',
      targetId: novo._id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        numeroRegistro: novo.numeroRegistro,
        turma: aluno.turma,
        classificacoes: novo.classificacoes,
        tipos: novo.tipos,
        local: novo.local,
        horaInicioAtendimento: novo.horaInicioAtendimento,
        horaEncerramentoAtendimento: novo.horaEncerramentoAtendimento,
        data: novo.data,
        sinais: novo.sinaisESintomas,
        providencias: novo.providenciasAdotadas,
        desfecho: novo.desfecho,
        encaminhamento: novo.houveEncaminhamento,
      },
    });

    let comunicacao = { ok: false, motivo: 'nao_enviado' };

    try {
      const deveEnviar =
        novo.responsaveisInformados === 'Sim' ||
        novo.comunicacaoPais?.houveComunicacao === 'Sim';

      if (deveEnviar) {
        comunicacao = await enviarComunicadoAPH({
          aluno,
          at: novo,
          tenantId,
        });

        novo.comunicadoEmailEnviado = !!comunicacao.ok;
        novo.comunicadoEmailEnviadoEm = comunicacao.ok ? new Date() : null;
        novo.comunicadoEmailDestinatarios = comunicacao.to || [];
        novo.comunicadoEmailErro = comunicacao.ok ? '' : (comunicacao.motivo || 'falha_envio');
        await novo.save();
      }
    } catch (e) {
      console.warn('[APH] Falha no disparo de comunicação:', e?.message || e);

      await AphAtendimento.findByIdAndUpdate(novo._id, {
        $set: {
          comunicadoEmailEnviado: false,
          comunicadoEmailErro: e?.message || 'erro_envio_email',
        },
      }).catch(() => {});

      comunicacao = {
        ok: false,
        motivo: e?.message || 'erro_envio_email',
      };
    }

    res.status(201).json({
      ok: true,
      atendimento: novo,
      item: novo,
      comunicacao,
    });
  } catch (err) {
    console.error('[APH] POST /atendimentos erro:', err);
    res.status(500).json({ message: 'Erro ao salvar atendimento.' });
  }
});

/* Compat: POST /api/aph/atendimentos/:alunoId */
router.post('/atendimentos/:alunoId', autenticar, requireTenant, attachActor, (req, res, next) => {
  req.body = {
    ...(req.body || {}),
    alunoId: req.body?.alunoId || req.params.alunoId,
  };
  req.url = '/atendimentos';
  next();
});

/* =========================================================
   EDITAR
========================================================= */
router.put('/atendimentos/:id', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const atendimentoAntigo = await AphAtendimento.findOne({
      _id: id,
      ...buildTenantMatch(tenantId),
    }).lean();

    if (!atendimentoAntigo) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const aluno = await Aluno.findOne({
      _id: atendimentoAntigo.alunoId,
      ...buildTenantMatch(tenantId),
    })
      .select('nome turma matricula codigoAcesso nascimento dataNascimento instituicao tenantId contatos responsaveis responsavel nomeResponsavel nomeMae nomePai telefone email emailResponsavel emailMae emailPai')
      .lean();

    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    const patch = montarPayloadAPH({
      req,
      aluno,
      numeroRegistroExistente: atendimentoAntigo.numeroRegistro || '',
    });

    delete patch.criadoPor;

    const updated = await AphAtendimento.findOneAndUpdate(
      {
        _id: id,
        ...buildTenantMatch(tenantId),
      },
      { $set: patch },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    await logAction({
      req,
      event: 'APH_ATENDIMENTO_ATUALIZADO',
      targetType: 'APH',
      targetId: id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        numeroRegistro: updated.numeroRegistro,
        turma: aluno.turma,
        antes: {
          classificacoes: atendimentoAntigo.classificacoes || atendimentoAntigo.tipos || [],
          local: atendimentoAntigo.local,
          desfecho: atendimentoAntigo.desfecho,
        },
        depois: {
          classificacoes: updated.classificacoes || updated.tipos || [],
          local: updated.local,
          desfecho: updated.desfecho,
        },
      },
    });

    res.json({
      ok: true,
      atendimento: updated,
      item: updated,
    });
  } catch (err) {
    console.error('[APH] PUT /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao atualizar atendimento.' });
  }
});

/* Alias compatível */
router.put('/atendimento/:id', autenticar, requireTenant, attachActor, (req, res, next) => {
  req.url = `/atendimentos/${req.params.id}`;
  next();
});

/* =========================================================
   EXCLUIR
========================================================= */
router.delete('/atendimentos/:id', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const doc = await AphAtendimento.findOneAndDelete({
      _id: id,
      ...buildTenantMatch(tenantId),
    }).lean();

    if (!doc) return res.status(404).json({ message: 'Registro não encontrado.' });

    await logAction({
      req,
      event: 'APH_ATENDIMENTO_EXCLUIDO',
      targetType: 'APH',
      targetId: id,
      entidadeNome: doc.alunoNomeSnapshot || '',
      alunoNome: doc.alunoNomeSnapshot || '',
      meta: {
        numeroRegistro: doc.numeroRegistro,
        alunoId: doc.alunoId,
        data: doc.data,
        classificacoes: doc.classificacoes || doc.tipos || [],
        local: doc.local,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[APH] DELETE /atendimentos/:id erro:', err);
    res.status(500).json({ message: 'Erro ao excluir atendimento.' });
  }
});

/* Alias compatível */
router.delete('/atendimento/:id', autenticar, requireTenant, attachActor, (req, res, next) => {
  req.url = `/atendimentos/${req.params.id}`;
  next();
});

/* =========================================================
   REENVIAR COMUNICADO
========================================================= */
router.post('/atendimentos/:id/reengatilhar-comunicacao', autenticar, requireTenant, attachActor, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'Não autenticado.' });

    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Registro não encontrado.' });
    }

    const at = await AphAtendimento.findOne({
      _id: id,
      ...buildTenantMatch(tenantId),
    }).lean();

    if (!at) return res.status(404).json({ message: 'Registro não encontrado.' });

    const aluno = await Aluno.findOne({
      _id: at.alunoId,
      ...buildTenantMatch(tenantId),
    })
      .select('nome turma matricula codigoAcesso nascimento dataNascimento instituicao tenantId contatos responsaveis responsavel nomeResponsavel nomeMae nomePai telefone email emailResponsavel emailMae emailPai')
      .lean();

    if (!aluno) {
      return res.status(404).json({ message: 'Aluno não encontrado nesta instituição.' });
    }

    const comunicacao = await enviarComunicadoAPH({
      aluno,
      at,
      tenantId,
    });

    await AphAtendimento.findByIdAndUpdate(id, {
      $set: {
        responsaveisInformados: 'Sim',
        'comunicacaoPais.houveComunicacao': 'Sim',
        comunicadoEmailEnviado: !!comunicacao.ok,
        comunicadoEmailEnviadoEm: comunicacao.ok ? new Date() : null,
        comunicadoEmailDestinatarios: comunicacao.to || [],
        comunicadoEmailErro: comunicacao.ok ? '' : (comunicacao.motivo || 'falha_envio'),
      },
    }).catch(() => {});

    await logAction({
      req,
      event: 'APH_COMUNICADO_REENVIADO',
      targetType: 'APH',
      targetId: id,
      entidadeNome: aluno.nome,
      alunoNome: aluno.nome,
      meta: {
        numeroRegistro: at.numeroRegistro,
        ok: comunicacao.ok,
        motivo: comunicacao.motivo || null,
        to: comunicacao.to || [],
      },
    });

    res.json({
      ok: !!comunicacao.ok,
      queued: !!comunicacao.ok,
      comunicacao,
    });
  } catch (err) {
    console.error('[APH] POST /reengatilhar-comunicacao erro:', err);
    res.status(500).json({ message: 'Erro ao reenviar comunicação.' });
  }
});

module.exports = router;