(function () {
  'use strict';

  const STORAGE = {
    token: 'axoriin_aluno_token',
    usuario: 'axoriin_aluno_usuario',
    aluno: 'axoriin_aluno',
    tenant: 'axoriin_tenant',
    authType: 'axoriin_auth_type'
  };

  const state = {
    token: '',
    tenant: '',
    usuario: null,
    aluno: null,
    detalhes: null,
    redacaoResumoMensal: null,
    redacaoHistorico: [],
    questionarioResumo: null
  };

  const el = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    app: document.getElementById('app'),
    errorMessage: document.getElementById('errorMessage'),
    
    btnReload: document.getElementById('btnReload'),
    btnBackLogin: document.getElementById('btnBackLogin'),

    sidebarAvatar: document.getElementById('sidebarAvatar'),
    sidebarNome: document.getElementById('sidebarNome'),
    sidebarTurma: document.getElementById('sidebarTurma'),
    sidebarCodigo: document.getElementById('sidebarCodigo'),
    sidebarInstituicao: document.getElementById('sidebarInstituicao'),

    mobileAvatar: document.getElementById('mobileAvatar'),
    mobileNome: document.getElementById('mobileNome'),
    mobileTurma: document.getElementById('mobileTurma'),

    btnLogoutSidebar: document.getElementById('btnLogoutSidebar'),
    btnLogoutMobile: document.getElementById('btnLogoutMobile'),
    btnAtualizarSidebar: document.getElementById('btnAtualizarSidebar'),

    heroTitle: document.getElementById('heroTitle'),
    heroSubtitle: document.getElementById('heroSubtitle'),
    heroInstituicao: document.getElementById('heroInstituicao'),
    heroTurma: document.getElementById('heroTurma'),
    heroPortal: document.getElementById('heroPortal'),

    quickStatusText: document.getElementById('quickStatusText'),
    quickStatusPill: document.getElementById('quickStatusPill'),

    statNomeCurto: document.getElementById('statNomeCurto'),
    statTurma: document.getElementById('statTurma'),
    statRedacoes: document.getElementById('statRedacoes'),
    statQuestionarios: document.getElementById('statQuestionarios'),
    statQuestionariosTexto: document.getElementById('statQuestionariosTexto'),
    activityList: document.getElementById('activityList'),

    progressLabel: document.getElementById('progressLabel'),
    progressFill: document.getElementById('progressFill'),

    accessCodigo: document.getElementById('accessCodigo'),
    accessEmail: document.getElementById('accessEmail'),
    accessPortal: document.getElementById('accessPortal'),
    accessInstituicao: document.getElementById('accessInstituicao'),

    redacaoRestantesMes: document.getElementById('redacaoRestantesMes'),
    redacaoRestantesMesBackup: document.getElementById('redacaoRestantesMesBackup'),
    redacaoUltimaNota: document.getElementById('redacaoUltimaNota'),
    redacaoUltimoTema: document.getElementById('redacaoUltimoTema'),
    redacaoFocoPrincipal: document.getElementById('redacaoFocoPrincipal'),
    btnAbrirRedacao: document.getElementById('btnAbrirRedacao'),

    questionarioTotal: document.getElementById('questionarioTotal'),
    questionarioMedia: document.getElementById('questionarioMedia'),
    questionarioUltimo: document.getElementById('questionarioUltimo'),
    questionarioFoco: document.getElementById('questionarioFoco'),
    btnAbrirQuestionarios: document.getElementById('btnAbrirQuestionarios'),

    menuButtons: Array.from(document.querySelectorAll('.menu-btn')),
    fadeItems: Array.from(document.querySelectorAll('.fade-up')),

inputTrocarFoto: document.getElementById('inputTrocarFoto'),
fotoAlunoSidebar: document.getElementById('fotoAlunoSidebar')
  };

  function setText(element, value) {
    if (element) element.textContent = value ?? '--';
  }
  function cacheBustUrl(url) {
  if (!url) return '';

  const texto = String(url);

  if (
    texto.includes('cloudfront.net') ||
    texto.includes('amazonaws.com') ||
    texto.includes('Signature=') ||
    texto.includes('Key-Pair-Id=') ||
    texto.includes('Expires=')
  ) {
    return texto;
  }

  const sep = texto.includes('?') ? '&' : '?';
  return `${texto}${sep}v=${Date.now()}`;
}

  function getTenantFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('t') || '').trim();
  }

  function buildUrl(path) {
    const tenant = state.tenant || getTenantFromUrl();
    if (!tenant) return path;
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}t=${encodeURIComponent(tenant)}`;
  }

  function showLoading() {
    el.errorState?.classList.add('hidden');
    el.app?.classList.add('hidden');
    el.loadingState?.classList.remove('hidden');
  }

  function showApp() {
    el.loadingState?.classList.add('hidden');
    el.errorState?.classList.add('hidden');
    el.app?.classList.remove('hidden');
  }

  function showError(message) {
    el.loadingState?.classList.add('hidden');
    el.app?.classList.add('hidden');
    el.errorState?.classList.remove('hidden');
    setText(el.errorMessage, message || 'Ocorreu um erro ao carregar o painel.');
  }

  function clearSession() {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.usuario);
    localStorage.removeItem(STORAGE.aluno);
    localStorage.removeItem(STORAGE.authType);
  }

  async function logout() {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (_) {}

    clearSession();
    window.location.href = buildUrl('login-aluno.html');
  }

  function hydrateLocalState() {
    state.token = localStorage.getItem(STORAGE.token) || '';
    state.tenant = localStorage.getItem(STORAGE.tenant) || getTenantFromUrl() || '';

    try {
      state.usuario = JSON.parse(localStorage.getItem(STORAGE.usuario) || 'null');
    } catch (_) {
      state.usuario = null;
    }

    try {
      state.aluno = JSON.parse(localStorage.getItem(STORAGE.aluno) || 'null');
    } catch (_) {
      state.aluno = null;
    }
  }

  async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (state.token) {
      headers.Authorization = 'Bearer ' + state.token;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Sua sessão expirou ou o acesso não está disponível. Faça login novamente.');
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object'
        ? (payload.mensagem || payload.message || payload.erro || 'Erro ao carregar dados.')
        : 'Erro ao carregar dados.';
      throw new Error(message);
    }

    return payload;
  }

  async function loadMe() {
    const me = await apiFetch(buildUrl('/auth/me'));
    state.usuario = me;
    localStorage.setItem(STORAGE.usuario, JSON.stringify(me));
    return me;
  }

  async function loadAlunoDetails(alunoId) {
    if (!alunoId) {
      throw new Error('Aluno vinculado não encontrado no login atual.');
    }

    const detalhes = await apiFetch(buildUrl(`/api/alunos/${encodeURIComponent(alunoId)}/detalhes`));
    state.detalhes = detalhes;

    if (detalhes && detalhes.aluno) {
      state.aluno = detalhes.aluno;
      localStorage.setItem(STORAGE.aluno, JSON.stringify(detalhes.aluno));
    }

    return detalhes;
  }

  async function loadRedacaoResumoMensal() {
    try {
      const { resumoMensal } = await apiFetch(buildUrl('/api/redacao/resumo-mensal'));
      state.redacaoResumoMensal = resumoMensal || null;
    } catch (error) {
      console.warn('Resumo mensal de redação não carregado:', error?.message || error);
      state.redacaoResumoMensal = null;
    }
  }

  async function loadRedacaoHistorico() {
    try {
      const { historico } = await apiFetch(buildUrl('/api/redacao/historico'));
      state.redacaoHistorico = Array.isArray(historico) ? historico : [];
    } catch (error) {
      console.warn('Histórico de redação não carregado:', error?.message || error);
      state.redacaoHistorico = [];
    }
  }

  async function loadQuestionarioResumo() {
  try {
    const payload = await apiFetch(buildUrl('/api/questionarios/resumo'));

    console.log('[ALUNO][QUESTIONARIO_RESUMO]', payload);

    state.questionarioResumo =
      payload?.resumo ||
      payload?.data ||
      payload ||
      null;

  } catch (error) {
    console.warn('Resumo de questionários não carregado:', error?.message || error);
    state.questionarioResumo = null;
  }
}

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'AL';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function fillAvatar(container, imageUrl, fallbackText) {
    if (!container) return;

    if (imageUrl) {
      container.innerHTML = `<img src="${imageUrl}" alt="Foto do aluno">`;
      return;
    }

    container.textContent = fallbackText || 'AL';
  }

  function getGreeting() {
    const hour = new Date().getHours();

    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function calculateEnemProgress() {
    const resumoQuestionario = state.questionarioResumo || {};
    const historico = Array.isArray(state.redacaoHistorico) ? state.redacaoHistorico : [];
    const ultimaRedacao = historico[0] || null;

    const partes = [];

    const mediaQuestionarios = Number(resumoQuestionario.mediaGeral);
    if (Number.isFinite(mediaQuestionarios)) {
      partes.push(Math.max(0, Math.min(100, mediaQuestionarios)));
    }

    const notaRedacao = Number(ultimaRedacao?.correcaoIA?.notaTotal);
    if (Number.isFinite(notaRedacao)) {
      partes.push(Math.max(0, Math.min(100, notaRedacao / 10)));
    }

    if (!partes.length) return null;

    const soma = partes.reduce((total, valor) => total + valor, 0);
    return soma / partes.length;
  }

  function calculateSimulatedEnemScore(progressPercent) {
  if (progressPercent == null) return 0;

  const progress = Math.max(0, Math.min(100, Number(progressPercent)));
  return Math.round(progress * 9);
}

  function getProjectedWeeklyGain(progressPercent) {
    if (progressPercent == null) return 23;

    const progress = Number(progressPercent);

    if (progress < 35) return 35;
    if (progress < 55) return 28;
    if (progress < 75) return 23;
    if (progress < 90) return 16;
    return 10;
  }

  function getFocusArea() {
    const resumoQuestionario = state.questionarioResumo || {};
    const historico = Array.isArray(state.redacaoHistorico) ? state.redacaoHistorico : [];
    const ultimaRedacao = historico[0] || null;

    if (resumoQuestionario.focoRecomendado) return resumoQuestionario.focoRecomendado;
    if (resumoQuestionario.areaMaisFraca) return resumoQuestionario.areaMaisFraca;
    if (ultimaRedacao?.focoPrincipal) return ultimaRedacao.focoPrincipal;

    return 'Redação';
  }

  function updateTopCards(progressPercent) {
  const resumoQuestionario = state.questionarioResumo || {};
  const historicoRedacao = Array.isArray(state.redacaoHistorico) ? state.redacaoHistorico : [];
  const temQuestionario = Number(resumoQuestionario.totalQuestionarios || 0) > 0;
  const temRedacao = historicoRedacao.length > 0;

  const mediaQuestionarios = Number(resumoQuestionario.mediaGeral);
  const notaRedacao = Number(historicoRedacao[0]?.correcaoIA?.notaTotal);

  let notaSimulada = 0;
  let evolucaoSemanal = 0;
  let percentil = 0;
  let foco = 'Aguardando dados';

  if (temQuestionario && Number.isFinite(mediaQuestionarios)) {
    notaSimulada = Math.round(mediaQuestionarios * 9);
    evolucaoSemanal = 0;
    percentil = Math.max(1, Math.min(100, Math.round(mediaQuestionarios)));
    foco = resumoQuestionario.areaMaisFraca
  ? resumoQuestionario.areaMaisFraca
  : 'Treino contínuo';
  }

  if (temRedacao && Number.isFinite(notaRedacao)) {
    notaSimulada = notaSimulada
      ? Math.round((notaSimulada + notaRedacao) / 2)
      : notaRedacao;

    foco = historicoRedacao[0]?.focoPrincipal || foco || 'Redação';
  }

  const statCards = Array.from(document.querySelectorAll('.stats-grid .paper-card, .stats-grid .stat-card'));

  if (statCards[0]) {
    statCards[0].querySelector('.stat-value').textContent = String(notaSimulada);
    statCards[0].querySelector('.stat-help').textContent = temQuestionario || temRedacao
      ? 'Estimativa baseada apenas nas atividades realizadas.'
      : 'Aguardando atividades para calcular.';
  }

  if (statCards[1]) {
    statCards[1].querySelector('.stat-value').textContent = `+${evolucaoSemanal}`;
    statCards[1].querySelector('.stat-help').textContent = 'Será calculada após novas atividades.';
  }

  if (statCards[2]) {
    statCards[2].querySelector('.stat-value').textContent = `${percentil}%`;
    statCards[2].querySelector('.stat-help').textContent = temQuestionario || temRedacao
      ? 'Comparativo estimado com base no desempenho atual.'
      : 'Aguardando dados reais.';
  }

  if (statCards[3]) {
    statCards[3].querySelector('.stat-value').textContent = foco;
    statCards[3].querySelector('.stat-help').textContent = temQuestionario || temRedacao
  ? (resumoQuestionario.focoRecomendado || 'Mantenha a rotina de treino.')
  : 'Faça uma atividade para gerar recomendação.';
  }
}

  function renderRedacaoBlock() {
    const resumo = state.redacaoResumoMensal;
    const historico = state.redacaoHistorico;
    const ultima = historico[0] || null;

    const restantes = resumo ? String(resumo.restantes) : '--';

    setText(el.redacaoRestantesMes, restantes);
    setText(el.redacaoRestantesMesBackup, restantes);

    if (ultima) {
      const ultimaNota = Number(ultima?.correcaoIA?.notaTotal);

      setText(el.redacaoUltimaNota, Number.isFinite(ultimaNota) ? String(ultimaNota) : '--');
      setText(el.redacaoUltimoTema, ultima?.temaTituloSnapshot || '--');
      setText(el.redacaoFocoPrincipal, ultima?.focoPrincipal || 'Sem foco definido');
    } else {
      setText(el.redacaoUltimaNota, '--');
      setText(el.redacaoUltimoTema, 'Nenhuma redação enviada');
      setText(el.redacaoFocoPrincipal, 'Envie sua primeira redação');
    }

    if (el.btnAbrirRedacao) {
      el.btnAbrirRedacao.href = buildUrl('aluno-redacao.html');
    }
  }

  function renderQuestionarioBlock() {
    const resumo = state.questionarioResumo || {};

    setText(el.questionarioTotal, resumo.totalQuestionarios ?? '0');

    setText(
      el.questionarioMedia,
      resumo.mediaGeral != null ? `${resumo.mediaGeral}%` : '--'
    );

    setText(
      el.questionarioUltimo,
      resumo.ultimoDesempenho != null ? `${resumo.ultimoDesempenho}%` : '--'
    );

    setText(
      el.questionarioFoco,
      resumo.focoRecomendado ||
      resumo.areaMaisFraca ||
      'Comece com um treino rápido'
    );

    if (el.btnAbrirQuestionarios) {
      el.btnAbrirQuestionarios.href = buildUrl('aluno-questionarios.html');
    }
  }

function renderActivityList() {
  if (!el.activityList) return;

  const atividades = [];

  const resumoQuestionario = state.questionarioResumo || {};
  const totalQuestionarios = Number(resumoQuestionario.totalQuestionarios || 0);

  if (totalQuestionarios > 0) {
    atividades.push({
      icon: '📘',
      title: 'Questionário respondido',
      sub: resumoQuestionario.focoRecomendado || resumoQuestionario.areaMaisFraca || 'Atividade concluída recentemente',
      score: resumoQuestionario.ultimoDesempenho != null ? `${resumoQuestionario.ultimoDesempenho}%` : '--',
      label: 'Acerto'
    });
  }

  const historicoRedacao = Array.isArray(state.redacaoHistorico) ? state.redacaoHistorico : [];
  const ultimaRedacao = historicoRedacao[0];

  if (ultimaRedacao) {
    const nota = Number(ultimaRedacao?.correcaoIA?.notaTotal);

    atividades.push({
      icon: '✎',
      title: ultimaRedacao.temaTituloSnapshot || 'Redação enviada',
      sub: 'Última produção enviada',
      score: Number.isFinite(nota) ? String(nota) : '--',
      label: 'Pontuação'
    });
  }

  if (!atividades.length) {
    el.activityList.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon">📘</div>
        <div>
          <div class="activity-title">Nenhuma atividade recente ainda</div>
          <div class="activity-sub">Quando você fizer redações ou questionários, elas aparecerão aqui.</div>
        </div>
        <div class="activity-score">--<span>Aguardando</span></div>
      </div>
    `;
    return;
  }

  el.activityList.innerHTML = atividades.map((item) => `
    <article class="activity-item">
      <div class="activity-icon">${item.icon}</div>
      <div>
        <div class="activity-title">${item.title}</div>
        <div class="activity-sub">${item.sub}</div>
      </div>
      <div class="activity-score">${item.score}<span>${item.label}</span></div>
    </article>
  `).join('');
}

  function renderData() {
    const user = state.usuario || {};
    const details = state.detalhes || {};
    const aluno = details.aluno || state.aluno || {};

    const nome = aluno.nome || user.nome || 'Aluno';
    const primeiroNome = String(nome).split(' ')[0] || 'aluno';
    const turma = aluno.turma || 'Turma não informada';
    const email = user.email || '--';
    const portal = user.portal || 'aluno';

    const institutionName =
      details?.instituicao?.nome ||
      (typeof user.instituicao === 'object' ? user.instituicao?.nome : '') ||
      state.tenant ||
      'Instituição';

    const initials = getInitials(nome);
    const imageUrl =
  aluno.fotoUrl ||
  aluno.fotoOriginal ||
  aluno.foto ||
  (
    aluno.fotoThumbUrl && !String(aluno.fotoThumbUrl).includes('/api/imagens/thumb/')
      ? aluno.fotoThumbUrl
      : ''
  );
    if (el.fotoAlunoSidebar) {
  if (imageUrl) {
    el.fotoAlunoSidebar.src = cacheBustUrl(imageUrl);
    el.fotoAlunoSidebar.style.display = 'block';
  } else {
    el.fotoAlunoSidebar.removeAttribute('src');
    el.fotoAlunoSidebar.style.display = 'none';
  }
}

    if (el.sidebarAvatar && !el.fotoAlunoSidebar) {
}
    fillAvatar(el.mobileAvatar, imageUrl, initials);

    setText(el.sidebarNome, nome);
    setText(el.sidebarTurma, turma);
    setText(el.sidebarCodigo, aluno.codigoAcesso || '--');
    setText(el.sidebarInstituicao, institutionName);

    setText(el.mobileNome, nome);
    setText(el.mobileTurma, turma);

    setText(el.heroTitle, `${getGreeting()}, ${primeiroNome}!`);
    setText(
      el.heroSubtitle,
      'Cada passo te aproxima do seu objetivo. Continue assim!'
    );

    setText(el.heroInstituicao, institutionName);
    setText(el.heroTurma, turma);
    setText(el.heroPortal, 'Portal ENEM');

    setText(
      el.quickStatusText,
      'Sua área de aprendizagem está organizada para acompanhar treinos, redações e próximos passos de estudo.'
    );
    setText(el.quickStatusPill, 'Aprendizagem ativa');

    const resumoRedacao = state.redacaoResumoMensal || {};
    const resumoQuestionario = state.questionarioResumo || {};

    const redacoesRestantes = resumoRedacao.restantes ?? '--';
    const questionariosTotal = resumoQuestionario.totalQuestionarios ?? 0;
    const questionariosMedia =
      resumoQuestionario.mediaGeral != null ? `${resumoQuestionario.mediaGeral}%` : '--';

    setText(el.statNomeCurto, primeiroNome);
    setText(el.statTurma, turma);
    setText(el.statRedacoes, String(redacoesRestantes));
    setText(el.statQuestionarios, String(questionariosTotal));
    setText(el.statQuestionariosTexto, `Média: ${questionariosMedia}`);

    const progress = calculateEnemProgress();
    const progressPercent = progress == null ? null : Math.max(0, Math.min(100, progress));

    if (progressPercent == null) {
  setText(el.progressLabel, '0 / 900');
  if (el.progressFill) el.progressFill.style.width = '0%';
} else {
  const notaSimulada = calculateSimulatedEnemScore(progressPercent);
  setText(el.progressLabel, `${notaSimulada} / 900`);

  if (el.progressFill) {
    const width = Math.max(0, Math.min(100, (notaSimulada / 900) * 100));
    el.progressFill.style.width = `${width.toFixed(1)}%`;
  }
}

    updateTopCards(progressPercent);

    setText(el.accessCodigo, aluno.codigoAcesso || '--');
    setText(el.accessEmail, email);
    setText(el.accessPortal, portal);
    setText(el.accessInstituicao, institutionName);

    renderRedacaoBlock();
    renderQuestionarioBlock();
    renderActivityList();
  }

  function setupMenu() {
    el.menuButtons.forEach((button) => {
      button.addEventListener('click', () => {
        el.menuButtons.forEach((b) => b.classList.remove('active'));
        button.classList.add('active');

        const target = button.getAttribute('data-target');
        const section = document.getElementById(target);

        if (section) {
          section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  function setupRevealAnimations() {
    if (!el.fadeItems.length) return;

    if (!('IntersectionObserver' in window)) {
      el.fadeItems.forEach((item) => item.classList.add('in-view'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -20px 0px'
    });

    el.fadeItems.forEach((item) => observer.observe(item));
  }

  function setupSoftInteractions() {
    const cards = document.querySelectorAll(
      '.paper-card, .stat-card, .panel, .mission-card, .activity-item, .diagnostic-item'
    );

    cards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        card.style.transition = 'transform 160ms ease, box-shadow 160ms ease';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  async function boot() {
    try {
      showLoading();
      hydrateLocalState();

      if (!state.token) {
        throw new Error('Sessão do aluno não encontrada. Faça login novamente.');
      }

      const me = await loadMe();
      const alunoId = me?.alunoId || state.aluno?._id;

      if (!alunoId) {
        throw new Error('O usuário logado não possui aluno vinculado.');
      }

      await Promise.all([
        loadAlunoDetails(alunoId),
        loadRedacaoResumoMensal(),
        loadRedacaoHistorico(),
        loadQuestionarioResumo()
      ]);

      renderData();
      showApp();

      requestAnimationFrame(() => {
        setupRevealAnimations();
        setupSoftInteractions();
      });
    } catch (error) {
      console.error('Erro ao iniciar painel do aluno:', error);
      showError(error?.message || 'Não foi possível carregar o painel do aluno.');
    }
  }

  el.btnReload?.addEventListener('click', boot);

  el.btnBackLogin?.addEventListener('click', () => {
    clearSession();
    window.location.href = buildUrl('login-aluno.html');
  });

  el.btnLogoutSidebar?.addEventListener('click', logout);
  el.btnLogoutMobile?.addEventListener('click', logout);
  el.btnAtualizarSidebar?.addEventListener('click', boot);

  el.inputTrocarFoto?.addEventListener(
  'change',
  async (e) => {

    const arquivo = e.target.files?.[0];

    if (!arquivo) return;

    try {

      const formData = new FormData();

      formData.append('foto', arquivo);

      const alunoId =
        state.aluno?._id ||
        state.usuario?.alunoId;

      if (!alunoId) {
        throw new Error(
          'Aluno não identificado.'
        );
      }

      const response = await fetch(
        buildUrl(`/api/alunos/${alunoId}/foto`),
        {
          method: 'PUT',

          headers: {
            Authorization:
              'Bearer ' + state.token
          },

          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
          'Erro ao atualizar foto.'
        );
      }

      const novaFoto =
        data?.fotoUrl ||
        data?.aluno?.fotoUrl ||
        '';

      if (novaFoto) {

        if (el.fotoAlunoSidebar) {
          el.fotoAlunoSidebar.src = cacheBustUrl(novaFoto);
el.fotoAlunoSidebar.style.display = 'block';
        }

        if (state.aluno) {
          state.aluno.fotoUrl = novaFoto;
                  }

        localStorage.setItem(
          STORAGE.aluno,
          JSON.stringify(state.aluno)
        );

      }
await loadAlunoDetails(alunoId);
renderData();
      alert(
        'Foto atualizada com sucesso.'
      );

    } catch (err) {

      console.error(err);

      alert(
        err.message ||
        'Erro ao enviar foto.'
      );

    }

  }
);

  setupMenu();
  boot();
})();