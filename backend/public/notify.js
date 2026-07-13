// public/notify.js
(function () {
  function makeToast(msg, kind = "info") {
    const wrap = document.createElement('div');
    wrap.className = 'toast';
    wrap.textContent = msg;
    wrap.style.cssText = `
      position: fixed; right: 16px; bottom: 16px; z-index: 99999;
      padding: 10px 14px; border-radius: 10px; color: #fff;
      background: ${kind === 'error' ? '#b91c1c' : kind === 'success' ? '#15803d' : '#334155'};
      border: 1px solid rgba(255,255,255,.18); box-shadow: 0 10px 24px rgba(0,0,0,.35);
      font: 14px/1.2 system-ui; transform: translateY(14px); opacity: 0; transition: .2s ease;
      max-width: 60vw; word-break: break-word;
    `;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.style.opacity = '1';
      wrap.style.transform = 'translateY(0)';
    });
    clearTimeout(wrap._t);
    wrap._t = setTimeout(() => {
      wrap.style.opacity = '0';
      wrap.style.transform = 'translateY(10px)';
      setTimeout(() => wrap.remove(), 220);
    }, 3500);
  }

  window.showToast = (msg) => makeToast(msg || 'Operação realizada.', 'success');
  window.showSuccess = (msg) => makeToast(msg || 'Operação realizada com sucesso.', 'success');
  window.showError = (msg) => makeToast(msg || 'Ocorreu um erro.', 'error');
  window.showInfo = (msg) => makeToast(msg || 'Informação.', 'info');

  window.api = async function api(path, opts = {}) {
    const url = path.startsWith('http')
      ? path
      : (path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : '/' + path}`);

    const r = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...opts
    });

    if (r.status === 204) {
      if (!r.ok) throw new Error('Operação não concluída.');
      return { ok: true };
    }

    const ct = r.headers.get('content-type') || '';
    let data = null;

    if (ct.includes('application/json')) {
      try {
        data = await r.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = { text: await r.text() };
      } catch {}
    }

    if (!r.ok) {
      const msg =
        (data && (data.message || data.error || data.erro)) ||
        `${r.status} ${r.statusText}`;
      throw new Error(msg);
    }

    return data ?? { ok: true };
  };
})();