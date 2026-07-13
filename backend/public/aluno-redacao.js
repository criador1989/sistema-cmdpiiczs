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
    restantesMes: $('restantesMes'),

    badgeTimer: $('badgeTimer'),
    badgePalavras: $('badgePalavras'),
    badgeLimiteMensal: $('badgeLimiteMensal'),

    fotoRedacaoInput: $('fotoRedacaoInput'),
    previewFotoRedacao: $('previewFotoRedacao'),
    uploadPlaceholder: $('uploadPlaceholder'),
    btnTrocarFoto: $('btnTrocarFoto'),
    btnRemoverFoto: $('btnRemoverFoto'),

    redacaoTexto: $('redacaoTexto'),
    textoAutoriaStatus: $('textoAutoriaStatus'),

    btnTimer: $('btnTimer'),
    btnSalvarLocal: $('btnSalvarLocal'),
    btnLimpar: $('btnLimpar'),
    btnEnviar: $('btnEnviar'),
    btnModoFoco: $('btnModoFoco'),

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
    focoPrincipal: $('focoPrincipal'),
    focoPrincipalTitulo: $('focoPrincipalTitulo'),
    planoEstudoSugerido: $('planoEstudoSugerido'),
    pontosFortes: $('pontosFortes'),
    pontosMelhorar: $('pontosMelhorar'),
    pontosMelhorarTitulo: $('pontosMelhorarTitulo'),
    recomendacoes: $('recomendacoes'),
    propostaIntervencao: $('propostaIntervencao'),
    sugestaoAprimoramentoIntervencao: $('sugestaoAprimoramentoIntervencao'),
    sugestaoIntervencaoBlock: $('sugestaoIntervencaoBlock'),
    observacoesTecnicas: $('observacoesTecnicas'),

    apoioBox: $('apoioBox'),
    apoioFocoTema: $('apoioFocoTema'),
    btnSolicitarApoio: $('btnSolicitarApoio'),
    apoioStatusMensagem: $('apoioStatusMensagem'),
    respostaProfessorBlock: $('respostaProfessorBlock'),
    respostaProfessorTexto: $('respostaProfessorTexto'),
    respostaProfessorMeta: $('respostaProfessorMeta'),
    respostaProfessorBadge: $('respostaProfessorBadge'),

    apoioEscritaContent: $('apoioEscritaContent'),
    apoioTabs: document.querySelectorAll('[data-apoio-tab]'),

    estruturaSteps: document.querySelectorAll('[data-estrutura-step]'),
    estruturaDica: $('estruturaDica'),
    competenciasLive: document.querySelectorAll('.competencia-live'),
    alertasRedacao: $('alertasRedacao'),
    modalidadeResumo: $('modalidadeResumo'),
    temasLivresBox: $('temasLivresBox'),
    temasLivresLista: $('temasLivresLista'),
    modalidadeTabs: document.querySelectorAll('[data-modalidade]'),
    apoioEscritaCard: $('apoioEscritaCard'),
    evolucaoBox: $('evolucaoBox'),
    evolucaoResumo: $('evolucaoResumo'),
    evolucaoGrid: $('evolucaoGrid')
  };

  const state = {
    tema: null,
    contexto: null,
    modalidade: null,
    ciclo: null,
    etapaCiclo: null,
    redacaoAtualId: null,
    timerAtivo: false,
    segundos: 0,
    intervalId: null,
    colagens: 0,
    colagemGrande: false,
    fotoSelecionada: null,
    apoioRedacao: null,
    apoioTabAtual: 'estrutura',
    motivadoresAutomaticos: [],
    caracteresColados: 0,
    maiorColagem: 0,
    eventosDigitacao: 0,
    revisoesEstimadas: 0,
    ultimoTamanhoTexto: 0,
    inicioEdicaoEm: Date.now(),
    ultimaAnalise: null
  };

  function getTenant() {
    return (
      new URLSearchParams(window.location.search).get('t') ||
      localStorage.getItem('axoriin_tenant') ||
      localStorage.getItem('smartclass_tenant') ||
      'cmdpii'
    );
  }

  function getToken() {
    return (
      localStorage.getItem('axoriin_aluno_token') ||
      localStorage.getItem('token') ||
      ''
    );
  }

  function getDraftKey() {
    const tema = state.tema?._id || 'sem-tema';
    const modalidade = state.modalidade || 'legado';
    return `axoriin_redacao_rascunho_${getTenant()}_${modalidade}_${tema}`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeUrl(url) {
    try {
      const u = new URL(String(url || ''), window.location.origin);
      return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
    } catch { return ''; }
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
    if (!els.statusMensagem) return;

    els.statusMensagem.textContent = msg || '';
    els.statusMensagem.className = 'status';

    if (tipo === 'erro') els.statusMensagem.classList.add('bad');
    if (tipo === 'sucesso') els.statusMensagem.classList.add('good');
    if (tipo === 'alerta') els.statusMensagem.classList.add('warn');
  }

  function setApoioStatus(msg, tipo = 'info') {
    if (!els.apoioStatusMensagem) return;

    els.apoioStatusMensagem.textContent = msg || '';
    els.apoioStatusMensagem.className = 'status';

    if (tipo === 'erro') els.apoioStatusMensagem.classList.add('bad');
    if (tipo === 'sucesso') els.apoioStatusMensagem.classList.add('good');
    if (tipo === 'alerta') els.apoioStatusMensagem.classList.add('warn');
  }

  async function api(url, options = {}) {
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(getTenant())}`, {
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

  function atualizarContadores() {
    const palavras = contarPalavras(els.redacaoTexto?.value || '');

    if (els.badgePalavras) els.badgePalavras.textContent = `Palavras: ${palavras}`;
    if (els.badgeTimer) els.badgeTimer.textContent = `Tempo: ${formatarTempo(state.segundos)}`;
  }

  function atualizarAutoriaStatus(texto = '') {
    if (!els.textoAutoriaStatus) return;

    const palavras = contarPalavras(texto);

    if (!texto.trim()) {
      els.textoAutoriaStatus.textContent = 'Aguardando escrita do aluno';
      els.textoAutoriaStatus.style.color = '';
      return;
    }

    if (state.ciclo?.cronometroObrigatorio && state.segundos <= 0) {
      setStatus('Esta avaliação exige que o cronômetro seja iniciado.', 'erro');
      return false;
    }

    if (state.colagemGrande) {
      els.textoAutoriaStatus.textContent = 'Atenção: colagem grande detectada';
      els.textoAutoriaStatus.style.color = '#ef4444';
      return;
    }

    if (state.colagens > 0) {
      els.textoAutoriaStatus.textContent = `Texto em produção • ${state.colagens} colagem(ns) detectada(s)`;
      els.textoAutoriaStatus.style.color = '#946200';
      return;
    }

    if (palavras < 80) {
      els.textoAutoriaStatus.textContent = 'Texto em desenvolvimento';
      els.textoAutoriaStatus.style.color = '';
      return;
    }

    els.textoAutoriaStatus.textContent = 'Texto digitado registrado';
    els.textoAutoriaStatus.style.color = '#16a34a';
  }

  function salvarRascunhoLocal() {
    if (!els.redacaoTexto) return;

    const payload = {
      texto: els.redacaoTexto.value,
      segundos: state.segundos,
      salvoEm: new Date().toISOString(),
      temaId: state.tema?._id || null,
      colagens: state.colagens,
      colagemGrande: state.colagemGrande
    };

    localStorage.setItem(getDraftKey(), JSON.stringify(payload));

    if (els.rascunhoStatus) els.rascunhoStatus.textContent = 'Salvo';
    setStatus('Rascunho salvo localmente.', 'sucesso');
  }

  function carregarRascunhoLocal() {
    try {
      const raw = localStorage.getItem(getDraftKey());

      if (!raw) {
        if (els.rascunhoStatus) els.rascunhoStatus.textContent = 'Vazio';
        return;
      }

      const draft = JSON.parse(raw);

      if (els.redacaoTexto) els.redacaoTexto.value = draft.texto || '';

      state.segundos = Number(draft.segundos) || 0;
      state.colagens = Number(draft.colagens) || 0;
      state.colagemGrande = !!draft.colagemGrande;

      if (els.rascunhoStatus) els.rascunhoStatus.textContent = 'Carregado';

      atualizarContadores();
      atualizarAutoriaStatus(els.redacaoTexto?.value || '');
      setStatus('Rascunho local carregado.', 'sucesso');
    } catch (e) {
      console.error('Erro ao carregar rascunho local:', e);
      if (els.rascunhoStatus) els.rascunhoStatus.textContent = 'Erro';
    }
  }

  function limparRascunhoLocal() {
    localStorage.removeItem(getDraftKey());
    if (els.rascunhoStatus) els.rascunhoStatus.textContent = 'Vazio';
  }

  function toggleTimer() {
    if (state.timerAtivo) {
      clearInterval(state.intervalId);
      state.intervalId = null;
      state.timerAtivo = false;
      if (els.btnTimer) els.btnTimer.textContent = 'Iniciar cronômetro';
      setStatus('Cronômetro pausado.');
      return;
    }

    state.timerAtivo = true;
    if (els.btnTimer) els.btnTimer.textContent = 'Pausar cronômetro';
    setStatus('Cronômetro iniciado.');

    state.intervalId = setInterval(() => {
      state.segundos += 1;
      atualizarContadores();
    }, 1000);
  }

function slugEixoTematico(eixo = '') {
  const normalizado = String(eixo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const mapa = {
    'educacao': 'educacao',
    'tecnologia': 'tecnologia',
    'saude': 'saude',
    'direitos humanos': 'direitos_humanos',
    'sociedade': 'sociedade',
    'meio ambiente': 'meio_ambiente',
    'politica': 'politica',
    'cultura': 'cultura',
    'comunicacao': 'tecnologia',
    'infraestrutura': 'sociedade',
    'inclusao social': 'direitos_humanos',
    'cidadania': 'sociedade',
    'economia': 'sociedade',
    'ciencia': 'tecnologia',
    'seguranca publica': 'sociedade',
    'esporte': 'saude'
  };

  return mapa[normalizado] || 'sociedade';
}

function iconeMotivador(tipo = '') {
  const t = String(tipo || '').toLowerCase();

  if (t.includes('estatistica')) return '📊';
  if (t.includes('citacao')) return '💬';
  if (t.includes('legislacao')) return '⚖️';
  if (t.includes('reportagem')) return '📰';

  return '📄';
}

function embaralhar(lista = []) {
  return [...lista].sort(() => Math.random() - 0.5);
}

async function carregarMotivadoresPorEixo(eixoTematico) {
  const slug = slugEixoTematico(eixoTematico);

  try {
    const response = await fetch(`/data/textos_motivadores/${slug}.json`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Motivadores não encontrados para o eixo ${eixoTematico}.`);
    }

    const motivadores = await response.json();

    if (!Array.isArray(motivadores)) {
      throw new Error('Arquivo de motivadores inválido.');
    }

    state.motivadoresAutomaticos = embaralhar(motivadores).slice(0, 4);
    renderMotivadoresAutomaticos(state.motivadoresAutomaticos);
  } catch (error) {
    console.warn('[REDAÇÃO][MOTIVADORES]', error.message);
    state.motivadoresAutomaticos = [];
    renderMotivadoresAutomaticos([]);
  }
}

function renderMotivadoresAutomaticos(motivadores = []) {
  if (!els.motivadores) return;

  if (!Array.isArray(motivadores) || !motivadores.length) {
    els.motivadores.innerHTML = `
      <div class="motivador motivador-empty">
        <h4>Textos motivadores</h4>
        <p>Nenhum texto motivador automático foi encontrado para este eixo temático.</p>
      </div>
    `;
    return;
  }

  els.motivadores.innerHTML = motivadores.map((item, index) => `
    <article class="motivador motivador-premium">
      <button
        class="motivador-toggle ${index === 0 ? 'active' : ''}"
        type="button"
        data-motivador-toggle
      >
        <div class="motivador-top">
          <div class="motivador-icon">
            ${iconeMotivador(item.tipo)}
          </div>

          <div class="motivador-heading">
            <span class="motivador-label">
              Texto motivador ${index + 1}
            </span>

            <h4>${escapeHtml(item.titulo || 'Texto motivador')}</h4>
          </div>
        </div>

        <div class="motivador-arrow">
          ▾
        </div>
      </button>

      <div class="motivador-body ${index === 0 ? 'open' : ''}">
        <p>${escapeHtml(item.conteudo || '')}</p>

        <div class="motivador-footer">
          <span class="tag">${escapeHtml(item.tipo || 'apoio')}</span>

          ${
            item.fonte
              ? (safeUrl(item.fonteUrl)
                  ? `<a class="tag" href="${escapeHtml(safeUrl(item.fonteUrl))}" target="_blank" rel="noopener noreferrer">Fonte: ${escapeHtml(item.fonte)}</a>`
                  : `<span class="tag">Fonte: ${escapeHtml(item.fonte)}</span>`)
              : ''
          }
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-motivador-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const body = btn.nextElementSibling;

      btn.classList.toggle('active');
      body.classList.toggle('open');
    });
  });
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

  const nomesModalidade = {
    trilha_orientada: 'Trilha orientada da escola',
    pratica_livre: 'Prática livre',
    avaliacao_institucional: 'Avaliação institucional'
  };

  els.temaStatus.textContent =
    nomesModalidade[state.modalidade] || 'Tema ativo';
  els.temaTitulo.textContent = tema.titulo || 'Tema sem título';
  els.temaProposta.textContent = tema.proposta || '';
  els.tempoSugerido.textContent = `${tema.tempoSugeridoMinutos || 60} min`;
  els.minPalavras.textContent = tema.minimoPalavras || 120;
  els.maxPalavras.textContent = tema.maximoPalavras || 400;
  els.btnEnviar.disabled = false;

  const motivadoresDoTema = Array.isArray(tema.textosMotivadores)
    ? tema.textosMotivadores
    : [];

  if (motivadoresDoTema.length) {
    renderMotivadoresAutomaticos(motivadoresDoTema);
  } else {
    carregarMotivadoresPorEixo(tema.eixoTematico || '');
  }
}

  function formatarEtapa(etapa) {
    const mapa = {
      producao_inicial: 'Produção inicial',
      reescrita: 'Reescrita orientada',
      pratica: 'Treino livre',
      avaliacao: 'Avaliação'
    };

    return mapa[etapa] || '';
  }

  function resumoModalidade(bloco, titulo, descricao) {
    if (!els.modalidadeResumo) return;

    if (!bloco) {
      els.modalidadeResumo.innerHTML =
        `<strong>${escapeHtml(titulo)}</strong>` +
        `<p>${escapeHtml(descricao)}</p>`;
      return;
    }

    const uso = bloco.uso || {};
    const ciclo = bloco.ciclo || {};

    els.modalidadeResumo.innerHTML =
      `<strong>${escapeHtml(ciclo.nome || titulo)}</strong>` +
      `<p>${escapeHtml(descricao)}</p>` +
      `<div class="modalidade-progresso">` +
      `<span>${Number(uso.usadas || 0)}/${Number(uso.limite || 0)} entrega(s)</span>` +
      `${uso.etapaSeguinte ? `<span>${escapeHtml(formatarEtapa(uso.etapaSeguinte))}</span>` : '<span>Concluído</span>'}` +
      `</div>`;
  }

  function atualizarLimiteVisual(uso = {}) {
    const usadas = Number(uso.usadas || 0);
    const limite = Number(uso.limite || 0);
    const restantes = Math.max(0, Number(uso.restantes ?? limite - usadas));

    if (els.badgeLimiteMensal) {
      els.badgeLimiteMensal.textContent =
        limite > 0
          ? `Entregas: ${usadas}/${limite}`
          : 'Entregas indisponíveis';
    }

    if (els.restantesMes) {
      els.restantesMes.textContent = restantes;
    }

    if (els.btnEnviar) {
      els.btnEnviar.disabled = Boolean(uso.atingiuLimite) || !state.tema?._id;
    }
  }

  function aplicarModoInterface() {
    const avaliacao =
      state.modalidade === 'avaliacao_institucional' &&
      state.ciclo?.assistenteDuranteEscrita === false;

    document.body.classList.toggle('redacao-avaliacao', avaliacao);

    if (state.ciclo?.cronometroObrigatorio && !state.timerAtivo) {
      setStatus(
        'Esta avaliação exige o uso do cronômetro antes do envio.',
        'alerta'
      );
    }
  }

  function selecionarTemaLivre(temaId) {
    const temas = state.contexto?.praticaLivre?.temas || [];
    const tema = temas.find((item) => String(item._id) === String(temaId));

    if (!tema) return;

    state.modalidade = 'pratica_livre';
    state.ciclo = null;
    state.etapaCiclo = 'pratica';

    renderTema(tema);
    atualizarLimiteVisual(state.contexto.praticaLivre.uso || {});
    resumoModalidade(
      {
        ciclo: { nome: 'Prática livre' },
        uso: state.contexto.praticaLivre.uso || {}
      },
      'Prática livre',
      'Escolha um tema do banco e treine no seu ritmo.'
    );

    document.querySelectorAll('.tema-livre-card').forEach((card) => {
      card.classList.toggle(
        'active',
        String(card.dataset.temaId) === String(temaId)
      );
    });

    aplicarModoInterface();
    analisarEstruturaTexto();
  }

  function renderTemasLivres() {
    if (!els.temasLivresLista || !els.temasLivresBox) return;

    const temas = state.contexto?.praticaLivre?.temas || [];

    els.temasLivresBox.style.display =
      state.modalidade === 'pratica_livre' ? 'block' : 'none';

    if (!temas.length) {
      els.temasLivresLista.innerHTML =
        '<div class="temas-livres-vazio">Nenhum tema foi liberado para prática livre.</div>';
      return;
    }

    els.temasLivresLista.innerHTML = temas
      .map(
        (tema) =>
          `<button class="tema-livre-card" type="button" data-tema-id="${escapeHtml(tema._id)}">` +
          `<strong>${escapeHtml(tema.titulo)}</strong>` +
          `<span>${escapeHtml(tema.eixoTematico || 'Redação ENEM')}</span>` +
          `</button>`
      )
      .join('');

    els.temasLivresLista
      .querySelectorAll('[data-tema-id]')
      .forEach((card) => {
        card.addEventListener('click', () => {
          selecionarTemaLivre(card.dataset.temaId);
        });
      });
  }

  function selecionarModalidade(modalidade) {
    const contexto = state.contexto || {};

    if (modalidade === 'trilha_orientada') {
      const bloco = contexto.trilhaOrientada;

      if (!bloco) return;

      state.modalidade = modalidade;
      state.ciclo = bloco.ciclo;
      state.etapaCiclo = bloco.uso?.etapaSeguinte;
      renderTema(bloco.tema);
      atualizarLimiteVisual(bloco.uso || {});
      resumoModalidade(
        bloco,
        'Trilha da escola',
        bloco.uso?.etapaSeguinte === 'reescrita'
          ? 'Use a devolutiva da primeira versão para produzir sua reescrita.'
          : 'Tema comum definido pela escola para produção inicial e reescrita.'
      );
    }

    if (modalidade === 'avaliacao_institucional') {
      const bloco = contexto.avaliacaoInstitucional;

      if (!bloco) return;

      state.modalidade = modalidade;
      state.ciclo = bloco.ciclo;
      state.etapaCiclo = 'avaliacao';
      renderTema(bloco.tema);
      atualizarLimiteVisual(bloco.uso || {});
      resumoModalidade(
        bloco,
        'Avaliação institucional',
        'Produção avaliativa com regras definidas pela escola.'
      );
    }

    if (modalidade === 'pratica_livre') {
      const bloco = contexto.praticaLivre || {};

      state.modalidade = modalidade;
      state.ciclo = null;
      state.etapaCiclo = 'pratica';

      const primeiroTema =
        bloco.temas?.find(
          (item) => String(item._id) === String(state.tema?._id)
        ) || bloco.temas?.[0];

      if (primeiroTema) {
        renderTema(primeiroTema);
      } else {
        renderTema(null);
      }

      atualizarLimiteVisual(bloco.uso || {});
      resumoModalidade(
        {
          ciclo: { nome: 'Prática livre' },
          uso: bloco.uso || {}
        },
        'Prática livre',
        'Escolha um tema do banco e treine no seu ritmo.'
      );
    }

    els.modalidadeTabs?.forEach((btn) => {
      btn.classList.toggle(
        'active',
        btn.dataset.modalidade === state.modalidade
      );
    });

    renderTemasLivres();
    aplicarModoInterface();
    analisarEstruturaTexto();
  }

  function renderModalidades() {
    const contexto = state.contexto || {};

    els.modalidadeTabs?.forEach((btn) => {
      const modalidade = btn.dataset.modalidade;

      const disponivel =
        modalidade === 'trilha_orientada'
          ? Boolean(contexto.trilhaOrientada)
          : modalidade === 'avaliacao_institucional'
            ? Boolean(contexto.avaliacaoInstitucional)
            : Boolean(contexto.praticaLivre?.temas?.length);

      btn.disabled = !disponivel;
      btn.addEventListener('click', () => selecionarModalidade(modalidade));
    });

    selecionarModalidade(contexto.modalidadePadrao);
  }

  async function carregarContexto() {
    try {
      state.contexto = await api('/api/redacao/contexto');
      renderModalidades();

      if (!state.contexto.modalidadePadrao) {
        renderTema(null);
      }
    } catch (error) {
      setStatus(error.message, 'erro');
      renderTema(null);
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

  function preencherLista(el, itens = []) {
    if (!el) return;
    const lista = Array.isArray(itens) ? itens.filter(Boolean) : [];
    el.innerHTML = lista.length ? lista.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Sem observações adicionais.</li>';
  }

  function renderFeedbackCompetencias(correcao = {}) {
    let box = document.getElementById('feedbackCompetenciasDetalhado');
    if (!box && els.resultadoBox) {
      box = document.createElement('div');
      box.id = 'feedbackCompetenciasDetalhado';
      box.className = 'block feedback-competencias';
      const obs = document.getElementById('observacoesTecnicas')?.closest('.block');
      (obs || els.resultadoBox).insertAdjacentElement('afterend', box);
    }
    if (!box) return;
    const fb = correcao.feedbackCompetencias || {};
    const notas = correcao.competencias || {};
    box.innerHTML = `<h4>Análise por competência</h4>${['c1','c2','c3','c4','c5'].map(k => {
      const f = fb[k] || {};
      return `<details><summary><b>${k.toUpperCase()} — ${Number(notas[k]||0)} pontos</b> <span>${escapeHtml(f.nivel||'')}</span></summary><p>${escapeHtml(f.diagnostico||'Análise não disponível.')}</p><strong>Evidências</strong><ul>${(f.evidencias||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><strong>Como melhorar</strong><ul>${(f.comoMelhorar||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></details>`;
    }).join('')}`;
  }

  function formatarDataProfessor(valor) {
    if (!valor) return '';

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) return '';

    return data.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }

  function chaveLeituraProfessor(redacao, apoio) {
    const identificador =
      apoio?.respondidoEm ||
      apoio?.observacaoProfessor ||
      'sem-data';

    return (
      `axoriin_redacao_orientacao_lida_` +
      `${redacao?._id || 'sem-redacao'}_` +
      `${encodeURIComponent(String(identificador))}`
    );
  }

  function renderOrientacaoProfessor(redacao) {
    if (!els.respostaProfessorBlock) return;

    const apoio = redacao?.apoioProfessor || {};
    const resposta = String(
      apoio.observacaoProfessor || ''
    ).trim();

    if (!resposta) {
      els.respostaProfessorBlock.style.display = 'none';
      els.respostaProfessorBlock.open = false;
      return;
    }

    const professor =
      String(apoio.professorNome || '').trim() ||
      'Professor';

    const data = formatarDataProfessor(
      apoio.respondidoEm
    );

    const chave = chaveLeituraProfessor(
      redacao,
      apoio
    );

    const jaLida =
      localStorage.getItem(chave) === '1';

    els.respostaProfessorBlock.style.display = 'block';
    els.respostaProfessorTexto.textContent = resposta;

    if (els.respostaProfessorMeta) {
      els.respostaProfessorMeta.textContent =
        data
          ? `${professor} • ${data}`
          : professor;
    }

    if (els.respostaProfessorBadge) {
      els.respostaProfessorBadge.textContent =
        jaLida ? 'Orientação recebida' : 'Nova orientação';

      els.respostaProfessorBadge.classList.toggle(
        'lida',
        jaLida
      );
    }

    // A orientação nova abre uma única vez.
    els.respostaProfessorBlock.open = !jaLida;

    els.respostaProfessorBlock.ontoggle = () => {
      if (!els.respostaProfessorBlock.open) return;

      localStorage.setItem(chave, '1');

      if (els.respostaProfessorBadge) {
        els.respostaProfessorBadge.textContent =
          'Orientação recebida';

        els.respostaProfessorBadge.classList.add(
          'lida'
        );
      }
    };
  }

  function renderResultado(redacao) {
    if (!redacao || !els.resultadoBox) return;
    state.redacaoAtualId = redacao._id || null;
    const c = redacao.correcaoIA || {};
    const comps = c.competencias || {};
    els.resultadoBox.classList.add('visible');

    if (els.evolucaoBox && redacao.evolucao) {
      const ev = redacao.evolucao;
      const dif = Number(ev.diferencaTotal || 0);
      els.evolucaoBox.classList.add('visible');

      if (els.evolucaoResumo) {
        els.evolucaoResumo.innerHTML =
          `Nota anterior: <strong>${Number(ev.notaAnterior || 0)}</strong> • ` +
          `Nota atual: <strong>${Number(ev.notaAtual || 0)}</strong> • ` +
          `<strong class="${dif >= 0 ? 'evolucao-positivo' : 'evolucao-negativo'}">` +
          `${dif >= 0 ? '+' : ''}${dif} pontos</strong>`;
      }

      if (els.evolucaoGrid) {
        els.evolucaoGrid.innerHTML = ['c1','c2','c3','c4','c5']
          .map((k) => {
            const valor = Number(ev.competencias?.[k] || 0);
            return `<div class="evolucao-item"><strong>${k.toUpperCase()}</strong>` +
              `<span class="${valor >= 0 ? 'evolucao-positivo' : 'evolucao-negativo'}">` +
              `${valor >= 0 ? '+' : ''}${valor}</span></div>`;
          })
          .join('');
      }
    } else if (els.evolucaoBox) {
      els.evolucaoBox.classList.remove('visible');
    }
    els.notaTotal.textContent = redacao.status === 'erro_correcao' ? 'Correção pendente' : `Nota estimada: ${Number(c.notaTotal || 0)}`;
    ['c1','c2','c3','c4','c5'].forEach(k => { if (els[k]) els[k].textContent = Number(comps[k] || 0); });
    els.resumoAvaliacao.textContent = c.resumoAvaliacao || redacao.erroCorrecao || 'A correção ainda não foi concluída.';
    const notaTotal = Number(c.notaTotal || 0);
    const desempenhoExcelente = notaTotal >= 920;

    if (els.focoPrincipalTitulo) {
      els.focoPrincipalTitulo.textContent = desempenhoExcelente
        ? 'Próximo desafio de aprimoramento'
        : 'Foco principal de melhoria';
    }

    if (els.pontosMelhorarTitulo) {
      els.pontosMelhorarTitulo.textContent = desempenhoExcelente
        ? 'Próximos desafios de excelência'
        : 'Pontos a melhorar';
    }

    els.focoPrincipal.textContent = c.focoPrincipal || redacao.focoPrincipal || '-';
    preencherLista(els.planoEstudoSugerido, c.planoEstudoSugerido || redacao.planoEstudoSugerido);
    preencherLista(els.pontosFortes, c.pontosFortes);
    preencherLista(els.pontosMelhorar, c.pontosMelhorar);
    preencherLista(els.recomendacoes, c.recomendacoes);

    const intervencaoIdentificada =
      c.propostaIntervencaoIdentificada ||
      c.propostaIntervencao ||
      '-';

    const sugestaoIntervencao =
      c.sugestaoAprimoramentoIntervencao ||
      '';

    els.propostaIntervencao.textContent = intervencaoIdentificada;

    if (els.sugestaoAprimoramentoIntervencao) {
      els.sugestaoAprimoramentoIntervencao.textContent =
        sugestaoIntervencao || '-';
    }

    if (els.sugestaoIntervencaoBlock) {
      els.sugestaoIntervencaoBlock.style.display =
        sugestaoIntervencao ? 'block' : 'none';
    }
    els.observacoesTecnicas.textContent = `${c.observacoesTecnicas || '-'}${c.disclaimer ? ` ${c.disclaimer}` : ''}`;
    renderFeedbackCompetencias(c);
    if (els.apoioBox) els.apoioBox.classList.toggle('visible', redacao.status !== 'erro_correcao');
    renderOrientacaoProfessor(redacao);
    els.resultadoBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderHistorico(historico = []) {
    if (!els.historicoLista) return;
    if (!Array.isArray(historico) || !historico.length) {
      els.historicoLista.innerHTML = '<div class="empty">Nenhuma redação enviada ainda.</div>';
      return;
    }
    els.historicoLista.innerHTML = historico.map(item => {
      const nota = item.correcaoIA?.notaTotal;
      const data = item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '';
      const modalidade = {
        trilha_orientada: 'Trilha',
        pratica_livre: 'Prática livre',
        avaliacao_institucional: 'Avaliação'
      }[item.modalidade] || 'Redação';

      const temOrientacao = Boolean(
        item.apoioProfessor?.observacaoProfessor
      );

      return `<article class="hist-item ${temOrientacao ? 'tem-orientacao' : ''}" data-redacao-id="${escapeHtml(item._id)}"><div class="hist-top"><strong>${escapeHtml(item.temaTituloSnapshot || 'Redação ENEM')}</strong><span>${nota != null ? `${nota} pts` : escapeHtml(item.status || '')}</span></div><div class="hist-tags"><span>${data}</span><span>${escapeHtml(modalidade)}</span><span>${Number(item.quantidadePalavras||0)} palavras</span><span>${escapeHtml(formatarEtapa(item.etapaCiclo) || `Tentativa ${Number(item.tentativa||1)}`)}</span>${temOrientacao ? '<span class="hist-feedback-tag">Professor respondeu</span>' : ''}</div></article>`;
    }).join('');
    els.historicoLista.querySelectorAll('[data-redacao-id]').forEach(card => card.addEventListener('click', async () => {
      try { const { redacao } = await api(`/api/redacao/${card.dataset.redacaoId}`); renderResultado(redacao); } catch (e) { setStatus(e.message, 'erro'); }
    }));
  }

  function validarEnvio(texto) {
    if (!state.tema?._id) {
      setStatus('Nenhum tema ativo disponível.', 'erro');
      return false;
    }

    if (!texto) {
      setStatus('Digite sua redação antes de enviar.', 'erro');
      return false;
    }

    const palavras = contarPalavras(texto);
    const minimo = Number(state.tema?.minimoPalavras || 120);

    if (palavras < minimo) {
      setStatus(`Sua redação possui ${palavras} palavras. O mínimo recomendado é ${minimo}.`, 'erro');
      return false;
    }

    if (!state.fotoSelecionada) {
      const ok = confirm(
        'Você ainda não anexou a foto da redação manuscrita.\n\n' +
        'Deseja enviar mesmo assim? O professor terá menos elementos para conferir a autoria.'
      );

      if (!ok) return false;
    }

    if (state.colagemGrande) {
      const ok = confirm(
        'Foi detectado um texto grande colado na redação.\n\n' +
        'Deseja continuar o envio mesmo assim? Essa informação poderá ser usada para conferência pedagógica.'
      );

      if (!ok) return false;
    }

    return true;
  }

  async function enviarRedacao() {
    try {
      const texto = els.redacaoTexto.value.trim();

      if (!validarEnvio(texto)) return;

      els.btnEnviar.disabled = true;
      setStatus('Enviando redação e solicitando correção...', 'alerta');

      const formData = new FormData();

formData.append('temaId', state.tema._id);
formData.append('modalidade', state.modalidade || 'legado');
if (state.ciclo?._id) formData.append('cicloId', state.ciclo._id);
if (state.etapaCiclo) formData.append('etapaCiclo', state.etapaCiclo);
formData.append('texto', texto);
formData.append('tempoGastoSegundos', String(state.segundos));
formData.append('cronometroUtilizado', String(state.segundos > 0));
formData.append('colagensDetectadas', String(state.colagens));
formData.append('colagemGrandeDetectada', String(state.colagemGrande));
formData.append('caracteresColados', String(state.caracteresColados));
formData.append('maiorColagem', String(state.maiorColagem));
formData.append('eventosDigitacao', String(state.eventosDigitacao));
formData.append('revisoesEstimadas', String(state.revisoesEstimadas));
formData.append('tempoEdicaoSegundos', String(Math.max(state.segundos, Math.floor((Date.now() - state.inicioEdicaoEm) / 1000))));

if (state.fotoSelecionada) {
  formData.append('fotoManuscrita', state.fotoSelecionada);
}

const { redacao, resumoUso } = await api('/api/redacao/enviar', {
  method: 'POST',
  body: formData
});

      renderResultado(redacao);
      await carregarHistorico();
      await carregarContexto();

      if (resumoUso) {
        atualizarLimiteVisual(resumoUso);
      }

      limparRascunhoLocal();
      els.redacaoTexto.value = '';
      state.segundos = 0;
      state.colagens = 0;
      state.colagemGrande = false;
      state.caracteresColados = 0; state.maiorColagem = 0; state.eventosDigitacao = 0; state.revisoesEstimadas = 0; state.ultimoTamanhoTexto = 0; state.inicioEdicaoEm = Date.now();

      atualizarContadores();
      atualizarAutoriaStatus('');

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

  function limparFoto() {
    state.fotoSelecionada = null;

    if (els.fotoRedacaoInput) els.fotoRedacaoInput.value = '';
    if (els.previewFotoRedacao) {
      els.previewFotoRedacao.removeAttribute('src');
      els.previewFotoRedacao.classList.remove('visible');
    }

    if (els.uploadPlaceholder) els.uploadPlaceholder.style.display = 'block';
  }

  function configurarFoto() {
    if (!els.fotoRedacaoInput || !els.previewFotoRedacao || !els.uploadPlaceholder) return;

    els.fotoRedacaoInput.addEventListener('change', () => {
      const file = els.fotoRedacaoInput.files && els.fotoRedacaoInput.files[0];

      if (!file) {
        limparFoto();
        return;
      }

      state.fotoSelecionada = file;

      const url = URL.createObjectURL(file);
      els.previewFotoRedacao.src = url;
      els.previewFotoRedacao.classList.add('visible');
      els.uploadPlaceholder.style.display = 'none';

      setStatus('Foto manuscrita anexada para conferência.', 'sucesso');
    });

    if (els.btnTrocarFoto) {
      els.btnTrocarFoto.addEventListener('click', () => els.fotoRedacaoInput.click());
    }

    if (els.btnRemoverFoto) {
      els.btnRemoverFoto.addEventListener('click', () => {
        limparFoto();
        setStatus('Foto removida.', 'alerta');
      });
    }
  }

  async function solicitarApoio() {
    try {
      if (!state.redacaoAtualId) {
        setApoioStatus('Abra uma redação corrigida antes de solicitar apoio.', 'erro');
        return;
      }

      const foco = els.apoioFocoTema?.value?.trim() || '';

      if (!foco) {
        setApoioStatus('Informe o ponto em que deseja apoio.', 'erro');
        return;
      }

      els.btnSolicitarApoio.disabled = true;
      setApoioStatus('Enviando solicitação...', 'alerta');

      await api(`/api/redacao/${state.redacaoAtualId}/solicitar-apoio`, {
        method: 'POST',
        body: JSON.stringify({ focoTema: foco })
      });

      setApoioStatus('Solicitação enviada ao professor.', 'sucesso');
      els.apoioFocoTema.value = '';
    } catch (error) {
      setApoioStatus(error.message, 'erro');
    } finally {
      els.btnSolicitarApoio.disabled = false;
    }
  }

  async function carregarApoioRedacao() {
  try {
    const response = await fetch('/data/apoio-redacao.json', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Não foi possível carregar o apoio à escrita.');
    }

    state.apoioRedacao = await response.json();
    renderApoioRedacao('estrutura');
  } catch (error) {
    if (els.apoioEscritaContent) {
      els.apoioEscritaContent.innerHTML = `
        <div class="empty">${escapeHtml(error.message)}</div>
      `;
    }
  }
}

function renderApoioRedacao(tab = 'estrutura') {
  if (!els.apoioEscritaContent || !state.apoioRedacao) return;

  state.apoioTabAtual = tab;

  els.apoioTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.apoioTab === tab);
  });

  if (tab === 'estrutura') {
    const itens = Array.isArray(state.apoioRedacao.estrutura)
      ? state.apoioRedacao.estrutura
      : [];

    els.apoioEscritaContent.innerHTML = itens.map((item) => `
      <div class="apoio-item">
        <strong>${escapeHtml(item.titulo)}</strong>
        <p>${escapeHtml(item.descricao)}</p>

        <ul>
          ${(item.modelo || []).map(ponto => `<li>${escapeHtml(ponto)}</li>`).join('')}
        </ul>

        ${item.alerta ? `<div class="apoio-alerta">${escapeHtml(item.alerta)}</div>` : ''}
      </div>
    `).join('') || '<div class="empty">Nenhuma estrutura cadastrada.</div>';

    return;
  }

  if (tab === 'conectivos') {
    const itens = Array.isArray(state.apoioRedacao.conectivos)
      ? state.apoioRedacao.conectivos
      : [];

    els.apoioEscritaContent.innerHTML = itens.map((grupo) => `
      <div class="apoio-item">
        <strong>${escapeHtml(grupo.uso)}</strong>

        <div class="conectivo-lista">
          ${(grupo.itens || []).map(item => `
            <span class="conectivo-chip">${escapeHtml(item)}</span>
          `).join('')}
        </div>
      </div>
    `).join('') || '<div class="empty">Nenhum conectivo cadastrado.</div>';

    return;
  }

  if (tab === 'intervencao') {
    const intervencao = state.apoioRedacao.intervencao || {};

    els.apoioEscritaContent.innerHTML = `
      <div class="apoio-item">
        <strong>${escapeHtml(intervencao.titulo || 'Intervenção')}</strong>

        <ul>
          ${(intervencao.itens || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>

        ${
          intervencao.exemploSeguro
            ? `<div class="apoio-alerta">${escapeHtml(intervencao.exemploSeguro)}</div>`
            : ''
        }
      </div>
    `;

    return;
  }

  if (tab === 'repertorios') {
    const grupos = Array.isArray(state.apoioRedacao.repertorios)
      ? state.apoioRedacao.repertorios
      : [];

    els.apoioEscritaContent.innerHTML = grupos.map((grupo) => `
      <div class="apoio-item">
        <strong>${escapeHtml(grupo.area)}</strong>

        <ul>
          ${(grupo.itens || []).map(item => `
            <li>
              <b>${escapeHtml(item.titulo)}:</b>
              ${escapeHtml(item.uso)}
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('') || '<div class="empty">Nenhum repertório cadastrado.</div>';

    return;
  }

  if (tab === 'checklist') {
    const itens = Array.isArray(state.apoioRedacao.checklistFinal)
      ? state.apoioRedacao.checklistFinal
      : [];

    els.apoioEscritaContent.innerHTML = `
      <div class="apoio-item">
        <strong>Antes de enviar, confira:</strong>

        <ul>
          ${itens.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `;

    return;
  }
}
function toggleModoFoco() {
  document.body.classList.toggle('modo-foco-ativo');

  const ativo = document.body.classList.contains('modo-foco-ativo');

  if (els.btnModoFoco) {
    els.btnModoFoco.textContent = ativo
      ? 'Sair do modo foco'
      : 'Entrar em modo foco';
  }

  localStorage.setItem('axoriin_redacao_modo_foco', ativo ? '1' : '0');
}

function analisarEstruturaTexto() {
  if (!els.redacaoTexto) return;
  const texto = els.redacaoTexto.value || '';
  if (
    window.AxoriinRedacaoAssistente &&
    !(
      state.modalidade === 'avaliacao_institucional' &&
      state.ciclo?.assistenteDuranteEscrita === false
    )
  ) {
    const proporcaoColada = texto.length ? Math.min(1, state.caracteresColados / texto.length) : 0;
    state.ultimaAnalise = window.AxoriinRedacaoAssistente.analisar(texto, state.tema, { proporcaoColada });
    window.AxoriinRedacaoAssistente.aplicar(state.ultimaAnalise);
  }
}
function configurarMapaEstrutural() {
  if (!els.estruturaSteps?.length || !els.estruturaDica) return;

  const dicas = {
    intro:
      'Introdução: apresente o tema e deixe clara sua tese.',

    d1:
      'Desenvolvimento 1: explique seu primeiro argumento com detalhes.',

    d2:
      'Desenvolvimento 2: aprofunde outro problema ou consequência.',

    conc:
      'Conclusão: apresente agente, ação, meio e finalidade.'
  };

  els.estruturaSteps.forEach((step) => {
    step.addEventListener('click', () => {
      const key = step.dataset.estruturaStep;

      els.estruturaDica.textContent =
        dicas[key] || 'Estrutura da redação.';
    });
  });
}

  function bind() {
    if (els.btnModoFoco) {
  els.btnModoFoco.addEventListener('click', toggleModoFoco);
}
    els.apoioTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    renderApoioRedacao(btn.dataset.apoioTab);
  });
});
    configurarFoto();

    els.redacaoTexto.addEventListener('paste', (event) => {
      const pasted = event.clipboardData?.getData('text') || '';

      if (pasted) {
        state.colagens += 1;
        state.caracteresColados += pasted.length;
        state.maiorColagem = Math.max(state.maiorColagem, pasted.length);
      }

      if (pasted.length > 600) {
        state.colagemGrande = true;
      }

      setTimeout(() => {
        atualizarAutoriaStatus(els.redacaoTexto.value);
        salvarRascunhoLocal();
      }, 60);
    });

    els.redacaoTexto.addEventListener('input', () => {
      const tamanhoAtual = els.redacaoTexto.value.length;
      state.eventosDigitacao += 1;
      if (tamanhoAtual < state.ultimoTamanhoTexto) state.revisoesEstimadas += 1;
      state.ultimoTamanhoTexto = tamanhoAtual;
      atualizarContadores();
      atualizarAutoriaStatus(els.redacaoTexto.value);
      analisarEstruturaTexto();

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
      state.colagens = 0;
      state.colagemGrande = false;

      atualizarContadores();
      atualizarAutoriaStatus('');
      setStatus('Texto limpo.');
    });

    els.btnEnviar.addEventListener('click', enviarRedacao);

    if (els.btnSolicitarApoio) {
      els.btnSolicitarApoio.addEventListener('click', solicitarApoio);
    }

    window.addEventListener('beforeunload', () => {
      salvarRascunhoLocal();
    });
  }

  async function init() {
    if (localStorage.getItem('axoriin_redacao_modo_foco') === '1') {
  document.body.classList.add('modo-foco-ativo');

  if (els.btnModoFoco) {
    els.btnModoFoco.textContent = 'Sair do modo foco';
  }
}
    bind();
    configurarMapaEstrutural();
    atualizarContadores();
    analisarEstruturaTexto();
    carregarRascunhoLocal();
    await carregarApoioRedacao();
    await carregarContexto();
    analisarEstruturaTexto();
    await carregarHistorico();
  }

  init();
})();