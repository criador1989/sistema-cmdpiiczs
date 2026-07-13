/*
  Axoriin Site Analytics Client
  - Registra visita/pageview
  - Mantém contagem de pessoas online por heartbeat
  - Registra cliques comerciais importantes
  - Não envia nome, telefone, e-mail ou dados sensíveis de alunos/usuários
*/
(function () {
  'use strict';

  const API_BASE = '/api/site-analytics';
  const VISITOR_KEY = 'axoriin_visitor_id';
  const SESSION_KEY = 'axoriin_session_id';
  const HEARTBEAT_INTERVAL_MS = 30000;

  // Não contabiliza o próprio painel de analytics para evitar distorção.
  if (/\/admin-site\/site-analytics\.html$/i.test(window.location.pathname)) return;

  const supportsCryptoRandom = window.crypto && window.crypto.getRandomValues;

  function createId(prefix) {
    if (supportsCryptoRandom) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return prefix + '_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function getVisitorId() {
    try {
      let id = window.localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = createId('v');
        window.localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (err) {
      return createId('v');
    }
  }

  function getSessionId() {
    try {
      let id = window.sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = createId('s');
        window.sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (err) {
      return createId('s');
    }
  }

  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  function currentPath() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function basePayload() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

    return {
      visitorId,
      sessionId,
      path: currentPath(),
      title: document.title || 'Axoriin',
      referrer: document.referrer || '',
      language: navigator.language || '',
      timezone,
      screen: {
        width: window.screen && window.screen.width ? window.screen.width : null,
        height: window.screen && window.screen.height ? window.screen.height : null
      }
    };
  }

  function post(endpoint, payload, useBeacon) {
    const url = API_BASE + endpoint;
    const body = JSON.stringify(payload || {});

    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: Boolean(useBeacon),
      credentials: 'same-origin'
    }).catch(function () {
      // Falha silenciosa para não interferir na navegação do usuário.
    });
  }

  function trackVisit() {
    post('/visit', basePayload(), false);
  }

  function heartbeat() {
    if (document.visibilityState === 'hidden') return;
    post('/heartbeat', basePayload(), true);
  }

  function classifyLink(link) {
    const href = link.getAttribute('href') || '';
    const text = (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const fullHref = link.href || href;

    if (/wa\.me\/5568999683070|99968-3070/.test(fullHref + ' ' + text)) {
      return { name: 'click_whatsapp_99968_3070', label: text || '+55 68 99968-3070' };
    }

    if (/wa\.me\/5568999333960|99933-3960/.test(fullHref + ' ' + text)) {
      return { name: 'click_whatsapp_99933_3960', label: text || '+55 68 99933-3960' };
    }

    if (/\/login\.html/i.test(href)) {
      return { name: 'click_acessar_sistema', label: text || 'Acessar sistema' };
    }

    if (/\/login-aluno\.html/i.test(href)) {
      return { name: 'click_portal_aluno', label: text || 'Portal do Aluno' };
    }

    if (/#planos/i.test(href)) {
      return { name: 'click_planos', label: text || 'Planos e valores' };
    }

    if (/demonstra|apresenta|piloto|proposta|contato/i.test(text + ' ' + href)) {
      return { name: 'click_interesse_comercial', label: text || href };
    }

    return null;
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest && event.target.closest('a');
    if (!link) return;

    const info = classifyLink(link);
    if (!info) return;

    post('/event', {
      ...basePayload(),
      eventName: info.name,
      eventLabel: info.label
    }, true);
  }, true);

  trackVisit();
  heartbeat();

  window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') heartbeat();
  });

  window.addEventListener('pagehide', function () {
    post('/heartbeat', basePayload(), true);
  });
}());
