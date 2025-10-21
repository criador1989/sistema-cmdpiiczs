// backend/utils/logger.js
const Log = require('../models/Log');

/**
 * Grava um log de auditoria. Não lança erro para não quebrar o fluxo.
 * Campos principais:
 * - instituicao (do usuário logado)
 * - usuario, usuarioNome, usuarioTipo
 * - acao (ex.: NOTIFICACAO_CRIADA)
 * - entidade (ex.: 'Notificacao')
 * - entidadeId (string com o _id)
 * - entidadeNome / alunoNome (opcionais)
 * - extra (objeto livre com detalhes)
 */
async function logAction({
  req,
  acao,
  entidade,
  entidadeId,
  entidadeNome = null,
  extra = {},
}) {
  try {
    await Log.create({
      instituicao: req?.usuario?.instituicao,
      usuario: req?.usuario?.id,
      usuarioNome: req?.usuario?.nome,
      usuarioTipo: req?.usuario?.tipo,
      acao,
      entidade,
      entidadeId: String(entidadeId),
      entidadeNome,
      detalhes: extra,
    });
  } catch (e) {
    // Evita quebrar o fluxo; loga no console para diagnóstico
    console.warn('logger.logAction falhou:', e?.message || e);
  }
}

module.exports = { logAction };
