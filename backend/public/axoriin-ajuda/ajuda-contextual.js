(function(){
  'use strict';

  if (window.__AXORIIN_HELP_LOADED__) return;
  window.__AXORIIN_HELP_LOADED__ = true;

  const registry = window.AXORIIN_HELP_CONTENT || {};
  const pageKey = (location.pathname.split('/').pop() || 'painel.html').toLowerCase();
  const content = registry[pageKey] || registry.default || {};
  const seenKey = `axoriin_help_seen:${pageKey}`;

  function el(tag, cls, attrs){
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    return node;
  }

  function appendTextList(container, items, cls, itemTag){
    (items || []).forEach(text => {
      const item = el(itemTag || 'div', cls);
      item.textContent = text;
      container.appendChild(item);
    });
  }

  function buildRoot(){
    const root = el('div', '', { id:'axoriin-help-root' });
    const backdrop = el('div', 'axh-backdrop');
    const panel = el('aside', 'axh-panel', {
      role:'dialog',
      'aria-modal':'true',
      'aria-label':'Assistente de página do Axoriin',
      'aria-hidden':'true'
    });

    const header = el('div', 'axh-header');
    const brand = el('div', 'axh-brand');
    const brandImg = el('img', '', { src:'/icons/axoriin-192x192.png', alt:'Axoriin' });
    brandImg.onerror = () => { brandImg.src = '/assets/img/logo-axoriin.png'; };
    brand.appendChild(brandImg);

    const heading = el('div', 'axh-heading');
    heading.appendChild(el('div', 'axh-kicker', { text:'Assistente de página' }));
    heading.appendChild(el('h2', '', { text:content.title || 'Ajuda desta página' }));

    const close = el('button', 'axh-close', { type:'button', 'aria-label':'Fechar ajuda', text:'×' });
    header.append(brand, heading, close);

    const body = el('div', 'axh-content');
    body.appendChild(el('div', 'axh-page-summary', { text:content.summary || registry.default?.summary || '' }));

    if (content.steps?.length) {
      const section = el('section', 'axh-section');
      section.appendChild(el('h3', 'axh-section-title', { html:'<span>01</span> Como usar esta página' }));
      const steps = el('div', 'axh-steps');
      appendTextList(steps, content.steps, 'axh-step');
      section.appendChild(steps);
      body.appendChild(section);
    }

    if (content.tips?.length) {
      const section = el('section', 'axh-section');
      section.appendChild(el('h3', 'axh-section-title', { html:'<span>02</span> Dicas rápidas' }));
      const list = el('ul', 'axh-tips');
      appendTextList(list, content.tips, '', 'li');
      section.appendChild(list);
      body.appendChild(section);
    }

    if (content.warning) {
      const section = el('section', 'axh-section');
      section.appendChild(el('h3', 'axh-section-title', { html:'<span>!</span> Atenção' }));
      section.appendChild(el('div', 'axh-alert', { text:content.warning }));
      body.appendChild(section);
    }

    body.appendChild(el('div', 'axh-privacy', { text:'Estas orientações são exibidas no navegador. O assistente não envia dados nem executa ações no sistema.' }));

    const actions = el('div', 'axh-actions');
    const tourBtn = el('button', 'axh-btn axh-btn-secondary', { type:'button', text:'Fazer tour' });
    if (!content.tour?.length) tourBtn.hidden = true;
    const understood = el('button', 'axh-btn axh-btn-primary', { type:'button', text:'Entendi' });
    actions.append(tourBtn, understood);

    panel.append(header, body, actions);
    root.append(backdrop, panel);
    document.body.appendChild(root);

    return { root, backdrop, panel, close, understood, tourBtn };
  }

  function getLauncher(){
    const existing = document.getElementById('smartclass-mascote');
    if (existing) {
      existing.classList.add('ax-help-launcher-existing');
      existing.removeAttribute('aria-hidden');
      existing.setAttribute('role','button');
      existing.setAttribute('tabindex','0');
      existing.setAttribute('aria-label','Abrir ajuda desta página');
      existing.setAttribute('title','Ajuda desta página');
      return existing;
    }

    const button = el('button', '', {
      id:'axoriin-help-launcher',
      type:'button',
      'aria-label':'Abrir ajuda desta página',
      title:'Ajuda desta página'
    });
    const img = el('img','',{ src:'/icons/axoriin-192x192.png', alt:'' });
    img.onerror = () => { img.src = '/assets/img/logo-axoriin.png'; };
    button.appendChild(img);
    document.body.appendChild(button);
    return button;
  }

  function init(){
    const ui = buildRoot();
    const launcher = getLauncher();
    const tooltip = el('div','axh-tooltip',{ text:'Ajuda desta página' });
    document.body.appendChild(tooltip);
    let lastFocused = null;

    function showTooltip(){ tooltip.classList.add('axh-show'); }
    function hideTooltip(){ tooltip.classList.remove('axh-show'); }

    launcher.addEventListener('mouseenter', showTooltip);
    launcher.addEventListener('mouseleave', hideTooltip);
    launcher.addEventListener('focus', showTooltip);
    launcher.addEventListener('blur', hideTooltip);

    function openPanel(){
      lastFocused = document.activeElement;
      ui.backdrop.classList.add('axh-open');
      ui.panel.classList.add('axh-open');
      ui.panel.setAttribute('aria-hidden','false');
      document.documentElement.style.setProperty('--axh-open','1');
      hideTooltip();
      setTimeout(() => ui.close.focus(), 50);
    }

    function closePanel(){
      ui.backdrop.classList.remove('axh-open');
      ui.panel.classList.remove('axh-open');
      ui.panel.setAttribute('aria-hidden','true');
      document.documentElement.style.removeProperty('--axh-open');
      if (lastFocused?.focus) lastFocused.focus();
    }

    launcher.addEventListener('click', openPanel);
    launcher.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openPanel();
      }
    });
    ui.close.addEventListener('click', closePanel);
    ui.backdrop.addEventListener('click', closePanel);
    ui.understood.addEventListener('click', () => {
      localStorage.setItem(seenKey, '1');
      launcher.classList.remove('axh-attention');
      closePanel();
    });
    ui.tourBtn.addEventListener('click', () => {
      closePanel();
      startTour(content.tour || []);
    });

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') {
        if (document.querySelector('.axh-tour-layer')) closeTour();
        else closePanel();
      }
    });

    if (!localStorage.getItem(seenKey)) {
      launcher.classList.add('axh-attention');
      setTimeout(() => launcher.classList.remove('axh-attention'), 6500);
    }
  }

  let tourState = null;

  function visibleElement(selector){
    if (!selector) return null;
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      return null;
    }
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width > 4 && rect.height > 4 && style.display !== 'none' && style.visibility !== 'hidden') return node;
    }
    return null;
  }

  function startTour(entries){
    const steps = (entries || []).map(item => ({...item, node:visibleElement(item.selector)})).filter(item => item.node);
    if (!steps.length) return;
    tourState = { steps, index:0 };

    const layer = el('div','axh-tour-layer');
    const spot = el('div','axh-tour-spotlight');
    const card = el('div','axh-tour-card');
    layer.append(spot, card);
    document.body.appendChild(layer);
    tourState.layer = layer;
    tourState.spot = spot;
    tourState.card = card;

    const update = () => renderTourStep();
    tourState.update = update;
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    renderTourStep();
  }

  function renderTourStep(){
    if (!tourState) return;
    const { steps, index, spot, card } = tourState;
    const step = steps[index];
    if (!step?.node?.isConnected) return closeTour();

    step.node.scrollIntoView({ block:'center', inline:'nearest', behavior:'smooth' });
    setTimeout(() => {
      if (!tourState) return;
      const r = step.node.getBoundingClientRect();
      const pad = 7;
      spot.style.left = `${Math.max(4, r.left-pad)}px`;
      spot.style.top = `${Math.max(4, r.top-pad)}px`;
      spot.style.width = `${Math.min(innerWidth-8, r.width+pad*2)}px`;
      spot.style.height = `${Math.min(innerHeight-8, r.height+pad*2)}px`;

      card.innerHTML = '';
      card.appendChild(el('h3','',{ text:step.title || 'Dica' }));
      card.appendChild(el('p','',{ text:step.text || '' }));
      card.appendChild(el('div','axh-tour-count',{ text:`${index+1} de ${steps.length}` }));
      const actions = el('div','axh-tour-actions');
      const exit = el('button','',{ type:'button', text:'Sair' });
      const prev = el('button','',{ type:'button', text:'Voltar' });
      const next = el('button','axh-tour-next',{ type:'button', text:index === steps.length-1 ? 'Concluir' : 'Próximo' });
      prev.disabled = index === 0;
      exit.addEventListener('click', closeTour);
      prev.addEventListener('click', () => { tourState.index--; renderTourStep(); });
      next.addEventListener('click', () => {
        if (tourState.index >= tourState.steps.length-1) closeTour();
        else { tourState.index++; renderTourStep(); }
      });
      actions.append(exit, prev, next);
      card.appendChild(actions);

      const cardRect = card.getBoundingClientRect();
      let left = Math.min(innerWidth-cardRect.width-12, Math.max(12, r.left));
      let top = r.bottom + 14;
      if (top + cardRect.height > innerHeight - 12) top = Math.max(12, r.top - cardRect.height - 14);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }, 180);
  }

  function closeTour(){
    if (!tourState) return;
    window.removeEventListener('resize', tourState.update);
    window.removeEventListener('scroll', tourState.update, true);
    tourState.layer?.remove();
    tourState = null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
