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
        set.dataDistribuicao = null;
        set.dataVenda = null;
        set.dataPagamento = null;
      }

      // Converte os números informados para inteiros (numeroValor)
      const numerosValor = numeros
        .map(n => Number(n))
        .filter(n => Number.isInteger(n) && n > 0);

      if (numerosValor.length === 0) {
        return res.status(400).json({
          erro: "Nenhum número válido informado. Informe apenas valores inteiros positivos.",
        });
      }

      // Guard: verificar responsável antes de alterar status financeiro
      const registrosPrestacao = await RifaNumero.find({
        instituicao,
        campanha: campanha._id,
        numeroValor: { $in: numerosValor },
      }).select("numero numeroValor status responsavelNome").lean();

      if (registrosPrestacao.length === 0) {
        return res.status(404).json({
          erro: "Nenhum número encontrado nessa campanha com os valores informados.",
          numerosInformados: numerosValor,
        });
      }

      if (status === "paga" || status === "vendida") {
        const semResponsavel = registrosPrestacao.filter(
          r => !r.responsavelNome || r.responsavelNome.trim() === ""
        );
        if (semResponsavel.length > 0) {
          return res.status(400).json({
            erro: `Não é possível marcar como "${status}": ${semResponsavel.length} número(s) não possuem responsável. Distribua antes de registrar pagamento.`,
            numerosInvalidos: semResponsavel.map(r => r.numeroValor),
            bloqueio: "SEM_RESPONSAVEL",
          });
        }
      }

      const resultado = await RifaNumero.updateMany(
        {
          instituicao,
          campanha: campanha._id,
          numeroValor: { $in: numerosValor },
        },
        {
          $set: set,
        }
      );

      const modifiedCount = resultado.modifiedCount || resultado.nModified || 0;

      if (modifiedCount === 0) {
        return res.status(400).json({
          erro: "Nenhum registro foi atualizado. Verifique os números informados.",
          matchedCount: registrosPrestacao.length,
          modifiedCount: 0,
        });
      }

      return res.json({
        ok: true,
        mensagem: "Prestação registrada com sucesso.",
        matchedCount: registrosPrestacao.length,
        modifiedCount,
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
 * PATCH /api/rifas/baixa-bloco
 * Baixa rápida de um bloco real de rifas para o responsável selecionado.
 *
 * Segurança:
 * - valida campanha e instituição;
 * - valida se o intervalo pertence integralmente ao mesmo responsável;
 * - atualiza pelos _ids encontrados, não por intervalo aberto;
 * - impede baixa financeira de números sem responsável.
 */
router.patch(
  "/baixa-bloco",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);

      const {
        campanhaId,
        numeroInicial,
        numeroFinal,
        responsavelId,
        responsavelNome,
        turmaOuSetor,
        status = "paga",
        formaPagamento,
        valorTotalPago,
        comprovanteUrl,
        observacao,
      } = req.body;

      if (!instituicao) {
        return res.status(400).json({ erro: "Instituição não identificada." });
      }

      if (!campanhaId || !numeroInicial || !numeroFinal) {
        return res.status(400).json({
          erro: "Informe campanha, número inicial e número final do bloco.",
        });
      }

      if (!["vendida", "paga", "devolvida"].includes(status)) {
        return res.status(400).json({
          erro: "Status inválido para baixa de bloco.",
        });
      }

      const inicial = Number(numeroInicial);
      const final = Number(numeroFinal);

      if (!Number.isInteger(inicial) || !Number.isInteger(final) || inicial <= 0 || final <= 0) {
        return res.status(400).json({
          erro: "Número inicial e final precisam ser inteiros positivos.",
        });
      }

      if (final < inicial) {
        return res.status(400).json({
          erro: "O número final do bloco não pode ser menor que o inicial.",
        });
      }

      const quantidadeEsperada = final - inicial + 1;

      // Guard simples contra clique ou payload errado em intervalo grande.
      // O fluxo normal é bloco de 10, mas permite blocos maiores quando realmente distribuídos.
      if (quantidadeEsperada > 100) {
        return res.status(400).json({
          erro: "Por segurança, a baixa rápida aceita no máximo 100 números por bloco.",
          quantidadeEsperada,
        });
      }

      const campanha = await CampanhaRifa.findOne({
        _id: campanhaId,
        instituicao,
      });

      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const filtroBase = {
        instituicao,
        campanha: campanha._id,
        numeroValor: { $gte: inicial, $lte: final },
      };

      const numerosDoIntervalo = await RifaNumero.find(filtroBase)
        .select("_id numero numeroValor status valor valorPago responsavelTipo responsavelId responsavelNome turmaOuSetor")
        .sort({ numeroValor: 1 });

      if (numerosDoIntervalo.length !== quantidadeEsperada) {
        return res.status(400).json({
          erro: "Nem todos os números do bloco existem na campanha.",
          quantidadeEsperada,
          quantidadeEncontrada: numerosDoIntervalo.length,
        });
      }

      const nomeInformado = String(responsavelNome || "").trim();
      const turmaInformada = String(turmaOuSetor || "").trim();
      const responsavelIdValido =
        responsavelId && mongoose.Types.ObjectId.isValid(responsavelId)
          ? String(responsavelId)
          : "";

      if (!responsavelIdValido && !nomeInformado) {
        return res.status(400).json({
          erro: "Informe o responsável do bloco.",
        });
      }

      const numerosForaDoResponsavel = numerosDoIntervalo.filter((n) => {
        const idRegistro = n.responsavelId ? String(n.responsavelId) : "";
        const nomeRegistro = String(n.responsavelNome || "").trim();
        const turmaRegistro = String(n.turmaOuSetor || "").trim();

        if (responsavelIdValido) {
          return idRegistro !== responsavelIdValido;
        }

        if (turmaInformada) {
          return nomeRegistro !== nomeInformado || turmaRegistro !== turmaInformada;
        }

        return nomeRegistro !== nomeInformado;
      });

      if (numerosForaDoResponsavel.length > 0) {
        return res.status(400).json({
          erro:
            "O bloco informado não pertence integralmente ao responsável selecionado. A baixa foi bloqueada para evitar alterar rifas de outro aluno.",
          numerosInvalidos: numerosForaDoResponsavel.map((n) => n.numero),
          bloqueio: "BLOCO_FORA_DO_RESPONSAVEL",
        });
      }

      if (status === "paga" || status === "vendida") {
        const semResponsavel = numerosDoIntervalo.filter(
          (n) => !n.responsavelNome || String(n.responsavelNome).trim() === ""
        );

        if (semResponsavel.length > 0) {
          return res.status(400).json({
            erro: `Não é possível marcar como "${status}": existem números sem responsável. Distribua antes de registrar pagamento.`,
            numerosInvalidos: semResponsavel.map((n) => n.numero),
            bloqueio: "SEM_RESPONSAVEL",
          });
        }
      }

      const agora = new Date();
      const ids = numerosDoIntervalo.map((n) => n._id);
      const valorUnitarioCampanha = Number(campanha.valorUnitario || 0);
      const valorTotalEsperado = numerosDoIntervalo.reduce(
        (total, n) => total + Number(n.valor || valorUnitarioCampanha || 0),
        0
      );

      const totalPago =
        status === "paga"
          ? Number(valorTotalPago || valorTotalEsperado || 0)
          : 0;

      if (status === "paga" && (!Number.isFinite(totalPago) || totalPago <= 0)) {
        return res.status(400).json({
          erro: "Informe um valor total válido para baixa do bloco.",
        });
      }

      const valorPagoPorNumero =
        status === "paga" ? Number((totalPago / quantidadeEsperada).toFixed(2)) : 0;

      const set = {
        status,
        observacao: observacao || "",
        atualizadoPor: getUserId(req),
      };

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
        set.valorPago = valorPagoPorNumero;
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
        set.dataDistribuicao = null;
        set.dataVenda = null;
        set.dataPagamento = null;
      }

      const resultado = await RifaNumero.updateMany(
        {
          instituicao,
          campanha: campanha._id,
          _id: { $in: ids },
        },
        { $set: set }
      );

      const modifiedCount = resultado.modifiedCount || resultado.nModified || 0;

      return res.json({
        ok: true,
        mensagem: "Baixa do bloco registrada com sucesso.",
        bloco: {
          inicio: inicial,
          fim: final,
          quantidade: quantidadeEsperada,
        },
        responsavel: {
          responsavelId: responsavelIdValido || null,
          responsavelNome: numerosDoIntervalo[0]?.responsavelNome || nomeInformado,
          turmaOuSetor: numerosDoIntervalo[0]?.turmaOuSetor || turmaInformada,
        },
        status,
        valorTotalEsperado,
        valorTotalPago: totalPago,
        valorPagoPorNumero,
        matchedCount: numerosDoIntervalo.length,
        modifiedCount,
      });
    } catch (error) {
      console.error("[RIFAS][BAIXA_BLOCO]", error);
      return res.status(500).json({
        erro: "Erro ao registrar baixa do bloco.",
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
  numeroId,
  numeroInicial,
  numeroFinal,
  novoResponsavelNome,
  novoResponsavelId,
  novaTurmaOuSetor,
  novaObservacao,
  novoResponsavelTipo,
} = req.body;

      if (!campanhaId) {
  return res.status(400).json({
    erro: "Informe a campanha.",
  });
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

if (numeroId) {
  filtro._id = numeroId;
} else {
  if (!numeroInicial || !numeroFinal) {
    return res.status(400).json({
      erro: "Informe o número da rifa ou intervalo.",
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

  filtro.numeroValor = { $gte: inicial, $lte: final };
}

      const numeros = await RifaNumero.find(filtro).lean();

      if (!numeros.length) {
        return res.status(404).json({
          erro: "Nenhum número encontrado nesse intervalo.",
        });
      }

      // Guard: bloquear range com múltiplos responsáveis sem confirmação explícita
      if (!filtro._id && numeros.length > 1) {
        const respSet = new Set(
          numeros.map(n =>
            n.responsavelId
              ? n.responsavelId.toString()
              : (n.responsavelNome && n.responsavelNome.trim() ? n.responsavelNome.trim() : "__sem__")
          )
        );
        if (respSet.size > 1 && !req.body.confirmarMultiplosResponsaveis) {
          return res.status(400).json({
            erro: `O intervalo contém ${respSet.size} responsáveis distintos. Envie confirmarMultiplosResponsaveis: true para confirmar a alteração em lote.`,
            totalAfetados: numeros.length,
            totalRespDistintos: respSet.size,
            bloqueio: "MULTIPLOS_RESPONSAVEIS",
          });
        }
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

      // ── GUARD: inspecionar registros antes de qualquer escrita ─────────────
      const numerosAfetados = await RifaNumero.find(filtro)
        .select("status responsavelId responsavelNome")
        .lean();

      const totalAfetados = numerosAfetados.length;

      if (totalAfetados === 0) {
        return res.status(404).json({ erro: "Nenhum número encontrado com esse filtro." });
      }

      // Contar responsáveis distintos no intervalo
      const respDistintosSet = new Set(
        numerosAfetados.map(n =>
          n.responsavelId
            ? n.responsavelId.toString()
            : (n.responsavelNome && n.responsavelNome.trim() ? n.responsavelNome.trim() : "__sem__")
        )
      );
      const totalRespDistintos = respDistintosSet.size;
      const temVinculos = numerosAfetados.some(
        n => n.responsavelNome && n.responsavelNome.trim() !== ""
      );

      // Operações destrutivas (apagam vínculo) exigem confirmação extra
      if (status === "disponivel" || status === "devolvida") {
        if (temVinculos && totalRespDistintos > 1) {
          return res.status(400).json({
            erro: `Operação bloqueada: o intervalo contém ${totalRespDistintos} responsáveis distintos. Corrija número por número ou envie confirmarMultiplosResponsaveis: true para forçar.`,
            totalAfetados,
            totalRespDistintos,
            bloqueio: "MULTIPLOS_RESPONSAVEIS",
          });
        }

        if (totalAfetados > 20 && req.body.confirmarGrandeLote !== "CONFIRMAR") {
          return res.status(400).json({
            erro: `Operação bloqueada: ${totalAfetados} números seriam afetados. Envie confirmarGrandeLote: "CONFIRMAR" no corpo da requisição para prosseguir.`,
            totalAfetados,
            totalRespDistintos,
            bloqueio: "LOTE_GRANDE",
          });
        }
      }

      // Paga/vendida exige responsável vinculado em todos os números
      if (status === "paga" || status === "vendida") {
        const semResponsavel = numerosAfetados.filter(
          n => !n.responsavelNome || n.responsavelNome.trim() === ""
        );
        if (semResponsavel.length > 0) {
          return res.status(400).json({
            erro: `Não é possível marcar como "${status}": ${semResponsavel.length} número(s) não possuem responsável vinculado. Distribua antes de registrar pagamento.`,
            totalAfetados,
            bloqueio: "SEM_RESPONSAVEL",
          });
        }
      }
      // ────────────────────────────────────────────────────────────────────────

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
        set.dataDistribuicao = null;
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

      const { status, responsavel, turma, numero, limite = 300 } = req.query;

      const filtro = {
        instituicao,
        campanha: campanhaId,
      };

      if (status) filtro.status = status;
      if (responsavel) filtro.responsavelNome = new RegExp(responsavel, "i");
      if (turma) filtro.turmaOuSetor = new RegExp(turma, "i");
      if (numero) {
        const n = Number(numero);
        if (Number.isInteger(n) && n > 0) {
          filtro.numeroValor = n;
        } else {
          filtro.numero = new RegExp(`^${numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
        }
      }

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
 * GET /api/rifas/blocos-reais/:campanhaId
 * Retorna blocos contíguos reais por responsável (não apenas min/max).
 * Query: ?responsavelNome= (filtro opcional, parcial case-insensitive)
 */
router.get(
  "/blocos-reais/:campanhaId",
  requireTenant,
  requireAdminRifas,
  async (req, res) => {
    try {
      const instituicao = getInstituicaoId(req);
      const { campanhaId } = req.params;
      const { responsavelNome } = req.query;

      const campanha = await CampanhaRifa.findOne({ _id: campanhaId, instituicao }).lean();
      if (!campanha) {
        return res.status(404).json({ erro: "Campanha não encontrada." });
      }

      const matchFiltro = {
        instituicao: campanha.instituicao,
        campanha: campanha._id,
        responsavelNome: { $exists: true, $nin: [null, ""] },
      };
      if (responsavelNome) {
        matchFiltro.responsavelNome = new RegExp(
          responsavelNome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
      }

      // Agrupa por responsável e coleta todos os numeroValor + totais por status
      const grupos = await RifaNumero.aggregate([
        { $match: matchFiltro },
        { $sort: { numeroValor: 1 } },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
              tipo: "$responsavelTipo",
              responsavelId: "$responsavelId",
            },
            numerosValor: { $push: "$numeroValor" },
            entregues: { $sum: 1 },
            distribuidas: {
              $sum: { $cond: [{ $eq: ["$status", "distribuida"] }, 1, 0] },
            },
            vendidas: {
              $sum: { $cond: [{ $in: ["$status", ["vendida", "paga"]] }, 1, 0] },
            },
            pagas: {
              $sum: { $cond: [{ $eq: ["$status", "paga"] }, 1, 0] },
            },
            devolvidas: {
              $sum: { $cond: [{ $eq: ["$status", "devolvida"] }, 1, 0] },
            },
            valorTotal: { $sum: { $ifNull: ["$valor", 0] } },
            valorPago: { $sum: { $ifNull: ["$valorPago", 0] } },
          },
        },
      ]);

      // Detecta blocos contíguos a partir do array de números já ordenado
      function detectarBlocos(numerosOrdenados) {
        const blocos = [];
        if (!numerosOrdenados.length) return blocos;
        let inicio = numerosOrdenados[0];
        let fim = numerosOrdenados[0];
        for (let i = 1; i < numerosOrdenados.length; i++) {
          if (numerosOrdenados[i] === fim + 1) {
            fim = numerosOrdenados[i];
          } else {
            blocos.push({ inicio, fim, quantidade: fim - inicio + 1 });
            inicio = numerosOrdenados[i];
            fim = numerosOrdenados[i];
          }
        }
        blocos.push({ inicio, fim, quantidade: fim - inicio + 1 });
        return blocos;
      }

      const responsaveis = grupos
        .map((g) => {
          const blocos = detectarBlocos(g.numerosValor);
          const pendente = Math.max((g.valorTotal || 0) - (g.valorPago || 0), 0);
          return {
            responsavelNome: g._id.nome,
            turmaOuSetor: g._id.turma,
            responsavelTipo: g._id.tipo,
            responsavelId: g._id.responsavelId,
            blocos,
            totalBlocos: blocos.length,
            entregues: g.entregues,
            distribuidas: g.distribuidas,
            vendidas: g.vendidas,
            pagas: g.pagas,
            devolvidas: g.devolvidas,
            valorTotal: g.valorTotal,
            valorPago: g.valorPago,
            pendente,
          };
        })
        .sort((a, b) => {
          const ta = indiceTurmaRifaBackend(a.turmaOuSetor);
          const tb = indiceTurmaRifaBackend(b.turmaOuSetor);
          if (ta !== tb) return ta - tb;
          return String(a.responsavelNome).localeCompare(String(b.responsavelNome), "pt-BR", {
            sensitivity: "base",
          });
        });

      return res.json({ ok: true, responsaveis });
    } catch (err) {
      console.error("[RIFAS][BLOCOS_REAIS]", err);
      return res.status(500).json({ erro: "Erro ao calcular blocos reais.", detalhe: err.message });
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
      const { turma } = req.query; // filtro opcional por turma

      const campanha = await CampanhaRifa.findOne({ _id: campanhaId, instituicao }).lean();
      if (!campanha) return res.status(404).json({ erro: "Campanha não encontrada." });

      const matchFiltro = {
        instituicao: campanha.instituicao,
        campanha: campanha._id,
        responsavelNome: { $exists: true, $nin: [null, ""] },
      };
      if (turma) {
        matchFiltro.turmaOuSetor = new RegExp(
          turma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
      }

      // Agrega por responsável coletando dados suficientes para blocos pagos
      const grupos = await RifaNumero.aggregate([
        { $match: matchFiltro },
        { $sort: { numeroValor: 1 } },
        {
          $group: {
            _id: {
              nome: "$responsavelNome",
              turma: "$turmaOuSetor",
              tipo: "$responsavelTipo",
            },
            entregues: { $sum: 1 },
            pagas: {
              $sum: { $cond: [{ $eq: ["$status", "paga"] }, 1, 0] },
            },
            vendidasPendentes: {
              $sum: { $cond: [{ $eq: ["$status", "vendida"] }, 1, 0] },
            },
            devolvidas: {
              $sum: { $cond: [{ $eq: ["$status", "devolvida"] }, 1, 0] },
            },
            valorTotal: { $sum: { $ifNull: ["$valor", 0] } },
            valorPago: { $sum: { $ifNull: ["$valorPago", 0] } },
            valorVendido: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["vendida", "paga"]] },
                  { $ifNull: ["$valorPago", { $ifNull: ["$valor", 0] }] },
                  0,
                ],
              },
            },
            // Coleta apenas os números pagos para detecção de blocos
            numerosPagos: {
              $push: {
                $cond: [{ $eq: ["$status", "paga"] }, "$numeroValor", "$$REMOVE"],
              },
            },
          },
        },
      ]);

      // Reutiliza detectarBlocos (mesma lógica do endpoint blocos-reais)
      function detectarBlocos(nums) {
        if (!nums.length) return [];
        const sorted = [...nums].sort((a, b) => a - b);
        const blocos = [];
        let ini = sorted[0], fim = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === fim + 1) { fim = sorted[i]; }
          else { blocos.push({ inicio: ini, fim, quantidade: fim - ini + 1 }); ini = sorted[i]; fim = sorted[i]; }
        }
        blocos.push({ inicio: ini, fim, quantidade: fim - ini + 1 });
        return blocos;
      }

      // Processa cada grupo
      const topResponsaveis = grupos
        .map((g) => {
          const blocosPagosArr = detectarBlocos(g.numerosPagos);
          const pendentes = Math.max(g.entregues - g.pagas - g.vendidasPendentes - g.devolvidas, 0);
          const pendente = Math.max((g.valorTotal || 0) - (g.valorPago || 0), 0);
          return {
            responsavelNome: g._id.nome,
            turmaOuSetor: g._id.turma,
            responsavelTipo: g._id.tipo,
            entregues: g.entregues,
            pagas: g.pagas,
            vendidasPendentes: g.vendidasPendentes,
            devolvidas: g.devolvidas,
            pendentes,
            blocosPagos: blocosPagosArr.length,
            blocosPagosDetalhe: blocosPagosArr,
            valorPago: g.valorPago,
            valorVendido: g.valorVendido,
            valorTotal: g.valorTotal,
            pendente,
          };
        })
        .sort((a, b) => {
          // Ordena por pagas DESC, depois por blocosPagos DESC, depois valorPago DESC
          if (b.pagas !== a.pagas) return b.pagas - a.pagas;
          if (b.blocosPagos !== a.blocosPagos) return b.blocosPagos - a.blocosPagos;
          return b.valorPago - a.valorPago;
        });

      // Agrupa por turma
      const turmaMap = {};
      for (const r of topResponsaveis) {
        const t = r.turmaOuSetor || "—";
        if (!turmaMap[t]) {
          turmaMap[t] = {
            turmaOuSetor: t,
            totalResponsaveis: 0,
            entregues: 0,
            pagas: 0,
            vendidasPendentes: 0,
            pendentes: 0,
            valorPago: 0,
            valorVendido: 0,
            valorTotal: 0,
            pendente: 0,
          };
        }
        const t_ = turmaMap[t];
        t_.totalResponsaveis++;
        t_.entregues += r.entregues;
        t_.pagas += r.pagas;
        t_.vendidasPendentes += r.vendidasPendentes;
        t_.pendentes += r.pendentes;
        t_.valorPago += r.valorPago;
        t_.valorVendido += r.valorVendido;
        t_.valorTotal += r.valorTotal;
        t_.pendente += r.pendente;
      }

      const topTurmas = Object.values(turmaMap).sort((a, b) => {
        if (b.pagas !== a.pagas) return b.pagas - a.pagas;
        return b.valorPago - a.valorPago;
      });

      // Ordena turmas pela ordem pedagógica para o dropdown
      const turmasOrdenadas = [...new Set(
        topResponsaveis.map(r => r.turmaOuSetor || "").filter(Boolean)
      )].sort((a, b) => {
        const ia = indiceTurmaRifaBackend(a);
        const ib = indiceTurmaRifaBackend(b);
        return ia !== ib ? ia - ib : a.localeCompare(b, "pt-BR");
      });

      // Resumo geral
      const totalPago = topResponsaveis.reduce((s, r) => s + r.pagas, 0);
      const totalVendidoPendente = topResponsaveis.reduce((s, r) => s + r.vendidasPendentes, 0);
      const valorPagoTotal = topResponsaveis.reduce((s, r) => s + r.valorPago, 0);
      const melhorResponsavel = topResponsaveis[0] || null;
      const melhorTurma = topTurmas[0] || null;

      return res.json({
        ok: true,
        topResponsaveis,
        topTurmas,
        turmasDisponiveis: turmasOrdenadas,
        resumo: {
          totalPago,
          totalVendidoPendente,
          valorPago: valorPagoTotal,
          melhorResponsavel,
          melhorTurma,
        },
      });
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

      const resultado = await RifaNumero.bulkWrite(ops, { ordered: false });

      const modificados = resultado.modifiedCount || 0;
      const esperadoTotal = blocos.reduce((acc, b) => acc + (b.fim - b.inicio + 1), 0);

      if (modificados < esperadoTotal) {
        // Identificar quais blocos não foram completamente distribuídos
        const blocosFalhos = [];
        for (const b of blocos) {
          const esperadoBloco = b.fim - b.inicio + 1;
          const distribuido = await RifaNumero.countDocuments({
            instituicao,
            campanha: campanha._id,
            numeroValor: { $gte: b.inicio, $lte: b.fim },
            status: "distribuida",
            responsavelNome: b.nome,
          });
          if (distribuido < esperadoBloco) {
            blocosFalhos.push({
              inicio: b.inicio,
              fim: b.fim,
              nome: b.nome,
              esperado: esperadoBloco,
              distribuido,
            });
          }
        }
        return res.status(207).json({
          ok: false,
          mensagem: `Distribuição parcial: ${modificados} de ${esperadoTotal} números distribuídos.`,
          modificados,
          esperadoTotal,
          blocosFalhos,
        });
      }

      return res.json({
        ok: true,
        mensagem: "Distribuição em lote concluída.",
        modificados,
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