/* Axoriin Living Galaxy v2.6.2 — Final Seamless Polish.
   Camada visual isolada: sem fetch, tenant, permissões ou regras de negócio. */
'use strict';
(()=>{
  const THEME='galaxy';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let canvas,ctx,W=0,H=0,dpr=1,stars=[],raf=0,idleTimer=0;

  const isGalaxy=()=>document.documentElement.dataset.axTheme===THEME;

  function ensureLayers(){
    if(!document.querySelector('.ax-gx-living-bg')){
      const d=document.createElement('div');
      d.className='ax-gx-living-bg';
      d.setAttribute('aria-hidden','true');
      d.innerHTML='<div class="ax-gx-atmo ax-gx-atmo-a"></div><div class="ax-gx-atmo ax-gx-atmo-b"></div>';
      document.body.appendChild(d);
    }
    if(!canvas){
      canvas=document.createElement('canvas');
      canvas.className='ax-experience-canvas';
      canvas.setAttribute('aria-hidden','true');
      document.body.appendChild(canvas);
      ctx=canvas.getContext('2d');
      resize();
    }
  }

  function resize(){
    if(!canvas)return;
    dpr=Math.min(devicePixelRatio||1,1.5);
    W=innerWidth;H=innerHeight;
    canvas.width=W*dpr;canvas.height=H*dpr;
    canvas.style.width=W+'px';canvas.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const n=innerWidth<700?30:62;
    stars=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H,z:.25+Math.random()*.75,r:.25+Math.random()*1.15,p:Math.random()*6.28,v:.006+Math.random()*.016}));
  }

  function draw(t){
    if(!ctx)return;
    ctx.clearRect(0,0,W,H);
    if(isGalaxy()){
      for(const s of stars){
        const a=.07+.30*(.5+.5*Math.sin(t*.001+s.p));
        ctx.beginPath();ctx.fillStyle=`rgba(151,226,255,${a})`;ctx.arc(s.x,s.y,s.r*s.z,0,Math.PI*2);ctx.fill();
        if(!reduced){s.x+=s.v*s.z;if(s.x>W+3)s.x=-3;}
      }
    }
    raf=requestAnimationFrame(draw);
  }

  function parallax(e){
    if(!isGalaxy()||reduced)return;
    const x=(e.clientX/innerWidth-.5)*2,y=(e.clientY/innerHeight-.5)*2;
    document.documentElement.style.setProperty('--gx-px',x.toFixed(3));
    document.documentElement.style.setProperty('--gx-py',y.toFixed(3));
  }

  function resetIdle(){
    clearTimeout(idleTimer);
    document.documentElement.classList.remove('ax-gx-idle');
    idleTimer=setTimeout(()=>{if(isGalaxy())document.documentElement.classList.add('ax-gx-idle')},8000);
  }

  function setupCards(){
    document.querySelectorAll('#menuWindows .window-card').forEach(card=>{
      if(card.dataset.gxExperience==='262')return;
      card.dataset.gxExperience='262';
      card.addEventListener('pointermove',e=>{
        if(!isGalaxy()||reduced||e.pointerType==='touch')return;
        const r=card.getBoundingClientRect();
        const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
        card.style.setProperty('--gx-tilt-x',(-y*2.2).toFixed(2)+'deg');
        card.style.setProperty('--gx-tilt-y',(x*2.8).toFixed(2)+'deg');
        card.style.setProperty('--gx-local-x',x.toFixed(3));
        card.style.setProperty('--gx-local-y',y.toFixed(3));
        card.classList.add('ax-gx-tilt');
      },{passive:true});
      card.addEventListener('pointerleave',()=>card.classList.remove('ax-gx-tilt'),{passive:true});
      card.addEventListener('pointerdown',()=>{
        if(!isGalaxy())return;
        card.classList.remove('ax-gx-launch');void card.offsetWidth;card.classList.add('ax-gx-launch');
      },{passive:true});
    });
  }

  function setupRadial(){
    const nav=document.querySelector('.ax-radial-nav');
    if(!nav||nav.dataset.gxExperience==='262')return;
    nav.dataset.gxExperience='262';
    nav.querySelectorAll('.ax-radial-item').forEach((el,i)=>el.style.setProperty('--gx-i',i));
    document.addEventListener('click',e=>{
      if(e.target.closest('.ax-radial-fab,.ax-radial-backdrop,.ax-radial-item')){
        requestAnimationFrame(()=>nav.classList.toggle('ax-gx-constellation',nav.classList.contains('open')));
      }
    },true);
  }

  function setupMetrics(){
    ['mAlunos','mNotif','mMedia'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el||el.dataset.gxExperience==='262')return;
      el.dataset.gxExperience='262';
      let last=el.textContent;
      new MutationObserver(()=>{
        const now=el.textContent;
        if(now===last||!isGalaxy())return;
        last=now;
        const card=el.closest('.metric');if(!card)return;
        card.classList.remove('ax-gx-data-pulse');void card.offsetWidth;card.classList.add('ax-gx-data-pulse');
      }).observe(el,{childList:true,characterData:true,subtree:true});
    });
  }

  function setupArrival(arriving){
    if(!arriving)return;
    const d=document.createElement('div');
    d.className='ax-gx-portal-handoff';
    d.setAttribute('aria-hidden','true');
    d.innerHTML='<div class="ax-gx-handoff-ring"></div><img class="ax-gx-handoff-orb" src="/assets/painel/galaxia/living/axoriin-orb.png" alt="">';
    document.body.appendChild(d);
    requestAnimationFrame(()=>requestAnimationFrame(()=>d.classList.add('ax-gx-handoff-land')));
    setTimeout(()=>d.classList.add('ax-gx-handoff-fade'),1180);
    setTimeout(()=>d.remove(),2300);
  }

  function setupMetricGate(enabled){
    if(!enabled)return;
    const root=document.documentElement;
    const ids=['mAlunos','mNotif','mMedia'];
    const els=ids.map(id=>document.getElementById(id)).filter(Boolean);
    if(els.length!==3)return;

    root.classList.add('ax-gx-metrics-loading');
    document.querySelectorAll('#metrics .metric').forEach(card=>{
      if(card.querySelector('.ax-gx-metric-skeleton'))return;
      const sk=document.createElement('span');
      sk.className='ax-gx-metric-skeleton';
      sk.setAttribute('aria-hidden','true');
      card.appendChild(sk);
    });

    const started=performance.now();
    let quietTimer=0,revealed=false;
    const reveal=()=>{
      if(revealed)return;
      revealed=true;
      root.classList.remove('ax-gx-metrics-loading');
      root.classList.add('ax-gx-metrics-revealed');
      document.querySelectorAll('.ax-gx-metric-skeleton').forEach(n=>n.remove());
      document.querySelectorAll('#metrics .metric').forEach((card,i)=>{
        setTimeout(()=>{card.classList.remove('ax-gx-data-pulse');void card.offsetWidth;card.classList.add('ax-gx-data-pulse')},i*90);
      });
      setTimeout(()=>root.classList.remove('ax-gx-metrics-revealed'),1300);
      observers.forEach(o=>o.disconnect());
    };
    const schedule=()=>{
      clearTimeout(quietTimer);
      const elapsed=performance.now()-started;
      const wait=Math.max(820,2400-elapsed);
      quietTimer=setTimeout(reveal,wait);
    };
    const observers=els.map(el=>{
      const o=new MutationObserver(schedule);
      o.observe(el,{childList:true,characterData:true,subtree:true});
      return o;
    });
    schedule();
    setTimeout(reveal,5200);
  }

  function sync(){ensureLayers();setupCards();setupRadial();setupMetrics();resetIdle();}

  function init(){
    const arriving=sessionStorage.getItem('axoriin:cinematic-arrival')==='1';
    const metricGate=sessionStorage.getItem('axoriin:metric-gate')==='1';
    sessionStorage.removeItem('axoriin:cinematic-arrival');
    sessionStorage.removeItem('axoriin:metric-gate');

    ensureLayers();
    setupArrival(arriving);
    setupMetricGate(metricGate);
    addEventListener('resize',resize,{passive:true});
    addEventListener('pointermove',e=>{parallax(e);resetIdle()},{passive:true});
    ['keydown','pointerdown','touchstart','scroll'].forEach(ev=>addEventListener(ev,resetIdle,{passive:true}));
    window.addEventListener('axoriin:themechange',sync);
    sync();
    if(!raf)raf=requestAnimationFrame(draw);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
