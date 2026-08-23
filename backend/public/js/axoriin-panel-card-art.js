'use strict';

(() => {
  const VERSION = '1.0.3';
  const BASE = '/assets/painel/cards/';

  const ITEMS = [
    { id:'metricAlunos', file:'metric-alunos.webp', kind:'metric' },
    { id:'metricNotif', file:'metric-notificacoes.webp', kind:'metric' },
    { id:'metricMedia', file:'metric-desempenho.webp', kind:'metric' },

    { id:'cardCadastrarAluno', file:'cadastrar-aluno.webp', kind:'module' },
    { id:'cardControleAcesso', file:'controle-acesso.webp', kind:'module' },
    { id:'cardVerNotificacoes', file:'ver-notificacoes.webp', kind:'module' },
    { id:'cardControleNotificacoes', file:'controle-notificacoes.webp', kind:'module' },
    { id:'cardRankingAlunos', file:'ranking-alunos.webp', kind:'module' },
    { id:'cardAlamar', file:'aluno-alamar.webp', kind:'module' },
    { id:'cardEstatisticas', file:'painel-estatisticas.webp', kind:'module' },
    { id:'cardFinanceiro', file:'financeiro.webp', kind:'module' },
    { id:'cardUniformes', file:'uniformes-vouchers.webp', kind:'module' },
    { id:'cardAssociacao', file:'associacoes.webp', kind:'module' },
    { id:'cardTransferirTurma', file:'transferir-turma.webp', kind:'module' },
    { id:'cardPedagogico', file:'pedagogico.webp', kind:'module' },
    { id:'cardGestaoRedacao', file:'enem-redacao.webp', kind:'module' },
  ];

  function getContainer(host, item) {
    if (item.kind === 'metric') return host.querySelector('.metric-hud') || host;
    return host;
  }

  function installOne(item) {
    const host = document.getElementById(item.id);
    if (!host) return false;

    host.classList.add('ax-card-art-host');
    host.dataset.axCardArt = item.file;

    const container = getContainer(host, item);
    if (!container) return false;

    let image = host.querySelector(`img.ax-card-art--${item.kind}`);

    if (!image) {
      image = document.createElement('img');
      image.className = `ax-card-art ax-card-art--${item.kind}`;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
      image.loading = item.kind === 'metric' ? 'eager' : 'lazy';
      image.draggable = false;
    }

    /*
     * CORRECAO v1.0.3:
     * nas 3 metricas, a imagem precisa compartilhar exatamente o mesmo
     * elemento-pai do numero (.metric-hud). Se ela estiver no wrapper antigo,
     * movemos o proprio elemento em vez de criar outra imagem.
     */
    if (image.parentElement !== container) {
      container.insertBefore(image, container.firstChild);
    }

    image.src = BASE + item.file;
    image.dataset.axCardArtVersion = VERSION;
    return true;
  }

  function installAll() {
    let found = 0;
    for (const item of ITEMS) {
      if (installOne(item)) found += 1;
    }
    document.documentElement.dataset.axCardArtVersion = VERSION;
    document.documentElement.classList.add('ax-card-art-ready');
    return found;
  }

  function initialize() {
    installAll();

    let runs = 0;
    const timer = setInterval(() => {
      installAll();
      runs += 1;
      if (runs >= 8) clearInterval(timer);
    }, 500);
  }

  window.AxoriinPanelCardArt = {
    version: VERSION,
    items: ITEMS.slice(),
    refresh: installAll,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once:true });
  } else {
    initialize();
  }
})();
