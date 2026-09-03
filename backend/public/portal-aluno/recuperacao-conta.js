(() => {
  'use strict';

  const section = document.getElementById('segurancaConta');
  if (!section) return;

  const runtime = window.AxoriinAluno;

  async function apiStatus() {
    if (runtime?.apiFetch) {
      return runtime.apiFetch('/api/aluno-recuperacao/status');
    }

    const r = await fetch('/api/aluno-recuperacao/status', {
      credentials: 'include',
      cache: 'no-store'
    });
    if (!r.ok) throw new Error('Falha ao consultar proteção da conta.');
    return r.json();
  }

  async function render() {
    try {
      const status = await apiStatus();

      // O aviso é proposital: aparece somente para quem ainda não confirmou
      // um endereço de recuperação.
      if (status?.verificado) {
        section.hidden = true;
        return;
      }

      section.hidden = false;

      const state = section.querySelector('[data-recovery-state]');
      if (state && status?.emailPendenteMascarado) {
        state.textContent =
          `Confirmação pendente para ${status.emailPendenteMascarado}. ` +
          'Você pode reenviar cadastrando novamente o endereço.';
      }
    } catch {
      // Falha de rede não deve atrapalhar o restante do portal.
      section.hidden = true;
    }
  }

  render();
})();
