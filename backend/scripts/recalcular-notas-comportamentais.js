/**
 * Script de recálculo em massa da nota comportamental
 *
 * COMO USAR:
 * 1) Salve em: /scripts/recalcular-notas-comportamentais.js
 * 2) Ajuste os nomes das collections/campos no BLOCO DE CONFIGURAÇÃO
 * 3) Rode:
 *    node scripts/recalcular-notas-comportamentais.js
 *
 * OPCIONAL:
 *    DRY_RUN=true node scripts/recalcular-notas-comportamentais.js
 *    -> só simula, não grava no banco
 */

require("dotenv").config();
const mongoose = require("mongoose");

const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";

/* =========================================================
 * BLOCO DE CONFIGURAÇÃO
 * AJUSTE AQUI CONFORME O SEU BANCO
 * ========================================================= */
const CONFIG = {
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,

  // Collections
  alunosCollection: "alunos",
  notificacoesCollection: "notificacoes", // troque se no seu banco for outro nome

  // Regras da nota
  notaMaxima: 10,
  notaMinima: 0,
  notaInicial: 10,

  // Campos no aluno que você quer manter sincronizados
  // Pode deixar só 1 campo se quiser padronizar de vez
  camposNotaNoAluno: [
    "notaComportamental",
    "notaComportamentalAtual",
    "desempenho.notaComportamental"
  ],

  // Campos auxiliares para auditoria
  campoUltimaAtualizacao: "notaComportamentalAtualizadaEm",
  campoTotalPontos: "totalPontosDisciplinares",

  // Se quiser filtrar por instituição, mantenha true
  respeitarInstituicao: true,

  // Nomes de possíveis campos do aluno
  alunoIdField: "_id",
  alunoInstituicaoField: "instituicao",

  // Nomes de possíveis campos na notificação
  notifAlunoIdFields: ["aluno", "alunoId", "idAluno"],
  notifInstituicaoField: "instituicao",

  // Campos possíveis de pontuação negativa
  notifPontosFields: ["pontos", "pontuacao", "valor", "pontosDescontados"],

  // Campos de status para ignorar registros cancelados/inativos
  notifStatusField: "status",
  notifAtivoField: "ativo",

  // Status que devem ser ignorados
  statusIgnorados: ["cancelada", "cancelado", "excluida", "excluído", "removida"],

  // Se quiser considerar apenas notificações com tipo disciplinar
  usarFiltroTipo: false,
  notifTipoField: "tipo",
  notifTipoValor: "disciplinar"
};

/* =========================================================
 * HELPERS
 * ========================================================= */

function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

function getNested(obj, path) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function setNested(updateObj, path, value) {
  updateObj[path] = value;
}

function firstExistingFieldValue(obj, possibleFields) {
  for (const field of possibleFields) {
    const value = getNested(obj, field);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function toNumberSafe(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const n = Number(normalized);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isIgnoredNotification(notif) {
  const status = String(notif?.[CONFIG.notifStatusField] || "").toLowerCase().trim();
  const ativo = notif?.[CONFIG.notifAtivoField];

  if (CONFIG.statusIgnorados.includes(status)) return true;
  if (ativo === false) return true;

  if (CONFIG.usarFiltroTipo) {
    const tipo = String(notif?.[CONFIG.notifTipoField] || "").toLowerCase().trim();
    if (tipo !== String(CONFIG.notifTipoValor).toLowerCase()) return true;
  }

  return false;
}

function calcularNotaComportamental(notificacoes) {
  let totalPontos = 0;

  for (const notif of notificacoes) {
    if (isIgnoredNotification(notif)) continue;

    const pontos = firstExistingFieldValue(notif, CONFIG.notifPontosFields);
    totalPontos += toNumberSafe(pontos);
  }

  const notaFinal = clamp(CONFIG.notaInicial - totalPontos, CONFIG.notaMinima, CONFIG.notaMaxima);

  return {
    totalPontos,
    notaFinal
  };
}

async function main() {
  if (!CONFIG.mongoUri) {
    throw new Error("MONGODB_URI/MONGO_URI não encontrado no .env");
  }

  await mongoose.connect(CONFIG.mongoUri);
  const db = mongoose.connection.db;

  const alunosCol = db.collection(CONFIG.alunosCollection);
  const notificacoesCol = db.collection(CONFIG.notificacoesCollection);

  console.log("==================================================");
  console.log("RECALCULANDO NOTAS COMPORTAMENTAIS");
  console.log("DRY_RUN:", DRY_RUN ? "SIM" : "NÃO");
  console.log("Banco conectado com sucesso.");
  console.log("==================================================");

  const alunos = await alunosCol.find({}).toArray();
  console.log(`Total de alunos encontrados: ${alunos.length}`);

  let atualizados = 0;
  let semAlteracao = 0;
  let erros = 0;

  for (const aluno of alunos) {
    try {
      const alunoId = aluno[CONFIG.alunoIdField];
      const instituicaoAluno = aluno[CONFIG.alunoInstituicaoField];

      const notifQueryBase = [];

      // Procura por qualquer possível campo de vínculo do aluno
      const orAluno = CONFIG.notifAlunoIdFields.map((field) => ({
        [field]: alunoId
      }));

      notifQueryBase.push({ $or: orAluno });

      if (CONFIG.respeitarInstituicao && instituicaoAluno) {
        notifQueryBase.push({
          [CONFIG.notifInstituicaoField]: instituicaoAluno
        });
      }

      const query = notifQueryBase.length > 1 ? { $and: notifQueryBase } : notifQueryBase[0];

      const notificacoes = await notificacoesCol.find(query).toArray();

      const { totalPontos, notaFinal } = calcularNotaComportamental(notificacoes);

      const notaAtualBanco =
        firstExistingFieldValue(aluno, CONFIG.camposNotaNoAluno) ?? null;

      const notaAtualNumero =
        notaAtualBanco === null || notaAtualBanco === undefined
          ? null
          : toNumberSafe(notaAtualBanco);

      const mudou =
        notaAtualNumero === null ||
        Math.abs(notaAtualNumero - notaFinal) > 0.000001 ||
        toNumberSafe(aluno?.[CONFIG.campoTotalPontos]) !== totalPontos;

      if (!mudou) {
        semAlteracao++;
        continue;
      }

      const $set = {};
      for (const campo of CONFIG.camposNotaNoAluno) {
        setNested($set, campo, notaFinal);
      }
      $set[CONFIG.campoTotalPontos] = totalPontos;
      $set[CONFIG.campoUltimaAtualizacao] = new Date();

      if (!DRY_RUN) {
        await alunosCol.updateOne(
          { [CONFIG.alunoIdField]: alunoId },
          { $set }
        );
      }

      atualizados++;

      console.log(
        `[${atualizados}] ${aluno.nome || "Aluno sem nome"} | ` +
        `Nota antiga: ${notaAtualBanco} | Nota nova: ${notaFinal} | ` +
        `Pontos: ${totalPontos} | Notificações: ${notificacoes.length}`
      );
    } catch (err) {
      erros++;
      console.error(
        `Erro ao processar aluno ${aluno?.nome || aluno?._id || "desconhecido"}:`,
        err.message
      );
    }
  }

  console.log("==================================================");
  console.log("FINALIZADO");
  console.log("Atualizados:", atualizados);
  console.log("Sem alteração:", semAlteracao);
  console.log("Erros:", erros);
  console.log("==================================================");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Falha geral:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});