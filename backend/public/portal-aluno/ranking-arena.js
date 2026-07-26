(function () {
  'use strict';

  const runtime = window.AxoriinAluno;
  if (!runtime || !runtime.garantirSessao()) return;

  const state = {
    escopo: 'turma',
    contexto: null,
    ranking: null
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    loading: $('rankLoading'),
    error: $('rankError'),
    errorMessage: $('rankErrorMessage'),
    app: $('rankApp'),
    retry: $('rankRetry'),
    back: $('rankBack'),
    sidebarAvatar: $('sidebarAvatar'),
    sidebarName: $('sidebarName'),
    sidebarClass: $('sidebarClass'),
    season: $('rankSeason'),
    updated: $('updatedText'),
    raceTitle: $('raceTitle'),
    raceTrack: $('raceTrack'),
    axisMiddle: $('axisMiddle'),
    axisMax: $('axisMax'),
    tableTitle: $('tableTitle'),
    rankingBody: $('rankingBody'),
    metricXp: $('metricXp'),
    metricCoins: $('metricCoins'),
    metricMissions: $('metricMissions'),
    metricPosition: $('metricPosition'),
    metricPositionHelp: $('metricPositionHelp'),
    metricStreak: $('metricStreak'),
    chart: $('trajectoryChart')
  };

  const cores = ['#f6bd4a', '#54b8ff', '#ff8a45', '#4ca7ff', '#a576ff'];
  const formatarNumero = (valor) => new Intl.NumberFormat('pt-BR').format(Number(valor || 0));

  function iniciais(nome) {
    return runtime.iniciais(nome || 'Aluno');
  }

  function fotoAluno(aluno) {
    return aluno?.foto || aluno?.fotoThumbUrl || '';
  }

  function criarFoto(aluno, classe) {
    const wrapper = document.createElement('span');
    wrapper.className = classe;
    wrapper.textContent = iniciais(aluno.nome);
    const url = fotoAluno(aluno);
    if (!url) return wrapper;
    const img = document.createElement('img');
    img.alt = `Foto de ${aluno.nome || 'aluno'}`;
    img.src = runtime.buildUrl(url);
    img.addEventListener('error', () => img.remove(), { once: true });
    wrapper.appendChild(img);
    return wrapper;
  }

  function renderPerfil() {
    const aluno = state.contexto?.aluno || state.ranking?.alunoAtual || {};
    el.sidebarName.textContent = aluno.nome || 'Aluno';
    el.sidebarClass.textContent = aluno.turma || 'Turma';
    el.sidebarAvatar.replaceChildren(criarFoto(aluno, 'rank-avatar'));
    const inner = el.sidebarAvatar.firstElementChild;
    if (inner?.classList?.contains('rank-avatar')) {
      el.sidebarAvatar.replaceChildren(...inner.childNodes);
    }
  }

  function progressoPercentual(item, maxXp, index) {
    if (!maxXp) return 12 + index * 2;
    const bruto = (Number(item.xp || 0) / maxXp) * 100;
    return Math.max(12, Math.min(87, bruto));
  }


function renderCorrida() {
  const top5 = state.ranking?.top5 || [];
  const maxXp = Math.max(1, ...top5.map((item) => Number(item.xp || 0)));
  el.raceTrack.replaceChildren();

  if (!top5.length) {
    const vazio = document.createElement('div');
    vazio.className = 'rank-note';
    vazio.textContent = 'Ainda não existem alunos com participação registrada na Arena.';
    el.raceTrack.appendChild(vazio);
    return;
  }

  top5.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'race-row';
    row.style.setProperty('--car-color', cores[index] || '#4ca7ff');

    const info = document.createElement('div');
    info.className = 'racer-info';
    const position = document.createElement('div');
    position.className = 'racer-position';
    position.textContent = `${item.posicao}º`;
    const name = document.createElement('div');
    name.className = 'racer-name';
    const strong = document.createElement('strong');
    strong.textContent = item.nome;
    const span = document.createElement('span');
    span.textContent = `${formatarNumero(item.xp)} XP`;
    name.append(strong, span);
    info.append(position, name);

    const zone = document.createElement('div');
    zone.className = 'race-zone';
    const car = document.createElement('div');
    car.className = 'formula-car';
    car.style.setProperty('--progress', `${progressoPercentual(item, maxXp, index) / 100}`);
    car.style.setProperty('--delay', `${index * 110}ms`);

    const sprite = document.createElement('img');
    sprite.className = 'car-sprite';
    sprite.alt = '';
    sprite.src = runtime.buildUrl(`/portal-aluno/assets/ranking/cars/car_${Math.min(index + 1, 5)}.png`);
    sprite.setAttribute('loading', 'eager');

    car.append(sprite, criarFoto(item, 'driver-face'));
    zone.appendChild(car);
    row.append(info, zone);
    el.raceTrack.appendChild(row);
  });

  el.axisMiddle.textContent = `${formatarNumero(Math.round(maxXp / 2))} XP`;
  el.axisMax.textContent = `${formatarNumero(maxXp)} XP`;
}

function renderTabela() {
    const ranking = state.ranking?.ranking || [];
    const atualId = String(state.ranking?.alunoAtual?.alunoId || '');
    el.rankingBody.replaceChildren();

    ranking.forEach((item) => {
      const tr = document.createElement('tr');
      if (String(item.alunoId) === atualId) tr.classList.add('current');

      const pos = document.createElement('td');
      pos.className = 'position-number';
      pos.textContent = `${item.posicao}º`;

      const student = document.createElement('td');
      const box = document.createElement('div');
      box.className = 'table-student';
      box.appendChild(criarFoto(item, 'table-photo'));
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.nome;
      const turma = document.createElement('small');
      turma.textContent = item.turma || '';
      text.append(name, turma);
      box.appendChild(text);
      student.appendChild(box);

      const xp = document.createElement('td');
      xp.textContent = formatarNumero(item.xp);
      const coins = document.createElement('td');
      coins.textContent = formatarNumero(item.moedas);
      const missions = document.createElement('td');
      missions.textContent = formatarNumero(item.missoes);
      const accuracy = document.createElement('td');
      accuracy.textContent = item.questoes ? `${item.percentualAcerto}%` : '—';

      tr.append(pos, student, xp, coins, missions, accuracy);
      el.rankingBody.appendChild(tr);
    });
  }

  function renderMetricas() {
    const resumo = state.ranking?.resumo || {};
    el.metricXp.textContent = formatarNumero(resumo.xp);
    el.metricCoins.textContent = formatarNumero(resumo.moedas);
    el.metricMissions.textContent = formatarNumero(resumo.missoes);
    el.metricPosition.textContent = resumo.posicao ? `${resumo.posicao}º` : '—';
    el.metricPositionHelp.textContent = resumo.totalParticipantes
      ? `Entre ${resumo.totalParticipantes} alunos`
      : 'Sem participantes ainda';
    el.metricStreak.textContent = `${formatarNumero(resumo.sequencia)} ${Number(resumo.sequencia) === 1 ? 'dia' : 'dias'}`;
  }

  function renderGrafico() {
    const dados = state.ranking?.trajetoria || [];
    const svg = el.chart;
    svg.replaceChildren();
    if (!dados.length) return;

    const width = 640;
    const height = 220;
    const pad = { left: 38, right: 24, top: 30, bottom: 38 };
    const values = dados.map((item) => Number(item.xpAcumulado || 0));
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = Math.max(1, max - min);

    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    const gradient = document.createElementNS(ns, 'linearGradient');
    gradient.id = 'chartGradient';
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', '0');
    gradient.setAttribute('y2', '1');
    [['0%', '#4b91ff', '.45'], ['100%', '#4b91ff', '0']].forEach(([offset, color, opacity]) => {
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
    svg.appendChild(defs);

    [0, .5, 1].forEach((ratio) => {
      const y = pad.top + (height - pad.top - pad.bottom) * ratio;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', pad.left);
      line.setAttribute('x2', width - pad.right);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      line.setAttribute('class', 'chart-grid');
      svg.appendChild(line);
    });

    const points = dados.map((item, index) => {
      const x = pad.left + ((width - pad.left - pad.right) * index) / Math.max(1, dados.length - 1);
      const y = pad.top + (height - pad.top - pad.bottom) * (1 - ((Number(item.xpAcumulado || 0) - min) / range));
      return { x, y, item };
    });

    const pathValue = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', `${pathValue} L ${points.at(-1).x} ${height - pad.bottom} L ${points[0].x} ${height - pad.bottom} Z`);
    area.setAttribute('class', 'chart-area');
    svg.appendChild(area);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathValue);
    path.setAttribute('class', 'chart-line');
    svg.appendChild(path);

    points.forEach(({ x, y, item }) => {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 6);
      dot.setAttribute('class', 'chart-dot');
      svg.appendChild(dot);

      const value = document.createElementNS(ns, 'text');
      value.setAttribute('x', x);
      value.setAttribute('y', y - 13);
      value.setAttribute('text-anchor', 'middle');
      value.setAttribute('class', 'chart-value');
      value.textContent = formatarNumero(item.xpAcumulado);
      svg.appendChild(value);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', height - 12);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'chart-label');
      label.textContent = item.rotulo;
      svg.appendChild(label);
    });
  }

  function renderTudo() {
    const escopoTurma = state.escopo === 'turma';
    el.season.textContent = state.ranking?.temporada?.rotulo || 'Temporada Fundamental II';
    el.raceTitle.textContent = escopoTurma ? 'Top 5 da turma' : 'Top 5 geral';
    el.tableTitle.textContent = escopoTurma ? 'Classificação da turma' : 'Classificação geral';
    const atualizado = state.ranking?.atualizadoEm ? new Date(state.ranking.atualizadoEm) : null;
    el.updated.textContent = atualizado && !Number.isNaN(atualizado.getTime())
      ? `Atualizado às ${atualizado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Dados reais';
    renderPerfil();
    renderCorrida();
    renderTabela();
    renderMetricas();
    renderGrafico();
  }

  async function carregar() {
    el.loading.classList.remove('hidden');
    el.error.classList.add('hidden');
    el.app.classList.add('hidden');
    try {
      const [contexto, ranking] = await Promise.all([
        state.contexto ? Promise.resolve(state.contexto) : runtime.apiFetch('/api/portal-aluno/contexto'),
        runtime.apiFetch(`/api/portal-aluno/ranking-arena?escopo=${encodeURIComponent(state.escopo)}`)
      ]);
      state.contexto = contexto;
      state.ranking = ranking;
      renderTudo();
      el.loading.classList.add('hidden');
      el.app.classList.remove('hidden');
    } catch (error) {
      el.loading.classList.add('hidden');
      el.error.classList.remove('hidden');
      el.errorMessage.textContent = error?.message || 'Tente novamente.';
    }
  }

  document.querySelectorAll('[data-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      const novo = button.dataset.scope === 'geral' ? 'geral' : 'turma';
      if (novo === state.escopo) return;
      state.escopo = novo;
      document.querySelectorAll('[data-scope]').forEach((item) => item.classList.toggle('active', item === button));
      carregar();
    });
  });

  el.retry.addEventListener('click', carregar);
  el.back.addEventListener('click', () => runtime.ir('/painel-aluno.html'));
  runtime.registrarPwa();
  carregar();
})();
