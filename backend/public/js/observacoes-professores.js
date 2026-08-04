(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const estado = {
    alunos: [],
    modoRegistro: 'individual',
    alunosSelecionados: new Set(),
    alunosFiltrados: [],
    categoria: 'comportamento',
    prioridade: 'normal',
    marcadores: new Set(),
    gravador: null,
    stream: null,
    partes: [],
    iniciouEm: 0,
    timer: null,
    usouVoz: false,
    enviando: false,
    audioUrl: '',
    audioPlayer: null,
    ultimaTranscricao: '',
    textoAntesTranscricao: '',
    textoAposTranscricao: '',
  };

  const categoriasRotulo = {
    comportamento: 'Comportamento',
    participacao_pedagogica: 'Participação',
    convivencia: 'Convivência',
    seguranca: 'Segurança',
    atividade: 'Atividade',
    elogio: 'Elogio',
    outro: 'Outro',
  };

  const statusRotulo = {
    nova: 'Nova',
    lida: 'Lida',
    em_atendimento: 'Em atendimento',
    resolvida: 'Resolvida',
    arquivada: 'Arquivada',
  };

  function escapar(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizar(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function formatarData(valor) {
    if (!valor) return 'Data não informada';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return 'Data não informada';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(data);
  }

  function status(mensagem, tipo = '') {
    const el = $('opStatus');
    el.textContent = mensagem || '';
    el.className = `op-status${mensagem ? ' show' : ''}${tipo ? ` ${tipo}` : ''}`;
  }

  async function api(url, opcoes = {}) {
    const resposta = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...opcoes,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opcoes.headers || {}),
      },
    });

    const payload = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(payload.mensagem || payload.erro || 'Não foi possível concluir a operação.');
      erro.status = resposta.status;
      erro.codigo = payload.codigo || null;
      throw erro;
    }
    return payload;
  }

  function definirCarregando(ativo) {
    estado.enviando = ativo;
    $('opEnviar').disabled = ativo;
    $('opFormCard').classList.toggle('op-loading', ativo);
  }

  async function carregarSessao() {
    try {
      const usuario = await api('/api/usuario-logado');
      if (String(usuario.tipo || '').toLowerCase() !== 'professor') {
        status('Esta área é exclusiva para professores.', 'error');
        $('opForm').hidden = true;
        return false;
      }
      $('opUsuario').textContent = `${usuario.nome || 'Professor'} • registro rápido em sala`;
      return true;
    } catch (erro) {
      status('Sua sessão expirou. Faça login novamente.', 'error');
      setTimeout(() => {
        location.href = '/login.html?next=%2Fobservacoes-professores.html';
      }, 900);
      return false;
    }
  }

  function montarTurmas() {
    const select = $('opTurma');
    const turmas = [...new Set(estado.alunos.map((aluno) => String(aluno.turma || 'Sem turma').trim()))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    select.innerHTML = '<option value="">Todas as turmas</option>' + turmas
      .map((turma) => `<option value="${escapar(turma)}">${escapar(turma)}</option>`)
      .join('');
  }

  function obterAlunosFiltrados() {
    const turma = $('opTurma').value;
    const busca = normalizar($('opBuscaAluno').value);
    return estado.alunos.filter((aluno) => {
      const turmaOk = !turma || String(aluno.turma || '') === turma;
      const buscaOk = !busca || normalizar(aluno.nome).includes(busca);
      return turmaOk && buscaOk;
    });
  }

  function atualizarResumoSelecao() {
    const total = estado.alunosSelecionados.size;
    $('opSelecionados').textContent = String(total);
    $('opEnviarTexto').textContent = estado.modoRegistro === 'lote'
      ? `Enviar para ${total || 0} aluno${total === 1 ? '' : 's'}`
      : 'Enviar observação à coordenação';
  }

  function renderizarListaLote(filtrados) {
    const lista = $('opListaAlunosLote');
    const turma = $('opTurma').value;

    if (!turma) {
      lista.innerHTML = '<div class="op-empty small">Escolha uma turma para selecionar vários alunos.</div>';
      return;
    }
    if (!filtrados.length) {
      lista.innerHTML = '<div class="op-empty small">Nenhum aluno encontrado com esse filtro.</div>';
      return;
    }

    lista.innerHTML = filtrados.map((aluno) => {
      const id = String(aluno._id);
      const selecionado = estado.alunosSelecionados.has(id);
      return `<label class="op-student-option ${selecionado ? 'selected' : ''}">
        <input type="checkbox" value="${escapar(id)}" ${selecionado ? 'checked' : ''}>
        <span class="op-student-option-copy"><strong>${escapar(aluno.nome)}</strong><span>${escapar(aluno.turma || 'Sem turma')}</span></span>
      </label>`;
    }).join('');
  }

  function filtrarAlunos() {
    const select = $('opAluno');
    const valorAtual = select.value;
    const filtrados = obterAlunosFiltrados();
    estado.alunosFiltrados = filtrados;

    select.innerHTML = '<option value="">Selecione o aluno</option>' + filtrados
      .map((aluno) => `<option value="${escapar(aluno._id)}">${escapar(aluno.nome)} — ${escapar(aluno.turma || 'Sem turma')}</option>`)
      .join('');

    if (filtrados.some((aluno) => String(aluno._id) === String(valorAtual))) {
      select.value = valorAtual;
    }

    renderizarListaLote(filtrados);
    $('opTotalAlunos').textContent = `${filtrados.length} aluno${filtrados.length === 1 ? '' : 's'}`;
    atualizarResumoSelecao();
  }

  function definirModoRegistro(modo) {
    estado.modoRegistro = modo === 'lote' ? 'lote' : 'individual';
    document.querySelectorAll('#opModoRegistro [data-mode]').forEach((botao) => {
      botao.classList.toggle('active', botao.dataset.mode === estado.modoRegistro);
    });

    const lote = estado.modoRegistro === 'lote';
    $('opIndividualBox').hidden = lote;
    $('opLoteBox').hidden = !lote;
    $('opAlunoLabel').innerHTML = lote
      ? 'Alunos <span class="op-required">*</span>'
      : 'Aluno <span class="op-required">*</span>';
    $('opModoAjuda').textContent = lote
      ? 'Escolha uma turma, marque os estudantes e registre o fato uma única vez.'
      : 'Selecione um estudante para registrar a observação.';

    if (lote && !$('opTurma').value) {
      $('opTurma').focus();
      status('Para o registro em lote, escolha primeiro uma turma.', '');
    }
    filtrarAlunos();
  }

  function alternarAlunoLote(id, marcado) {
    const aluno = estado.alunos.find((item) => String(item._id) === String(id));
    if (!aluno) return;
    if (marcado) estado.alunosSelecionados.add(String(id));
    else estado.alunosSelecionados.delete(String(id));
    renderizarListaLote(estado.alunosFiltrados);
    atualizarResumoSelecao();
  }

  function selecionarAlunosExibidos() {
    if (!$('opTurma').value) {
      status('Escolha uma turma antes de selecionar os alunos.', 'error');
      $('opTurma').focus();
      return;
    }
    estado.alunosFiltrados.slice(0, 50).forEach((aluno) => estado.alunosSelecionados.add(String(aluno._id)));
    renderizarListaLote(estado.alunosFiltrados);
    atualizarResumoSelecao();
  }

  function limparSelecaoLote() {
    estado.alunosSelecionados.clear();
    renderizarListaLote(estado.alunosFiltrados);
    atualizarResumoSelecao();
  }

  async function carregarAlunos() {
    const payload = await api('/api/observacoes-professores/alunos');
    estado.alunos = Array.isArray(payload.alunos) ? payload.alunos : [];
    montarTurmas();
    filtrarAlunos();

    const alunoQuery = new URLSearchParams(location.search).get('alunoId');
    if (alunoQuery && estado.alunos.some((item) => String(item._id) === alunoQuery)) {
      const aluno = estado.alunos.find((item) => String(item._id) === alunoQuery);
      $('opTurma').value = aluno?.turma || '';
      filtrarAlunos();
      $('opAluno').value = alunoQuery;
    }
  }

  function selecionarChip(containerId, atributo, valor) {
    document.querySelectorAll(`#${containerId} [${atributo}]`).forEach((botao) => {
      botao.classList.toggle('active', botao.getAttribute(atributo) === valor);
    });
  }

  function adicionarAtalho(botao) {
    const trecho = String(botao.dataset.text || '').trim();
    if (!trecho) return;

    const textarea = $('opTexto');
    const jaSelecionado = estado.marcadores.has(trecho);

    if (jaSelecionado) {
      estado.marcadores.delete(trecho);
      botao.classList.remove('selected');
      const linhas = textarea.value
        .split('\n')
        .map((linha) => linha.trim())
        .filter((linha) => linha && linha !== trecho);
      textarea.value = linhas.join('\n');
    } else {
      estado.marcadores.add(trecho);
      botao.classList.add('selected');
      textarea.value = [textarea.value.trim(), trecho].filter(Boolean).join('\n');
    }

    atualizarContador();
    textarea.focus();
  }

  function atualizarContador() {
    $('opContador').textContent = String($('opTexto').value.length);
  }

  function formatarTempo(segundos) {
    const min = String(Math.floor(segundos / 60)).padStart(2, '0');
    const seg = String(segundos % 60).padStart(2, '0');
    return `${min}:${seg}`;
  }

  function pararTimer() {
    if (estado.timer) clearInterval(estado.timer);
    estado.timer = null;
  }

  function encerrarStream() {
    if (estado.stream) {
      estado.stream.getTracks().forEach((track) => track.stop());
    }
    estado.stream = null;
  }

  function mimePreferido() {
    const candidatos = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidatos.find((tipo) => window.MediaRecorder?.isTypeSupported?.(tipo)) || '';
  }


  function garantirAcoesAudio() {
    if ($('opAudioAcoes')) return;

    const estadoAudio = document.querySelector('.op-audio-state');
    if (!estadoAudio) return;

    const container = document.createElement('div');
    container.id = 'opAudioAcoes';
    container.className = 'op-audio-actions';
    container.hidden = true;
    container.innerHTML = `
      <button type="button" class="op-audio-action" id="opOuvirAudio">▶ Ouvir gravação</button>
      <button type="button" class="op-audio-action" id="opDesfazerTranscricao">↶ Desfazer transcrição</button>
    `;
    estadoAudio.insertAdjacentElement('afterend', container);

    if (!$('opAudioAcoesStyle')) {
      const style = document.createElement('style');
      style.id = 'opAudioAcoesStyle';
      style.textContent = `
        .op-audio-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
        .op-audio-actions[hidden]{display:none}
        .op-audio-action{
          border:1px solid rgba(165,205,255,.22);
          background:rgba(255,255,255,.055);
          color:#f5f9ff;
          border-radius:10px;
          padding:8px 10px;
          font-size:.78rem;
          font-weight:800;
          cursor:pointer;
        }
        .op-audio-action:hover{border-color:rgba(56,189,248,.62);background:rgba(56,189,248,.09)}
      `;
      document.head.appendChild(style);
    }

    $('opOuvirAudio').addEventListener('click', ouvirUltimaGravacao);
    $('opDesfazerTranscricao').addEventListener('click', desfazerUltimaTranscricao);
  }

  function liberarAudioAnterior() {
    if (estado.audioPlayer) {
      estado.audioPlayer.pause();
      estado.audioPlayer.src = '';
    }
    estado.audioPlayer = null;

    if (estado.audioUrl) {
      URL.revokeObjectURL(estado.audioUrl);
    }
    estado.audioUrl = '';
  }

  function disponibilizarAudio(blob) {
    liberarAudioAnterior();
    estado.audioUrl = URL.createObjectURL(blob);
    const acoes = $('opAudioAcoes');
    if (acoes) acoes.hidden = false;
  }

  function ouvirUltimaGravacao() {
    if (!estado.audioUrl) {
      status('Nenhuma gravação recente está disponível para ouvir.', 'error');
      return;
    }

    if (estado.audioPlayer && !estado.audioPlayer.paused) {
      estado.audioPlayer.pause();
      estado.audioPlayer.currentTime = 0;
      $('opOuvirAudio').textContent = '▶ Ouvir gravação';
      return;
    }

    estado.audioPlayer = new Audio(estado.audioUrl);
    $('opOuvirAudio').textContent = '⏹ Parar áudio';
    estado.audioPlayer.addEventListener('ended', () => {
      $('opOuvirAudio').textContent = '▶ Ouvir gravação';
    }, { once: true });
    estado.audioPlayer.play().catch(() => {
      $('opOuvirAudio').textContent = '▶ Ouvir gravação';
      status('O navegador não permitiu reproduzir a gravação.', 'error');
    });
  }

  function desfazerUltimaTranscricao() {
    if (!estado.ultimaTranscricao) {
      status('Não há uma transcrição recente para desfazer.', 'error');
      return;
    }

    const textarea = $('opTexto');
    if (textarea.value !== estado.textoAposTranscricao) {
      status('O relato foi alterado depois da transcrição. Remova o trecho manualmente para não perder suas edições.', 'error');
      return;
    }

    textarea.value = estado.textoAntesTranscricao;
    estado.ultimaTranscricao = '';
    estado.textoAposTranscricao = '';
    atualizarContador();
    textarea.focus();
    status('A última transcrição foi removida. Você pode gravar novamente.', 'success');
  }

  async function iniciarGravacao() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status('Este navegador não oferece gravação compatível. Digite a observação normalmente.', 'error');
      return;
    }

    try {
      estado.ultimaTranscricao = '';
      estado.textoAntesTranscricao = '';
      estado.textoAposTranscricao = '';
      estado.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
        },
      });

      const mimeType = mimePreferido();
      estado.partes = [];

      const opcoesGravacao = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      };

      try {
        estado.gravador = new MediaRecorder(estado.stream, opcoesGravacao);
      } catch (_erroOpcoes) {
        estado.gravador = mimeType
          ? new MediaRecorder(estado.stream, { mimeType })
          : new MediaRecorder(estado.stream);
      }

      estado.gravador.addEventListener('dataavailable', (evento) => {
        if (evento.data?.size) estado.partes.push(evento.data);
      });

      estado.gravador.addEventListener('stop', transcreverGravacao, { once: true });
      estado.gravador.start(250);
      estado.iniciouEm = Date.now();

      $('opMic').classList.add('recording');
      $('opMic').textContent = '⏹';
      $('opMic').title = 'Parar gravação';
      $('opAudioTexto').textContent = 'Gravando em alta qualidade... fale próximo ao microfone.';
      $('opAudioTempo').textContent = '00:00';

      pararTimer();
      estado.timer = setInterval(() => {
        const segundos = Math.floor((Date.now() - estado.iniciouEm) / 1000);
        $('opAudioTempo').textContent = formatarTempo(segundos);
        if (segundos >= 60) pararGravacao();
      }, 500);
    } catch (erro) {
      encerrarStream();
      status('Não foi possível acessar o microfone. Verifique a permissão do navegador.', 'error');
    }
  }

  function pararGravacao() {
    if (estado.gravador?.state === 'recording') {
      estado.gravador.stop();
    }
    pararTimer();
    $('opMic').classList.remove('recording');
    $('opMic').textContent = '🎙️';
    $('opMic').title = 'Gravar observação';
    $('opAudioTexto').textContent = 'Preparando transcrição...';
  }

  async function transcreverGravacao() {
    const duracaoMs = Math.max(0, Date.now() - Number(estado.iniciouEm || Date.now()));
    const tipo = estado.gravador?.mimeType || estado.partes[0]?.type || 'audio/webm';
    const blob = new Blob(estado.partes, { type: tipo });
    disponibilizarAudio(blob);
    encerrarStream();
    estado.gravador = null;

    if (!blob.size) {
      $('opAudioTexto').textContent = 'Nenhum áudio foi capturado.';
      return;
    }

    if (duracaoMs < 900) {
      $('opAudioTexto').textContent = 'A gravação ficou muito curta. Grave novamente falando após o início do contador.';
      status('Gravação muito curta para uma transcrição confiável.', 'error');
      estado.partes = [];
      return;
    }

    const form = new FormData();
    const extensao = tipo.includes('ogg') ? 'ogg' : tipo.includes('mp4') ? 'mp4' : 'webm';
    form.append('audio', blob, `observacao.${extensao}`);
    form.append('categoria', estado.categoria || 'comportamento');

    $('opMic').disabled = true;
    $('opAudioTexto').textContent = 'Transcrevendo fielmente o áudio com vocabulário escolar...';

    try {
      const payload = await api('/api/observacoes-professores/transcrever', {
        method: 'POST',
        body: form,
      });

      const transcricao = String(payload.texto || '').trim();
      if (transcricao) {
        const textarea = $('opTexto');
        const textoAnterior = textarea.value.trim();
        const textoFinal = textoAnterior ? `${textoAnterior}\n${transcricao}` : transcricao;

        estado.textoAntesTranscricao = textoAnterior;
        estado.ultimaTranscricao = transcricao;
        estado.textoAposTranscricao = textoFinal;
        textarea.value = textoFinal;
        estado.usouVoz = true;
        atualizarContador();
        textarea.focus();
        $('opAudioTexto').textContent = 'Transcrição concluída. Ouça a gravação se algum termo parecer diferente.';
        status('A fala foi transcrita sem usar os atalhos como contexto. Revise antes do envio.', 'success');
      }
    } catch (erro) {
      $('opAudioTexto').textContent = 'Não foi possível transcrever. Você pode digitar o relato.';
      status(erro.message, 'error');
    } finally {
      $('opMic').disabled = false;
      estado.partes = [];
    }
  }

  function alternarMicrofone() {
    if (estado.gravador?.state === 'recording') pararGravacao();
    else iniciarGravacao();
  }

  function podeEditar(item) {
    if (item.status !== 'nova') return false;
    if (!item.editavelAte) return false;
    return new Date(item.editavelAte).getTime() > Date.now() && Number(item.totalLeituras || 0) === 0;
  }

  function agruparHistorico(observacoes) {
    const grupos = [];
    const lotes = new Map();

    (observacoes || []).forEach((item) => {
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

  function renderHistorico(observacoes) {
    const container = $('opHistorico');
    if (!Array.isArray(observacoes) || !observacoes.length) {
      container.innerHTML = '<div class="op-empty">Nenhuma observação enviada ainda.</div>';
      return;
    }

    container.innerHTML = agruparHistorico(observacoes).map((grupo) => {
      if (grupo.tipo === 'individual') {
        const item = grupo.item;
        const atendimento = item.atendimento?.nome
          ? `<div class="op-history-meta">Atendimento: ${escapar(item.atendimento.nome)}</div>`
          : '';
        const resolucao = item.resolucao?.nota
          ? `<div class="op-history-meta">Retorno: ${escapar(item.resolucao.nota)}</div>`
          : '';
        const editar = podeEditar(item)
          ? `<div class="op-history-actions">
               <button class="op-small-btn" type="button" data-edit="${escapar(item._id)}">Editar</button>
               <button class="op-small-btn danger" type="button" data-delete="${escapar(item._id)}">Retirar</button>
             </div>`
          : '';

        return `<article class="op-history-item">
          <div class="op-history-top">
            <div><div class="op-history-name">${escapar(item.alunoNome)} • ${escapar(item.turma)}</div>
            <div class="op-history-meta">${escapar(categoriasRotulo[item.categoria] || item.categoria)} • ${formatarData(item.createdAt)}</div></div>
            <span class="op-badge ${escapar(item.status)}">${escapar(statusRotulo[item.status] || item.status)}</span>
          </div>
          <div class="op-history-text">${escapar(item.texto)}</div>${atendimento}${resolucao}${editar}
        </article>`;
      }

      const itens = grupo.itens;
      const primeiro = itens[0];
      const nomes = itens.map((item) => item.alunoNome).filter(Boolean);
      const todosEditaveis = itens.length > 0 && itens.every(podeEditar);
      const estados = [...new Set(itens.map((item) => item.status))];
      const statusGrupo = estados.length === 1 ? estados[0] : 'em_atendimento';
      const totalOriginal = Number(primeiro.loteTotal || itens.length);
      const nomesResumo = nomes.slice(0, 5).join(', ') + (nomes.length > 5 ? ` e mais ${nomes.length - 5}` : '');
      const acoes = todosEditaveis
        ? `<div class="op-history-actions">
             <button class="op-small-btn" type="button" data-edit-lote="${escapar(grupo.loteId)}">Editar lote</button>
             <button class="op-small-btn danger" type="button" data-delete-lote="${escapar(grupo.loteId)}">Retirar lote</button>
           </div>`
        : '';

      return `<article class="op-history-item op-history-lote">
        <div class="op-history-top">
          <div><div class="op-history-name">${totalOriginal} alunos • ${escapar(primeiro.turma)}</div>
          <div class="op-history-meta">${escapar(categoriasRotulo[primeiro.categoria] || primeiro.categoria)} • ${formatarData(primeiro.createdAt)}</div></div>
          <span class="op-badge ${escapar(statusGrupo)}">${estados.length === 1 ? escapar(statusRotulo[statusGrupo] || statusGrupo) : 'Situações diferentes'}</span>
        </div>
        <span class="op-history-lote-label">REGISTRO EM LOTE</span>
        <div class="op-history-text">${escapar(primeiro.texto)}</div>
        <div class="op-history-students">${escapar(nomesResumo || `${itens.length} alunos`)}</div>
        ${acoes}
      </article>`;
    }).join('');
  }

  async function carregarHistorico() {
    try {
      const payload = await api('/api/observacoes-professores/minhas?limit=100');
      renderHistorico(payload.observacoes || []);
    } catch (erro) {
      $('opHistorico').innerHTML = `<div class="op-empty">${escapar(erro.message)}</div>`;
    }
  }

  async function editarObservacao(id) {
    try {
      const payload = await api('/api/observacoes-professores/minhas?limit=100');
      const item = (payload.observacoes || []).find((obs) => String(obs._id) === String(id));
      if (!item) return;

      const novoTexto = window.prompt('Revise o texto da observação:', item.texto || '');
      if (novoTexto === null) return;
      if (novoTexto.trim().length < 3) {
        status('O texto precisa ter pelo menos 3 caracteres.', 'error');
        return;
      }

      await api(`/api/observacoes-professores/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          texto: novoTexto,
          categoria: item.categoria,
          prioridade: item.prioridade,
          componenteCurricular: item.componenteCurricular || '',
          marcadores: item.marcadores || [],
        }),
      });
      status('Observação atualizada.', 'success');
      await carregarHistorico();
    } catch (erro) {
      status(erro.message, 'error');
    }
  }

  async function retirarObservacao(id) {
    if (!window.confirm('Retirar esta observação antes que a coordenação a leia?')) return;
    try {
      await api(`/api/observacoes-professores/${encodeURIComponent(id)}`, { method: 'DELETE' });
      status('Observação retirada da fila.', 'success');
      await carregarHistorico();
    } catch (erro) {
      status(erro.message, 'error');
    }
  }

  async function editarLote(loteId) {
    try {
      const payload = await api('/api/observacoes-professores/minhas?limit=100');
      const itens = (payload.observacoes || []).filter((obs) => String(obs.loteId || '') === String(loteId));
      if (!itens.length) return;
      const primeiro = itens[0];
      const novoTexto = window.prompt(`Revise o texto para os ${primeiro.loteTotal || itens.length} alunos do lote:`, primeiro.texto || '');
      if (novoTexto === null) return;
      if (novoTexto.trim().length < 3) {
        status('O texto precisa ter pelo menos 3 caracteres.', 'error');
        return;
      }
      await api(`/api/observacoes-professores/lote/${encodeURIComponent(loteId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          texto: novoTexto,
          categoria: primeiro.categoria,
          prioridade: primeiro.prioridade,
          componenteCurricular: primeiro.componenteCurricular || '',
          marcadores: primeiro.marcadores || [],
        }),
      });
      status('Lote de observações atualizado.', 'success');
      await carregarHistorico();
    } catch (erro) {
      status(erro.message, 'error');
    }
  }

  async function retirarLote(loteId) {
    if (!window.confirm('Retirar todas as observações deste lote antes que a coordenação as leia?')) return;
    try {
      await api(`/api/observacoes-professores/lote/${encodeURIComponent(loteId)}`, { method: 'DELETE' });
      status('Lote retirado da fila da coordenação.', 'success');
      await carregarHistorico();
    } catch (erro) {
      status(erro.message, 'error');
    }
  }

  function limparFormularioDepoisDoEnvio() {
    $('opTexto').value = '';
    $('opComponente').value = '';
    estado.marcadores.clear();
    estado.usouVoz = false;
    estado.alunosSelecionados.clear();
    document.querySelectorAll('.op-quick.selected').forEach((item) => item.classList.remove('selected'));
    atualizarContador();
    atualizarResumoSelecao();
    renderizarListaLote(estado.alunosFiltrados);
    $('opAudioTexto').textContent = 'Toque no microfone para ditar.';
    $('opAudioTempo').textContent = '00:00';
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (estado.enviando) return;

    const texto = $('opTexto').value.trim();
    if (texto.length < 3) {
      status('Digite ou grave uma observação antes de enviar.', 'error');
      $('opTexto').focus();
      return;
    }

    const haviaTextoAntesDaVoz = estado.usouVoz && texto.split('\n').length > 1;
    const dadosComuns = {
      texto,
      categoria: estado.categoria,
      prioridade: estado.prioridade,
      componenteCurricular: $('opComponente').value.trim(),
      marcadores: [...estado.marcadores],
      origemRegistro: estado.usouVoz ? (haviaTextoAntesDaVoz ? 'misto' : 'voz') : 'digitacao',
    };
    const prioridade = estado.prioridade === 'urgente' ? ' como URGENTE' : '';

    if (estado.modoRegistro === 'lote') {
      const turma = $('opTurma').value;
      const alunoIds = [...estado.alunosSelecionados];
      if (!turma) {
        status('Escolha a turma antes de enviar o registro em lote.', 'error');
        $('opTurma').focus();
        return;
      }
      if (alunoIds.length < 2) {
        status('Selecione pelo menos dois alunos para o registro em lote.', 'error');
        $('opListaAlunosLote').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (alunoIds.length > 50) {
        status('O limite é de 50 alunos por envio.', 'error');
        return;
      }

      const selecionados = estado.alunos.filter((item) => estado.alunosSelecionados.has(String(item._id)));
      const amostra = selecionados.slice(0, 5).map((item) => item.nome).join(', ');
      const complemento = selecionados.length > 5 ? ` e mais ${selecionados.length - 5}` : '';
      const confirmar = window.confirm(
        `Enviar esta observação${prioridade} para ${alunoIds.length} alunos da turma ${turma}?\n\n${amostra}${complemento}\n\nSerá criado um registro individual na ficha de cada aluno.`
      );
      if (!confirmar) return;

      definirCarregando(true);
      status(`Enviando para ${alunoIds.length} alunos...`);
      try {
        const payload = await api('/api/observacoes-professores/lote', {
          method: 'POST',
          body: JSON.stringify({ ...dadosComuns, alunoIds }),
        });
        limparFormularioDepoisDoEnvio();
        status(payload.mensagem || `Observação enviada para ${alunoIds.length} alunos.`, 'success');
        await carregarHistorico();
      } catch (erro) {
        status(erro.message, 'error');
      } finally {
        definirCarregando(false);
      }
      return;
    }

    const alunoId = $('opAluno').value;
    const aluno = estado.alunos.find((item) => String(item._id) === String(alunoId));
    if (!alunoId || !aluno) {
      status('Selecione o aluno antes de enviar.', 'error');
      $('opAluno').focus();
      return;
    }

    const confirmar = window.confirm(
      `Enviar esta observação${prioridade} para a ficha de ${aluno.nome} e para a coordenação?`
    );
    if (!confirmar) return;

    definirCarregando(true);
    status('Enviando observação...');
    try {
      await api('/api/observacoes-professores', {
        method: 'POST',
        body: JSON.stringify({ ...dadosComuns, alunoId }),
      });
      limparFormularioDepoisDoEnvio();
      status(`Observação de ${aluno.nome} enviada à coordenação.`, 'success');
      await carregarHistorico();
    } catch (erro) {
      status(erro.message, 'error');
    } finally {
      definirCarregando(false);
    }
  }

  function vincularEventos() {
    $('opTurma').addEventListener('change', () => {
      estado.alunosSelecionados.clear();
      filtrarAlunos();
    });
    $('opBuscaAluno').addEventListener('input', filtrarAlunos);
    $('opTexto').addEventListener('input', atualizarContador);
    $('opMic').addEventListener('click', alternarMicrofone);
    $('opForm').addEventListener('submit', enviar);
    $('opModoRegistro').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-mode]');
      if (botao) definirModoRegistro(botao.dataset.mode);
    });
    $('opListaAlunosLote').addEventListener('change', (evento) => {
      const checkbox = evento.target.closest('input[type=\"checkbox\"]');
      if (checkbox) alternarAlunoLote(checkbox.value, checkbox.checked);
    });
    $('opSelecionarTodos').addEventListener('click', selecionarAlunosExibidos);
    $('opLimparSelecao').addEventListener('click', limparSelecaoLote);

    $('opCategorias').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-category]');
      if (!botao) return;
      estado.categoria = botao.dataset.category;
      selecionarChip('opCategorias', 'data-category', estado.categoria);
    });

    $('opPrioridades').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-priority]');
      if (!botao) return;
      estado.prioridade = botao.dataset.priority;
      selecionarChip('opPrioridades', 'data-priority', estado.prioridade);
    });

    $('opAtalhos').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-text]');
      if (botao) adicionarAtalho(botao);
    });

    $('opHistorico').addEventListener('click', (evento) => {
      const editar = evento.target.closest('[data-edit]');
      const excluir = evento.target.closest('[data-delete]');
      const editarLoteBotao = evento.target.closest('[data-edit-lote]');
      const excluirLoteBotao = evento.target.closest('[data-delete-lote]');
      if (editar) editarObservacao(editar.dataset.edit);
      if (excluir) retirarObservacao(excluir.dataset.delete);
      if (editarLoteBotao) editarLote(editarLoteBotao.dataset.editLote);
      if (excluirLoteBotao) retirarLote(excluirLoteBotao.dataset.deleteLote);
    });

    window.addEventListener('beforeunload', () => {
      if (estado.gravador?.state === 'recording') estado.gravador.stop();
      encerrarStream();
      pararTimer();
      liberarAudioAnterior();
    });
  }

  async function iniciar() {
    garantirAcoesAudio();
    vincularEventos();
    atualizarContador();
    const sessaoOk = await carregarSessao();
    if (!sessaoOk) return;

    try {
      await Promise.all([carregarAlunos(), carregarHistorico()]);
      definirModoRegistro('individual');
      status('Selecione um aluno ou use o modo Vários alunos.', '');
    } catch (erro) {
      status(erro.message, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
