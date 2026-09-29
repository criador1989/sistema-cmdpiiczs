/* AXORIIN Verde Tático Premium v3.0.9
   Base estável do v3.0.8, com banner premium completo aplicado como arte principal.
   NÃO faz fetch, NÃO recalcula dados, NÃO altera tenant/API/auth/permissões. */
'use strict';
(()=>{
  const VERSION='3.0.9';
  const ASSET='/assets/painel/tactical-v309/';
  const html=document.documentElement;
  const cards={
    cardCadastrarAluno:['MÓDULO','Cadastrar Aluno','Gestão de alunos e matrículas.','cap.svg',1,'#38efbd'],
    cardControleAcesso:['ACESSO INTELIGENTE','Controle de Acesso','Entradas, iDFace Max, vínculos e simulador.','lock.svg',2,'#42dbff'],
    cardVerNotificacoes:['PAINEL','Ver Notificações','Avisos, comunicados e registros.','notif.svg',3,'#a879ff'],
    cardControleNotificacoes:['GESTÃO','Controle de Notificações','Gestão e acompanhamento das notificações.','file.svg',4,'#ffc24b'],
    cardRankingAlunos:['CLASSIFICAÇÃO','Ranking de Alunos','Desempenho, evolução e resultados.','trophy.svg',5,'#38efbd'],
    cardAlamar:['APURAÇÃO SEMESTRAL','Aluno Alamar','Apuração e acompanhamento semestral.','group.svg',6,'#42dbff'],
    cardEstatisticas:['DASHBOARD','Painel de Estatísticas','Indicadores e relatórios da instituição.','chart.svg',7,'#42dbff'],
    cardFinanceiro:['GESTÃO FINANCEIRA','Módulo Financeiro','Mensalidades, cobranças e financeiro.','money.svg',8,'#a879ff'],
    cardUniformes:['GESTÃO DE ENTREGA','Uniformes e Vouchers','Controle de uniformes e vouchers.','shirt.svg',9,'#38efbd'],
    cardAssociacao:['MÓDULO VINCULADO','Axoriin Associação','Gestão da associação e seus membros.','association.svg',10,'#ff7283'],
    cardTransferirTurma:['AÇÃO','Transferir Turma','Movimentação de alunos entre turmas.','swap.svg',11,'#42dbff'],
    cardPedagogico:['PEDAGÓGICO','Axoriin Pedagógico','Planejamento, conteúdos e acompanhamento pedagógico.','book.svg',12,'#ffc24b'],
    cardObservacoesProfessor:['REGISTRO RÁPIDO','Observações dos Professores','Registros pedagógicos e acompanhamento.','mic.svg',13,'#38efbd'],
    cardSimulados:['DIAGNÓSTICO PEDAGÓGICO','Análise de Simulados','Áreas, habilidades, fragilidades e grupos de intervenção.','chart.svg',14,'#42dbff'],
    cardGestaoRedacao:['PEDAGÓGICO','Painel ENEM — Redação','Acompanhamento e gestão das redações.','pencil.svg',15,'#ffc24b']
  };
  const metricDefs=[
    ['metricAlunos','mAlunos','mAlunosPct','Alunos ativos','students.svg'],
    ['metricNotif','mNotif','mNotifPct','Notificações pendentes','bell.svg'],
    ['metricMedia','mMedia','mMediaPct','Comportamento médio','chart.svg']
  ];
  const metricObservers=[];
  const permissionTimers=[];

  function isTactical(){ return document.documentElement.dataset.axTheme==='tactical'; }

  function cleanLegacyInjected(){
    document.querySelectorAll(
      '.ax-tactical-bg,.ax-tactical-hero,.ax-tactical-modules-head,.ax-tactical-metric-ui,.ax-tactical-card-shell,'+
      '.ax-tactical-v304-bg,.ax-tactical-v304-hero,.ax-tactical-v305-bg,.ax-tactical-v305-hero,'+
      '.ax-tactical-v306-bg,.ax-tactical-v306-hero,.ax-tactical-v307-bg,.ax-tactical-v307-hero,'+
      '.ax-tactical-v305-section-head,.ax-tactical-v307-head,.ax-tactical-v307-metric,.ax-tactical-v307-card,'+
      '.ax-tactical-v308-bg,.ax-tactical-v308-hero,.ax-tactical-v308-head,.ax-tactical-v308-metric,.ax-tactical-v308-card,'+
      '.ax-galaxy-card-art,#axGalaxyHero,#axGalaxySectionHead'
    ).forEach(el=>el.remove());
    html.classList.remove('ax-tac-v302-ready','ax-tac-v303-ready','ax-tac-v304-ready','ax-tac-v305-ready','ax-tac-v306-ready','ax-tac-v307-ready','ax-tac-v308-ready');
  }

  function ensureBg(){
    if(document.querySelector('.ax-tactical-v309-bg')) return;
    const bg=document.createElement('div');
    bg.className='ax-tactical-v309-bg';
    bg.setAttribute('aria-hidden','true');
    document.body.appendChild(bg);
  }

  function ensureHero(){
    if(document.querySelector('.ax-tactical-v309-hero')) return true;
    const metrics=document.getElementById('metrics');
    if(!metrics || !metrics.parentNode) return false;
    const hero=document.createElement('section');
    hero.className='ax-tactical-v309-hero';
    hero.innerHTML=`<div class="ax-tactical-v309-copy">
      <div class="ax-tactical-v309-eyebrow">AXORIIN • SISTEMA ESCOLAR</div>
      <h2>Gestão escolar em <span>uma nova dimensão.</span></h2>
      <p>Dados, pessoas e processos conectados em um ambiente moderno, intuitivo e pensado para transformar informação em decisões.</p>
      <div class="ax-tactical-v309-chips" aria-hidden="true"><span>Organização</span><span>Desempenho</span><span>Resultados</span></div>
    </div>`;
    metrics.parentNode.insertBefore(hero,metrics);
    return true;
  }

  function ensureMetrics(){
    let ok=0;
    metricDefs.forEach(([cardId,valueId,pctId,label,icon])=>{
      const card=document.getElementById(cardId); if(!card) return;
      let ui=card.querySelector('.ax-tactical-v309-metric');
      if(!ui){
        ui=document.createElement('div');
        ui.className='ax-tactical-v309-metric';
        ui.innerHTML=`<div class="ax-tactical-v309-metric-icon"><img src="${ASSET}${icon}" alt=""></div>
          <div class="ax-tactical-v309-metric-copy"><div class="ax-tactical-v309-metric-label">${label}</div><div class="ax-tactical-v309-metric-note">Dados atualizados</div></div>
          <div class="ax-tactical-v309-metric-values"><strong>—</strong><span>—</span></div>`;
        card.appendChild(ui);
      }
      const srcValue=document.getElementById(valueId);
      const srcPct=document.getElementById(pctId);
      const outValue=ui.querySelector('strong');
      const outPct=ui.querySelector('span');
      const sync=()=>{
        if(srcValue && outValue) outValue.textContent=(srcValue.textContent||'—').trim();
        if(srcPct && outPct) outPct.textContent=(srcPct.textContent||'—').trim();
      };
      sync();
      if(srcValue && !srcValue.dataset.tac309Observed){
        const o=new MutationObserver(sync); o.observe(srcValue,{subtree:true,childList:true,characterData:true,attributes:true}); metricObservers.push(o); srcValue.dataset.tac309Observed='1';
      }
      if(srcPct && !srcPct.dataset.tac309Observed){
        const o=new MutationObserver(sync); o.observe(srcPct,{subtree:true,childList:true,characterData:true,attributes:true}); metricObservers.push(o); srcPct.dataset.tac309Observed='1';
      }
      ok++;
    });
    return ok===3;
  }

  function ensureHeader(){
    const menu=document.getElementById('menuWindows'); if(!menu||!menu.parentNode) return false;
    if(!document.querySelector('.ax-tactical-v309-head')){
      const h=document.createElement('div');
      h.className='ax-tactical-v309-head';
      h.innerHTML='<div><h2>Módulos do sistema</h2><p>Escolha uma área para continuar.</p></div><span>Interface integrada • acesso rápido</span>';
      menu.parentNode.insertBefore(h,menu);
    }
    return true;
  }

  function ensureCardShell(card,cfg){
    let shell=card.querySelector('.ax-tactical-v309-card');
    if(shell) return shell;
    const [kicker,title,desc,icon,,accent]=cfg;
    card.style.setProperty('--ax-tac-accent',accent);
    shell=document.createElement('div');
    shell.className='ax-tactical-v309-card';
    shell.innerHTML=`<div class="ax-tactical-v309-card-icon"><img src="${ASSET}${icon}" alt=""></div>
      <div class="ax-tactical-v309-card-copy"><div class="ax-tactical-v309-card-kicker">${kicker}</div><div class="ax-tactical-v309-card-title">${title}</div><p>${desc}</p></div>
      <span class="ax-tactical-v309-card-arrow">›</span>`;
    card.appendChild(shell);
    return shell;
  }

  function reconcilePermissions(){
    const menu=document.getElementById('menuWindows'); if(!menu) return;
    Object.entries(cards).forEach(([id,cfg])=>{
      const card=document.getElementById(id); if(!card) return;
      const inlineDisplay=String(card.style.getPropertyValue('display')||'').trim().toLowerCase();
      card.classList.remove('ax-tac-v309-permitted','ax-tac-v309-denied');
      if(inlineDisplay==='none'){
        card.classList.add('ax-tac-v309-denied');
      }else{
        card.classList.add('ax-tac-v309-permitted');
        card.style.setProperty('--ax-tac-order',String(cfg[4]));
        ensureCardShell(card,cfg);
      }
    });
  }

  function schedulePermissionReconcile(){
    permissionTimers.splice(0).forEach(clearTimeout);
    [0,500,1400,3200].forEach(ms=>permissionTimers.push(setTimeout(reconcilePermissions,ms)));
  }

  function activate(){
    if(!isTactical()){ html.classList.remove('ax-tac-v309-ready'); return false; }
    ensureBg();
    const h=ensureHero();
    const m=ensureMetrics();
    const hd=ensureHeader();
    reconcilePermissions();
    if(h&&m&&hd){ html.classList.add('ax-tac-v309-ready'); return true; }
    return false;
  }

  function init(){
    cleanLegacyInjected();
    activate();
    schedulePermissionReconcile();
    setTimeout(activate,700);
    setTimeout(activate,1800);
    window.addEventListener('axoriin:themechange',()=>setTimeout(()=>{activate();schedulePermissionReconcile();},80));
  }

  window.AxoriinTacticalPremium={version:VERSION,refresh:activate};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();

/* === AXORIIN LIVE HERO CORE V3.2.2 START === */
(()=>{
  'use strict';

  const VERSION='3.2.0';
  const ROOT=document.documentElement;
  const ART={w:2172,h:724};
  const PLANET={cx:1135,cy:329,rx:307,ry:281};

  let hero=null,canvas=null,ctx=null,aura=null,scan=null,ro=null;
  let raf=0,w=0,h=0,dpr=1,t0=performance.now();
  let stars=[],surface=[],orbiters=[],flyers=[],bursts=[];

  function tactical(){
    return ROOT.dataset.axTheme==='tactical' || ROOT.classList.contains('ax-tac-v309-ready');
  }

  function mapArt(){
    const scale=Math.max(w/ART.w,h/ART.h);
    const rw=ART.w*scale, rh=ART.h*scale;
    const ox=(w-rw)/2, oy=(h-rh)/2;
    return {
      cx:ox+PLANET.cx*scale,
      cy:oy+PLANET.cy*scale,
      rx:PLANET.rx*scale,
      ry:PLANET.ry*scale
    };
  }

  function mk(cls){
    const d=document.createElement('div');
    d.className=cls;
    d.setAttribute('aria-hidden','true');
    return d;
  }

  function ensure(){
    hero=document.querySelector('.ax-tactical-v309-hero');
    if(!hero) return false;

    canvas=hero.querySelector('.ax-live-core-canvas');
    if(!canvas){
      aura=mk('ax-live-core-aura');
      scan=mk('ax-live-core-scan');
      canvas=document.createElement('canvas');
      canvas.className='ax-live-core-canvas';
      canvas.setAttribute('aria-hidden','true');
      hero.append(aura,scan,canvas);
    }else{
      aura=hero.querySelector('.ax-live-core-aura');
      scan=hero.querySelector('.ax-live-core-scan');
    }

    ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});

    if(!ro && 'ResizeObserver' in window){
      ro=new ResizeObserver(resize);
      ro.observe(hero);
    }

    resize();
    return true;
  }

  function resize(){
    if(!hero||!canvas||!ctx) return;
    const r=hero.getBoundingClientRect();
    w=r.width; h=r.height;
    if(!w||!h) return;

    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(w*dpr));
    canvas.height=Math.max(1,Math.round(h*dpr));
    canvas.style.width=`${w}px`;
    canvas.style.height=`${h}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const p=mapArt();
    if(aura){
      Object.assign(aura.style,{
        left:`${p.cx-p.rx*1.08}px`,
        top:`${p.cy-p.ry*1.08}px`,
        width:`${p.rx*2.16}px`,
        height:`${p.ry*2.16}px`
      });
    }
    if(scan){
      Object.assign(scan.style,{
        left:`${p.cx-p.rx*.98}px`,
        top:`${p.cy-p.ry*.98}px`,
        width:`${p.rx*1.96}px`,
        height:`${p.ry*1.96}px`
      });
    }

    const mobile=w<=760;
    stars=Array.from({length:mobile?12:18},()=>({
      x:p.cx+(Math.random()*2.75-1.20)*p.rx,
      y:p.cy+(Math.random()*2.20-1.10)*p.ry,
      r:.45+Math.random()*1.45,
      a:.24+Math.random()*.62,
      dx:(Math.random()-.5)*(mobile?.045:.085),
      dy:(Math.random()-.5)*(mobile?.032:.055),
      phase:Math.random()*Math.PI*2
    }));

    surface=Array.from({length:mobile?24:36},()=>({
      lat:-1.04+Math.random()*2.08,
      lon:Math.random()*Math.PI*2,
      size:.50+Math.random()*1.12,
      alpha:.25+Math.random()*.50,
      phase:Math.random()*Math.PI*2
    }));

    orbiters=[
      {sx:1.18,sy:.59,speed:.00027,phase:.10,size:2.10,trail:3},
      {sx:1.40,sy:.45,speed:-.00019,phase:2.15,size:1.95,trail:3},
      {sx:1.13,sy:.79,speed:.00016,phase:4.10,size:1.80,trail:2}
    ];

    flyers=Array.from({length:mobile?2:3},(_,i)=>({
      phase:(i/(mobile?2:3))*Math.PI*2,
      speed:(i%2?-.00010:.00012)*(1+(i%3)*.12),
      rx:1.06+(i%4)*.18,
      ry:.36+(i%3)*.18,
      size:mobile?5.5:7+(i%2)*2
    }));

    bursts=[
      {x:-.45,y:-.16,phase:.2},
      {x:.36,y:.18,phase:3.4}
    ];
  }

  function dot(x,y,r,a,blur=8){
    if(a<=0) return;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=`rgba(174,255,243,${a})`;
    ctx.shadowColor='rgba(111,255,230,.82)';
    ctx.shadowBlur=blur;
    ctx.fill();
  }

  function clipRight(p){
    /* proteção explícita da região textual */
    const left=Math.max(w*.38,p.cx-p.rx*1.50);
    ctx.beginPath();
    ctx.rect(left,0,w-left,h);
    ctx.clip();
  }

  function drawPlanet(now,p){
    const dt=now-t0;
    const rot=dt*(Math.PI*2/54000);

    ctx.save();
    clipRight(p);

    /* grade e pontos restritos ao disco */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.cx,p.cy,p.rx*.97,p.ry*.97,0,0,Math.PI*2);
    ctx.clip();

    ctx.shadowBlur=0;
    ctx.setLineDash([3,10]);
    for(const lat of [-.72,-.48,-.24,0,.24,.48,.72]){
      const yy=p.cy+lat*p.ry;
      const localRx=p.rx*Math.sqrt(Math.max(0,1-lat*lat));
      ctx.beginPath();
      ctx.ellipse(p.cx,yy,localRx,p.ry*.035,0,0,Math.PI*2);
      ctx.strokeStyle='rgba(130,255,238,.055)';
      ctx.lineWidth=.72;
      ctx.stroke();
    }

    for(let i=0;i<10;i++){
      const a=rot+(i/10)*Math.PI*2;
      const xoff=Math.sin(a)*p.rx*.94;
      const squeeze=Math.max(.03,Math.abs(Math.cos(a)));
      ctx.beginPath();
      ctx.ellipse(p.cx+xoff,p.cy,Math.max(1,p.rx*.11*squeeze),p.ry*.95,0,0,Math.PI*2);
      ctx.lineDashOffset=-dt*.004;
      ctx.strokeStyle=`rgba(143,255,241,${Math.cos(a)>0?.11:.024})`;
      ctx.lineWidth=.78;
      ctx.stroke();
    }

    ctx.setLineDash([]);
    for(const s of surface){
      const lon=s.lon+rot;
      const cl=Math.cos(s.lat);
      const depth=Math.cos(lon)*cl;
      if(depth<-.10) continue;
      const x=p.cx+Math.sin(lon)*cl*p.rx*.91;
      const y=p.cy+Math.sin(s.lat)*p.ry*.90;
      const edge=Math.max(.18,1-Math.pow(Math.abs(x-p.cx)/(p.rx*.98),4));
      const tw=.73+.27*Math.sin(dt*.0015+s.phase);
      dot(x,y,s.size,s.alpha*(.28+.44*Math.max(0,depth))*edge*tw,6);
    }
    ctx.restore();

    /* órbitas */
    ctx.save();
    ctx.shadowBlur=0;
    ctx.lineWidth=.80;
    orbiters.slice(0,3).forEach((o,i)=>{
      ctx.beginPath();
      ctx.ellipse(p.cx,p.cy,p.rx*o.sx,p.ry*o.sy,i%2?.10:-.08,0,Math.PI*2);
      ctx.setLineDash(i%2?[4,17]:[13,18]);
      ctx.lineDashOffset=(i%2?-1:1)*dt*.010;
      ctx.strokeStyle=`rgba(143,255,241,${i<4?.10:.065})`;
      ctx.stroke();
    });
    ctx.restore();

    /* nós orbitais */
    orbiters.forEach(o=>{
      const a=o.phase+dt*o.speed;
      const orx=p.rx*o.sx, ory=p.ry*o.sy;
      for(let k=o.trail;k>=0;k--){
        const aa=a-Math.sign(o.speed)*k*.030;
        const x=p.cx+Math.cos(aa)*orx;
        const y=p.cy+Math.sin(aa)*ory;
        const fade=1-k/(o.trail+1);
        dot(x,y,Math.max(.48,o.size-k*.24),(k===0?.62:.20)*fade,k===0?7:4);
      }
    });

    /* pulsos */
    bursts.forEach(b=>{
      const pulse=(Math.sin(dt*.002+b.phase)+1)/2;
      if(pulse<.61) return;
      const gain=(pulse-.61)/.39;
      const x=p.cx+b.x*p.rx, y=p.cy+b.y*p.ry;
      dot(x,y,1.1+gain*.85,.22+gain*.58,10);
      ctx.beginPath();
      ctx.arc(x,y,3+gain*8,0,Math.PI*2);
      ctx.strokeStyle=`rgba(160,255,243,${gain*.20})`;
      ctx.lineWidth=.8;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawFlyers(now,p){
    const dt=now-t0;
    ctx.save();
    clipRight(p);

    flyers.forEach(f=>{
      const a=f.phase+dt*f.speed;
      const x=p.cx+Math.cos(a)*p.rx*f.rx;
      const y=p.cy+Math.sin(a)*p.ry*f.ry;
      const vx=-Math.sin(a), vy=Math.cos(a);
      const ang=Math.atan2(vy,vx);

      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(ang);
      ctx.shadowColor='rgba(126,255,234,.58)';
      ctx.shadowBlur=10;

      const trail=ctx.createLinearGradient(-f.size*4.4,0,0,0);
      trail.addColorStop(0,'rgba(126,255,234,0)');
      trail.addColorStop(1,'rgba(126,255,234,.20)');
      ctx.fillStyle=trail;
      ctx.fillRect(-f.size*4.4,-.6,f.size*4.4,1.2);

      ctx.fillStyle='rgba(165,255,243,.46)';
      ctx.strokeStyle='rgba(222,255,250,.64)';
      ctx.lineWidth=.72;
      ctx.beginPath();
      ctx.rect(-f.size/2,-2.4,f.size,4.8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle='rgba(245,255,253,1)';
      ctx.fillRect(f.size*.12,-.8,1.6,1.6);
      ctx.restore();
    });

    ctx.restore();
  }

  function drawStars(now,p){
    ctx.save();
    clipRight(p);

    for(const s of stars){
      s.x+=s.dx; s.y+=s.dy; s.phase+=.016;
      const minX=Math.max(w*.39,p.cx-p.rx*1.52);
      const maxX=Math.min(w+5,p.cx+p.rx*2.0);
      const minY=Math.max(0,p.cy-p.ry*1.16);
      const maxY=Math.min(h,p.cy+p.ry*1.16);
      if(s.x<minX)s.x=maxX;
      if(s.x>maxX)s.x=minX;
      if(s.y<minY)s.y=maxY;
      if(s.y>maxY)s.y=minY;
      dot(s.x,s.y,s.r,s.a*(.48+.28*Math.sin(s.phase)),7);
    }

    ctx.restore();
  }

  function frame(now){
    if(!ctx||!hero||!tactical()||document.hidden){
      raf=0;
      return;
    }

    ctx.clearRect(0,0,w,h);
    const p=mapArt();
    drawPlanet(now,p);
    drawFlyers(now,p);
    drawStars(now,p);
    ctx.shadowBlur=0;
    ctx.setLineDash([]);
    raf=requestAnimationFrame(frame);
  }

  function start(){
    if(!raf && tactical() && !document.hidden){
      t0=performance.now();
      raf=requestAnimationFrame(frame);
    }
  }

  function stop(){
    if(raf){cancelAnimationFrame(raf);raf=0}
    if(ctx)ctx.clearRect(0,0,w,h);
  }

  function activate(){
    if(!tactical()){
      stop();
      return false;
    }
    if(!ensure()) return false;
    hero.dataset.axLiveCore=VERSION;
    resize();
    start();
    return true;
  }

  function init(){
    activate();
    [250,650,1300,2500].forEach(ms=>setTimeout(activate,ms));
    window.addEventListener('resize',resize,{passive:true});
    window.addEventListener('axoriin:themechange',()=>setTimeout(activate,70));
    document.addEventListener('visibilitychange',()=>document.hidden?stop():activate());

    const mo=new MutationObserver(()=>tactical()?activate():stop());
    mo.observe(ROOT,{attributes:true,attributeFilter:['data-ax-theme','class']});
  }

  window.AxoriinLiveHero={
    version:VERSION,
    refresh:activate,
    stop,
    status:()=>({
      version:VERSION,
      tactical:tactical(),
      hero:!!document.querySelector('.ax-tactical-v309-hero'),
      canvas:!!document.querySelector('.ax-live-core-canvas'),
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
/* === AXORIIN LIVE HERO CORE V3.2.2 END === */
