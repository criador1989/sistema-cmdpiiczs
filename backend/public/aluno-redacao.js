(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    temaStatus: $('temaStatus'),
    temaTitulo: $('temaTitulo'),
    temaProposta: $('temaProposta'),
    motivadores: $('motivadores'),
    tempoSugerido: $('tempoSugerido'),
    minPalavras: $('minPalavras'),
    maxPalavras: $('maxPalavras'),
    rascunhoStatus: $('rascunhoStatus'),
    badgeTimer: $('badgeTimer'),
    badgePalavras: $('badgePalavras'),
    redacaoTexto: $('redacaoTexto'),
    btnTimer: $('btnTimer'),
    btnSalvarLocal: $('btnSalvarLocal'),
    btnLimpar: $('btnLimpar'),
    btnEnviar: $('btnEnviar'),
    statusMensagem: $('statusMensagem'),
    historicoLista: $('historicoLista'),
    resultadoBox: $('resultadoBox'),
    notaTotal: $('notaTotal'),
    c1: $('c1'),
    c2: $('c2'),
    c3: $('c3'),
    c4: $('c4'),
    c5: $('c5'),
    resumoAvaliacao: $('resumoAvaliacao'),
    pontosFortes: $('pontosFortes'),
    pontosMelhorar: $('pontosMelhorar'),
    recomendacoes: $('recomendacoes'),
    propostaIntervencao: $('propostaIntervencao'),
    observacoesTecnicas: $('observacoesTecnicas')
  };

  const state = {
    tema: null,
    timerAtivo: false,
    segundos: 0,
    intervalId: null
  };

  function getTenant() {
    return (
      new URLSearchParams(window.location.search).get('t') ||
      localStorage.getItem('axoriin_tenant') ||
      localStorage.getItem('smartclass_tenant') ||
      'cmdpii'
    );
  }

  function getDraftKey() {
    return `axoriin_redacao_rascunho_${getTenant()}`;
  }

  function formatarTempo(segundos) {
    const h = String(Math.floor(segundos / 3600)).padStart(2, '0');
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function contarPalavras(texto) {
    const t = String(texto || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function setStatus(msg, tipo = 'info') {
    els.statusMensagem.textContent = msg;
    if (tipo === 'erro') els.statusMensagem.style.color = '#ffb7b7';
    else if (tipo === 'sucesso') els.statusMensagem.style.color = '#9ef1c7';
    else els.statusMensagem.style.color = '';
  }

  function atualizarContadores() {
    const palavras = contarPalavras(els.redacaoTexto.value);
    els.badgePalavras.textContent = `Palavras: ${palavras}`;
    els.badgeTimer.textContent = `Tempo: ${formatarTempo(state.segundos)}`;
  }

  function salvarRascunhoLocal() {
    const payload = {
      texto: els.redacaoTexto.value,
      segundos: state.segundos,
      salvoEm: new Date().toISOString(),
      temaId: state.tema?._id || null
    };
    localStorage.setItem(getDraftKey(), JSON.stringify(payload));
    els.rascunhoStatus.textContent = 'Salvo';
    setStatus('Rascunho salvo localmente.', 'sucesso');
  }

  function carregarRascunhoLocal() {
    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) {
        els.rascunhoStatus.textContent = 'Vazio';
        return;
      }

      const draft = JSON.parse(raw);
      els.redacaoTexto.value = draft.texto || '';
      state.segundos = Number(draft.segundos) || 0;
      els.rascunhoStatus.textContent = 'Carregado';
      atualizarContadores();
      setStatus('Rascunho local carregado.', 'sucesso');
    } catch (e) {
      console.error('Erro ao carregar rascunho local:', e);
      els.rascunhoStatus.textContent = 'Erro';
    }
  }

  function limparRascunhoLocal() {
    localStorage.removeItem(getDraftKey());
    els.rascunhoStatus.textContent = 'Vazio';
  }

  function toggleTimer() {
    if (state.timerAtivo) {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.timerAtivo = false;
      els.btnTimer.textContent = 'Iniciar cronômetro';
      setStatus('Cronômetro pausado.');
      return;
    }

    state.timerAtivo = true;
    els.btnTimer.textContent = 'Pausar cronômetro';
    setStatus('Cronômetro iniciado.');
    state.intervalId = setInterval(() => {
      state.segundos += 1;
      atualizarContadores();
    }, 1000);
  }

  async function api(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(getTenant())}`, {
      credentials: 'include',
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.erro || 'Erro na requisição.');
    }

    return data;
  }

  function renderTema(tema) {
    state.tema = tema;

    if (!tema) {
      els.temaStatus.textContent = 'Sem tema ativo';
      els.temaTitulo.textContent = 'Tema indisponível';
      els.temaProposta.textContent = 'Nenhum tema ativo foi encontrado no momento.';
      els.tempoSugerido.textContent = '--';
      els.minPalavras.textContent = '--';
      els.maxPalavras.textContent = '--';
      els.motivadores.innerHTML = '';
      els.btnEnviar.disabled = true;
      return;
    }

    els.temaStatus.textContent = 'Tema ativo';
    els.temaTitulo.textContent = tema.titulo || 'Tema sem título';
    els.temaProposta.textContent = tema.proposta || '';
    els.tempoSugerido.textContent = `${tema.tempoSugeridoMinutos || 60} min`;
    els.minPalavras.textContent = tema.minimoPalavras || 7;
    els.maxPalavras.textContent = tema.maximoPalavras || 30;
    els.btnEnviar.disabled = false;

    const motivadores = Array.isArray(tema.textosMotivadores) ? tema.textosMotivadores : [];
    if (!motivadores.length) {
      els.motivadores.innerHTML = '';
      return;
    }

    els.motivadores.innerHTML = motivadores.map(item => `
      <div class="motivador">
        <h4>${escapeHtml(item.titulo || 'Texto motivador')}</h4>
        <p>${escapeHtml(item.conteudo || '').replace(/\n/g, '<br>')}</p>
        ${item.fonte ? `<small>Fonte: ${escapeHtml(item.fonte)}</small>` : ''}
      </div>
    `).join('');
  }

  function renderLista(listaEl, itens) {
    if (!Array.isArray(itens) || !itens.length) {
      listaEl.innerHTML = '<li>Nenhum item informado.</li>';
      return;
    }

    listaEl.innerHTML = itens.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function renderResultado(redacao) {
    const correcao = redacao?.correcaoIA;
    if (!correcao) {
      els.resultadoBox.classList.remove('visible');
      return;
    }

    els.notaTotal.textContent = `Nota: ${correcao.notaTotal || 0}`;
    els.c1.textContent = correcao.competencias?.c1 ?? 0;
    els.c2.textContent = correcao.competencias?.c2 ?? 0;
    els.c3.textContent = correcao.competencias?.c3 ?? 0;
    els.c4.textContent = correcao.competencias?.c4 ?? 0;
    els.c5.textContent = correcao.competencias?.c5 ?? 0;
    els.resumoAvaliacao.textContent = correcao.resumoAvaliacao || '-';
    els.propostaIntervencao.textContent = correcao.propostaIntervencao || '-';
    els.observacoesTecnicas.textContent = correcao.observacoesTecnicas || '-';

    renderLista(els.pontosFortes, correcao.pontosFortes);
    renderLista(els.pontosMelhorar, correcao.pontosMelhorar);
    renderLista(els.recomendacoes, correcao.recomendacoes);

    els.resultadoBox.classList.add('visible');
  }

  function formatarData(valor) {
    if (!valor) return '-';
    const d = new Date(valor);
    return d.toLocaleString('pt-BR');
  }

  function renderHistorico(historico) {
    if (!Array.isArray(historico) || !historico.length) {
      els.historicoLista.innerHTML = '<div class="empty">Nenhuma redação enviada ainda.</div>';
      return;
    }

    els.historicoLista.innerHTML = historico.map(item => {
      const nota = item?.correcaoIA?.notaTotal ?? '-';
      const tempo = formatarTempo(Number(item.tempoGastoSegundos) || 0);

      return `
        <div class="hist-item" data-id="${item._id}">
          <div class="hist-top">
            <strong>${escapeHtml(item.temaTituloSnapshot || 'Redação')}</strong>
            <span class="tag">Nota: ${nota}</span>
          </div>
          <div class="muted">${formatarData(item.createdAt)}</div>
          <div class="hist-tags">
            <span class="tag">Palavras: ${item.quantidadePalavras || 0}</span>
            <span class="tag">Tempo: ${tempo}</span>
            <span class="tag">Tentativa: ${item.tentativa || 1}</span>
            <span class="tag">Status: ${escapeHtml(item.status || '-')}</span>
          </div>
        </div>
      `;
    }).join('');

    els.historicoLista.querySelectorAll('.hist-item').forEach(card => {
      card.addEventListener('click', async () => {
        try {
          setStatus('Carregando redação selecionada...');
          const { redacao } = await api(`/api/redacao/${card.dataset.id}`);
          renderResultado(redacao);
          setStatus('Resultado carregado.', 'sucesso');
        } catch (error) {
          setStatus(error.message, 'erro');
        }
      });
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function carregarTema() {
    try {
      const { tema } = await api('/api/redacao/tema/ativo');
      renderTema(tema);
    } catch (error) {
      setStatus(error.message, 'erro');
    }
  }

  async function carregarHistorico() {
    try {
      const { historico } = await api('/api/redacao/historico');
      renderHistorico(historico);
    } catch (error) {
      els.historicoLista.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function enviarRedacao() {
    try {
      if (!state.tema?._id) {
        setStatus('Nenhum tema ativo disponível.', 'erro');
        return;
      }

      const texto = els.redacaoTexto.value.trim();
      if (!texto) {
        setStatus('Digite sua redação antes de enviar.', 'erro');
        return;
      }

      els.btnEnviar.disabled = true;
      setStatus('Enviando redação e solicitando correção...');

      const payload = {
        temaId: state.tema._id,
        texto,
        tempoGastoSegundos: state.segundos,
        cronometroUtilizado: state.segundos > 0
      };

      const { redacao } = await api('/api/redacao/enviar', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      renderResultado(redacao);
      await carregarHistorico();

      limparRascunhoLocal();
      els.redacaoTexto.value = '';
      state.segundos = 0;
      atualizarContadores();

      if (state.timerAtivo) {
        toggleTimer();
      }

      setStatus('Redação enviada com sucesso.', 'sucesso');
    } catch (error) {
      setStatus(error.message, 'erro');
    } finally {
      els.btnEnviar.disabled = false;
    }
  }

  function bind() {
    els.redacaoTexto.addEventListener('input', () => {
      atualizarContadores();
      clearTimeout(window.__redacaoAutoSaveTimer);
      window.__redacaoAutoSaveTimer = setTimeout(() => {
        salvarRascunhoLocal();
      }, 1200);
    });

    els.btnTimer.addEventListener('click', toggleTimer);
    els.btnSalvarLocal.addEventListener('click', salvarRascunhoLocal);

    els.btnLimpar.addEventListener('click', () => {
      if (!confirm('Deseja realmente limpar o texto atual?')) return;
      els.redacaoTexto.value = '';
      atualizarContadores();
      setStatus('Texto limpo.');
    });

    els.btnEnviar.addEventListener('click', enviarRedacao);

    window.addEventListener('beforeunload', () => {
      salvarRascunhoLocal();
    });
  }

  async function init() {
    bind();
    atualizarContadores();
    carregarRascunhoLocal();
    await carregarTema();
    await carregarHistorico();
  }

  init();
})();