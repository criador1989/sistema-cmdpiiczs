(function () {
  'use strict';

  const runtime = window.AxoriinAluno;
  if (!runtime || !runtime.garantirSessao()) return;

  const state = {
    contexto: null,
    redacaoResumo: null,
    redacaoHistorico: [],
    questionarioResumo: null,
    installPrompt: null
  };

  const el = Object.fromEntries([
    'loadingState','errorState','errorMessage','portalApp','btnRetry','btnErrorLogout','btnLogout','btnMobileLogout',
    'sidebarAvatar','sidebarName','sidebarClass','mobileAvatar','mobileName','mobileClass','sidebarNote',
    'segmentBadge','heroTitle','heroText','heroActions','heroIcon','orbitChip1','orbitChip2','orbitChip3',
    'metricsSubtitle','contextLabel','metricsGrid','modulesSubtitle','modulesTag','modulesGrid',
    'activitySubtitle','activityList','profileName','profileClass','profileSegment','profileInstitution','profileCode',
    'roadmapTitle','roadmapSubtitle','roadmapGrid','btnInstall','installCard','btnInstallCard'
  ].map((id) => [id, document.getElementById(id)]));

  const ICONES = {
    quiz: '◉',
    redacao: '✎',
    simulado: '▤',
    jogos: '✦',
    ranking: '♛',
    personagem: '☺',
    configuracao: '⚙'
  };

  const ARENA_CONHECIMENTO_ROTA = '/aluno-jogo.html';

  function moduloArenaConhecimento() {
    return {
      tipo: 'arena',
      icone: 'jogos',
      titulo: 'Arena do Conhecimento',
      descricao: 'RPG educacional com missões, quiz, XP, medalhas e ranking demonstrativo para o Ensino Fundamental II.',
      status: 'ativo',
      rota: ARENA_CONHECIMENTO_ROTA,
      destaque: true,
      meta: 'MVP disponível'
    };
  }

  function prepararModulos(portal) {
    let modulos = Array.isArray(portal?.modulos) ? [...portal.modulos] : [];

    if (portal?.segmento === 'fundamental_ii') {
      const arena = moduloArenaConhecimento();
      const ehArena = (modulo) => {
        const titulo = String(modulo?.titulo || '');
        const rota = String(modulo?.rota || '');
        return /arena do conhecimento/i.test(titulo) || rota.includes('aluno-jogo');
      };

      const existeArena = modulos.some(ehArena);
      modulos = existeArena
        ? modulos.map((modulo) => ehArena(modulo)
          ? {
              ...arena,
              ...modulo,
              tipo: 'arena',
              status: 'ativo',
              rota: modulo.rota || ARENA_CONHECIMENTO_ROTA,
              destaque: true,
              meta: modulo.meta || arena.meta
            }
          : modulo)
        : [arena, ...modulos];
    }

    return modulos;
  }

  function texto(elemento, valor) {
    if (elemento) elemento.textContent = valor == null || valor === '' ? '—' : String(valor);
  }

  function mostrarErro(mensagem) {
    el.loadingState.classList.add('hidden');
    el.portalApp.classList.add('hidden');
    el.errorState.classList.remove('hidden');
    texto(el.errorMessage, mensagem || 'Não foi possível carregar o portal.');
  }

  function mostrarPortal() {
    el.loadingState.classList.add('hidden');
    el.errorState.classList.add('hidden');
    el.portalApp.classList.remove('hidden');
  }

  function saudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function fotoValida(aluno) {
    const candidatos = [aluno?.foto, aluno?.fotoThumbUrl].filter(Boolean);
    return candidatos.find((url) => !String(url).includes('/api/imagens/thumb/')) || aluno?.fotoThumbUrl || '';
  }

  function preencherAvatar(elemento, aluno) {
    if (!elemento) return;
    const url = fotoValida(aluno);
    const sigla = runtime.iniciais(aluno?.nome);
    elemento.textContent = sigla;

    if (!url) return;
    const img = document.createElement('img');
    img.alt = `Foto de ${aluno?.nome || 'aluno'}`;
    img.src = runtime.buildUrl(url);
    img.addEventListener('error', () => {
      elemento.textContent = sigla;
    }, { once: true });
    elemento.replaceChildren(img);
  }

  async function carregarContexto() {
    const payload = await runtime.apiFetch('/api/portal-aluno/contexto');
    state.contexto = payload;
    return payload;
  }

  async function carregarEnsinoMedio() {
    const resultados = await Promise.allSettled([
      runtime.apiFetch('/api/redacao/resumo-mensal'),
      runtime.apiFetch('/api/redacao/historico'),
      runtime.apiFetch('/api/questionarios/resumo')
    ]);

    if (resultados[0].status === 'fulfilled') state.redacaoResumo = resultados[0].value?.resumoMensal || null;
    if (resultados[1].status === 'fulfilled') state.redacaoHistorico = resultados[1].value?.historico || [];
    if (resultados[2].status === 'fulfilled') state.questionarioResumo = resultados[2].value?.resumo || null;
  }

  function statusModulo(status) {
    if (status === 'ativo') return { texto: 'Disponível', classe: '' };
    if (status === 'em_breve') return { texto: 'Em breve', classe: 'soon' };
    if (status === 'em_preparacao') return { texto: 'Em preparação', classe: 'soon' };
    if (status === 'configuracao') return { texto: 'Configuração', classe: 'config' };
    return { texto: 'Indisponível', classe: 'config' };
  }

  function renderModulos(portal) {
    const modulos = prepararModulos(portal);
    el.modulesGrid.innerHTML = modulos.map((modulo) => {
      const status = statusModulo(modulo.status);
      const ativo = modulo.status === 'ativo' && modulo.rota;
      const acao = ativo
        ? `<a class="btn btn-primary" href="${runtime.escapeHtml(runtime.buildUrl(modulo.rota))}">Abrir módulo</a>`
        : modulo.rota
          ? `<a class="btn btn-ghost" href="${runtime.escapeHtml(runtime.buildUrl(modulo.rota))}">Ver estrutura</a>`
          : '<button class="btn btn-ghost" type="button" disabled>Aguardando</button>';

      return `
        <article class="module-card ${modulo.destaque ? 'is-featured' : ''} ${modulo.tipo === 'arena' ? 'is-arena' : ''}">
          <span class="module-status ${status.classe}">${status.texto}</span>
          <div class="module-icon" aria-hidden="true">${ICONES[modulo.icone] || '•'}</div>
          <h3>${runtime.escapeHtml(modulo.titulo)}</h3>
          <p>${runtime.escapeHtml(modulo.descricao)}</p>
          <div class="module-footer">
            <span class="module-meta">${runtime.escapeHtml(modulo.meta || (ativo ? 'Pronto para usar' : 'Estrutura reservada'))}</span>
            ${acao}
          </div>
        </article>`;
    }).join('');
  }

  function metricCard(rotulo, valor, ajuda) {
    return `<article class="metric-card"><span class="metric-label">${runtime.escapeHtml(rotulo)}</span><strong class="metric-value">${runtime.escapeHtml(valor)}</strong><span class="metric-help">${runtime.escapeHtml(ajuda)}</span></article>`;
  }

  function renderMetricasMedio() {
    const q = state.questionarioResumo || {};
    const r = state.redacaoResumo || {};
    const ultima = state.redacaoHistorico?.[0] || null;
    const nota = Number(ultima?.correcaoIA?.notaTotal);

    el.metricsGrid.innerHTML = [
      metricCard('Questionários', String(q.totalQuestionarios ?? 0), 'Quantidade de treinos registrados.'),
      metricCard('Média de acertos', q.totalQuestionarios ? `${q.mediaGeral ?? 0}%` : '—', 'Média calculada apenas com atividades realizadas.'),
      metricCard('Redações no mês', r.limite != null ? `${r.usadas ?? 0}/${r.limite}` : '—', 'Limite mensal configurado para o aluno.'),
      metricCard('Última redação', Number.isFinite(nota) ? `${nota}/1000` : '—', ultima ? (ultima.temaTituloSnapshot || 'Produção corrigida') : 'Nenhuma redação corrigida ainda.')
    ].join('');
  }

  function renderMetricasFundamental() {
    el.metricsGrid.innerHTML = [
      metricCard('Arena', 'MVP ativo', 'Primeira missão gamificada disponível para teste no portal.'),
      metricCard('Personagem', 'Disponível', 'Avatar inicial controlável no mapa da Arena do Conhecimento.'),
      metricCard('Quiz', '5 questões', 'Desafio demonstrativo com pontuação, XP e medalha.'),
      metricCard('Ranking', 'Demo', 'Classificação fictícia até a integração com o banco do Axoriin.')
    ].join('');
  }

  function atividade(icone, titulo, subtitulo, valor) {
    return `<article class="activity"><div class="activity-icon">${icone}</div><div><strong>${runtime.escapeHtml(titulo)}</strong><span>${runtime.escapeHtml(subtitulo)}</span></div><div class="activity-score">${runtime.escapeHtml(valor || '')}</div></article>`;
  }

  function renderAtividadesMedio() {
    const itens = [];
    const q = state.questionarioResumo || {};
    const ultimaQ = q.ultimoQuestionario;
    const ultimaR = state.redacaoHistorico?.[0];

    if (ultimaQ) {
      itens.push(atividade('◉', ultimaQ.titulo || 'Questionário concluído', `${runtime.formatarData(ultimaQ.createdAt)} · ${ultimaQ.area || 'Treino ENEM'}`, `${ultimaQ.percentualAcerto ?? 0}%`));
    }

    if (ultimaR) {
      const nota = Number(ultimaR?.correcaoIA?.notaTotal);
      itens.push(atividade('✎', ultimaR.temaTituloSnapshot || 'Redação enviada', `${runtime.formatarData(ultimaR.createdAt)} · ${ultimaR.focoPrincipal || 'Correção por competências'}`, Number.isFinite(nota) ? `${nota}` : 'Corrigindo'));
    }

    if (!itens.length) {
      itens.push(atividade('1', 'Comece por um questionário', 'Faça um treino rápido para gerar seu primeiro diagnóstico.', 'Próximo'));
      itens.push(atividade('2', 'Produza sua redação', 'Depois do envio, acompanhe as notas C1–C5 e o plano de estudo.', 'Próximo'));
    }

    el.activityList.innerHTML = itens.join('');
  }

  function renderAtividadesFundamental() {
    el.activityList.innerHTML = [
      atividade('✦', 'Arena do Conhecimento', 'MVP disponível com mapa, NPC professor e quiz educacional.', 'Ativo'),
      atividade('☺', 'Personagens próprios', 'O aluno poderá escolher e evoluir seu avatar nas próximas etapas.', 'Próximo'),
      atividade('♛', 'Ranking por temporada', 'Conquistas, ligas e recompensas serão integradas sem expor dados sensíveis.', 'Próximo')
    ].join('');
  }

  function renderRoadmap(segmento) {
    const medio = [
      ['1', 'Painel integrado', 'Questionários e redação reunidos em um único acesso.'],
      ['2', 'Simulados', 'Provas completas, cronômetro e relatório por área.'],
      ['3', 'Plano de estudo', 'Recomendações conectando erros, habilidades e redação.'],
      ['4', 'Evolução contínua', 'Histórico consolidado para aluno, família e escola.']
    ];
    const fundamental = [
      ['1', 'MVP liberado', 'Arena do Conhecimento disponível para teste pelo painel.'],
      ['2', 'Quizzes gamificados', 'Questões rápidas organizadas por missões e níveis.'],
      ['3', 'Conquistas', 'Experiência, itens e recompensas vinculadas à aprendizagem.'],
      ['4', 'Ranking saudável', 'Ligas por turma e temporadas com regras de proteção.']
    ];
    const lista = segmento === 'fundamental_ii' ? fundamental : medio;
    el.roadmapGrid.innerHTML = lista.map(([n, titulo, desc]) => `<article class="road-step"><b>${n}</b><strong>${titulo}</strong><span>${desc}</span></article>`).join('');
  }

  function renderHero(contexto) {
    const portal = contexto.portal || {};
    const aluno = contexto.aluno || {};
    const primeiroNome = String(aluno.nome || 'Aluno').split(/\s+/)[0];
    const fundamental = portal.segmento === 'fundamental_ii';
    const indefinido = portal.segmento === 'indefinido';

    document.body.classList.toggle('segment-fundamental', fundamental);
    texto(el.segmentBadge, portal.rotulo || 'Portal do aluno');
    texto(el.contextLabel, portal.rotulo || 'Segmento não identificado');

    if (fundamental) {
      texto(el.heroTitle, `${saudacao()}, ${primeiroNome}! Seu mundo está sendo preparado.`);
      texto(el.heroText, 'O Portal do Aluno já recebeu a primeira versão da Arena do Conhecimento, com mapa, NPC professor, quiz, XP e medalha para o Ensino Fundamental II.');
      texto(el.heroIcon, '✦');
      texto(el.orbitChip1, 'Missões');
      texto(el.orbitChip2, 'Personagens');
      texto(el.orbitChip3, 'Ranking');
      texto(el.metricsSubtitle, 'A primeira versão já está disponível; os dados reais serão integrados por etapas.');
      texto(el.modulesSubtitle, 'Abra a Arena do Conhecimento ou acompanhe as próximas áreas gamificadas.');
      texto(el.modulesTag, 'Mundo Axoriin');
      texto(el.activitySubtitle, 'Veja os componentes já previstos para a jornada do Fundamental II.');
      texto(el.sidebarNote, 'Este acesso foi identificado como Ensino Fundamental II e já pode testar a Arena do Conhecimento.');
      texto(el.roadmapTitle, 'Estrutura do Mundo Axoriin');
      texto(el.roadmapSubtitle, 'Os jogos poderão ser acrescentados por etapas sem alterar o login nem o painel principal.');
      el.heroActions.innerHTML = `<a class="btn btn-primary" href="${runtime.escapeHtml(runtime.buildUrl(ARENA_CONHECIMENTO_ROTA))}">Entrar na Arena</a><a class="btn btn-ghost" href="#modulos">Explorar módulos</a>`;
    } else if (indefinido) {
      texto(el.heroTitle, `${saudacao()}, ${primeiroNome}!`);
      texto(el.heroText, 'Não conseguimos identificar o segmento a partir do nome da turma. O acesso permanece seguro, mas os módulos ficarão em configuração.');
      texto(el.heroIcon, '⚙');
      el.heroActions.innerHTML = '<a class="btn btn-ghost" href="#perfil">Conferir dados da turma</a>';
    } else {
      texto(el.heroTitle, `${saudacao()}, ${primeiroNome}! Vamos avançar rumo ao ENEM?`);
      texto(el.heroText, 'Questionários, redação e, futuramente, simulados reunidos em uma experiência leve no computador e no celular.');
      texto(el.heroIcon, '🎓');
      texto(el.orbitChip1, 'Questionários');
      texto(el.orbitChip2, 'Redação');
      texto(el.orbitChip3, 'Simulados');
      texto(el.sidebarNote, 'Seu acesso foi identificado como Ensino Médio. Os módulos ENEM aparecem automaticamente.');
      el.heroActions.innerHTML = `<a class="btn btn-light" href="${runtime.escapeHtml(runtime.buildUrl('/aluno-questionarios.html'))}">Iniciar questionário</a><a class="btn btn-ghost" href="${runtime.escapeHtml(runtime.buildUrl('/aluno-redacao.html'))}">Escrever redação</a>`;
    }
  }

  function renderPerfil(contexto) {
    const aluno = contexto.aluno || {};
    const portal = contexto.portal || {};
    const instituicao = contexto.instituicao || {};
    const nomeInstituicao = instituicao.nome || instituicao.sigla || runtime.getTenant() || 'Instituição';

    preencherAvatar(el.sidebarAvatar, aluno);
    preencherAvatar(el.mobileAvatar, aluno);
    texto(el.sidebarName, aluno.nome || 'Aluno');
    texto(el.sidebarClass, aluno.turma || 'Turma não informada');
    texto(el.mobileName, aluno.nome || 'Aluno');
    texto(el.mobileClass, aluno.turma || 'Turma não informada');
    texto(el.profileName, aluno.nome);
    texto(el.profileClass, aluno.turma);
    texto(el.profileSegment, portal.rotulo);
    texto(el.profileInstitution, nomeInstituicao);
    texto(el.profileCode, aluno.codigoAcesso || 'Não exibido');
  }

  function configurarNavegacao() {
    const links = [...document.querySelectorAll('.nav-link, .dock-link')];
    const seções = [...document.querySelectorAll('main section[id], article[id]')];

    links.forEach((link) => link.addEventListener('click', () => {
      links.forEach((item) => item.classList.remove('active'));
      const destino = link.getAttribute('href');
      document.querySelectorAll(`[href="${destino}"]`).forEach((item) => item.classList.add('active'));
    }));

    const observer = new IntersectionObserver((entradas) => {
      const visivel = entradas.filter((item) => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visivel) return;
      links.forEach((item) => item.classList.toggle('active', item.getAttribute('href') === `#${visivel.target.id}`));
    }, { rootMargin: '-20% 0px -62% 0px', threshold: [0, .2, .6] });

    seções.forEach((secao) => observer.observe(secao));
  }

  async function instalar() {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    el.btnInstall.hidden = true;
    el.installCard.hidden = true;
  }

  function configurarInstalacao() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      el.btnInstall.hidden = false;
      el.installCard.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      el.btnInstall.hidden = true;
      el.installCard.hidden = true;
    });
    el.btnInstall?.addEventListener('click', instalar);
    el.btnInstallCard?.addEventListener('click', instalar);
  }

  function renderTudo() {
    const contexto = state.contexto;
    const segmento = contexto.portal?.segmento;
    renderHero(contexto);
    renderPerfil(contexto);
    renderModulos(contexto.portal);
    renderRoadmap(segmento);

    if (segmento === 'ensino_medio') {
      renderMetricasMedio();
      renderAtividadesMedio();
    } else {
      renderMetricasFundamental();
      renderAtividadesFundamental();
    }
  }

  async function boot() {
    el.loadingState.classList.remove('hidden');
    el.errorState.classList.add('hidden');

    try {
      const contexto = await carregarContexto();
      if (contexto.portal?.segmento === 'ensino_medio') await carregarEnsinoMedio();
      renderTudo();
      mostrarPortal();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        runtime.limparSessao();
        window.location.replace(runtime.buildUrl('/login-aluno.html'));
        return;
      }
      mostrarErro(error.message);
    }
  }

  el.btnRetry?.addEventListener('click', boot);
  el.btnErrorLogout?.addEventListener('click', runtime.logout);
  el.btnLogout?.addEventListener('click', runtime.logout);
  el.btnMobileLogout?.addEventListener('click', runtime.logout);

  configurarNavegacao();
  configurarInstalacao();
  runtime.registrarPwa();
  boot();
})();
