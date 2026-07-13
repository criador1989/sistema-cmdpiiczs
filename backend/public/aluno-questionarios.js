(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    tokenAluno: 'axoriin_aluno_token',
    tokenPadrao: 'token',
    tenant: 'axoriin_tenant'
  };

  const els = {
    focusText: $('focusText'),
    focusPill: $('focusPill'),

    tipo: $('tipo'),
    area: $('area'),
    dificuldade: $('dificuldade'),
    quantidade: $('quantidade'),

    statTotal: $('statTotal'),
    statMedia: $('statMedia'),
    statUltimo: $('statUltimo'),
    statAreaFraca: $('statAreaFraca'),

    btnIniciar: $('btnIniciar'),
    btnHistorico: $('btnHistorico'),
    btnVoltarPainel: $('btnVoltarPainel'),

    statusMensagem: $('statusMensagem'),

    quizPanel: $('quizPanel'),
    quizTitulo: $('quizTitulo'),
    quizSubtitulo: $('quizSubtitulo'),
    timerQuiz: $('timerQuiz'),
    progressText: $('progressText'),
    progressPercent: $('progressPercent'),
    progressFill: $('progressFill'),
    questoesContainer: $('questoesContainer'),
    btnCancelar: $('btnCancelar'),
    btnFinalizar: $('btnFinalizar'),

    resultadoPanel: $('resultadoPanel'),
    resultadoTitulo: $('resultadoTitulo'),
    resultadoMensagem: $('resultadoMensagem'),
    resultadoNota: $('resultadoNota'),
    resultadoAcertos: $('resultadoAcertos'),
    resultadoPercentual: $('resultadoPercentual'),
    resultadoFoco: $('resultadoFoco'),
    explicacoesLista: $('explicacoesLista'),
    btnNovoTreino: $('btnNovoTreino'),
    btnRevisaoFoco: $('btnRevisaoFoco'),

    historicoLista: $('historicoLista')
  };

  const state = {
    tentativa: null,
    questoes: [],
    respostas: new Map(),
    inicio: null,
    segundos: 0,
    timerId: null,
    resumo: null,
    historico: []
  };

  function getTenant() {
    return (
      new URLSearchParams(window.location.search).get('t') ||
      localStorage.getItem(STORAGE.tenant) ||
      localStorage.getItem('smartclass_tenant') ||
      'cmdpii'
    );
  }

  function getToken() {
    return (
      localStorage.getItem(STORAGE.tokenAluno) ||
      localStorage.getItem(STORAGE.tokenPadrao) ||
      ''
    );
  }

  function buildUrl(path) {
    const tenant = getTenant();
    const join = path.includes('?') ? '&' : '?';
    return `${path}${join}t=${encodeURIComponent(tenant)}`;
  }

  function setStatus(msg, tipo = 'info') {
    els.statusMensagem.textContent = msg || '';
    els.statusMensagem.className = 'status';
    if (tipo === 'sucesso') els.statusMensagem.classList.add('good');
    if (tipo === 'erro') els.statusMensagem.classList.add('bad');
    if (tipo === 'alerta') els.statusMensagem.classList.add('warn');
  }

  function formatarTempo(segundos) {
    const m = String(Math.floor(segundos / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(buildUrl(path), {
      credentials: 'include',
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.erro || data.message || data.mensagem || 'Erro na requisição.');
    }

    return data;
  }

  function iniciarTimer() {
    pararTimer();
    state.inicio = Date.now();
    state.segundos = 0;
    els.timerQuiz.textContent = '00:00';

    state.timerId = setInterval(() => {
      state.segundos = Math.floor((Date.now() - state.inicio) / 1000);
      els.timerQuiz.textContent = formatarTempo(state.segundos);
    }, 1000);
  }

  function pararTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function atualizarProgresso() {
    const total = state.questoes.length;
    const respondidas = state.respostas.size;
    const pct = total ? Math.round((respondidas / total) * 100) : 0;

    els.progressText.textContent = `${respondidas} de ${total} respondidas`;
    els.progressPercent.textContent = `${pct}%`;
    els.progressFill.style.width = `${pct}%`;
  }

  function renderResumo(resumo) {
    state.resumo = resumo || null;

    els.statTotal.textContent = resumo?.totalQuestionarios ?? '0';
    els.statMedia.textContent = resumo?.mediaGeral != null ? `${resumo.mediaGeral}%` : '--';
    els.statUltimo.textContent = resumo?.ultimoDesempenho != null ? `${resumo.ultimoDesempenho}%` : '--';
    els.statAreaFraca.textContent = resumo?.areaMaisFraca || '--';

    const foco = resumo?.focoRecomendado || resumo?.areaMaisFraca || '';
    if (foco) {
      els.focusText.textContent = foco;
      els.focusPill.textContent = 'Foco personalizado';
    } else {
      els.focusText.textContent = 'Comece com um diagnóstico ou treino rápido. Depois, o Axoriin indica seu próximo foco.';
      els.focusPill.textContent = 'Comece agora';
    }
  }

  function renderHistorico(historico) {
    state.historico = Array.isArray(historico) ? historico : [];

    if (!state.historico.length) {
      els.historicoLista.innerHTML = `
        <div class="empty">
          Nenhum questionário finalizado ainda. Comece com um treino rápido ou diagnóstico.
        </div>
      `;
      return;
    }

    els.historicoLista.innerHTML = state.historico.map(item => `
      <div class="history-item" data-id="${escapeHtml(item._id)}">
        <strong>${escapeHtml(item.titulo || 'Questionário')}</strong>
        <p>${new Date(item.createdAt).toLocaleString('pt-BR')}</p>
        <div class="history-tags">
          <span class="tag">Nota: ${Number(item.nota || 0)}%</span>
          <span class="tag">Acertos: ${Number(item.acertos || 0)}/${Number(item.totalQuestoes || 0)}</span>
          <span class="tag">${escapeHtml(item.tipo || 'treino')}</span>
          ${item.area ? `<span class="tag">${escapeHtml(item.area)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function carregarResumo() {
    try {
      const { resumo } = await api('/api/questionarios/resumo');
      renderResumo(resumo);
    } catch (error) {
      console.warn('Resumo indisponível:', error.message);
      renderResumo(null);
    }
  }

  async function carregarHistorico() {
    try {
      const { historico } = await api('/api/questionarios/historico');
      renderHistorico(historico);
    } catch (error) {
      els.historicoLista.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderQuestoes() {
    els.questoesContainer.innerHTML = state.questoes.map((q, index) => {
      const apoio = q.apoioTexto ? `<div class="support-text">${escapeHtml(q.apoioTexto)}</div>` : '';

      const alternativas = (q.alternativas || []).map(a => `
        <div class="alternative" data-q="${index}" data-letra="${escapeHtml(a.letra)}">
          <div class="letter">${escapeHtml(a.letra)}</div>
          <div>${escapeHtml(a.texto)}</div>
        </div>
      `).join('');

      return `
        <article class="question-card" id="q-${index}">
          <div class="question-meta">
            <span class="tag">Questão ${index + 1}</span>
            ${q.area ? `<span class="tag">${escapeHtml(q.area)}</span>` : ''}
            ${q.disciplina ? `<span class="tag">${escapeHtml(q.disciplina)}</span>` : ''}
            ${q.habilidade ? `<span class="tag">${escapeHtml(q.habilidade)}</span>` : ''}
            ${q.dificuldade ? `<span class="tag">${escapeHtml(q.dificuldade)}</span>` : ''}
          </div>

          <div class="question-text">${escapeHtml(q.enunciado)}</div>
          ${apoio}

          <div class="alternatives">
            ${alternativas}
          </div>

          <div class="feedback-box" id="feedback-${index}"></div>
        </article>
      `;
    }).join('');

    els.questoesContainer.querySelectorAll('.alternative').forEach((alt) => {
      alt.addEventListener('click', () => {
        const index = Number(alt.dataset.q);
        const letra = alt.dataset.letra;
        const questao = state.questoes[index];

        state.respostas.set(String(questao._id), {
          questaoId: questao._id,
          respostaAluno: letra,
          tempoRespostaSegundos: state.segundos
        });

        alt.closest('.question-card')
          .querySelectorAll('.alternative')
          .forEach(a => a.classList.remove('selected'));

        alt.classList.add('selected');
        atualizarProgresso();
      });
    });

    atualizarProgresso();
  }

  async function iniciarQuestionario() {
    try {
      setStatus('Montando seu questionário inteligente...', 'alerta');
      els.btnIniciar.disabled = true;
      els.resultadoPanel.classList.add('hidden');

      const params = new URLSearchParams({
        tipo: els.tipo.value || 'treino',
        quantidade: els.quantidade.value || '5'
      });

      if (els.area.value) params.set('area', els.area.value);
      if (els.dificuldade.value) params.set('dificuldade', els.dificuldade.value);

      const { tentativa } = await api(`/api/questionarios/gerar?${params.toString()}`);

      state.tentativa = tentativa;
      state.questoes = Array.isArray(tentativa.questoes) ? tentativa.questoes : [];
      state.respostas = new Map();

      els.quizTitulo.textContent = tentativa.titulo || 'Questionário';
      els.quizSubtitulo.textContent = `${tentativa.totalQuestoes || state.questoes.length} questões selecionadas para seu estudo.`;
      els.quizPanel.classList.remove('hidden');

      renderQuestoes();
      iniciarTimer();

      setStatus('Questionário iniciado. Responda com atenção e revise o feedback ao final.', 'sucesso');
      els.quizPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setStatus(error.message, 'erro');
    } finally {
      els.btnIniciar.disabled = false;
    }
  }

  function marcarCorrecoes(tentativa) {
    const questoesFinalizadas = tentativa.questoes || [];

    questoesFinalizadas.forEach((q, index) => {
      const card = document.getElementById(`q-${index}`);
      if (!card) return;

      card.querySelectorAll('.alternative').forEach((alt) => {
        const letra = alt.dataset.letra;
        alt.classList.remove('correct', 'wrong');

        if (letra === q.gabarito) alt.classList.add('correct');
        if (letra === q.respostaAluno && !q.correta) alt.classList.add('wrong');
      });

      const box = document.getElementById(`feedback-${index}`);
      if (box) {
        box.className = `feedback-box visible ${q.correta ? 'good' : 'bad'}`;
        box.innerHTML = `
          <strong>${q.correta ? 'Você acertou.' : 'Você errou, mas isso é parte do aprendizado.'}</strong>
          <p>
            Sua resposta: <b>${escapeHtml(q.respostaAluno || 'não respondida')}</b>.
            Gabarito: <b>${escapeHtml(q.gabarito || '-')}</b>.
          </p>
          <p>${escapeHtml(q.explicacaoSnapshot || 'Revise o conteúdo relacionado a esta questão e tente novamente em outro treino.')}</p>
        `;
      }
    });
  }

  function renderResultado(tentativa) {
    const resumo = tentativa.resumoDesempenho || {};
    const percentual = resumo.percentualAcerto ?? tentativa.nota ?? 0;

    els.resultadoTitulo.textContent = percentual >= 80
      ? 'Excelente evolução'
      : percentual >= 60
        ? 'Bom caminho'
        : 'Ponto de partida identificado';

    els.resultadoMensagem.textContent = percentual >= 80
      ? 'Você demonstrou domínio forte. Continue treinando para manter consistência.'
      : percentual >= 60
        ? 'Você está avançando. Revise os erros para transformar acertos em domínio.'
        : 'Esse resultado mostra onde começar. Foque no ponto recomendado e refaça treinos curtos.';

    els.resultadoNota.textContent = `${tentativa.nota || 0}%`;
    els.resultadoAcertos.textContent = `${tentativa.acertos || 0}/${tentativa.totalQuestoes || 0}`;
    els.resultadoPercentual.textContent = `${percentual}%`;
    els.resultadoFoco.textContent = resumo.focoRecomendado || '--';

    const itens = (tentativa.questoes || []).map((q, index) => `
      <div class="explain-item">
        <strong>${index + 1}. ${q.correta ? 'Acerto' : 'Erro'} • ${escapeHtml(q.area || 'Geral')}</strong>
        <p>
          Resposta: <b>${escapeHtml(q.respostaAluno || 'não respondida')}</b> |
          Gabarito: <b>${escapeHtml(q.gabarito || '-')}</b>
        </p>
        <p>${escapeHtml(q.explicacaoSnapshot || 'Sem explicação cadastrada para esta questão.')}</p>
      </div>
    `).join('');

    els.explicacoesLista.innerHTML = itens || '<div class="empty">Nenhuma explicação disponível.</div>';
    els.resultadoPanel.classList.remove('hidden');
    els.resultadoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function finalizarQuestionario() {
    try {
      if (!state.tentativa?._id) {
        setStatus('Nenhum questionário em andamento.', 'erro');
        return;
      }

      if (state.respostas.size < state.questoes.length) {
        const continuar = confirm('Você ainda não respondeu todas as questões. Deseja finalizar mesmo assim?');
        if (!continuar) return;
      }

      pararTimer();
      els.btnFinalizar.disabled = true;
      setStatus('Corrigindo e montando sua análise...', 'alerta');

      const respostas = state.questoes.map(q => {
        const resposta = state.respostas.get(String(q._id));
        return {
          questaoId: q._id,
          respostaAluno: resposta?.respostaAluno || '',
          tempoRespostaSegundos: resposta?.tempoRespostaSegundos || 0
        };
      });

      const { tentativa } = await api(`/api/questionarios/${state.tentativa._id}/finalizar`, {
        method: 'POST',
        body: JSON.stringify({
          respostas,
          tempoTotalSegundos: state.segundos
        })
      });

      marcarCorrecoes(tentativa);
      renderResultado(tentativa);
      await carregarResumo();
      await carregarHistorico();

      setStatus('Análise concluída. Revise as explicações antes de iniciar outro treino.', 'sucesso');
    } catch (error) {
      setStatus(error.message, 'erro');
    } finally {
      els.btnFinalizar.disabled = false;
    }
  }

  function cancelarQuestionario() {
    const ok = confirm('Deseja cancelar este treino? Suas respostas não serão enviadas.');
    if (!ok) return;

    pararTimer();
    state.tentativa = null;
    state.questoes = [];
    state.respostas = new Map();

    els.quizPanel.classList.add('hidden');
    setStatus('Treino cancelado.', 'alerta');
  }

  function aplicarRevisaoFoco() {
    const foco = state.resumo?.areaMaisFraca || '';
    if (foco) {
      els.area.value = foco;
    }

    els.tipo.value = 'revisao';
    els.quantidade.value = '5';
    iniciarQuestionario();
  }

  function bind() {
    els.btnIniciar.addEventListener('click', iniciarQuestionario);
    els.btnHistorico.addEventListener('click', async () => {
      setStatus('Atualizando histórico...', 'alerta');
      await carregarResumo();
      await carregarHistorico();
      setStatus('Histórico atualizado.', 'sucesso');
    });

    els.btnFinalizar.addEventListener('click', finalizarQuestionario);
    els.btnCancelar.addEventListener('click', cancelarQuestionario);
    els.btnNovoTreino.addEventListener('click', iniciarQuestionario);
    els.btnRevisaoFoco.addEventListener('click', aplicarRevisaoFoco);

    els.btnVoltarPainel.href = buildUrl('painel-aluno.html');
  }

  async function init() {
    bind();

    if (!getToken()) {
      setStatus('Sessão não encontrada. Faça login novamente.', 'erro');
      return;
    }

    await carregarResumo();
    await carregarHistorico();
  }

  init();
})();