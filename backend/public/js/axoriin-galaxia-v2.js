
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

/* === AXORIIN GALAXIA VIVO CORE V2.2.4 START === */
(()=>{
  'use strict';

  const VERSION='2.2.4';
  const ROOT=document.documentElement;

  let hero=null;
  let orbit=null;
  let canvas=null;
  let ctx=null;
  let ro=null;
  let raf=0;
  let w=0;
  let h=0;
  let dpr=1;
  let stars=[];

  function isGalaxy(){
    return ROOT.dataset.axTheme==='galaxy';
  }

  function mk(cls){
    const el=document.createElement('div');
    el.className=cls;
    el.setAttribute('aria-hidden','true');
    return el;
  }

  function ensure(){
    hero=document.querySelector('.ax-galaxy-hero');
    orbit=document.querySelector('.ax-galaxy-orbit');
    if(!hero || !orbit) return false;

    if(!hero.querySelector('.ax-galaxy-live-stars')){
      hero.appendChild(mk('ax-galaxy-live-nebula a'));
      hero.appendChild(mk('ax-galaxy-live-nebula b'));

      canvas=document.createElement('canvas');
      canvas.className='ax-galaxy-live-stars';
      canvas.setAttribute('aria-hidden','true');
      hero.appendChild(canvas);

      hero.appendChild(mk('ax-galaxy-live-flyer a'));
      hero.appendChild(mk('ax-galaxy-live-flyer b'));

      orbit.appendChild(mk('ax-galaxy-live-ring r1'));
      orbit.appendChild(mk('ax-galaxy-live-ring r2'));
      orbit.appendChild(mk('ax-galaxy-live-ring r3'));
      orbit.appendChild(mk('ax-galaxy-live-runner a'));
      orbit.appendChild(mk('ax-galaxy-live-runner b'));
      orbit.appendChild(mk('ax-galaxy-live-runner c'));
    }else{
      canvas=hero.querySelector('.ax-galaxy-live-stars');
    }

    ctx=canvas?.getContext('2d',{alpha:true,desynchronized:true}) || null;
    if(!ctx) return false;

    if(!ro && 'ResizeObserver' in window){
      ro=new ResizeObserver(resize);
      ro.observe(hero);
    }

    if(!hero.dataset.axGalaxyLiveBound){
      hero.dataset.axGalaxyLiveBound='1';
      hero.addEventListener('mousemove',onMouseMove,{passive:true});
      hero.addEventListener('mouseleave',onMouseLeave,{passive:true});
    }

    resize();
    return true;
  }

  function resize(){
    if(!hero || !canvas || !ctx) return;
    const r=hero.getBoundingClientRect();
    w=r.width;
    h=r.height;
    if(!w || !h) return;

    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(w*dpr));
    canvas.height=Math.max(1,Math.round(h*dpr));
    canvas.style.width=`${w}px`;
    canvas.style.height=`${h}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const mobile=w<=760;
    stars=Array.from({length:mobile?12:20},()=>({
      x:w*(.43+Math.random()*.52),
      y:h*(.06+Math.random()*.88),
      r:.35+Math.random()*.95,
      a:.15+Math.random()*.45,
      dx:(Math.random()-.5)*.032,
      dy:(Math.random()-.5)*.022,
      phase:Math.random()*Math.PI*2,
      speed:.008+Math.random()*.012
    }));
  }

  function draw(){
    if(!ctx || !isGalaxy() || document.hidden){
      raf=0;
      return;
    }

    ctx.clearRect(0,0,w,h);

    for(const s of stars){
      s.x+=s.dx;
      s.y+=s.dy;
      s.phase+=s.speed;

      if(s.x<w*.40) s.x=w*.97;
      if(s.x>w+4) s.x=w*.43;
      if(s.y<0) s.y=h;
      if(s.y>h) s.y=0;

      const alpha=s.a*(.58+.42*Math.sin(s.phase));

      ctx.beginPath();
      ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(178,231,255,${alpha})`;
      ctx.shadowColor='rgba(105,195,255,.75)';
      ctx.shadowBlur=6;
      ctx.fill();
    }

    ctx.shadowBlur=0;
    raf=requestAnimationFrame(draw);
  }

  function start(){
    if(!raf && isGalaxy() && !document.hidden){
      raf=requestAnimationFrame(draw);
    }
  }

  function stop(){
    if(raf){
      cancelAnimationFrame(raf);
      raf=0;
    }
    if(ctx) ctx.clearRect(0,0,w,h);
    if(orbit) orbit.style.transform='';
  }

  function onMouseMove(e){
    if(window.innerWidth<900 || !isGalaxy() || !orbit) return;
    const r=hero.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5;
    const y=(e.clientY-r.top)/r.height-.5;
    orbit.style.transform=`translate3d(${x*5}px,${y*3}px,0)`;
  }

  function onMouseLeave(){
    if(orbit) orbit.style.transform='';
  }

  function activate(){
    if(!isGalaxy()){
      stop();
      return false;
    }

    if(!ensure()) return false;
    ROOT.dataset.galaxyLiveVersion=VERSION;
    resize();
    start();
    return true;
  }

  function init(){
    activate();

    // O hero Galaxy é criado dinamicamente pelo bloco anterior do mesmo arquivo.
    [120,350,850,1600].forEach(ms=>setTimeout(activate,ms));

    window.addEventListener('resize',resize,{passive:true});
    window.addEventListener('axoriin:themechange',()=>setTimeout(activate,60));

    document.addEventListener('visibilitychange',()=>{
      if(document.hidden) stop();
      else activate();
    });

    const mo=new MutationObserver(()=>{
      if(isGalaxy()) activate();
      else stop();
    });
    mo.observe(ROOT,{attributes:true,attributeFilter:['data-ax-theme']});
  }

  window.AxoriinGalaxyLive={
    version:VERSION,
    refresh:activate,
    stop,
    status:()=>({
      version:VERSION,
      galaxy:isGalaxy(),
      hero:!!document.querySelector('.ax-galaxy-hero'),
      canvas:!!document.querySelector('.ax-galaxy-live-stars'),
      running:!!raf,
      width:w,
      height:h
    })
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
/* === AXORIIN GALAXIA VIVO CORE V2.2.4 END === */
