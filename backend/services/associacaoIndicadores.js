'use strict';

const mongoose = require('mongoose');
const AssociacaoContribuicao = require('../models/AssociacaoContribuicao');
const AssociacaoMovimentacao = require('../models/AssociacaoMovimentacao');
const { buildFinancialInsights, normalizeMonths } = require('../utils/associacaoFinancialInsights');

async function gerarIndicadoresFinanceiros({ tenantId, meses = 12, turma = '', agora = new Date() } = {}) {
  if (!tenantId || !mongoose.isValidObjectId(String(tenantId))) {
    throw new Error('Tenant inválido para geração dos indicadores financeiros.');
  }

  const normalizedTenantId = new mongoose.Types.ObjectId(String(tenantId));
  const normalizedMonths = normalizeMonths(meses);
  const normalizedClass = String(turma || '').trim();

  const contributionFilter = { tenantId: normalizedTenantId, status: { $ne: 'Cancelado' } };
  const movementFilter = { tenantId: normalizedTenantId, status: { $ne: 'Cancelado' } };
  if (normalizedClass) {
    contributionFilter.alunoTurma = normalizedClass;
    movementFilter.alunoTurma = normalizedClass;
  }

  const [contributions, movements] = await Promise.all([
    AssociacaoContribuicao.find(contributionFilter)
      .select('_id pessoa responsavelNome alunoNome alunoTurma referencia vencimento valorPrevisto valorPago status')
      .lean(),
    AssociacaoMovimentacao.find(movementFilter)
      .select('_id tipo status dataMovimentacao dataVencimento valor alunoTurma origemTipo origemId')
      .lean(),
  ]);

  return buildFinancialInsights({
    contributions,
    movements,
    now: agora,
    months: normalizedMonths,
    turma: normalizedClass,
  });
}

module.exports = { gerarIndicadoresFinanceiros };
