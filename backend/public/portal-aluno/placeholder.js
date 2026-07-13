(function () {
  'use strict';
  const runtime = window.AxoriinAluno;
  if (!runtime || !runtime.garantirSessao()) return;

  document.querySelectorAll('[data-portal-link]').forEach((link) => {
    link.href = runtime.buildUrl(link.getAttribute('href'));
  });

  runtime.apiFetch('/api/portal-aluno/contexto').then((payload) => {
    const esperado = document.body.dataset.placeholder;
    const segmento = payload?.portal?.segmento;
    document.title = esperado === 'jogos'
      ? `Axoriin • Mundo Axoriin • ${payload?.aluno?.nome || 'Aluno'}`
      : `Axoriin • Simulados • ${payload?.aluno?.nome || 'Aluno'}`;

    if (esperado === 'jogos' && segmento === 'ensino_medio') {
      const aviso = document.createElement('div');
      aviso.className = 'install-card';
      aviso.innerHTML = '<div><strong>Este ambiente é destinado ao Ensino Fundamental II.</strong><span>Seu acesso foi identificado como Ensino Médio. Use os módulos ENEM no painel.</span></div>';
      document.querySelector('.placeholder-hero')?.after(aviso);
    }
  }).catch((erro) => {
    if (erro.status === 401 || erro.status === 403) runtime.logout();
  });

  runtime.registrarPwa();
})();
