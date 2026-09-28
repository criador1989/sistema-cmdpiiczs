/* Axoriin Desktop Logout v2.6.3 — somente interface; reutiliza window.logout() existente. */
'use strict';
(()=>{
  const ID='axDesktopLogout';
  const MOBILE_MAX=899;
  let btn=null;
  let anchor=null;
  let attempts=0;
  let retryTimer=0;

  function isVisible(el){
    if(!el) return false;
    const s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false;
    const r=el.getBoundingClientRect();
    return r.width>20&&r.height>20;
  }

  function scoreThemeCandidate(el){
    if(!isVisible(el)) return -1;
    const text=(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    const id=(el.id||'').toLowerCase();
    const cls=(typeof el.className==='string'?el.className:'').toLowerCase();
    let score=0;
    if(text.includes('tema')) score+=8;
    if(text.includes('galáxia')||text.includes('galaxia')||text.includes('verde tático')||text.includes('verde tatico')) score+=6;
    if(id.includes('theme')||id.includes('tema')) score+=5;
    if(cls.includes('theme')||cls.includes('tema')) score+=4;
    const r=el.getBoundingClientRect();
    if(r.top<120) score+=3;
    if(r.left>innerWidth*.50) score+=2;
    return score;
  }

  function findThemeAnchor(){
    const nodes=[...document.querySelectorAll('button,[role="button"],select,[class*="theme" i],[id*="theme" i],[class*="tema" i],[id*="tema" i]')];
    let best=null,bestScore=0;
    for(const el of nodes){
      if(el.id===ID||el.closest?.('#'+ID)) continue;
      const s=scoreThemeCandidate(el);
      if(s>bestScore){best=el;bestScore=s;}
    }
    return bestScore>=6?best:null;
  }

  function createButton(){
    if(document.getElementById(ID)) return document.getElementById(ID);
    const b=document.createElement('button');
    b.id=ID;
    b.type='button';
    b.title='Sair do sistema';
    b.setAttribute('aria-label','Sair do sistema');
    b.innerHTML='<span class="ax-logout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v9"></path><path d="M7.1 5.9a8 8 0 1 0 9.8 0"></path></svg></span><span>Sair</span>';
    b.addEventListener('click',()=>{
      if(typeof window.logout==='function'){
        window.logout();
        return;
      }
      const mobile=document.querySelector('.mobile-appbar-exit[onclick*="logout"]');
      if(mobile){ mobile.click(); return; }
      console.warn('[Axoriin] Função de logout não encontrada.');
    });
    document.body.appendChild(b);
    requestAnimationFrame(()=>b.classList.add('ax-desktop-logout-ready'));
    return b;
  }

  function place(){
    if(!btn) return;
    if(innerWidth<=MOBILE_MAX){btn.style.display='none';return;}
    btn.style.display='inline-flex';
    if(!anchor||!isVisible(anchor)) anchor=findThemeAnchor();
    if(anchor){
      const r=anchor.getBoundingClientRect();
      const gap=10;
      const width=Math.max(btn.offsetWidth||82,82);
      let left=r.left-width-gap;
      let top=r.top+(r.height-38)/2;
      if(left<12){ left=Math.min(r.right+gap,innerWidth-width-12); }
      top=Math.max(10,Math.min(top,innerHeight-48));
      btn.style.left=Math.round(left)+'px';
      btn.style.top=Math.round(top)+'px';
      btn.style.right='auto';
    }else{
      btn.style.left='auto';
      btn.style.right='22px';
      btn.style.top='18px';
    }
  }

  function init(){
    btn=createButton();
    anchor=findThemeAnchor();
    place();
    if(!anchor&&attempts<20){
      attempts++;
      clearTimeout(retryTimer);
      retryTimer=setTimeout(()=>{anchor=findThemeAnchor();place();},250);
    }
  }

  addEventListener('resize',()=>requestAnimationFrame(place),{passive:true});
  addEventListener('scroll',()=>requestAnimationFrame(place),{passive:true});
  window.addEventListener('axoriin:themechange',()=>setTimeout(()=>{anchor=findThemeAnchor();place();},60));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
