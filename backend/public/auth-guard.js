<script>
/**
 * auth-guard.js — Controle de acesso por perfil + whitelist de páginas.
 * Funciona com seu backend atual (cookie HttpOnly) usando /auth/usuario-logado (e fallback /auth/me).
 */
(() => {
  // Base (Vite 5173 -> API 5000; produção mesma origem)
  const BASE = (location.port === '5173') ? 'http://localhost:5000' : '';
  const AUTH = (p)=> `${BASE}${p.startsWith('/auth') ? p : '/auth' + (p.startsWith('/')?p:'/'+p)}`;

  // Páginas públicas (não exigem login)
  const PUBLIC = new Set([
    '/', '/index.html',
    '/login.html',
    '/cadastro-usuario.html'
  ]);

  // ✅ Whitelist de páginas permitidas por tipo
  // (Ajuste conforme sua realidade)
  const ALLOW = {
    professor: new Set([
      '/login.html',
      '/bem-vindo.html',
      '/painel.html',
      '/lista-alunos.html',
      '/ficha-aluno.html'
    ]),
    monitor: new Set([
      '/login.html',
      '/bem-vindo.html',
      '/painel.html',
      '/lista-alunos.html',
      '/ficha-aluno.html'
      // se monitor puder ver outras, inclua aqui
    ]),
    admin: null // null = acesso total
  };

  // Cache simples (para não bater na API toda hora)
  const CACHE_KEY = 'sc_user_cache_v1';
  const CACHE_TTL_MS = 25_000; // 25s

  function now(){ return Date.now(); }

  function normalizePath(pathname){
    // remove múltiplas barras e garante padrão
    let p = pathname || '/';
    if (!p.startsWith('/')) p = '/' + p;
    // se for diretório (termina com /), trata como index
    if (p.endsWith('/')) p += 'index.html';
    return p;
  }

  async function fetchUser(){
    // tenta cache
    try{
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw){
        const obj = JSON.parse(raw);
        if (obj?.ts && (now() - obj.ts) < CACHE_TTL_MS && obj?.user){
          return obj.user;
        }
      }
    }catch{}

    // busca no backend
    let r = await fetch(AUTH('/usuario-logado'), { credentials:'include', cache:'no-store' });
    if (!r.ok) r = await fetch(AUTH('/me'), { credentials:'include', cache:'no-store' });
    if (!r.ok) return null;

    const u = await r.json().catch(() => null);
    if (!u) return null;

    try{
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: now(), user: u }));
    }catch{}

    return u;
  }

  function redirectToLogin(){
    // preserva a página destino para após login (se você quiser usar depois)
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
  }

  function redirectToPainel(){
    location.href = '/painel.html';
  }

  /**
   * Guard principal: bloqueia se:
   * - não logado e página não é pública
   * - logado e tipo não pode acessar a página atual (whitelist)
   */
  async function guard(){
    const path = normalizePath(location.pathname);

    // Se é página pública, deixa passar sem exigir login
    if (PUBLIC.has(path)) return;

    const u = await fetchUser();
    if (!u){
      redirectToLogin();
      return;
    }

    const tipo = (u?.tipo || '').toLowerCase();

    // Se admin tem acesso total
    if (tipo === 'admin') return;

    // Se o tipo é desconhecido, por segurança, manda pro painel
    const allowSet = ALLOW[tipo];
    if (!allowSet){
      redirectToPainel();
      return;
    }

    // Se a página atual não está na whitelist, bloqueia
    if (!allowSet.has(path)){
      alert('Acesso não autorizado para este perfil.');
      redirectToPainel();
      return;
    }
  }

  // expõe helpers opcionais (pra você usar no painel, etc.)
  window.SmartClassAuth = {
    fetchUser,
    guard,
    ALLOW
  };

  // Executa automaticamente ao carregar
  guard();
})();
</script>
