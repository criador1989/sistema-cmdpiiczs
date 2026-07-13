// backend/utils/logger.js
const {
  logAction: auditLogAction,
  logError: auditLogError
} = require('./audit');

/**
 * Wrapper compatível com chamadas antigas.
 * Mantém a assinatura já usada no sistema e delega para o audit.js,
 * que agora grava logs ricos/profissionais.
 *
 * Campos aceitos:
 * - req
 * - acao
 * - entidade
 * - entidadeId
 * - entidadeNome
 * - extra
 *
 * Campos adicionais suportados sem quebrar chamadas antigas:
 * - aluno
 * - alunoNome
 * - modulo
 * - categoria
 * - severidade
 * - status
 * - motivo
 * - antes
 * - depois
 * - erro
 * - tempoExecucaoMs
 * - correlationId
 * - requestId
 * - sessionId
 * - ip
 * - userAgent
 * - origem
 */
async function logAction({
  req,
  acao,
  entidade,
  entidadeId,
  entidadeNome = null,
  extra = {},

  aluno = null,
  alunoNome = null,
  modulo = null,
  categoria = null,
  severidade = null,
  status = null,
  motivo = null,
  antes = null,
  depois = null,
  erro = null,
  tempoExecucaoMs = null,
  correlationId = null,
  requestId = null,
  sessionId = null,
  ip = null,
  userAgent = null,
  origem = null,
} = {}) {
  try {
    await auditLogAction({
      req,
      acao,
      entidade,
      entidadeId,
      entidadeNome,
      extra,

      aluno,
      alunoNome,
      modulo,
      categoria,
      severidade,
      status,
      motivo,
      antes,
      depois,
      erro,
      tempoExecucaoMs,
      correlationId,
      requestId,
      sessionId,
      ip,
      userAgent,
      origem,
    });
  } catch (e) {
    // não quebra o fluxo principal
    console.warn('logger.logAction falhou:', e?.message || e);
  }
}

/**
 * Helper explícito para erros.
 * Útil quando quiser registrar falhas de permissão, exceções de rota,
 * tentativas inválidas etc.
 */
async function logError({
  req,
  acao,
  entidade,
  entidadeId,
  entidadeNome = null,
  extra = {},

  aluno = null,
  alunoNome = null,
  modulo = null,
  categoria = null,
  severidade = 'critica',
  status = 'erro',
  motivo = null,
  antes = null,
  depois = null,
  erro = null,
  tempoExecucaoMs = null,
  correlationId = null,
  requestId = null,
  sessionId = null,
  ip = null,
  userAgent = null,
  origem = null,
} = {}) {
  try {
    await auditLogError({
      req,
      acao,
      entidade,
      entidadeId,
      entidadeNome,
      extra,

      aluno,
      alunoNome,
      modulo,
      categoria,
      severidade,
      status,
      motivo,
      antes,
      depois,
      erro,
      tempoExecucaoMs,
      correlationId,
      requestId,
      sessionId,
      ip,
      userAgent,
      origem,
    });
  } catch (e) {
    console.warn('logger.logError falhou:', e?.message || e);
  }
}

module.exports = {
  logAction,
  logError
};