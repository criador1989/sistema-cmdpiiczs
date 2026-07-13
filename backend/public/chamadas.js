(function () {
  let chamadaAtual = null;

  const turmaEl = document.getElementById('turma');
  const listaEl = document.getElementById('lista');
  const statusEl = document.getElementById('status');
  const dataExibicaoEl = document.getElementById('dataExibicao');
  const emailDestinoEl = document.getElementById('emailDestino');
  const whatsappDestinoEl = document.getElementById('whatsappDestino');

  const statTotalEl = document.getElementById('statTotal');
  const statPresentesEl = document.getElementById('statPresentes');
  const statFaltasEl = document.getElementById('statFaltas');
  const statJustificadasEl = document.getElementById('statJustificadas');

  const btnAbrir = document.getElementById('btnAbrir');
  const btnSalvar = document.getElementById('btnSalvar');
  const btnFechar = document.getElementById('btnFechar');
  const btnEnviar = document.getElementById('btnEnviar');
  const btnSalvarConfig = document.getElementById('btnSalvarConfig');
  const btnHistorico = document.getElementById('btnHistorico');
  const btnHistoricoTopo = document.getElementById('btnHistoricoTopo');

  function getTenantFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    return (qs.get('t') || qs.get('tenant') || '').trim();
  }

  function withTenant(url) {
    const tenant = getTenantFromUrl();
    if (!tenant) return url;

    try {
      const isAbsolute = /^https?:\/\//i.test(url);
      const u = isAbsolute ? new URL(url) : new URL(url, window.location.origin);
      if (!u.searchParams.get('t')) u.searchParams.set('t', tenant);
      return isAbsolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
    } catch {
      const sep = String(url).includes('?') ? '&' : '?';
      return `${url}${sep}t=${encodeURIComponent(tenant)}`;
    }
  }

  function hojePtBr() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'AL';
    return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
  }

  function atualizarResumo() {
    const alunos = Array.isArray(chamadaAtual?.alunos) ? chamadaAtual.alunos : [];
    const total = alunos.length;
    const presentes = alunos.filter(a => !!a.presente).length;
    const faltas = total - presentes;
    const justificadas = alunos.filter(a => !a.presente && !!a.faltaJustificada).length;

    statTotalEl.textContent = String(total);
    statPresentesEl.textContent = String(presentes);
    statFaltasEl.textContent = String(faltas);
    statJustificadasEl.textContent = String(justificadas);
  }

  function renderVazio(msg) {
    listaEl.innerHTML = `
      <div class="empty-state">${msg || 'Nenhuma chamada aberta.'}</div>
    `;
    chamadaAtual = null;
    atualizarResumo();
  }

  function getClasseCard(aluno) {
    if (aluno?.faltaJustificada) return 'justificada';
    if (aluno?.presente) return 'presente';
    return 'falta';
  }

  function renderLista() {
    const alunos = Array.isArray(chamadaAtual?.alunos) ? chamadaAtual.alunos : [];
    if (!alunos.length) {
      renderVazio('Nenhum aluno encontrado para esta turma.');
      return;
    }

    listaEl.innerHTML = alunos.map((aluno, index) => `
      <div class="aluno-card ${getClasseCard(aluno)}">
        <div class="aluno-head">
          <div class="aluno-left">
            <div class="avatar">${iniciais(aluno.nome)}</div>
            <div class="aluno-meta">
              <div class="aluno-nome">${aluno.nome || 'Sem nome'}</div>
              <div class="aluno-sub">
                ${aluno.presente
                  ? 'Marcado como presente'
                  : (aluno.faltaJustificada ? 'Falta justificada' : 'Falta não justificada')}
              </div>
            </div>
          </div>

          <div class="aluno-actions">
            <button type="button" class="toggle-btn ${aluno.presente ? 'active-presente' : ''}" data-acao="presente" data-index="${index}">
              Presente
            </button>
            <button type="button" class="toggle-btn ${!aluno.presente ? 'active-falta' : ''}" data-acao="falta" data-index="${index}">
              Falta
            </button>
            <button type="button" class="toggle-btn ${aluno.faltaJustificada ? 'active-justificada' : ''}" data-acao="justificada" data-index="${index}">
              Justificada
            </button>
            <button type="button" class="toggle-btn ${aluno.obsAberta ? 'active-justificada' : ''}" data-acao="toggle-obs" data-index="${index}">
              Observação
            </button>
          </div>
        </div>

        ${aluno.obsAberta ? `
          <div class="obs-wrap">
            <textarea
              data-acao="observacao"
              data-index="${index}"
              placeholder="Digite a observação..."
            >${aluno.observacao || ''}</textarea>
            <div class="obs-help">Use este campo para registrar justificativa, recado ou detalhe importante.</div>
          </div>
        ` : ''}
      </div>
    `).join('');

    listaEl.querySelectorAll('button[data-acao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.index);
        const acao = btn.dataset.acao;
        const aluno = chamadaAtual?.alunos?.[index];
        if (!aluno) return;

        if (acao === 'presente') {
          aluno.presente = true;
          aluno.faltaJustificada = false;
        }

        if (acao === 'falta') {
          aluno.presente = false;
        }

        if (acao === 'justificada') {
          aluno.presente = false;
          aluno.faltaJustificada = !aluno.faltaJustificada;
        }

        if (acao === 'toggle-obs') {
          aluno.obsAberta = !aluno.obsAberta;
        }

        renderLista();
      });
    });

    listaEl.querySelectorAll('textarea[data-acao="observacao"]').forEach((textarea) => {
      textarea.addEventListener('input', () => {
        const index = Number(textarea.dataset.index);
        const aluno = chamadaAtual?.alunos?.[index];
        if (!aluno) return;
        aluno.observacao = textarea.value || '';
      });
    });

    atualizarResumo();
  }

  async function fetchJSON(url, options = {}) {
    const resp = await fetch(withTenant(url), {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const contentType = resp.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await resp.json() : null;

    if (!resp.ok) {
      throw new Error(data?.erro || data?.message || `Erro HTTP ${resp.status}`);
    }

    return data;
  }

  async function carregarTurmas() {
    try {
      setStatus('Carregando turmas...');
      const data = await fetchJSON('/api/alunos/turmas');
      const turmas = Array.isArray(data?.turmas) ? data.turmas : [];

      turmaEl.innerHTML = '<option value="">Selecione a turma</option>';

      turmas.forEach((turma) => {
        const opt = document.createElement('option');
        opt.value = turma;
        opt.textContent = turma;
        turmaEl.appendChild(opt);
      });

      setStatus(
        turmas.length
          ? 'Turmas carregadas. Selecione uma turma.'
          : 'Nenhuma turma encontrada para esta instituição.'
      );
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao carregar turmas: ${err.message}`);
    }
  }

  async function carregarConfiguracao() {
    try {
      const data = await fetchJSON('/api/chamadas/configuracao');
      emailDestinoEl.value = data?.emailDestino || '';
      whatsappDestinoEl.value = data?.whatsappDestino || '';
    } catch (err) {
      console.error('Erro ao carregar configuração de chamada:', err);
    }
  }

  async function salvarConfiguracao() {
    try {
      setStatus('Salvando configuração...');
      await fetchJSON('/api/chamadas/configuracao', {
        method: 'PUT',
        body: JSON.stringify({
          emailDestino: emailDestinoEl.value || '',
          whatsappDestino: whatsappDestinoEl.value || ''
        })
      });
      setStatus('Configuração salva com sucesso.');
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao salvar configuração: ${err.message}`);
    }
  }

  async function abrirChamada() {
    try {
      const turma = String(turmaEl.value || '').trim();
      if (!turma) {
        setStatus('Selecione uma turma.');
        return;
      }

      setStatus('Abrindo chamada...');
      const data = await fetchJSON(`/api/chamadas/turma/${encodeURIComponent(turma)}`);

      chamadaAtual = data;

      if (Array.isArray(chamadaAtual.alunos)) {
        chamadaAtual.alunos = chamadaAtual.alunos.map((aluno) => ({
          ...aluno,
          obsAberta: false
        }));
      }

      emailDestinoEl.value = data?.envio?.emailDestino || emailDestinoEl.value || '';
      whatsappDestinoEl.value = data?.envio?.whatsappDestino || whatsappDestinoEl.value || '';

      setStatus(`Chamada carregada com sucesso para a turma ${turma}.`);
      renderLista();
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao abrir chamada: ${err.message}`);
      renderVazio('Não foi possível carregar a chamada.');
    }
  }

  async function salvarChamada() {
    try {
      if (!chamadaAtual?._id) {
        setStatus('Abra uma chamada antes de salvar.');
        return;
      }

      setStatus('Salvando chamada...');

      const alunosParaSalvar = (chamadaAtual.alunos || []).map((aluno) => ({
        aluno: aluno.aluno,
        nome: aluno.nome,
        presente: !!aluno.presente,
        faltaJustificada: !!aluno.faltaJustificada,
        observacao: aluno.observacao || ''
      }));

      const data = await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaAtual._id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          alunos: alunosParaSalvar,
          emailDestino: emailDestinoEl.value || '',
          whatsappDestino: whatsappDestinoEl.value || ''
        })
      });

      chamadaAtual = data?.chamada || chamadaAtual;

      if (Array.isArray(chamadaAtual.alunos)) {
        chamadaAtual.alunos = chamadaAtual.alunos.map((aluno) => ({
          ...aluno,
          obsAberta: false
        }));
      }

      setStatus('Chamada salva com sucesso.');
      renderLista();
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao salvar chamada: ${err.message}`);
    }
  }

  async function fecharChamada() {
    try {
      if (!chamadaAtual?._id) {
        setStatus('Abra uma chamada antes de fechar.');
        return;
      }

      setStatus('Fechando chamada...');
      await salvarChamada();

      await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaAtual._id)}/fechar`, {
        method: 'POST'
      });

      chamadaAtual = null;

      if (turmaEl) turmaEl.value = '';

      renderVazio(
        'Chamada fechada com sucesso. Selecione uma turma e clique em Abrir chamada para iniciar uma nova chamada.'
      );

      setStatus('Chamada fechada com sucesso.');
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao fechar chamada: ${err.message}`);
    }
  }

  async function enviarChamada() {
    try {
      if (!chamadaAtual?._id) {
        setStatus('Abra uma chamada antes de enviar.');
        return;
      }

      await salvarChamada();
      setStatus('Enviando chamada por e-mail...');

      await fetchJSON(`/api/chamadas/${encodeURIComponent(chamadaAtual._id)}/enviar`, {
        method: 'POST',
        body: JSON.stringify({
          emailDestino: emailDestinoEl.value || ''
        })
      });

      setStatus('Chamada enviada por e-mail com sucesso.');
    } catch (err) {
      console.error(err);
      setStatus(`Erro ao enviar chamada: ${err.message}`);
    }
  }

  function irHistorico() {
    window.location.href = withTenant('/historico-chamadas.html');
  }

  function init() {
    dataExibicaoEl.value = hojePtBr();

    btnAbrir.addEventListener('click', abrirChamada);
    btnSalvar.addEventListener('click', salvarChamada);
    btnFechar.addEventListener('click', fecharChamada);
    btnEnviar.addEventListener('click', enviarChamada);
    btnSalvarConfig.addEventListener('click', salvarConfiguracao);
    btnHistorico.addEventListener('click', irHistorico);
    btnHistoricoTopo.addEventListener('click', irHistorico);
    btnVoltarPainel = document.getElementById('btnVoltarPainel');

if (btnVoltarPainel) {
  btnVoltarPainel.addEventListener('click', () => {
    window.location.href = withTenant('/painel.html');
  });
}

    atualizarResumo();
    carregarTurmas();
    carregarConfiguracao();
  }

  document.addEventListener('DOMContentLoaded', init);
})();