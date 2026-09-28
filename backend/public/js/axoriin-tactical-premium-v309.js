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
