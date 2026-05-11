const LivroOcorrencia = require("../models/LivroOcorrencia");
const Counter = require("../models/Counter");

function normalizarTenant(tenant) {
  if (!tenant) return "default";

  if (typeof tenant === "object") {
    return String(
      tenant._id ||
      tenant.id ||
      tenant.slug ||
      tenant.codigo ||
      tenant.subdominio ||
      "default"
    ).trim();
  }

  return String(tenant).trim();
}

function obterTenantDoProcessoOuReq(processo, req) {
  return normalizarTenant(
    processo?.tenant ||
    processo?.tenantId ||
    processo?.instituicao ||
    req?.tenantId ||
    req?.instituicaoId ||
    req?.tenant?._id ||
    req?.tenant?.id ||
    req?.tenant?.slug ||
    req?.tenant
  );
}

function getUsuarioInfo(req) {
  const u = req?.usuario || req?.user || {};

  return {
    id: u._id || u.id || null,
    nome: u.nome || u.name || u.email || "Sistema",
  };
}

async function gerarNumeroLivro(tenant) {
  const ano = new Date().getFullYear();
  const chave = `livro_ocorrencias_${tenant}_${ano}`;

  const counter = await Counter.findOneAndUpdate(
    { chave },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const sequencial = counter.seq;
  const numeroLivro = `LIV-${ano}-${String(sequencial).padStart(5, "0")}`;

  return { ano, sequencial, numeroLivro };
}

function montarDadosDoProcesso(processo) {
  return {
    processo: processo._id,
    numeroProcesso: processo.numeroProcesso || "",
    natureza: processo.natureza || "indisciplina",
    classificacaoOcorrencia: processo.classificacaoOcorrencia || "",
    gravidade: processo.gravidade || "leve",

    aluno: {
      id: processo.aluno?._id || processo.aluno?.id || processo.aluno || null,
      nome: processo.aluno?.nome || processo.alunoNome || "",
      turma: processo.aluno?.turma || processo.turma || "",
      matricula: processo.aluno?.matricula || processo.matricula || "",
    },

    responsavel: {
      nome: processo.responsavel?.nome || "",
      parentesco: processo.responsavel?.parentesco || "",
      telefone: processo.responsavel?.telefone || "",
      email: processo.responsavel?.email || "",
    },

    fato: {
      data: processo.dataFato || null,
      hora: processo.horaFato || "",
      local: processo.localFato || "",
      descricao: processo.descricaoFato || "",
      providenciasImediatas: processo.providenciasImediatas || "",
    },

    marcadores: {
      possuiViolencia: !!processo.possuiViolencia,
      possuiLesao: !!processo.possuiLesao,
      possuiDanoPatrimonial: !!processo.possuiDanoPatrimonial,
      possuiSubstanciaIlicita: !!processo.possuiSubstanciaIlicita,
      possuiArmaOuObjetoPerigoso: !!processo.possuiArmaOuObjetoPerigoso,
      exigeEncaminhamentoExterno: !!processo.exigeEncaminhamentoExterno,
      orgaoEncaminhamento: processo.orgaoEncaminhamento || "",
    },

    prazoAcompanhamentoAte: processo.prazoAcompanhamentoAte || null,

    documentos: Array.isArray(processo.documentos)
      ? processo.documentos.map((d) => ({
          tipo: d.tipo || "",
          titulo: d.titulo || "",
          categoria: d.categoria || "",
          caminhoLocal: d.caminhoLocal || d.caminho || "",
          hash: d.hash || "",
          geradoEm: d.geradoEm || new Date(),
        }))
      : [],

    hashDossieAtual:
  Array.isArray(processo.documentos)
    ? [...processo.documentos]
        .reverse()
        .find((d) => d.tipo === "dossie_pdf" || d.categoria === "dossie_final")
        ?.hash || ""
    : "",

validacaoPublicaUrl:
  Array.isArray(processo.documentos)
    ? (() => {
        const dossie = [...processo.documentos]
          .reverse()
          .find((d) => d.tipo === "dossie_pdf" || d.categoria === "dossie_final");

        return dossie?.hash
          ? `/verificar-livro-digital.html?hash=${dossie.hash}`
          : "";
      })()
    : "",
  };
}

async function registrarProcessoNoLivro(processo, req = null) {
  if (!processo?._id) return null;

  const tenant = obterTenantDoProcessoOuReq(processo, req);
  const usuario = getUsuarioInfo(req);

  let registro = await LivroOcorrencia.findOne({
    tenant,
    processo: processo._id,
  });

  if (registro) {
    return registro;
  }

  const numeracao = await gerarNumeroLivro(tenant);
  const dados = montarDadosDoProcesso(processo);

  registro = await LivroOcorrencia.create({
    tenant,
    ...numeracao,
    ...dados,
    status: "registrado",
    criadoPor: usuario.id,
    criadoPorNome: usuario.nome,
    atualizadoPor: usuario.id,
    atualizadoPorNome: usuario.nome,
    movimentacoes: [
      {
        tipo: "criacao",
        titulo: "Registro criado no Livro Digital de Ocorrências",
        descricao:
          "Procedimento administrativo disciplinar registrado em livro próprio digital, conforme fluxo institucional.",
        registradoPor: usuario.id,
        registradoPorNome: usuario.nome,
      },
    ],
  });

  return registro;
}

async function atualizarLivroPorProcesso(processo, req = null, movimentacao = {}) {
  if (!processo?._id) return null;

  const tenant = obterTenantDoProcessoOuReq(processo, req);
  const usuario = getUsuarioInfo(req);

  let registro = await LivroOcorrencia.findOne({
    tenant,
    processo: processo._id,
  });

  if (!registro) {
    registro = await registrarProcessoNoLivro(processo, req);
  }

  if (!registro) return null;

  const dados = montarDadosDoProcesso(processo);

  Object.assign(registro, {
    ...dados,
    atualizadoPor: usuario.id,
    atualizadoPorNome: usuario.nome,
  });

  if (movimentacao?.titulo || movimentacao?.descricao || movimentacao?.tipo) {
    registro.movimentacoes.push({
      tipo: movimentacao.tipo || "outro",
      titulo: movimentacao.titulo || "Movimentação registrada",
      descricao: movimentacao.descricao || "",
      documentoTipo: movimentacao.documentoTipo || "",
      orgaoDestino: movimentacao.orgaoDestino || "",
      protocolo: movimentacao.protocolo || "",
      registradoPor: usuario.id,
      registradoPorNome: usuario.nome,
    });
  }

  await registro.save();
  return registro;
}

async function registrarDocumentoNoLivro(processo, documento, req = null) {
  return atualizarLivroPorProcesso(processo, req, {
    tipo: "documento",
    titulo: "Documento anexado ao Livro Digital",
    descricao: `Documento gerado: ${documento?.titulo || documento?.tipo || "documento institucional"}.`,
    documentoTipo: documento?.tipo || "",
  });
}

async function registrarArquivamentoNoLivro(processo, req = null) {
  const registro = await atualizarLivroPorProcesso(processo, req, {
    tipo: "arquivamento",
    titulo: "Procedimento arquivado",
    descricao:
      processo.motivoArquivamento ||
      processo.parecerFinal ||
      "Procedimento administrativo disciplinar arquivado.",
  });

  if (registro) {
    registro.status = "arquivado";
    await registro.save();
  }

  return registro;
}

async function registrarEncaminhamentoNoLivro(processo, orgaoDestino, req = null, protocolo = "") {
  const registro = await atualizarLivroPorProcesso(processo, req, {
    tipo: "encaminhamento",
    titulo: "Procedimento encaminhado a órgão externo",
    descricao: `Procedimento encaminhado para: ${orgaoDestino || "órgão externo"}.`,
    orgaoDestino: orgaoDestino || "outro",
    protocolo,
  });

  if (registro) {
    registro.status = "encaminhado";
    await registro.save();
  }

  return registro;
}

async function registrarCancelamentoNoLivro(processo, req = null, motivo = "") {
  const registro = await atualizarLivroPorProcesso(processo, req, {
    tipo: "cancelamento",
    titulo: "Procedimento cancelado",
    descricao: motivo || "Procedimento administrativo disciplinar cancelado.",
  });

  if (registro) {
    registro.status = "cancelado";
    await registro.save();
  }

  return registro;
}

module.exports = {
  registrarProcessoNoLivro,
  atualizarLivroPorProcesso,
  registrarDocumentoNoLivro,
  registrarArquivamentoNoLivro,
  registrarEncaminhamentoNoLivro,
  registrarCancelamentoNoLivro,
};