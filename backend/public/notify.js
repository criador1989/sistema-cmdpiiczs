/**
 * notify.js — notificações globais com prévia
 * Coloque em /public/notify.js e inclua com:
 *   <script src="notify.js"></script>
 *
 * Requisitos de backend:
 *   - GET /api/mensagens/novas  -> retorna TODAS as mensagens NÃO LIDAS para o usuário logado
 *     cada item deve ter: {_id, conteudo, data|createdAt, remetente:{_id, nome}}
 */

(function(){
  const POLL_MS = 5000;
  let ultimaInteracao = false;
  const notified = new Set(); // ids de mensagens já “toastadas” nesta página
  let lastIds = [];           // ids para detectar novas entre os polls

  // ===== estilos mínimos =====
  const css = `
  .__glbell{position:fixed;right:16px;top:16px;z-index:99998;background:rgba(255,255,255,.10);
    border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(8px);color:#fff;padding:10px 12px;border-radius:14px;
    box-shadow:0 10px 28px rgba(0,0,0,.45);cursor:pointer;font:14px/1 system-ui;user-select:none}
  .__glbadge{display:inline-flex;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#ff3b3b;color:#fff;
    align-items:center;justify-content:center;font-weight:800;font-size:12px;margin-left:8px}
  .__glbadge[hidden]{display:none!important}
  .__alerts{position:fixed;top:60px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:10px}
  .__toast{background:linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
    color:#fff;border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(10px);
    padding:10px 12px;border-radius:12px;max-width:360px;box-shadow:0 10px 28px rgba(0,0,0,.45);cursor:pointer}
  .__toast strong{display:block}
  .__toast small{display:block;opacity:.9;margin-top:4px;word-break:break-word}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // ===== UI =====
  const bell = document.createElement('div');
  bell.className = '__glbell';
  bell.innerHTML = `🔔 <span class="__glbadge" hidden>0</span>`;
  const badge = bell.querySelector('span');

  const alerts = document.createElement('div');
  alerts.className='__alerts';

  document.addEventListener('DOMContentLoaded', ()=> {
    document.body.appendChild(bell);
    document.body.appendChild(alerts);
  });

  // beep (só toca após interação)
  const beep = new Audio('data:audio/wav;base64,UklGRl4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAACABAAZGF0YQgAAACAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICAf39/f4CAgICA');
  document.addEventListener('click', ()=>{ ultimaInteracao = true; }, { once:true });
  function playBeep(){ if(!ultimaInteracao) return; try{ beep.currentTime=0; beep.play().catch(()=>{});}catch{} }

  // helpers
  async function getJSON(url){
    const r = await fetch(url, { credentials:'include', cache:'no-store' });
    const ct = r.headers.get('content-type')||'';
    const body = ct.includes('application/json') ? await r.json() : await r.text();
    if(!r.ok) throw new Error(body?.mensagem || r.statusText);
    return body;
  }
  function showToast({ id, titulo, texto, userId }){
    if(id && notified.has(id)) return;
    if(id) notified.add(id);
    const t = document.createElement('div');
    t.className='__toast';
    t.innerHTML = `<strong>${titulo}</strong><small>${texto||'Mensagem'}</small>`;
    t.onclick = ()=>{
      try { sessionStorage.setItem('abrirConversaCom', String(userId)); } catch {}
      location.href = '/mensagens.html';
    };
    alerts.appendChild(t);
  }

  // clique no sino: leva para mensagens e, se existir, tenta abrir o último remetente não-lido
  bell.onclick = ()=>{
    // tenta pegar o primeiro toast pendente (se houver)
    const t = alerts.querySelector('.__toast');
    // não temos o uid no DOM, então apenas navega (o mensagens.html abrirá o que tiver em sessionStorage se setarmos lá no toast)
    location.href = '/mensagens.html';
  };

  async function tick(){
    let arr = [];
    try { arr = await getJSON('/api/mensagens/novas'); } catch { arr = []; }

    // badge total
    const total = Array.isArray(arr) ? arr.length : 0;
    if(total > 0){ badge.hidden = false; badge.textContent = String(total); }
    else { badge.hidden = true; }

    // identificar novas desde o último tick
    const ids = arr.map(m => String(m._id));
    const firstTime = lastIds.length === 0;
    const novas = firstTime ? arr : arr.filter(m => !lastIds.includes(String(m._id)));
    lastIds = ids;

    if(novas.length === 0) return;

    // agrupa por remetente e pega a mensagem mais recente de cada um (para prévia)
    const lastBySender = new Map();
    novas.forEach(m=>{
      const uid = String(m.remetente?._id || m.remetente || '');
      const prev = lastBySender.get(uid);
      if(!prev || new Date(m.data||m.createdAt) > new Date(prev.data||prev.createdAt)) lastBySender.set(uid, m);
    });

    // exibe toast por remetente (limitamos a 4 por tick para não poluir)
    let shown = 0;
    lastBySender.forEach((m, uid)=>{
      if(shown >= 4) return;
      const nome = m.remetente?.nome || 'Usuário';
      const texto = (m.conteudo && m.conteudo.trim()) ? m.conteudo.trim() : '📎 Anexo';
      showToast({ id: m._id, titulo: `${nome} enviou uma mensagem`, texto, userId: uid });
      shown++;
    });
    playBeep();
  }

  setInterval(tick, POLL_MS);
  // primeiro tick levemente atrasado (DOM pronto)
  setTimeout(tick, 1500);
})();
