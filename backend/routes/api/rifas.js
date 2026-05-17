const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const CampanhaRifa = require("../../models/CampanhaRifa");
const RifaNumero = require("../../models/RifaNumero");
const Aluno = require("../../models/Aluno");

const { requireTenant } = require("../../middleware/tenantScope");

// 🔽 ORDEM PERSONALIZADA DAS TURMAS (IMPORTANTE)
const ordemTurmasRifa = [
  "6ºA", "6ºB", "6ºC", "6ºD",
  "7ºA", "7ºB", "7ºC", "7ºD",
  "8ºA", "8ºB", "8ºC", "8ºD",
  "9ºA", "9ºB", "9ºC", "9ºD",

  "1ºA", "1ºB", "1ºC", "1ºD",
  "2ºA", "2ºB", "2ºC", "2ºD",
  "3ºA", "3ºB", "3ºC", "3ºD",
];

function normalizarTurmaRifa(turma) {
  return String(turma || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/[ª°º]/g, "º")
    .replace("ANO", "")
    .replace("SERIE", "");
}

function indiceTurmaRifaBackend(turma) {
  const t = normalizarTurmaRifa(turma);
  const i = ordemTurmasRifa.findIndex(x => normalizarTurmaRifa(x) === t);
  return i >= 0 ? i : 999;
}

function getUsuarioReq(req) {
  return req.usuario || req.user || {};
}

function getUserId(req) {
  const u = getUsuarioReq(req);
  return u._id || u.id || null;
}

function getInstituicaoId(req) {
  const u = getUsuarioReq(req);

  return (
    req.instituicao?._id ||
    req.instituicaoId ||
    u.instituicao ||
    u.instituicaoId ||
    null
  );
}

function requireAdminRifas(req, res, next) {
  const u = getUsuarioReq(req);

  const perfil = String(
    u.perfil ||
    u.tipo ||
    u.role ||
    u.cargo ||
    ""
  ).toLowerCase();

  const permitido =
    perfil.includes("admin") ||
    perfil.includes("master") ||
    perfil.includes("superadmin") ||
    perfil.includes("financeiro");

  if (!permitido) {
    return res.status(403).json({
      erro: "Acesso negado. Módulo de rifas restrito à administração.",
      perfilDetectado: perfil || "não identificado",
    });
  }

  next();
}

function formatNumero(numero, largura = 4) {
  return String(numero).padStart(largura, "0");
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizarStatusCampanha(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return null;
  if (["ativa", "encerrada", "cancelada", "arquivada"].includes(s)) return s;
  return null;
}

function formatarDataHoraBR(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("pt-BR", {
      timeZone: "America/Rio_Branco",
    });
  } catch {
    return "";
  }
}

/**
 * GET /api/rifas/turmas-alunos
 * Lista turmas disponíveis para seleção no módulo de rifas
 */
router.get(
  "/turmas-alunos",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      if (!instituicao) {
        return res.status(400).json({ erro: "Instituição não identificada." });
      }

      const turmas = await Aluno.distinct("turma", {
        instituicao,
        ativo: { $ne: false },
        turma: { $nin: [null, ""] },
      });

      return res.json({
        ok: true,
        turmas: turmas.filter(Boolean).sort(),
      });
    } catch (error) {
      console.error("[RIFAS][TURMAS_ALUNOS]", error);
      return res.status(500).json({
        erro: "Erro ao listar turmas dos alunos.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * GET /api/rifas/alunos-por-turma?turma=...
 * Lista alunos de uma turma para distribuir rifas sem digitar nome manualmente
 */
router.get(
  "/alunos-por-turma",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const turma = String(req.query.turma || "").trim();

      if (!instituicao) {
        return res.status(400).json({ erro: "Instituição não identificada." });
      }

      if (!turma) {
        return res.status(400).json({ erro: "Informe a turma." });
      }

      const alunos = await Aluno.find({
        instituicao,
        turma,
        ativo: { $ne: false },
      })
        .select("_id nome turma codigo codigoAcesso matricula")
        .sort({ nome: 1 })
        .lean();

      return res.json({
        ok: true,
        alunos,
      });
    } catch (error) {
      console.error("[RIFAS][ALUNOS_POR_TURMA]", error);
      return res.status(500).json({
        erro: "Erro ao listar alunos da turma.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * POST /api/rifas/campanhas
 * Cria uma campanha de rifa
 */
router.post(
  "/campanhas",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      if (!instituicao) {
        return res.status(400).json({ erro: "Instituição não identificada." });
      }

      const {
        nome,
        descricao,
        numeroInicial,
        numeroFinal,
        valorUnitario,
        chavePix,
        responsavelFinanceiro,
        dataInicio,
        dataFim,
      } = req.body;

      if (!nome || !numeroInicial || !numeroFinal) {
        return res.status(400).json({
          erro: "Informe nome, número inicial e número final da campanha.",
        });
      }

      const inicial = Number(numeroInicial);
      const final = Number(numeroFinal);

      if (!Number.isInteger(inicial) || !Number.isInteger(final)) {
        return res.status(400).json({
          erro: "Número inicial e final precisam ser números inteiros.",
        });
      }

      if (final < inicial) {
        return res.status(400).json({
          erro: "O número final não pode ser menor que o número inicial.",
        });
      }

      const campanha = await CampanhaRifa.create({
        instituicao,
        nome: String(nome || "").trim(),
        descricao: descricao || "",
        numeroInicial: inicial,
        numeroFinal: final,
        quantidadeTotal: final - inicial + 1,
        valorUnitario: Number(valorUnitario || 0),
        chavePix: chavePix || "",
        responsavelFinanceiro: responsavelFinanceiro || "",
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        criadoPor: getUserId(req),
      });

      return res.status(201).json({
        ok: true,
        campanha,
      });
    } catch (error) {
      console.error("[RIFAS][CRIAR_CAMPANHA]", error);
      return res.status(500).json({
        erro: "Erro ao criar campanha de rifa.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * GET /api/rifas/campanhas
 * Lista campanhas
 */
router.get(
  "/campanhas",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const campanhas = await CampanhaRifa.find({ instituicao })
        .sort({ createdAt: -1 })
        .lean();

      return res.json({
        ok: true,
        campanhas,
      });
    } catch (error) {
      console.error("[RIFAS][LISTAR_CAMPANHAS]", error);
      return res.status(500).json({
        erro: "Erro ao listar campanhas de rifa.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * PATCH /api/rifas/campanhas/:campanhaId
 * Edita dados básicos da campanha com trava de segurança financeira
 */
router.patch(
  "/campanhas/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const {
        nome,
        descricao,
        valorUnitario,
        chavePix,
        responsavelFinanceiro,
        dataInicio,
        dataFim,
        status,
        motivoCancelamento,
      } = req.body;

      const possuiPagamentos = await RifaNumero.exists({
        instituicao,
        campanha: campanha._id,
        status: "paga",
      });

      const possuiNumeros = await RifaNumero.exists({
        instituicao,
        campanha: campanha._id,
      });

      if (nome !== undefined) {
        const nomeLimpo = String(nome || "").trim();
        if (!nomeLimpo) {
          return res.status(400).json({ erro: "O nome da campanha é obrigatório." });
        }
        campanha.nome = nomeLimpo;
      }

      if (descricao !== undefined) campanha.descricao = String(descricao || "").trim();
      if (chavePix !== undefined) campanha.chavePix = String(chavePix || "").trim();

      if (responsavelFinanceiro !== undefined) {
        campanha.responsavelFinanceiro = String(responsavelFinanceiro || "").trim();
      }

      if (dataInicio !== undefined) campanha.dataInicio = dataInicio || null;
      if (dataFim !== undefined) campanha.dataFim = dataFim || null;

      if (valorUnitario !== undefined) {
        const novoValor = Number(valorUnitario || 0);

        if (!Number.isFinite(novoValor) || novoValor < 0) {
          return res.status(400).json({ erro: "Valor unitário inválido." });
        }

        if (possuiPagamentos && Number(campanha.valorUnitario) !== novoValor) {
          return res.status(400).json({
            erro:
              "Não é permitido alterar o valor unitário após existir pagamento confirmado. Para correção pontual, use edição manual dos números.",
          });
        }

        campanha.valorUnitario = novoValor;

        if (possuiNumeros && !possuiPagamentos) {
          await RifaNumero.updateMany(
            {
              instituicao,
              campanha: campanha._id,
              status: { $in: ["disponivel", "distribuida", "vendida"] },
            },
            {
              $set: {
                valor: novoValor,
                atualizadoPor: getUserId(req),
              },
            }
          );
        }
      }

      if (status !== undefined) {
        const novoStatus = normalizarStatusCampanha(status);

        if (!novoStatus) {
          return res.status(400).json({ erro: "Status de campanha inválido." });
        }

        campanha.status = novoStatus;

        if (novoStatus === "encerrada" && !campanha.encerradaEm) {
          campanha.encerradaEm = new Date();
        }

        if (novoStatus === "cancelada") {
          campanha.canceladaEm = campanha.canceladaEm || new Date();
          campanha.motivoCancelamento =
            String(motivoCancelamento || campanha.motivoCancelamento || "").trim();
        }

        if (novoStatus === "arquivada" && !campanha.arquivadaEm) {
          campanha.arquivadaEm = new Date();
        }
      }

      campanha.atualizadoPor = getUserId(req);
      await campanha.save();

      return res.json({
        ok: true,
        mensagem: "Campanha atualizada com sucesso.",
        campanha,
      });
    } catch (error) {
      console.error("[RIFAS][EDITAR_CAMPANHA]", error);
      return res.status(500).json({
        erro: "Erro ao editar campanha.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * DELETE /api/rifas/campanhas/:campanhaId
 * Exclui campanha somente quando não existe movimentação
 */
router.delete(
  "/campanhas/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const movimentados = await RifaNumero.countDocuments({
        instituicao,
        campanha: campanha._id,
        status: { $ne: "disponivel" },
      });

      if (movimentados > 0) {
        return res.status(400).json({
          erro:
            "Esta campanha já possui números distribuídos, vendidos, pagos ou devolvidos. Por segurança, ela não pode ser excluída. Use cancelar ou arquivar.",
          movimentados,
        });
      }

      await RifaNumero.deleteMany({
        instituicao,
        campanha: campanha._id,
      });

      await CampanhaRifa.deleteOne({
        _id: campanha._id,
        instituicao,
      });

      return res.json({
        ok: true,
        mensagem: "Campanha excluída com sucesso.",
      });
    } catch (error) {
      console.error("[RIFAS][EXCLUIR_CAMPANHA]", error);
      return res.status(500).json({
        erro: "Erro ao excluir campanha.",
        detalhe: error.message,
      });
    }
  }
);/**
 * POST /api/rifas/gerar-numeros
 * Gera os números da campanha
 */
router.post(
  "/gerar-numeros",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.body;

      if (!campanhaId) {
        return res.status(400).json({ erro: "Informe a campanha." });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const existentes = await RifaNumero.countDocuments({
        instituicao,
        campanha: campanha._id,
      });

      if (existentes > 0) {
        return res.status(400).json({
          erro: "Os números dessa campanha já foram gerados.",
        });
      }

      const largura = String(campanha.numeroFinal).length;
      const lote = [];

      for (let n = campanha.numeroInicial; n <= campanha.numeroFinal; n++) {
        lote.push({
          instituicao,
          campanha: campanha._id,
          numero: formatNumero(n, largura),
          numeroValor: n,
          status: "disponivel",
          valor: campanha.valorUnitario || 0,
          criadoPor: getUserId(req),
        });
      }

      await RifaNumero.insertMany(lote, { ordered: false });

      return res.status(201).json({
        ok: true,
        mensagem: "Números gerados com sucesso.",
        totalGerado: lote.length,
      });
    } catch (error) {
      console.error("[RIFAS][GERAR_NUMEROS]", error);
      return res.status(500).json({
        erro: "Erro ao gerar números da campanha.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * GET /api/rifas/dashboard/:campanhaId
 */
router.get(
  "/dashboard/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      }).lean();

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const resumoStatus = await RifaNumero.aggregate([
        {
          $match: {
            instituicao: campanha.instituicao,
            campanha: campanha._id,
          },
        },
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 },
            valorTotal: { $sum: "$valor" },
            valorPago: { $sum: "$valorPago" },
          },
        },
      ]);

      const totais = {
        total: campanha.quantidadeTotal || 0,
        disponivel: 0,
        distribuida: 0,
        vendida: 0,
        paga: 0,
        devolvida: 0,
        arrecadado: 0,
        pendente: 0,
      };

      resumoStatus.forEach((item) => {
        totais[item._id] = item.total;
        totais.arrecadado += item.valorPago || 0;
      });

      const valorEsperadoVendido = await RifaNumero.aggregate([
        {
          $match: {
            instituicao: campanha.instituicao,
            campanha: campanha._id,
            status: { $in: ["vendida", "paga"] },
          },
        },
        {
          $group: {
            _id: null,
            valor: { $sum: "$valor" },
            pago: { $sum: "$valorPago" },
          },
        },
      ]);

      const esperado = valorEsperadoVendido[0]?.valor || 0;
      const pago = valorEsperadoVendido[0]?.pago || 0;
      totais.pendente = Math.max(esperado - pago, 0);

      return res.json({
        ok: true,
        campanha,
        totais,
      });
    } catch (error) {
      console.error("[RIFAS][DASHBOARD]", error);
      return res.status(500).json({
        erro: "Erro ao carregar dashboard da campanha.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * POST /api/rifas/distribuir-bloco
 */
router.post(
  "/distribuir-bloco",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        numeroInicial,
        numeroFinal,
        responsavelTipo,
        responsavelId,
        responsavelNome,
        turmaOuSetor,
        observacao,
      } = req.body;

      if (!campanhaId || !numeroInicial || !numeroFinal || !responsavelNome) {
        return res.status(400).json({
          erro: "Informe campanha, bloco inicial/final e responsável.",
        });
      }

      const inicial = Number(numeroInicial);
      const final = Number(numeroFinal);

      if (!Number.isInteger(inicial) || !Number.isInteger(final)) {
        return res.status(400).json({
          erro: "Número inicial e final precisam ser números inteiros.",
        });
      }

      if (final < inicial) {
        return res.status(400).json({
          erro: "O número final do bloco não pode ser menor que o inicial.",
        });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const numeros = await RifaNumero.find({
        instituicao,
        campanha: campanha._id,
        numeroValor: { $gte: inicial, $lte: final },
      });

      const esperado = final - inicial + 1;

      if (numeros.length !== esperado) {
        return res.status(400).json({
          erro: "Nem todos os números do bloco existem na campanha.",
        });
      }

      const indisponiveis = numeros.filter((n) => n.status !== "disponivel");

      if (indisponiveis.length > 0) {
        return res.status(400).json({
          erro: "Existem números nesse bloco que já foram distribuídos ou movimentados.",
          numerosIndisponiveis: indisponiveis.map((n) => n.numero),
        });
      }

      await RifaNumero.updateMany(
        {
          instituicao,
          campanha: campanha._id,
          numeroValor: { $gte: inicial, $lte: final },
          status: "disponivel",
        },
        {
          $set: {
            status: "distribuida",
            responsavelTipo: responsavelTipo || (responsavelId ? "aluno" : "outro"),
            responsavelId: responsavelId || null,
            responsavelNome,
            turmaOuSetor: turmaOuSetor || "",
            observacao: observacao || "",
            dataDistribuicao: new Date(),
            atualizadoPor: getUserId(req),
          },
        }
      );

      return res.json({
        ok: true,
        mensagem: "Bloco distribuído com sucesso.",
        totalDistribuido: esperado,
      });
    } catch (error) {
      console.error("[RIFAS][DISTRIBUIR_BLOCO]", error);
      return res.status(500).json({
        erro: "Erro ao distribuir bloco de rifas.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * POST /api/rifas/prestacao
 */
router.post(
  "/prestacao",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        numeros,
        status,
        formaPagamento,
        valorPago,
        comprovanteUrl,
        observacao,
      } = req.body;

      if (!campanhaId || !Array.isArray(numeros) || numeros.length === 0) {
        return res.status(400).json({
          erro: "Informe a campanha e os números da prestação.",
        });
      }

      if (!["vendida", "paga", "devolvida"].includes(status)) {
        return res.status(400).json({
          erro: "Status inválido para prestação.",
        });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const agora = new Date();

      const set = {
        status,
        observacao: observacao || "",
        atualizadoPor: getUserId(req),
      };

      if (status === "vendida") {
        set.dataVenda = agora;
      }

      if (status === "paga") {
        set.dataVenda = agora;
        set.dataPagamento = agora;
        set.formaPagamento = formaPagamento || "";
        set.valorPago = Number(valorPago || campanha.valorUnitario || 0);
        set.comprovanteUrl = comprovanteUrl || "";
      }

      if (status === "devolvida") {
        set.responsavelTipo = "";
        set.responsavelId = null;
        set.responsavelNome = "";
        set.turmaOuSetor = "";
        set.formaPagamento = "";
        set.valorPago = 0;
        set.comprovanteUrl = "";
      }

      const resultado = await RifaNumero.updateMany(
        {
          instituicao,
          campanha: campanha._id,
          numero: { $in: numeros.map(String) },
        },
        {
          $set: set,
        }
      );

      return res.json({
        ok: true,
        mensagem: "Prestação registrada com sucesso.",
        modificados: resultado.modifiedCount || resultado.nModified || 0,
      });
    } catch (error) {
      console.error("[RIFAS][PRESTACAO]", error);
      return res.status(500).json({
        erro: "Erro ao registrar prestação de contas.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * PATCH /api/rifas/editar-responsavel
 * Corrige responsável, aluno vinculado, turma/setor ou observação de um intervalo
 */
router.patch(
  "/editar-responsavel",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        numeroInicial,
        numeroFinal,
        novoResponsavelNome,
        novoResponsavelId,
        novaTurmaOuSetor,
        novaObservacao,
        novoResponsavelTipo,
      } = req.body;

      if (!campanhaId || !numeroInicial || !numeroFinal) {
        return res.status(400).json({
          erro: "Informe campanha e intervalo de números.",
        });
      }

      const inicial = Number(numeroInicial);
      const final = Number(numeroFinal);

      if (!Number.isInteger(inicial) || !Number.isInteger(final)) {
        return res.status(400).json({
          erro: "Número inicial e final precisam ser números inteiros.",
        });
      }

      if (final < inicial) {
        return res.status(400).json({
          erro: "Intervalo inválido.",
        });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const filtro = {
        instituicao,
        campanha: campanha._id,
        numeroValor: { $gte: inicial, $lte: final },
      };

      const numeros = await RifaNumero.find(filtro).lean();

      if (!numeros.length) {
        return res.status(404).json({
          erro: "Nenhum número encontrado nesse intervalo.",
        });
      }

      const tipoSeguro = ["aluno", "professor", "servidor", "externo", "outro", ""].includes(
        novoResponsavelTipo
      )
        ? novoResponsavelTipo
        : novoResponsavelId
          ? "aluno"
          : "outro";

      await RifaNumero.updateMany(filtro, {
        $set: {
          responsavelNome: novoResponsavelNome || "",
          responsavelId: novoResponsavelId || null,
          responsavelTipo: tipoSeguro,
          turmaOuSetor: novaTurmaOuSetor || "",
          observacao: novaObservacao || "",
          atualizadoPor: getUserId(req),
        },
      });

      return res.json({
        ok: true,
        mensagem: "Responsável/bloco atualizado com sucesso.",
        totalAtualizado: numeros.length,
      });
    } catch (error) {
      console.error("[RIFAS][EDITAR_RESPONSAVEL]", error);
      return res.status(500).json({
        erro: "Erro ao editar responsável da rifa.",
        detalhe: error.message,
      });
    }
  }
);

/**
 * PATCH /api/rifas/editar-pagamento
 * Corrige pagamento/status de um intervalo ou lista de números
 */
router.patch(
  "/editar-pagamento",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        numeros,
        numeroInicial,
        numeroFinal,
        status,
        formaPagamento,
        valorPago,
        comprovanteUrl,
        observacao,
      } = req.body;

      if (!campanhaId) {
        return res.status(400).json({ erro: "Informe a campanha." });
      }

      if (
        !["disponivel", "distribuida", "vendida", "paga", "devolvida"].includes(
          status
        )
      ) {
        return res.status(400).json({ erro: "Status inválido." });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      let filtro = {
        instituicao,
        campanha: campanha._id,
      };

      if (Array.isArray(numeros) && numeros.length > 0) {
        filtro.numero = { $in: numeros.map(String) };
      } else {
        const inicial = toNumberOrNull(numeroInicial);
        const final = toNumberOrNull(numeroFinal);

        if (!inicial || !final) {
          return res.status(400).json({
            erro: "Informe números ou intervalo inicial/final.",
          });
        }

        if (final < inicial) {
          return res.status(400).json({
            erro: "Intervalo inválido.",
          });
        }

        filtro.numeroValor = { $gte: inicial, $lte: final };
      }

      const set = {
        status,
        observacao: observacao || "",
        atualizadoPor: getUserId(req),
      };

      const agora = new Date();

      if (status === "vendida") {
        set.dataVenda = agora;
        set.dataPagamento = null;
        set.formaPagamento = "";
        set.valorPago = 0;
        set.comprovanteUrl = "";
      }

      if (status === "paga") {
        set.dataVenda = agora;
        set.dataPagamento = agora;
        set.formaPagamento = formaPagamento || "";
        set.valorPago = Number(valorPago || campanha.valorUnitario || 0);
        set.comprovanteUrl = comprovanteUrl || "";
      }

      if (status === "distribuida") {
        set.dataVenda = null;
        set.dataPagamento = null;
        set.formaPagamento = "";
        set.valorPago = 0;
        set.comprovanteUrl = "";
      }

      if (status === "disponivel") {
        set.responsavelTipo = "";
        set.responsavelId = null;
        set.responsavelNome = "";
        set.turmaOuSetor = "";
        set.formaPagamento = "";
        set.valorPago = 0;
        set.comprovanteUrl = "";
        set.dataDistribuicao = null;
        set.dataVenda = null;
        set.dataPagamento = null;
      }

      if (status === "devolvida") {
        set.responsavelTipo = "";
        set.responsavelId = null;
        set.responsavelNome = "";
        set.turmaOuSetor = "";
        set.formaPagamento = "";
        set.valorPago = 0;
        set.comprovanteUrl = "";
        set.dataVenda = null;
        set.dataPagamento = null;
      }

      const resultado = await RifaNumero.updateMany(filtro, { $set: set });

      return res.json({
        ok: true,
        mensagem: "Pagamento/status atualizado com sucesso.",
        modificados: resultado.modifiedCount || resultado.nModified || 0,
      });
    } catch (error) {
      console.error("[RIFAS][EDITAR_PAGAMENTO]", error);
      return res.status(500).json({
        erro: "Erro ao editar pagamento/status da rifa.",
        detalhe: error.message,
      });
    }
  }
);/**
 * GET /api/rifas/relatorio/responsaveis/:campanhaId
 * Relatório detalhado por responsável (financeiro)
 */
router.get(
  "/relatorio/responsaveis/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const dados = await RifaNumero.aggregate([
        {
          $match: {
            instituicao,
            campanha: new mongoose.Types.ObjectId(campanhaId),
            responsavelNome: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
              tipo: "$responsavelTipo",
            },
            entregues: { $sum: 1 },
            vendidas: {
              $sum: {
                $cond: [{ $in: ["$status", ["vendida", "paga"]] }, 1, 0],
              },
            },
            pagas: {
              $sum: {
                $cond: [{ $eq: ["$status", "paga"] }, 1, 0],
              },
            },
            valorTotal: { $sum: "$valor" },
            valorPago: { $sum: "$valorPago" },
            menorNumero: { $min: "$numeroValor" },
            maiorNumero: { $max: "$numeroValor" },
          },
        },
        {
          $project: {
            _id: 0,
            responsavelNome: "$_id.nome",
            turmaOuSetor: "$_id.turma",
            responsavelTipo: "$_id.tipo",
            bloco: {
              $concat: [
                { $toString: "$menorNumero" },
                " a ",
                { $toString: "$maiorNumero" },
              ],
            },
            entregues: 1,
            vendidas: 1,
            pagas: 1,
            valorTotal: 1,
            valorPago: 1,
            pendente: {
              $max: [{ $subtract: ["$valorTotal", "$valorPago"] }, 0],
            },
          },
        },
        { $sort: { vendidas: -1, valorPago: -1 } },
      ]);

      res.json({ ok: true, dados });
    } catch (err) {
      console.error("[RIFAS][RELATORIO]", err);
      res.status(500).json({ erro: "Erro ao gerar relatório." });
    }
  }
);

/**
 * GET /api/rifas/lista-assinatura/:campanhaId
 * Lista para impressão com assinatura
 */
router.get(
  "/lista-assinatura/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const dados = await RifaNumero.aggregate([
        {
          $match: {
            instituicao,
            campanha: new mongoose.Types.ObjectId(campanhaId),
            responsavelNome: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
              tipo: "$responsavelTipo",
            },
            menorNumero: { $min: "$numeroValor" },
            maiorNumero: { $max: "$numeroValor" },
            total: { $sum: 1 },
            dataDistribuicao: { $min: "$dataDistribuicao" },
          },
        },
        {
          $project: {
            _id: 0,
            nome: "$_id.nome",
            turma: "$_id.turma",
            tipo: "$_id.tipo",
            bloco: {
              $concat: [
                { $toString: "$menorNumero" },
                " a ",
                { $toString: "$maiorNumero" },
              ],
            },
            quantidade: "$total",
            data: "$dataDistribuicao",
          },
        },
        { $sort: { turma: 1, nome: 1 } },
      ]);

      // Monta estrutura pronta para impressão
      const lista = dados
  .sort((a, b) => {
    const turmaA = indiceTurmaRifaBackend(a.turma);
    const turmaB = indiceTurmaRifaBackend(b.turma);

    if (turmaA !== turmaB) return turmaA - turmaB;

    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
      sensitivity: "base",
    });
  })
  .map((d, i) => ({
        ordem: i + 1,
        nome: d.nome,
        tipo: d.tipo,
        turma: d.turma,
        bloco: d.bloco,
        quantidade: d.quantidade,
        data: formatarDataHoraBR(d.data),
        assinatura: "__________________________",
      }));

      res.json({ ok: true, lista });
    } catch (err) {
      console.error("[RIFAS][ASSINATURA]", err);
      res.status(500).json({ erro: "Erro ao gerar lista de assinatura." });
    }
  }
);/**
 * GET /api/rifas/numeros/:campanhaId
 */
router.get(
  "/numeros/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const { status, responsavel, turma, limite = 300 } = req.query;

      const filtro = {
        instituicao,
        campanha: campanhaId,
      };

      if (status) filtro.status = status;
      if (responsavel) filtro.responsavelNome = new RegExp(responsavel, "i");
      if (turma) filtro.turmaOuSetor = new RegExp(turma, "i");

      const numeros = await RifaNumero.find(filtro)
        .sort({ numeroValor: 1 })
        .limit(Number(limite))
        .lean();

      res.json({ ok: true, numeros });
    } catch (err) {
      console.error("[RIFAS][NUMEROS]", err);
      res.status(500).json({ erro: "Erro ao listar números." });
    }
  }
);

/**
 * GET /api/rifas/responsaveis/:campanhaId
 */
/**
 * GET /api/rifas/responsaveis/:campanhaId
 */
router.get(
  "/responsaveis/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      }).lean();

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const dados = await RifaNumero.aggregate([
        {
          $match: {
            instituicao: campanha.instituicao,
            campanha: campanha._id,
            responsavelNome: { $exists: true, $nin: [null, ""] },
            status: { $in: ["distribuida", "vendida", "paga", "devolvida"] },
          },
        },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
              tipo: "$responsavelTipo",
              responsavelId: "$responsavelId",
            },
            menorNumero: { $min: "$numeroValor" },
            maiorNumero: { $max: "$numeroValor" },
            entregues: { $sum: 1 },
            vendidas: {
              $sum: {
                $cond: [{ $in: ["$status", ["vendida", "paga"]] }, 1, 0],
              },
            },
            pagas: {
              $sum: {
                $cond: [{ $eq: ["$status", "paga"] }, 1, 0],
              },
            },
            valorTotal: { $sum: { $ifNull: ["$valor", 0] } },
            valorPago: { $sum: { $ifNull: ["$valorPago", 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            responsavelNome: "$_id.nome",
            turmaOuSetor: "$_id.turma",
            responsavelTipo: "$_id.tipo",
            responsavelId: "$_id.responsavelId",
            menorNumero: 1,
            maiorNumero: 1,
            entregues: 1,
            vendidas: 1,
            pagas: 1,
            valorTotal: 1,
            valorPago: 1,
            pendente: {
              $max: [{ $subtract: ["$valorTotal", "$valorPago"] }, 0],
            },
          },
        },
        { $sort: { turmaOuSetor: 1, responsavelNome: 1 } },
      ]);

      return res.json({ ok: true, responsaveis: dados });
    } catch (err) {
      console.error("[RIFAS][RESPONSAVEIS]", err);
      return res.status(500).json({
        erro: "Erro ao listar responsáveis.",
        detalhe: err.message,
      });
    }
  }
);

/**
 * GET /api/rifas/inadimplencia/:campanhaId
 */
router.get(
  "/inadimplencia/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const dados = await RifaNumero.aggregate([
        {
          $match: {
            instituicao,
            campanha: new mongoose.Types.ObjectId(campanhaId),
            responsavelNome: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
            },
            vendidas: {
              $sum: {
                $cond: [{ $in: ["$status", ["vendida", "paga"]] }, 1, 0],
              },
            },
            valorEsperado: { $sum: "$valor" },
            valorPago: { $sum: "$valorPago" },
            ultimaMovimentacao: { $max: "$updatedAt" },
          },
        },
        {
          $project: {
            _id: 0,
            responsavelNome: "$_id.nome",
            turmaOuSetor: "$_id.turma",
            vendidas: 1,
            valorEsperado: 1,
            valorPago: 1,
            pendente: {
              $max: [{ $subtract: ["$valorEsperado", "$valorPago"] }, 0],
            },
            diasSemMovimento: {
              $divide: [
                { $subtract: [new Date(), "$ultimaMovimentacao"] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
      ]);

      res.json({ ok: true, dados });
    } catch (err) {
      console.error("[RIFAS][INADIMPLENCIA]", err);
      res.status(500).json({ erro: "Erro na inadimplência." });
    }
  }
);

/**
 * GET /api/rifas/ranking/:campanhaId
 */
router.get(
  "/ranking/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;

      const top = await RifaNumero.aggregate([
        {
          $match: {
            instituicao,
            campanha: new mongoose.Types.ObjectId(campanhaId),
            responsavelNome: { $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
            },
            vendidas: {
              $sum: {
                $cond: [{ $in: ["$status", ["vendida", "paga"]] }, 1, 0],
              },
            },
            valorPago: { $sum: "$valorPago" },
          },
        },
        { $sort: { vendidas: -1, valorPago: -1 } },
        { $limit: 10 },
      ]);

      res.json({ ok: true, top });
    } catch (err) {
      console.error("[RIFAS][RANKING]", err);
      res.status(500).json({ erro: "Erro no ranking." });
    }
  }
);
/**
 * POST /api/rifas/distribuir-blocos-lote
 * Distribuição automática em lote (alta performance)
 */
router.post(
  "/distribuir-blocos-lote",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        blocos // [{inicio, fim, alunoId, nome, turma}]
      } = req.body;

      if (!campanhaId || !Array.isArray(blocos) || !blocos.length) {
        return res.status(400).json({
          erro: "Informe campanha e blocos para distribuição.",
        });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      // 🔥 verifica conflitos antes de tudo
      // 🔥 cria lista de todos intervalos
const filtros = blocos.map(b => ({
  numeroValor: { $gte: b.inicio, $lte: b.fim }
}));

// 🔥 busca conflitos em UMA consulta
const conflitos = await RifaNumero.find({
  instituicao,
  campanha: campanha._id,
  status: { $ne: "disponivel" },
  $or: filtros
})
  .select("numero numeroValor")
  .limit(1)
  .lean();

if (conflitos.length > 0) {
  return res.status(400).json({
    erro: "Existem números já utilizados dentro dos blocos.",
    numero: conflitos[0].numero,
  });
}

      // 🚀 montagem em lote
      const ops = [];

      for (const b of blocos) {
        ops.push({
          updateMany: {
            filter: {
              instituicao,
              campanha: campanha._id,
              numeroValor: { $gte: b.inicio, $lte: b.fim },
              status: "disponivel",
            },
            update: {
              $set: {
                status: "distribuida",
                responsavelTipo: "aluno",
                responsavelId: b.alunoId || null,
                responsavelNome: b.nome,
                turmaOuSetor: b.turma || "",
                observacao: "Distribuição automática em lote",
                dataDistribuicao: new Date(),
                atualizadoPor: getUserId(req),
              },
            },
          },
        });
      }

      const resultado = await RifaNumero.bulkWrite(ops);

      return res.json({
        ok: true,
        mensagem: "Distribuição em lote concluída.",
        modificados: resultado.modifiedCount || 0,
      });
    } catch (error) {
      console.error("[RIFAS][DISTRIBUICAO_LOTE]", error);
      return res.status(500).json({
        erro: "Erro na distribuição automática em lote.",
        detalhe: error.message,
      });
    }
  }
);
module.exports = router;