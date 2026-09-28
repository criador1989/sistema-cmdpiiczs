
'use strict';

(() => {
  const VERSION = '2.2.3';
  const THEME = 'galaxy';

  const CARD_ART = {
    cardCadastrarAluno: '/assets/painel/galaxia/card-cadastro.png',
    cardObservacoesProfessor: '/assets/painel/galaxia/card-notificacoes.png',
    cardControleAcesso: '/assets/painel/galaxia/card-acesso.png',
    cardVerNotificacoes: '/assets/painel/galaxia/card-notificacoes.png',
    cardControleNotificacoes: '/assets/painel/galaxia/card-controle-notificacoes.png',
    cardRankingAlunos: '/assets/painel/galaxia/card-ranking.png',
    cardAlamar: '/assets/painel/galaxia/card-alamar.png',
    cardEstatisticas: '/assets/painel/galaxia/card-estatisticas.png',
    cardFinanceiro: '/assets/painel/galaxia/card-financeiro.png',
    cardUniformes: '/assets/painel/galaxia/card-uniformes.png',
    cardAssociacao: '/assets/painel/galaxia/card-cadastro.png',
    cardTransferirTurma: '/assets/painel/galaxia/card-estatisticas.png',
    cardPedagogico: '/assets/painel/galaxia/orbital-core.png',
    cardSimulados: '/assets/painel/galaxia/card-ranking.png',
    cardGestaoRedacao: '/assets/painel/galaxia/card-estatisticas.png'
  };

  const CARD_COPY = {
    cardCadastrarAluno: 'Gestão de alunos e matrículas.',
    cardObservacoesProfessor: 'Registros pedagógicos e acompanhamento.',
    cardControleAcesso: 'Entradas, iDFace Max, vínculos e simulador.',
    cardVerNotificacoes: 'Avisos, comunicados e registros.',
    cardControleNotificacoes: 'Gestão e acompanhamento das notificações.',
    cardRankingAlunos: 'Desempenho, evolução e resultados.',
    cardAlamar: 'Apuração e acompanhamento semestral.',
    cardEstatisticas: 'Indicadores e análises da escola.',
    cardFinanceiro: 'Gestão financeira e acompanhamento.',
    cardUniformes: 'Importação PDF, fornecedores, conferência e relatórios.',
    cardAssociacao: 'Gestão integrada das associações.',
    cardTransferirTurma: 'Transferências organizadas entre turmas.',
    cardPedagogico: 'Planejamento, currículo e acompanhamento.',
    cardSimulados: 'Avaliações, diagnósticos e resultados.',
    cardGestaoRedacao: 'Acompanhamento e gestão das redações.'
  };

  function ensureHero(){
    const painel = document.querySelector('.painel');
    const metrics = document.getElementById('metrics');
    if (!painel || !metrics) return;
    let hero = document.getElementById('axGalaxyHero');
    if (!hero) {
      hero = document.createElement('section');
      hero.id = 'axGalaxyHero';
      hero.className = 'ax-galaxy-hero';
      hero.innerHTML = `
        <div class="ax-galaxy-hero-copy">
          <div class="ax-galaxy-eyebrow">Axoriin • Sistema Escolar</div>
          <h2>Gestão escolar em <span>uma nova dimensão.</span></h2>
          <p>Dados, pessoas e processos conectados em um ambiente moderno, intuitivo e pensado para transformar informação em decisões.</p>
        </div>
        <div class="ax-galaxy-orbit" aria-hidden="true">
          <img src="/assets/painel/galaxia/orbital-core.png" alt="">
        </div>`;
      metrics.insertAdjacentElement('beforebegin', hero);
    }
  }

  function ensureSectionHead(){
    const menu = document.getElementById('menuWindows');
    if (!menu) return;
    if (document.getElementById('axGalaxySectionHead')) return;
    const head = document.createElement('div');
    head.id = 'axGalaxySectionHead';
    head.className = 'ax-galaxy-section-head';
    head.innerHTML = '<div><h2>Módulos do sistema</h2><p>Escolha uma área para continuar.</p></div><p>Interface integrada • acesso rápido</p>';
    menu.insertAdjacentElement('beforebegin', head);
  }

  function decorateCards(){
    Object.entries(CARD_ART).forEach(([id, src]) => {
      const card = document.getElementById(id);
      if (!card) return;
      const holder = card.querySelector('.window-content') || card;
      if (!card.querySelector('.ax-galaxy-card-art')) {
        const img = document.createElement('img');
        img.className = 'ax-galaxy-card-art';
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = src;
        holder.appendChild(img);
      }
      const copy = card.querySelector('.card-copy');
      if (copy && !copy.querySelector('p') && !copy.querySelector('.ax-galaxy-card-description')) {
        const p = document.createElement('p');
        p.className = 'ax-galaxy-card-description';
        p.textContent = CARD_COPY[id] || 'Acesso rápido ao módulo.';
        copy.appendChild(p);
      }
    });
  }

  function prepare(){
    ensureHero();
    ensureSectionHead();
    decorateCards();
    document.documentElement.dataset.galaxyRebuildVersion = VERSION;
  }

  function sync(){
    /* Não altera dados, APIs, intervalos, handlers ou DOM funcional. */
    if (document.documentElement.dataset.axTheme === THEME) prepare();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepare, {once:true});
  else prepare();
  window.addEventListener('axoriin:themechange', sync);
})();


/* ==========================================================
   v2.2.3 - RECONCILIADOR DE VISIBILIDADE DOS MODULOS
   Importante:
   - nao consulta API;
   - nao altera permissoes;
   - nao muda dados;
   - usa SOMENTE o display inline definido pelo painel original
     para saber quais cards a permissao deixou visiveis/ocultos;
   - atua apenas quando o tema Galaxy esta ativo.
   ========================================================== */
(() => {
  const THEME = 'galaxy';
  const STYLE_ID = 'axGalaxyCardVisibilityV223';
  const timers = [];

  function isGalaxy(){
    return document.documentElement.dataset.axTheme === THEME;
  }

  function escapeId(id){
    try { return CSS.escape(id); } catch { return String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  }

  function reconcile(){
    const old = document.getElementById(STYLE_ID);
    if (!isGalaxy()) {
      old?.remove();
      return;
    }

    const cards = Array.from(document.querySelectorAll('#menuWindows .window-card[id]'));
    if (!cards.length) return;

    const visible = [];
    const hidden = [];

    cards.forEach(card => {
      // O painel original usa style.display='none' para negar um card.
      // Qualquer outro valor (vazio, block, flex etc.) significa permitido.
      const inlineDisplay = String(card.style.getPropertyValue('display') || '').trim().toLowerCase();
      if (inlineDisplay === 'none') hidden.push(card.id);
      else visible.push(card.id);
    });

    const selector = id => `html[data-ax-theme="galaxy"] body #menuWindows #${escapeId(id)}.window-card`;
    const rules = [];

    if (visible.length) {
      rules.push(`${visible.map(selector).join(',\n')}{display:block!important;visibility:visible!important;opacity:1!important;}`);
    }
    if (hidden.length) {
      rules.push(`${hidden.map(selector).join(',\n')}{display:none!important;}`);
    }

    let style = old;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
    }
    style.textContent = rules.join('\n');
    // Por ser inserido no fim do HEAD, vence folhas antigas carregadas antes.
    document.head.appendChild(style);

    document.documentElement.dataset.galaxyCardVisibility = `${visible.length}/${cards.length}`;
  }

  function schedule(){
    timers.splice(0).forEach(clearTimeout);
    // A permissao do painel e assincrona. As tres passagens sao limitadas
    // e nao criam observer permanente.
    [500, 1400, 3200].forEach(ms => timers.push(setTimeout(reconcile, ms)));
  }

  window.addEventListener('axoriin:themechange', () => {
    reconcile();
    schedule();
  });
  window.addEventListener('load', schedule, {once:true});
  if (document.readyState === 'complete') schedule();
  else if (document.readyState !== 'loading') schedule();
})();
