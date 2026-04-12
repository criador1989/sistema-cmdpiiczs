(function () {
  const STORAGE_KEY = 'axoriin_app_version';
  const CHECK_INTERVAL_MS = 60 * 1000; // 1 minuto

  async function clearAllCaches() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('Falha ao limpar caches:', e);
    }
  }

  async function unregisterServiceWorkers() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch (e) {
      console.warn('Falha ao atualizar service workers:', e);
    }
  }

  async function fetchServerVersion() {
    const res = await fetch(`/app-version.json?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Falha ao buscar versão do app');
    return res.json();
  }

  async function checkForUpdate() {
    try {
      const payload = await fetchServerVersion();
      const currentVersion = String(payload.version || '').trim();
      if (!currentVersion) return;

      const savedVersion = localStorage.getItem(STORAGE_KEY);

      if (!savedVersion) {
        localStorage.setItem(STORAGE_KEY, currentVersion);
        return;
      }

      if (savedVersion !== currentVersion) {
        localStorage.setItem(STORAGE_KEY, currentVersion);

        await unregisterServiceWorkers();
        await clearAllCaches();

        window.location.reload();
      }
    } catch (e) {
      console.warn('Falha ao verificar atualização automática:', e);
    }
  }

  window.__axoriinCheckForUpdate = checkForUpdate;

  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();