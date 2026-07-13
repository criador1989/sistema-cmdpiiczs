(function (global) {
  'use strict';

  const STORAGE = Object.freeze({
    token: 'axoriin_aluno_token',
    usuario: 'axoriin_aluno_usuario',
    aluno: 'axoriin_aluno',
    tenant: 'axoriin_tenant',
    authType: 'axoriin_auth_type'
  });

  function lerJson(chave) {
    try {
      return JSON.parse(localStorage.getItem(chave) || 'null');
    } catch (_) {
      return null;
    }
  }

  function getTenant() {
    const params = new URLSearchParams(global.location.search);
    return (
      params.get('t') ||
      params.get('tenant') ||
      localStorage.getItem(STORAGE.tenant) ||
      localStorage.getItem('smartclass_tenant') ||
      ''
    ).trim();
  }

  function buildUrl(caminho) {
    const url = new URL(caminho, global.location.origin);
    const tenant = getTenant();

    if (tenant && url.origin === global.location.origin && !url.searchParams.has('t')) {
      url.searchParams.set('t', tenant);
    }

    return url.href;
  }

  function sessao() {
    return {
      token: localStorage.getItem(STORAGE.token) || '',
      usuario: lerJson(STORAGE.usuario),
      aluno: lerJson(STORAGE.aluno),
      tenant: getTenant()
    };
  }

  async function apiFetch(caminho, options) {
    const atual = sessao();
    const headers = { ...((options && options.headers) || {}) };

    if (atual.token) headers.Authorization = `Bearer ${atual.token}`;

    const resposta = await fetch(buildUrl(caminho), {
      ...(options || {}),
      headers,
      credentials: 'include'
    });

    const tipo = resposta.headers.get('content-type') || '';
    const payload = tipo.includes('application/json')
      ? await resposta.json()
      : await resposta.text();

    if (!resposta.ok) {
      const mensagem = typeof payload === 'object' && payload
        ? (payload.mensagem || payload.message || payload.erro)
        : null;
      const erro = new Error(mensagem || 'Não foi possível concluir a solicitação.');
      erro.status = resposta.status;
      erro.payload = payload;
      throw erro;
    }

    return payload;
  }

  function limparSessao() {
    Object.values(STORAGE).forEach((chave) => localStorage.removeItem(chave));
  }

  async function logout() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    limparSessao();
    global.location.href = buildUrl('/login-aluno.html');
  }

  function garantirSessao() {
    const atual = sessao();
    if (!atual.token) {
      global.location.replace(buildUrl('/login-aluno.html'));
      return false;
    }
    return true;
  }

  function ir(caminho) {
    global.location.href = buildUrl(caminho);
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'AL';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
  }

  function formatarData(data) {
    if (!data) return '';
    const valor = new Date(data);
    if (Number.isNaN(valor.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(valor);
  }

  function registrarPwa() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  global.AxoriinAluno = Object.freeze({
    STORAGE,
    sessao,
    getTenant,
    buildUrl,
    apiFetch,
    logout,
    limparSessao,
    garantirSessao,
    ir,
    escapeHtml,
    iniciais,
    formatarData,
    registrarPwa
  });
})(window);
