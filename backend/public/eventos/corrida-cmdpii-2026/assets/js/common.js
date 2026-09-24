const EVENT_SLUG='corrida-cmdpii-2026';
const API=`/api/eventos/${EVENT_SLUG}`;

async function api(path, options={}){
  const r=await fetch(`${API}${path}`,{credentials:'include',cache:'no-store',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.headers||{})},...options});
  const ct=r.headers.get('content-type')||'';const data=ct.includes('application/json')?await r.json().catch(()=>({})):await r.text();
  if(!r.ok){const e=new Error(data?.mensagem||data?.error||`Erro ${r.status}`);e.status=r.status;e.data=data;throw e}return data;
}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR')}
function showMsg(el,msg,ok=false){if(!el)return;el.className=ok?'success':'error';el.textContent=msg;el.classList.remove('hidden')}
function hideMsg(el){if(el)el.classList.add('hidden')}
async function getConfig(){return api('/public')}
async function getMe(){try{return await api('/auth/me')}catch(e){if(e.status===401)return null;throw e}}
async function logout(){await api('/auth/logout',{method:'POST',body:'{}'});location.href=`/eventos/${EVENT_SLUG}/entrar.html`}
async function requireMe(){const me=await getMe();if(!me){location.href=`/eventos/${EVENT_SLUG}/entrar.html?next=${encodeURIComponent(location.pathname+location.search)}`;return null}return me}
function applyConfig(cfg){document.querySelectorAll('[data-title]').forEach(e=>e.textContent=cfg.titulo||'');document.querySelectorAll('[data-date]').forEach(e=>e.textContent=cfg.dataLabel||'');document.querySelectorAll('[data-local]').forEach(e=>e.textContent=cfg.local||'');document.documentElement.style.setProperty('--hero',`url("${cfg.bannerUrl}")`);const internal=cfg.bannerInternoUrl||cfg.bannerUrl;document.documentElement.style.setProperty('--page-photo',`url("${internal}")`);document.querySelectorAll('.page-hero130,.account130-hero,.page-head').forEach(e=>e.style.setProperty('--page-photo',`url("${internal}")`))}

function axSessionId(){let id=localStorage.getItem('ax_evt_sid');if(!id){id=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g,'');localStorage.setItem('ax_evt_sid',id)}return id}
function axDevice(){const w=window.innerWidth;return w<700?'mobile':w<1100?'tablet':'desktop'}
function axPage(){const f=location.pathname.split('/').pop()||'index.html';return f||'index.html'}
function axTrack(tipo,alvo=''){const body={tipo,sessionId:axSessionId(),pagina:axPage(),alvo,device:axDevice(),referrer:document.referrer||''};const url=`${API}/analytics/event`;try{if(navigator.sendBeacon){navigator.sendBeacon(url,new Blob([JSON.stringify(body)],{type:'application/json'}));return}}catch{}fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{})}
function axTrackClick(el){const label=el.dataset.track||el.getAttribute('aria-label')||el.textContent||el.href||'click';axTrack('click',String(label).trim().replace(/\s+/g,' ').slice(0,90))}
async function axPublicStats(){try{return await api('/analytics/public-summary')}catch{return{pageViews:0,live:0}}}
function initAxAnalytics(){axTrack('pageview');setInterval(()=>axTrack('heartbeat'),25000);document.addEventListener('click',e=>{const el=e.target.closest('a,button,[data-track]');if(el)axTrackClick(el)});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAxAnalytics);else initAxAnalytics();
