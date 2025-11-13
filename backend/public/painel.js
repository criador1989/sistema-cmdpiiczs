// /public/painel.js
(function () {
  // Helper p/ montar URL da API
  const API = (p) =>
    p.startsWith('http') ? p : (p.startsWith('/api') ? p : `/api${p.startsWith('/') ? p : '/' + p}`);

  // Fetch com timeout
  async function getJSON(url, { timeoutMs = 8000 } = {}) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
    try {
      const r = await fetch(API(url), { credentials: 'include', cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      return ct.includes('application/json') ? r.json() : {};
    } finally {
      clearTimeout(id);
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function showError(msg) {
    let el = document.getElementById('errBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'errBanner';
      el.style.cssText =
        'position:fixed;left:16px;right:16px;bottom:16px;padding:12px 14px;border-radius:10px;background:#5f1212;color:#fff;border:1px solid rgba(255,255,255,.25);box-shadow:0 10px 20px rgba(0,0,0,.4);z-index:9999;font:14px/1.3 system-ui';
      document.body.appendChild(el);
    }
    el.textContent = `Erro: ${msg}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.remove(), 8000);
  }

  // --- Atualiza contadores específicos do painel ---
  async function atualizarContadoresPainel() {
    // 1) Notificações pendentes via CONTROLE (status pendente + revisão)
    try {
      // A rota já tem os status padrão: 'pendente,revisao_solicitada'
      const r = await getJSON('/api/controle-notificacoes?limit=1', { timeoutMs: 9000 });
      const total = Number(r?.total || 0);
      setText('mNotif', total.toLocaleString('pt-BR'));
    } catch (e) {
      console.warn('Falha ao obter controle-notificacoes:', e.message);
      // mantém o valor que já estiver na tela
    }

    // 2) Devoluções em atraso (se a sua rota existir)
    try {
      const k = await getJSON('/api/notificacoes/pendencias/devolucao/contador', { timeoutMs: 9000 });
      const total = Number(k?.total || 0);
      setText('mPendDevol', total.toLocaleString('pt-BR'));
    } catch (e) {
      console.warn('Falha ao obter pendencias/contador:', e.message);
      // mantém o valor que já estiver na tela
    }
  }

  // --- Opcional: atualizar badge de mensagens se tiver uma rota específica ---
  async function atualizarBadgeMensagens() {
    try {
      const j = await getJSON('/api/metrics/overview', { timeoutMs: 8000 });
      const n = Number(j?.msgs || 0);
      const badge = document.getElementById('mensagensBadge');
      if (badge) {
        if (n > 0) {
          badge.style.display = '';
          badge.textContent = n.toLocaleString('pt-BR');
        } else {
          badge.style.display = 'none';
        }
      }
    } catch {
      // silencioso
    }
  }

  // Rode assim que o DOM estiver pronto (sem conflitar com scripts inline)
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await atualizarContadoresPainel();
      await atualizarBadgeMensagens();
    } catch (e) {
      showError(e.message || 'Erro ao atualizar o painel');
    }
  });

  // Exponha uma função global (caso queira reatualizar depois de alguma ação)
  window._refreshPainelCounters = atualizarContadoresPainel;
})();