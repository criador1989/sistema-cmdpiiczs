// /public/painel.js
(function () {
  const DEFAULT_TENANT = 'cmdpii';
  const TENANT_STORAGE_KEY = 'smartclass_tenant';
  const TENANT_STORAGE_KEY_OLD = 'axoriin_tenant';

  function getTenantFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    return (qs.get('t') || qs.get('tenant') || '').trim();
  }

  function getTenantFromStorage() {
    const current = (localStorage.getItem(TENANT_STORAGE_KEY) || '').trim();
    if (current) return current;

    const legacy = (localStorage.getItem(TENANT_STORAGE_KEY_OLD) || '').trim();
    if (legacy) {
      localStorage.setItem(TENANT_STORAGE_KEY, legacy);
      return legacy;
    }

    return '';
  }

  function setTenantStorage(t) {
    const value = String(t || '').trim();
    if (!value) return;
    localStorage.setItem(TENANT_STORAGE_KEY, value);
    localStorage.setItem(TENANT_STORAGE_KEY_OLD, value);
  }

  function getResolvedTenant() {
    const finalTenant = getTenantFromUrl() || getTenantFromStorage() || DEFAULT_TENANT;
    setTenantStorage(finalTenant);
    return finalTenant;
  }

  const TENANT = getResolvedTenant();

  function withTenant(url) {
    try {
      const isAbsolute = /^https?:\/\//i.test(url);
      const u = isAbsolute ? new URL(url) : new URL(url, window.location.origin);
      u.searchParams.set('t', TENANT);
      return isAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
    } catch {
      const sep = String(url).includes('?') ? '&' : '?';
      return `${url}${sep}t=${encodeURIComponent(TENANT)}`;
    }
  }

  function API(p) {
    const raw = p.startsWith('http')
      ? p
      : (p.startsWith('/api') ? p : `/api${p.startsWith('/') ? p : '/' + p}`);

    return withTenant(raw);
  }

  async function getJSON(url, { timeoutMs = 8000 } = {}) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort('timeout'), timeoutMs);

    try {
      const r = await fetch(API(url), {
        credentials: 'include',
        cache: 'no-store',
        signal: ctrl.signal,
        headers: {
          'x-tenant-slug': TENANT
        }
      });

      if (!r.ok) throw new Error(`${url} -> ${r.status}`);

      const ct = r.headers.get('content-type') || '';
      return ct.includes('application/json') ? await r.json() : {};
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

  async function atualizarContadoresPainel() {
    try {
      const overview = await getJSON('/api/metrics/overview', { timeoutMs: 9000 });
      const notifPend = Number(overview?.notifPend || 0);
      setText('mNotif', notifPend.toLocaleString('pt-BR'));
    } catch (e) {
      console.warn('Falha ao obter metrics/overview:', e.message);
      setText('mNotif', '—');
    }

  }


  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await atualizarContadoresPainel();
    } catch (e) {
      showError(e.message || 'Erro ao atualizar o painel');
    }
  });

  window._refreshPainelCounters = atualizarContadoresPainel;
})();