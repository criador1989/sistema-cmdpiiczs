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
    planoEstudoSugerido: $('planoEstudoSugerido'),
    pontosFortes: $('pontosFortes'),
    pontosMelhorar: $('pontosMelhorar'),
    recomendacoes: $('recomendacoes'),
    propostaIntervencao: $('propostaIntervencao'),
    observacoesTecnicas: $('observacoesTecnicas'),

    apoioBox: $('apoioBox'),
    apoioFocoTema: $('apoioFocoTema'),
    btnSolicitarApoio: $('btnSolicitarApoio'),
    apoioStatusMensagem: $('apoioStatusMensagem'),
    respostaProfessorBlock: $('respostaProfessorBlock'),
    respostaProfessorTexto: $('respostaProfessorTexto'),

    apoioEscritaContent: $('apoioEscritaContent'),
    apoioTabs: document.querySelectorAll('[data-apoio-tab]'),

    estruturaSteps: document.querySelectorAll('[data-estrutura-step]'),
    estruturaDica: $('estruturaDica'),
    competenciasLive: document.querySelectorAll('.competencia-live'),
    alertasRedacao: $('alertasRedacao')
  };

  const state = {
    tema: null,
    redacaoAtualId: null,
    timerAtivo: false,
    segundos: 0,
    intervalId: null,
    colagens: 0,
    colagemGrande: false,
    fotoSelecionada: null,
    apoioRedacao: null,
    apoioTabAtual: 'estrutura',
    motivadoresAutomaticos: []
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
    return `axoriin_redacao_rascunho_${getTenant()}`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
              ? `<span class="tag">Fonte: ${escapeHtml(item.fonte)}</span>`
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

  els.temaStatus.textContent = 'Tema ativo';
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

  async function carregarTema() {
    try {
      const { tema, limiteMensal } = await api('/api/redacao/tema/ativo');

      renderTema(tema);

      if (limiteMensal) {
        const usadas = Number(limiteMensal.usadas || 0);
        const limite = Number(limiteMensal.limite || 2);
        const restantes = Math.max(limite - usadas, 0);

        if (els.badgeLimiteMensal) els.badgeLimiteMensal.textContent = `Redações no mês: ${usadas}/${limite}`;
        if (els.restantesMes) els.restantesMes.textContent = restantes;
      }
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
formData.append('texto', texto);
formData.append('tempoGastoSegundos', String(state.segundos));
formData.append('cronometroUtilizado', String(state.segundos > 0));
formData.append('colagensDetectadas', String(state.colagens));
formData.append('colagemGrandeDetectada', String(state.colagemGrande));

if (state.fotoSelecionada) {
  formData.append('fotoManuscrita', state.fotoSelecionada);
}

const { redacao } = await api('/api/redacao/enviar', {
  method: 'POST',
  body: formData
});

      renderResultado(redacao);
      await carregarHistorico();

      limparRascunhoLocal();
      els.redacaoTexto.value = '';
      state.segundos = 0;
      state.colagens = 0;
      state.colagemGrande = false;

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
        body: JSON.stringify({ foco })
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
  if (!els.redacaoTexto || !els.estruturaSteps?.length) return;

  const texto = els.redacaoTexto.value.trim();

  const paragrafos = texto
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 20);

  const total = paragrafos.length;

  const intro = paragrafos[0] || '';
  const d1 = paragrafos[1] || '';
  const d2 = paragrafos[2] || '';
  const conc = paragrafos[3] || '';

  const status = {
    intro: total >= 1,
    d1: total >= 2,
    d2: total >= 3,
    conc: total >= 4
  };

  els.estruturaSteps.forEach((step) => {
    const key = step.dataset.estruturaStep;
    const small = step.querySelector('small');

    step.classList.remove('done', 'warn', 'bad');

    if (!status[key]) {
      if (total > 0) {
        step.classList.add('warn');

        if (small) {
          small.textContent = 'Faltando';
        }
      } else {
        if (small) {
          small.textContent = 'Aguardando';
        }
      }

      return;
    }

    const textoParte =
      key === 'intro' ? intro :
      key === 'd1' ? d1 :
      key === 'd2' ? d2 :
      conc;

    if (textoParte.length < 80) {
      step.classList.add('warn');

      if (small) {
        small.textContent = 'Muito curto';
      }

      return;
    }

    if (textoParte.length < 40) {
      step.classList.add('bad');

      if (small) {
        small.textContent = 'Insuficiente';
      }

      return;
    }

    step.classList.add('done');

    if (small) {
      small.textContent = 'Adequado';
    }
  });

  analisarCompetencias(texto, paragrafos);
  gerarAlertas(texto, paragrafos);
}
function analisarCompetencias(texto, paragrafos) {
  if (!els.competenciasLive?.length) return;

  const textoLower = texto.toLowerCase();

  const conectivos = [
    'portanto',
    'além disso',
    'todavia',
    'contudo',
    'entretanto',
    'desse modo',
    'assim',
    'logo'
  ];

  const repertorios = [
    'constituição',
    'sociedade',
    'filósofo',
    'história',
    'dados',
    'pesquisa',
    'ibge',
    'onu'
  ];

  const intervencao = [
    'governo',
    'estado',
    'ministério',
    'campanhas',
    'escolas'
  ];

  const temConectivo = conectivos.some(c => textoLower.includes(c));
  const temRepertorio = repertorios.some(c => textoLower.includes(c));
  const temIntervencao = intervencao.some(c => textoLower.includes(c));

  els.competenciasLive.forEach((card) => {
    card.classList.remove('active', 'warn');

    const comp = card.dataset.comp;

    if (comp === 'c2') {
      card.classList.add(temRepertorio ? 'active' : 'warn');
    }

    if (comp === 'c3') {
      card.classList.add(paragrafos.length >= 3 ? 'active' : 'warn');
    }

    if (comp === 'c4') {
      card.classList.add(temConectivo ? 'active' : 'warn');
    }

    if (comp === 'c5') {
      card.classList.add(temIntervencao ? 'active' : 'warn');
    }
  });
}
function gerarAlertas(texto, paragrafos) {
  if (!els.alertasRedacao) return;

  const alertas = [];

  if (paragrafos.length < 4) {
    alertas.push({
      tipo: 'warn',
      texto: 'Sua redação ainda parece incompleta.'
    });
  }

  if (texto.length < 900) {
    alertas.push({
      tipo: 'warn',
      texto: 'Seu texto ainda parece curto para o padrão ENEM.'
    });
  }

  if (!texto.includes('.')) {
    alertas.push({
      tipo: 'bad',
      texto: 'Pouca pontuação detectada no texto.'
    });
  }

  if (!/portanto|assim|logo|desse modo/i.test(texto)) {
    alertas.push({
      tipo: 'warn',
      texto: 'Poucos conectivos argumentativos detectados.'
    });
  }

  if (!/governo|estado|ministério|sociedade/i.test(texto)) {
    alertas.push({
      tipo: 'warn',
      texto: 'Sua proposta de intervenção parece incompleta.'
    });
  }

  els.alertasRedacao.innerHTML = alertas.map(alerta => `
    <div class="alerta-redacao ${alerta.tipo === 'bad' ? 'bad' : ''}">
      ${alerta.texto}
    </div>
  `).join('');
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
    await carregarTema();
    await carregarHistorico();
  }

  init();
})();