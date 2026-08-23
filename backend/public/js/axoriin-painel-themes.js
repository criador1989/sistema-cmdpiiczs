'use strict';

(() => {
  const VERSION = '1.0.4';
  const STORAGE_KEY = 'axoriin_panel_theme_v1';

  const THEMES = {
    dark: { label: 'Escuro', mode: 'dark', meta: '#06111d', swatch: 'linear-gradient(135deg,#071220,#132943)' },
    tactical: { label: 'Verde Tático', mode: 'dark', meta: '#07110f', swatch: 'linear-gradient(135deg,#07110f,#0c6f57)' },
  };

  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function normalizeTheme(value) {
    const key = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(THEMES, key) ? key : 'dark';
  }
  function currentTheme() {
    return normalizeTheme(document.documentElement.dataset.axTheme || safeStorageGet(STORAGE_KEY));
  }
  function setMetaThemeColor(color) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
  }
  function dispatchThemeChange(theme) {
    try { window.dispatchEvent(new CustomEvent('axoriin:themechange', { detail:{ theme, config:THEMES[theme], version:VERSION } })); } catch {}
  }

  function syncThemeUI(theme) {
    const chosen = normalizeTheme(theme);
    const config = THEMES[chosen];
    const current = document.getElementById('axThemeCurrent');
    const icon = document.getElementById('axModeIcon');
    const toggle = document.getElementById('axModeToggle');
    if (current) current.textContent = config.label;
    if (icon) icon.textContent = chosen === 'tactical' ? '◈' : '◐';
    if (toggle) {
      toggle.setAttribute('aria-label', chosen === 'dark' ? 'Ativar tema Verde Tático' : 'Ativar tema Escuro');
      toggle.title = chosen === 'dark' ? 'Ativar tema Verde Tático' : 'Ativar tema Escuro';
    }
    document.querySelectorAll('.ax-theme-option[data-theme]').forEach((button) => {
      const selected = button.dataset.theme === chosen;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function applyTheme(theme, options = {}) {
    const chosen = normalizeTheme(theme);
    const config = THEMES[chosen];
    document.documentElement.dataset.axTheme = chosen;
    document.documentElement.style.colorScheme = config.mode;
    document.body?.setAttribute('data-ax-theme', chosen);
    if (options.persist !== false) safeStorageSet(STORAGE_KEY, chosen);
    setMetaThemeColor(config.meta);
    syncThemeUI(chosen);
    dispatchThemeChange(chosen);
    return chosen;
  }

  function createThemeControls() {
    if (document.getElementById('axThemeControls')) return;
    const anchor = document.getElementById('btn-wallpaper');
    const topo = document.querySelector('.topo');
    if (!anchor || !topo) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'axThemeControls';
    wrapper.className = 'ax-theme-controls ax-theme-ui';
    wrapper.setAttribute('data-version', VERSION);
    wrapper.innerHTML = `
      <div class="ax-theme-menu-wrap">
        <button id="axThemeMenuButton" class="ax-theme-button" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="ax-theme-button-icon" aria-hidden="true">◈</span>
          <span class="ax-theme-button-title">Tema</span>
          <span id="axThemeCurrent" class="ax-theme-current">Escuro</span>
          <span class="ax-theme-caret" aria-hidden="true">⌄</span>
        </button>
      </div>
      <button id="axModeToggle" class="ax-mode-toggle" type="button" aria-label="Alternar entre Escuro e Verde Tático" title="Alternar entre Escuro e Verde Tático">
        <span id="axModeIcon" aria-hidden="true">◐</span>
      </button>
    `;
    anchor.insertAdjacentElement('afterend', wrapper);

    const menu = document.createElement('div');
    menu.id = 'axThemeMenu';
    menu.className = 'ax-theme-menu ax-theme-portal';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.innerHTML = Object.entries(THEMES).map(([key, item]) => `
      <button class="ax-theme-option" type="button" role="menuitemradio" aria-checked="false" data-theme="${key}">
        <span class="ax-theme-swatch" style="background:${item.swatch}"></span>
        <span class="ax-theme-option-label">${item.label}</span>
        <span class="ax-theme-check" aria-hidden="true">✓</span>
      </button>
    `).join('');
    document.body.appendChild(menu);

    const menuButton = wrapper.querySelector('#axThemeMenuButton');
    const modeToggle = wrapper.querySelector('#axModeToggle');

    const positionMenu = () => {
      if (menu.hidden || !menuButton) return;
      const br = menuButton.getBoundingClientRect();
      const menuWidth = Math.min(210, Math.max(190, menu.offsetWidth || 210));
      const menuHeight = menu.offsetHeight || 160;
      const pad = 10;
      let left = br.left + (br.width / 2) - (menuWidth / 2);
      let top = br.bottom + 9;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));

      const blocker = document.getElementById('opAdminWidget');
      if (blocker && !blocker.hidden) {
        const wr = blocker.getBoundingClientRect();
        const intersects = !(left + menuWidth < wr.left || left > wr.right || top + menuHeight < wr.top || top > wr.bottom);
        if (intersects) {
          const leftCandidate = wr.left - menuWidth - 12;
          if (leftCandidate >= pad) left = leftCandidate;
          else {
            const below = wr.bottom + 10;
            if (below + menuHeight < window.innerHeight - pad) top = below;
          }
        }
      }

      if (top + menuHeight > window.innerHeight - pad) top = Math.max(pad, br.top - menuHeight - 9);
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    };

    const closeMenu = () => {
      menu.hidden = true;
      menuButton?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('ax-theme-menu-open');
    };
    const openMenu = () => {
      menu.hidden = false;
      menuButton?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('ax-theme-menu-open');
      requestAnimationFrame(positionMenu);
    };

    menuButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    menu.querySelectorAll('[data-theme]').forEach((button) => {
      button.addEventListener('click', () => { applyTheme(button.dataset.theme); closeMenu(); });
    });
    modeToggle?.addEventListener('click', () => {
      const active = currentTheme();
      applyTheme(active === 'dark' ? 'tactical' : 'dark');
    });
    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', positionMenu, { passive:true });
    window.addEventListener('scroll', positionMenu, { passive:true });
  }

  function decorateNavigationIcons() {
    document.querySelectorAll('#sb-nav a').forEach((link) => {
      if (link.querySelector('.ax-nav-icon')) return;
      if (link.children.length) return;

      const text = String(link.textContent || '').trim();
      const splitAt = text.indexOf(' ');
      if (splitAt <= 0) return;
      const icon = text.slice(0, splitAt).trim();
      const label = text.slice(splitAt + 1).trim();
      if (!icon || !label) return;

      link.textContent = '';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'ax-nav-icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ax-nav-label';
      labelSpan.textContent = label;
      link.append(iconSpan, labelSpan);
    });
  }

  function initialize() {
    createThemeControls();
    decorateNavigationIcons();
    applyTheme(currentTheme(), { persist:false });
    document.documentElement.classList.add('ax-theme-ready');
  }

  window.AxoriinPanelThemes = { version:VERSION, themes:THEMES, get:currentTheme, set:applyTheme };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
  else initialize();
})();
