(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    perfilPainel: $('perfilPainel'),

    filtroTurma: $('filtroTurma'),
    filtroAluno: $('filtroAluno'),
    filtroCiclo: $('filtroCiclo'),
    filtroModalidade: $('filtroModalidade'),
    filtroStatus: $('filtroStatus'),
    btnBuscarRedacoes: $('btnBuscarRedacoes'),
    listaRedacoesProfessor: $('listaRedacoesProfessor'),
    detalheRedacaoProfessor: $('detalheRedacaoProfessor'),
    quantidadeLista: $('quantidadeLista'),
    metricaTotal: $('metricaTotal'),
    metricaCorrigidas: $('metricaCorrigidas'),
    metricaMedia: $('metricaMedia'),
    metricaApoios: $('metricaApoios'),

    formCiclo: $('formCiclo'),
    cicloNome: $('cicloNome'),
    cicloModalidade: $('cicloModalidade'),
    cicloTema: $('cicloTema'),
    cicloInicio: $('cicloInicio'),
    cicloFim: $('cicloFim'),
    cicloMaxEnvios: $('cicloMaxEnvios'),
    cicloTempo: $('cicloTempo'),
    cicloInstrucoes: $('cicloInstrucoes'),
    cicloReescrita: $('cicloReescrita'),
    cicloAssistente: $('cicloAssistente'),
    cicloCronometro: $('cicloCronometro'),
    cicloMotivadores: $('cicloMotivadores'),
    statusCiclo: $('statusCiclo'),

    formTema: $('formTema'),
    temaTitulo: $('temaTitulo'),
    temaProposta: $('temaProposta'),
    temaEixo: $('temaEixo'),
    temaModalidade: $('temaModalidade'),
    statusTema: $('statusTema'),

    listaCiclos: $('listaCiclos'),
    listaTemas: $('listaTemas'),
    buscaTema: $('buscaTema'),
    btnAtualizar: $('btnAtualizar')
  };

  const state = {
    contextoGestao: null,
    temas: [],
    ciclos: [],
    alunos: [],
    redacoes: [],
    redacaoSelecionada: null
  };

  function tenant() {
    return (
      new URLSearchParams(location.search).get('t') ||
      localStorage.getItem('axoriin_tenant') ||
      localStorage.getItem('smartclass_tenant') ||
      'cmdpii'
    );
  }

  function token() {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('axoriin_token') ||
      ''
    );
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function url(path) {
    const u = new URL(path, location.origin);
    u.searchParams.set('t', tenant());
    return u.pathname + u.search;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const auth = token();

    if (auth) {
      headers.set('Authorization', `Bearer ${auth}`);
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url(path), {
      credentials: 'same-origin',
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.erro ||
        data.mensagem ||
        'Falha na operação.'
      );
    }

    return data;
  }

  function status(el, mensagem, tipo = 'ok') {
    if (!el) return;

    el.textContent = mensagem;
    el.className = `status show ${tipo}`;
  }

  function formatarData(valor) {
    if (!valor) return 'Sem data definida';

    const data = new Date(valor);

    return Number.isNaN(data.getTime())
      ? 'Data inválida'
      : data.toLocaleString('pt-BR');
  }

  function nomeModalidade(valor) {
    return {
      trilha_orientada: 'Trilha orientada',
      pratica_livre: 'Prática livre',
      avaliacao_institucional: 'Avaliação institucional',
      legado: 'Legado'
    }[valor] || 'Redação';
  }

  function nomeEtapa(valor) {
    return {
      producao_inicial: 'Produção inicial',
      reescrita: 'Reescrita',
      pratica: 'Prática',
      avaliacao: 'Avaliação',
      legado: 'Legado'
    }[valor] || valor || 'Redação';
  }

  function listaHtml(lista) {
    const itens = Array.isArray(lista)
      ? lista.filter(Boolean)
      : [];

    if (!itens.length) {
      return '<p>Nenhum registro.</p>';
    }

    return (
      '<ul class="lista-simples">' +
      itens.map((item) => `<li>${escapeHtml(item)}</li>`).join('') +
      '</ul>'
    );
  }

  function renderSelectTemas() {
    els.cicloTema.innerHTML =
      '<option value="">Selecione um tema</option>' +
      state.temas
        .filter((tema) => tema.status !== 'arquivado')
        .map(
          (tema) =>
            `<option value="${escapeHtml(tema._id)}">${escapeHtml(tema.titulo)}</option>`
        )
        .join('');
  }

  function renderCiclos() {
    if (!state.ciclos.length) {
      els.listaCiclos.innerHTML =
        '<div class="item">Nenhum ciclo cadastrado.</div>';
      return;
    }

    els.listaCiclos.innerHTML = state.ciclos
      .map((ciclo) => {
        const tituloTema =
          ciclo.tema?.titulo ||
          ciclo.temaId?.titulo ||
          'Tema não carregado';

        const modalidade =
          ciclo.modalidade === 'avaliacao_institucional'
            ? 'Avaliação institucional'
            : 'Trilha orientada';

        return (
          `<article class="item">` +
          `<div class="item-top">` +
          `<strong>${escapeHtml(ciclo.nome)}</strong>` +
          `<span class="tag ${
            ciclo.status === 'ativo'
              ? 'active'
              : ciclo.status === 'encerrado'
                ? 'closed'
                : ''
          }">${escapeHtml(ciclo.status)}</span>` +
          `</div>` +
          `<p>${escapeHtml(tituloTema)}</p>` +
          `<div class="tags">` +
          `<span class="tag ${
            ciclo.modalidade === 'avaliacao_institucional'
              ? 'eval'
              : ''
          }">${escapeHtml(modalidade)}</span>` +
          `<span class="tag">${Number(ciclo.maxEnviosPorAluno || 1)} entrega(s)</span>` +
          `<span class="tag">${formatarData(ciclo.dataInicio)}</span>` +
          `</div>` +
          `<div class="actions">` +
          `${
            ciclo.status !== 'ativo'
              ? `<button class="btn btn-success" type="button" data-ativar="${escapeHtml(ciclo._id)}">Ativar</button>`
              : ''
          }` +
          `${
            ciclo.status === 'ativo'
              ? `<button class="btn btn-danger" type="button" data-encerrar="${escapeHtml(ciclo._id)}">Encerrar</button>`
              : ''
          }` +
          `</div>` +
          `</article>`
        );
      })
      .join('');

    els.listaCiclos
      .querySelectorAll('[data-ativar]')
      .forEach((btn) => {
        btn.addEventListener(
          'click',
          () => ativarCiclo(btn.dataset.ativar)
        );
      });

    els.listaCiclos
      .querySelectorAll('[data-encerrar]')
      .forEach((btn) => {
        btn.addEventListener(
          'click',
          () => encerrarCiclo(btn.dataset.encerrar)
        );
      });
  }

  function renderTemas() {
    const busca = String(
      els.buscaTema.value || ''
    )
      .trim()
      .toLowerCase();

    const lista = state.temas.filter((tema) => {
      return (
        !busca ||
        String(tema.titulo || '')
          .toLowerCase()
          .includes(busca)
      );
    });

    if (!lista.length) {
      els.listaTemas.innerHTML =
        '<div class="item">Nenhum tema encontrado.</div>';
      return;
    }

    els.listaTemas.innerHTML = lista
      .map((tema) => {
        const livre =
          tema.modalidade === 'pratica_livre' &&
          tema.status === 'ativo';

        return (
          `<article class="item">` +
          `<div class="item-top">` +
          `<strong>${escapeHtml(tema.titulo)}</strong>` +
          `<span class="tag ${
            livre ? 'active' : ''
          }">${
            livre
              ? 'Prática liberada'
              : escapeHtml(tema.status || 'inativo')
          }</span>` +
          `</div>` +
          `<p>${escapeHtml(tema.eixoTematico || 'Redação ENEM')}</p>` +
          `<div class="actions">` +
          `<button class="btn ${
            livre ? 'btn-danger' : 'btn-success'
          }" type="button" data-pratica="${escapeHtml(tema._id)}" data-livre="${livre ? '1' : '0'}">` +
          `${
            livre
              ? 'Retirar da prática'
              : 'Liberar na prática'
          }` +
          `</button>` +
          `</div>` +
          `</article>`
        );
      })
      .join('');

    els.listaTemas
      .querySelectorAll('[data-pratica]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          alternarPratica(
            btn.dataset.pratica,
            btn.dataset.livre === '1'
          );
        });
      });
  }

  function renderContextoGestao() {
    const contexto = state.contextoGestao || {};
    const usuario = contexto.usuario || {};

    if (els.perfilPainel) {
      els.perfilPainel.textContent =
        `${usuario.nome || 'Usuário'} • ${
          usuario.perfil === 'admin'
            ? 'Administrador'
            : 'Professor'
        }`;
    }

    els.filtroTurma.innerHTML =
      '<option value="">Todas as turmas</option>' +
      (contexto.turmas || [])
        .map(
          (turma) =>
            `<option value="${escapeHtml(turma)}">${escapeHtml(turma)}</option>`
        )
        .join('');

    els.filtroCiclo.innerHTML =
      '<option value="">Todos os ciclos</option>' +
      (contexto.ciclos || [])
        .map(
          (ciclo) =>
            `<option value="${escapeHtml(ciclo._id)}">${escapeHtml(ciclo.nome)} — ${escapeHtml(ciclo.status)}</option>`
        )
        .join('');
  }

  async function carregarAlunosTurma() {
    const turma = els.filtroTurma.value;

    if (!turma) {
      state.alunos = [];
      els.filtroAluno.innerHTML =
        '<option value="">Todos os alunos</option>';
      return;
    }

    const data = await api(
      `/api/redacao/gestao/alunos?turma=${encodeURIComponent(turma)}`
    );

    state.alunos = data.alunos || [];

    els.filtroAluno.innerHTML =
      '<option value="">Todos os alunos</option>' +
      state.alunos
        .map(
          (aluno) =>
            `<option value="${escapeHtml(aluno._id)}">${escapeHtml(aluno.nome)}</option>`
        )
        .join('');
  }

  function renderMetricas(resumo = {}) {
    els.metricaTotal.textContent =
      Number(resumo.total || 0);
    els.metricaCorrigidas.textContent =
      Number(resumo.corrigidas || 0);
    els.metricaMedia.textContent =
      Number(resumo.media || 0);
    els.metricaApoios.textContent =
      Number(resumo.apoiosPendentes || 0);
  }

  function renderRedacoes() {
    els.quantidadeLista.textContent =
      `${state.redacoes.length} registro(s)`;

    if (!state.redacoes.length) {
      els.listaRedacoesProfessor.innerHTML =
        '<div class="item">Nenhuma redação encontrada com os filtros selecionados.</div>';
      els.detalheRedacaoProfessor.innerHTML =
        '<div class="detalhe-vazio">Nenhuma redação selecionada.</div>';
      return;
    }

    els.listaRedacoesProfessor.innerHTML = state.redacoes
      .map((item) => {
        return (
          `<button class="redacao-professor-card" type="button" data-redacao-id="${escapeHtml(item._id)}">` +
          `<div class="redacao-professor-top">` +
          `<div>` +
          `<strong>${escapeHtml(item.aluno?.nome || 'Aluno')}</strong>` +
          `<div>${escapeHtml(item.temaTitulo || 'Redação ENEM')}</div>` +
          `</div>` +
          `<span class="nota-pill">${
            Number.isFinite(item.notaTotal)
              ? item.notaTotal
              : '—'
          }</span>` +
          `</div>` +
          `<div class="redacao-professor-meta">` +
          `<span>${escapeHtml(item.aluno?.turma || 'Sem turma')}</span>` +
          `<span>${escapeHtml(nomeModalidade(item.modalidade))}</span>` +
          `<span>${escapeHtml(nomeEtapa(item.etapaCiclo))}</span>` +
          `<span>${escapeHtml(formatarData(item.createdAt))}</span>` +
          `</div>` +
          `</button>`
        );
      })
      .join('');

    els.listaRedacoesProfessor
      .querySelectorAll('[data-redacao-id]')
      .forEach((card) => {
        card.addEventListener('click', () => {
          abrirRedacao(card.dataset.redacaoId);
        });
      });
  }

  async function buscarRedacoes() {
    const params = new URLSearchParams();

    if (els.filtroTurma.value) {
      params.set('turma', els.filtroTurma.value);
    }

    if (els.filtroAluno.value) {
      params.set('alunoId', els.filtroAluno.value);
    }

    if (els.filtroCiclo.value) {
      params.set('cicloId', els.filtroCiclo.value);
    }

    if (els.filtroModalidade.value) {
      params.set(
        'modalidade',
        els.filtroModalidade.value
      );
    }

    if (els.filtroStatus.value) {
      params.set('status', els.filtroStatus.value);
    }

    params.set('limit', '150');

    els.listaRedacoesProfessor.innerHTML =
      '<div class="item">Carregando redações...</div>';

    const data = await api(
      `/api/redacao/gestao/redacoes?${params.toString()}`
    );

    state.redacoes = data.redacoes || [];
    renderMetricas(data.resumo || {});
    renderRedacoes();
  }

  function feedbackCompetenciasHtml(correcao = {}) {
    const feedback =
      correcao.feedbackCompetencias || {};
    const notas =
      correcao.competencias || {};

    return ['c1', 'c2', 'c3', 'c4', 'c5']
      .map((chave) => {
        const item = feedback[chave] || {};

        return (
          `<details>` +
          `<summary>${chave.toUpperCase()} — ${Number(notas[chave] || 0)} pontos</summary>` +
          `<p><strong>${escapeHtml(item.nivel || '')}</strong></p>` +
          `<p>${escapeHtml(item.diagnostico || 'Sem diagnóstico registrado.')}</p>` +
          `<p><strong>Evidências</strong></p>` +
          `${listaHtml(item.evidencias)}` +
          `<p><strong>Como melhorar</strong></p>` +
          `${listaHtml(item.comoMelhorar)}` +
          `</details>`
        );
      })
      .join('');
  }

  function renderDetalhe(data) {
    const redacao = data.redacao || {};
    const aluno = data.aluno || {};
    const correcao = redacao.correcaoIA || {};
    const comps =
      correcao.competencias ||
      redacao.competencias ||
      {};
    const apoio = redacao.apoioProfessor || {};
    const integridade =
      redacao.evidenciaAutoria || {};
    const percentualColado = Math.round(
      Number(integridade.proporcaoTextoColado || 0) * 100
    );

    state.redacaoSelecionada = redacao._id;

    els.detalheRedacaoProfessor.innerHTML =
      `<div class="detalhe-cabecalho">` +
      `<div>` +
      `<h3>${escapeHtml(aluno.nome || 'Aluno')}</h3>` +
      `<p>${escapeHtml(aluno.turma || '')} • ${escapeHtml(redacao.temaTituloSnapshot || 'Redação ENEM')}</p>` +
      `<p>${escapeHtml(formatarData(redacao.createdAt))}</p>` +
      `</div>` +
      `<div class="nota-destaque">` +
      `<span>Nota estimada</span>` +
      `<strong>${Number(correcao.notaTotal || redacao.notaTotal || 0)}</strong>` +
      `</div>` +
      `</div>` +

      `<div class="competencias-professor">` +
      `['c1','c2','c3','c4','c5']`.replace(
        "['c1','c2','c3','c4','c5']",
        ['c1', 'c2', 'c3', 'c4', 'c5']
          .map(
            (chave) =>
              `<div><span>${chave.toUpperCase()}</span><strong>${Number(comps[chave] || 0)}</strong></div>`
          )
          .join('')
      ) +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Texto produzido pelo aluno</h4>` +
      `<div class="texto-redacao">${escapeHtml(redacao.texto || '')}</div>` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Resumo da avaliação</h4>` +
      `<p>${escapeHtml(correcao.resumoAvaliacao || 'Sem resumo registrado.')}</p>` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Foco principal</h4>` +
      `<p>${escapeHtml(correcao.focoPrincipal || 'Não informado.')}</p>` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Análise por competência</h4>` +
      `<div class="feedback-competencias">${feedbackCompetenciasHtml(correcao)}</div>` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Pontos fortes</h4>` +
      `${listaHtml(correcao.pontosFortes)}` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Pontos a melhorar</h4>` +
      `${listaHtml(correcao.pontosMelhorar)}` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Plano de estudo</h4>` +
      `${listaHtml(correcao.planoEstudoSugerido)}` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Intervenção identificada</h4>` +
      `<p>${escapeHtml(
        correcao.propostaIntervencaoIdentificada ||
        correcao.propostaIntervencao ||
        'Não informada.'
      )}</p>` +
      `</div>` +

      `<div class="detalhe-bloco">` +
      `<h4>Indicadores de autoria</h4>` +
      `<div class="integridade-box">` +
      `<span>Atenção: ${escapeHtml(integridade.nivelAtencao || 'baixo')}</span>` +
      `<span>Texto colado: ${percentualColado}%</span>` +
      `<span>Eventos de digitação: ${Number(integridade.eventosDigitacao || 0)}</span>` +
      `</div>` +
      `<p>${escapeHtml(integridade.observacao || 'Os indicadores são sinais pedagógicos e não prova de fraude.')}</p>` +
      `</div>` +

      `<div class="detalhe-bloco orientacao-professor">` +
      `<h4>Orientação do professor</h4>` +
      `${
        apoio.observacaoProfessor
          ? `<div class="orientacao-anterior"><strong>${escapeHtml(apoio.professorNome || 'Professor')}</strong><br>${escapeHtml(apoio.observacaoProfessor)}</div>`
          : ''
      }` +
      `<textarea id="textoOrientacaoProfessor" placeholder="Registre uma orientação pedagógica breve para o aluno.">${escapeHtml(apoio.observacaoProfessor || '')}</textarea>` +
      `<div class="actions">` +
      `<button class="btn btn-primary" type="button" id="btnSalvarOrientacao">Salvar orientação</button>` +
      `</div>` +
      `<div class="status" id="statusOrientacao"></div>` +
      `</div>`;

    const botao =
      document.getElementById('btnSalvarOrientacao');

    if (botao) {
      botao.addEventListener(
        'click',
        salvarOrientacao
      );
    }

    els.listaRedacoesProfessor
      .querySelectorAll('[data-redacao-id]')
      .forEach((card) => {
        card.classList.toggle(
          'active',
          card.dataset.redacaoId ===
            String(redacao._id)
        );
      });
  }

  async function abrirRedacao(id) {
    els.detalheRedacaoProfessor.innerHTML =
      '<div class="detalhe-vazio">Carregando redação...</div>';

    const data = await api(
      `/api/redacao/gestao/redacoes/${id}`
    );

    renderDetalhe(data);
  }

  async function salvarOrientacao() {
    const textarea =
      document.getElementById('textoOrientacaoProfessor');
    const statusEl =
      document.getElementById('statusOrientacao');

    const observacaoProfessor =
      String(textarea?.value || '').trim();

    if (!observacaoProfessor) {
      status(
        statusEl,
        'Escreva uma orientação antes de salvar.',
        'error'
      );
      return;
    }

    try {
      await api(
        `/api/redacao/gestao/redacoes/${state.redacaoSelecionada}/orientacao`,
        {
          method: 'POST',
          body: JSON.stringify({
            observacaoProfessor
          })
        }
      );

      status(
        statusEl,
        'Orientação registrada com sucesso.'
      );

      await abrirRedacao(
        state.redacaoSelecionada
      );
      await buscarRedacoes();
    } catch (error) {
      status(
        statusEl,
        error.message,
        'error'
      );
    }
  }

  async function carregarGestao() {
    state.contextoGestao = await api(
      '/api/redacao/gestao/contexto'
    );

    renderContextoGestao();
  }

  async function carregarAdministracao() {
    const [temas, ciclos] = await Promise.all([
      api('/api/redacao/temas'),
      api('/api/redacao/admin/ciclos')
    ]);

    state.temas = temas.temas || [];
    state.ciclos = ciclos.ciclos || [];

    renderSelectTemas();
    renderCiclos();
    renderTemas();
  }

  async function carregarTudo() {
    await Promise.all([
      carregarGestao(),
      carregarAdministracao()
    ]);

    await buscarRedacoes();
  }

  async function ativarCiclo(id) {
    await api(
      `/api/redacao/admin/ciclos/${id}/ativar`,
      { method: 'POST' }
    );

    await carregarTudo();
  }

  async function encerrarCiclo(id) {
    if (!confirm('Deseja encerrar este ciclo?')) {
      return;
    }

    await api(
      `/api/redacao/admin/ciclos/${id}/encerrar`,
      { method: 'POST' }
    );

    await carregarTudo();
  }

  async function alternarPratica(id, livre) {
    await api(`/api/redacao/tema/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        modalidade:
          livre
            ? 'trilha_orientada'
            : 'pratica_livre',
        status:
          livre
            ? 'inativo'
            : 'ativo'
      })
    });

    await carregarTudo();
  }

  function ajustarModalidade() {
    const avaliacao =
      els.cicloModalidade.value ===
      'avaliacao_institucional';

    els.cicloMaxEnvios.value =
      avaliacao ? '1' : '2';
    els.cicloReescrita.checked =
      !avaliacao;
    els.cicloReescrita.disabled =
      avaliacao;
    els.cicloAssistente.checked =
      !avaliacao;
    els.cicloCronometro.checked =
      avaliacao;
  }

  els.cicloModalidade.addEventListener(
    'change',
    ajustarModalidade
  );

  els.formCiclo.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      try {
        const payload = {
          nome: els.cicloNome.value,
          modalidade:
            els.cicloModalidade.value,
          temaId: els.cicloTema.value,
          dataInicio:
            els.cicloInicio.value || null,
          dataFim:
            els.cicloFim.value || null,
          maxEnviosPorAluno:
            Number(
              els.cicloMaxEnvios.value
            ) || 1,
          tempoLimiteMinutos:
            Number(els.cicloTempo.value) ||
            60,
          instrucoesAluno:
            els.cicloInstrucoes.value,
          permiteReescrita:
            els.cicloReescrita.checked,
          assistenteDuranteEscrita:
            els.cicloAssistente.checked,
          cronometroObrigatorio:
            els.cicloCronometro.checked,
          mostrarTextosMotivadores:
            els.cicloMotivadores.checked,
          status: 'rascunho'
        };

        await api('/api/redacao/admin/ciclos', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        status(
          els.statusCiclo,
          'Ciclo criado. Agora use o botão Ativar na lista abaixo.'
        );

        els.formCiclo.reset();
        ajustarModalidade();
        await carregarTudo();
      } catch (error) {
        status(
          els.statusCiclo,
          error.message,
          'error'
        );
      }
    }
  );

  els.formTema.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      try {
        const livre =
          els.temaModalidade.value ===
          'pratica_livre';

        await api('/api/redacao/tema', {
          method: 'POST',
          body: JSON.stringify({
            titulo: els.temaTitulo.value,
            proposta: els.temaProposta.value,
            eixoTematico:
              els.temaEixo.value ||
              'Redação ENEM',
            modalidade:
              els.temaModalidade.value,
            status:
              livre ? 'ativo' : 'inativo'
          })
        });

        status(
          els.statusTema,
          'Tema cadastrado com sucesso.'
        );

        els.formTema.reset();
        await carregarTudo();
      } catch (error) {
        status(
          els.statusTema,
          error.message,
          'error'
        );
      }
    }
  );

  els.filtroTurma.addEventListener(
    'change',
    async () => {
      try {
        await carregarAlunosTurma();
      } catch (error) {
        alert(error.message);
      }
    }
  );

  els.btnBuscarRedacoes.addEventListener(
    'click',
    () => {
      buscarRedacoes().catch((error) => {
        alert(error.message);
      });
    }
  );

  els.buscaTema.addEventListener(
    'input',
    renderTemas
  );

  els.btnAtualizar.addEventListener(
    'click',
    () => {
      carregarTudo().catch((error) => {
        alert(error.message);
      });
    }
  );

  ajustarModalidade();

  carregarTudo().catch((error) => {
    alert(
      error.message.includes('professores e administradores')
        ? 'Seu perfil não possui acesso ao Painel ENEM — Redação.'
        : error.message
    );
  });
})();
