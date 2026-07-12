'use strict';

(() => {
  const state = { ambientes: [], atual: null };

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.mensagem || `Erro HTTP ${response.status}`);
    return data;
  }

  function isAssociation(item) {
    return item?.categoria === 'associacao' || item?.associacao?.ativo === true;
  }

  async function carregar() {
    const data = await request('/auth/ambientes');
    state.ambientes = data.ambientes || [];
    state.atual = data.ambienteAtual || null;

    const associacoes = state.ambientes.filter(isAssociation);
    const card = document.getElementById('cardAssociacao');
    if (card && associacoes.length) {
      card.style.display = '';
      const label = card.querySelector('.kicker');
      if (label) label.textContent = associacoes.length > 1 ? `${associacoes.length} AMBIENTES` : 'MÓDULO VINCULADO';
    }
    return state.ambientes;
  }

  async function trocar(tenant) {
    const data = await request('/auth/trocar-ambiente', {
      method: 'POST',
      body: JSON.stringify({ tenant }),
    });
    const url = new URL(data.redirecionar || '/painel.html', location.origin);
    url.searchParams.set('t', data.tenant || tenant);
    location.href = `${url.pathname}${url.search}`;
  }

  async function abrirPrimeiraAssociacao() {
    if (!state.ambientes.length) await carregar();
    const ambiente = state.ambientes.find(isAssociation);
    if (!ambiente) {
      alert('Seu usuário ainda não possui acesso a uma associação.');
      return;
    }
    await trocar(ambiente.tenant);
  }

  window.AxoriinAmbientes = { carregar, trocar, abrirPrimeiraAssociacao, state };

  const init = () => carregar().catch(error => console.warn('[ambientes]', error.message));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
