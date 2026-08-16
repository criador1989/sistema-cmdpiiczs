'use strict';

/**
 * Adaptador de frequência.
 *
 * Nesta Fase 1 o Axoriin consolida e confirma a chamada internamente.
 * Quando a integração oficial com o SIMAED estiver disponível, este
 * arquivo passa a resolver um provider real sem alterar o módulo de chamada.
 */

function getProviderName() {
  return String(process.env.ATTENDANCE_PROVIDER || 'none').trim().toLowerCase();
}

async function enviarChamada({ session, records }) {
  const provider = getProviderName();

  if (!provider || provider === 'none') {
    return {
      configured: false,
      ok: false,
      provider: 'none',
      status: 'nao_configurado',
      message: 'Integração de frequência externa ainda não configurada.',
      sessionId: String(session?._id || ''),
      total: Array.isArray(records) ? records.length : 0,
    };
  }

  // Ponto de extensão reservado para SIMAED.
  // Não fazemos automação não autorizada nesta fase.
  return {
    configured: false,
    ok: false,
    provider,
    status: 'nao_configurado',
    message: `Provider "${provider}" ainda não implementado.`,
    sessionId: String(session?._id || ''),
    total: Array.isArray(records) ? records.length : 0,
  };
}

module.exports = {
  getProviderName,
  enviarChamada,
};
