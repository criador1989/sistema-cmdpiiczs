(() => {
  'use strict';

  const INTERVALO_ATUALIZACAO_MS = 8000;
  const CHAVE_SOM = 'axoriin.observacoesProfessores.alertasSonoros.v1_4';
  const URL_SIRENE = '/audio/alerta-observacao.wav?v=1.8.0';
  const ORDEM_PRIORIDADE = { normal: 1, atencao: 2, urgente: 3 };

  const estado = {
    usuario: null,
    itens: [],
    atual: null,
    timer: null,
    carregando: false,
    primeiraCarga: true,
    idsNaoLidos: new Set(),
    totalNaoLidas: 0,
    prioridadeAtual: 'normal',
    tituloOriginal: document.title,
    audioContext: null,
    audioElement: null,
    permissaoNotificacaoSolicitada: false,
    audioDisponivel: Boolean(window.Audio || window.AudioContext || window.webkitAudioContext),
    somAtivado: lerPreferenciaSom(),
    audioDesbloqueado: false,
    alertaPendente: false,
    prioridadePendente: 'normal',
    tocando: false,
    ultimaSireneEm: 0,
    timerAviso: null,
    mostrarHistorico: false
  };

  const categorias = {
    comportamento: 'Comportamento', participacao_pedagogica: 'Participação pedagógica',
    convivencia: 'Convivência', seguranca: 'Segurança', atividade: 'Atividade', elogio: 'Elogio', outro: 'Outro'
  };
  const prioridades = { normal: 'Normal', atencao: 'Atenção', urgente: 'Urgente' };
  const situacoes = { nova: 'Nova', lida: 'Lida', em_atendimento: 'Em atendimento', resolvida: 'Resolvida', arquivada: 'Arquivada' };

  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const idValor = (v) => String(v?._id || v || '');
  const dataHora = (v) => {
    const d = new Date(v); if (!v || Number.isNaN(d.getTime())) return 'Data não informada';
    return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  };

  function lerPreferenciaSom() {
    try { return localStorage.getItem(CHAVE_SOM) !== '0'; }
    catch (_error) { return true; }
  }

  function salvarPreferenciaSom(valor) {
    try { localStorage.setItem(CHAVE_SOM, valor ? '1' : '0'); }
    catch (_error) { /* Preferência apenas local; falha não impede o módulo. */ }
  }

  function maiorPrioridade(a = 'normal', b = 'normal') {
    return (ORDEM_PRIORIDADE[b] || 1) > (ORDEM_PRIORIDADE[a] || 1) ? b : a;
  }

  function prioridadeDosItens(itens = []) {
    return itens.reduce((atual, item) => maiorPrioridade(atual, item?.prioridade), 'normal');
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include', cache: 'no-store', ...options,
      headers: { Accept: 'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.mensagem || payload.erro || 'Não foi possível concluir a operação.');
    return payload;
  }

  function garantirEstrutura() {
    if (document.getElementById('opAdminWidget')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/observacoes-professores-admin.css?v=1.8.0';
    document.head.appendChild(link);

    document.body.insertAdjacentHTML('beforeend', `
      <aside class="op-admin-widget" id="opAdminWidget" aria-label="Notificações dos professores" hidden>
        <header class="op-admin-head">
          <div class="op-admin-beacon" id="opAdminBeacon" aria-hidden="true">
            <span class="op-admin-beacon-light"></span><span class="op-admin-beacon-base"></span>
          </div>
          <div class="op-admin-head-copy"><h2>Notificações dos professores</h2><p>Registros que precisam de acompanhamento</p></div>
          <span class="op-admin-count zero" id="opAdminCount">0</span>
          <button class="op-admin-history" id="opAdminHistory" type="button" title="Mostrar histórico" aria-label="Mostrar histórico completo" aria-pressed="false">🗂️</button>
          <button class="op-admin-sound" id="opAdminSound" type="button" title="Alertas sonoros" aria-label="Alertas sonoros" aria-pressed="true">🔊</button>
          <button class="op-admin-refresh" id="opAdminRefresh" type="button" title="Atualizar" aria-label="Atualizar notificações">↻</button>
          <button class="op-admin-toggle" id="opAdminToggle" type="button" title="Recolher" aria-label="Recolher notificações">⌄</button>
        </header>
        <div class="op-admin-summary" id="opAdminSummary">Carregando registros...</div>
        <div class="op-admin-audio-hint" id="opAdminAudioHint" hidden>
          <span>O navegador bloqueou o áudio inicial. A sirene será liberada automaticamente na primeira interação com o painel.</span>
        </div>
        <div class="op-admin-live-alert" id="opAdminLiveAlert" role="status" aria-live="assertive" hidden></div>
        <div class="op-admin-list" id="opAdminList"><div class="op-admin-empty">Carregando...</div></div>
      </aside>
      <div class="op-admin-modal-backdrop" id="opAdminBackdrop" hidden>
        <section class="op-admin-modal" role="dialog" aria-modal="true" aria-labelledby="opAdminModalTitle">
          <header class="op-admin-modal-head">
            <div class="op-admin-modal-title"><h3 id="opAdminModalTitle">Observação do professor</h3><p id="opAdminModalSubtitle"></p></div>
            <button class="op-admin-close" id="opAdminClose" type="button" aria-label="Fechar">×</button>
          </header>
          <div class="op-admin-modal-body" id="opAdminModalBody"></div>
        </section>
      </div>`);

    document.getElementById('opAdminRefresh').addEventListener('click', carregarFeed);
    document.getElementById('opAdminHistory').addEventListener('click', () => {
      estado.mostrarHistorico = !estado.mostrarHistorico;
      const botao = document.getElementById('opAdminHistory');
      botao.classList.toggle('active', estado.mostrarHistorico);
      botao.setAttribute('aria-pressed', String(estado.mostrarHistorico));
      botao.title = estado.mostrarHistorico ? 'Mostrar somente registros ativos' : 'Mostrar histórico completo';
      carregarFeed();
    });
    document.getElementById('opAdminToggle').addEventListener('click', () => {
      document.getElementById('opAdminWidget').classList.toggle('collapsed');
    });
    document.getElementById('opAdminSound').addEventListener('click', alternarSom);
    document.getElementById('opAdminList').addEventListener('click', (event) => {
      const lote = event.target.closest('[data-op-lote]');
      if (lote) { abrirLote(lote.dataset.opLote); return; }
      const item = event.target.closest('[data-op-id]');
      if (item) abrir(item.dataset.opId);
    });
    document.getElementById('opAdminClose').addEventListener('click', fecharModal);
    document.getElementById('opAdminBackdrop').addEventListener('click', (event) => {
      if (event.target.id === 'opAdminBackdrop') fecharModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') fecharModal();
    });

    atualizarControleSom();
    prepararDesbloqueioAudio();
  }

  function obterAudioContext() {
    if (!estado.audioDisponivel) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!estado.audioContext || estado.audioContext.state === 'closed') {
      estado.audioContext = new AudioContextClass();
    }
    return estado.audioContext;
  }

  function obterAudioElement() {
    if (typeof window.Audio !== 'function') return null;

    if (!estado.audioElement) {
      const audio = new Audio(URL_SIRENE);
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => { estado.tocando = false; });
      audio.addEventListener('pause', () => {
        if (audio.currentTime === 0 || audio.ended) estado.tocando = false;
      });
      estado.audioElement = audio;
    }
    return estado.audioElement;
  }

  async function solicitarNotificacoesDoSistema() {
    if (estado.permissaoNotificacaoSolicitada || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    estado.permissaoNotificacaoSolicitada = true;
    try {
      await Notification.requestPermission();
    } catch (_error) {
      // A permissão do sistema é opcional e não impede os alertas no painel.
    }
  }

  function notificarSistema(itens = []) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted' || !itens.length) return;

    const primeiro = itens[0];
    const quantidade = itens.length;
    const titulo = quantidade === 1
      ? 'Nova observação de professor'
      : `${quantidade} novas observações de professores`;
    const corpo = quantidade === 1
      ? `${primeiro.alunoNome || 'Aluno'} • ${primeiro.turma || 'Turma não informada'} — ${String(primeiro.texto || '').slice(0, 150)}`
      : 'Há novos registros aguardando leitura no painel administrativo.';

    try {
      const notificacao = new Notification(titulo, {
        body: corpo,
        tag: 'axoriin-observacoes-professores',
        renotify: true,
        requireInteraction: Boolean(itens.some((item) => item.prioridade === 'urgente')),
      });
      notificacao.onclick = () => {
        window.focus();
        notificacao.close();
      };
    } catch (_error) {
      // Alguns navegadores aceitam a permissão, mas limitam notificações em segundo plano.
    }
  }

  function atualizarControleSom() {
    const botao = document.getElementById('opAdminSound');
    if (!botao) return;

    if (!estado.audioDisponivel) {
      botao.textContent = '🔇';
      botao.disabled = true;
      botao.title = 'Este navegador não oferece alertas sonoros';
      botao.setAttribute('aria-label', botao.title);
      botao.setAttribute('aria-pressed', 'false');
      return;
    }

    botao.disabled = false;
    botao.textContent = estado.somAtivado ? '🔊' : '🔇';
    botao.classList.toggle('disabled', !estado.somAtivado);
    botao.title = estado.somAtivado ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros';
    botao.setAttribute('aria-label', botao.title);
    botao.setAttribute('aria-pressed', String(estado.somAtivado));
  }

  function exibirAvisoAudio(mostrar) {
    const aviso = document.getElementById('opAdminAudioHint');
    if (!aviso) return;
    aviso.hidden = !mostrar || !estado.somAtivado || !estado.audioDisponivel;
  }

  async function desbloquearAudio(tocarPendente = false) {
    if (!estado.somAtivado || !estado.audioDisponivel) return false;

    const contexto = obterAudioContext();
    const audio = obterAudioElement();
    let contextoLiberado = false;
    let midiaLiberada = false;

    try {
      if (contexto?.state === 'suspended') await contexto.resume();
      contextoLiberado = contexto?.state === 'running';
    } catch (_error) {
      contextoLiberado = false;
    }

    if (audio && (!tocarPendente || !estado.alertaPendente)) {
      try {
        const volumeAnterior = audio.volume;
        audio.volume = 0.001;
        audio.currentTime = 0;
        await audio.play();
        midiaLiberada = true;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volumeAnterior;
      } catch (_error) {
        midiaLiberada = false;
      }
    }

    estado.audioDesbloqueado = contextoLiberado || midiaLiberada;
    exibirAvisoAudio(!estado.audioDesbloqueado && estado.alertaPendente);

    if (tocarPendente && estado.alertaPendente) {
      const prioridade = estado.prioridadePendente;
      const tocou = await tocarSirene(prioridade, true);
      estado.audioDesbloqueado = tocou || contextoLiberado || midiaLiberada;
    }

    return estado.audioDesbloqueado;
  }

  function prepararDesbloqueioAudio() {
    const eventos = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];

    const tentar = () => {
      solicitarNotificacoesDoSistema();
      desbloquearAudio(true).then((liberado) => {
        if (!liberado) return;
        eventos.forEach((evento) => window.removeEventListener(evento, tentar, true));
      });
    };

    eventos.forEach((evento) => window.addEventListener(evento, tentar, { capture: true, passive: true }));

    window.addEventListener('focus', () => desbloquearAudio(true));
    window.addEventListener('pageshow', () => desbloquearAudio(true));
  }

  function tocarSireneSintetica(prioridade = 'normal', ignorarIntervalo = false) {
    if (!estado.somAtivado || !estado.audioDisponivel || estado.tocando) return false;

    const agoraMs = Date.now();
    if (!ignorarIntervalo && agoraMs - estado.ultimaSireneEm < 3000) return false;

    const contexto = obterAudioContext();
    if (!contexto || contexto.state !== 'running') return false;

    const agora = contexto.currentTime;
    const duracao = prioridade === 'urgente' ? 2.05 : prioridade === 'atencao' ? 1.65 : 1.25;
    const volume = prioridade === 'urgente' ? 0.07 : prioridade === 'atencao' ? 0.058 : 0.048;
    const frequenciaBaixa = prioridade === 'urgente' ? 620 : 560;
    const frequenciaAlta = prioridade === 'urgente' ? 1120 : prioridade === 'atencao' ? 1020 : 940;

    const oscilador = contexto.createOscillator();
    const filtro = contexto.createBiquadFilter();
    const ganho = contexto.createGain();

    oscilador.type = 'sawtooth';
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(1750, agora);
    ganho.gain.setValueAtTime(0.0001, agora);
    ganho.gain.exponentialRampToValueAtTime(volume, agora + 0.045);
    ganho.gain.setValueAtTime(volume, agora + Math.max(0.08, duracao - 0.12));
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao);

    for (let deslocamento = 0; deslocamento < duracao; deslocamento += 0.34) {
      const inicio = agora + deslocamento;
      const meio = Math.min(agora + duracao, inicio + 0.17);
      const fim = Math.min(agora + duracao, inicio + 0.34);
      oscilador.frequency.setValueAtTime(frequenciaBaixa, inicio);
      oscilador.frequency.linearRampToValueAtTime(frequenciaAlta, meio);
      oscilador.frequency.linearRampToValueAtTime(frequenciaBaixa, fim);
    }

    oscilador.connect(filtro);
    filtro.connect(ganho);
    ganho.connect(contexto.destination);

    estado.tocando = true;
    estado.ultimaSireneEm = agoraMs;
    estado.alertaPendente = false;
    estado.prioridadePendente = 'normal';
    exibirAvisoAudio(false);

    oscilador.onended = () => {
      estado.tocando = false;
      try { oscilador.disconnect(); filtro.disconnect(); ganho.disconnect(); } catch (_error) { /* Já desconectado. */ }
    };
    oscilador.start(agora);
    oscilador.stop(agora + duracao + 0.02);
    return true;
  }

  async function tocarSirene(prioridade = 'normal', ignorarIntervalo = false) {
    if (!estado.somAtivado || !estado.audioDisponivel || estado.tocando) return false;

    const agoraMs = Date.now();
    if (!ignorarIntervalo && agoraMs - estado.ultimaSireneEm < 3000) return false;

    const audio = obterAudioElement();
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prioridade === 'urgente' ? 0.8 : prioridade === 'atencao' ? 0.68 : 0.58;
        audio.playbackRate = prioridade === 'urgente' ? 1.08 : 1;
        estado.tocando = true;
        await audio.play();

        estado.audioDesbloqueado = true;
        estado.ultimaSireneEm = agoraMs;
        estado.alertaPendente = false;
        estado.prioridadePendente = 'normal';
        exibirAvisoAudio(false);
        return true;
      } catch (_error) {
        estado.tocando = false;
      }
    }

    try {
      const contexto = obterAudioContext();
      if (contexto?.state === 'suspended') await contexto.resume();
    } catch (_error) {
      // O navegador ainda exige uma interação do usuário.
    }

    if (tocarSireneSintetica(prioridade, ignorarIntervalo)) {
      estado.audioDesbloqueado = true;
      return true;
    }

    estado.alertaPendente = true;
    estado.prioridadePendente = maiorPrioridade(estado.prioridadePendente, prioridade);
    estado.audioDesbloqueado = false;
    exibirAvisoAudio(true);
    return false;
  }

  async function ativarSomExplicitamente() {
    estado.somAtivado = true;
    salvarPreferenciaSom(true);
    atualizarControleSom();
    if (estado.totalNaoLidas > 0) {
      estado.alertaPendente = true;
      estado.prioridadePendente = estado.prioridadeAtual;
    }
    const liberado = await desbloquearAudio(true);
    if (!liberado) exibirAvisoAudio(true);
  }

  async function alternarSom() {
    estado.somAtivado = !estado.somAtivado;
    salvarPreferenciaSom(estado.somAtivado);
    atualizarControleSom();

    if (!estado.somAtivado) {
      estado.alertaPendente = false;
      estado.prioridadePendente = 'normal';
      exibirAvisoAudio(false);
      return;
    }

    if (estado.totalNaoLidas > 0) {
      estado.alertaPendente = true;
      estado.prioridadePendente = estado.prioridadeAtual;
    }
    await desbloquearAudio(true);
  }

  function mostrarAlertaVisual(quantidade, prioridade, inicial = false) {
    const aviso = document.getElementById('opAdminLiveAlert');
    if (!aviso || quantidade < 1) return;

    clearTimeout(estado.timerAviso);
    aviso.className = `op-admin-live-alert ${prioridade}`;
    aviso.innerHTML = inicial
      ? `<strong>🚨 Atenção</strong><span>${quantidade} ${quantidade === 1 ? 'observação aguarda' : 'observações aguardam'} sua leitura.</span>`
      : `<strong>🚨 Nova observação recebida</strong><span>${quantidade === 1 ? 'Um novo registro foi enviado por professor.' : `${quantidade} novos registros foram enviados por professores.`}</span>`;
    aviso.hidden = false;
    estado.timerAviso = setTimeout(() => { if (aviso) aviso.hidden = true; }, inicial ? 4200 : 6000);
  }

  function atualizarEstadoVisual(naoLidas, itensNaoLidos) {
    const widget = document.getElementById('opAdminWidget');
    if (!widget) return;

    const prioridade = prioridadeDosItens(itensNaoLidos);
    estado.totalNaoLidas = naoLidas;
    estado.prioridadeAtual = prioridade;

    widget.classList.toggle('has-unread', naoLidas > 0);
    widget.classList.toggle('has-urgent', naoLidas > 0 && prioridade === 'urgente');
    widget.classList.toggle('has-attention', naoLidas > 0 && prioridade === 'atencao');

    const beacon = document.getElementById('opAdminBeacon');
    if (beacon) beacon.setAttribute('aria-hidden', String(naoLidas === 0));

    document.title = naoLidas > 0
      ? `(${naoLidas > 99 ? '99+' : naoLidas}) ${estado.tituloOriginal}`
      : estado.tituloOriginal;
  }

  function agruparItensDoFeed(itens = []) {
    const grupos = [];
    const lotes = new Map();

    itens.forEach((item) => {
      if (item.loteId && Number(item.loteTotal || 1) > 1) {
        if (!lotes.has(item.loteId)) {
          const grupo = { tipo: 'lote', loteId: item.loteId, itens: [] };
          lotes.set(item.loteId, grupo);
          grupos.push(grupo);
        }
        lotes.get(item.loteId).itens.push(item);
      } else {
        grupos.push({ tipo: 'individual', item });
      }
    });

    return grupos;
  }

  function resumirNomesLote(itens = []) {
    const nomes = itens.map((item) => item.alunoNome).filter(Boolean);
    const visiveis = nomes.slice(0, 3).join(', ');
    return nomes.length > 3 ? `${visiveis} e mais ${nomes.length - 3}` : visiveis;
  }

  function renderFeed(payload) {
    const widget = document.getElementById('opAdminWidget');
    const list = document.getElementById('opAdminList');
    const count = document.getElementById('opAdminCount');
    const summary = document.getElementById('opAdminSummary');
    const itens = Array.isArray(payload.observacoes) ? payload.observacoes : [];
    const itensAtivos = itens.filter((item) => !['resolvida', 'arquivada'].includes(item.status));
    const itensNaoLidos = itensAtivos.filter((item) => !item.lidaPeloUsuario);
    const idsAtuais = new Set(itensNaoLidos.map((item) => idValor(item._id)).filter(Boolean));
    const itensNovos = estado.primeiraCarga
      ? itensNaoLidos
      : itensNaoLidos.filter((item) => !estado.idsNaoLidos.has(idValor(item._id)));
    const idsNovos = new Set(itensNovos.map((item) => idValor(item._id)));
    const grupos = agruparItensDoFeed(itens);

    estado.itens = itens;

    const naoLidas = Number(payload.totalNaoLidas || itensNaoLidos.length || 0);
    const ativas = Number(payload.totalAtivas || itensAtivos.length || 0);
    const totalRegistros = Number(payload.totalRegistros || itens.length || 0);
    count.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
    count.classList.toggle('zero', naoLidas === 0);
    summary.textContent = estado.mostrarHistorico
      ? `Histórico completo • ${totalRegistros} ${totalRegistros === 1 ? 'registro' : 'registros'} • ${grupos.length} ${grupos.length === 1 ? 'aviso exibido' : 'avisos exibidos'}`
      : `${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'} • ${ativas} ${ativas === 1 ? 'registro ativo' : 'registros ativos'} • ${grupos.length} ${grupos.length === 1 ? 'aviso' : 'avisos'}`;

    atualizarEstadoVisual(naoLidas, itensNaoLidos);

    if (!grupos.length) {
      list.innerHTML = `<div class="op-admin-empty">${estado.mostrarHistorico ? 'Nenhuma observação encontrada no histórico.' : 'Nenhuma observação ativa dos professores.'}</div>`;
      widget.hidden = false;
    } else {
      list.innerHTML = grupos.map((grupo) => {
        if (grupo.tipo === 'individual') {
          const item = grupo.item;
          const unread = !item.lidaPeloUsuario;
          const nova = idsNovos.has(idValor(item._id));
          const owner = item.atendimento?.nome ? `<div class="op-admin-owner">Em atendimento por ${esc(item.atendimento.nome)}</div>` : '';
          return `<button class="op-admin-item ${unread ? 'unread' : ''} ${nova ? 'new-arrival' : ''} ${esc(item.prioridade)}" type="button" data-op-id="${esc(item._id)}">
            <div class="op-admin-item-top">
              <span class="op-admin-dot ${unread ? '' : 'read'}"></span>
              <span class="op-admin-name">${esc(item.alunoNome)} • ${esc(item.turma)}</span>
              <span class="op-admin-chip ${esc(item.prioridade)}">${esc(prioridades[item.prioridade] || item.prioridade)}</span>
              ${estado.mostrarHistorico ? `<span class="op-admin-chip status">${esc(situacoes[item.status] || item.status)}</span>` : ''}
            </div>
            <div class="op-admin-text">${esc(item.texto)}</div>
            <div class="op-admin-meta"><span>${esc(item.professorNome)}</span><span>${esc(dataHora(item.createdAt))}</span></div>
            ${owner}
          </button>`;
        }

        const itensLote = grupo.itens;
        const primeiro = itensLote[0];
        const unread = itensLote.some((item) => !item.lidaPeloUsuario);
        const nova = itensLote.some((item) => idsNovos.has(idValor(item._id)));
        const prioridade = prioridadeDosItens(itensLote);
        const totalOriginal = Math.max(Number(primeiro.loteTotal || 0), itensLote.length);
        const naoLidasLote = itensLote.filter((item) => !item.lidaPeloUsuario).length;
        return `<button class="op-admin-item op-admin-batch ${unread ? 'unread' : ''} ${nova ? 'new-arrival' : ''} ${esc(prioridade)}" type="button" data-op-lote="${esc(grupo.loteId)}">
          <div class="op-admin-item-top">
            <span class="op-admin-dot ${unread ? '' : 'read'}"></span>
            <span class="op-admin-name">${totalOriginal} alunos • ${esc(primeiro.turma)}</span>
            <span class="op-admin-chip ${esc(prioridade)}">${esc(prioridades[prioridade] || prioridade)}</span>
            ${estado.mostrarHistorico ? `<span class="op-admin-chip status">${esc(new Set(itensLote.map((item) => item.status)).size > 1 ? 'Situações diferentes' : (situacoes[primeiro.status] || primeiro.status))}</span>` : ''}
          </div>
          <div class="op-admin-batch-label">REGISTRO EM LOTE${naoLidasLote ? ` • ${naoLidasLote} não ${naoLidasLote === 1 ? 'lida' : 'lidas'}` : ''}</div>
          <div class="op-admin-text">${esc(primeiro.texto)}</div>
          <div class="op-admin-batch-names">${esc(resumirNomesLote(itensLote))}</div>
          <div class="op-admin-meta"><span>${esc(primeiro.professorNome)}</span><span>${esc(dataHora(primeiro.createdAt))}</span></div>
        </button>`;
      }).join('');
      widget.hidden = false;
    }

    const deveAlertar = !estado.mostrarHistorico && (estado.primeiraCarga ? naoLidas > 0 : itensNovos.length > 0);
    if (deveAlertar) {
      const quantidade = estado.primeiraCarga ? naoLidas : itensNovos.length;
      const prioridade = prioridadeDosItens(estado.primeiraCarga ? itensNaoLidos : itensNovos);
      mostrarAlertaVisual(quantidade, prioridade, estado.primeiraCarga);
      if (!estado.primeiraCarga) notificarSistema(itensNovos);
      estado.alertaPendente = estado.somAtivado;
      estado.prioridadePendente = maiorPrioridade(estado.prioridadePendente, prioridade);
      if (estado.somAtivado) setTimeout(() => { tocarSirene(prioridade); }, 120);
    }

    estado.idsNaoLidos = idsAtuais;
    estado.primeiraCarga = false;
  }

  async function carregarFeed() {
    if (estado.carregando) return;
    estado.carregando = true;
    try {
      const incluirConcluidas = estado.mostrarHistorico ? '&incluirConcluidas=1' : '';
      renderFeed(await api(`/api/observacoes-professores/admin/feed?limit=100${incluirConcluidas}`));
    } catch (error) {
      const summary = document.getElementById('opAdminSummary');
      const list = document.getElementById('opAdminList');
      if (summary) summary.textContent = 'Falha ao atualizar';
      if (list) list.innerHTML = `<div class="op-admin-empty">${esc(error.message)}</div>`;
    } finally { estado.carregando = false; }
  }

  function modalFeedback(texto = '', tipo = '') {
    const el = document.getElementById('opAdminFeedback');
    if (!el) return;
    el.textContent = texto; el.className = `op-admin-feedback${tipo ? ` ${tipo}` : ''}`;
  }

  function renderModalLote(payload) {
    const lote = payload?.lote || {};
    const itens = Array.isArray(payload?.observacoes) ? payload.observacoes : [];
    estado.atual = null;

    document.getElementById('opAdminModalTitle').textContent = `${lote.total || itens.length} alunos • ${lote.turma || 'Turma não informada'}`;
    document.getElementById('opAdminModalSubtitle').textContent = `Registro em lote por ${lote.professorNome || 'Professor'} em ${dataHora(lote.createdAt)}`;
    document.getElementById('opAdminModalBody').innerHTML = `
      <div class="op-admin-detail-grid">
        <div class="op-admin-detail"><b>Categoria</b><span>${esc(categorias[lote.categoria] || lote.categoria || 'Não informada')}</span></div>
        <div class="op-admin-detail"><b>Prioridade</b><span>${esc(prioridades[lote.prioridade] || lote.prioridade || 'Normal')}</span></div>
        <div class="op-admin-detail"><b>Professor</b><span>${esc(lote.professorNome || 'Não informado')}</span></div>
        <div class="op-admin-detail"><b>Componente</b><span>${esc(lote.componenteCurricular || 'Não informado')}</span></div>
      </div>
      <div class="op-admin-report">${esc(lote.texto || '')}</div>
      <div class="op-admin-batch-modal-note">O relato foi registrado individualmente na ficha de cada aluno. Abra um estudante para assumir, encaminhar ou resolver o acompanhamento específico.</div>
      <div class="op-admin-batch-students">
        ${itens.map((item) => `<button class="op-admin-batch-student" type="button" data-op-open-id="${esc(item._id)}">
          <span><strong>${esc(item.alunoNome)}</strong><small>${esc(situacoes[item.status] || item.status)}${item.atendimento?.nome ? ` • ${esc(item.atendimento.nome)}` : ''}</small></span>
          <em>Abrir →</em>
        </button>`).join('')}
      </div>
      <div class="op-admin-danger-zone">
        <strong>Correção de registros indevidos</strong>
        <p>Use somente para testes ou lançamentos realizados por engano. A exclusão remove todas as observações deste lote das fichas e dos históricos.</p>
        <button class="op-admin-btn danger" type="button" id="opAdminExcluirLote">Excluir lote permanentemente</button>
      </div>
      <div class="op-admin-feedback" id="opAdminFeedback" role="status"></div>`;

    document.querySelectorAll('[data-op-open-id]').forEach((botao) => {
      botao.addEventListener('click', () => abrir(botao.dataset.opOpenId));
    });
    document.getElementById('opAdminExcluirLote').onclick = () => excluirLotePermanentemente(lote.loteId);
  }

  async function abrirLote(loteId) {
    try {
      const payload = await api(`/api/observacoes-professores/admin/lote/${encodeURIComponent(loteId)}`);
      renderModalLote(payload);
      document.getElementById('opAdminBackdrop').hidden = false;
      document.body.style.overflow = 'hidden';
      await carregarFeed();
    } catch (error) {
      window.alert(error.message);
    }
  }

  function renderModal(item) {
    estado.atual = item;
    const currentId = idValor(estado.usuario?.id);
    const ownerId = idValor(item.atendimento?.usuario);
    const semResponsavel = !ownerId;
    const souResponsavel = ownerId && ownerId === currentId;
    const concluida = ['resolvida','arquivada'].includes(item.status);
    const bloqueadoPorOutro = Boolean(ownerId && !souResponsavel && !concluida);
    const ownerText = item.atendimento?.nome
      ? `<strong>${esc(item.atendimento.nome)}</strong> desde ${esc(dataHora(item.atendimento.assumidoEm))}`
      : 'Ainda não assumida por um administrador.';

    document.getElementById('opAdminModalTitle').textContent = `${item.alunoNome} • ${item.turma}`;
    document.getElementById('opAdminModalSubtitle').textContent = `Registrada por ${item.professorNome} em ${dataHora(item.createdAt)}`;
    document.getElementById('opAdminModalBody').innerHTML = `
      <div class="op-admin-detail-grid">
        <div class="op-admin-detail"><b>Categoria</b><span>${esc(categorias[item.categoria] || item.categoria)}</span></div>
        <div class="op-admin-detail"><b>Prioridade</b><span>${esc(prioridades[item.prioridade] || item.prioridade)}</span></div>
        <div class="op-admin-detail"><b>Situação</b><span>${esc(situacoes[item.status] || item.status)}</span></div>
        <div class="op-admin-detail"><b>Professor</b><span>${esc(item.professorNome)}</span></div>
        <div class="op-admin-detail"><b>Componente</b><span>${esc(item.componenteCurricular || 'Não informado')}</span></div>
        <div class="op-admin-detail"><b>Origem</b><span>${item.origemRegistro === 'voz' ? 'Voz' : item.origemRegistro === 'misto' ? 'Voz e digitação' : 'Digitação'}</span></div>
      </div>
      <div class="op-admin-report">${esc(item.texto)}</div>
      <div class="op-admin-attendance">Responsável pelo acompanhamento: ${ownerText}</div>
      ${item.resolucao?.nota ? `<div class="op-admin-attendance"><strong>Retorno registrado:</strong> ${esc(item.resolucao.nota)}</div>` : ''}
      <div class="op-admin-actions">
        <button class="op-admin-btn primary" type="button" id="opAdminFicha">Abrir ficha do aluno</button>
        ${semResponsavel && !concluida ? '<button class="op-admin-btn success" type="button" id="opAdminAssumir">Assumir atendimento</button>' : ''}
        ${souResponsavel && !concluida ? '<button class="op-admin-btn warn" type="button" id="opAdminLiberar">Liberar atendimento</button>' : ''}
      </div>
      <div class="op-admin-form">
        <div class="op-admin-field"><label for="opAdminStatus">Situação</label><select id="opAdminStatus" ${bloqueadoPorOutro ? 'disabled' : ''}>
          ${['lida','em_atendimento','resolvida','arquivada'].map((s) => `<option value="${s}" ${item.status === s ? 'selected' : ''}>${esc(situacoes[s])}</option>`).join('')}
        </select></div>
        <div class="op-admin-field"><label for="opAdminNota">Encaminhamento/retorno</label><textarea id="opAdminNota" ${bloqueadoPorOutro ? 'disabled' : ''} maxlength="1500" placeholder="Registre a providência adotada ou o retorno ao professor.">${esc(item.resolucao?.nota || '')}</textarea></div>
        <button class="op-admin-btn success" type="button" id="opAdminSalvarStatus" ${bloqueadoPorOutro ? 'disabled' : ''}>Salvar</button>
      </div>
      <div class="op-admin-danger-zone">
        <strong>Correção de registro indevido</strong>
        <p>Use somente para teste ou lançamento feito por engano. Esta ação remove o registro da ficha do aluno e do histórico do professor.</p>
        <button class="op-admin-btn danger" type="button" id="opAdminExcluirPermanente">Excluir permanentemente</button>
      </div>
      <div class="op-admin-feedback" id="opAdminFeedback" role="status">${bloqueadoPorOutro ? 'Somente o responsável atual pode alterar este acompanhamento.' : ''}</div>`;

    document.getElementById('opAdminFicha').onclick = () => {
      location.href = `/ficha-aluno.html?id=${encodeURIComponent(idValor(item.aluno))}`;
    };
    const assumir = document.getElementById('opAdminAssumir');
    if (assumir) assumir.onclick = () => acaoAdmin('assumir');
    const liberar = document.getElementById('opAdminLiberar');
    if (liberar) liberar.onclick = () => acaoAdmin('liberar');
    document.getElementById('opAdminSalvarStatus').onclick = salvarStatus;
    document.getElementById('opAdminExcluirPermanente').onclick = excluirPermanentemente;
  }

  function solicitarDadosExclusao(escopo) {
    const motivo = window.prompt(`Informe o motivo da exclusão permanente ${escopo}:`, 'Registro de teste');
    if (motivo === null) return null;
    if (String(motivo).trim().length < 5) {
      window.alert('Informe um motivo com pelo menos 5 caracteres.');
      return null;
    }

    const confirmacao = window.prompt('Esta ação não pode ser desfeita. Digite EXCLUIR para confirmar:');
    if (confirmacao === null) return null;
    if (String(confirmacao).trim().toUpperCase() !== 'EXCLUIR') {
      window.alert('Confirmação inválida. Nada foi excluído.');
      return null;
    }

    return { motivo: String(motivo).trim(), confirmacao: 'EXCLUIR' };
  }

  async function excluirPermanentemente() {
    if (!estado.atual) return;
    const dados = solicitarDadosExclusao('desta observação');
    if (!dados) return;

    modalFeedback('Excluindo permanentemente...');
    try {
      const payload = await api(`/api/observacoes-professores/admin/${encodeURIComponent(estado.atual._id)}/permanente`, {
        method: 'DELETE', body: JSON.stringify(dados)
      });
      fecharModal();
      await carregarFeed();
      window.alert(payload.mensagem || 'Observação excluída permanentemente.');
    } catch (error) {
      modalFeedback(error.message, 'error');
    }
  }

  async function excluirLotePermanentemente(loteId) {
    const dados = solicitarDadosExclusao('deste lote');
    if (!dados) return;

    modalFeedback('Excluindo o lote permanentemente...');
    try {
      const payload = await api(`/api/observacoes-professores/admin/lote/${encodeURIComponent(loteId)}/permanente`, {
        method: 'DELETE', body: JSON.stringify(dados)
      });
      fecharModal();
      await carregarFeed();
      window.alert(payload.mensagem || 'Lote excluído permanentemente.');
    } catch (error) {
      modalFeedback(error.message, 'error');
    }
  }

  async function abrir(id) {
    try {
      const payload = await api(`/api/observacoes-professores/admin/${encodeURIComponent(id)}`);
      renderModal(payload.observacao);
      document.getElementById('opAdminBackdrop').hidden = false;
      document.body.style.overflow = 'hidden';
      history.replaceState(null, '', location.pathname + location.search.replace(/([?&])observacaoProfessor=[^&]*&?/, '$1').replace(/[?&]$/, '') + location.hash);
      await carregarFeed();
    } catch (error) {
      window.alert(error.message);
    }
  }

  function fecharModal() {
    const backdrop = document.getElementById('opAdminBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    estado.atual = null;
  }

  async function acaoAdmin(acao) {
    if (!estado.atual) return;
    modalFeedback('Salvando...');
    try {
      const payload = await api(`/api/observacoes-professores/admin/${encodeURIComponent(estado.atual._id)}/${acao}`, { method:'PATCH', body:'{}' });
      renderModal(payload.observacao);
      modalFeedback(payload.mensagem || 'Atualizado.', 'success');
      await carregarFeed();
    } catch (error) { modalFeedback(error.message, 'error'); }
  }

  async function salvarStatus() {
    if (!estado.atual) return;
    const botao = document.getElementById('opAdminSalvarStatus');
    const status = document.getElementById('opAdminStatus').value;
    const nota = document.getElementById('opAdminNota').value.trim();
    if (status === 'resolvida' && nota.length < 3) {
      modalFeedback('Para resolver, informe brevemente a providência adotada.', 'error'); return;
    }
    botao.disabled = true; modalFeedback('Salvando...');
    try {
      const payload = await api(`/api/observacoes-professores/admin/${encodeURIComponent(estado.atual._id)}/status`, {
        method:'PATCH', body:JSON.stringify({status, nota})
      });
      renderModal(payload.observacao);
      modalFeedback(payload.mensagem || 'Situação atualizada.', 'success');
      await carregarFeed();
      if (['resolvida','arquivada'].includes(status)) setTimeout(fecharModal, 650);
    } catch (error) { modalFeedback(error.message, 'error'); }
    finally { if (document.getElementById('opAdminSalvarStatus')) document.getElementById('opAdminSalvarStatus').disabled = false; }
  }

  async function iniciar() {
    try {
      const usuario = await api('/api/usuario-logado');
      if (!['admin','master','superadmin'].includes(String(usuario.tipo || '').toLowerCase())) return;
      estado.usuario = usuario;
      garantirEstrutura();
      obterAudioElement()?.load();
      await carregarFeed();
      const abrirId = new URLSearchParams(location.search).get('observacaoProfessor');
      if (abrirId) abrir(abrirId);
      estado.timer = setInterval(() => { carregarFeed(); }, INTERVALO_ATUALIZACAO_MS);
      document.addEventListener('visibilitychange', () => {
        carregarFeed();
        if (!document.hidden) desbloquearAudio(true);
      });
      window.addEventListener('beforeunload', () => {
        if (estado.timer) clearInterval(estado.timer);
        document.title = estado.tituloOriginal;
      });
    } catch (_error) { /* Sem sessão administrativa: não exibe o quadro. */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  else iniciar();
})();
